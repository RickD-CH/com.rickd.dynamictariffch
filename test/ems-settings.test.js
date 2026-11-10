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
  current: { soc: 99, mine: { mode: 'hold' }, andi: { mode: 'hold' }, errors: [] },
  charger: {
    current: {
      live: false, mine: { mode: 'idle', reason: '270 W Überschuss' }, andi: { mode: 'idle', reason: 'x' },
      gridW: -270, pvW: 901, gate: { blocked: false, remainingKwh: 2.6, thresholdKwh: 0 }, warning: null,
    },
  },
};
const responses = {
  'GET /ems/shadow': shadow,
  'GET /ems/consumers': { current: [{ id: 'dev1', name: 'Luftentfeuchter', isOn: false, live: false, reason: 'SoC 99% >= 85%' }], events: [{ ts: 1800000000000, name: 'Luftentfeuchter', cmd: 'on', live: false, reason: 'SoC 99%' }] },
  'GET /ems/devices': { devices: [
    { id: 'dev1', name: 'DryFy Luftentfeuchter', caps: ['onoff', 'measure_humidity'] },
    { id: 'dev2', name: 'Shelly Estrich', caps: ['onoff', 'measure_power'] },
    { id: 'em1', name: 'Energiezähler', caps: ['measure_power', 'measure_power.load'] },
    { id: 'gce', name: 'go-echarger', caps: ['target_power', 'evcharger_charging_state'] },
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
  const html = env.els.get('panel-ems').innerHTML;
  assert.match(html, /Energiemanagement aktivieren/);
  assert.match(html, /Wallbox \(go-e\)/);
  assert.match(html, /Luftentfeuchter/);
  assert.match(html, /DryFy Luftentfeuchter/); // Geräteliste im Auswahlfeld
  assert.match(html, /Ab Batterie-SoC/);
  assert.match(html, /Mindestlaufzeit/);
  assert.match(html, /Trockenlauf/);
  assert.doesNotMatch(html, /undefined|null/);
  assert.equal(env.els.get('t-ems').textContent, 'Energiemanagement');
});

test('EmsUi: Geräte-Karte bietet passende Geräte an, Verbraucher nur Geräte mit Ein/Aus', async () => {
  const env = makeEnv(responses);
  await env.ctx.window.EmsUi.init(env.api, 'de');
  const html = env.els.get('panel-ems').innerHTML;
  assert.ok(html.includes('Geräte (einmal wählen)'));
  assert.match(html, /id="ems-d-meter"[\s\S]*Energiezähler/);
  assert.match(html, /id="ems-d-chg"[\s\S]*go-echarger/);
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

test('EmsUi: Modus "Überschuss" zeigt andere Felder als "voll"', async () => {
  const surplusCfg = normalizeConfig({ enabled: true, consumers: [{ id: 'dev1', name: 'X', mode: 'surplus' }] });
  const env = makeEnv({ ...responses, 'GET /ems/shadow': { ...shadow, config: surplusCfg } });
  await env.ctx.window.EmsUi.init(env.api, 'en');
  const html = env.els.get('panel-ems').innerHTML;
  assert.match(html, /Minimum surplus/);
  assert.match(html, /Grace before switching off/);
  assert.doesNotMatch(html, /Full from SoC/);
});

test('EmsUi: Speichern schickt die Konfiguration, Hinzufügen/Entfernen ändert die Liste', async () => {
  const env = makeEnv({ ...responses, 'PUT /ems/config': cfg });
  await env.ctx.window.EmsUi.init(env.api, 'de');
  const click = env.handlers['panel-ems:click'];
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
  assert.match(env.els.get('panel-ems').innerHTML, /Fehler: kaputt/);
});

test('EmsUi: Steuerungs-Schalter pro Bereich, sofort gespeichert, Fehler setzt zurück', async () => {
  const withLive = normalizeConfig({ enabled: true, consumers: [{ id: 'dev1', name: 'Luftentfeuchter', live: true }] });
  const r2 = { ...responses, 'PUT /ems/toggle': withLive };
  const env = makeEnv(r2);
  await env.ctx.window.EmsUi.init(env.api, 'de');
  const html = env.els.get('panel-ems').innerHTML;
  assert.match(html, /data-ems-toggle="charger"/);
  assert.match(html, /data-ems-toggle="dev1"/);
  assert.doesNotMatch(html, /id="ems-live"/);
  const change = env.handlers['panel-ems:change'];
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
  bad.handlers['panel-ems:change']({ target: box });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(box.checked, false, 'Schalter springt bei Fehler zurück');
  assert.match(bad.els.get('ems-toggle-err').textContent, /nein/);
});
