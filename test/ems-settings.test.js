'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizeConfig } = require('../lib/ems/Config');

const emsJs = fs.readFileSync(path.join(__dirname, '../settings/ems.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '../settings/index.html'), 'utf8');
const metersJsSrc = fs.readFileSync(path.join(__dirname, '../settings/meters.js'), 'utf8');

function makeEnv(responses) {
  const els = new Map();
  const handlers = {};
  const el = (id) => {
    if (!els.has(id)) {
      els.set(id, {
        id, innerHTML: '', textContent: '', value: '', checked: false,
        classList: { contains: () => true },
        addEventListener: (t, f) => { handlers[id + ':' + t] = f; },
      });
    }
    return els.get(id);
  };
  const ctx = { document: { getElementById: el }, window: {}, setInterval: () => 0, console, Object, Promise, Date, Number, isFinite, String };
  vm.createContext(ctx);
  vm.runInContext(emsJs, ctx);
  const calls = [];
  const api = (method, p, body) => {
    calls.push([method, p, body]);
    const r = responses[method + ' ' + p];
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  };
  return { ctx, els, el, handlers, api, calls };
}

const cfg = normalizeConfig({ enabled: true, consumers: [{ id: 'dev1', name: 'Luftentfeuchter', mode: 'soc', socOn: 85 }] });
const shadow = {
  enabled: true, shadow: true, config: cfg,
  overallAgreePct: 92,
  days: [{ day: '2026-11-10', ticks: 40, compared: 40, agree: 37, agreePct: 93, mine: { hold: 30, normal: 10 }, andi: { hold: 33, normal: 7 } }],
  events: [{ ts: 1800000000000, soc: 99, price: 29.1, mine: 'hold', andi: 'hold', reason: 'Kapazität reserviert' }],
  current: { soc: 99, mine: { mode: 'hold' }, andi: { mode: 'hold' }, errors: [] },
  charger: {
    current: {
      live: false, mine: { mode: 'idle', reason: '270 W Überschuss' }, andi: { mode: 'idle', reason: 'x' },
      gridW: -270, pvW: 901, gate: { blocked: false, remainingKwh: 2.6, thresholdKwh: 0 }, warning: null,
    },
    overallAgreePct: 100,
    days: [{ day: '2026-11-10', ticks: 12, compared: 12, agree: 12, agreePct: 100, mine: { idle: 12 }, andi: { idle: 12 } }],
    events: [{ ts: 1800000000000, soc: 100, price: null, mine: 'idle', andi: 'idle', reason: 'kein Überschuss' }],
  },
};
const responses = {
  'GET /ems/shadow': shadow,
  'GET /ems/consumers': { current: [{ id: 'dev1', name: 'Luftentfeuchter', isOn: false, live: false, reason: 'SoC 99% >= 85%' }], events: [{ ts: 1800000000000, name: 'Luftentfeuchter', cmd: 'on', live: false, reason: 'SoC 99%' }] },
  'GET /ems/devices': { devices: [
    { id: 'dev1', name: 'DryFy Luftentfeuchter', caps: ['onoff', 'measure_humidity'] },
    { id: 'dev2', name: 'Shelly Estrich', caps: ['onoff', 'measure_power'] },
    { id: 'em1', name: 'Energiezähler', caps: ['measure_power', 'measure_power.load', 'meter_power'], capTitles: { measure_power: 'Leistung', 'measure_power.load': 'Hausverbrauch', meter_power: 'Zählerstand' } },
    { id: 'gce', name: 'Wallbox Garage', caps: ['target_power', 'evcharger_charging_state'] },
    { id: 'lun', name: 'Batterie', caps: ['measure_battery'] },
  ] },
};

test('index.html bindet ems.js ein, hat Reiter und Panel und startet EmsUi', () => {
  assert.match(indexHtml, /<script[^>]+src="ems\.js"/);
  assert.match(indexHtml, /data-tab="ems"/);
  assert.match(indexHtml, /id="panel-ems"/);
  assert.match(indexHtml, /EmsUi\.init\(apiCall, LANG\)/);
  // ems.js muss nach homey.js geladen werden
  assert.ok(indexHtml.indexOf('/homey.js') < indexHtml.indexOf('ems.js'));
});

test('Vergleichs-Reiter: Tab und Panel vorhanden, Batterie und Wallbox mit Tagen und Wechseln', async () => {
  assert.match(indexHtml, /data-ems-sub="cmp"/);
  assert.match(indexHtml, /id="ems-view-cmp"/);
  const env = makeEnv(responses);
  await env.ctx.window.EmsUi.init(env.api, 'de');
  const html = env.els.get('ems-cmp-data').innerHTML;
  assert.match(html, /Andis EMS/);
  assert.match(html, /Gesamt gleich: <b>92 %<\/b>/);
  assert.match(html, /Gesamt gleich: <b>100 %<\/b>/);
  assert.match(html, /2026-11-10/);
  assert.match(html, /Kapazität reserviert/);
  assert.match(html, /kein Überschuss/);
  assert.doesNotMatch(html, /undefined|null/);
  assert.equal(env.els.get('ems-sub-cmp').textContent, 'Vergleich');
  assert.equal(env.els.get('ems-sub-main').textContent, 'Betrieb');
});

test('EmsUi: Fehler vom Server wird angezeigt', async () => {
  const env = makeEnv({ ...responses, 'GET /ems/shadow': new Error('kaputt') });
  await env.ctx.window.EmsUi.init(env.api, 'de');
  assert.match(env.els.get('ems-view-main').innerHTML, /Fehler: kaputt/);
});

test('Keine Hersteller- oder Personennamen ausserhalb des Vergleichs-Reiters', async () => {
  const env = makeEnv(responses);
  await env.ctx.window.EmsUi.init(env.api, 'de');
  const banned = /Andi|Huawei|FusionSolar|go-e|LUNA|EMMA|Innostrom/i;
  const ems = env.els.get('ems-view-main').innerHTML + env.els.get('ems-view-devices').innerHTML;
  assert.doesNotMatch(ems, banned, 'EMS-Reiter und Geräte-Setup (de)');
  const en = makeEnv(responses);
  await en.ctx.window.EmsUi.init(en.api, 'en');
  assert.doesNotMatch(en.els.get('ems-view-main').innerHTML + en.els.get('ems-view-devices').innerHTML, banned, 'EMS-Reiter und Geräte-Setup (en)');
  // Im Vergleich dürfen sie vorkommen
  assert.match(env.els.get('ems-cmp-data').innerHTML, /Andis EMS/);
  // Die Vergleichsquelle liegt im Vergleichs-Reiter, nicht mehr in der Geräte-Karte
  assert.match(env.els.get('ems-view-cmp').innerHTML, /id="ems-d-andi"/);
  assert.doesNotMatch(ems, /ems-d-andi/);
  assert.match(env.els.get('ems-view-cmp').innerHTML, /ems-b-target/);
  assert.doesNotMatch(ems, /ems-b-target/);
});

test('Umschalter Betrieb / Vergleich im EMS-Reiter schaltet die Ansichten um', async () => {
  const env = makeEnv(responses);
  await env.ctx.window.EmsUi.init(env.api, 'de');
  const click = env.handlers['ems-sub:click'];
  assert.ok(click, 'Umschalter hat einen Handler');
  const mk = (which) => ({ target: { getAttribute: (n) => (n === 'data-ems-sub' ? which : null) } });
  const toggles = [];
  env.el('ems-sub-main').classList = { toggle: (c, on) => toggles.push(['main', on]) };
  env.el('ems-sub-cmp').classList = { toggle: (c, on) => toggles.push(['cmp', on]) };
  click(mk('cmp'));
  assert.equal(env.els.get('ems-view-main').hidden, true);
  assert.equal(env.els.get('ems-view-cmp').hidden, false);
  click(mk('main'));
  assert.equal(env.els.get('ems-view-main').hidden, false);
  assert.equal(env.els.get('ems-view-cmp').hidden, true);
  assert.deepEqual(JSON.stringify(toggles), JSON.stringify([['main', false], ['cmp', true], ['main', true], ['cmp', false]]));
});

// ---------------------------------------------------------------- Navigation und Kopf

test('Navigation: vier Reiter in fester Reihenfolge, Segmented Control ohne Scrollbalken', () => {
  const order = [...indexHtml.matchAll(/class="tab[^"]*" data-tab="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ['overview', 'costs', 'ems', 'settings']);
  const css = indexHtml.match(/\.tabs \{[\s\S]*?\}/)[0];
  assert.match(css, /display: grid/);
  assert.match(css, /repeat\(4, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css, /overflow-x: auto/);
  assert.match(css, /scrollbar-width: none/);
  assert.match(indexHtml, /\.tab\.active \{[^}]*box-shadow/);
  assert.match(indexHtml, /\.tab\.active \{[^}]*font-weight: 600/);
});

test('Navigation: Hilfe ist ein Abschnitt im Setup, kein eigener Reiter', () => {
  assert.doesNotMatch(indexHtml, /data-tab="help"/);
  assert.doesNotMatch(indexHtml, /id="t-help"/);
  assert.doesNotMatch(indexHtml, /id="panel-help"/);
  const settings = indexHtml.indexOf('id="panel-settings"');
  const help = indexHtml.indexOf('id="h2-helpsec"');
  const ems = indexHtml.indexOf('id="panel-ems"');
  assert.ok(settings > 0 && help > settings && help < ems, 'Hilfe liegt im Setup-Panel');
  for (const id of ['h2-forum', 'btn-forum', 'h2-features', 'ul-features']) {
    assert.match(indexHtml, new RegExp('id="' + id + '"'), id + ' bleibt erhalten');
  }
  assert.match(indexHtml, /tabs: \{ overview: 'Übersicht', costs: 'Kosten', settings: 'Setup'/);
  assert.match(indexHtml, /tabs: \{ overview: 'Overview', costs: 'Costs', settings: 'Setup'/);
});

test('Kopf: Untertitel steht im Setup, nicht mehr über den Reitern', () => {
  const sub = indexHtml.indexOf('id="p-sub"');
  const nav = indexHtml.indexOf('<nav class="tabs">');
  const settings = indexHtml.indexOf('id="panel-settings"');
  assert.ok(sub > settings, 'Untertitel im Setup-Panel');
  assert.ok(nav > 0 && nav < settings);
  // vor den Reitern steht kein Untertitel mehr
  assert.doesNotMatch(indexHtml.slice(indexHtml.indexOf('<body>'), nav), /id="p-sub"/);
});

test('Preis-Badge: semantische Farben für günstig, normal, hoch (auch im Dunkelmodus)', () => {
  assert.match(indexHtml, /\.level\.lv-cheap \{ background: var\(--st-lv-cheap-bg\)/);
  assert.match(indexHtml, /\.level\.lv-normal \{ background: var\(--st-lv-normal-bg\)/);
  assert.match(indexHtml, /\.level\.lv-expensive \{ background: var\(--st-lv-exp-bg\)/);
  assert.match(indexHtml, /'<span class="level lv-' \+ levelClass \+ '">'/);
  // Light-Werte laut Vorgabe, in jedem der 5 Theme-Blöcke definiert
  assert.equal((indexHtml.match(/--st-lv-cheap-bg: #dcfce7;/g) || []).length, 2);
  assert.equal((indexHtml.match(/--st-lv-normal-fg: #0369a1;/g) || []).length, 2);
  assert.equal((indexHtml.match(/--st-lv-exp-fg: #b91c1c;/g) || []).length, 2);
  assert.equal((indexHtml.match(/--st-lv-cheap-bg: #14532d;/g) || []).length, 3, 'Dunkel in 3 Blöcken');
  assert.equal((indexHtml.match(/--st-seg-active-bg:/g) || []).length, 5);
});

test('Ready: Homey.ready() erst nach dem ersten Laden', () => {
  const i = indexHtml.indexOf('loadAll().then(function () {');
  assert.ok(i > 0);
  assert.match(indexHtml.slice(i, i + 80), /Homey\.ready\(\)/);
});

test('Vergleich: bei ausgeschaltetem EMS bleiben die bisherigen Daten sichtbar, mit Hinweis', async () => {
  const off = { ...shadow, enabled: false, current: undefined, charger: { ...shadow.charger, current: undefined }, config: normalizeConfig({ enabled: false }) };
  const env = makeEnv({ ...responses, 'GET /ems/shadow': off });
  await env.ctx.window.EmsUi.init(env.api, 'de');
  const html = env.els.get('ems-cmp-data').innerHTML;
  assert.match(html, /Das Energiemanagement ist ausgeschaltet/);
  assert.match(html, /Gesamt gleich: <b>92 %<\/b>/);
  assert.match(html, /2026-11-10/);
  assert.match(html, /Kapazität reserviert/);
  assert.doesNotMatch(html, /undefined|null/);
  // eingeschaltet: kein Hinweis
  const on = makeEnv(responses);
  await on.ctx.window.EmsUi.init(on.api, 'de');
  assert.doesNotMatch(on.els.get('ems-cmp-data').innerHTML, /ist ausgeschaltet/);
});

test('Einrichtung: grüner Kreis mit Haken statt Text-Haken', () => {
  assert.match(indexHtml, /\.st-check \{ background: var\(--st-switch-on\)/);
  assert.match(indexHtml, /innerHTML = allDone \? '<span class="st-check">✓<\/span>'/);
});

test('Setup: zwei Blöcke (Preis-App / Energiemanagement), gemeinsames unten', () => {
  const at = (s) => indexHtml.indexOf(s);
  const panel = at('id="panel-settings"');
  const bar = at('id="setup-sub"');
  const price = at('id="setup-view-price"');
  const ems = at('id="setup-view-ems"');
  const common = at('id="setup-common"');
  const emsPanel = at('id="panel-ems"');
  assert.ok(panel > 0 && bar > panel && price > bar && ems > price && common > ems && emsPanel > common, 'Reihenfolge der Blöcke');
  const inRange = (id, from, to) => { const p = at('id="' + id + '"'); return p > from && p < to; };
  // Preis-App
  for (const id of ['h2-setup', 'h2-general', 'h2-ref', 'h2-meters', 'h2-hourly', 'h2-battery', 'h2-monitor', 'h2-flowtest']) {
    assert.ok(inRange(id, price, ems), id + ' gehört zur Preis-App');
  }
  // Energiemanagement
  assert.ok(inRange('ems-view-devices', ems, common), 'Geräte gehören zum Energiemanagement');
  assert.ok(inRange('h2-emsdev', ems, common));
  // gemeinsam
  for (const id of ['h2-appearance', 'h2-manage', 'h2-helpsec']) assert.ok(inRange(id, common, emsPanel), id + ' ist gemeinsam');
  // Umschalter: Standard Preis-App, EMS-Ansicht versteckt
  assert.match(indexHtml, /id="setup-view-ems" hidden/);
  assert.doesNotMatch(indexHtml, /id="setup-view-price" hidden/);
  assert.match(indexHtml, /data-setup-sub="price" id="setup-sub-price"/);
  assert.match(indexHtml, /data-setup-sub="ems" id="setup-sub-ems"/);
  assert.match(indexHtml, /<script[^>]+src="setupnav\.js"/);
  assert.match(indexHtml, /SetupNav\.init\(LANG\)/);
  // Untertitel steht in der Preis-App
  assert.ok(inRange('p-sub', price, ems));
});

test('Setup: kein Block "Empfohlene Einstellungen" mehr', () => {
  assert.doesNotMatch(indexHtml, /recommend/i);
  assert.doesNotMatch(indexHtml, /Empfohlene Einstellungen/);
  assert.doesNotMatch(indexHtml, /Recommended settings/);
});

test('SetupNav: schaltet zwischen Preis-App und Energiemanagement, setzt Texte', () => {
  const src = fs.readFileSync(path.join(__dirname, '../settings/setupnav.js'), 'utf8');
  const els = new Map();
  const handlers = {};
  const el = (id) => {
    if (!els.has(id)) els.set(id, { id, hidden: false, textContent: '', classList: { toggle: (c, on) => { els.get(id).active = on; } }, addEventListener: (ty, f) => { handlers[id + ':' + ty] = f; } });
    return els.get(id);
  };
  const ctx = { document: { getElementById: el }, window: {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  ctx.window.SetupNav.init('de');
  assert.equal(el('setup-sub-price').textContent, 'Preis-App');
  assert.equal(el('setup-sub-ems').textContent, 'Energiemanagement');
  assert.match(el('p-setup-ems').textContent, /Reiter «EMS»/);
  const click = handlers['setup-sub:click'];
  click({ target: { getAttribute: (n) => (n === 'data-setup-sub' ? 'ems' : null) } });
  assert.equal(el('setup-view-price').hidden, true);
  assert.equal(el('setup-view-ems').hidden, false);
  assert.equal(el('setup-sub-ems').active, true);
  click({ target: { getAttribute: (n) => (n === 'data-setup-sub' ? 'price' : null) } });
  assert.equal(el('setup-view-price').hidden, false);
  assert.equal(el('setup-view-ems').hidden, true);
  // fremdes Ziel ändert nichts
  click({ target: { getAttribute: () => null } });
  assert.equal(el('setup-view-price').hidden, false);
  ctx.window.SetupNav.init('en');
  assert.equal(el('setup-sub-price').textContent, 'Price app');
  // keine Hersteller- oder Personennamen
  assert.doesNotMatch(src, /Andi|Huawei|FusionSolar|go-e|EMMA/i);
});

