'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { planJob } = require('../lib/ems/planner/jobs');
const { EmsController } = require('../lib/ems/EmsController');
const { fromLocal } = require('../lib/time');
const { normalizeConfig } = require('../lib/ems/Config');

const Q = 15 * 60 * 1000;
const TZ = 'Europe/Zurich';
const day0 = fromLocal(2026, 11, 10, 0, 0).getTime();
const at = (h, m = 0) => day0 + (h * 60 + m) * 60 * 1000;

/** 2 Tage Preise ab Mitternacht: nachts 10 Rp., sonst 25, abends 40. */
function slots(from = day0, n = 192) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const h = (i % 96) / 4;
    out.push({ start: from + i * Q, end: from + (i + 1) * Q, price: h < 5 ? 10 : (h >= 17 && h < 21 ? 40 : 25) });
  }
  return out;
}

// ---------------------------------------------------------------- planJob

test('planJob: wählt die günstigsten Viertelstunden bis zur Frist', () => {
  const r = planJob({ slots: slots(), nowMs: at(22), deadlineMs: at(31), hours: 2 });
  assert.equal(r.reason, 'ok');
  assert.equal(r.feasible, true);
  assert.equal(r.starts.length, 8);
  assert.ok(r.starts.every((t) => t >= at(24) && t < at(29)), 'alle in der Nacht (10 Rp.)');
  assert.equal(r.avg, 10);
  assert.equal(r.from, at(24));
  assert.equal(r.to, at(26));
});

test('planJob: am Stück = günstigster zusammenhängender Block', () => {
  const r = planJob({ slots: slots(), nowMs: at(8), deadlineMs: at(23), hours: 3, contiguous: true });
  assert.equal(r.reason, 'ok');
  assert.equal(r.starts.length, 12);
  assert.ok(r.starts.every((t, i) => i === 0 || t - r.starts[i - 1] === Q));
  assert.equal(r.avg, 25);
  assert.equal(r.from, at(8), 'bei Gleichstand der frühere Block');
});

test('planJob: Preisgrenze, Frist und fehlende Preise erklären, warum es nicht reicht', () => {
  const tooExp = planJob({ slots: slots(), nowMs: at(8), deadlineMs: at(16), hours: 1, maxPrice: 20 });
  assert.equal(tooExp.reason, 'too_expensive');
  assert.equal(tooExp.feasible, false);
  assert.equal(tooExp.missing, 4);
  const short = planJob({ slots: slots(), nowMs: at(8), deadlineMs: at(8, 30), hours: 2 });
  assert.equal(short.reason, 'too_short');
  assert.equal(short.starts.length, 2);
  assert.equal(short.missing, 6);
  const noPrices = planJob({ slots: slots(day0, 40), nowMs: at(8), deadlineMs: at(30), hours: 4 });
  assert.equal(noPrices.reason, 'prices_missing', 'Preise enden um 10 Uhr, Frist ist morgen');
  const noBlock = planJob({ slots: slots().filter((s) => (s.start / Q) % 3 !== 0), nowMs: at(8), deadlineMs: at(20), hours: 1, contiguous: true });
  assert.equal(noBlock.reason, 'no_block');
  assert.deepEqual(noBlock.starts, []);
  assert.equal(planJob({ slots: slots(), nowMs: at(8), deadlineMs: at(7), hours: 1 }).reason, 'deadline_passed');
  assert.equal(planJob({ slots: slots(), nowMs: at(8), deadlineMs: at(12), hours: 0 }).reason, 'nothing');
});

test('planJob: der laufende Slot zählt, vergangene nicht; kein Slot wird doppelt gewählt', () => {
  const r = planJob({ slots: slots(), nowMs: at(3, 20), deadlineMs: at(5), hours: 1 });
  assert.ok(r.starts.every((t) => t >= at(3, 15)));
  assert.equal(new Set(r.starts).size, r.starts.length);
  const none = planJob({ slots: [], nowMs: at(1), deadlineMs: at(5), hours: 1 });
  assert.equal(none.reason, 'prices_missing');
});

// ---------------------------------------------------------------- Vorschau im Controller

function makeController(cfg = {}, nowMs = at(22)) {
  const config = normalizeConfig({
    enabled: true, charger: { id: 'wb', maxAmps: 16, phases: 3 }, consumers: [{ id: 'dry', name: 'Entfeuchter' }], ...cfg,
  });
  const homey = { settings: { get: (k) => (k === 'ems.config' ? config : undefined), set: () => {} }, clock: { getTimezone: () => TZ }, drivers: { getDriver: () => ({ getDevices: () => [] }) } };
  const ctrl = new EmsController({ homey, log: () => {}, error: () => {} });
  ctrl.runner = { prices: { range: (a, b) => slots().filter((s) => s.start >= a && s.start < b) }, current: null, pv: { isStale: () => true, slots: [] } };
  ctrl.planLog = { since: () => [] };
  const real = Date.now;
  Date.now = () => nowMs;
  return { ctrl, restore: () => { Date.now = real; } };
}

test('Vorschau: Wallbox 20 kWh bis 07:00 - Frist morgen früh, günstigste Viertelstunden in der Nacht, Kosten', () => {
  const { ctrl, restore } = makeController();
  try {
    const r = ctrl.previewPlan({ jobs: [{ id: 'charger', kind: 'charger', time: '07:00', amount: 20, maxPrice: '' }] });
    const j = r.jobResults[0];
    assert.equal(j.kind, 'charger');
    assert.equal(j.deadline, at(31));
    assert.equal(j.powerKw, 11); // 16 A x 3 Phasen x 0.23 kW (gerundet)
    assert.equal(j.reason, 'ok');
    assert.ok(Math.abs(j.hours - 20 / 11) < 0.01);
    assert.equal(j.starts.length, j.need);
    assert.equal(j.avg, 10);
    assert.equal(j.costChf, 2); // 20 kWh x 10 Rp.
    const rows = r.days.flatMap((d) => d.rows).filter((x) => x.kind === 'job');
    assert.equal(rows.length, 2, 'Auftragszeile in beiden Tagen');
    assert.ok(rows[1].cells.some((c) => c.state === 'on' && c.planned === true), 'geplant morgen früh');
    assert.ok(rows[0].cells.every((c) => c.state === null), 'heute Abend nichts');
    assert.equal(r.days.length, 2, 'Preise auch für morgen');
  } finally { restore(); }
});

test('Vorschau: Verbraucher mit Laufzeit am Stück, Höchstpreis, Fehlerfälle', () => {
  const { ctrl, restore } = makeController();
  try {
    const ok = ctrl.previewPlan({ jobs: [{ id: 'dry', kind: 'consumer', time: '07:00', amount: 3, contiguous: true, powerKw: 0.5 }] }).jobResults[0];
    assert.equal(ok.name, 'Entfeuchter');
    assert.equal(ok.reason, 'ok');
    assert.equal(ok.starts.length, 12);
    assert.equal(ok.energyKwh, 1.5);
    assert.equal(ok.costChf, 0.15);
    const exp = ctrl.previewPlan({ jobs: [{ id: 'dry', kind: 'consumer', time: '07:00', amount: 3, maxPrice: 5 }] }).jobResults[0];
    assert.equal(exp.reason, 'too_expensive');
    assert.equal(exp.costChf, null);
    assert.equal(ctrl.previewPlan({ jobs: [{ id: 'dry', kind: 'consumer', time: '07:00', amount: 0 }] }).jobResults[0].error, 'amount');
    assert.equal(ctrl.previewPlan({ jobs: [{ id: 'dry', kind: 'consumer', time: '25:99', amount: 1 }] }).jobResults[0].error, 'time');
    assert.equal(ctrl.previewPlan({ jobs: [] }).jobResults.length, 0);
    assert.equal(ctrl.previewPlan({}).jobResults.length, 0);
    assert.equal(ctrl.previewPlan({ jobs: new Array(9).fill({ id: 'dry', kind: 'consumer', time: '07:00', amount: 1 }) }).jobResults.length, 4, 'höchstens 4 Aufträge');
  } finally { restore(); }
});

test('Vorschau: nichts wird gespeichert oder geschaltet', () => {
  const { ctrl, restore } = makeController();
  let writes = 0;
  ctrl.homey.settings.set = () => { writes += 1; };
  try {
    ctrl.previewPlan({ jobs: [{ id: 'charger', kind: 'charger', time: '07:00', amount: 10 }] });
    assert.equal(writes, 0);
  } finally { restore(); }
});

// ---------------------------------------------------------------- Anzeige

const emsJs = fs.readFileSync(path.join(__dirname, '../settings/ems.js'), 'utf8');

function makeEnv(responses, calls) {
  const els = new Map();
  const handlers = {};
  const el = (id) => {
    if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '', value: '', checked: false, hidden: false, classList: { contains: () => true, toggle: () => {} }, addEventListener: (t, f) => { handlers[`${id}:${t}`] = f; } });
    return els.get(id);
  };
  const ctx = { document: { getElementById: el }, window: {}, setInterval: () => 0, console, Object, Promise, Date, Number, isFinite, String, JSON, Math };
  vm.createContext(ctx);
  vm.runInContext(emsJs, ctx);
  const api = (method, p, body) => {
    calls.push([method, p, body]);
    const r = responses[`${method} ${p}`];
    return Promise.resolve(typeof r === 'function' ? r(body) : r);
  };
  return { ctx, els, handlers, api };
}
const wait = (ms = 15) => new Promise((r) => setTimeout(r, ms));

test('Anzeige: Formular unter dem Plan, Änderung löst die Vorschau aus, Ergebnis und Auftragszeile erscheinen', async () => {
  const { ctrl, restore } = makeController();
  const calls = [];
  const cfg = normalizeConfig({ enabled: true, charger: { id: 'wb' }, consumers: [{ id: 'dry', name: 'Entfeuchter' }] });
  let env;
  try {
    const basePlan = ctrl.getPlan();
    env = makeEnv({
      'GET /ems/shadow': { enabled: true, deviceExists: true, shadow: true, config: cfg, pv: {}, current: null, charger: { current: { live: false, mine: { mode: 'idle', reason: 'x' }, connected: false } } },
      'GET /ems/consumers': { current: [], events: [] },
      'GET /ems/devices': { devices: [] },
      'GET /meters': null,
      'GET /ems/plan': basePlan,
      'POST /ems/plan/preview': (b) => ctrl.previewPlan(b),
    }, calls);
    await env.ctx.window.EmsUi.init(env.api, 'de');
    const before = env.els.get('ems-view-plan').innerHTML;
    assert.match(before, /id="ems-preview-form"/);
    assert.match(before, /VORSCHAU: AUFTRAG PLANEN/);
    assert.match(before, /Energie \(kWh\)/, 'Wallbox: Energie');
    assert.doesNotMatch(before, /Vorschau<\/button>[\s\S]*Läuft von/);
    const fire = (attr, value, extra = {}) => env.handlers['ems-view-plan:change']({ target: { getAttribute: (n) => (n === 'data-ems-draft' ? attr : null), value, ...extra, parentNode: null } });
    fire('amount', '20');
    await wait();
    const post = calls.find((c) => c[1] === '/ems/plan/preview');
    assert.ok(post, 'Vorschau angefragt');
    assert.equal(JSON.stringify(post[2].jobs[0]), JSON.stringify({ id: 'charger', kind: 'charger', time: '07:00', targetSoc: null, amount: 20, powerKw: null, maxPrice: null, contiguous: true }));
    const after = env.els.get('ems-view-plan').innerHTML;
    assert.match(after, /Läuft von|in \d+ Viertelstunden/);
    assert.match(after, /Kosten ca\. 2\.00 CHF/);
    assert.match(after, /Wallbox - Vorschau/, 'Auftragszeile im Plan');
    assert.doesNotMatch(after, /undefined|NaN/);
    // Zurücksetzen
    env.handlers['ems-view-plan:click']({ target: { getAttribute: (n) => (n === 'data-ems-preview' ? 'clear' : null), parentNode: null } });
    assert.doesNotMatch(env.els.get('ems-view-plan').innerHTML, /Wallbox - Vorschau/);
    // Verbraucher wählen: Laufzeit statt Energie
    fire('target', 'dry');
    assert.match(env.els.get('ems-view-plan').innerHTML, /Laufzeit \(h\)/);
    assert.match(env.els.get('ems-view-plan').innerHTML, /am Stück laufen/);
  } finally { restore(); }
});

test('Anzeige: Menge fehlt oder reicht nicht - klare Meldung, kein Absturz', async () => {
  const { ctrl, restore } = makeController();
  const calls = [];
  const cfg = normalizeConfig({ enabled: true, charger: { id: 'wb' } });
  try {
    const env = makeEnv({
      'GET /ems/shadow': { enabled: true, deviceExists: true, shadow: true, config: cfg, pv: {}, current: null, charger: { current: { live: false, mine: { mode: 'idle', reason: 'x' }, connected: false } } },
      'GET /ems/consumers': { current: [], events: [] }, 'GET /ems/devices': { devices: [] }, 'GET /meters': null,
      'GET /ems/plan': ctrl.getPlan(),
      'POST /ems/plan/preview': (b) => ctrl.previewPlan(b),
    }, calls);
    await env.ctx.window.EmsUi.init(env.api, 'de');
    const fire = (attr, value) => env.handlers['ems-view-plan:change']({ target: { getAttribute: (n) => (n === 'data-ems-draft' ? attr : null), value, parentNode: null } });
    fire('time', '07:00');
    await wait();
    assert.match(env.els.get('ems-view-plan').innerHTML, /Menge eingeben/);
    fire('amount', '20');
    await wait();
    fire('maxPrice', '5');
    await wait();
    const html = env.els.get('ems-view-plan').innerHTML;
    assert.match(html, /nicht genug Viertelstunden/);
    assert.match(html, /möglich 0 von 8/);
  } finally { restore(); }
});

test('Anzeige: Übernehmen speichert den Auftrag, die Liste zeigt Stand und Entfernen löscht ihn', async () => {
  const { ctrl, restore } = makeController();
  const calls = [];
  const cfg = normalizeConfig({ enabled: true, charger: { id: 'wb' }, consumers: [{ id: 'dry', name: 'Entfeuchter' }] });
  let jobs = [];
  try {
    const env = makeEnv({
      'GET /ems/shadow': { enabled: true, deviceExists: true, shadow: true, config: cfg, pv: {}, current: null, charger: { current: { live: false, mine: { mode: 'idle', reason: 'x' }, connected: false } } },
      'GET /ems/consumers': { current: [], events: [] }, 'GET /ems/devices': { devices: [] }, 'GET /meters': null,
      'GET /ems/plan': () => ctrl.getPlan(),
      'GET /ems/jobs': () => ({ jobs }),
      'POST /ems/plan/preview': (b) => ctrl.previewPlan(b),
      'POST /ems/jobs': (b) => {
        jobs = [{ id: b.id, kind: b.kind, name: null, time: b.time, amount: b.amount, deadline: at(31), need: 8, done: 0, status: 'active', runningNow: false, from: at(24), to: at(26), feasible: true, reason: 'ok', planned: 8 }];
        return { jobs };
      },
      'DELETE /ems/jobs/charger': () => { jobs = []; return { jobs }; },
    }, calls);
    await env.ctx.window.EmsUi.init(env.api, 'de');
    const change = (attr, value) => env.handlers['ems-view-plan:change']({ target: { getAttribute: (n) => (n === 'data-ems-draft' ? attr : null), value, parentNode: null } });
    const click = (attr, value) => env.handlers['ems-view-plan:click']({ target: { getAttribute: (n) => (n === attr ? value : null), parentNode: null } });
    assert.doesNotMatch(env.els.get('ems-view-plan').innerHTML, /AKTIVE AUFTRÄGE/);
    assert.match(env.els.get('ems-view-plan').innerHTML, />Übernehmen</);
    change('amount', '20');
    await wait();
    click('data-ems-preview', 'save');
    await wait(30);
    const post = calls.find((c) => c[0] === 'POST' && c[1] === '/ems/jobs');
    assert.ok(post, 'Auftrag gespeichert');
    assert.equal(post[2].amount, 20);
    const html = env.els.get('ems-view-plan').innerHTML;
    assert.match(html, /AKTIVE AUFTRÄGE/);
    assert.match(html, /Wallbox - 20 kWh bis/);
    assert.match(html, /geplant 00:00 - 02:00/);
    assert.match(html, /0 \/ 8 Viertelstunden gelaufen/);
    assert.match(html, /Auftrag übernommen/);
    assert.doesNotMatch(html, /undefined|NaN/);
    click('data-ems-jobdel', 'charger');
    await wait(30);
    assert.ok(calls.some((c) => c[0] === 'DELETE' && c[1] === '/ems/jobs/charger'));
    assert.doesNotMatch(env.els.get('ems-view-plan').innerHTML, /AKTIVE AUFTRÄGE/);
  } finally { restore(); }
});
