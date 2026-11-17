'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizeConfig } = require('../lib/ems/Config');
const { normalizeMeters } = require('../lib/MeterReader');

const emsJs = fs.readFileSync(path.join(__dirname, '../settings/ems.js'), 'utf8');

// ---------------------------------------------------------------- Attrappe der Seite
function makeEnv(responses) {
  const els = new Map();
  const handlers = {};
  const el = (id) => {
    if (!els.has(id)) {
      els.set(id, {
        id, innerHTML: '', textContent: '', value: '', checked: false, hidden: false,
        classList: { contains: () => true, toggle: () => {} },
        addEventListener: (t, f) => { handlers[`${id}:${t}`] = f; },
      });
    }
    return els.get(id);
  };
  const ctx = { document: { getElementById: el }, window: {}, setInterval: () => 0, console, Object, Promise, Date, Number, isFinite, String, JSON, Math };
  vm.createContext(ctx);
  vm.runInContext(emsJs, ctx);
  const calls = [];
  const api = (method, p, body) => {
    calls.push([method, p, body]);
    const r = responses[`${method} ${p}`];
    if (typeof r === 'function') return Promise.resolve(r(body));
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  };
  return { ctx, els, el, handlers, api, calls };
}
const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const target = (attrs, parent) => ({ getAttribute: (n) => (n in attrs ? attrs[n] : null), parentNode: parent || null, checked: attrs.checked });

// ---------------------------------------------------------------- Beispieldaten
const devices = [
  { id: 'em', name: 'Energiezähler', cls: 'other', caps: ['measure_power', 'measure_power.load', 'meter_power', 'meter_power.exported'], capTitles: { measure_power: 'Leistung', 'measure_power.load': 'Hausverbrauch', meter_power: 'Importierte Energie', 'meter_power.exported': 'Exportierte Energie' } },
  { id: 'inv', name: 'Wechselrichter', cls: 'solarpanel', caps: ['measure_power', 'meter_power'] },
  { id: 'bat', name: 'Speicher', cls: 'battery', caps: ['measure_battery', 'measure_power', 'meter_power.charged'], capTitles: { measure_battery: 'Ladezustand' } },
  { id: 'wb', name: 'Wallbox Garage', cls: 'evcharger', caps: ['evcharger_charging_state', 'target_power', 'meter_power'] },
  { id: 'dry', name: 'Entfeuchter', cls: 'socket', caps: ['onoff', 'measure_power', 'meter_power'] },
  { id: 'hs', name: 'Feuchtesensor', cls: 'sensor', caps: ['measure_humidity'] },
  { id: 'lamp', name: 'Lampe', cls: 'light', caps: ['onoff'] },
];

function scenario({ cfg = {}, meters = {}, shadow = {}, status = {} } = {}) {
  const config = normalizeConfig({ enabled: true, ...cfg });
  const mcfg = normalizeMeters(meters);
  const sh = {
    enabled: config.enabled, deviceExists: true, shadow: true, config,
    pv: { source: null, factor: 1, externalAt: null, stale: true, slots: 0 },
    current: { soc: 97, mine: { mode: 'hold' }, other: { mode: 'hold' }, errors: [] },
    charger: { current: { live: false, mine: { mode: 'idle', reason: 'kein Überschuss' }, gridW: 18, pvW: 514, batterySoc: 97, connected: false, warning: null } },
    ...shadow,
  };
  return {
    'GET /ems/shadow': sh,
    'GET /ems/consumers': { current: [], events: [] },
    'GET /ems/devices': { devices },
    'GET /meters': { config: mcfg, status, consumersManagedByEms: true },
    'PUT /ems/config': (b) => ({ ...config, ...b }),
    'PUT /meters': (b) => ({ config: { ...mcfg, ...b }, status: {}, consumersManagedByEms: true }),
    'PUT /ems/toggle': (b) => config,
  };
}

const fullCfg = {
  devices: { meter: { id: 'em', capability: 'measure_power' }, house: { id: 'em', capability: 'measure_power.load' }, inverter: { id: 'inv', capability: 'measure_power' } },
  battery: { deviceId: 'bat' },
  charger: { id: 'wb', costName: 'E-Auto' },
  consumers: [{ id: 'dry', name: 'Entfeuchter', mode: 'soc', socOn: 85, type: 'dehumidifier' }],
};
const fullMeters = {
  enabled: true,
  consumers: [
    { name: 'E-Auto', deviceId: 'wb', capability: 'meter_power' },
    { name: 'Entfeuchter', deviceId: 'dry', capability: 'meter_power' },
    { name: 'Sauna', deviceId: 'inv', capability: 'meter_power' },
  ],
};

async function start(sc, lang = 'de') {
  const env = makeEnv(sc);
  await env.ctx.window.EmsUi.init(env.api, lang);
  return env;
}
const setup = (env) => env.els.get('ems-view-devices').innerHTML;
const main = (env) => env.els.get('ems-view-main').innerHTML;
const click = (env, view, attrs, parent) => env.handlers[`${view}:click`]({ target: target(attrs, parent) });
const change = (env, view, attrs) => env.handlers[`${view}:change`]({ target: target(attrs) });

// ---------------------------------------------------------------- Setup: Datenquellen

test('Setup: Datenquellen nach Wichtigkeit sortiert, mit Pflicht/Empfohlen/Optional/Automatisch', async () => {
  const env = await start(scenario());
  const html = setup(env);
  const order = ['Netzzähler', 'Solar-Wechselrichter', 'Hausverbrauch', 'E-Auto', 'Hausbatterie', 'Solarprognose', 'Strompreis'].map((n) => html.indexOf(n));
  assert.ok(order.every((v, i, a) => v > 0 && (i === 0 || v > a[i - 1])), 'Reihenfolge: ' + order.join(','));
  const tags = [...html.matchAll(/ems-tag ems-tag-(\w+)">([^<]+)/g)].map((m) => m[2]);
  assert.deepEqual(tags, ['Pflicht', 'Empfohlen', 'Empfohlen', 'Empfohlen', 'Optional', 'Optional', 'Automatisch']);
  assert.match(html, /DATENQUELLEN/);
  assert.match(html, /VERBRAUCHER/);
});

test('Setup: zugeklappt keine Dropdown-Wand, Kopf meldet fehlende Pflicht-Quelle', async () => {
  const env = await start(scenario());
  const html = setup(env);
  assert.match(html, /id="src-grid-dev"/, 'die erste fehlende Pflichtquelle (Netzzähler) ist von selbst aufgeklappt');
  assert.doesNotMatch(html, /id="src-pv-dev"/, 'die übrigen Quellen bleiben zu');
  assert.match(html, /Es fehlt noch: Netzzähler/);
  assert.match(html, /nicht gewählt/);
  assert.match(env.els.get('h2-emsdev').innerHTML, /st-open/);
  assert.match(html, /Automatisch vorschlagen/);
  assert.match(html, /EMS-Einstellungen speichern/);
});

test('Setup: aufklappen per Klick auf ein Kind der Zeile, Geräte nach Fähigkeit gefiltert, Werte mit Titeln', async () => {
  const env = await start(scenario());
  const header = target({ 'data-ems-open': 'src-grid' });
  click(env, 'ems-view-devices', {}, header); // schliesst die von selbst aufgeklappte erste Pflichtquelle
  assert.doesNotMatch(setup(env), /id="src-grid-dev"/);
  click(env, 'ems-view-devices', {}, header); // Klick auf ein Kind: Eltern tragen das Attribut
  const html = setup(env);
  assert.match(html, /id="src-grid-dev"/);
  const devSel = html.match(/id="src-grid-dev"[^>]*>([\s\S]*?)<\/select>/)[1];
  assert.match(devSel, /Energiezähler/);
  assert.doesNotMatch(devSel, /Lampe/, 'Gerät ohne Leistungswert fehlt');
  assert.match(html, /Der Netzzähler ist die Grundlage/);
  // zweiter Klick klappt wieder zu
  click(env, 'ems-view-devices', {}, header);
  assert.doesNotMatch(setup(env), /id="src-grid-dev"/);
});

test('Setup: Gerätewahl setzt den passenden Wert vor (Hausverbrauch bevorzugt "load")', async () => {
  const env = await start(scenario());
  click(env, 'ems-view-devices', { 'data-ems-open': 'src-house' });
  env.el('src-house-dev').value = 'em';
  change(env, 'ems-view-devices', { 'data-ems-src': 'house' });
  const html = setup(env);
  assert.match(html, /value="measure_power\.load" selected/);
  assert.match(html, /Hausverbrauch \(measure_power\.load\)/);
  assert.equal(env.ctx.window.EmsUi._collect().ems.devices.house.capability, 'measure_power.load');
});

test('Setup: Netzzähler gewählt ist "Bereit", ohne Batterie mit Hinweis, dass es trotzdem läuft', async () => {
  const env = await start(scenario({ cfg: { devices: { meter: { id: 'em' } } } }));
  const html = setup(env);
  assert.match(html, /Bereit: alle Pflicht-Quellen sind gewählt/);
  assert.match(html, /Ohne Hausbatterie läuft das Energiemanagement trotzdem/);
  assert.match(env.els.get('h2-emsdev').innerHTML, /st-check/);
  const withBat = await start(scenario({ cfg: { devices: { meter: { id: 'em' } }, battery: { deviceId: 'bat' } } }));
  assert.doesNotMatch(setup(withBat), /Ohne Hausbatterie läuft/);
});

test('Setup: Strompreis kommt automatisch, Solarprognose zeigt das Einliefern', async () => {
  const env = await start(scenario({ shadow: { pv: { source: 'external', factor: 0.75, externalAt: Date.now() - 30 * 60000, stale: false, slots: 48 } }, cfg: { pv: { factor: 0.75 } } }));
  let html = setup(env);
  assert.match(html, /aus dieser App/);
  assert.match(html, /zuletzt vor 30 min \(48 Einträge\)/);
  click(env, 'ems-view-devices', { 'data-ems-open': 'src-fc' });
  html = setup(env);
  assert.match(html, /id="ems-pv-factor" type="number" value="0\.75"/);
  assert.match(html, /PV-Prognose setzen/);
  const none = await start(scenario());
  assert.match(setup(none), /nicht eingeliefert/);
});

// ---------------------------------------------------------------- Setup: Verbraucher

test('Setup: eine Liste aus Wallbox, geschalteten Verbrauchern und reinen Kosten-Zählern', async () => {
  const env = await start(scenario({ cfg: fullCfg, meters: fullMeters }));
  const html = setup(env);
  assert.match(html, /Wallbox \(E-Auto\)/);
  assert.match(html, /Entfeuchter/);
  assert.match(html, /Sauna/);
  assert.match(html, /nur Kostenzähler/);
  assert.match(html, /Ab Batterie-SoC - nicht gesteuert/);
  assert.match(html, /Verbraucher hinzufügen/);
  const rows = env.ctx.window.EmsUi._state.rows;
  assert.equal(JSON.stringify(rows.map((r) => r.name)), JSON.stringify(['E-Auto', 'Entfeuchter', 'Sauna']));
  assert.equal(rows[0].meterDeviceId, 'wb');
  assert.equal(rows[1].meterDeviceId, 'dry');
  assert.equal(rows[2].control, false);
});

test('Setup: Speichern teilt in EMS-Konfiguration und Kosten-Zähler', async () => {
  const env = await start(scenario({ cfg: fullCfg, meters: fullMeters }));
  const b = env.ctx.window.EmsUi._collect();
  assert.equal(b.ems.charger.id, 'wb');
  assert.equal(b.ems.charger.costName, 'E-Auto');
  assert.equal(JSON.stringify(b.ems.consumers.map((c) => [c.id, c.name, c.mode])), JSON.stringify([['dry', 'Entfeuchter', 'soc']]));
  assert.equal(b.ems.consumers[0].type, 'dehumidifier');
  assert.equal(JSON.stringify(b.meters.consumers.map((c) => [c.name, c.deviceId, c.capability])), JSON.stringify([['E-Auto', 'wb', 'meter_power'], ['Entfeuchter', 'dry', 'meter_power'], ['Sauna', 'inv', 'meter_power']]));
  assert.equal(b.ems.devices.meter.id, 'em');
  assert.equal(b.ems.battery.deviceId, 'bat');
});

test('Setup: Verbraucher aufklappen, Modus und Erweitert, Feuchte-Notlauf nur beim Luftentfeuchter', async () => {
  const env = await start(scenario({ cfg: { ...fullCfg, consumers: [{ ...fullCfg.consumers[0], humidity: { enabled: true, sensorId: 'hs', onAbove: 70, offBelow: 64, runMin: 45 } }] }, meters: fullMeters }));
  click(env, 'ems-view-devices', { 'data-ems-open': 'row1' });
  const html = setup(env);
  assert.match(html, /id="row1-mode"/);
  assert.match(html, /Ab Batterie-SoC/);
  assert.match(html, /id="row1-socOn" type="number" value="85"/);
  assert.match(html, /<summary[^>]*>Erweitert \(Laufzeiten, Schutz-Ladestand, Prognose-Sperre\)<\/summary>/);
  assert.match(html, /<summary[^>]*>Feuchte-Notlauf \(optional\) · ein<\/summary>/, 'eigener Bereich ausserhalb von Erweitert, mit ein/aus im Titel');
  assert.match(html, /id="row1-humOn" type="number" value="70"/);
  assert.match(html, /id="row1-humRun" type="number" value="45"/);
  const humSel = html.match(/id="row1-humSensor">([\s\S]*?)<\/select>/)[1];
  assert.match(humSel, /Feuchtesensor/);
  assert.doesNotMatch(humSel, /Lampe/);
  const b = env.ctx.window.EmsUi._collect().ems.consumers[0];
  assert.equal(b.humidity.onAbove, 70);
  assert.equal(b.humidity.sensorId, 'hs');
  // Steuer-Gerät nur mit Ein/Aus
  const ctl = html.match(/id="row1-dev"[^>]*>([\s\S]*?)<\/select>/)[1];
  assert.match(ctl, /Lampe/);
  assert.doesNotMatch(ctl, /Energiezähler/);
});

test('Setup: ohne Hausbatterie nur "Bei Überschuss", mit Batterie auch voll und SoC', async () => {
  const noBat = await start(scenario({ cfg: { ...fullCfg, battery: { deviceId: '' }, consumers: [{ id: 'dry', name: 'E', mode: 'surplus' }] }, meters: {} }));
  click(noBat, 'ems-view-devices', { 'data-ems-open': 'row1' });
  let modeSel = setup(noBat).match(/id="row1-mode"[^>]*>([\s\S]*?)<\/select>/)[1];
  assert.match(modeSel, /Bei Überschuss/);
  assert.doesNotMatch(modeSel, /Bei voller Batterie|Ab Batterie-SoC/);
  assert.match(setup(noBat), /Ohne Hausbatterie ist nur «Bei Überschuss» möglich/);
  const withBat = await start(scenario({ cfg: { ...fullCfg, consumers: [{ id: 'dry', name: 'E', mode: 'surplus' }] }, meters: {} }));
  click(withBat, 'ems-view-devices', { 'data-ems-open': 'row1' });
  modeSel = setup(withBat).match(/id="row1-mode"[^>]*>([\s\S]*?)<\/select>/)[1];
  assert.match(modeSel, /Bei voller Batterie/);
  assert.match(modeSel, /Ab Batterie-SoC/);
});

test('Setup: Hinzufügen und Entfernen, neuer Verbraucher ist aufgeklappt', async () => {
  const env = await start(scenario({ cfg: fullCfg, meters: fullMeters }));
  const before = env.ctx.window.EmsUi._state.rows.length;
  click(env, 'ems-view-devices', { 'data-ems-add': '1' });
  const rows = env.ctx.window.EmsUi._state.rows;
  assert.equal(rows.length, before + 1);
  assert.match(setup(env), new RegExp(`id="row${before}-name"`));
  click(env, 'ems-view-devices', { 'data-ems-remove': String(before) });
  assert.equal(env.ctx.window.EmsUi._state.rows.length, before);
});

test('Setup: "Automatisch vorschlagen" füllt leere Quellen und die Wallbox', async () => {
  const env = await start(scenario());
  click(env, 'ems-view-devices', { 'data-ems-suggest': '1' });
  const html = setup(env);
  assert.match(html, /Vorschläge eingetragen: 5/);
  const c = env.ctx.window.EmsUi._collect().ems;
  assert.equal(c.devices.meter.id, 'em');
  assert.equal(c.devices.house.capability, 'measure_power.load');
  assert.equal(c.devices.inverter.id, 'inv');
  assert.equal(c.battery.deviceId, 'bat');
  assert.equal(c.battery.socCapability, 'measure_battery');
  assert.equal(c.charger.id, 'wb');
  const rows = env.ctx.window.EmsUi._state.rows;
  assert.equal(rows[0].meterDeviceId, 'wb', 'Wallbox-Zähler wird mit vorgeschlagen');
  // schon Gewähltes bleibt unberührt
  const keep = await start(scenario({ cfg: { devices: { meter: { id: 'inv', capability: 'measure_power' } } } }));
  click(keep, 'ems-view-devices', { 'data-ems-suggest': '1' });
  assert.equal(keep.ctx.window.EmsUi._collect().ems.devices.meter.id, 'inv');
});

test('Setup: Speichern schickt EMS-Konfiguration und Zähler, meldet "Gespeichert"', async () => {
  const env = await start(scenario({ cfg: fullCfg, meters: fullMeters }));
  click(env, 'ems-view-devices', { 'data-ems-save': '1' });
  await wait(30);
  const putEms = env.calls.find((c) => c[0] === 'PUT' && c[1] === '/ems/config');
  const putMeters = env.calls.find((c) => c[0] === 'PUT' && c[1] === '/meters');
  assert.ok(putEms && putMeters);
  assert.equal(putEms[2].charger.id, 'wb');
  assert.equal(putEms[2].consumers.length, 1);
  assert.equal(putMeters[2].consumers.length, 3);
  assert.equal(putMeters[2].enabled, true);
  assert.equal(env.els.get('ems-msg').textContent, 'Gespeichert');
  const bad = await start({ ...scenario({ cfg: fullCfg }), 'PUT /ems/config': new Error('kaputt') });
  click(bad, 'ems-view-devices', { 'data-ems-save': '1' });
  await wait(30);
  assert.match(bad.els.get('ems-msg').textContent, /Fehler: kaputt/);
});

test('Setup: ungespeicherte Eingaben überleben das Aufklappen anderer Zeilen', async () => {
  const env = await start(scenario({ cfg: fullCfg, meters: fullMeters }));
  click(env, 'ems-view-devices', { 'data-ems-open': 'row1' });
  env.el('row1-name').value = 'Trockner Estrich';
  env.el('row1-minRunMin').value = '45';
  click(env, 'ems-view-devices', { 'data-ems-open': 'src-bat' });
  const r = env.ctx.window.EmsUi._state.rows[1];
  assert.equal(r.name, 'Trockner Estrich');
  assert.equal(r.minRunMin, 45);
});

// ---------------------------------------------------------------- Betrieb (EMS-Reiter)

test('Betrieb: Statuskopf mit Farbe, grossem Schalter, Modus, Werten', async () => {
  const env = await start(scenario({ cfg: fullCfg, meters: fullMeters }));
  const html = main(env);
  assert.match(html, /Silent-Modus: es wird nur simuliert/, 'Standard: Silent-Modus an');
  assert.match(html, /id="ems-silent" type="checkbox" data-ems-silent="1" checked/);
  const test = await start(scenario({ cfg: { ...fullCfg, silent: false }, meters: fullMeters }));
  assert.match(main(test), /Läuft, aber noch kein Gerät ist zum Steuern freigegeben/);
  assert.match(html, /<span class="swt"><input class="sw" id="ems-enabled" type="checkbox" data-ems-enable="1" checked><i><\/i><\/span>/);
  assert.match(html, /ems-chip">Bereit/);
  assert.match(html, /PV 514 W/);
  assert.match(html, /Netz 18 W/);
  assert.match(html, /Batterie 97 %/);
  assert.doesNotMatch(html, /Jetzt rechnen|<h2>Steuerung<\/h2>/);
  const off = await start(scenario({ cfg: { ...fullCfg, enabled: false } }));
  assert.match(main(off), /Ausgeschaltet/);
  assert.doesNotMatch(main(off), /data-ems-enable="1" checked/);
});

test('Betrieb: Zeilen mit Schalter für Wallbox und geschaltete Verbraucher, reine Kostenzähler fehlen', async () => {
  const env = await start(scenario({ cfg: fullCfg, meters: fullMeters }));
  const html = main(env);
  assert.match(html, /data-ems-toggle="charger"/);
  assert.match(html, /data-ems-toggle="dry"/);
  assert.doesNotMatch(html, /Sauna/);
  assert.match(html, /data-ems-chargenow="1"/);
  assert.match(html, /Sofort laden/);
  assert.match(html, /Schalter ein: das Energiemanagement steuert dieses Gerät/);
});

test('Betrieb: live schaltet den Kopf auf "steuert", Warnung färbt gelb', async () => {
  const live = await start(scenario({ cfg: { ...fullCfg, silent: false, charger: { ...fullCfg.charger, live: true } } }));
  assert.match(main(live), /Läuft und steuert: Wallbox/);
  const silentLive = await start(scenario({ cfg: { ...fullCfg, charger: { ...fullCfg.charger, live: true } } }));
  assert.match(main(silentLive), /Silent-Modus: es wird nur simuliert/, 'Silent schlägt den Schalter je Gerät');
  const warn = await start(scenario({ cfg: fullCfg, shadow: { charger: { current: { live: true, mine: { mode: 'idle', reason: 'x' }, gridW: 0, pvW: 0, warning: 'Ein anderes Energiemanagement steuert diese Wallbox ebenfalls - dort ausschalten' } } } }));
  assert.match(main(warn), /Läuft mit Warnung/);
  assert.match(main(warn), /anderes Energiemanagement/);
});

test('Betrieb: Schalter rufen die API, Fehler setzt den Schalter zurück', async () => {
  const env = await start(scenario({ cfg: fullCfg, meters: fullMeters }));
  const box = { ...target({ 'data-ems-toggle': 'dry' }), checked: true };
  env.handlers['ems-view-main:change']({ target: box });
  await wait();
  const put = env.calls.find((c) => c[1] === '/ems/toggle');
  assert.equal(JSON.stringify(put[2]), JSON.stringify({ target: 'dry', live: true }));
  const en = { ...target({ 'data-ems-enable': '1' }), checked: false };
  env.handlers['ems-view-main:change']({ target: en });
  await wait();
  assert.ok(env.calls.find((c) => c[1] === '/ems/config' && c[2] && c[2].enabled === false));
  const cn = { ...target({ 'data-ems-chargenow': '1' }), checked: true };
  env.handlers['ems-view-main:change']({ target: cn });
  await wait();
  assert.ok(env.calls.find((c) => c[1] === '/ems/config' && c[2] && c[2].charger && c[2].charger.chargeNow === true));
  const bad = await start({ ...scenario({ cfg: fullCfg }), 'PUT /ems/toggle': new Error('nein') });
  const b2 = { ...target({ 'data-ems-toggle': 'charger' }), checked: true };
  bad.handlers['ems-view-main:change']({ target: b2 });
  await wait();
  assert.equal(b2.checked, false);
  assert.match(bad.els.get('ems-toggle-err').textContent, /nein/);
});

test('Ohne EMS-Gerät: «Heute» bleibt leer, die Einladung steht nur im Setup', async () => {
  const sc = scenario({ shadow: { deviceExists: false } });
  const env = await start(sc);
  assert.equal(main(env), '', 'kein Hinweis auf «Heute» für reine Preis-Nutzer');
  assert.match(setup(env), /noch nicht eingerichtet/);
  assert.match(setup(env), /Gerät «Energiemanagement» hinzu/);
  assert.doesNotMatch(main(env) + setup(env), /ems-enabled|data-ems-toggle|DATENQUELLEN/);
  const en = await start(sc, 'en');
  assert.match(setup(en), /not set up yet/);
});

// ---------------------------------------------------------------- Allgemein

test('Neutral: keine Hersteller- oder Personennamen in Betrieb und Setup (de und en)', async () => {
  const banned = /Huawei|FusionSolar|go-e|LUNA|EMMA|Innostrom|Solcast/i;
  for (const lang of ['de', 'en']) {
    const env = await start(scenario({ cfg: fullCfg, meters: fullMeters }), lang);
    for (const id of ['grid', 'pv', 'house', 'bat', 'fc', 'price']) click(env, 'ems-view-devices', { 'data-ems-open': 'src-' + id });
    for (let i = 0; i < 3; i += 1) click(env, 'ems-view-devices', { 'data-ems-open': 'row' + i });
    assert.doesNotMatch(main(env) + setup(env), banned, lang);
  }
});

test('Vergleich: zeigt weiter die Daten und die Quelle; der Batterie-Planer liegt unter Einrichten → Hausbatterie', async () => {
  const env = await start(scenario({ cfg: { ...fullCfg, compare: true }, shadow: { overallAgreePct: 92, days: [{ day: '2026-11-10', ticks: 40, compared: 40, agree: 37, agreePct: 93, mine: { hold: 30 }, other: { hold: 33 } }], events: [] } }));
  const data = env.els.get('ems-cmp-data').innerHTML;
  assert.match(data, /Gesamt gleich: <b>92 %<\/b>/);
  assert.match(data, /Anderes EMS/);
  assert.match(env.els.get('ems-view-cmp').innerHTML, /id="ems-d-cmp"/);
  assert.doesNotMatch(env.els.get('ems-view-cmp').innerHTML, /ems-b-target|ems-bp-reserve/);
  assert.doesNotMatch(setup(env) + main(env), /ems-d-cmp/);
});

test('Gerätewechsel wird beim Auffrischen nicht überschrieben', async () => {
  const env = await start(scenario({ cfg: fullCfg, meters: fullMeters }));
  click(env, 'ems-view-devices', { 'data-ems-open': 'src-pv' });
  env.el('src-pv-dev').value = 'bat';
  change(env, 'ems-view-devices', { 'data-ems-src': 'pv' });
  assert.equal(env.ctx.window.EmsUi._state.cfg.devices.inverter.id, 'bat');
  await env.ctx.window.EmsUi._render();
  assert.equal(env.ctx.window.EmsUi._state.cfg.devices.inverter.id, 'bat');
});

test('Setup: Kopf ist grün getönt, wenn alles eingerichtet ist, sonst gelb; Quellen sind gleich sichtbar', async () => {
  const ok = await start(scenario({ cfg: { devices: { meter: { id: 'em' } } } }));
  assert.match(setup(ok), /class="ems-head ems-head-ok"/);
  assert.match(setup(ok), /Netzzähler/);
  const miss = await start(scenario());
  assert.match(setup(miss), /class="ems-head ems-head-warn"/);
  assert.match(setup(miss), /Es fehlt noch: Netzzähler/);
  // Quellen stehen ohne weiteres Aufklappen da (kein einklappbarer Rahmen im Setup)
  assert.match(setup(ok), /DATENQUELLEN/);
  assert.match(setup(ok), /Hausbatterie/);
});

test('Setup: Preis-Gerät ist Voraussetzung - fehlt es, wird der Strompreis zur Pflicht und der Kopf warnt', async () => {
  const ok = await start(scenario({ cfg: { devices: { meter: { id: 'em' } } } }));
  assert.match(setup(ok), /class="ems-head ems-head-ok"/);
  assert.match(setup(ok), /aus dieser App/);
  const miss = await start(scenario({ cfg: { devices: { meter: { id: 'em' } } }, shadow: { priceDevice: false } }));
  assert.match(setup(miss), /class="ems-head ems-head-warn"/);
  assert.match(setup(miss), /Es fehlt noch: Strompreis/);
  assert.match(setup(miss), /Preis-Gerät fehlt/);
  assert.match(main(miss), /braucht das Preis-Gerät/);
  assert.doesNotMatch(main(ok), /braucht das Preis-Gerät/);
});

test('Setup: Berechnung - Rechenintervall mit Auswirkung (Geräte, Abfragen pro Stunde), gespeichert beim Speichern', async () => {
  const env = await start(scenario({ cfg: fullCfg, meters: fullMeters }));
  assert.match(setup(env), /BERECHNUNG/);
  assert.match(setup(env), /Rechenintervall/);
  assert.match(setup(env), />Automatisch</);
  click(env, 'ems-view-devices', { 'data-ems-open': 'calc' });
  let html = setup(env);
  assert.match(html, /data-ems-calc="refreshS"/);
  assert.match(html, /gelesene Geräte/);
  assert.match(html, /belastet Homey aber stärker/);
  assert.match(html, /data-ems-calc="tickMinutes"/);
  env.handlers['ems-view-devices:change']({ target: { getAttribute: (n) => (n === 'data-ems-calc' ? 'refreshS' : null), value: '30', parentNode: null } });
  html = setup(env);
  assert.match(html, /Alle 30 s/);
  assert.match(html, /\d+ gelesene Geräte, \d+ Abfragen pro Stunde/);
  const put = env.api;
  const before = env.calls.length;
  await env.ctx.window.EmsUi._collect();
  const body = env.ctx.window.EmsUi._collect().ems;
  assert.equal(body.refreshS, 30);
  assert.equal(body.tickMinutes, 5);
  assert.ok(put && before >= 0);
});

test('Vergleich: «Wo der Unterschied entsteht» zeigt die Kosten je Situation (Entscheide, Preisstufe, Stunden, CHF, Unterschied) und ohne Daten einen Hinweis', async () => {
  const withData = await start(scenario({
    cfg: { ...fullCfg, compare: true },
    shadow: {
      overallAgreePct: 60,
      days: [],
      ledger: {
        days: [],
        today: null,
        total: { days: 0, mine: 0, other: 0, none: 0 },
        breakdown: [
          {
            mine: 'normal', other: 'normal', band: 'high', hours: 3.5, mineChf: 1.9, otherChf: 1.1, diffChf: 0.8, mineKwh: 5, otherKwh: 3,
          },
          {
            mine: 'normal', other: 'hold', band: 'mid', hours: 6, mineChf: 0.4, otherChf: 1.5, diffChf: -1.1, mineKwh: 2, otherKwh: 7,
          },
        ],
      },
    },
  }));
  const html = withData.els.get('ems-cmp-data').innerHTML;
  assert.match(html, /Wo der Unterschied entsteht/);
  assert.match(html, /<td>entladen<\/td><td>halten<\/td><td>20 bis 30 Rp\.<\/td><td>6\.0<\/td><td>0\.40<\/td><td>1\.50<\/td><td class="ems-ok">-1\.10<\/td>/);
  assert.match(html, /<td>entladen<\/td><td>entladen<\/td><td>ab 30 Rp\.<\/td><td>3\.5<\/td><td>1\.90<\/td><td>1\.10<\/td><td class="ems-bad">\+0\.80<\/td>/);
  const none = await start(scenario({ cfg: { ...fullCfg, compare: true }, shadow: { ledger: { days: [], today: null, total: { days: 0 }, breakdown: [] } } }));
  assert.match(none.els.get('ems-cmp-data').innerHTML, /füllt sich ab jetzt viertelstündlich/);
});

test('Vergleich: eigenes Szenario (Tage vorne) und Eichung gegen den Zähler mit Abweichung in Prozent; ohne Messung ein Hinweis', async () => {
  const ui = await start(scenario({
    cfg: { ...fullCfg, compare: true },
    shadow: {
      overallAgreePct: 60,
      days: [],
      ledger: {
        days: [{
          day: '2026-11-16', mine: 3, other: 2, none: 6, hours: 24, v: { mine: 1.5, other: 2, none: 6, hours: 24 }, cal: {},
        }],
        today: {
          day: '2026-11-17', mine: 1, other: 1, none: 2, hours: 5, v: { mine: 0.9, other: 1.1, none: 2, hours: 5 }, cal: {},
        },
        total: { days: 1, mine: 3, other: 2, none: 6 },
        virt: {
          windows: 2, hours: 29, mine: 2.4, other: 3.1, none: 8, closedDays: 1, wonDays: 1,
        },
        cal: {
          windows: 2, hours: 29, realChf: 3.0, simChf: 3.15, realRawChf: 3.1, simRawChf: 3.2, realImpKwh: 20, simImpKwh: 21, realExpKwh: 8, simExpKwh: 8.5, socErr: 4.2,
        },
        breakdown: [],
      },
    },
  }));
  const html = ui.els.get('ems-cmp-data').innerHTML;
  assert.match(html, /16\.11\. \(24 Std\.\)<\/td><td>1\.50<\/td><td>2\.00<\/td><td>6\.00<\/td><td class="ems-ok">-0\.50<\/td>/, 'Tageszeile des eigenen Szenarios');
  assert.match(html, /Tage vorne: 1 von 1/);
  assert.match(html, /Eichung: Modell gegen den Netzzähler/);
  assert.match(html, /<td>Kosten CHF<\/td><td>3\.00<\/td><td>3\.15<\/td>/);
  assert.match(html, /Abweichung der Kosten: <span class="ems-ok">\+5\.0 %<\/span>/);
  assert.match(html, /Ladestand-Abweichung \(Mittel\): 4\.2 %/);
  assert.match(html, /Bisherige Rechnung/);
  const none = await start(scenario({ cfg: { ...fullCfg, compare: true }, shadow: { ledger: { days: [], today: null, total: { days: 0 }, breakdown: [] } } }));
  assert.match(none.els.get('ems-cmp-data').innerHTML, /Noch keine Messung/);
});

test('Vergleich: Spalte «Anderes EMS (Zähler)» mit den echten Kosten und der Differenz dazu', async () => {
  const ui = await start(scenario({
    cfg: { ...fullCfg, compare: true },
    shadow: {
      ledger: {
        days: [{
          day: '2026-11-16', mine: 1, other: 1, none: 2, hours: 24, v: { mine: 1.5, other: 2, none: 6, hours: 24 }, cal: { realChf: 1.8 },
        }],
        total: { days: 1, mine: 1, other: 1, none: 2 },
        virt: {
          windows: 1, hours: 24, mine: 1.5, other: 2, none: 6, closedDays: 1, wonDays: 1,
        },
        cal: {
          windows: 1, hours: 24, realChf: 1.8, simChf: 1.9, realImpKwh: 10, simImpKwh: 10, realExpKwh: 0, simExpKwh: 0, socErr: 1,
        },
      },
    },
  }));
  const html = ui.els.get('ems-cmp-data').innerHTML;
  assert.match(html, /Anderes EMS \(Zähler\)/);
  assert.match(html, /16\.11\. \(24 Std\.\)<\/td><td>1\.50<\/td><td>2\.00<\/td><td>6\.00<\/td><td class="ems-ok">-0\.50<\/td><td>1\.80<\/td><td class="ems-ok">-0\.30<\/td>/);
});

test('Setup: Plan-Genauigkeit zeigt Fehler beider Methoden, die bessere und «noch n von m Tagen»', async () => {
  const env = await start(scenario({
    shadow: {
      planAccuracy: {
        needed: 5,
        load: {
          windows: [
            {
              key: 'm', from: 5, to: 10, days: 9, actualKwh: 4.2, mean: { errPct: 18.4, biasPct: 6 }, robust: { errPct: 9.1, biasPct: 1 }, better: 'robust',
            },
            {
              key: 'd', from: 10, to: 17, days: 9, actualKwh: 5, mean: { errPct: 20, biasPct: 0 }, robust: { errPct: 19, biasPct: 0 }, better: null,
            },
            {
              key: 'e', from: 17, to: 22, days: 2, actualKwh: 6, mean: null, robust: null, better: null,
            },
          ],
        },
        pv: {
          days: 7, plain: { errPct: 35.2, biasPct: 20 }, nowcast: { errPct: 22.5, biasPct: 5 }, better: 'nowcast',
        },
      },
    },
  }));
  click(env, 'ems-view-devices', { 'data-ems-open': 'src-fc' });
  const html = setup(env);
  assert.match(html, /Plan-Genauigkeit \(Lernbericht\)/);
  assert.match(html, /Verbrauch Morgen 05-10<\/td><td>9<\/td><td>18\.4 %<\/td><td>9\.1 %<\/td><td class="ems-ok">robust<\/td>/);
  assert.match(html, /Verbrauch Tag 10-17<\/td><td>9<\/td><td>20\.0 %<\/td><td>19\.0 %<\/td><td class="">gleich gut<\/td>/);
  assert.match(html, /Verbrauch Abend 17-22<\/td><td>noch 2 von 5 Tagen<\/td><td>–<\/td><td>–<\/td><td class="">–<\/td>/);
  assert.match(html, /Solar: Rest des Tages ab 10:30<\/td><td>7<\/td><td>35\.2 %<\/td><td>22\.5 %<\/td><td class="ems-ok">mit Morgen-Korrektur<\/td>/);
});
