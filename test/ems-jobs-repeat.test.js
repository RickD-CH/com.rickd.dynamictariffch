'use strict';

// Wiederkehrende Aufträge: einmalig, täglich, Mo bis Fr, Sa und So.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  stepJob, nextDeadline, rollJob,
} = require('../lib/ems/planner/jobs');
const { JobStore } = require('../lib/ems/JobStore');
const { EmsRunner } = require('../lib/ems/EmsRunner');
const { ShadowLog } = require('../lib/ems/ShadowLog');
const { PriceFeed } = require('../lib/ems/PriceFeed');
const { PvFeed } = require('../lib/ems/PvFeed');
const { EmsController } = require('../lib/ems/EmsController');
const { normalizeConfig } = require('../lib/ems/Config');
const { fromLocal } = require('../lib/time');

const TZ = 'Europe/Zurich';
const Q = 15 * 60 * 1000;
const H = 3600 * 1000;
// Dienstag, 10.11.2026
const day0 = fromLocal(2026, 11, 10, 0, 0).getTime();
const at = (h, m = 0) => day0 + (h * 60 + m) * 60 * 1000;
const local = (d, h, m = 0) => fromLocal(2026, 11, d, h, m).getTime();

/** Nachts 10 Rp., tagsüber 25 Rp. (7 Tage ab Dienstag). */
function slotList() {
  const out = [];
  for (let i = 0; i < 96 * 7; i++) {
    const h = (i % 96) / 4;
    out.push({ start: day0 + i * Q, end: day0 + (i + 1) * Q, price: h < 5 ? 10 : 25 });
  }
  return out;
}
const mem = () => {
  const m = new Map(); return { get: (k) => m.get(k), set: (k, v) => m.set(k, JSON.parse(JSON.stringify(v))) };
};

test('nextDeadline: einmalig heute oder morgen; Mo bis Fr springt übers Wochenende; Sa und So; täglich', () => {
  assert.equal(nextDeadline({ time: '07:00', afterMs: at(6), tz: TZ }), at(7));
  assert.equal(nextDeadline({ time: '07:00', afterMs: at(8), tz: TZ }), at(31));
  const fri = local(13, 20);
  assert.equal(nextDeadline({
    time: '06:00', repeat: 'weekdays', afterMs: fri, tz: TZ,
  }), local(16, 6), 'Freitagabend: nächste Frist Montag');
  assert.equal(nextDeadline({
    time: '09:00', repeat: 'weekend', afterMs: at(12), tz: TZ,
  }), local(14, 9), 'Dienstag: nächste Frist Samstag');
  assert.equal(nextDeadline({
    time: '06:00', repeat: 'daily', afterMs: at(6), tz: TZ,
  }), at(30), 'genau zur Frist: die nächste');
  assert.equal(nextDeadline({ time: 'kaputt', afterMs: at(6), tz: TZ }), null);
});

test('rollJob: einmalig bleibt null; wiederkehrend nächste Frist, frühestens ab alter Frist und höchstens 24 h davor', () => {
  const base = {
    id: 'dry', kind: 'consumer', time: '05:00', deadline: at(5), need: 4, ran: [at(1)], runningQ: at(1, 15),
  };
  assert.equal(rollJob({ ...base, repeat: 'once' }, at(3), TZ), null);
  assert.equal(rollJob(base, at(3), TZ), null, 'ohne Angabe = einmalig (alte Aufträge)');
  const d = rollJob({ ...base, repeat: 'daily' }, at(3), TZ);
  assert.equal(d.deadline, at(29));
  assert.equal(d.from, at(5), 'nicht vor der alten Frist');
  assert.deepEqual(d.ran, []);
  assert.equal(d.runningQ, null);
  const fri = { ...base, deadline: local(13, 5), repeat: 'weekdays' };
  const mon = rollJob(fri, local(13, 5), TZ);
  assert.equal(mon.deadline, local(16, 5));
  assert.equal(mon.from, local(15, 5), 'erst 24 h vor Montag, nicht am Wochenende');
});

test('stepJob: plant erst ab «from» (läuft vorher nicht, obwohl es günstig wäre)', () => {
  const job = {
    id: 'dry', kind: 'consumer', time: '05:00', deadline: at(29), from: at(5), need: 4, ran: [], runningQ: null, contiguous: true,
  };
  const r = stepJob({ job, slots: slotList(), nowMs: at(3) });
  assert.equal(r.wantOn, false);
  assert.ok(r.starts.every((t) => t >= at(24)), 'die nächste Nacht');
});

// ---------------------------------------------------------------- Runner: erledigt → nächste Frist

function setup(jobs) {
  const slots = slotList().map((s) => ({ start: new Date(s.start), end: new Date(s.end), integrated: s.price / 100 }));
  const priceStore = { range: (a, b) => slots.filter((s) => s.start >= a && s.start < b), value: (s) => s.integrated };
  const state = { on: new Map() };
  const config = normalizeConfig({
    enabled: true, devices: { meter: { id: 'm' } }, charger: { id: 'wb' }, consumers: [{ id: 'dry', name: 'Entfeuchter', mode: 'full' }],
  });
  const js = new JobStore(mem());
  for (const j of jobs) js.put(j);
  const runner = new EmsRunner({
    getConfig: () => config,
    prices: new PriceFeed(() => ({ priceStore })),
    pv: new PvFeed(null, () => {}, { get: async () => ({ slots: [], stale: true }) }),
    inputs: {
      chargerInputs: async () => ({
        gridW: 300, houseW: 500, pvW: 0, batterySoc: 50, batteryW: 0, chargerRead: true, chargerConnected: false, chargerPowerW: 0, chargerPhases: 3, other: null,
      }),
      consumerStates: async (ids) => new Map(ids.map((id) => [id, { actualOn: state.on.get(id) || false, powerW: 0, available: true }])),
    },
    actuators: { charger: async (id, cmd) => ({ cmd: cmd.type }), consumer: async (id, on) => ({ cmd: on ? 'on' : 'off' }) },
    jobs: js,
    shadowLog: new ShadowLog(mem()),
    store: mem(),
    tz: TZ,
  });
  return { runner, js };
}

test('Runner: täglicher Auftrag ist nach dem Lauf nicht weg, sondern wartet auf die nächste Nacht', async () => {
  const { runner, js } = setup([{
    id: 'dry', kind: 'consumer', time: '03:00', amount: 1, deadline: at(3), need: 4, ran: [], runningQ: null, contiguous: true, maxPrice: null, repeat: 'daily',
  }]);
  for (const m of [1, 16, 31, 46]) await runner.tickCharger(at(1, m));
  await runner.tickCharger(at(2, 1));
  const j = js.get('dry');
  assert.ok(j, 'bleibt gespeichert');
  assert.equal(j.deadline, at(27));
  assert.deepEqual(j.ran, []);
  await runner.tickCharger(at(2, 16));
  assert.equal(runner.consumerCurrent[0].wantOn, false, 'läuft heute Nacht nicht nochmals');
  // abgelaufen (App war aus): ebenfalls weiter zur nächsten Frist
  const off = setup([{
    id: 'dry', kind: 'consumer', time: '03:00', amount: 1, deadline: at(3), need: 4, ran: [], runningQ: null, contiguous: true, maxPrice: null, repeat: 'weekdays',
  }]);
  await off.runner.tickCharger(at(12));
  assert.equal(off.js.get('dry').deadline, at(27));
});

// ---------------------------------------------------------------- Controller

function makeController(nowMs) {
  const config = normalizeConfig({
    enabled: true, charger: { id: 'wb' }, consumers: [{ id: 'dry', name: 'Entfeuchter' }], car: { deviceId: 'car', capacityKwh: 60 },
  });
  const settings = new Map([['ems.config', config]]);
  const homey = { settings: { get: (k) => settings.get(k), set: (k, v) => settings.set(k, JSON.parse(JSON.stringify(v))) }, clock: { getTimezone: () => TZ }, drivers: { getDriver: () => ({ getDevices: () => [] }) } };
  const ctrl = new EmsController({ homey, log() {}, error() {} });
  ctrl.runner = {
    prices: { range: (a, b) => slotList().filter((s) => s.start >= a && s.start < b) }, current: null, chargerCurrent: { carSoc: 40 }, pv: { isStale: () => true, slots: [] },
  };
  ctrl.planLog = { since: () => [] };
  ctrl.jobStore = new JobStore({ get: (k) => settings.get(`ems.${k}`), set: (k, v) => settings.set(`ems.${k}`, v) });
  const real = Date.now;
  Date.now = () => nowMs;
  return { ctrl, restore: () => { Date.now = real; } };
}

test('Controller: wiederkehrender Auftrag wird mit Wiederholung gespeichert und angezeigt; Ziel-Ladestand nur einmalig', () => {
  const { ctrl, restore } = makeController(local(13, 20)); // Freitag 20:00
  try {
    const r = ctrl.saveJob({
      id: 'dry', kind: 'consumer', time: '06:00', amount: 1, repeat: 'weekdays',
    });
    const j = r.jobs[0];
    assert.equal(j.repeat, 'weekdays');
    assert.equal(j.deadline, local(16, 6), 'Montag');
    assert.ok(j.from >= local(15, 6), 'geplant erst ab Sonntag 06:00');
    assert.equal(ctrl.jobStore.get('dry').from, local(15, 6));
    assert.throws(() => ctrl.saveJob({
      id: 'charger', kind: 'charger', time: '06:00', targetSoc: 80, repeat: 'daily',
    }), /nur einmalig/);
    const once = ctrl.saveJob({
      id: 'charger', kind: 'charger', time: '06:00', amount: 10, repeat: 'kaputt',
    });
    assert.equal(once.jobs.find((x) => x.id === 'charger').repeat, 'once');
    assert.equal(ctrl.jobStore.get('charger').from, null);
  } finally { restore(); }
});
