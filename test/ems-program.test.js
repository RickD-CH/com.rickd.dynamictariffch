'use strict';

// Verbraucher-Typ «Programm starten»: ein Start-Befehl statt Dauerschalten (Geschirrspüler, Waschmaschine).

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProgram, decideProgram } = require('../lib/ems/planner/program');
const { fromLocal } = require('../lib/time');

const TZ = 'Europe/Zurich';
const at = (h, m = 0) => fromLocal(2026, 11, 13, h, m).getTime();
const Q = 15 * 60 * 1000;

function slots(from, to, priceAt) {
  const out = [];
  for (let t = from; t < to; t += Q) out.push({ start: t, end: t + Q, price: priceAt(t) });
  return out;
}

test('normalizeProgram: Grenzen und Standardwerte, ungültige Fensterzeit fällt zurück', () => {
  const p = normalizeProgram({
    maxWaitH: 99, durationH: 0, minSurplusW: -5, windowFrom: 'kaputt',
  });
  assert.equal(p.maxWaitH, 12);
  assert.equal(p.durationH, 0.5);
  assert.equal(p.minSurplusW, 0);
  assert.equal(p.windowFrom, '18:00');
  assert.equal(normalizeProgram({}).enabled, false);
});

test('Fernbedienung nicht aktiv: nie starten, auch nicht bei PV-Überschuss oder Fristende', () => {
  const p = normalizeProgram({ remoteCapability: 'measure_remoteControl', remoteOkValue: 'Enabled' });
  const st = {};
  const r = decideProgram({
    cfg: p, st, remoteValue: 'Disabled', doorValue: null, exportW: 5000, slots: [], nowMs: at(19), tz: TZ,
  });
  assert.equal(r.start, false);
  assert.match(r.reason, /Fernbedienung/);
  assert.equal(st.programStartedAt, null);
});

test('Tür offen (wenn ein Türsensor gewählt ist): nicht starten', () => {
  const p = normalizeProgram({ doorCapability: 'measure_doorState', doorOkValue: 'Closed' });
  const r = decideProgram({
    cfg: p, st: {}, remoteValue: null, doorValue: 'Open', exportW: 5000, slots: [], nowMs: at(19), tz: TZ,
  });
  assert.equal(r.start, false);
  assert.match(r.reason, /Tür offen/);
});

test('PV-Überschuss: erst nach startSustainS am Stück, auch ausserhalb des Zeitfensters', () => {
  const p = normalizeProgram({ minSurplusW: 2000, startSustainS: 300, windowFrom: '18:00' });
  const st = {};
  let r = decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 2200, slots: [], nowMs: at(11), tz: TZ,
  });
  assert.equal(r.start, false, 'gerade erst genug - noch nicht 5 Minuten');
  r = decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 2200, slots: [], nowMs: at(11) + 301000, tz: TZ,
  });
  assert.equal(r.start, true);
  assert.match(r.reason, /PV-Überschuss/);
});

test('Überschuss fällt zwischenzeitlich weg: Uhr beginnt neu', () => {
  const p = normalizeProgram({ minSurplusW: 2000, startSustainS: 300 });
  const st = {};
  decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 2200, slots: [], nowMs: at(11), tz: TZ,
  });
  decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 100, slots: [], nowMs: at(11) + 120000, tz: TZ,
  });
  const r = decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 2200, slots: [], nowMs: at(11) + 301000, tz: TZ,
  });
  assert.equal(r.start, false, 'okSince wurde zurückgesetzt, erst wieder 5 Minuten nötig');
});

test('Vor dem Zeitfenster: warten, auch ohne PV und ohne Preise', () => {
  const p = normalizeProgram({ windowFrom: '18:00', maxWaitH: 4 });
  const r = decideProgram({
    cfg: p, st: {}, remoteValue: null, doorValue: null, exportW: 0, slots: [], nowMs: at(12), tz: TZ,
  });
  assert.equal(r.start, false);
  assert.match(r.reason, /Zeitfenster ab 18:00/);
});

test('Im Zeitfenster: startet in der günstigsten Viertelstunde bis zur Frist', () => {
  const p = normalizeProgram({ windowFrom: '18:00', maxWaitH: 4 });
  const all = slots(at(18), at(22), (t) => (t === at(20, 30) ? 8 : 25));
  let r = decideProgram({
    cfg: p, st: {}, remoteValue: null, doorValue: null, exportW: 0, slots: all, nowMs: at(18), tz: TZ,
  });
  assert.equal(r.start, false, 'die günstigste Viertelstunde kommt erst um 20:30');
  const st2 = {};
  r = decideProgram({
    cfg: p, st: st2, remoteValue: null, doorValue: null, exportW: 0, slots: all, nowMs: at(20, 30), tz: TZ,
  });
  assert.equal(r.start, true);
  assert.match(r.reason, /günstigster Moment/);
  assert.equal(st2.programStartedAt, at(20, 30));
});

test('Frist erreicht (Fensterende): startet als Sicherheitsnetz, egal zu welchem Preis', () => {
  const p = normalizeProgram({ windowFrom: '18:00', maxWaitH: 4 });
  const all = slots(at(18), at(23), () => 45); // überall teuer
  const r = decideProgram({
    cfg: p, st: {}, remoteValue: null, doorValue: null, exportW: 0, slots: all, nowMs: at(22), tz: TZ,
  });
  assert.equal(r.start, true);
  assert.match(r.reason, /maximale Wartezeit/);
});

test('Nach dem Start: an diesem Tag nicht nochmals, auch nicht bei neuem PV-Überschuss', () => {
  const p = normalizeProgram({ minSurplusW: 2000, startSustainS: 0 });
  const st = {};
  const first = decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 3000, slots: [], nowMs: at(11), tz: TZ,
  });
  assert.equal(first.start, true);
  const second = decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 3000, slots: [], nowMs: at(11) + 60000, tz: TZ,
  });
  assert.equal(second.start, false);
  assert.match(second.reason, /schon gestartet/);
});

test('Neuer Tag setzt den Zähler zurück', () => {
  const p = normalizeProgram({ minSurplusW: 2000, startSustainS: 0 });
  const st = {};
  decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 3000, slots: [], nowMs: at(11), tz: TZ,
  });
  assert.ok(st.programStartedAt);
  const tomorrow = at(11) + 24 * 3600 * 1000;
  const r = decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 3000, slots: [], nowMs: tomorrow, tz: TZ,
  });
  assert.equal(r.start, true);
});

// ---------------------------------------------------------------- Runner (Geräte lesen und schalten)

const { normalizeConfig } = require('../lib/ems/Config');
const { EmsRunner } = require('../lib/ems/EmsRunner');
const { ShadowLog } = require('../lib/ems/ShadowLog');
const { PriceFeed } = require('../lib/ems/PriceFeed');
const { PvFeed } = require('../lib/ems/PvFeed');

function makeRunner({
  remote = 'Enabled', door = 'Closed', gridW = -2500, batteryW = 0,
} = {}) {
  const config = normalizeConfig({
    enabled: true,
    silent: false,
    devices: { meter: { id: 'm' } },
    charger: { enabled: false },
    consumers: [{
      id: 'gwa',
      name: 'Geschirrspüler',
      mode: 'program',
      live: true,
      program: {
        enabled: true,
        minSurplusW: 2000,
        startSustainS: 0,
        windowFrom: '18:00',
        maxWaitH: 4,
        remoteCapability: 'measure_remoteControl',
        remoteOkValue: 'Enabled',
        doorCapability: 'measure_doorState',
        doorOkValue: 'Closed',
      },
    }],
  });
  const started = [];
  const runner = new EmsRunner({
    getConfig: () => config,
    prices: new PriceFeed(() => null),
    pv: new PvFeed(null, () => {}, { get: async () => ({ slots: [], stale: true }) }),
    inputs: {
      chargerInputs: async () => ({
        gridW, houseW: 300, pvW: 3000, batterySoc: null, batteryW, chargerRead: false, chargerConnected: false, chargerPowerW: 0, other: null,
      }),
      consumerStates: async (ids) => new Map(ids.map((id) => [id, {
        actualOn: false, powerW: 0, available: true, values: {}, raw: { measure_remoteControl: remote, measure_doorState: door },
      }])),
    },
    actuators: {
      charger: async () => ({}),
      program: async (deviceId, capability, value, { live }) => {
        started.push({
          deviceId, capability, value, live,
        }); return {
          cmd: 'program', capability, value, live,
        };
      },
    },
    shadowLog: new ShadowLog({ get() {}, set() {} }),
    store: null,
  });
  return { runner, started, config };
}

test('Runner: Fernbedienung aus - liest den echten Zustand, startet nicht, auch mit Überschuss', async () => {
  const { runner, started } = makeRunner({ remote: 'Disabled' });
  await runner.tickCharger(at(19));
  assert.equal(started.length, 0);
  assert.match(runner.consumerCurrent[0].reason, /Fernbedienung nicht aktiv \(Disabled\)/);
});

test('Runner: Fernbedienung an, Tür zu, genug Überschuss - startet live über die Enum-Capability', async () => {
  const { runner, started } = makeRunner({ remote: 'Enabled', door: 'Closed', gridW: -2500 });
  await runner.tickCharger(at(19));
  assert.equal(started.length, 1);
  assert.deepEqual(started[0], {
    deviceId: 'gwa', capability: 'dishwasher_execute_command', value: 'START', live: true,
  });
  assert.equal(runner.consumerCurrent[0].isOn, true);
  // Zweiter Lauf am selben Tag: nicht nochmals
  await runner.tickCharger(at(19) + 60000);
  assert.equal(started.length, 1, 'kein zweiter Start am selben Tag');
});

test('Runner: Tür offen - nicht starten', async () => {
  const { runner, started } = makeRunner({ door: 'Open' });
  await runner.tickCharger(at(19));
  assert.equal(started.length, 0);
  assert.match(runner.consumerCurrent[0].reason, /Tür offen \(Open\)/);
});
