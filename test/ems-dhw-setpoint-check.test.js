'use strict';

// Warmwasser-Programm per «Auslöser mit Wert»: nach «zurück auf Normal» prüfen, ob der Soll wirklich zurück ist.

const test = require('node:test');
const assert = require('node:assert/strict');
const { EmsRunner } = require('../lib/ems/EmsRunner');
const { ShadowLog } = require('../lib/ems/ShadowLog');
const { PriceFeed } = require('../lib/ems/PriceFeed');
const { PvFeed } = require('../lib/ems/PvFeed');
const { normalizeConfig } = require('../lib/ems/Config');
const { fromLocal } = require('../lib/time');

const at = (h, m = 0) => fromLocal(2026, 11, 13, h, m, 'Europe/Zurich').getTime();
const cheapAt22 = () => Array.from({ length: 96 }, (_, k) => {
  const t = at(0) + k * 900000;
  return { start: t, end: t + 900000, price: t >= at(22) ? 10 : 30 };
});

function make({ readable = true, live = true } = {}) {
  const config = normalizeConfig({
    enabled: true,
    silent: false,
    devices: { meter: { id: 'm' } },
    charger: { enabled: false },
    sgready: { enabled: false },
    dhw: {
      enabled: true,
      live,
      output: 'trigger',
      setpoint: { programC: 52, delayC: 30, normalC: 48 },
      targetSource: readable ? 'device' : 'manual',
      targetId: 'wp',
      targetCapability: 'soll',
      sensorId: 'ww',
      tempCapability: 'temp',
      cheapHours: 2,
      belowTemp: 45,
      startDelayMin: 0,
      minRunMin: 0,
      stopDelayMin: 0,
      skipPv: false,
    },
  });
  const ref = { temp: 40, soll: 48 };
  const sent = [];
  const runner = new EmsRunner({
    getConfig: () => config,
    prices: new PriceFeed(() => null),
    pv: new PvFeed(null, () => {}),
    inputs: {
      chargerInputs: async () => ({
        gridW: 0, houseW: 300, pvW: 0, batterySoc: null, batteryW: 0, chargerRead: false, chargerConnected: false, chargerPowerW: 0, other: null,
      }),
      consumerStates: async () => new Map(),
      readNumber: async (id, cap) => (cap === 'soll' ? ref.soll : ref.temp),
      readValue: async () => null,
    },
    actuators: {
      charger: async () => ({}),
      program: async () => ({}),
      trigger: async (name, tokens, o) => { sent.push([tokens.kind, tokens.setpoint, o.live]); return { cmd: 'trigger', live: o.live }; },
    },
    shadowLog: new ShadowLog({ get() {}, set() {} }),
    store: null,
  });
  runner.prices = { getSlots: cheapAt22 };
  return { runner, ref, sent };
}

/** Programm starten (Soll 48 -> Gerät meldet 52) und beenden (Warmwasser warm genug): zurück auf Normal wird ausgegeben. */
async function runProgram(runner, ref, sent) {
  await runner.tickCharger(at(22)); // Start: Programm-Soll 52
  assert.deepEqual(sent[0], ['program', 52, true]);
  ref.soll = 52;
  ref.temp = 57;
  await runner.tickCharger(at(22, 1)); // Ende: zurück auf Normal (48)
  assert.deepEqual(sent[1], ['normal', 48, true]);
}

test('Soll-Prüfung: meldet das Gerät den Normalwert wieder, ist es erledigt (ohne Wiederholung)', async () => {
  const { runner, ref, sent } = make();
  await runProgram(runner, ref, sent);
  await runner.tickCharger(at(22, 2));
  assert.equal(runner.dhwCurrent.setpointCheck.state, 'pending', 'Gerät meldet noch 52');
  ref.soll = 48;
  await runner.tickCharger(at(22, 3));
  assert.equal(runner.dhwCurrent.setpointCheck.state, 'ok');
  await runner.tickCharger(at(22, 20));
  assert.equal(runner.dhwCurrent.setpointCheck, null, 'danach keine Prüfung mehr');
  assert.equal(sent.length, 2, 'nichts nochmals gesendet');
});

test('Soll-Prüfung: bleibt der Soll nach 10 Minuten auf 52 °C, wird der Normalwert nochmals ausgegeben (höchstens dreimal), danach «failed»', async () => {
  const { runner, ref, sent } = make();
  await runProgram(runner, ref, sent);
  await runner.tickCharger(at(22, 9));
  assert.equal(sent.length, 2, 'unter 10 Minuten: abwarten');
  await runner.tickCharger(at(22, 12));
  assert.deepEqual(sent[2], ['normal', 48, true]);
  assert.equal(runner.dhwCurrent.setpointCheck.state, 'retry');
  assert.deepEqual([runner.dhwCurrent.setpointCheck.expected, runner.dhwCurrent.setpointCheck.actual], [48, 52]);
  await runner.tickCharger(at(22, 23));
  await runner.tickCharger(at(22, 34));
  assert.equal(sent.length, 5, 'drei Wiederholungen');
  await runner.tickCharger(at(22, 45));
  assert.equal(runner.dhwCurrent.setpointCheck.state, 'failed');
  assert.equal(sent.length, 5, 'danach keine weiteren Befehle');
  ref.soll = 48; // später doch zurück: wieder in Ordnung
  await runner.tickCharger(at(22, 55));
  assert.equal(runner.dhwCurrent.setpointCheck.state, 'ok');
});

test('Soll-Prüfung: ohne lesbaren Soll oder nicht live wird nichts geprüft und nichts wiederholt', async () => {
  const a = make({ readable: false });
  await runProgram(a.runner, a.ref, a.sent);
  await a.runner.tickCharger(at(22, 30));
  assert.equal(a.sent.length, 2);
  assert.ok(!a.runner.dhwCurrent.setpointCheck || a.runner.dhwCurrent.setpointCheck.state === 'pending');
  const b = make({ live: false });
  await b.runner.tickCharger(at(22));
  b.ref.temp = 57;
  await b.runner.tickCharger(at(22, 1));
  await b.runner.tickCharger(at(22, 30));
  assert.ok(b.sent.every((x) => x[2] === false), 'nicht live: nur simuliert');
  assert.equal(b.runner.dhwCurrent.setpointCheck, null);
});

test('Widget: Warnung «Soll nicht zurück» nur bei Wiederholung oder Fehlschlag, nicht bei Abwarten oder Erfolg', () => {
  const { consumersWidget } = require('../lib/WidgetData'); // eslint-disable-line global-require
  const mk = (check) => consumersWidget({
    shadow: {
      deviceExists: true, silent: false, config: { consumers: [], silent: false, dhw: { enabled: true, live: true, flowOn: { id: 'f' } } }, dhw: { on: false, reason: 'x', setpointCheck: check },
    },
    consumerCurrent: [],
    tz: 'Europe/Zurich',
  }).dhw;
  assert.equal(mk(null).setpointWarn, null);
  assert.equal(mk({ state: 'pending', expected: 48, actual: 52, tries: 0 }).setpointWarn, null);
  assert.equal(mk({ state: 'ok', expected: 48, actual: 48, tries: 0 }).setpointWarn, null);
  assert.deepEqual(mk({ state: 'failed', expected: 48, actual: 52, tries: 3 }).setpointWarn, { expected: 48, actual: 52, state: 'failed' });
  assert.equal(mk({ state: 'retry', expected: 48, actual: 52, tries: 1 }).setpointWarn.state, 'retry');
});

test('Widget: Fernbedienung und Tür des Programm-Verbrauchers werden mitgegeben', () => {
  const { consumersWidget } = require('../lib/WidgetData'); // eslint-disable-line global-require
  const w = consumersWidget({
    shadow: { deviceExists: true, silent: false, config: { silent: false, consumers: [{ id: 'g', name: 'GWA', enabled: true, mode: 'program', live: true, program: { durationH: 3, maxWaitH: 4 } }, { id: 'h', name: 'Heizung', enabled: true, mode: 'surplus', live: true }] } },
    consumerCurrent: [{ id: 'g', reason: 'x', blocked: 'state', remote: { value: 'Disabled', ok: false }, door: null }, { id: 'h', remote: { value: 'a', ok: false } }],
    tz: 'Europe/Zurich',
  });
  assert.deepEqual(w.consumers[0].remote, { value: 'Disabled', ok: false });
  assert.equal(w.consumers[0].door, null);
  assert.equal(w.consumers[1].remote, null, 'nur bei Programm-Verbrauchern');
});

// ---------------------------------------------------------------- Statusfeld «Wärmepumpe bereitet Warmwasser»

function makeHeating({ heating = true, live = true } = {}) {
  const config = normalizeConfig({
    enabled: true,
    silent: false,
    devices: { meter: { id: 'm' } },
    charger: { enabled: false },
    sgready: { enabled: false },
    dhw: {
      enabled: true, live, output: 'trigger', setpoint: { programC: 52, delayC: 30, normalC: 48 }, sensorId: 'ww', tempCapability: 'temp', cheapHours: 2, belowTemp: 45, startDelayMin: 0, minRunMin: 0, stopDelayMin: 0, skipPv: false, heatingId: 'wp', heatingCapability: 'bereitung', heatingOkValue: 'true',
    },
  });
  const ref = { temp: 40, heating };
  const sent = [];
  const runner = new EmsRunner({
    getConfig: () => config,
    prices: new PriceFeed(() => null),
    pv: new PvFeed(null, () => {}),
    inputs: {
      chargerInputs: async () => ({
        gridW: 0, houseW: 300, pvW: 0, batterySoc: null, batteryW: 0, chargerRead: false, chargerConnected: false, chargerPowerW: 0, other: null,
      }),
      consumerStates: async () => new Map(),
      readNumber: async () => ref.temp,
      readValue: async (id, cap) => (cap === 'bereitung' ? ref.heating : null),
    },
    actuators: {
      charger: async () => ({}),
      program: async () => ({}),
      trigger: async (name, tokens, o) => { sent.push([tokens.kind, tokens.setpoint, o.live]); return { cmd: 'trigger', live: o.live }; },
    },
    shadowLog: new ShadowLog({ get() {}, set() {} }),
    store: null,
  });
  runner.prices = { getSlots: cheapAt22 };
  return { runner, ref, sent };
}

test('Statusfeld: bereitet die Wärmepumpe schon Warmwasser, startet das Programm nicht (auch nicht von Hand) und sagt warum', async () => {
  const { runner, ref, sent } = makeHeating({ heating: true });
  await runner.tickCharger(at(22)); // günstige Stunde, Warmwasser kalt: würde starten
  assert.equal(sent.length, 0);
  assert.equal(runner.dhwCurrent.on, false);
  assert.equal(runner.dhwCurrent.heating, true);
  assert.match(runner.dhwCurrent.reason, /Wärmepumpe bereitet schon Warmwasser/);
  runner.requestManualStart('dhw');
  await runner.tickCharger(at(22, 1));
  assert.equal(sent.length, 0, 'auch der Handstart ist gesperrt');
  assert.equal(runner.dhwCurrent.on, false);
  // fertig: jetzt geht es
  ref.heating = false;
  await runner.tickCharger(at(22, 20));
  assert.deepEqual(sent[0], ['program', 52, true]);
});

test('Statusfeld: ein laufendes Programm wird nicht abgebrochen, nur weil die Wärmepumpe (durch den angehobenen Soll) jetzt heizt', async () => {
  const { runner, ref, sent } = makeHeating({ heating: false });
  await runner.tickCharger(at(22));
  assert.deepEqual(sent[0], ['program', 52, true]);
  ref.heating = true; // der Soll 52 löst das Heizen aus
  await runner.tickCharger(at(22, 5));
  assert.equal(runner.dhwCurrent.on, true, 'läuft weiter');
  assert.equal(sent.length, 1);
});

test('Statusfeld: nicht eingerichtet oder nicht lesbar blockiert nichts; Verzögerung startet nicht, solange die Wärmepumpe heizt', () => {
  const { decideDelay, normalizeDelay, makeDelayState } = require('../lib/ems/planner/dhwDelay'); // eslint-disable-line global-require
  const cfg = normalizeDelay({ enabled: true });
  const base = (o = {}) => ({
    cfg, st: makeDelayState(), nowMs: at(7), tz: 'Europe/Zurich', tempWW: 43, sollBase: 48, hyst: 4, forecastKwh: 20, priceOn: false, ...o,
  });
  assert.equal(decideDelay(base()).action, 'start');
  assert.equal(decideDelay(base({ hpHeating: false })).action, 'start');
  const r = decideDelay(base({ hpHeating: true }));
  assert.equal(r.action, 'none');
  assert.match(r.reason, /Wärmepumpe bereitet schon Warmwasser/);
});

test('Widget: Start-Knopf nicht möglich, solange die Wärmepumpe selbst Warmwasser bereitet', () => {
  const { consumersWidget } = require('../lib/WidgetData'); // eslint-disable-line global-require
  const mk = (heating) => consumersWidget({
    shadow: {
      deviceExists: true, silent: false, config: { consumers: [], silent: false, dhw: { enabled: true, live: true, flowOn: { id: 'f' } } }, dhw: { on: false, reason: 'x', heating },
    },
    consumerCurrent: [],
    tz: 'Europe/Zurich',
  }).dhw;
  assert.equal(mk(false).canStart, true);
  assert.equal(mk(null).canStart, true, 'unbekannt blockiert nicht');
  assert.equal(mk(true).canStart, false);
  assert.equal(mk(true).heating, true);
});

test('Einstellungen: SG-Ready und Warmwasser-Programm nennen, dass die Wärmepumpe der Chef bleibt (Deutsch und Englisch)', async () => {
  const fs = require('node:fs'); // eslint-disable-line global-require
  const path = require('node:path'); // eslint-disable-line global-require
  const js = fs.readFileSync(path.join(__dirname, '../settings/ems.js'), 'utf8');
  assert.match(js, /Die Wärmepumpe bleibt unabhängig von diesen Einstellungen der Chef/);
  assert.match(js, /The heat pump stays in charge, independent of these settings/);
  assert.equal((js.match(/esc\(S\.hpBoss\)/g) || []).length, 2, 'in beiden Bereichen');
});
