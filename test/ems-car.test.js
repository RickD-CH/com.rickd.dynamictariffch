'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EmsController } = require('../lib/ems/EmsController');
const { Inputs } = require('../lib/ems/Inputs');
const { JobStore } = require('../lib/ems/JobStore');
const { normalizeConfig } = require('../lib/ems/Config');
const { fromLocal } = require('../lib/time');

const Q = 15 * 60 * 1000;
const day0 = fromLocal(2026, 11, 10, 0, 0).getTime();
const at = (h, m = 0) => day0 + (h * 60 + m) * 60 * 1000;

function slotList() {
  const out = [];
  for (let i = 0; i < 192; i++) out.push({ start: day0 + i * Q, end: day0 + (i + 1) * Q, price: (i % 96) < 20 ? 10 : 25 });
  return out;
}

// ---------------------------------------------------------------- Konfiguration und Eingang

test('Config: E-Auto (Gerät, Ladestand-Wert, Batteriegrösse) wird geprüft', () => {
  assert.equal(JSON.stringify(normalizeConfig({}).car), JSON.stringify({ deviceId: '', socCapability: 'measure_battery', capacityKwh: 0 }));
  const c = normalizeConfig({ car: { deviceId: 'tesla', socCapability: 'measure_battery.soc', capacityKwh: 75 } }).car;
  assert.equal(c.deviceId, 'tesla');
  assert.equal(c.capacityKwh, 75);
  assert.equal(normalizeConfig({ car: { capacityKwh: -5 } }).car.capacityKwh, 0);
  assert.equal(normalizeConfig({ car: { capacityKwh: 9999 } }).car.capacityKwh, 300);
});

test('Inputs.chargerInputs: liest den Ladestand des Autos, ohne Auto null', async () => {
  const devices = {
    em: { available: true, capabilitiesObj: { measure_power: { value: -500 } } },
    wb: { available: true, capabilitiesObj: { evcharger_charging_state: { value: 'plugged_in' }, measure_power: { value: 0 } } },
    car: { available: true, capabilitiesObj: { 'measure_battery.soc': { value: 54 } } },
  };
  const inputs = new Inputs({}, () => {});
  inputs._api = async () => ({ devices: { getDevice: async ({ id }) => { if (!devices[id]) throw new Error('nix'); return devices[id]; } } });
  const cfg = normalizeConfig({ devices: { meter: { id: 'em' }, house: { id: 'em' }, inverter: { id: '' } }, charger: { id: 'wb' }, car: { deviceId: 'car', socCapability: 'measure_battery.soc' } });
  assert.equal((await inputs.chargerInputs(cfg)).carSoc, 54);
  const noCar = normalizeConfig({ devices: { meter: { id: 'em' }, house: { id: 'em' } }, charger: { id: 'wb' } });
  assert.equal((await inputs.chargerInputs(noCar)).carSoc, null);
});

// ---------------------------------------------------------------- Aufträge mit Ziel-Ladestand

function makeController({ car = { deviceId: 'car', capacityKwh: 60 }, carSoc = 40, nowMs = at(22) } = {}) {
  const config = normalizeConfig({ enabled: true, charger: { id: 'wb', maxAmps: 16, phases: 3 }, car });
  const settings = new Map([['ems.config', config]]);
  const homey = { settings: { get: (k) => settings.get(k), set: (k, v) => settings.set(k, JSON.parse(JSON.stringify(v))) }, clock: { getTimezone: () => 'Europe/Zurich' }, drivers: { getDriver: () => ({ getDevices: () => [] }) } };
  const ctrl = new EmsController({ homey, log() {}, error() {} });
  ctrl.runner = { prices: { range: (a, b) => slotList().filter((s) => s.start >= a && s.start < b) }, current: null, chargerCurrent: carSoc === undefined ? null : { carSoc }, pv: { isStale: () => true, slots: [] } };
  ctrl.planLog = { since: () => [] };
  ctrl.jobStore = new JobStore({ get: (k) => settings.get('ems.' + k), set: (k, v) => settings.set('ems.' + k, v) });
  const real = Date.now;
  Date.now = () => nowMs;
  return { ctrl, restore: () => { Date.now = real; } };
}

test('Vorschau: Ziel-Ladestand rechnet die Energie aus Ladestand und Batteriegrösse', () => {
  const { ctrl, restore } = makeController();
  try {
    const r = ctrl.previewPlan({ jobs: [{ id: 'charger', kind: 'charger', time: '07:00', targetSoc: 80, amount: 0 }] }).jobResults[0];
    assert.equal(r.error, undefined);
    assert.equal(r.carSoc, 40);
    assert.equal(r.targetSoc, 80);
    assert.equal(r.amountKwh, 24, '40 % von 60 kWh');
    assert.equal(r.energyKwh, 24);
    assert.equal(r.reason, 'ok');
    assert.equal(r.costChf, 2.4, '24 kWh x 10 Rp.');
  } finally { restore(); }
});

test('Vorschau: Ziel-Ladestand - Fehlerfälle erklärt (kein Auto, unbekannter Stand, keine Grösse, schon erreicht)', () => {
  const run = (opts, job) => { const { ctrl, restore } = makeController(opts); try { return ctrl.previewPlan({ jobs: [job] }).jobResults[0]; } finally { restore(); } };
  const job = { id: 'charger', kind: 'charger', time: '07:00', targetSoc: 80 };
  assert.equal(run({ car: { deviceId: '' } }, job).error, 'carsoc', 'kein Auto gewählt');
  assert.equal(run({ carSoc: null }, job).error, 'carsoc', 'Ladestand unbekannt');
  assert.equal(run({ car: { deviceId: 'car', capacityKwh: 0 } }, job).error, 'carcap');
  const reached = run({ carSoc: 85 }, job);
  assert.equal(reached.error, 'reached');
  assert.equal(reached.carSoc, 85);
  // kWh geht weiter ohne Auto
  const noCar = run({ car: { deviceId: '' } }, { id: 'charger', kind: 'charger', time: '07:00', amount: 10 });
  assert.equal(noCar.error, undefined);
  assert.equal(noCar.amountKwh, 10);
});

test('Auftrag speichern mit Ziel-Ladestand: gespeichert als Energie, Ziel und Start-Ladestand dabei; Fehler lehnen ab', () => {
  const { ctrl, restore } = makeController();
  try {
    const list = ctrl.saveJob({ id: 'charger', kind: 'charger', time: '07:00', targetSoc: 80 });
    const j = list.jobs[0];
    assert.equal(j.amount, 24);
    assert.equal(j.targetSoc, 80);
    assert.equal(ctrl.jobStore.get('charger').startSoc, 40);
    assert.throws(() => makeController({ carSoc: 90 }).ctrl.saveJob({ id: 'charger', kind: 'charger', time: '07:00', targetSoc: 80 }), /schon erreicht/);
  } finally { restore(); }
  const bad = makeController({ car: { deviceId: 'car', capacityKwh: 0 } });
  try { assert.throws(() => bad.ctrl.saveJob({ id: 'charger', kind: 'charger', time: '07:00', targetSoc: 80 }), /Batteriegrösse/); } finally { bad.restore(); }
});

// ---------------------------------------------------------------- Anzeige

const emsJs = fs.readFileSync(path.join(__dirname, '../settings/ems.js'), 'utf8');

async function startUi({ withCar = true, carSoc = 54, preview = null } = {}) {
  const els = new Map();
  const handlers = {};
  const el = (id) => {
    if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '', value: '', checked: false, hidden: false, classList: { contains: () => true, toggle: () => {} }, addEventListener: (t, f) => { handlers[`${id}:${t}`] = f; } });
    return els.get(id);
  };
  const ctx = { document: { getElementById: el }, window: {}, setInterval: () => 0, console, Object, Promise, Date, Number, isFinite, String, JSON, Math };
  vm.createContext(ctx);
  vm.runInContext(emsJs, ctx);
  const config = normalizeConfig({ enabled: true, devices: { meter: { id: 'em' } }, charger: { id: 'wb' }, car: withCar ? { deviceId: 'car', capacityKwh: 60 } : {} });
  const { ctrl, restore } = makeController({ car: withCar ? { deviceId: 'car', capacityKwh: 60 } : { deviceId: '' }, carSoc });
  const calls = [];
  const res = {
    'GET /ems/shadow': { enabled: true, deviceExists: true, shadow: true, config, pv: {}, current: null, charger: { current: { live: false, mine: { mode: 'idle', reason: 'x' }, connected: true, carSoc, pvW: 100, gridW: 0 } } },
    'GET /ems/consumers': { current: [], events: [] }, 'GET /meters': null,
    'GET /ems/devices': { devices: [{ id: 'car', name: 'Tesla', cls: 'car', caps: ['measure_battery', 'meter_power'] }] },
    'GET /ems/plan': () => ctrl.getPlan(),
    'POST /ems/plan/preview': (b) => ctrl.previewPlan(b),
  };
  await ctx.window.EmsUi.init((m, p, b) => { calls.push([m, p, b]); const r = res[`${m} ${p}`]; return Promise.resolve(typeof r === 'function' ? r(b) : r); }, 'de');
  const main = () => els.get('ems-view-main').innerHTML;
  const plan = () => els.get('ems-view-plan').innerHTML;
  const setup = () => els.get('ems-view-devices').innerHTML;
  const draft = (attr, value) => handlers['ems-view-plan:change']({ target: { getAttribute: (n) => (n === 'data-ems-draft' ? attr : null), value, parentNode: null } });
  return { ctx, main, plan, setup, draft, calls, restore, handlers };
}

test('Anzeige: E-Auto als empfohlene Quelle mit Batteriegrösse, Ladestand im Betrieb, Ziel-Ladestand im Formular', async () => {
  const ui = await startUi();
  try {
    assert.match(ui.setup(), /E-Auto/);
    assert.match(ui.main(), /E-Auto 54 %/, 'Ladestand in der Betriebsansicht');
    assert.match(ui.plan(), /E-Auto jetzt: 54 %/);
    assert.match(ui.plan(), /Ziel-Ladestand/);
    ui.draft('targetSoc', '80');
    await new Promise((r) => setTimeout(r, 25));
    const post = ui.calls.find((c) => c[1] === '/ems/plan/preview');
    assert.equal(post[2].jobs[0].targetSoc, 80);
    const html = ui.plan();
    assert.match(html, /von 54 % auf 80 % = 15\.6 kWh/);
    assert.match(html, /Vorschau im Tagesverlauf/, 'Verlauf direkt im Formular');
    assert.doesNotMatch(html, /undefined|NaN/);
    // Quelle aufklappen: Gerät, Wert und Batteriegrösse
    ui.handlers['ems-view-devices:click']({ target: { getAttribute: (n) => (n === 'data-ems-open' ? 'src-car' : null), parentNode: null } });
    assert.match(ui.setup(), /Batteriegrösse des Autos \(kWh\)/);
    assert.equal(ui.ctx.window.EmsUi._collect().ems.car.capacityKwh, 60);
  } finally { ui.restore(); }
});

test('Anzeige: ohne E-Auto kein Ziel-Ladestand, aber Energie in kWh geht, und Vorschau zeigt den Verlauf', async () => {
  const ui = await startUi({ withCar: false, carSoc: null });
  try {
    assert.doesNotMatch(ui.plan(), /Ziel-Ladestand/);
    assert.doesNotMatch(ui.plan(), /E-Auto jetzt/);
    ui.draft('amount', '20');
    await new Promise((r) => setTimeout(r, 25));
    assert.match(ui.plan(), /Vorschau im Tagesverlauf/);
    assert.match(ui.plan(), /Läuft von|in \d+ Viertelstunden/);
  } finally { ui.restore(); }
});
