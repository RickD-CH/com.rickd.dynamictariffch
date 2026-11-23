'use strict';

// Freigabe beim Wechsel auf Silent / «Befehle senden» aus / EMS aus, und Zustände, die einen Neustart überstehen.

const test = require('node:test');
const assert = require('node:assert/strict');
const { EmsRunner } = require('../lib/ems/EmsRunner');
const { EmsController } = require('../lib/ems/EmsController');
const { ShadowLog } = require('../lib/ems/ShadowLog');
const { PriceFeed } = require('../lib/ems/PriceFeed');
const { PvFeed } = require('../lib/ems/PvFeed');
const { normalizeConfig } = require('../lib/ems/Config');
const { fromLocal } = require('../lib/time');

const at = (h, m = 0) => fromLocal(2026, 11, 13, h, m, 'Europe/Zurich').getTime();

function store() {
  const m = new Map();
  return { get: (k) => (m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null), set: (k, v) => m.set(k, JSON.parse(JSON.stringify(v))), m };
}

function makeRunner(cfgOver = {}, st = store()) {
  const cfg = normalizeConfig({
    enabled: true,
    silent: false,
    devices: { meter: { id: 'm' } },
    charger: { enabled: false },
    battery: { deviceId: 'bat', control: { enabled: true, live: true } },
    sgready: { enabled: true, live: true, output: 'flows' },
    dhw: { enabled: true, live: true, output: 'trigger', setpoint: { programC: 52, delayC: 30, normalC: 48 } },
    ...cfgOver,
  });
  const sent = [];
  const runner = new EmsRunner({
    getConfig: () => cfg,
    prices: new PriceFeed(() => null),
    pv: new PvFeed(null, () => {}),
    inputs: {},
    actuators: {
      battery: async (id, cmds, { live }) => { cmds.forEach((c) => sent.push(['battery', c.id, live])); return []; },
      consumer: async (id, on, { live, command }) => { sent.push(['consumer', command, live]); return {}; },
      program: async () => ({}),
      trigger: async (name, tokens, { live }) => { sent.push(['trigger', tokens.kind, tokens.setpoint, live]); return {}; },
    },
    shadowLog: new ShadowLog({ get() {}, set() {} }),
    store: st,
  });
  return { runner, cfg, sent, st };
}

test('Freigabe Batterie: war zuletzt «Halten» gesendet, geht «Normal» live raus; sonst nichts', async () => {
  const { runner, cfg, sent } = makeRunner();
  assert.deepEqual(await runner.releaseAreas(cfg, ['battery']), [], 'nichts gesendet: nichts freizugeben');
  runner.batteryCtl.lastMode = 'hold';
  assert.deepEqual(await runner.releaseAreas(cfg, ['battery']), ['battery']);
  assert.deepEqual(sent, [['battery', 'battery.normal', true]]);
  assert.equal(runner.batteryCtl.lastMode, 'normal');
});

test('Freigabe Warmwasser: läuft das Programm (Soll 52) oder die Verzögerung (Soll 30), geht der Normalwert raus; sonst nichts', async () => {
  const { runner, cfg, sent } = makeRunner();
  assert.deepEqual(await runner.releaseAreas(cfg, ['dhw']), []);
  runner._dhwOn = true;
  runner.dhwState.state = 'dhw';
  assert.deepEqual(await runner.releaseAreas(cfg, ['dhw']), ['dhw']);
  assert.deepEqual(sent[0], ['trigger', 'normal', 48, true]);
  assert.equal(runner._dhwOn, false);
  assert.equal(runner.dhwState.state, 'off');
  // Verzögerung aktiv
  sent.length = 0;
  runner.dhwDelay = { ...runner.dhwDelay, active: true, releaseAt: at(16) };
  assert.deepEqual(await runner.releaseAreas(cfg, ['dhw']), ['dhw']);
  assert.deepEqual(sent[0], ['trigger', 'normal', 48, true]);
  assert.equal(runner.dhwDelay.active, false);
});

test('Freigabe SG-Ready: stand die Wärmepumpe auf Empfehlung, geht Normalbetrieb raus; im Normalbetrieb nichts', async () => {
  const { runner, cfg, sent } = makeRunner();
  assert.deepEqual(await runner.releaseAreas(cfg, ['sgready']), []);
  runner.sgReadyState.state = 'boost';
  runner._sgReadyFlowState = 'boost';
  assert.deepEqual(await runner.releaseAreas(cfg, ['sgready']), ['sgready']);
  assert.deepEqual(sent, [['consumer', 'sgready.normal', true]]);
  assert.equal(runner.sgReadyState.state, 'off');
});

test('Controller: Silent an gibt frei; Silent an, wenn schon Silent, nicht; «Befehle senden» aus und EMS aus ebenfalls; Bereich ohne live nicht', () => {
  const calls = [];
  const f = {
    runner: { releaseAreas: async (cfg, areas) => { calls.push(areas); return []; } },
    app: { log() {}, error() {} },
    _liveAreas: (c) => EmsController.prototype._liveAreas.call(f, c),
  };
  const run = (b, a) => EmsController.prototype._releaseTransitions.call(f, normalizeConfig(b), normalizeConfig(a));
  const live = { enabled: true, silent: false, battery: { control: { enabled: true, live: true } }, sgready: { enabled: true, live: true }, dhw: { enabled: true, live: true } };
  run(live, { ...live, silent: true });
  assert.deepEqual(calls.pop().sort(), ['battery', 'dhw', 'sgready']);
  run({ ...live, silent: true }, { ...live, silent: true });
  assert.equal(calls.length, 0, 'war schon Silent');
  run(live, { ...live, battery: { control: { enabled: true, live: false } } });
  assert.deepEqual(calls.pop(), ['battery']);
  run(live, { ...live, enabled: false });
  assert.deepEqual(calls.pop().sort(), ['battery', 'dhw', 'sgready']);
  run({ ...live, dhw: { enabled: true, live: false } }, { ...live, dhw: { enabled: true, live: false }, silent: true });
  assert.deepEqual(calls.pop().sort(), ['battery', 'sgready'], 'ein Bereich ohne live wird nicht freigegeben');
  run(live, live);
  assert.equal(calls.length, 0, 'keine Änderung: nichts');
});

test('Neustart: Hausanschluss-Schutz (abgeschaltete Geräte, Stufe) und Soll-Prüfung werden aus dem Speicher übernommen', () => {
  const st = store();
  st.set('fuseState', { shed: ['d:sauna'], level: 2, lastShedAt: 12345, liveSeen: true });
  st.set('dhwNormalCheck', { expectC: 48, since: at(22), tries: 1 });
  const { runner } = makeRunner({}, st);
  assert.deepEqual(runner.fuseSt.shed, ['d:sauna']);
  assert.equal(runner.fuseSt.level, 2);
  assert.equal(runner.fuseSt.liveSeen, true);
  assert.deepEqual(runner._dhwNormalCheck, { expectC: 48, since: at(22), tries: 1 });
  // kaputte Einträge werden ignoriert
  const bad = store();
  bad.set('fuseState', { shed: 'x' });
  bad.set('dhwNormalCheck', { expectC: 'a' });
  const r2 = makeRunner({}, bad).runner;
  assert.deepEqual(r2.fuseSt.shed, []);
  assert.equal(r2._dhwNormalCheck, null);
});
