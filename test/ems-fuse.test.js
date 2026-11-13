'use strict';

// Hausanschluss-Schutz: Wallbox pro Phase drosseln, bei anhaltender Überlast der Reihe nach ausschalten.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  normalizeFuse, limitA, chargerCapAmps, makeFuseState, stepFuse,
} = require('../lib/ems/planner/fuse');
const { applyFuseCap, makeChargerState } = require('../lib/ems/planner/charger');
const { EmsRunner } = require('../lib/ems/EmsRunner');
const { EmsController } = require('../lib/ems/EmsController');
const { ShadowLog } = require('../lib/ems/ShadowLog');
const { PriceFeed } = require('../lib/ems/PriceFeed');
const { PvFeed } = require('../lib/ems/PvFeed');
const { normalizeConfig } = require('../lib/ems/Config');

const T0 = Date.UTC(2026, 10, 11, 12, 0, 0);
const mem = () => {
  const m = new Map(); return { get: (k) => m.get(k), set: (k, v) => m.set(k, JSON.parse(JSON.stringify(v))) };
};

// ---------------------------------------------------------------- Einstellungen und reine Logik

test('normalizeFuse: Standard aus, 40 A, 90 %, Wallbox in der Liste; Grenze 36 A; Unsinn wird bereinigt', () => {
  const d = normalizeFuse(undefined);
  assert.equal(d.enabled, false);
  assert.equal(d.live, false);
  assert.equal(d.amps, 40);
  assert.equal(d.reservePct, 90);
  assert.equal(d.throttle, true);
  assert.deepEqual(d.shed, [{ kind: 'charger', offFlow: null }]);
  assert.equal(limitA(d), 36);
  const n = normalizeFuse({
    amps: 9999, reservePct: 10, holdS: -3, caps: ['a'], shed: [{ kind: 'device', id: 'sauna', name: 'Sauna' }, { kind: 'device', id: 'sauna' }, { kind: 'x' }, { kind: 'flow', flow: { id: 'f1', name: 'Boiler aus' } }],
  });
  assert.equal(n.amps, 250);
  assert.equal(n.reservePct, 50);
  assert.equal(n.holdS, 0);
  assert.equal(n.caps.length, 3, 'ungültige Werte: Standard');
  assert.deepEqual(n.shed.map((e) => e.kind), ['device', 'flow'], 'doppelt und unbekannt entfernt, leere Liste bleibt leer (Wallbox nicht erzwungen)');
  assert.equal(normalizeConfig({}).fuse.enabled, false);
});

test('normalizeFuse: eigener Aus-Flow bei einem Gerät (für Geräte, die nicht einfach Ein/Aus können)', () => {
  const withFlow = normalizeFuse({
    shed: [{
      kind: 'device', id: 'dryfy', name: 'DryFy', offFlow: { id: 'f1', advanced: true, name: 'DryFy aus' },
    }],
  });
  assert.deepEqual(withFlow.shed[0].offFlow, { id: 'f1', advanced: true, name: 'DryFy aus' });
  const withoutFlow = normalizeFuse({ shed: [{ kind: 'device', id: 'sauna', name: 'Sauna' }] });
  assert.equal(withoutFlow.shed[0].offFlow, null, 'Standard: automatisch erkennen, kein Flow hinterlegt');
  const emptyFlow = normalizeFuse({ shed: [{ kind: 'device', id: 'x', offFlow: { id: '', name: '' } }] });
  assert.equal(emptyFlow.shed[0].offFlow, null, 'Flow ohne Auswahl zählt wie keiner');
});

test('normalizeFuse: auch die Wallbox kann einen eigenen Aus-Flow statt des Stopp-Befehls bekommen', () => {
  const withFlow = normalizeFuse({ shed: [{ kind: 'charger', offFlow: { id: 'f2', advanced: false, name: 'Wallbox aus' } }] });
  assert.deepEqual(withFlow.shed[0], { kind: 'charger', offFlow: { id: 'f2', advanced: false, name: 'Wallbox aus' } });
  const withoutFlow = normalizeFuse({ shed: [{ kind: 'charger' }] });
  assert.equal(withoutFlow.shed[0].offFlow, null, 'Standard: Ladevorgang wird direkt gestoppt, kein Flow hinterlegt');
});

test('chargerCapAmps: freier Strom der knappsten Phase, eigener Wallbox-Strom wird abgezogen; einphasig nur Phase 1', () => {
  // Wallbox lädt 3-phasig mit 16 A (11 kW). Haus: L1 30 A gesamt (14 A ohne Wallbox), L2/L3 20 A
  assert.equal(chargerCapAmps({
    phasesA: [30, 20, 20], limit: 36, chargerW: 11040, chargerPhases: 3, maxAmps: 16,
  }), 16, 'genug frei: voller Strom');
  // Backofen auf L1: 38 A gesamt, ohne Wallbox 22 A -> 14 A frei
  assert.equal(chargerCapAmps({
    phasesA: [38, 20, 20], limit: 36, chargerW: 11040, chargerPhases: 3, maxAmps: 16,
  }), 14);
  // einphasig: L2/L3 zählen nicht
  assert.equal(chargerCapAmps({
    phasesA: [10, 40, 40], limit: 36, chargerW: 2300, chargerPhases: 1, maxAmps: 16,
  }), 16);
  assert.equal(chargerCapAmps({
    phasesA: [null, null, null], limit: 36, chargerW: 0, chargerPhases: 3, maxAmps: 16,
  }), null, 'keine Messung');
  assert.equal(chargerCapAmps({
    phasesA: [60, 20, 20], limit: 36, chargerW: 0, chargerPhases: 3, maxAmps: 16,
  }), 0);
});

test('applyFuseCap: drosselt einen laufenden Ladevorgang, stoppt unter dem Mindeststrom, lässt fremdes Laden in Ruhe', () => {
  const st = { ...makeChargerState(), currentAmps: 16, currentPhases: 3 };
  const a = applyFuseCap({
    st, commands: [], capAmps: 10, minAmps: 6, phases: 3, now: T0,
  });
  assert.deepEqual(a.commands, [{ type: 'set', amps: 10, phases: 3 }]);
  assert.equal(st.currentAmps, 10);
  assert.match(a.note, /auf 10 A gedrosselt/);
  assert.deepEqual(applyFuseCap({
    st, commands: [], capAmps: 12, minAmps: 6, phases: 3, now: T0,
  }).commands, [], 'unter der Grenze: nichts');
  const b = applyFuseCap({
    st, commands: [], capAmps: 4, minAmps: 6, phases: 3, now: T0,
  });
  assert.deepEqual(b.commands, [{ type: 'stop' }]);
  assert.equal(st.currentAmps, null);
  assert.deepEqual(applyFuseCap({
    st: makeChargerState(), commands: [], capAmps: 0, minAmps: 6, phases: 3, now: T0,
  }).commands, [], 'nicht vom EMS gestartet: nichts');
});

test('stepFuse: erst nach der Wartezeit, dann der nächste laufende Eintrag; Freigabe nach der Zeit unter Grenze minus 2 A', () => {
  const st = makeFuseState();
  const entries = [{ key: 'charger', active: true }, { key: 'd:off', active: false }, { key: 'd:sauna', active: true }];
  const p = (phasesA, nowMs) => stepFuse({
    st, phasesA, limit: 36, nowMs, holdMs: 10000, restoreMs: 300000, entries,
  });
  assert.equal(p([37, 20, 20], T0).action, 'none', 'kurze Spitze: warten');
  assert.equal(p([37, 20, 20], T0 + 5000).over, true);
  const s1 = p([37, 20, 20], T0 + 10000);
  assert.equal(s1.action, 'shed');
  assert.equal(s1.entry.key, 'charger');
  assert.equal(s1.phase, 1);
  assert.equal(p([37, 20, 20], T0 + 15000).action, 'none', 'Wirkung abwarten');
  const s2 = p([37, 20, 20], T0 + 20000);
  assert.equal(s2.entry.key, 'd:sauna', 'ausgeschaltete Geräte werden übersprungen');
  assert.equal(p([37, 20, 20], T0 + 40000).action, 'none', 'nichts mehr zum Ausschalten');
  assert.equal(p([35, 20, 20], T0 + 50000).action, 'none', 'knapp unter der Grenze: noch nicht frei');
  p([30, 20, 20], T0 + 60000);
  assert.equal(p([30, 20, 20], T0 + 60000 + 299000).action, 'none');
  assert.equal(p([30, 20, 20], T0 + 60000 + 300000).action, 'release');
  assert.deepEqual(st.shed, []);
  assert.equal(p([null, null, null], T0 + 999999).action, 'none', 'ohne Messung nichts');
});

// ---------------------------------------------------------------- Runner

function fuseRunner({
  silent = false, fuseLive = true, chargerLive = true, shed = [{ kind: 'charger' }, { kind: 'device', id: 'sauna', name: 'Sauna' }],
} = {}) {
  const calls = { charger: [], shed: [] };
  const state = {
    sauna: true,
    i: {
      gridW: 9000, houseW: 12000, pvW: 0, batterySoc: null, batteryW: 0, chargerRead: true, chargerConnected: true, chargerState: 'plugged_in_charging', chargerPowerW: 0, chargerPhases: 3, chargeNow: false, other: null, phaseA: [20, 15, 15],
    },
  };
  const config = normalizeConfig({
    enabled: true,
    silent,
    devices: { meter: { id: 'm' } },
    charger: {
      id: 'wb', live: chargerLive, chargeNow: true, maxAmps: 16, minAmps: 6,
    },
    fuse: {
      enabled: true, live: fuseLive, holdS: 10, restoreMin: 5, shed,
    },
  });
  const runner = new EmsRunner({
    getConfig: () => config,
    prices: new PriceFeed(() => null),
    pv: new PvFeed(null, () => {}, { get: async () => ({ slots: [], stale: true }) }),
    inputs: {
      chargerInputs: async () => state.i,
      consumerStates: async () => new Map(),
      shedStates: async (ids) => new Map(ids.map((id) => [id, { available: true, on: id === 'sauna' ? state.sauna : false }])),
    },
    actuators: {
      charger: async (id, cmd, o) => {
        calls.charger.push({ ...cmd, live: o.live }); return { cmd: cmd.type };
      },
      consumer: async () => ({}),
      shed: async (id, o) => {
        calls.shed.push({ id, live: o.live }); if (o.live) state.sauna = false; return { cmd: 'off', live: o.live };
      },
    },
    shadowLog: new ShadowLog(mem()),
    store: mem(),
  });
  return {
    runner, calls, state, config,
  };
}

test('Runner: Sofortladen 16 A, Backofen auf Phase 1 - die Wallbox wird sofort auf den freien Strom gedrosselt', async () => {
  const { runner, calls, state } = fuseRunner();
  await runner.tickCharger(T0); // Beobachtungslauf
  await runner.tickCharger(T0 + 15000);
  assert.ok(calls.charger.some((c) => c.type === 'set' && c.amps === 16), 'lädt mit vollem Strom');
  calls.charger.length = 0;
  // Wallbox zieht 16 A; L1 jetzt 38 A (22 A ohne Wallbox) -> 14 A frei
  state.i = { ...state.i, chargerPowerW: 11040, phaseA: [38, 30, 30] };
  await runner.tickCharger(T0 + 20000);
  assert.deepEqual(calls.charger, [{
    type: 'set', amps: 14, phases: 3, live: true,
  }]);
  assert.equal(runner.fuseCurrent.capAmps, 14);
  assert.match(runner.chargerCurrent.mine.reason, /Hausanschluss: auf 14 A/);
  assert.ok(runner.fuseEvents.some((e) => e.action === 'throttle' && e.capAmps === 14));
  assert.deepEqual(calls.shed, [], 'drosseln reicht: nichts ausgeschaltet');
});

test('Runner: reicht das Drosseln nicht, stoppt die Wallbox sofort, nach der Wartezeit geht die Sauna aus und bleibt aus', async () => {
  const { runner, calls, state } = fuseRunner();
  await runner.tickCharger(T0);
  await runner.tickCharger(T0 + 15000);
  // Haus allein schon über der Grenze (Sauna + Backofen): L1 44 A mit 6 A Wallbox
  state.i = { ...state.i, chargerPowerW: 6 * 3 * 230, phaseA: [44, 30, 30] };
  await runner.tickCharger(T0 + 20000);
  assert.ok(calls.charger.some((c) => c.type === 'stop'), 'unter Mindeststrom: Stopp');
  assert.equal(runner.fuseCurrent.over, true);
  assert.ok(runner.fuseEvents.some((e) => e.action === 'over'));
  state.i = { ...state.i, chargerPowerW: 0, phaseA: [40, 26, 26] }; // Wallbox steht, Sauna läuft noch
  await runner.tickCharger(T0 + 25000);
  assert.deepEqual(calls.shed, [], 'Wartezeit läuft');
  await runner.tickCharger(T0 + 31000);
  assert.deepEqual(calls.shed, [{ id: 'sauna', live: true }], 'Wallbox steht schon (gedrosselt auf 0): die Sauna ist die nächste');
  assert.deepEqual(runner.fuseCurrent.shed, ['Sauna']);
  // wieder normal: nach 5 min frei, die Wallbox darf wieder laden; die Sauna wird nicht eingeschaltet
  state.i = { ...state.i, phaseA: [10, 8, 8] };
  await runner.tickCharger(T0 + 60000);
  await runner.tickCharger(T0 + 60000 + 5 * 60000);
  assert.deepEqual(runner.fuseCurrent.shed, []);
  assert.ok(runner.fuseEvents.some((e) => e.action === 'release'));
  assert.equal(calls.shed.length, 1);
  assert.equal(runner.fuseCapAmps, 16, 'Wallbox wieder frei');
});

test('Runner: Silent-Modus simuliert das Abschalten (Gerät bekommt keinen Befehl), Wallbox ohne EMS-Steuerung wird live direkt gestoppt', async () => {
  const silent = fuseRunner({ silent: true });
  silent.state.i = { ...silent.state.i, chargerPowerW: 4000, phaseA: [45, 30, 30] };
  await silent.runner.tickCharger(T0);
  await silent.runner.tickCharger(T0 + 11000);
  await silent.runner.tickCharger(T0 + 22000);
  assert.deepEqual(silent.calls.shed, [{ id: 'sauna', live: false }]);
  assert.equal(silent.runner.fuseCurrent.live, false);
  assert.ok(silent.calls.charger.every((c) => c.live === false || c.live === undefined), 'nichts live gesendet');

  const foreign = fuseRunner({ chargerLive: false });
  foreign.state.i = { ...foreign.state.i, chargerPowerW: 11000, phaseA: [45, 30, 30] };
  await foreign.runner.tickCharger(T0);
  await foreign.runner.tickCharger(T0 + 11000);
  assert.deepEqual(foreign.calls.charger.filter((c) => c.type === 'stop'), [{ type: 'stop', live: true }], 'wie im bisherigen Flow: Ladevorgang gestoppt');
});

test('Runner: vom Schutz ausgeschaltete EMS-Verbraucher schaltet das EMS nicht wieder ein; ohne Schutz kein Eingriff', async () => {
  const { runner } = fuseRunner({ shed: [{ kind: 'device', id: 'dry', name: 'Entfeuchter' }] });
  runner.fuseBlocked = new Set(['dry']);
  runner.getConfig().consumers = [normalizeConfig({ consumers: [{ id: 'dry', name: 'Entfeuchter', mode: 'full' }] }).consumers[0]];
  runner.inputs.consumerStates = async () => new Map([['dry', { actualOn: false, powerW: 0, available: true }]]);
  runner._runFuse = async () => {};
  await runner.tickCharger(T0);
  assert.equal(runner.consumerCurrent[0].reason, 'Hausanschluss: ausgeschaltet');
  const off = fuseRunner();
  off.config.fuse.enabled = false;
  await off.runner.tickCharger(T0);
  assert.equal(off.runner.fuseCurrent, null);
  assert.equal(off.runner.fuseCapAmps, null);
});

// ---------------------------------------------------------------- Controller: Echtzeit und Auslöser

test('Controller: beobachtet die Phasen in Echtzeit, rechnet bei hoher Phase sofort; Auslöser je neues Ereignis einmal', async () => {
  const settings = new Map([['ems.config', normalizeConfig({ enabled: true, devices: { meter: { id: 'm' } }, fuse: { enabled: true } })]]);
  const timers = [];
  const homey = {
    settings: { get: (k) => settings.get(k), set: (k, v) => settings.set(k, JSON.parse(JSON.stringify(v))) },
    clock: { getTimezone: () => 'Europe/Zurich' },
    drivers: { getDriver: () => ({ getDevices: () => [] }) },
    setTimeout: (f, ms) => {
      timers.push({ f, ms }); return timers.length;
    },
    clearTimeout: () => {},
  };
  const ctrl = new EmsController({ homey, log() {}, error() {} });
  let listener = null;
  const fired = [];
  ctrl.runner = {
    inputs: {
      watch: async (id, caps, cb) => {
        listener = { id, caps, cb }; return () => {
          listener = null;
        };
      },
    },
    tickCharger: async () => 30000,
    fuseEvents: [{ ts: 1, action: 'over' }],
    current: null,
    chargerCurrent: null,
    carCurrent: null,
  };
  ctrl.emsDevice = { publish: async () => {}, fireFuse: (...a) => fired.push(a) };
  ctrl._startFuseWatch();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(listener.id, 'm', 'Netzzähler, wenn kein eigener gewählt');
  assert.equal(listener.caps.length, 3);
  const before = timers.length;
  listener.cb('measure_current.phase1', 20);
  assert.equal(timers.length, before, 'tiefer Wert: nichts');
  listener.cb('measure_current.phase1', 35.5);
  assert.equal(timers.length, before + 1);
  assert.equal(timers[timers.length - 1].ms, 0, 'sofort');
  listener.cb('measure_current.phase2', 39);
  assert.equal(timers.length, before + 1, 'höchstens alle 3 s');
  ctrl._fireEvents();
  assert.deepEqual(fired, [], 'alte Ereignisse beim Start nicht melden');
  ctrl.runner.fuseEvents.push({
    ts: 2, action: 'shed', name: 'Sauna', maxA: 37.2, phase: 1, live: false,
  });
  ctrl._fireEvents();
  ctrl._fireEvents();
  assert.deepEqual(fired, [[37.2, 1, 'Sauna ausgeschaltet', false]]);
  ctrl._stopFuseWatch();
  assert.equal(listener, null, 'abgemeldet');
});

// ---------------------------------------------------------------- Oberfläche

test('Anzeige: Section Hausanschluss - einschalten, Sauna zur Liste, Reihenfolge; Heute zeigt den Stand und das Protokoll', async () => {
  const emsJs = fs.readFileSync(path.join(__dirname, '../settings/ems.js'), 'utf8');
  const els = new Map();
  const handlers = {};
  const el = (id) => {
    if (!els.has(id)) {
      els.set(id, {
        id,
        innerHTML: '',
        textContent: '',
        value: '',
        checked: false,
        hidden: false,
        classList: { contains: () => true, toggle() {} },
        addEventListener: (t, f) => {
          handlers[`${id}:${t}`] = f;
        },
      });
    }
    return els.get(id);
  };
  const ctx = {
    document: { getElementById: el }, window: {}, setInterval: () => 0, console, Object, Promise, Date, Number, isFinite, String, JSON, Math,
  };
  vm.createContext(ctx);
  vm.runInContext(emsJs, ctx);
  const config = normalizeConfig({
    enabled: true, devices: { meter: { id: 'em' } }, charger: { id: 'wb', maxAmps: 16 }, fuse: { enabled: true },
  });
  const res = {
    'GET /ems/shadow': {
      enabled: true,
      deviceExists: true,
      shadow: true,
      config,
      pv: {},
      current: null,
      charger: { current: null },
      fuse: {
        limitA: 36, maxA: 37.4, phase: 1, over: true, capAmps: 9, shed: ['Wallbox'], live: false,
      },
    },
    'GET /ems/consumers': {
      current: [],
      events: [],
      fuseEvents: [{
        ts: Date.now() - 60000, action: 'shed', name: 'Wallbox', maxA: 37.4, phase: 1, live: false,
      }],
    },
    'GET /ems/devices': {
      devices: [
        { id: 'em', name: 'Energiezähler', caps: ['measure_power', 'measure_current.phase1', 'measure_current.phase2', 'measure_current.phase3'] },
        { id: 'sauna', name: 'Sauna', caps: ['thermostat_mode', 'target_temperature'] },
        { id: 'lamp', name: 'Lampe', caps: ['dim'] },
        { id: 'wb', name: 'go-e', caps: ['onoff', 'evcharger_charging'] },
      ],
    },
    'GET /ems/flows': { flows: [] },
    'GET /meters': null,
  };
  await ctx.window.EmsUi.init((m, p) => Promise.resolve(res[`${m} ${p}`]), 'de');
  const main = els.get('ems-view-main').innerHTML;
  assert.match(main, /Hausanschluss 37.4 A von 36 A<\/span><span class="ems-item-s ems-muted">Wallbox auf 9 A · aus: Wallbox · simuliert/);
  assert.match(main, /Wallbox ausgeschaltet <span class="ems-muted">Phase 1: 37.4 A/);
  const click = (attr, value) => handlers['ems-view-devices:click']({ target: { getAttribute: (n) => (n === attr ? value : null), parentNode: null } });
  click('data-ems-open', 'fuse');
  let html = els.get('ems-view-devices').innerHTML;
  assert.match(html, /HAUSANSCHLUSS/);
  assert.match(html, /Grenze 36 A pro Phase/);
  assert.match(html, /1\. Wallbox/);
  assert.match(html, /<option value="d:sauna">Sauna<\/option>/, 'Thermostat wählbar');
  assert.doesNotMatch(html, /d:lamp/, 'ohne Schalter nicht wählbar');
  assert.doesNotMatch(html, /d:wb/, 'Wallbox nur als Wallbox');
  el('ems-fuse-on').checked = true;
  el('ems-fuse-throttle').checked = true;
  el('ems-fuse-amps').value = '40';
  el('ems-fuse-pct').value = '90';
  el('ems-fuse-hold').value = '10';
  el('ems-fuse-restore').value = '5';
  el('ems-fuse-cap0').value = 'measure_current.phase1';
  el('ems-fuse-cap1').value = 'measure_current.phase2';
  el('ems-fuse-cap2').value = 'measure_current.phase3';
  el('ems-fuse-addsel').value = 'd:sauna';
  click('data-ems-fuseadd', '1');
  html = els.get('ems-view-devices').innerHTML;
  assert.match(html, /2\. Sauna/);
  click('data-ems-fuseup', '1');
  html = els.get('ems-view-devices').innerHTML;
  assert.match(html, /1\. Sauna/);
  const f = ctx.window.EmsUi._collect().ems.fuse;
  assert.equal(f.enabled, true);
  assert.equal(f.live, false);
  assert.deepEqual(JSON.parse(JSON.stringify(f.shed)), [{ kind: 'device', id: 'sauna', name: 'Sauna' }, { kind: 'charger', offFlow: null }]);
  click('data-ems-fusedel', '0');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.window.EmsUi._collect().ems.fuse.shed)), [{ kind: 'charger', offFlow: null }]);
});
