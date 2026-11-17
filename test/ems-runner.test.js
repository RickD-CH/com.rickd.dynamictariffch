'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EmsRunner } = require('../lib/ems/EmsRunner');
const { ShadowLog } = require('../lib/ems/ShadowLog');
const { PlanLog } = require('../lib/ems/PlanLog');
const { PriceFeed } = require('../lib/ems/PriceFeed');
const { PvFeed } = require('../lib/ems/PvFeed');
const { normalizeConfig, applyToggle } = require('../lib/ems/Config');
const { fromLocal } = require('../lib/time');

const Q = 15 * 60 * 1000;
const day0 = fromLocal(2026, 11, 10, 0, 0).getTime();
const at = (h, m = 0) => day0 + (h * 60 + m) * 60 * 1000;

/** Preisspeicher-Attrappe wie PriceStore: range() und value(). */
function fakeStore() {
  const slots = [];
  for (let i = 0; i < 192; i += 1) {
    const h = (i % 96) / 4;
    const chf = h >= 2 && h < 6 ? 0.15 : (h >= 17 && h < 21 ? 0.40 : 0.25);
    slots.push({ start: new Date(day0 + i * Q), end: new Date(day0 + (i + 1) * Q), integrated: chf });
  }
  return {
    range: (from, to) => slots.filter((s) => s.start >= from && s.start < to),
    value: (s) => s.integrated,
  };
}

function makeStore() {
  const m = new Map();
  return { get: (k) => m.get(k), set: (k, v) => m.set(k, JSON.parse(JSON.stringify(v))) };
}

function setup({ cfg = {}, inputs = {}, pvSum = 3 } = {}) {
  const prices = new PriceFeed(() => ({ priceStore: fakeStore() }));
  const pv = new PvFeed(null, () => {}, {
    get: async () => ({ slots: [{ end: at(23), kw: pvSum * 2, h: 0.5 }], stale: false, factor: 0.75 }),
  });
  const base = {
    gridW: -5000, houseW: 1500, pvW: 6500, batterySoc: 99, batteryW: 0, batteryCapacityKwh: 13.8,
    chargerRead: true, chargerConnected: true, chargerState: 'plugged_in_charging', chargerPowerW: 0,
    chargerPhases: 3, chargeNow: false, other: { mode: 'idle', reason: '' },
  };
  const calls = { charger: [], consumer: [] };
  const state = { consumers: new Map(), i: { ...base, ...inputs } };
  const fakeInputs = {
    battery: async () => ({ soc: state.i.batterySoc, capacityKwh: 13.8, error: null }),
    compareBatteryPlan: async () => ({ mode: 'hold', reason: '' }),
    chargerInputs: async () => state.i,
    consumerStates: async (ids) => new Map(ids.map((id) => [id, state.consumers.get(id) || { actualOn: false, powerW: 0, available: true }])),
  };
  const actuators = {
    charger: async (id, cmd, o) => { calls.charger.push({ id, cmd, live: o.live }); return { cmd: cmd.type, live: o.live }; },
    consumer: async (id, on, o) => { calls.consumer.push({ id, on, live: o.live }); return { cmd: on ? 'on' : 'off', live: o.live }; },
  };
  const config = normalizeConfig({
    enabled: true, silent: false,
    devices: { meter: { id: 'meter1' }, inverter: { id: 'inv1' }, ...(cfg.devices || {}) },
    battery: { deviceId: 'bat1', ...(cfg.battery || {}) },
    ...cfg,
    charger: { id: 'chg1', ...(cfg.charger || {}) },
  });
  const planLog = new PlanLog(makeStore());
  const runner = new EmsRunner({
    planLog, getConfig: () => config, prices, pv, inputs: fakeInputs, actuators,
    shadowLog: new ShadowLog(makeStore()), chargerLog: new ShadowLog(makeStore(), 'Europe/Zurich', 'charger'),
    store: makeStore(),
  });
  return { runner, calls, state, planLog };
}

test('PriceFeed: Preise aus dem Preisspeicher in Rp./kWh, Viertelstunden', async () => {
  const feed = new PriceFeed(() => ({ priceStore: fakeStore() }));
  const slots = await feed.refresh(at(1));
  assert.ok(slots.length > 150);
  const night = slots.find((s) => s.start === at(3));
  assert.equal(night.price, 15);
  assert.equal(night.end - night.start, Q);
  assert.equal(feed.isStale(at(10)), false);
  assert.equal(feed.isStale(at(10) + 100 * 3600 * 1000), true);
  const none = new PriceFeed(() => null);
  await none.refresh(at(10));
  assert.match(none.error, /Kein Preis-Gerät/);
});

test('Wallbox im Trockenlauf: berechnet, sendet nichts', async () => {
  const { runner, calls } = setup({ cfg: { charger: { live: false } } });
  const t = at(12);
  await runner.tickCharger(t);
  await runner.tickCharger(t + 31_000);
  assert.deepEqual(calls.charger, []);
  assert.equal(runner.chargerCurrent.live, false);
});

test('Wallbox live: erster Lauf nur beobachten, danach Befehle senden', async () => {
  const { runner, calls, state } = setup({ cfg: { charger: { live: true } } });
  const t = at(12);
  state.i.gridW = -5000; state.i.pvW = 6500; state.i.houseW = 1500;
  await runner.tickCharger(t);
  assert.deepEqual(calls.charger, [], 'Warmlauf sendet nichts');
  state.i = { ...state.i }; // neuer Messwert
  await runner.tickCharger(t + 20_000);
  await runner.tickCharger(t + 55_000);
  assert.ok(calls.charger.length >= 2, 'Start und Leistung wurden gesendet');
  assert.equal(calls.charger[0].cmd.type, 'start');
  assert.equal(calls.charger[1].cmd.type, 'set');
  assert.equal(calls.charger.every((c) => c.live === true), true);
  assert.equal(runner.chargerCurrent.executed.length >= 1, true);
});

test('Wallbox live: fehlender Netzzähler sendet nichts', async () => {
  const { runner, calls, state } = setup({ cfg: { charger: { live: true } } });
  state.i.gridW = null;
  await runner.tickCharger(at(12));
  await runner.tickCharger(at(12) + 60_000);
  assert.deepEqual(calls.charger, []);
  assert.equal(runner.chargerCurrent.mine.mode, 'error');
});

test('Wallbox live: Warnung, wenn ein anderes Energiemanagement die Wallbox auch steuert', async () => {
  const { runner, state } = setup({ cfg: { charger: { live: true } } });
  state.i.other = { mode: 'solar_ev', reason: '' };
  await runner.tickCharger(at(12));
  assert.match(runner.chargerCurrent.warning, /anderes Energiemanagement/);
  assert.doesNotMatch(runner.chargerCurrent.warning, /Huawei/i);
});

test('Eigenes Sofortladen: live zählt nur der eigene Schalter', async () => {
  const { runner, calls, state } = setup({ cfg: { charger: { live: true, chargeNow: true } } });
  state.i.gridW = 500; state.i.pvW = 0; state.i.houseW = 500;
  await runner.tickCharger(at(22));
  await runner.tickCharger(at(22) + 20_000);
  const set = calls.charger.find((c) => c.cmd.type === 'set');
  assert.ok(set && set.cmd.amps === 16);
  assert.equal(runner.chargerCurrent.mine.mode, 'instant_ev');
});

test('Verbraucher im Trockenlauf: protokolliert, schaltet nicht', async () => {
  const consumer = { id: 'dev1', name: 'Luftentfeuchter', mode: 'full', live: false, minRunMin: 0, minOffMin: 0 };
  const { runner, calls } = setup({ cfg: { consumers: [consumer] } });
  await runner.tickCharger(at(12));
  assert.equal(calls.consumer.length, 1);
  assert.equal(calls.consumer[0].live, false);
  assert.equal(runner.consumerEvents.length, 1);
  assert.match(runner.consumerEvents[0].reason, /SoC 99%/);
  // zweiter Lauf: kein Scheinwechsel, obwohl das echte Gerät aus bleibt
  await runner.tickCharger(at(12) + 30_000);
  assert.equal(runner.consumerEvents.length, 1);
});

test('Verbraucher live: Befehl wird gesendet, Zustand gemerkt', async () => {
  const consumer = { id: 'dev1', name: 'Luftentfeuchter', mode: 'soc', socOn: 90, live: true, minRunMin: 0, minOffMin: 0 };
  const { runner, calls, state } = setup({ cfg: { consumers: [consumer] } });
  await runner.tickCharger(at(12));
  assert.equal(calls.consumer.length, 1);
  assert.equal(calls.consumer[0].on, true);
  assert.equal(calls.consumer[0].live, true);
  state.consumers.set('dev1', { actualOn: true, powerW: 40, available: true });
  state.i.batterySoc = 70; // unter der Schwelle, Mindestlaufzeit 0 -> aus
  await runner.tickCharger(at(12) + 30_000);
  assert.equal(calls.consumer.at(-1).on, false);
});

test('Verbraucher: nicht erreichbares Gerät wird nicht geschaltet', async () => {
  const consumer = { id: 'dev1', name: 'X', mode: 'full', live: true };
  const { runner, calls, state } = setup({ cfg: { consumers: [consumer] } });
  state.consumers.set('dev1', { actualOn: null, powerW: null, available: false });
  await runner.tickCharger(at(12));
  assert.deepEqual(calls.consumer, []);
  assert.match(runner.consumerCurrent[0].reason, /nicht erreichbar/);
});

test('Wartezeit: 15 s mit Auto, 30 s mit Verbrauchern, sonst 5 min', async () => {
  const a = setup({ inputs: { chargerConnected: true } });
  assert.equal(await a.runner.tickCharger(at(12)), 15_000);
  const b = setup({ inputs: { chargerConnected: false }, cfg: { consumers: [{ id: 'd', name: 'X', mode: 'full' }] } });
  assert.equal(await b.runner.tickCharger(at(12)), 30_000);
  const c = setup({ inputs: { chargerConnected: false } });
  assert.equal(await c.runner.tickCharger(at(12)), 5 * 60_000);
});

test('Schalter Trockenlauf -> live setzt den simulierten Zustand zurück (keine Pause durch Scheinwechsel)', async () => {
  let live = false;
  const consumer = () => ({ id: 'dev1', name: 'X', mode: 'soc', socOn: 90, live, minRunMin: 0, minOffMin: 30 });
  const { runner, calls, state } = setup({ cfg: { consumers: [consumer()] } });
  // Trockenlauf: Scheinstart
  await runner.tickCharger(at(12));
  assert.equal(calls.consumer.length, 1);
  assert.equal(calls.consumer[0].live, false);
  // auf live schalten: Gerät ist in Wirklichkeit aus -> es darf ohne 30 min Pause echt starten
  live = true;
  runner.getConfig = () => normalizeConfig({ enabled: true, silent: false, battery: { deviceId: 'bat1' }, consumers: [consumer()] });
  state.consumers.set('dev1', { actualOn: false, powerW: 0, available: true });
  await runner.tickCharger(at(12) + 40_000);
  assert.equal(calls.consumer.length, 2);
  assert.equal(calls.consumer[1].live, true);
  assert.equal(calls.consumer[1].on, true);
});

test('Geräte nicht gewählt: Wallbox sendet nichts und sagt warum', async () => {
  const { runner, calls } = setup({ cfg: { charger: { live: true, id: '' } } });
  await runner.tickCharger(at(12));
  await runner.tickCharger(at(12) + 60_000);
  assert.deepEqual(calls.charger, []);
  assert.match(runner.chargerCurrent.mine.reason, /noch nicht gewählt/);
});

test('Konfiguration enthält keine Geräte-IDs als Vorgabe', () => {
  const c = normalizeConfig(null);
  assert.equal(c.devices.meter.id, '');
  assert.equal(c.charger.id, '');
  assert.equal(c.battery.deviceId, '');
  assert.equal(c.devices.compareEms, '');
});

test('Konfiguration: EMS standardmässig aus, Live-Schalter aus', () => {
  const c = normalizeConfig(null);
  assert.equal(c.enabled, false);
  assert.equal(c.charger.live, false);
  assert.equal(c.charger.chargeNow, false);
  assert.deepEqual(c.consumers, []);
  const withBad = normalizeConfig({ consumers: [{ name: 'ohne Gerät' }, { id: 'a', mode: 'quatsch', socOn: 500 }] });
  assert.equal(withBad.consumers.length, 1);
  assert.equal(withBad.consumers[0].mode, 'full');
  assert.equal(withBad.consumers[0].socOn, 100);
  assert.equal(withBad.consumers[0].live, false);
});

test('applyToggle: nur der gewählte Bereich ändert sich, unbekanntes Ziel wird abgelehnt', () => {
  const base = normalizeConfig({ enabled: true, consumers: [{ id: 'a', name: 'A', socOn: 70, mode: 'soc' }, { id: 'b', name: 'B' }] });
  const c1 = applyToggle(base, 'charger', true);
  assert.equal(c1.charger.live, true);
  assert.equal(c1.consumers.every((c) => c.live === false), true);
  const c2 = applyToggle(c1, 'b', true);
  assert.deepEqual(c2.consumers.map((c) => c.live), [false, true]);
  assert.equal(c2.consumers[0].socOn, 70);
  assert.equal(c2.charger.live, true);
  assert.equal(applyToggle(base, 'unbekannt', true), null);
  assert.equal(applyToggle(c2, 'charger', false).charger.live, false);
});

test('Konfiguration: Feuchte-Notlauf wird geprüft (aus unter ein, Sensor nötig)', () => {
  const mk = (h) => normalizeConfig({ consumers: [{ id: 'a', type: 'dehumidifier', humidity: h }] }).consumers[0];
  assert.equal(mk({ enabled: true }).humidity.enabled, false, 'ohne Sensor kein Notlauf');
  const ok = mk({ enabled: true, sensorId: 's', onAbove: 70, offBelow: 80, runMin: 0 });
  assert.equal(ok.humidity.enabled, true);
  assert.equal(ok.humidity.onAbove, 70);
  assert.equal(ok.humidity.offBelow, 66, 'aus muss unter ein liegen');
  assert.equal(ok.humidity.runMin, 1);
  assert.equal(ok.type, 'dehumidifier');
  assert.equal(mk(undefined).humidity.onAbove, 65);
  assert.equal(normalizeConfig({ consumers: [{ id: 'a', type: 'quatsch' }] }).consumers[0].type, 'generic');
});

test('Notlauf im Runner: liest den Feuchte-Sensor und schaltet den Entfeuchter', async () => {
  const consumer = {
    id: 'dev1', name: 'Entfeuchter', mode: 'full', live: true, type: 'dehumidifier', minOffMin: 0,
    humidity: { enabled: true, sensorId: 'sens1', capability: 'measure_humidity', onAbove: 65, offBelow: 61, runMin: 60 },
  };
  const { runner, calls, state } = setup({ cfg: { consumers: [consumer] }, inputs: { batterySoc: 40 } });
  state.consumers.set('sens1', { actualOn: null, powerW: null, available: true, values: { measure_humidity: 62 } });
  await runner.tickCharger(at(12));
  assert.deepEqual(calls.consumer, [], 'unter 65 % kein Notlauf');
  state.consumers.set('sens1', { actualOn: null, powerW: null, available: true, values: { measure_humidity: 67 } });
  await runner.tickCharger(at(12) + 30_000);
  assert.equal(calls.consumer.length, 1);
  assert.equal(calls.consumer[0].on, true);
  assert.equal(calls.consumer[0].live, true);
  assert.match(runner.consumerEvents.at(-1).reason, /Feuchte-Notlauf/);
  // Sensor fällt aus: der Notlauf läuft bis zur Höchstdauer weiter, Gerät wird nicht ausgeschaltet
  state.consumers.set('sens1', { actualOn: null, powerW: null, available: false, values: {} });
  state.consumers.set('dev1', { actualOn: true, powerW: 600, available: true, values: {} });
  await runner.tickCharger(at(12) + 90_000);
  assert.equal(calls.consumer.length, 1);
});

test('Ohne Hausbatterie: Wallbox lädt nach Überschuss, kein Hartstopp, Batterie-Lauf übersprungen', async () => {
  const { runner, calls, state } = setup({
    cfg: { charger: { live: true }, battery: { deviceId: '' } },
    inputs: { batterySoc: null, batteryW: null, batteryCapacityKwh: null, gridW: -5000, pvW: 6500, houseW: 1500 },
  });
  const t = at(12);
  await runner.tickCharger(t);
  await runner.tickCharger(t + 20_000);
  await runner.tickCharger(t + 55_000);
  assert.ok(calls.charger.length >= 2, 'ohne Batterie wird trotzdem geladen: ' + JSON.stringify(runner.chargerCurrent.mine));
  assert.notEqual(runner.chargerCurrent.mine.mode, 'battery_priority');
  assert.equal(await runner.tick(t), null, 'kein Batterie-Plan ohne Batterie');
  assert.equal(runner.current, null);
  assert.equal(state.i.batterySoc, null);
});

test('Ohne Hausbatterie: Verbraucher nach Überschuss läuft, Modus nach Batterie wird erklärt', async () => {
  const surplus = { id: 'dev1', name: 'A', mode: 'surplus', live: true, minSurplusW: 300, startSustainS: 0, minOffMin: 0 };
  const bySoc = { id: 'dev2', name: 'B', mode: 'full', live: true, minOffMin: 0 };
  const { runner, calls, state } = setup({
    cfg: { battery: { deviceId: '' }, consumers: [surplus, bySoc] },
    inputs: { batterySoc: null, batteryW: null, gridW: -1500, pvW: 3000, houseW: 1500, chargerConnected: false },
  });
  await runner.tickCharger(at(12));
  assert.deepEqual(calls.consumer.map((c) => [c.id, c.on]), [['dev1', true]], 'nur der Überschuss-Verbraucher startet');
  const b = runner.consumerCurrent.find((c) => c.id === 'dev2');
  assert.match(b.reason, /Keine Hausbatterie/);
});

test('Plan-Verlauf: Batterie-Lauf und Wallbox-/Verbraucher-Lauf schreiben je Viertelstunde einen Eintrag', async () => {
  const { runner, planLog } = setup({ cfg: { consumers: [{ id: 'dry', name: 'Entfeuchter', mode: 'surplus' }] } });
  await runner.tick(at(10, 1));
  await runner.tickCharger(at(10, 2));
  await runner.tickCharger(at(10, 3));
  assert.equal(planLog.entries.length, 1);
  const e = planLog.entries[0];
  assert.equal(e.t, at(10));
  assert.ok(e.b, 'Batterie-Modus gespeichert');
  assert.ok(e.c, 'Wallbox-Modus gespeichert');
  assert.ok('dry' in (e.k || {}), 'Verbraucher gespeichert');
  await runner.tickCharger(at(10, 16));
  assert.equal(planLog.entries.length, 2);
});

test('Plan-Verlauf: ohne planLog läuft alles wie vorher', async () => {
  const { runner } = setup();
  runner.planLog = null;
  await runner.tick(at(10, 1));
  await runner.tickCharger(at(10, 2));
  assert.ok(runner.current);
});

test('Runner._humidityBlock: günstigster Block der Notlaufdauer im Rest des Tages; ohne Option, ohne Bedarf oder ohne Preise null', () => {
  const { EmsRunner } = require('../lib/ems/EmsRunner');
  const { fromLocal, localParts } = require('../lib/time');
  const TZ = 'Europe/Zurich';
  const now = fromLocal(2026, 11, 14, 12, 7).getTime();
  const slots = [];
  for (let t = Math.floor(now / 900000) * 900000; t < fromLocal(2026, 11, 15, 0, 0).getTime(); t += 900000) {
    const h = localParts(new Date(t), TZ).hour;
    slots.push({ start: t, end: t + 900000, price: h === 14 ? 8 : 25 });
  }
  const self = { prices: { range: () => slots }, tz: TZ };
  const c = { humidity: { enabled: true, waitForCheap: true, onAbove: 65, runMin: 60 } };
  const b = EmsRunner.prototype._humidityBlock.call(self, c, {}, 68, now);
  assert.equal(b.start, fromLocal(2026, 11, 14, 14, 0).getTime());
  assert.equal(b.label, '14:00-15:00 (Ø 8.0 Rp.)');
  assert.equal(EmsRunner.prototype._humidityBlock.call(self, { humidity: { ...c.humidity, waitForCheap: false } }, {}, 68, now), null, 'ohne Option');
  assert.equal(EmsRunner.prototype._humidityBlock.call(self, c, {}, 60, now), null, 'Feuchte unter der Schwelle: kein Bedarf');
  assert.equal(EmsRunner.prototype._humidityBlock.call(self, c, { forceUntil: now + 1000 }, 68, now), null, 'Notlauf läuft schon');
  assert.equal(EmsRunner.prototype._humidityBlock.call({ prices: { range: () => [] }, tz: TZ }, c, {}, 68, now), null, 'ohne Preise');
});

test('Runner: Akku-Verbraucher zeigt beim Laden «Sicherheits-Stopp um HH:MM» und merkt sich einen Sicherheits-Stopp bis zur Freigabe', async () => {
  const consumer = {
    id: 'dev1', name: 'eBike', mode: 'surplus', live: true, minRunMin: 0, minOffMin: 0, startSustainS: 0, batteryFirstSoc: 0,
    accu: { enabled: true, sensorId: 'bike', capability: 'measure_battery', stopAt: 80, resumeBelow: 75, chargeBelow: 20, maxRunMin: 60 },
  };
  const { runner, state } = setup({ cfg: { consumers: [consumer] } });
  const bike = (v) => state.consumers.set('bike', {
    actualOn: null, powerW: null, available: true, values: { measure_battery: v }, raw: { measure_battery: v },
  });
  bike(40);
  await runner.tickCharger(at(12));
  await runner.tickCharger(at(12) + 300_000); // startet
  state.consumers.set('dev1', { actualOn: true, powerW: 60, available: true }); // das Gerät folgt dem Befehl
  await runner.tickCharger(at(12) + 360_000); // ab dem nächsten Lauf läuft die Höchstdauer
  const on = runner.consumerCurrent.find((c) => c.id === 'dev1');
  assert.equal(on.isOn, true);
  assert.match(on.reason, /Sicherheits-Stopp um 1[23]:\d\d/, 'Frist wird angezeigt');
  assert.equal(runner.safetyStops.size, 0);
  const during = runner._load('consumerStates', {}).dev1;
  assert.ok(Number.isFinite(during.accuOnSince), 'Ladebeginn gespeichert: die Höchstdauer läuft nach einem Neustart weiter');
  assert.equal(during.accuStartV, 40);
  await runner.tickCharger(at(13) + 600_000);
  state.consumers.set('dev1', { actualOn: false, powerW: 0, available: true });
  const stopped = runner.consumerCurrent.find((c) => c.id === 'dev1');
  assert.equal(stopped.isOn, false);
  assert.match(stopped.reason, /Sicherheit: 60 min am Stück geladen/);
  assert.equal(runner.safetyStops.get('dev1'), 'eBike: Sicherheit: 60 min am Stück geladen, Ladestand unverändert 40 % (Sensor/Bridge prüfen)', 'Meldung gemerkt (für den Fehler-Auslöser)');
  await runner.tickCharger(at(13) + 900_000);
  assert.equal(runner.safetyStops.size, 1, 'bleibt gemerkt, solange die Sperre gilt');
  // Neustart der App: Sperre, eingefrorener Ladestand und Ladebeginn werden aus dem Speicher wiederhergestellt
  const saved = runner._load('consumerStates', {}).dev1;
  assert.equal(saved.accuFull, true);
  assert.equal(saved.accuStale.v, 40);
  const second = Object.create(EmsRunner.prototype);
  second.consumerStates = new Map();
  second._load = (k, fb) => runner._load(k, fb);
  second._loadConsumerStates();
  const restored = second.consumerStates.get('dev1');
  assert.equal(restored.accuFull, true, 'Sperre bleibt nach dem Neustart');
  assert.deepEqual(restored.accuStale, saved.accuStale);
  assert.equal(restored.accuLockedAt, saved.accuLockedAt);
  assert.equal(restored.accuStartV, 40);
  assert.equal(second.consumerStates.get('dev1').isOn, false);
  bike(70); // unter «frei unter» 75 %: Sperre vorbei
  await runner.tickCharger(at(14));
  assert.equal(runner.safetyStops.size, 0, 'nach der Freigabe wieder leer');
});

test('Franken-Auswertung im Runner: eigenes Szenario (virtuelle Batterie) und Eichung gegen den Zähler laufen mit, ohne die Steuerung zu ändern', async () => {
  const { runner, calls } = setup({ cfg: { compare: true } });
  runner.ledger.flush = () => {};
  for (let k = 0; k < 6; k += 1) {
    await runner.tickCharger(at(10, 1 + k * 4));
    await runner.tick(at(10, 2 + k * 4));
  }
  const s = runner.ledger.summary();
  assert.ok(s.today, 'der Tag läuft');
  assert.ok(s.today.v && Number.isFinite(s.today.v.mine), 'eigenes Szenario gerechnet');
  assert.ok(s.today.cal && s.today.cal.hours > 0, 'Eichung misst');
  assert.equal(s.today.cal.realExpKwh > 0, true, 'der Zähler exportierte (gridW = -5000)');
  assert.deepEqual(calls.consumer, [], 'die Auswertung schaltet nichts');
  assert.ok(runner.prevV && runner.prevV.mode, 'der Planer des Szenarios hat einen eigenen Zustand');
});

test('Franken-Auswertung im Runner: das andere EMS zählt mit dem, was die echte Batterie tut (nicht mit dem Plan-Entscheid)', async () => {
  const { runner } = setup({ cfg: { compare: true }, inputs: { batteryW: 5100, pvW: 0, houseW: 800, gridW: 5900 } });
  runner.ledger.flush = () => {};
  const seen = [];
  const orig = runner.ledger.step.bind(runner.ledger);
  runner.ledger.step = (x) => { seen.push(x.other); orig(x); };
  await runner.tickCharger(at(2, 1));
  await runner.tick(at(2, 2));
  assert.deepEqual(seen, ['charge'], 'Plan sagt «hold», die Batterie lädt mit 5 kW aus dem Netz');
});

test('Plan-Schnappschuss: Preise, PV und Last der nächsten 36 Stunden werden festgehalten und bleiben auf vier begrenzt', () => {
  const { runner } = setup({ cfg: { compare: true } });
  const slots = [];
  for (let i = 0; i < 200; i += 1) slots.push({ start: at(0, 0) + i * 900000, end: at(0, 0) + (i + 1) * 900000, price: 20 + (i % 7) });
  const dv = { mode: 'charge', reason: 'test', targetEff: 90, chargeSlots: [slots[3]], schedule: { chargeKwh: 5 } };
  for (let k = 0; k < 6; k += 1) {
    runner._snapPlan({
      nowMs: at(0, 0) + k * 900000, soc: 50, dv, cfg: { capacityKwh: 13.8, targetSoc: 90, floorSoc: 10, chargePowerKw: 5, efficiency: 0.9 }, slots, price: 25, pvKwAt: () => 1.5, loadKwAt: null,
    });
  }
  assert.equal(runner.planSnaps.length, 4, 'nur die letzten vier');
  const s = runner.planSnaps[0];
  assert.equal(s.rows.length, 144, '36 Stunden in Viertelstunden');
  assert.deepEqual(s.rows[0].slice(2), [1.5, null], 'PV und (ungelernte) Last je Zeile');
  assert.deepEqual(s.charge[0], [slots[3].start, slots[3].price]);
  assert.equal(s.cfg.capacityKwh, 13.8);
  assert.equal(runner._load('ledgerPlans', []).length, 4, 'gespeichert (übersteht einen Neustart)');
});
