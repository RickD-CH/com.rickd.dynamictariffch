'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EmsRunner } = require('../lib/ems/EmsRunner');
const { ShadowLog } = require('../lib/ems/ShadowLog');
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
    chargerPhases: 3, chargeNow: false, andi: { mode: 'idle', reason: '' },
  };
  const calls = { charger: [], consumer: [] };
  const state = { consumers: new Map(), i: { ...base, ...inputs } };
  const fakeInputs = {
    battery: async () => ({ soc: state.i.batterySoc, capacityKwh: 13.8, error: null }),
    andiBatteryPlan: async () => ({ mode: 'hold', reason: '' }),
    chargerInputs: async () => state.i,
    consumerStates: async (ids) => new Map(ids.map((id) => [id, state.consumers.get(id) || { actualOn: false, powerW: 0, available: true }])),
  };
  const actuators = {
    charger: async (id, cmd, o) => { calls.charger.push({ id, cmd, live: o.live }); return { cmd: cmd.type, live: o.live }; },
    consumer: async (id, on, o) => { calls.consumer.push({ id, on, live: o.live }); return { cmd: on ? 'on' : 'off', live: o.live }; },
  };
  const config = normalizeConfig({
    enabled: true,
    devices: { meter: { id: 'meter1' }, inverter: { id: 'inv1' }, ...(cfg.devices || {}) },
    battery: { deviceId: 'bat1', ...(cfg.battery || {}) },
    ...cfg,
    charger: { id: 'chg1', ...(cfg.charger || {}) },
  });
  const runner = new EmsRunner({
    getConfig: () => config, prices, pv, inputs: fakeInputs, actuators,
    shadowLog: new ShadowLog(makeStore()), chargerLog: new ShadowLog(makeStore(), 'Europe/Zurich', 'charger'),
    store: makeStore(),
  });
  return { runner, calls, state };
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

test('Wallbox live: Warnung, wenn Andis EMS die Wallbox auch steuert', async () => {
  const { runner, state } = setup({ cfg: { charger: { live: true } } });
  state.i.andi = { mode: 'solar_ev', reason: '' };
  await runner.tickCharger(at(12));
  assert.match(runner.chargerCurrent.warning, /Andis EMS/);
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
  runner.getConfig = () => normalizeConfig({ enabled: true, consumers: [consumer()] });
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
  assert.equal(c.devices.andiEms, '');
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
