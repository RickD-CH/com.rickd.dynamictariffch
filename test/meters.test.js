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
  assert.equal(normalizeMeters({ consumers: new Array(20).fill({ name: 'x', deviceId: 'a', capability: 'b' }) }).consumers.length, 12);
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
  assert.equal(on.timers.length, 2, 'Takt-Timer und ein erster Lesevorgang kurz nach dem Start');
  const delay = on.timers[0][1];
  assert.ok(delay > 0 && delay <= 15 * 60 * 1000 + 20_000);
  assert.equal(on.timers[1][1], 20000);
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
  assert.doesNotMatch(env.els.get('meters-auto').innerHTML, /Huawei|FusionSolar|go-e|EMMA/i);
  const en = makeUi(baseResponses);
  await en.ctx.window.MetersUi.init(en.api, 'en');
  assert.doesNotMatch(en.els.get('meters-auto').innerHTML, /Huawei|FusionSolar|go-e|EMMA/i);
});

test('Grenze für Verbraucher: Oberfläche und Kostenrechnung stimmen überein (12)', () => {
  const { MAX_CONSUMERS } = require('../lib/CostTracker');
  assert.equal(MAX_CONSUMERS, 12);
  const m = /var MAX_CONSUMERS = (\d+);/.exec(metersJs);
  assert.ok(m, 'Konstante in meters.js');
  assert.equal(Number(m[1]), MAX_CONSUMERS);
});

test('Speichern führt zusammen: nicht mitgeschickte Teile bleiben erhalten', async () => {
  const { reader } = makeApp({ stored: {
    enabled: true,
    sources: { import: { deviceId: 'em', capability: 'meter_power' } },
    consumers: [{ name: 'Sauna', deviceId: 's', capability: 'meter_power' }],
  } });
  // Nur Verbraucher ändern (so macht es das Energiemanagement)
  reader.putConfig({ consumers: [{ name: 'Tumbler', deviceId: 't', capability: 'meter_power' }] });
  let c = reader.getConfig();
  assert.equal(c.enabled, true);
  assert.equal(c.sources.import.deviceId, 'em', 'Zähler bleiben');
  assert.deepEqual(c.consumers.map((x) => x.name), ['Tumbler']);
  // Nur Zähler ändern (so macht es die Preis-App-Seite, ohne "consumers")
  reader.putConfig({ enabled: true, sources: { export: { deviceId: 'em', capability: 'meter_power.exported' } } });
  c = reader.getConfig();
  assert.equal(c.sources.export.deviceId, 'em');
  assert.equal(c.sources.import.deviceId, 'em');
  assert.deepEqual(c.consumers.map((x) => x.name), ['Tumbler'], 'Verbraucher bleiben');
  // Verbraucher gezielt leeren
  reader.putConfig({ consumers: [] });
  assert.equal(reader.getConfig().consumers.length, 0);
  await new Promise((r) => setTimeout(r, 5));
});

test('Status meldet, ob das Energiemanagement die Verbraucher verwaltet', () => {
  const { reader } = makeApp();
  assert.equal(reader.getStatus().consumersManagedByEms, false);
  reader.app.ems = { hasDevice: () => true };
  assert.equal(reader.getStatus().consumersManagedByEms, true);
  reader.app.ems = { hasDevice: () => false };
  assert.equal(reader.getStatus().consumersManagedByEms, false);
});

test('Zähler-Oberfläche: mit Energiemanagement keine eigene Verbraucher-Liste, Speichern ohne "consumers"', async () => {
  const cfg = normalizeMeters({ enabled: true, consumers: [{ name: 'Sauna', deviceId: 's', capability: 'meter_power' }] });
  const env = makeUi({ ...baseResponses, 'GET /meters': { config: cfg, status: {}, consumersManagedByEms: true }, 'PUT /meters': { config: cfg, status: {} } });
  await env.ctx.window.MetersUi.init(env.api, 'de');
  const html = env.els.get('meters-auto').innerHTML;
  assert.match(html, /unter Einrichten → EMS → Verbraucher/);
  assert.doesNotMatch(html, /data-mt-add/);
  env.handlers['meters-auto:click']({ target: { getAttribute: (n) => (n === 'data-mt-save' ? '1' : null) } });
  await new Promise((r) => setTimeout(r, 20));
  const put = env.calls.find((c) => c[0] === 'PUT');
  assert.equal('consumers' in put[2], false);
});

// ---------------------------------------------------------------- Weg der Speisung (Flow oder Auswahl)

test('Automatisches Lesen meldet als "auto", Status bringt die Meldewege mit', async () => {
  const calls = [];
  const device = {
    actionReportCounter: async (k, v, via) => { calls.push([k, via]); },
    actionReportConsumer: async (n, v, via) => { calls.push([`consumer:${n}`, via]); },
    getReportSeen: () => ({ import: { auto: 5, flow: 3 } }),
  };
  const { reader } = makeApp({
    device,
    stored: { enabled: true, sources: { import: { deviceId: 'em', capability: 'meter_power' } }, consumers: [{ name: 'Auto', deviceId: 'c', capability: 'meter_power' }] },
    readings: { 'em:meter_power': 10, 'c:meter_power': 5 },
  });
  await reader.readOnce(1000);
  assert.deepEqual(calls, [['import', 'auto'], ['consumer:Auto', 'auto']]);
  assert.deepEqual(reader.getStatus().seen, { import: { auto: 5, flow: 3 } });
  const noDev = makeApp({ device: null });
  assert.deepEqual(noDev.reader.getStatus().seen, {});
});

test('MetersUi: Übersicht zeigt je Zähler, ob er über die Auswahl, einen Flow oder beides gespeist wird', async () => {
  const cfg = normalizeMeters({
    enabled: true,
    sources: { import: { deviceId: 'em', capability: 'meter_power' }, export: { deviceId: 'em', capability: 'meter_power.exported' }, battery_charge: { deviceId: 'bat', capability: 'meter_power.charged' } },
    consumers: [{ name: 'Auto', deviceId: 'em', capability: 'meter_power' }],
  });
  const now = Date.now();
  const env = makeUi({
    ...baseResponses,
    'GET /meters': {
      config: cfg, status: {},
      seen: { import: { auto: now - 60000 }, export: { auto: now - 60000, flow: now - 300000 }, battery_discharge: { flow: now - 120000 } },
    },
  });
  await env.ctx.window.MetersUi.init(env.api, 'de');
  const html = env.els.get('meters-auto').innerHTML;
  assert.match(html, /Wie wird jeder Zähler gespeist\?/);
  const table = html.slice(html.indexOf('class="mt-feeds"'), html.indexOf('Automatisch lesen'));
  assert.doesNotMatch(table, /<table|<td/, 'keine breite Tabelle: bricht auf dem Handy um');
  const rowOf = (name) => table.split('class="mt-feed"').find((r) => r.includes('>' + name + '</b>')) || '';
  assert.match(rowOf('Netzbezug'), /mt-ok">Auswahl<\/span>[\s\S]*class="mt-feed-d">Energiezähler/, 'nur Auswahl, Gerät darunter');
  assert.match(rowOf('Netzbezug'), /Auswahl zuletzt vor 60 s/);
  assert.match(rowOf('Einspeisung'), /Auswahl und Flow/);
  assert.match(rowOf('Einspeisung'), /Flow zuletzt vor 5 min/);
  assert.match(rowOf('Batterie-Entladung'), /Flow</, 'nur Flow, keine Auswahl');
  assert.match(rowOf('Batterie-Ladung'), /Auswahl</);
  assert.match(rowOf('Batterie-Ladung'), /noch keine Meldung/);
  assert.match(rowOf('Auto'), /Auswahl/);
  assert.doesNotMatch(table, /undefined|NaN/);
  // nichts gewählt, nichts gemeldet
  const off = makeUi({ ...baseResponses, 'GET /meters': { config: normalizeMeters({ enabled: false, sources: { import: { deviceId: 'em', capability: 'meter_power' } } }), status: {}, seen: {} } });
  await off.ctx.window.MetersUi.init(off.api, 'de');
  const offHtml = off.els.get('meters-auto').innerHTML;
  assert.match(offHtml, /Auswahl vorbereitet, automatisches Lesen ist aus/);
  assert.match(offHtml, /nicht gespeist/);
});

// ---------------------------------------------------------------- Lese-Takt und Aktualisieren-Knopf

test('Lese-Takt: erlaubte Werte, Standard 15, Speichern behält ihn, Zeitplan folgt dem Takt', () => {
  assert.equal(normalizeMeters(null).intervalMin, 15);
  for (const v of [5, 10, 15, 30, 60]) assert.equal(normalizeMeters({ intervalMin: v }).intervalMin, v);
  for (const v of [1, 7, 120, 'abc', null]) assert.equal(normalizeMeters({ intervalMin: v }).intervalMin, 15);
  const a = makeApp({ stored: { enabled: true, intervalMin: 60, sources: { import: { deviceId: 'a', capability: 'meter_power' } } } });
  a.reader.start();
  assert.ok(a.timers[0][1] > 0 && a.timers[0][1] <= 60 * 60 * 1000 + 20000, 'bis zur nächsten vollen Stunde');
  a.reader.stop();
  const b = makeApp({ stored: { enabled: true, sources: { import: { deviceId: 'a', capability: 'meter_power' } } } });
  b.reader.putConfig({ intervalMin: 5 });
  assert.equal(b.reader.getConfig().intervalMin, 5);
  b.reader.putConfig({ enabled: true });
  assert.equal(b.reader.getConfig().intervalMin, 5, 'nicht mitgeschickt = bleibt');
  b.reader.putConfig({ intervalMin: 999 });
  assert.equal(b.reader.getConfig().intervalMin, 15, 'ungültig = Standard');
});

test('MetersUi: Takt wählbar und gespeichert, Knopf liest sofort und füllt die Übersicht', async () => {
  const cfg = normalizeMeters({ enabled: true, sources: { import: { deviceId: 'em', capability: 'meter_power' } } });
  const now = Date.now();
  const env = makeUi({
    ...baseResponses,
    'GET /meters': { config: cfg, status: {}, seen: {} },
    'POST /meters/run': { config: cfg, status: { import: { at: now, kwh: 5 } }, seen: { import: { auto: now } } },
  });
  await env.ctx.window.MetersUi.init(env.api, 'de');
  let html = env.els.get('meters-auto').innerHTML;
  assert.match(html, /id="mt-interval"/);
  assert.match(html, /<option value="15" selected>alle 15 Minuten/);
  assert.match(html, /Jetzt lesen und aktualisieren/);
  assert.match(html, /noch keine Meldung/);
  const click = (attr) => env.handlers['meters-auto:click']({ target: { getAttribute: (n) => (n === attr ? '1' : null) } });
  click('data-mt-run');
  await new Promise((r) => setTimeout(r, 15));
  assert.ok(env.calls.some((c) => c[0] === 'POST' && c[1] === '/meters/run'));
  html = env.els.get('meters-auto').innerHTML;
  assert.match(html, /Auswahl zuletzt vor/);
  assert.match(html, /Gelesen/);
  // Takt ändern: wird beim Speichern mitgeschickt
  env.els.get('mt-interval').value = '30';
  assert.equal(env.ctx.window.MetersUi._collect().intervalMin, 30);
});
