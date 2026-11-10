'use strict';

/**
 * Stufe 1 "Nur Preise": wer kein Energiemanagement-Gerät hat und keine Zähler wählt, bekommt eine App,
 * die keine fremden Geräte anfasst, homey-api nicht lädt, keine EMS- oder Zähler-Timer setzt und in den
 * Einstellungen nichts zeigt, was nach Fehler oder unfertig aussieht.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { buildPlan } = require('../lib/ems/PlanView');
const { normalizeConfig } = require('../lib/ems/Config');
const { EmsController } = require('../lib/ems/EmsController');
const { MeterReader } = require('../lib/MeterReader');
const { startOfLocalDay, addLocalDays } = require('../lib/time');

const root = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'settings/index.html'), 'utf8');
const emsJs = fs.readFileSync(path.join(root, 'settings/ems.js'), 'utf8');

test('homey-api wird nicht geladen, solange niemand andere Geräte liest oder schaltet', () => {
  const script = `
    const Module = require('module');
    const orig = Module._load;
    Module._load = function (request, parent, isMain) {
      if (request === 'homey') return { App: class {}, Driver: class {}, Device: class {} };
      return orig.call(this, request, parent, isMain);
    };
    require('./lib/ems/EmsController');
    require('./lib/MeterReader');
    require('./lib/ems/Inputs');
    require('./lib/ems/Actuators');
    require('./api');
    const loaded = Object.keys(require.cache).filter((k) => /node_modules[\\\\/]homey-api/.test(k));
    console.log(JSON.stringify({ loaded: loaded.length }));
  `;
  const r = spawnSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout.trim()), { loaded: 0 });
});

function fakeApp() {
  const timers = [];
  const settings = new Map();
  const homey = {
    settings: { get: (k) => settings.get(k), set: (k, v) => settings.set(k, v) },
    clock: { getTimezone: () => 'Europe/Zurich' },
    drivers: { getDriver: () => ({ getDevices: () => [] }) },
    setTimeout: (f, ms) => { timers.push(ms); return timers.length; },
    clearTimeout: () => {},
    api: { getApiApp: () => { throw new Error('darf nicht aufgerufen werden'); } },
  };
  return { app: { homey, log: () => {}, error: () => {} }, timers };
}

test('App-Start ohne Energiemanagement-Gerät und ohne Zähler: keine Timer, kein Zugriff', () => {
  const { app, timers } = fakeApp();
  const ems = new EmsController(app);
  ems.start();
  const meters = new MeterReader(app);
  meters.start();
  assert.equal(timers.length, 0, 'kein EMS-Lauf, kein Zähler-Lesen geplant');
  assert.equal(ems.isActive(), false);
  assert.equal(ems.getShadow().deviceExists, false);
  assert.equal(meters.getConfig().enabled, false);
  // Die Plan-Sicht (Preise) geht trotzdem
  const plan = ems.getPlan();
  assert.ok(Array.isArray(plan.days));
  ems.stop();
  meters.stop();
});

// ---------------------------------------------------------------- Einstellungsseite

async function renderPriceOnly(lang = 'de') {
  const now = Date.now();
  const d0 = startOfLocalDay(new Date(now), 'Europe/Zurich').getTime();
  const d2 = addLocalDays(new Date(now), 2, 'Europe/Zurich').getTime();
  const slots = [];
  for (let t = d0; t < d2; t += 900000) slots.push({ start: t, end: t + 900000, price: ((t - d0) / 3600000) % 24 < 6 ? 10 : 30 });
  const plan = { ...buildPlan({ nowMs: now, tz: 'Europe/Zurich', priceSlots: slots, log: [], consumers: [] }), active: false, dryRun: {} };
  const els = new Map();
  const el = (id) => { if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '', value: '', classList: { contains: () => true, toggle() {} }, addEventListener() {} }); return els.get(id); };
  const ctx = { document: { getElementById: el }, window: {}, setInterval: () => 0, console, Object, Promise, Date, Number, isFinite, String, JSON, Math };
  vm.createContext(ctx);
  vm.runInContext(emsJs, ctx);
  const res = {
    'GET /ems/shadow': { enabled: false, deviceExists: false, priceDevice: true, shadow: true, config: normalizeConfig({}) },
    'GET /ems/consumers': { current: [], events: [] }, 'GET /ems/devices': { devices: [] }, 'GET /ems/flows': { flows: [] }, 'GET /meters': null,
    'GET /ems/plan': plan, 'GET /ems/jobs': { jobs: [] },
  };
  await ctx.window.EmsUi.init((m, p) => Promise.resolve(res[`${m} ${p}`]), lang);
  const noStyle = (h) => h.replace(/<style>[\s\S]*?<\/style>/g, '');
  return { main: els.get('ems-view-main').innerHTML, plan: noStyle(els.get('ems-view-plan').innerHTML), setup: noStyle(els.get('ems-view-devices').innerHTML) };
}

test('Seite ohne Energiemanagement: «Heute» bleibt frei davon, «Ausblick» zeigt Preise mit Preisniveau, Einladung nur unter «Einrichten»', async () => {
  const v = await renderPriceOnly();
  assert.equal(v.main, '', 'kein EMS-Hinweis und keine Warnung auf «Heute»');
  assert.match(v.plan, /Preis in Rp\.\/kWh/);
  assert.match(v.plan, /AB JETZT: PREISE/);
  assert.match(v.plan, /Preisniveau/);
  assert.match(v.plan, />günstig<\/td>|>teuer<\/td>|>normal<\/td>/, 'Preisniveau als Wort in der Tabelle');
  assert.doesNotMatch(v.plan, /Was passiert/, 'keine leere Spalte');
  assert.doesNotMatch(v.plan, /AUFTRAG PLANEN/, 'kein Auftragsformular ohne Geräte');
  assert.doesNotMatch(v.plan, /Batterie|Wallbox|Testbetrieb|Simulation/, 'keine EMS-Begriffe');
  assert.doesNotMatch(v.plan, /class="warn"|ems-head-warn/, 'keine Warnfarbe');
  assert.match(v.setup, /Energiemanagement ist noch nicht eingerichtet/);
  const en = await renderPriceOnly('en');
  assert.match(en.plan, /FROM NOW: PRICES/);
  assert.match(en.plan, /Price level/);
});

test('index.html: Kosten-Einrichtung ist freiwillig und nie gelb; «Heute in Zahlen» nur mit Referenztarif oder Zählerdaten', () => {
  assert.doesNotMatch(indexHtml, /\.setup-card\.warn/, 'keine Warnfarbe für die Einrichtungskarte');
  assert.match(indexHtml, /'card sec setup-card' \+ \(allDone \? ' ok' : ''\)/);
  assert.match(indexHtml, /Freiwillig: die Preise und alle Preis-Karten funktionieren ohne diese Schritte\./);
  assert.match(indexHtml, /if \(!usesCosts\) \{ card\.hidden = true; return; \}/);
  assert.match(indexHtml, /id="today-card" hidden/, 'Karte ist zuerst versteckt');
});

test('Preis-Karten bleiben vollständig erhalten (Auslöser, Bedingungen, Aktionen)', () => {
  const dir = (d) => fs.readdirSync(path.join(root, '.homeycompose/flow', d)).map((f) => f.replace('.json', '')).sort();
  for (const id of ['price_changed', 'price_below', 'price_above', 'tomorrow_available', 'no_prices_for_tomorrow', 'cheapest_block_starts', 'day_summarised', 'reports_missing', 'reports_back']) {
    assert.ok(dir('triggers').includes(id), 'Auslöser ' + id);
  }
  for (const id of ['is_among_cheapest', 'is_among_most_expensive', 'is_in_cheapest_block', 'level_is', 'price_is_below', 'reports_missing']) {
    assert.ok(dir('conditions').includes(id), 'Bedingung ' + id);
  }
  for (const id of ['refresh', 'find_cheapest_block', 'find_cheapest_block_from_now', 'find_cheapest_block_within', 'get_prices_today', 'get_prices_tomorrow',
    'report_grid_import', 'report_grid_export', 'report_battery_charge', 'report_battery_discharge', 'report_consumer']) {
    assert.ok(dir('actions').includes(id), 'Aktion ' + id);
  }
});
