'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  buildCommands, makeBatteryControlState, stepBatteryControl, markSent,
} = require('../lib/ems/planner/batteryControl');
const { EmsRunner } = require('../lib/ems/EmsRunner');
const { ShadowLog } = require('../lib/ems/ShadowLog');
const { PriceFeed } = require('../lib/ems/PriceFeed');
const { PvFeed } = require('../lib/ems/PvFeed');
const { Actuators } = require('../lib/ems/Actuators');
const { normalizeConfig, applyToggle } = require('../lib/ems/Config');
const { fromLocal } = require('../lib/time');

const Q = 15 * 60 * 1000;
const day0 = fromLocal(2026, 11, 10, 0, 0).getTime();
const at = (h, m = 0) => day0 + (h * 60 + m) * 60 * 1000;

// ---------------------------------------------------------------- Vorlage und Befehle

test('buildCommands: Laden, Halten, Normal als Befehle mit Werten; Entladung bleibt gesperrt, solange das Auto lädt', () => {
  const v = { power: 5000, target_soc: 90, normal_discharge: 7000 };
  assert.deepEqual(buildCommands('charge', v), [{ id: 'battery.charge', values: { power: 5000, target_soc: 90 }, locked: false }]);
  assert.deepEqual(buildCommands('hold', v), [{ id: 'battery.hold', values: {}, locked: false }]);
  assert.deepEqual(buildCommands('normal', v), [{ id: 'battery.normal', values: { discharge: 7000 }, locked: false }]);
  const car = buildCommands('normal', v, { carCharging: true });
  assert.deepEqual(car, [{ id: 'battery.normal', values: { discharge: 0 }, locked: true }], 'Batterie speist das Auto nicht: Entladegrenze 0');
  assert.deepEqual(buildCommands('quatsch', v), []);
  assert.equal(buildCommands('charge', { power: 4999.6, target_soc: 89.6 })[0].values.power, 5000, 'gerundet');
});

test('stepBatteryControl: erst beobachten, dann bei Wechsel senden, Laden/Halten wiederholen, Freigabe nachholen', () => {
  const st = makeBatteryControlState();
  assert.equal(stepBatteryControl({ st, mode: 'hold', nowMs: at(1), live: false }).send, false, 'erster Lauf beobachtet nur');
  assert.equal(stepBatteryControl({ st, mode: 'hold', nowMs: at(1, 5), live: false }).send, true, 'danach Start');
  markSent(st, 'hold', at(1, 5), buildCommands('hold', {}));
  assert.equal(stepBatteryControl({ st, mode: 'hold', nowMs: at(1, 10), live: false }).send, false, 'gleicher Modus, noch keine Wiederholung');
  const rep = stepBatteryControl({ st, mode: 'hold', nowMs: at(1, 15), repeatMs: 10 * 60000, live: false });
  assert.equal(rep.send, true);
  assert.equal(rep.reason, 'Wiederholung');
  markSent(st, 'hold', at(1, 15), []);
  assert.match(stepBatteryControl({ st, mode: 'charge', nowMs: at(1, 16), live: false }).reason, /Wechsel hold -> charge/);
  // Normal, während das Auto lädt: Freigabe fehlt, wird nachgeholt
  markSent(st, 'normal', at(2), buildCommands('normal', { normal_discharge: 7000 }, { carCharging: true }));
  assert.equal(st.pendingRestore, true);
  assert.equal(stepBatteryControl({ st, mode: 'normal', nowMs: at(2, 5), carCharging: true, live: false }).send, false);
  assert.equal(stepBatteryControl({ st, mode: 'normal', nowMs: at(2, 10), carCharging: false, live: false }).send, true);
  markSent(st, 'normal', at(2, 10), buildCommands('normal', { normal_discharge: 7000 }));
  assert.equal(st.pendingRestore, false);
  assert.equal(stepBatteryControl({ st, mode: 'normal', nowMs: at(5), live: false }).send, false, 'Normal wird nicht wiederholt');
  // Umschalten auf live: wieder zuerst beobachten
  assert.equal(stepBatteryControl({ st, mode: 'normal', nowMs: at(6), live: true }).send, false);
  assert.equal(stepBatteryControl({ st, mode: 'normal', nowMs: at(6, 5), live: true }).send, true);
});

// ---------------------------------------------------------------- Konfiguration

test('Config: Silent-Modus standardmässig an, Batteriesteuerung standardmässig aus, Schalter "battery"', () => {
  const d = normalizeConfig({});
  assert.equal(d.silent, true);
  assert.equal(normalizeConfig({ silent: false }).silent, false);
  assert.deepEqual(JSON.parse(JSON.stringify(d.battery.control)), { enabled: false, live: false, normalDischargeW: 7000, repeatMin: 10 });
  const c = normalizeConfig({ battery: { control: { enabled: true, normalDischargeW: -5, repeatMin: 1 } } }).battery.control;
  assert.equal(c.normalDischargeW, 0);
  assert.equal(c.repeatMin, 2);
  const on = applyToggle({ battery: { deviceId: 'bat', control: { enabled: true, normalDischargeW: 6000 } } }, 'battery', true);
  assert.equal(on.battery.control.live, true);
  assert.equal(on.battery.control.normalDischargeW, 6000, 'andere Werte bleiben');
});

// ---------------------------------------------------------------- Runner

function prices() {
  const slots = [];
  for (let i = 0; i < 192; i++) {
    const h = (i % 96) / 4;
    slots.push({ start: new Date(day0 + i * Q), end: new Date(day0 + (i + 1) * Q), integrated: h < 5 ? 0.10 : (h >= 17 && h < 21 ? 0.40 : 0.25) });
  }
  return new PriceFeed(() => ({ priceStore: { range: (a, b) => slots.filter((s) => s.start >= a && s.start < b), value: (s) => s.integrated } }));
}

function setup({ silent = true, live = false, enabled = true, soc = 20, charging = 0 } = {}) {
  const sent = [];
  const mem = () => { const m = new Map(); return { get: (k) => m.get(k), set: (k, v) => m.set(k, JSON.parse(JSON.stringify(v))) }; };
  const config = normalizeConfig({
    enabled: true, silent, devices: { meter: { id: 'm' } },
    battery: { deviceId: 'bat', capacityKwh: 10, targetSoc: 90, chargePowerKw: 5, reserveHours: 6, control: { enabled, live, preset: 'luna2000' } },
  });
  const actuators = new Actuators({}, () => {});
  actuators._fire = async (id, tokens) => { sent.push([id, tokens]); };
  const runner = new EmsRunner({
    getConfig: () => config, prices: prices(), pv: new PvFeed(null, () => {}),
    inputs: { battery: async () => ({ soc, capacityKwh: 10 }), compareBatteryPlan: async () => null },
    actuators, shadowLog: new ShadowLog(mem()), store: mem(),
  });
  runner.chargerCurrent = { chargerPowerW: charging };
  return { runner, sent, config };
}

test('Runner: Silent-Modus simuliert die Batteriesteuerung nur (Protokoll ja, Karten nein)', async () => {
  const { runner, sent } = setup({ silent: true, live: true });
  await runner.tick(at(3));
  await runner.tick(at(3, 5));
  assert.deepEqual(sent, [], 'nichts an das Gerät gesendet');
  assert.equal(runner.batteryEvents.length, 1);
  assert.equal(runner.batteryEvents[0].mode, 'charge', 'nachts günstig: laden');
  assert.equal(runner.batteryEvents[0].live, false);
  assert.deepEqual(runner.batteryEvents[0].cards, ['battery.charge']);
  assert.equal(runner.batteryControl.live, false);
});

test('Runner: live (Silent aus, Batterie live) gibt den Befehl «Batterie laden» aus', async () => {
  const { runner, sent } = setup({ silent: false, live: true });
  await runner.tick(at(3));
  assert.deepEqual(sent, [], 'erster Lauf beobachtet');
  await runner.tick(at(3, 5));
  // Ziel 88 statt 90 %: der Fahrplan lädt nur so viel nach, wie die teure Zeit braucht
  assert.deepEqual(sent.map((x) => [x[0], x[1].power, x[1].target_soc]), [['battery.charge', 5000, 88]]);
  assert.equal(sent[0][1].title, 'Batterie: aus dem Netz laden');
  assert.equal(runner.batteryEvents[0].live, true);
});

test('Runner: ohne Batteriesteuerung oder Batterie nicht auf live wird nichts gesendet', async () => {
  const off = setup({ silent: false, live: true, enabled: false });
  await off.runner.tick(at(3));
  await off.runner.tick(at(3, 5));
  assert.deepEqual(off.sent, []);
  assert.equal(off.runner.batteryEvents.length, 0);
  assert.equal(off.runner.batteryControl, null);
  const test2 = setup({ silent: false, live: false });
  await test2.runner.tick(at(3));
  await test2.runner.tick(at(3, 5));
  assert.deepEqual(test2.sent, []);
  assert.equal(test2.runner.batteryEvents.length, 1, 'Testbetrieb protokolliert');
});

test('Runner: Ausschalten gibt die Batterie frei, wenn zuletzt Laden oder Halten gesendet wurde', async () => {
  const { runner, sent, config } = setup({ silent: false, live: true });
  await runner.tick(at(3));
  await runner.tick(at(3, 5));
  sent.length = 0;
  await runner.releaseBattery(config, at(3, 6));
  assert.deepEqual(sent.map((x) => [x[0], x[1].discharge]), [['battery.normal', 7000]]);
  assert.match(runner.batteryEvents[runner.batteryEvents.length - 1].reason, /freigegeben/);
  sent.length = 0;
  assert.equal(await runner.releaseBattery(config, at(3, 7)), null, 'zuletzt Normal: nichts zu tun');
  assert.deepEqual(sent, []);
});

test('Runner: ein fehlgeschlagener Befehl wird protokolliert und beim nächsten Lauf wiederholt', async () => {
  const { runner, sent } = setup({ silent: false, live: true });
  let fail = true;
  runner.actuators._fire = async (id, tokens) => { if (fail) throw new Error('Gerät antwortet nicht'); sent.push([id, tokens]); };
  await runner.tick(at(3));
  await runner.tick(at(3, 5));
  assert.match(runner.batteryEvents[0].error, /antwortet nicht/);
  fail = false;
  await runner.tick(at(3, 10));
  assert.equal(sent.length, 1, 'nochmals gesendet, weil der Wechsel nicht als gesendet gilt');
});

// ---------------------------------------------------------------- Oberfläche

test('Anzeige: Silent-Schalter speichert; Batterie-Zeile mit Live-Schalter; Protokoll zeigt Batterie-Ereignisse', async () => {
  const emsJs = fs.readFileSync(path.join(__dirname, '../settings/ems.js'), 'utf8');
  const els = new Map();
  const handlers = {};
  const el = (id) => { if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '', value: '', checked: false, hidden: false, classList: { contains: () => true, toggle() {} }, addEventListener: (t, f) => { handlers[`${id}:${t}`] = f; } }); return els.get(id); };
  const ctx = { document: { getElementById: el }, window: {}, setInterval: () => 0, console, Object, Promise, Date, Number, isFinite, String, JSON, Math };
  vm.createContext(ctx);
  vm.runInContext(emsJs, ctx);
  const config = normalizeConfig({ enabled: true, devices: { meter: { id: 'em' } }, battery: { deviceId: 'bat', control: { enabled: true, preset: 'luna2000' } } });
  const calls = [];
  const res = {
    'GET /ems/shadow': { enabled: true, deviceExists: true, shadow: true, config, pv: {}, current: null, charger: { current: null }, batteryControl: { live: false, lastMode: 'hold', lastSentAt: Date.now() - 60000 } },
    'GET /ems/consumers': { current: [], events: [], batteryEvents: [{ ts: Date.now() - 60000, mode: 'hold', live: false, reason: 'Kapazität für die teuersten Stunden reserviert', cards: ['x'] }] },
    'GET /ems/devices': { devices: [] }, 'GET /ems/flows': { flows: [] }, 'GET /meters': null,
    'PUT /ems/config': config,
  };
  await ctx.window.EmsUi.init((m, p, b) => { calls.push([m, p, b]); return Promise.resolve(res[`${m} ${p}`]); }, 'de');
  const main = els.get('ems-view-main').innerHTML;
  assert.match(main, /Silent-Modus: es wird nur simuliert/);
  assert.match(main, /data-ems-toggle="battery"/);
  assert.match(main, /zuletzt: Halten/);
  assert.match(main, /Halten <span class="ems-muted">/);
  assert.match(main, /Silent-Modus: alle Einträge sind simuliert/, 'im Silent-Modus einmal oben statt in jeder Zeile');
  handlers['ems-view-main:change']({ target: { getAttribute: (n) => (n === 'data-ems-silent' ? '1' : null), checked: false, parentNode: null } });
  await new Promise((r) => setTimeout(r, 15));
  const put = calls.find((c) => c[0] === 'PUT' && c[1] === '/ems/config');
  assert.deepEqual(JSON.parse(JSON.stringify(put[2])), { silent: false });
  // Einrichtung: Batterie aufklappen lädt die Karten, zeigt Vorlage und Felder
  handlers['ems-view-devices:click']({ target: { getAttribute: (n) => (n === 'data-ems-open' ? 'src-bat' : null), parentNode: null } });
  await new Promise((r) => setTimeout(r, 15));
  const setup2 = els.get('ems-view-devices').innerHTML;
  assert.match(setup2, /Die App gibt aus:/, 'Die Batterie-Befehle statt einer Karten-Zuordnung');
  assert.match(setup2, /Batterie: aus dem Netz laden|battery.charge/);
  assert.match(setup2, /Normale Entladeleistung \(W\)/);
  assert.match(setup2, /Nur ein System darf die Batterie steuern/);
  assert.match(setup2, /id="ems-bc-on" type="checkbox" checked/);
  el('ems-bc-on').checked = true; // die Attrappe liest kein HTML: Zustand des gezeichneten Schalters nachbilden
  const body = ctx.window.EmsUi._collect().ems.battery;
  assert.equal(body.control.enabled, true);
  assert.equal(body.control.preset, undefined, 'keine Karten-Zuordnung mehr');
  assert.equal(body.control.live, undefined, 'live nur über den Schalter, nicht über Speichern');
});

test('Protokoll: Wiederholungen (alle 10 min) erzeugen keine Einträge, nur Wechsel; alte Wiederholungen werden beim Start entfernt', async () => {
  const { runner } = setup({ silent: true, live: false, soc: 20 });
  await runner.tick(at(3));
  for (let m = 5; m <= 60; m += 5) await runner.tick(at(3, m));
  assert.equal(runner.current.mine.mode, 'charge', 'nachts günstig: laden (wird alle 10 min wiederholt)');
  assert.equal(runner.batteryEvents.length, 1, 'ein Eintrag für den Start, keine Wiederholungen');
  assert.ok(runner.batteryControl.lastSentAt > at(3, 30), 'trotzdem wiederholt gesendet (simuliert)');
  const store = new Map([['batteryEvents', [{ ts: 1, mode: 'hold', why: 'Start: hold' }, { ts: 2, mode: 'hold', why: 'Wiederholung' }, { ts: 3, mode: 'hold', why: 'Wiederholung', error: 'x' }]]]);
  const r2 = new EmsRunner({
    getConfig: () => normalizeConfig({}), prices: prices(), pv: new PvFeed(null, () => {}),
    inputs: {}, actuators: null, shadowLog: new ShadowLog({ get() {}, set() {} }), store: { get: (k) => store.get(k), set: (k, v) => store.set(k, v) },
  });
  assert.deepEqual(r2.batteryEvents.map((e) => e.ts), [1, 3], 'Wiederholung ohne Fehler weg');
});
