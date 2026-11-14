'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { stepJob } = require('../lib/ems/planner/jobs');
const { JobStore } = require('../lib/ems/JobStore');
const { EmsRunner } = require('../lib/ems/EmsRunner');
const { ShadowLog } = require('../lib/ems/ShadowLog');
const { PriceFeed } = require('../lib/ems/PriceFeed');
const { PvFeed } = require('../lib/ems/PvFeed');
const { PlanLog } = require('../lib/ems/PlanLog');
const { EmsController } = require('../lib/ems/EmsController');
const { normalizeConfig } = require('../lib/ems/Config');
const { fromLocal } = require('../lib/time');

const Q = 15 * 60 * 1000;
const day0 = fromLocal(2026, 11, 10, 0, 0).getTime();
const at = (h, m = 0) => day0 + (h * 60 + m) * 60 * 1000;

/** Nachts 10 Rp., tagsüber 25 Rp. (2 Tage). */
function slotList() {
  const out = [];
  for (let i = 0; i < 192; i++) {
    const h = (i % 96) / 4;
    out.push({ start: day0 + i * Q, end: day0 + (i + 1) * Q, price: h < 5 ? 10 : 25 });
  }
  return out;
}
const mem = () => { const m = new Map(); return { get: (k) => m.get(k), set: (k, v) => m.set(k, JSON.parse(JSON.stringify(v))) }; };
const job = (extra = {}) => ({ id: 'dry', kind: 'consumer', time: '05:00', amount: 1, deadline: at(5), need: 4, ran: [], runningQ: null, contiguous: true, maxPrice: null, createdAt: at(0), ...extra });

// ---------------------------------------------------------------- stepJob

test('stepJob: plant die günstigsten Viertelstunden, läuft in einer gewählten Viertelstunde (am Stück)', () => {
  const idle = stepJob({ job: job(), slots: slotList(), nowMs: at(1, 3) });
  assert.equal(idle.status, 'active');
  assert.equal(idle.wantOn, true, 'ab jetzt der günstigste Block (alles 10 Rp.: der früheste)');
  assert.equal(idle.starts.length, 4);
  assert.equal(idle.starts[0], at(1));
  const later = stepJob({ job: job({ deadline: at(8) }), slots: slotList(), nowMs: at(5, 30) });
  assert.equal(later.wantOn, true, 'nach 5 Uhr 25 Rp., 3 h vor Frist: Block ab jetzt');
});

test('stepJob: abgeschlossene Viertelstunden zählen, begonnene wird zu Ende geführt, Block läuft am Stück weiter', () => {
  let j = job({ ran: [at(1)], runningQ: at(1, 15) });
  const mid = stepJob({ job: j, slots: slotList(), nowMs: at(1, 20) });
  assert.equal(mid.wantOn, true);
  assert.deepEqual(mid.starts, [at(1, 15), at(1, 30), at(1, 45)]);
  assert.equal(mid.remaining, 3);
  // nächste Viertelstunde: die laufende wurde abgeschlossen
  j = { ...j, ran: mid.ran, runningQ: mid.runningQ };
  const next = stepJob({ job: j, slots: slotList(), nowMs: at(1, 31) });
  assert.deepEqual(next.ran, [at(1), at(1, 15)]);
  assert.equal(next.remaining, 2);
  assert.equal(next.wantOn, true, 'plant den Rest neu, der nächste Slot ist günstig');
  const done = stepJob({ job: job({ ran: [at(1), at(1, 15), at(1, 30)], runningQ: at(1, 45) }), slots: slotList(), nowMs: at(2, 1) });
  assert.equal(done.status, 'done');
  assert.equal(done.wantOn, false);
});

test('stepJob: Frist vorbei = abgelaufen, nie Viertelstunden zählen, die nicht liefen', () => {
  assert.equal(stepJob({ job: job({ ran: [at(1)] }), slots: slotList(), nowMs: at(5, 1) }).status, 'expired');
  const never = stepJob({ job: job(), slots: slotList(), nowMs: at(2) });
  assert.deepEqual(never.ran, [], 'nichts lief: nichts zählt');
});

test('JobStore: ersetzt Aufträge desselben Ziels, übersteht Neustart, ignoriert Müll', () => {
  const store = mem();
  const js = new JobStore(store);
  js.put(job());
  js.put(job({ amount: 2 }));
  assert.equal(js.list().length, 1);
  assert.equal(js.get('dry').amount, 2);
  assert.equal(new JobStore(store).list().length, 1);
  assert.equal(new JobStore({ get: () => 'kaputt', set: () => {} }).list().length, 0);
  assert.equal(js.remove('dry'), true);
  assert.equal(js.remove('dry'), false);
  assert.equal(new JobStore(store).list().length, 0);
});

// ---------------------------------------------------------------- Runner

function fakeStore() {
  const slots = slotList().map((s) => ({ start: new Date(s.start), end: new Date(s.end), integrated: s.price / 100 }));
  return { range: (from, to) => slots.filter((s) => s.start >= from && s.start < to), value: (s) => s.integrated };
}

function setup({ jobs = [], consumers = [{ id: 'dry', name: 'Entfeuchter', mode: 'full', live: false }], charger = {}, inputs = {} } = {}) {
  const prices = new PriceFeed(() => ({ priceStore: fakeStore() }));
  const pv = new PvFeed(null, () => {}, { get: async () => ({ slots: [], stale: true }) });
  const state = { consumersOn: new Map(), i: { gridW: 300, houseW: 500, pvW: 0, batterySoc: 50, batteryW: 0, batteryCapacityKwh: 10, chargerRead: true, chargerConnected: true, chargerState: 'plugged_in', chargerPowerW: 0, chargerPhases: 3, chargeNow: false, other: null, ...inputs } };
  const calls = { charger: [], consumer: [] };
  const fakeInputs = {
    battery: async () => ({ soc: 50, capacityKwh: 10, error: null }),
    compareBatteryPlan: async () => null,
    chargerInputs: async () => state.i,
    consumerStates: async (ids) => new Map(ids.map((id) => [id, { actualOn: state.consumersOn.get(id) || false, powerW: 0, available: true }])),
  };
  const actuators = {
    charger: async (id, cmd, o) => { calls.charger.push({ id, cmd, live: o.live }); return { cmd: cmd.type, live: o.live }; },
    consumer: async (id, on, o) => { calls.consumer.push({ id, on, live: o.live }); if (o.live) state.consumersOn.set(id, on); return { cmd: on ? 'on' : 'off', live: o.live }; },
  };
  const config = normalizeConfig({ enabled: true, devices: { meter: { id: 'm' } }, charger: { id: 'wb', live: false, ...charger }, consumers });
  const js = new JobStore(mem());
  for (const j of jobs) js.put(j);
  const planLog = new PlanLog(mem());
  const runner = new EmsRunner({
    getConfig: () => config, prices, pv, inputs: fakeInputs, actuators, jobs: js, planLog,
    shadowLog: new ShadowLog(mem()), chargerLog: new ShadowLog(mem(), 'Europe/Zurich', 'charger'), store: mem(),
  });
  return { runner, js, calls, state, planLog };
}

test('Runner: Verbraucher-Auftrag schaltet in der günstigen Viertelstunde ein (Testbetrieb: nur simuliert), danach wieder normal', async () => {
  const { runner, js, calls } = setup({ jobs: [job({ time: '03:00', deadline: at(3), contiguous: true, need: 4 })] });
  await runner.tickCharger(at(1, 1));
  assert.deepEqual(calls.consumer.map((c) => [c.on, c.live]), [[true, false]], 'Befehl wird im Testbetrieb nicht live gesendet');
  assert.equal(runner.consumerCurrent[0].wantOn, true);
  assert.match(runner.consumerCurrent[0].reason, /Auftrag/);
  assert.equal(js.get('dry').runningQ, at(1));
  // vier Viertelstunden später ist der Auftrag erledigt und entfernt
  for (const m of [16, 31, 46]) await runner.tickCharger(at(1, m));
  await runner.tickCharger(at(2, 1));
  assert.equal(js.get('dry'), null, 'erledigter Auftrag verschwindet');
  assert.equal(calls.consumer.some((c) => c.on === false), true, 'nach dem Auftrag geht das Gerät wieder aus (normale Regel)');
});

test('Runner: Auftrag erzwingt EIN nur im Slot, nicht davor', async () => {
  const { runner, calls } = setup({ jobs: [job({ time: '03:00', deadline: at(3), need: 4 })] });
  await runner.tickCharger(at(0, 1)); // 00:01: heute Nacht ist alles 10 Rp. - der frühste Block beginnt sofort
  assert.equal(calls.consumer.length, 1);
  const late = setup({ jobs: [job({ deadline: at(3), need: 4, contiguous: true })] });
  late.runner.getConfig().consumers[0].enabled = true;
  await late.runner.tickCharger(at(6)); // nach der Frist
  assert.equal(late.js.get('dry'), null, 'abgelaufener Auftrag wird entfernt');
  assert.equal(late.calls.consumer.length, 0);
});

test('Runner: Wallbox-Auftrag lädt mit voller Leistung (Testbetrieb simuliert), zählt nur mit angestecktem Auto', async () => {
  const j = { id: 'charger', kind: 'charger', time: '03:00', amount: 5, deadline: at(3), need: 2, ran: [], runningQ: null, contiguous: false, maxPrice: null, createdAt: at(0) };
  const connected = setup({ jobs: [j] });
  await connected.runner.tickCharger(at(1, 1));
  assert.equal(connected.runner.chargerCurrent.mine.mode, 'instant_ev');
  assert.match(connected.runner.chargerCurrent.mine.reason, /Auftrag/);
  assert.equal(connected.js.get('charger').runningQ, at(1));
  const away = setup({ jobs: [j], inputs: { chargerConnected: false } });
  await away.runner.tickCharger(at(1, 1));
  assert.notEqual(away.runner.chargerCurrent.mine.mode, 'instant_ev', 'kein Auto: kein Laden');
  assert.equal(away.js.get('charger').runningQ, null, 'zählt nicht als gelaufen');
});

test('Runner: der Plan-Verlauf zeigt den Auftragslauf (Wallbox-Modus instant_ev)', async () => {
  const j = { id: 'charger', kind: 'charger', time: '03:00', amount: 5, deadline: at(3), need: 2, ran: [], runningQ: null, contiguous: false, maxPrice: null, createdAt: at(0) };
  const { runner, planLog } = setup({ jobs: [j] });
  await runner.tickCharger(at(1, 1));
  assert.equal(planLog.entries[0].c, 'instant_ev');
});

// ---------------------------------------------------------------- Controller: speichern, auflisten, löschen

function makeController(nowMs = at(22)) {
  const config = normalizeConfig({ enabled: true, charger: { id: 'wb' }, consumers: [{ id: 'dry', name: 'Entfeuchter' }] });
  const settings = new Map([['ems.config', config]]);
  const homey = { settings: { get: (k) => settings.get(k), set: (k, v) => settings.set(k, JSON.parse(JSON.stringify(v))) }, clock: { getTimezone: () => 'Europe/Zurich' }, drivers: { getDriver: () => ({ getDevices: () => [] }) } };
  const logs = [];
  const ctrl = new EmsController({ homey, log: (m) => logs.push(m), error() {} });
  ctrl.runner = { prices: { range: (a, b) => slotList().filter((s) => s.start >= a && s.start < b) }, current: null, pv: { isStale: () => true, slots: [] } };
  ctrl.planLog = { since: () => [] };
  ctrl.jobStore = new JobStore({ get: (k) => settings.get('ems.' + k), set: (k, v) => settings.set('ems.' + k, v) });
  const real = Date.now;
  Date.now = () => nowMs;
  return { ctrl, restore: () => { Date.now = real; }, logs };
}

test('Controller: Auftrag speichern, auflisten, im Plan zeigen, löschen', () => {
  const { ctrl, restore } = makeController();
  try {
    const saved = ctrl.saveJob({ id: 'charger', kind: 'charger', time: '07:00', amount: 20 });
    assert.equal(saved.jobs.length, 1);
    const j = saved.jobs[0];
    assert.equal(j.id, 'charger');
    assert.equal(j.status, 'active');
    assert.equal(j.need, 8);
    assert.equal(j.deadline, at(31));
    assert.equal(j.feasible, true);
    assert.ok(j.from >= at(24) && j.to <= at(29));
    // gleiches Ziel ersetzt
    assert.equal(ctrl.saveJob({ id: 'charger', kind: 'charger', time: '07:00', amount: 10 }).jobs.length, 1);
    ctrl.saveJob({ id: 'dry', kind: 'consumer', time: '06:00', amount: 2, contiguous: true });
    assert.equal(ctrl.listJobs().jobs.length, 2);
    assert.equal(ctrl.listJobs().jobs[1].name, 'Entfeuchter');
    // Plan: aktive Aufträge erscheinen als Zeilen (nicht als Vorschau)
    const rows = ctrl.getPlan().days.flatMap((d) => d.rows).filter((r) => r.kind === 'job');
    assert.equal(rows.length, 4, '2 Aufträge x 2 Tage');
    assert.ok(rows.every((r) => r.preview === false));
    assert.equal(ctrl.deleteJob('charger').jobs.length, 1);
    assert.equal(ctrl.deleteJob('gibtsnicht').jobs.length, 1);
  } finally { restore(); }
});

test('Controller: ungültige Aufträge werden abgelehnt, fehlende Preise nicht (neu planen, sobald sie da sind)', () => {
  const { ctrl, restore } = makeController();
  try {
    assert.throws(() => ctrl.saveJob({ id: 'charger', kind: 'charger', time: '07:00', amount: 0 }), /Menge/);
    assert.throws(() => ctrl.saveJob({ id: 'charger', kind: 'charger', time: 'abc', amount: 5 }), /Uhrzeit/);
    assert.throws(() => ctrl.saveJob({ id: 'unbekannt', kind: 'consumer', time: '07:00', amount: 1 }), /Gerät/);
    // Frist weit in der Zukunft hinter den bekannten Preisen: wird gespeichert, ist aber noch nicht planbar
    const r = ctrl.saveJob({ id: 'dry', kind: 'consumer', time: '23:00', amount: 40, contiguous: false });
    assert.equal(r.jobs[0].feasible, false);
    assert.equal(r.jobs[0].reason, 'too_short');
  } finally { restore(); }
});

// ---------------------------------------------------------------- Rechenintervall

test('Rechenintervall: Konfiguration nimmt nur erlaubte Werte, Standard automatisch', () => {
  assert.equal(normalizeConfig({}).refreshS, 0);
  for (const v of [15, 30, 60, 300]) assert.equal(normalizeConfig({ refreshS: v }).refreshS, v);
  for (const v of [1, 7, 999, -5, 'abc', null]) assert.equal(normalizeConfig({ refreshS: v }).refreshS, 0);
});

test('Rechenintervall: automatisch 15 s mit Auto, 30 s mit Verbrauchern, 5 min sonst; fest = immer der gewählte Wert', async () => {
  const auto = setup();
  assert.equal(await auto.runner.tickCharger(at(10)), 15000, 'Auto angesteckt');
  const idle = setup({ inputs: { chargerConnected: false } });
  assert.equal(await idle.runner.tickCharger(at(10)), 30000, 'Verbraucher aktiv');
  const none = setup({ inputs: { chargerConnected: false }, consumers: [] });
  assert.equal(await none.runner.tickCharger(at(10)), 300000, 'nichts zu tun');
  for (const s of [15, 30, 60, 300]) {
    const fixed = setup({ inputs: { chargerConnected: false }, consumers: [] });
    fixed.runner.getConfig().refreshS = s;
    assert.equal(await fixed.runner.tickCharger(at(10)), s * 1000);
    const withCar = setup();
    withCar.runner.getConfig().refreshS = s;
    assert.equal(await withCar.runner.tickCharger(at(10)), s * 1000, 'fest gilt auch mit Auto');
  }
});

test('Auftrag und Überschuss: gelaufene Viertelstunden (auch wegen Überschuss) zählen und werden nicht nochmals eingeplant', () => {
  // vier Viertelstunden nötig, nicht am Stück; die zwei günstigsten (1:00, 1:15) sind schon gelaufen (z. B. bei Überschuss)
  const j = job({ contiguous: false, need: 4, ran: [at(1), at(1, 15)] });
  const r = stepJob({ job: j, slots: slotList(), nowMs: at(1, 31) });
  assert.equal(r.status, 'active');
  assert.equal(r.remaining, 2, 'nur noch 2 von 4 fehlen');
  assert.equal(r.starts.length, 2, 'es werden nur 2 neue Viertelstunden geplant');
  assert.equal(r.starts.includes(at(1)) || r.starts.includes(at(1, 15)), false, 'schon gelaufene werden nicht nochmals gewählt');
  const done = stepJob({ job: job({ need: 2, ran: [at(1), at(1, 15)] }), slots: slotList(), nowMs: at(1, 31) });
  assert.equal(done.status, 'done', 'Mindestlaufzeit allein durch Überschuss erreicht');
});

test('Runner: _countJobQuarter zählt die laufende Viertelstunde einmal, nicht vor dem Beginn und nicht nach der Frist', () => {
  const { runner, js } = setup({ jobs: [job({ time: '05:00', deadline: at(5), contiguous: false, need: 8, from: at(0) })] });
  runner._countJobQuarter('dry', at(1, 5));
  runner._countJobQuarter('dry', at(1, 9));
  assert.deepEqual(js.get('dry').ran, [at(1)], 'dieselbe Viertelstunde nur einmal');
  runner._countJobQuarter('dry', at(1, 20));
  assert.deepEqual(js.get('dry').ran, [at(1), at(1, 15)]);
  runner._countJobQuarter('dry', at(5, 10));
  assert.equal(js.get('dry').ran.length, 2, 'nach der Frist nicht mehr');
  runner._countJobQuarter('gibt-es-nicht', at(1, 5));
});

test('Runner: Überschuss-Verbraucher nach Priorität - nur einer startet pro Messung, der untere geht zuerst aus', async () => {
  const cons = [
    { id: 'a', name: 'Oben', mode: 'surplus', live: false, startSustainS: 0, stopGraceS: 0, minOffMin: 0, minRunMin: 0, minSurplusW: 300, useForecastGate: false },
    { id: 'b', name: 'Unten', mode: 'surplus', live: false, startSustainS: 0, stopGraceS: 0, minOffMin: 0, minRunMin: 0, minSurplusW: 300, useForecastGate: false },
  ];
  const { runner, state } = setup({ consumers: cons });
  Object.assign(state.i, { gridW: -1500, pvW: 4000, batterySoc: 99, batteryW: 0 });
  await runner.tickCharger(at(12));
  const row = (id) => runner.consumerCurrent.find((c) => c.id === id);
  assert.equal(row('a').isOn, true, 'der obere startet');
  assert.equal(row('b').isOn, false, 'der untere wartet (nicht gleichzeitig)');
  assert.match(row('b').reason, /wartet: ein anderer Verbraucher ist gerade gestartet/);
  await runner.tickCharger(at(12, 1));
  assert.equal(row('b').isOn, false, 'auch 60 s später noch nicht (Messung soll erst zeigen, was übrig ist)');
  await runner.tickCharger(at(12, 3));
  assert.equal(row('b').isOn, true, 'nach der Beruhigungszeit startet der zweite');
  // Überschuss fehlt: der untere geht zuerst aus, der obere bleibt in diesem Lauf an
  Object.assign(state.i, { gridW: 800, pvW: 500 });
  await runner.tickCharger(at(12, 10));
  assert.equal(row('b').isOn, false, 'unten geht zuerst aus');
  assert.equal(row('a').isOn, true, 'oben bleibt vorerst an');
  await runner.tickCharger(at(12, 11));
  assert.equal(row('a').isOn, false, 'danach geht auch der obere aus');
});
