'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ShadowLog } = require('../lib/ems/ShadowLog');
const { failSafe, makeChargerState, FAILSAFE_MIN_MS, FAILSAFE_STOP_MS } = require('../lib/ems/planner/charger');
const { EmsRunner } = require('../lib/ems/EmsRunner');
const { PriceFeed } = require('../lib/ems/PriceFeed');
const { PvFeed } = require('../lib/ems/PvFeed');
const { normalizeConfig, MAX_CONSUMERS } = require('../lib/ems/Config');

const T0 = Date.UTC(2026, 10, 10, 10, 0);

// ---------------------------------------------------------------- Schreiblast

function countingStore() {
  const m = new Map();
  let sets = 0;
  return { get: (k) => m.get(k), set: (k, v) => { sets += 1; m.set(k, JSON.parse(JSON.stringify(v))); }, sets: () => sets, m };
}

test('ShadowLog: speichert sofort bei einem Wechsel, sonst höchstens alle 5 Minuten (nicht bei jedem 15-s-Lauf)', () => {
  const store = countingStore();
  const log = new ShadowLog(store, 'Europe/Zurich', 'charger');
  // eine Stunde lang alle 15 s derselbe Zustand
  for (let s = 0; s < 240; s++) log.record({ nowMs: T0 + s * 15000, soc: 60, price: null, mine: { mode: 'idle', reason: 'x' }, andi: null });
  const perHour = store.sets() / 2; // je Speichern zwei Schlüssel (Ereignisse, Tage)
  assert.ok(perHour <= 13, 'höchstens ca. 12 Speichervorgänge pro Stunde statt 240: ' + perHour);
  assert.ok(perHour >= 10, 'aber regelmässig: ' + perHour);
  // ein Wechsel wird sofort gespeichert
  const before = store.sets();
  log.record({ nowMs: T0 + 3600000 + 1000, soc: 60, price: null, mine: { mode: 'solar_ev', reason: 'y' }, andi: null });
  assert.equal(store.sets(), before + 2);
  // die Tageszähler stimmen trotzdem (nach flush gespeichert)
  log.record({ nowMs: T0 + 3600000 + 16000, soc: 60, price: null, mine: { mode: 'solar_ev', reason: 'y' }, andi: null });
  log.flush(T0 + 3600000 + 17000);
  const days = store.get('shadowDays_charger');
  const day = Object.values(days)[0];
  assert.equal(day.ticks, 242);
  assert.equal(new ShadowLog(store, 'Europe/Zurich', 'charger').events.length, 2, 'Ereignisse überstehen einen Neustart');
  const n = store.sets();
  log.flush();
  assert.equal(store.sets(), n, 'flush ohne Änderung schreibt nichts');
});

// ---------------------------------------------------------------- Fehlerfall der Wallbox

test('failSafe: greift nur bei selbst gestartetem Laden, nach 60 s Mindeststrom, nach 5 min Stopp', () => {
  const idle = makeChargerState();
  assert.deepEqual(failSafe({ st: idle, blindMs: 10 * 60000, minAmps: 6, phases: 3, now: T0 }), { commands: [], note: '' });
  const st = { ...makeChargerState(), currentAmps: 14, currentPhases: 3 };
  assert.deepEqual(failSafe({ st, blindMs: 30000, minAmps: 6, phases: 3, now: T0 }).commands, [], 'unter 60 s nichts tun');
  const down = failSafe({ st, blindMs: FAILSAFE_MIN_MS, minAmps: 6, phases: 3, now: T0 });
  assert.deepEqual(down.commands, [{ type: 'set', amps: 6, phases: 3 }]);
  assert.equal(st.currentAmps, 6);
  assert.match(down.note, /Mindeststrom/);
  assert.deepEqual(failSafe({ st, blindMs: FAILSAFE_MIN_MS + 15000, minAmps: 6, phases: 3, now: T0 }).commands, [], 'nicht wiederholen');
  const stop = failSafe({ st, blindMs: FAILSAFE_STOP_MS, minAmps: 6, phases: 3, now: T0 });
  assert.deepEqual(stop.commands, [{ type: 'stop' }]);
  assert.equal(st.currentAmps, null);
  assert.deepEqual(failSafe({ st, blindMs: FAILSAFE_STOP_MS + 60000, minAmps: 6, phases: 3, now: T0 }).commands, [], 'nach dem Stopp nichts mehr');
  // ausdrücklich verlangtes Laden (Sofort laden, Auftrag): Mindeststrom, aber kein Stopp
  const forced = { ...makeChargerState(), currentAmps: 16, currentPhases: 3 };
  assert.deepEqual(failSafe({ st: forced, blindMs: FAILSAFE_STOP_MS + 1, minAmps: 6, phases: 3, forced: true, now: T0 }).commands, [{ type: 'set', amps: 6, phases: 3 }]);
  assert.equal(forced.currentAmps, 6);
});

function liveRunner() {
  const calls = [];
  const state = { i: { gridW: -9000, houseW: 500, pvW: 10000, batterySoc: 99, batteryW: 0, batteryCapacityKwh: 10, chargerRead: true, chargerConnected: true, chargerState: 'plugged_in_charging', chargerPowerW: 0, chargerPhases: 3, chargeNow: false, andi: null } };
  const config = normalizeConfig({ enabled: true, devices: { meter: { id: 'm' }, inverter: { id: 'inv' } }, battery: { deviceId: 'bat' }, charger: { id: 'wb', live: true } });
  const runner = new EmsRunner({
    getConfig: () => config, prices: new PriceFeed(() => null), pv: new PvFeed(null, () => {}, { get: async () => ({ slots: [], stale: true }) }),
    inputs: { chargerInputs: async () => state.i, consumerStates: async () => new Map(), battery: async () => ({ soc: 99, capacityKwh: 10 }), andiBatteryPlan: async () => null },
    actuators: { charger: async (id, cmd) => { calls.push(cmd); return { cmd: cmd.type }; }, consumer: async () => ({}) },
    shadowLog: new ShadowLog(countingStore()), store: null,
  });
  return { runner, calls, state };
}

test('Runner live: fällt der Netzzähler aus, geht die Wallbox nach 60 s auf Mindeststrom und nach 5 min aus', async () => {
  const { runner, calls, state } = liveRunner();
  await runner.tickCharger(T0); // Beobachtungslauf
  await runner.tickCharger(T0 + 20000);
  await runner.tickCharger(T0 + 55000);
  assert.ok(runner.chargerSt.currentAmps > 6, 'lädt mit Überschuss: ' + runner.chargerSt.currentAmps);
  calls.length = 0;
  const blind = T0 + 90000;
  state.i = { ...state.i, gridW: null }; // Zähler nicht mehr lesbar
  await runner.tickCharger(blind);
  assert.equal(runner.chargerCurrent.mine.mode, 'error');
  assert.deepEqual(calls, [], 'in den ersten 60 s keine Reaktion (kurzer Aussetzer)');
  await runner.tickCharger(blind + 60000);
  assert.deepEqual(calls, [{ type: 'set', amps: 6, phases: 3 }]);
  assert.match(runner.chargerCurrent.mine.reason, /Netzzähler nicht lesbar - Mindeststrom/);
  await runner.tickCharger(blind + 5 * 60000);
  assert.deepEqual(calls[calls.length - 1], { type: 'stop' });
  assert.match(runner.chargerCurrent.mine.reason, /gestoppt/);
  // Zähler wieder da: normaler Betrieb, der Fehlerfall ist zurückgesetzt
  state.i = { ...state.i, gridW: -9000 };
  await runner.tickCharger(blind + 6 * 60000);
  assert.notEqual(runner.chargerCurrent.mine.mode, 'error');
  assert.equal(runner._blindSince, null);
});

test('Runner Testbetrieb: im Fehlerfall wird nichts gesendet', async () => {
  const { runner, calls, state } = liveRunner();
  runner.getConfig().charger.live = false;
  await runner.tickCharger(T0);
  state.i.gridW = null;
  await runner.tickCharger(T0 + 10 * 60000);
  assert.deepEqual(calls, []);
  assert.equal(runner.chargerCurrent.mine.reason, 'Netzzähler nicht lesbar');
});

// ---------------------------------------------------------------- Verbraucher-Grenze

test('Verbraucher-Grenze: 8 gesteuerte Verbraucher, die Oberfläche lehnt mehr mit einer Meldung ab', async () => {
  assert.equal(MAX_CONSUMERS, 8);
  const many = [];
  for (let k = 0; k < 11; k++) many.push({ id: 'd' + k, name: 'V' + k });
  assert.equal(normalizeConfig({ consumers: many }).consumers.length, 8);
  const emsJs = fs.readFileSync(path.join(__dirname, '../settings/ems.js'), 'utf8');
  assert.match(emsJs, /var MAX_CTRL = 8;/);
  const els = new Map();
  const el = (id) => { if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '', value: '', classList: { contains: () => true, toggle() {} }, addEventListener() {} }); return els.get(id); };
  const ctx = { document: { getElementById: el }, window: {}, setInterval: () => 0, console, Object, Promise, Date, Number, isFinite, String, JSON, Math };
  vm.createContext(ctx);
  vm.runInContext(emsJs, ctx);
  const calls = [];
  const config = normalizeConfig({ enabled: true, devices: { meter: { id: 'em' } }, consumers: many.slice(0, 8) });
  const res = {
    'GET /ems/shadow': { enabled: true, deviceExists: true, shadow: true, config, pv: {}, current: null, charger: { current: null } },
    'GET /ems/consumers': { current: [], events: [] }, 'GET /ems/devices': { devices: [] }, 'GET /ems/flows': { flows: [] }, 'GET /meters': null,
  };
  await ctx.window.EmsUi.init((m, p, b) => { calls.push([m, p]); return Promise.resolve(res[`${m} ${p}`]); }, 'de');
  const st = ctx.window.EmsUi._state;
  assert.equal(ctx.window.EmsUi._collect().ems.consumers.length, 8);
  // ein neunter gesteuerter Verbraucher: Speichern wird abgelehnt, nichts geht an die App
  st.rows.push(Object.assign({}, st.rows[1], { deviceId: 'd9', name: 'Neunter' }));
  assert.equal(ctx.window.EmsUi._collect().ems.consumers.length, 9);
  const before = calls.length;
  await ctx.window.EmsUi._save();
  assert.equal(calls.length, before, 'kein PUT');
  assert.match(st.msg, /Höchstens 8 gesteuerte Verbraucher/);
});
