'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { MeterReader, normalizeMeters } = require('../lib/MeterReader');

function makeApp({ stored = null, device = undefined, readings = {}, available = {} } = {}) {
  const settings = new Map();
  if (stored) settings.set('meters.config', stored);
  const timers = [];
  const reported = [];
  const dev = device === undefined ? {
    actionReportCounter: async (k, v) => { reported.push(['counter', k, v]); },
    actionReportConsumer: async (n, v) => { reported.push(['consumer', n, v]); },
  } : device;
  const homey = {
    settings: { get: (k) => settings.get(k), set: (k, v) => settings.set(k, JSON.parse(JSON.stringify(v))) },
    drivers: { getDriver: () => ({ getDevices: () => (dev ? [dev] : []) }) },
    setTimeout: (f, ms) => { timers.push([f, ms]); return timers.length; },
    clearTimeout: () => {},
  };
  const app = { homey, log: () => {}, error: () => {} };
  const inputs = {
    readNumber: async (id, cap) => {
      if (available[id] === false) return null;
      const v = readings[`${id}:${cap}`];
      return v === undefined ? null : v;
    },
    listDevices: async () => [{ id: 'm1', name: 'Zähler', caps: ['meter_power'] }],
  };
  return { reader: new MeterReader(app, { inputs }), reported, timers, settings };
}

test('Konfiguration: Standard ist aus, ungültige Einträge fliegen raus', () => {
  const c = normalizeMeters(null);
  assert.equal(c.enabled, false);
  assert.deepEqual(Object.keys(c.sources), ['import', 'export', 'battery_charge', 'battery_discharge']);
  assert.equal(c.sources.import.deviceId, '');
  const d = normalizeMeters({
    enabled: true,
    sources: { import: { deviceId: 'a', capability: 'meter_power' }, bogus: { deviceId: 'x' } },
    consumers: [{ name: 'Auto', deviceId: 'c', capability: 'meter_power' }, { name: '', deviceId: 'c', capability: 'x' }, { name: 'ohne Gerät' }],
  });
  assert.equal(d.sources.import.deviceId, 'a');
  assert.equal(d.sources.bogus, undefined);
  assert.equal(d.consumers.length, 1);
  assert.equal(normalizeMeters({ consumers: new Array(20).fill({ name: 'x', deviceId: 'a', capability: 'b' }) }).consumers.length, 8);
});

test('Lesen und Melden: gewählte Zähler gehen als Zählerstand ans Innostrom-Gerät', async () => {
  const { reader, reported } = makeApp({
    stored: {
      enabled: true,
      sources: { import: { deviceId: 'em', capability: 'meter_power' }, export: { deviceId: 'em', capability: 'meter_power.exported' } },
      consumers: [{ name: 'Wärmepumpe', deviceId: 'hp', capability: 'meter_power' }],
    },
    readings: { 'em:meter_power': 1234.5, 'em:meter_power.exported': 99.25, 'hp:meter_power': 410 },
  });
  const st = await reader.readOnce(1000);
  assert.deepEqual(reported, [['counter', 'import', 1234.5], ['counter', 'export', 99.25], ['consumer', 'Wärmepumpe', 410]]);
  assert.equal(st.import.kwh, 1234.5);
  assert.equal(st['consumer:Wärmepumpe'].kwh, 410);
  assert.equal(st.battery_charge, undefined, 'nicht gewählte Zähler werden nicht gemeldet');
});

test('Nicht lesbarer Zähler: Fehler im Status, die anderen werden trotzdem gemeldet', async () => {
  const { reader, reported } = makeApp({
    stored: { enabled: true, sources: { import: { deviceId: 'em', capability: 'meter_power' }, export: { deviceId: 'off', capability: 'meter_power' } } },
    readings: { 'em:meter_power': 10, 'off:meter_power': 5 }, available: { off: false },
  });
  const st = await reader.readOnce(1000);
  assert.deepEqual(reported, [['counter', 'import', 10]]);
  assert.match(st.export.error, /Kein Wert/);
});

test('Kein Innostrom-Gerät gekoppelt: kein Absturz, Fehler im Status', async () => {
  const { reader, reported } = makeApp({
    device: null,
    stored: { enabled: true, sources: { import: { deviceId: 'em', capability: 'meter_power' } } },
    readings: { 'em:meter_power': 10 },
  });
  const st = await reader.readOnce(1000);
  assert.deepEqual(reported, []);
  assert.match(st.import.error, /Kein Innostrom-Gerät/);
});

test('Zeitplan: nur wenn eingeschaltet, auf die nächste Viertelstunde (kein setInterval)', () => {
  const off = makeApp({ stored: { enabled: false } });
  off.reader.start();
  assert.equal(off.timers.length, 0);
  const on = makeApp({ stored: { enabled: true, sources: { import: { deviceId: 'a', capability: 'meter_power' } } } });
  on.reader.start();
  assert.equal(on.timers.length, 1);
  const delay = on.timers[0][1];
  assert.ok(delay > 0 && delay <= 15 * 60 * 1000 + 20_000);
  on.reader.stop();
});

test('Speichern: schaltet ein und liest sofort einmal', async () => {
  const { reader, reported, timers } = makeApp({ readings: { 'em:meter_power': 7 } });
  reader.putConfig({ enabled: true, sources: { import: { deviceId: 'em', capability: 'meter_power' } } });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(reported, [['counter', 'import', 7]]);
  assert.equal(timers.length, 1);
  assert.equal(reader.getConfig().enabled, true);
});

// ---------------------------------------------------------------- Oberfläche

const metersJs = fs.readFileSync(path.join(__dirname, '../settings/meters.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '../settings/index.html'), 'utf8');

function makeUi(responses) {
  const els = new Map();
  const handlers = {};
  const el = (id) => {
    if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '', value: '', checked: false, addEventListener: (t, f) => { handlers[`${id}:${t}`] = f; } });
    return els.get(id);
  };
  const ctx = { document: { getElementById: el }, window: {}, setTimeout: () => 0, Date, Number, Object, Promise, String, Math };
  vm.createContext(ctx);
  vm.runInContext(metersJs, ctx);
  const calls = [];
  const api = (m, p, b) => { calls.push([m, p, b]); const r = responses[`${m} ${p}`]; return r instanceof Error ? Promise.reject(r) : Promise.resolve(r); };
  return { ctx, els, el, handlers, api, calls };
}

const devices = [
  { id: 'em', name: 'Energiezähler', caps: ['meter_power', 'meter_power.exported', 'measure_power'], capTitles: { meter_power: 'Importierte Energie', 'meter_power.exported': 'Exportierte Energie', measure_power: 'Leistung' } },
  { id: 'bat', name: 'Speicher', caps: ['meter_power.charged', 'meter_power.discharged'], capTitles: { 'meter_power.charged': 'Geladene Energie', 'meter_power.discharged': 'Entladene Energie' } },
  { id: 'lamp', name: 'Lampe', caps: ['onoff'] },
];
const emptyCfg = normalizeMeters(null);
const baseResponses = {
  'GET /meters': { config: emptyCfg, status: {} },
  'GET /meters/devices': { devices },
};

test('index.html: Platz, Skript, Aufruf und neue Checkliste ohne Flow-Zwang', () => {
  assert.match(indexHtml, /id="meters-auto"/);
  assert.match(indexHtml, /<script[^>]+src="meters\.js"/);
  assert.match(indexHtml, /MetersUi\.init\(apiCall, LANG\)/);
  assert.ok(indexHtml.indexOf('/homey.js') < indexHtml.indexOf('meters.js'));
  assert.match(indexHtml, /Zähler wählen/);
  assert.match(indexHtml, /Choose your meters/);
  assert.doesNotMatch(indexHtml, /t: 'Zählerstände per Flow melden'/);
});

test('MetersUi: zeigt vier Zähler mit Gerätewahl, nur Geräte mit kWh-Zählern', async () => {
  const env = makeUi(baseResponses);
  await env.ctx.window.MetersUi.init(env.api, 'de');
  const html = env.els.get('meters-auto').innerHTML;
  assert.match(html, /Netzbezug/);
  assert.match(html, /Batterie-Entladung/);
  assert.match(html, /id="mt-import-dev"/);
  assert.match(html, /Energiezähler/);
  assert.doesNotMatch(html, /Lampe/, 'Gerät ohne kWh-Zähler fehlt in der Liste');
  assert.doesNotMatch(html, /undefined|null/);
});

test('MetersUi: Gerätewahl wählt die passende Capability vor (Bezug, Einspeisung, Laden, Entladen)', async () => {
  const env = makeUi(baseResponses);
  await env.ctx.window.MetersUi.init(env.api, 'de');
  const pick = env.ctx.window.MetersUi._pickCap;
  const em = devices[0];
  const bat = devices[1];
  assert.equal(pick(em, 'import', ''), 'meter_power');
  assert.equal(pick(em, 'export', ''), 'meter_power.exported');
  assert.equal(pick(bat, 'battery_charge', ''), 'meter_power.charged');
  assert.equal(pick(bat, 'battery_discharge', ''), 'meter_power.discharged');
  // Wechsel im Formular
  env.el('mt-export-dev').value = 'em';
  env.handlers['meters-auto:change']({ target: { getAttribute: (n) => (n === 'data-mt-dev' ? 'mt-export' : null) } });
  assert.equal(env.ctx.window.MetersUi._state.cfg.sources.export.capability, 'meter_power.exported');
  assert.match(env.els.get('meters-auto').innerHTML, /Exportierte Energie \(meter_power\.exported\)/);
});

test('MetersUi: Speichern sendet die Auswahl, Verbraucher ohne Name oder Gerät fallen weg', async () => {
  const saved = normalizeMeters({ enabled: true, sources: { import: { deviceId: 'em', capability: 'meter_power' } } });
  const env = makeUi({ ...baseResponses, 'PUT /meters': { config: saved, status: {} } });
  await env.ctx.window.MetersUi.init(env.api, 'de');
  const click = env.handlers['meters-auto:click'];
  const at = (n, v = '1') => ({ target: { getAttribute: (x) => (x === n ? v : null) } });
  click(at('data-mt-add'));
  env.el('mt-enabled').checked = true;
  env.el('mt-import-dev').value = 'em';
  env.el('mt-import-cap').value = 'meter_power';
  click(at('data-mt-save'));
  await new Promise((r) => setTimeout(r, 20));
  const put = env.calls.find((c) => c[0] === 'PUT');
  assert.ok(put);
  assert.equal(put[2].enabled, true);
  assert.equal(put[2].sources.import.deviceId, 'em');
  assert.equal(put[2].consumers.length, 0, 'leerer Verbraucher wird nicht gespeichert');
});

test('MetersUi: Status wird angezeigt (zuletzt gelesen und Fehler)', async () => {
  const cfg = normalizeMeters({ enabled: true, sources: { import: { deviceId: 'em', capability: 'meter_power' }, export: { deviceId: 'em', capability: 'meter_power.exported' } } });
  const env = makeUi({ ...baseResponses, 'GET /meters': { config: cfg, status: { import: { at: Date.now() - 120000, kwh: 1234.5 }, export: { at: Date.now(), error: 'Kein Wert lesbar' } } } });
  await env.ctx.window.MetersUi.init(env.api, 'de');
  const html = env.els.get('meters-auto').innerHTML;
  assert.match(html, /zuletzt 1234\.50 kWh/);
  assert.match(html, /Fehler: Kein Wert lesbar/);
});

test('MetersUi: neutral, keine Hersteller- oder Personennamen', async () => {
  const env = makeUi(baseResponses);
  await env.ctx.window.MetersUi.init(env.api, 'de');
  assert.doesNotMatch(env.els.get('meters-auto').innerHTML, /Andi|Huawei|FusionSolar|go-e|EMMA/i);
  const en = makeUi(baseResponses);
  await en.ctx.window.MetersUi.init(en.api, 'en');
  assert.doesNotMatch(en.els.get('meters-auto').innerHTML, /Andi|Huawei|FusionSolar|go-e|EMMA/i);
});
