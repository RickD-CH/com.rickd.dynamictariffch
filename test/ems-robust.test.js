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
  for (let s = 0; s < 240; s++) log.record({ nowMs: T0 + s * 15000, soc: 60, price: null, mine: { mode: 'idle', reason: 'x' }, other: null });
  const perHour = store.sets() / 2; // je Speichern zwei Schlüssel (Ereignisse, Tage)
  assert.ok(perHour <= 13, 'höchstens ca. 12 Speichervorgänge pro Stunde statt 240: ' + perHour);
  assert.ok(perHour >= 10, 'aber regelmässig: ' + perHour);
  // ein Wechsel wird sofort gespeichert
  const before = store.sets();
  log.record({ nowMs: T0 + 3600000 + 1000, soc: 60, price: null, mine: { mode: 'solar_ev', reason: 'y' }, other: null });
  assert.equal(store.sets(), before + 2);
  // die Tageszähler stimmen trotzdem (nach flush gespeichert)
  log.record({ nowMs: T0 + 3600000 + 16000, soc: 60, price: null, mine: { mode: 'solar_ev', reason: 'y' }, other: null });
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
  const state = { i: { gridW: -9000, houseW: 500, pvW: 10000, batterySoc: 99, batteryW: 0, batteryCapacityKwh: 10, chargerRead: true, chargerConnected: true, chargerState: 'plugged_in_charging', chargerPowerW: 0, chargerPhases: 3, chargeNow: false, other: null } };
  const config = normalizeConfig({ enabled: true, silent: false, devices: { meter: { id: 'm' }, inverter: { id: 'inv' } }, battery: { deviceId: 'bat' }, charger: { id: 'wb', live: true } });
  const runner = new EmsRunner({
    getConfig: () => config, prices: new PriceFeed(() => null), pv: new PvFeed(null, () => {}, { get: async () => ({ slots: [], stale: true }) }),
    inputs: { chargerInputs: async () => state.i, consumerStates: async () => new Map(), battery: async () => ({ soc: 99, capacityKwh: 10 }), compareBatteryPlan: async () => null },
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

// ---------------------------------------------------------------- Vergleich hinter einem Schalter, neutrales Protokoll

test('Config: Vergleich ist standardmässig aus, bleibt an, wo schon eine Vergleichsquelle gewählt war', () => {
  assert.equal(normalizeConfig({}).compare, false);
  assert.equal(normalizeConfig({ compare: true }).compare, true);
  assert.equal(normalizeConfig({ devices: { compareEms: 'abc' } }).compare, true, 'bestehende Einrichtung läuft weiter');
  assert.equal(normalizeConfig({ compare: false, devices: { compareEms: 'abc' } }).compare, false, 'ausdrücklich aus');
});

function compareRunner(compare) {
  const asked = { plan: 0, device: [] };
  const config = normalizeConfig({ enabled: true, compare, devices: { meter: { id: 'm' }, compareEms: compare ? 'x' : '' }, battery: { deviceId: 'bat' }, charger: { id: 'wb' } });
  const runner = new EmsRunner({
    getConfig: () => config, prices: new PriceFeed(() => null), pv: new PvFeed(null, () => {}, { get: async () => ({ slots: [], stale: true }) }),
    inputs: {
      battery: async () => ({ soc: 50, capacityKwh: 10 }),
      compareBatteryPlan: async () => { asked.plan += 1; return { mode: 'hold', reason: '' }; },
      chargerInputs: async () => ({ gridW: 0, chargerRead: true, chargerConnected: false, other: null }),
      consumerStates: async () => new Map(),
    },
    shadowLog: new ShadowLog(countingStore()), store: null,
  });
  return { runner, asked };
}

test('Ohne Vergleich liest das EMS keine fremde App; mit Vergleich schon', async () => {
  const off = compareRunner(false);
  await off.runner.tick(T0);
  assert.equal(off.asked.plan, 0, 'kein Aufruf der fremden App');
  assert.equal(off.runner.current.other, null);
  const on = compareRunner(true);
  await on.runner.tick(T0);
  assert.equal(on.asked.plan, 1);
  assert.equal(on.runner.current.other.mode, 'hold');
});

test('Inputs.chargerInputs: das Vergleichs-Gerät wird nur mit Vergleich gelesen', async () => {
  const { Inputs } = require('../lib/ems/Inputs');
  const inputs = new Inputs({}, () => {});
  const read = [];
  inputs._api = async () => ({ devices: { getDevice: async ({ id }) => { read.push(id); return { available: true, capabilitiesObj: {} }; } } });
  await inputs.chargerInputs(normalizeConfig({ compare: false, devices: { meter: { id: 'em' }, compareEms: 'other' }, charger: { id: 'wb' } }));
  assert.ok(!read.includes('other'));
  read.length = 0;
  await inputs.chargerInputs(normalizeConfig({ compare: true, devices: { meter: { id: 'em' }, compareEms: 'other' }, charger: { id: 'wb' } }));
  assert.ok(read.includes('other'));
});

function uiEnv(extra = {}, lang = 'de') {
  const emsJs = fs.readFileSync(path.join(__dirname, '../settings/ems.js'), 'utf8');
  const els = new Map();
  const handlers = {};
  const el = (id) => { if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '', value: '', checked: false, hidden: false, classList: { contains: () => true, toggle() {} }, addEventListener: (t, f) => { handlers[`${id}:${t}`] = f; } }); return els.get(id); };
  const ctx = { document: { getElementById: el }, window: {}, setInterval: () => 0, console, Object, Promise, Date, Number, isFinite, String, JSON, Math };
  vm.createContext(ctx);
  vm.runInContext(emsJs, ctx);
  const calls = [];
  const config = normalizeConfig({ enabled: true, devices: { meter: { id: 'em' } }, charger: { id: 'wb' }, consumers: [{ id: 'dry', name: 'Entfeuchter' }], ...extra.cfg });
  const res = {
    'GET /ems/shadow': { enabled: true, deviceExists: true, shadow: true, config, pv: {}, current: null, charger: { current: { live: false, mine: { mode: 'idle', reason: 'x' }, connected: false }, events: extra.chargerEvents || [] } },
    'GET /ems/consumers': { current: [], events: extra.events || [] }, 'GET /ems/devices': { devices: [] }, 'GET /ems/flows': { flows: [] }, 'GET /meters': null,
    'PUT /ems/config': config,
  };
  return { ctx, els, handlers, calls, init: () => ctx.window.EmsUi.init((m, p, b) => { calls.push([m, p, b]); return Promise.resolve(res[`${m} ${p}`]); }, lang) };
}

test('Protokoll unter «Heute»: Schaltungen und Moduswechsel mit Grund, ohne Fremdnamen, auch ohne Vergleich', async () => {
  const now = Date.now();
  const env = uiEnv({
    events: [{ ts: now - 60000, id: 'dry', name: 'Entfeuchter', cmd: 'on', live: false, reason: 'SoC 99% >= 98%' }],
    chargerEvents: [{ ts: now - 30000, mine: 'solar_ev', reason: 'Überschuss 2.5 kW', soc: 80 }],
  });
  await env.init();
  const html = env.els.get('ems-view-main').innerHTML;
  assert.match(html, /PROTOKOLL/);
  assert.match(html, /Entfeuchter: ein \(simuliert\)/);
  assert.match(html, /SoC 99% &gt;= 98%/);
  assert.match(html, /Wallbox: Lädt mit Solarstrom \(simuliert\)/);
  assert.match(html, /Überschuss 2\.5 kW/);
  assert.ok(html.indexOf('Wallbox: Lädt') < html.indexOf('Entfeuchter: ein'), 'jüngster Eintrag zuerst');
  assert.doesNotMatch(html.replace(/<style>[\s\S]*?<\/style>/g, ''), /Huawei|FusionSolar|EMMA/i);
  const empty = uiEnv();
  await empty.init();
  assert.match(empty.els.get('ems-view-main').innerHTML, /Noch keine Einträge/);
});

test('Vergleichs-Ansicht: Schalter, ausgeschaltet nur der Schalter und der Hinweis; Einschalten speichert', async () => {
  const off = uiEnv();
  await off.init();
  const html = off.els.get('ems-cmp-data').innerHTML; // der Schalter steht im Datenbereich der Vergleichs-Ansicht
  assert.match(html, /Vergleich aktiv/);
  assert.match(html, /greift sie auf keine andere App zu/);
  assert.match(html, /data-ems-compare="1"/);
  assert.doesNotMatch(off.els.get('ems-cmp-data').innerHTML, /Gesamt gleich|Anderes EMS/);
  assert.equal(off.els.get('ems-cmp-settings').hidden, true);
  off.handlers['ems-view-cmp:change']({ target: { getAttribute: (n) => (n === 'data-ems-compare' ? '1' : null), checked: true, parentNode: null } });
  await new Promise((r) => setTimeout(r, 15));
  const put = off.calls.find((c) => c[0] === 'PUT' && c[1] === '/ems/config');
  assert.deepEqual(JSON.parse(JSON.stringify(put[2])), { compare: true });
  const on = uiEnv({ cfg: { compare: true } });
  await on.init();
  assert.match(on.els.get('ems-cmp-data').innerHTML, /checked/);
  assert.equal(on.els.get('ems-cmp-settings').hidden, false);
});

test('ShadowLog: Daten früherer Versionen (anderer Feldname für den Vergleichswert) werden übernommen', () => {
  const store = countingStore();
  store.m.set('shadowEvents', [{ ts: 1, soc: 50, price: 20, mine: 'hold', reason: 'x', alt: 'charge' }]);
  store.m.set('shadowDays', { '2026-11-10': { ticks: 3, compared: 3, agree: 2, mine: { hold: 3 }, alt: { hold: 2, charge: 1 } } });
  const log = new ShadowLog(store);
  assert.equal(log.events[0].other, 'charge');
  assert.equal('alt' in log.events[0], false);
  assert.deepEqual(log.days['2026-11-10'].other, { hold: 2, charge: 1 });
  assert.equal(log.summary(Date.UTC(2026, 10, 10, 12)).days[0].agreePct, 67);
});
