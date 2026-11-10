'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizeConfig } = require('../lib/ems/Config');

const emsJs = fs.readFileSync(path.join(__dirname, '../settings/ems.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '../settings/index.html'), 'utf8');

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

test('EmsUi rendert Status, Wallbox, Verbraucher und Batterie ohne Fehler', async () => {
  const env = makeEnv(responses);
  await env.ctx.window.EmsUi.init(env.api, 'de');
  const html = env.els.get('ems-view-main').innerHTML;
  assert.match(html, /Energiemanagement aktivieren/);
  assert.match(html, /<h2>Wallbox<\/h2>/);
  assert.match(html, /Luftentfeuchter/);
  assert.match(html, /DryFy Luftentfeuchter/); // Geräteliste im Auswahlfeld
  assert.match(html, /Ab Batterie-SoC/);
  assert.match(html, /Mindestlaufzeit/);
  assert.match(html, /Trockenlauf/);
  assert.doesNotMatch(html, /undefined|null/);
  assert.equal(env.els.get('t-ems').textContent, 'EMS');
  assert.equal(env.els.get('ems-sub-main').textContent, 'Betrieb');
});

test('EmsUi: Geräte-Karte bietet passende Geräte an, Verbraucher nur Geräte mit Ein/Aus', async () => {
  const env = makeEnv(responses);
  await env.ctx.window.EmsUi.init(env.api, 'de');
  const html = env.els.get('ems-view-main').innerHTML;
  assert.ok(html.includes('Geräte (einmal wählen)'));
  assert.match(html, /id="ems-d-meter"[\s\S]*Energiezähler/);
  assert.match(html, /id="ems-d-chg"[\s\S]*Wallbox Garage/);
  assert.match(html, /id="ems-d-bat"[\s\S]*Batterie/);
  // Verbraucher-Auswahl: der Energiezähler hat kein onoff und darf nicht erscheinen
  const consumerSelect = html.match(/id="ems-c0-id">([\s\S]*?)<\/select>/)[1];
  assert.doesNotMatch(consumerSelect, /Energiezähler/);
  assert.match(consumerSelect, /DryFy Luftentfeuchter/);
  // Speichern sendet die Geräte (hier mit den bisherigen Werten, da die Attrappe keine Eingaben hat)
  const put = makeEnv({ ...responses, 'PUT /ems/config': cfg });
  await put.ctx.window.EmsUi.init(put.api, 'de');
  const collected = put.ctx.window.EmsUi._collect();
  assert.equal(collected.devices.meter.capability, 'measure_power');
  assert.equal(collected.battery.socCapability, 'measure_battery');
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

test('EmsUi: Modus "Überschuss" zeigt andere Felder als "voll"', async () => {
  const surplusCfg = normalizeConfig({ enabled: true, consumers: [{ id: 'dev1', name: 'X', mode: 'surplus' }] });
  const env = makeEnv({ ...responses, 'GET /ems/shadow': { ...shadow, config: surplusCfg } });
  await env.ctx.window.EmsUi.init(env.api, 'en');
  const html = env.els.get('ems-view-main').innerHTML;
  assert.match(html, /Minimum surplus/);
  assert.match(html, /Grace before switching off/);
  assert.doesNotMatch(html, /Full from SoC/);
});

test('EmsUi: Speichern schickt die Konfiguration, Hinzufügen/Entfernen ändert die Liste', async () => {
  const env = makeEnv({ ...responses, 'PUT /ems/config': cfg });
  await env.ctx.window.EmsUi.init(env.api, 'de');
  const click = env.handlers['ems-view-main:click'];
  const attr = (name) => ({ getAttribute: (n) => (n === name ? '1' : null) });
  click({ target: attr('data-ems-add') });
  assert.equal(env.ctx.window.EmsUi._state.consumers.length, 2);
  click({ target: { getAttribute: (n) => (n === 'data-ems-remove' ? '1' : null) } });
  assert.equal(env.ctx.window.EmsUi._state.consumers.length, 1);
  click({ target: attr('data-ems-save') });
  await new Promise((r) => setTimeout(r, 20));
  const put = env.calls.find((c) => c[0] === 'PUT');
  assert.ok(put, 'PUT /ems/config wurde gesendet');
  assert.equal(put[2].consumers[0].id, 'dev1');
  assert.equal(put[2].charger.live, undefined, 'live kommt nur über den Schalter');
  assert.equal(put[2].consumers[0].live, false);
  assert.equal(put[2].enabled, false); // Attrappe: Häkchen nicht gesetzt
});

test('EmsUi: Fehler vom Server wird angezeigt', async () => {
  const env = makeEnv({ ...responses, 'GET /ems/shadow': new Error('kaputt') });
  await env.ctx.window.EmsUi.init(env.api, 'de');
  assert.match(env.els.get('ems-view-main').innerHTML, /Fehler: kaputt/);
});

test('EmsUi: Steuerungs-Schalter pro Bereich, sofort gespeichert, Fehler setzt zurück', async () => {
  const withLive = normalizeConfig({ enabled: true, consumers: [{ id: 'dev1', name: 'Luftentfeuchter', live: true }] });
  const r2 = { ...responses, 'PUT /ems/toggle': withLive };
  const env = makeEnv(r2);
  await env.ctx.window.EmsUi.init(env.api, 'de');
  const html = env.els.get('ems-view-main').innerHTML;
  assert.match(html, /data-ems-toggle="charger"/);
  assert.match(html, /data-ems-toggle="dev1"/);
  assert.doesNotMatch(html, /id="ems-live"/);
  const change = env.handlers['ems-view-main:change'];
  const mk = (target, checked) => ({ checked, parentNode: null, getAttribute: (n) => (n === 'data-ems-toggle' ? target : null) });
  r2['GET /ems/shadow'] = { ...shadow, config: withLive }; // der Server liefert nach dem Schalten den neuen Stand
  change({ target: mk('dev1', true) });
  await new Promise((r) => setTimeout(r, 20));
  const put = env.calls.find((c) => c[1] === '/ems/toggle');
  assert.equal(JSON.stringify(put[2]), JSON.stringify({ target: 'dev1', live: true }));
  assert.equal(env.ctx.window.EmsUi._state.cfg.consumers[0].live, true);

  const bad = makeEnv({ ...responses, 'PUT /ems/toggle': new Error('nein') });
  await bad.ctx.window.EmsUi.init(bad.api, 'de');
  const box = mk('charger', true);
  bad.handlers['ems-view-main:change']({ target: box });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(box.checked, false, 'Schalter springt bei Fehler zurück');
  assert.match(bad.els.get('ems-toggle-err').textContent, /nein/);
});

test('EmsUi: Typ "Luftentfeuchter" zeigt den Feuchte-Notlauf mit Sensor-Auswahl und eigenen Werten', async () => {
  const dehum = normalizeConfig({
    enabled: true,
    consumers: [{ id: 'dev1', name: 'Entfeuchter', type: 'dehumidifier', humidity: { enabled: true, sensorId: 'hs1', onAbove: 70, offBelow: 64, runMin: 45 } }],
  });
  const env = makeEnv({
    ...responses,
    'GET /ems/shadow': { ...shadow, config: dehum },
    'GET /ems/devices': { devices: [
      { id: 'dev1', name: 'DryFy', caps: ['onoff'] },
      { id: 'hs1', name: 'Feuchtesensor Estrich', caps: ['measure_humidity'] },
      { id: 'em1', name: 'Energiezähler', caps: ['measure_power'] },
    ] },
  });
  await env.ctx.window.EmsUi.init(env.api, 'de');
  const html = env.els.get('ems-view-cmp') ? env.els.get('ems-view-main').innerHTML : '';
  assert.match(html, /Feuchte-Notlauf/);
  assert.match(html, /Notlauf ein ab/);
  assert.match(html, /value="70"/);
  assert.match(html, /value="64"/);
  assert.match(html, /value="45"/);
  assert.match(html, /Feuchtesensor Estrich/);
  const sensorSelect = html.match(/ems-c0-humSensor">([\s\S]*?)<\/select>/)[1];
  assert.doesNotMatch(sensorSelect, /Energiezähler/);
  // Speichern: Werte werden gesammelt
  const collected = env.ctx.window.EmsUi._collect().consumers[0];
  assert.equal(collected.type, 'dehumidifier');
  assert.equal(collected.humidity.onAbove, 70);
  assert.equal(collected.humidity.runMin, 45);
  // ein allgemeiner Verbraucher zeigt den Block nicht
  const plain = makeEnv(responses);
  await plain.ctx.window.EmsUi.init(plain.api, 'de');
  assert.doesNotMatch(plain.els.get('ems-view-main').innerHTML, /Notlauf bei hoher Luftfeuchtigkeit/);
});

test('Keine Hersteller- oder Personennamen ausserhalb des Vergleichs-Reiters', async () => {
  const env = makeEnv(responses);
  await env.ctx.window.EmsUi.init(env.api, 'de');
  const banned = /Andi|Huawei|FusionSolar|go-e|LUNA|EMMA|Innostrom/i;
  const ems = env.els.get('ems-view-main').innerHTML;
  assert.doesNotMatch(ems, banned, 'EMS-Reiter (de)');
  const en = makeEnv(responses);
  await en.ctx.window.EmsUi.init(en.api, 'en');
  assert.doesNotMatch(en.els.get('ems-view-main').innerHTML, banned, 'EMS-Reiter (en)');
  // Im Vergleich dürfen sie vorkommen
  assert.match(env.els.get('ems-cmp-data').innerHTML, /Andis EMS/);
  // Die Vergleichsquelle liegt im Vergleichs-Reiter, nicht mehr in der Geräte-Karte
  assert.match(env.els.get('ems-view-cmp').innerHTML, /id="ems-d-andi"/);
  assert.doesNotMatch(ems, /ems-d-andi/);
  assert.match(env.els.get('ems-view-cmp').innerHTML, /ems-b-target/);
  assert.doesNotMatch(ems, /ems-b-target/);
});

test('EmsUi: Capability als Dropdown mit Titeln, nur passende Werte', async () => {
  const withMeter = normalizeConfig({ enabled: true, devices: { meter: { id: 'em1', capability: 'measure_power' } } });
  const env = makeEnv({ ...responses, 'GET /ems/shadow': { ...shadow, config: withMeter } });
  await env.ctx.window.EmsUi.init(env.api, 'de');
  const html = env.els.get('ems-view-main').innerHTML;
  const sel = html.match(/id="ems-d-meter-cap">([\s\S]*?)<\/select>/)[1];
  assert.match(sel, /Leistung \(measure_power\)/);
  assert.match(sel, /Hausverbrauch \(measure_power\.load\)/);
  assert.doesNotMatch(sel, /meter_power/);
  assert.match(sel, /value="measure_power" selected/);
  assert.doesNotMatch(html, /id="ems-d-meter-cap" type="text"/);
});

test('EmsUi: Gerätewechsel wählt die passende Capability vor und behält andere Eingaben', async () => {
  const env = makeEnv(responses);
  await env.ctx.window.EmsUi.init(env.api, 'de');
  env.el('ems-d-house').value = 'em1';
  env.el('ems-maxamps').value = '10';
  env.handlers['ems-view-main:change']({ target: { getAttribute: (n) => (n === 'data-ems-dev' ? 'ems-d-house' : null) } });
  const cfg2 = env.ctx.window.EmsUi._state.cfg;
  assert.equal(cfg2.devices.house.id, 'em1');
  assert.equal(cfg2.devices.house.capability, 'measure_power.load');
  assert.equal(cfg2.charger.maxAmps, 10, 'Eingabe bleibt beim Neuzeichnen erhalten');
  assert.match(env.els.get('ems-view-main').innerHTML, /value="measure_power\.load" selected/);
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
  for (const id of ['h2-forum', 'btn-forum', 'h2-recommend', 'dl-recommend', 'h2-features', 'ul-features']) {
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
