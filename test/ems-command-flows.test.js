'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { commandFlowStatus, stateOf } = require('../lib/ems/commandFlows');

const T = 'homey:app:com.rickd.dynamictariffch:ems_command';
const adv = (id, name, triggers, extra = {}) => ({
  id, name, enabled: true, broken: false, ...extra, cards: Object.fromEntries(triggers.map((t, i) => [`c${id}${i}`, { type: 'trigger', id: T, args: { command: { id: t.cmd } }, outputSuccess: t.out === false ? [] : ['x'] }])),
});

test('Befehls-Flows: erweiterter Flow mit mehreren Auslösern zählt für jeden Befehl', () => {
  const r = commandFlowStatus(['battery.hold', 'battery.normal', 'battery.charge'], {}, { a: adv('a', 'Batterie', [{ cmd: 'battery.hold' }, { cmd: 'battery.normal' }]) });
  assert.equal(r['battery.hold'].state, 'ok');
  assert.equal(r['battery.normal'].state, 'ok');
  assert.equal(r['battery.charge'].state, 'missing');
  assert.deepEqual(r['battery.hold'].flows, [{ id: 'a', name: 'Batterie', advanced: true }]);
});

test('Befehls-Flows: Standard-Flow, ausgeschaltet, defekt und ohne Aktion', () => {
  const std = {
    s1: { id: 's1', name: 'Wallbox', enabled: true, trigger: { id: T, args: { command: { id: 'charger.set' } } }, actions: [{}] },
    s2: { id: 's2', name: 'Aus', enabled: false, trigger: { id: T, args: { command: { id: 'charger.stop' } } }, actions: [{}] },
    s3: { id: 's3', name: 'Leer', enabled: true, trigger: { id: T, args: { command: { id: 'charger.start' } } }, actions: [] },
  };
  const advanced = { b: adv('b', 'Kaputt', [{ cmd: 'dhw.normal' }], { broken: true }) };
  const r = commandFlowStatus(['charger.set', 'charger.stop', 'charger.start', 'dhw.normal'], std, advanced);
  assert.equal(r['charger.set'].state, 'ok');
  assert.equal(r['charger.stop'].state, 'off');
  assert.equal(r['charger.start'].state, 'empty');
  assert.equal(r['dhw.normal'].state, 'broken');
});

test('Befehls-Flows: ein guter Flow gewinnt gegen einen ausgeschalteten; fremde Auslöser und andere Argumente zählen nicht', () => {
  const advanced = {
    a: adv('a', 'Alt', [{ cmd: 'battery.hold' }], { enabled: false }),
    b: adv('b', 'Neu', [{ cmd: 'battery.hold' }]),
    c: { id: 'c', name: 'Fremd', enabled: true, cards: { x: { type: 'trigger', id: 'homey:app:other:ems_command', args: { command: { id: 'battery.charge' } }, outputSuccess: ['y'] }, z: { type: 'action', id: T, args: { command: { id: 'battery.charge' } } } } },
  };
  const r = commandFlowStatus(['battery.hold', 'battery.charge'], {}, advanced);
  assert.equal(r['battery.hold'].state, 'ok');
  assert.equal(r['battery.hold'].flows.length, 2);
  assert.equal(r['battery.charge'].state, 'missing', 'fremde App mit gleichem Kartennamen zählt nicht');
});

test('Befehls-Flows: leere oder fehlende Listen', () => {
  assert.deepEqual(commandFlowStatus(['x'], null, undefined), { x: { state: 'missing', flows: [] } });
  assert.equal(stateOf([]), 'missing');
});

test('Anzeige: Badge je Befehl und je Zeile (Batterie, Verbraucher), Zusammenfassung bei den Flow-Rezepten', async () => {
  const fs = require('node:fs'); // eslint-disable-line global-require
  const path = require('node:path'); // eslint-disable-line global-require
  const vm = require('node:vm'); // eslint-disable-line global-require
  const { normalizeConfig } = require('../lib/ems/Config'); // eslint-disable-line global-require
  const emsJs = fs.readFileSync(path.join(__dirname, '../settings/ems.js'), 'utf8');
  const els = new Map();
  const handlers = {};
  const el = (id) => { if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '', value: '', checked: false, hidden: false, classList: { contains: () => true, toggle() {} }, addEventListener: (t, f) => { handlers[`${id}:${t}`] = f; } }); return els.get(id); };
  const ctx = { document: { getElementById: el }, window: {}, setInterval: () => 0, console, Object, Promise, Date, Number, isFinite, String, JSON, Math };
  vm.createContext(ctx);
  vm.runInContext(emsJs, ctx);
  const config = normalizeConfig({
    enabled: true, devices: { meter: { id: 'em' } }, battery: { deviceId: 'bat', control: { enabled: true } },
    consumers: [{ id: 'flow:a', name: 'Entfeuchter', enabled: true, controlKind: 'flow' }],
  });
  const commands = [
    { id: 'battery.charge', title: 'Batterie: aus dem Netz laden', group: 'battery', groupTitle: 'Batterie' },
    { id: 'battery.hold', title: 'Batterie: halten', group: 'battery', groupTitle: 'Batterie' },
    { id: 'battery.normal', title: 'Batterie: Normalbetrieb', group: 'battery', groupTitle: 'Batterie' },
    { id: 'consumer.flow:a.on', title: 'Entfeuchter: einschalten', group: 'consumer', groupTitle: 'Verbraucher' },
    { id: 'consumer.flow:a.off', title: 'Entfeuchter: ausschalten', group: 'consumer', groupTitle: 'Verbraucher' },
  ];
  const status = {
    'battery.charge': { state: 'ok', flows: [{ id: 'f', name: 'Batterie-Flow', advanced: true }] },
    'battery.hold': { state: 'missing', flows: [] },
    'battery.normal': { state: 'off', flows: [{ id: 'f', name: 'Batterie-Flow', advanced: true }] },
    'consumer.flow:a.on': { state: 'ok', flows: [{ id: 'g', name: 'Entfeuchter-Flow', advanced: true }] },
    'consumer.flow:a.off': { state: 'ok', flows: [{ id: 'g', name: 'Entfeuchter-Flow', advanced: true }] },
  };
  const res = {
    'GET /ems/shadow': { enabled: true, deviceExists: true, shadow: true, config, pv: {}, current: null, charger: { current: null }, commands },
    'GET /ems/consumers': { current: [], events: [] },
    'GET /ems/devices': { devices: [] }, 'GET /ems/flows': { flows: [] }, 'GET /meters': null,
    'GET /ems/command-flows': { ok: true, status },
  };
  await ctx.window.EmsUi.init((m, p) => Promise.resolve(res[`${m} ${p}`]), 'de');
  const open = async (key) => { handlers['ems-view-devices:click']({ target: { getAttribute: (n) => (n === 'data-ems-open' ? key : null), parentNode: null } }); await new Promise((r) => setTimeout(r, 15)); };
  await open('src-bat');
  await open('row0');
  await open('cmd');
  const html = els.get('ems-view-devices').innerHTML;
  assert.match(html, /Batterie-Flow/, 'Name des Flows beim guten Befehl');
  assert.match(html, /Kein Flow/, 'fehlender Befehl');
  assert.match(html, /Flow ist ausgeschaltet/, 'ausgeschalteter Flow');
  assert.match(html, /Kein Flow \(2\/3\)/, 'Zeile Batterie: schlechtester Zustand mit Zahl');
  assert.match(html, /margin-right:4px"><\/span>Flow<\/span>/, 'Zeile Entfeuchter: alles in Ordnung, kurz');
  assert.match(html, /3\/5 mit Flow/, 'Zusammenfassung');
});

test('Auslöser ohne Befehl (Warmwasser-Soll): Flow vorhanden, ausgeschaltet oder fehlt', () => {
  const { triggerFlowStatus } = require('../lib/ems/commandFlows'); // eslint-disable-line global-require
  const card = 'homey:app:com.rickd.dynamictariffch:ems_dhw_setpoint';
  const std = { s: { id: 's', name: 'WP', enabled: true, trigger: { id: card }, actions: [{}] } };
  assert.equal(triggerFlowStatus('ems_dhw_setpoint', std, {}).state, 'ok');
  assert.equal(triggerFlowStatus('ems_dhw_setpoint', { s: { ...std.s, enabled: false } }, {}).state, 'off');
  assert.equal(triggerFlowStatus('ems_dhw_setpoint', {}, { a: { id: 'a', name: 'X', enabled: true, cards: { c: { type: 'trigger', id: card, outputSuccess: ['y'] } } } }).state, 'ok');
  assert.equal(triggerFlowStatus('ems_dhw_setpoint', {}, {}).state, 'missing');
});

test('Anzeige: «Steuerung fehlt» bei neuem Verbraucher ohne Gerät, «Gerät fehlt» bei Wallbox ohne Gerät; Kostenzähler ohne Warnung', async () => {
  const fs = require('node:fs'); // eslint-disable-line global-require
  const path = require('node:path'); // eslint-disable-line global-require
  const vm = require('node:vm'); // eslint-disable-line global-require
  const { normalizeConfig } = require('../lib/ems/Config'); // eslint-disable-line global-require
  const emsJs = fs.readFileSync(path.join(__dirname, '../settings/ems.js'), 'utf8');
  const els = new Map();
  const handlers = {};
  const el = (id) => { if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '', value: '', checked: false, hidden: false, classList: { contains: () => true, toggle() {} }, addEventListener: (t, f) => { handlers[`${id}:${t}`] = f; } }); return els.get(id); };
  const ctx = { document: { getElementById: el }, window: {}, setInterval: () => 0, console, Object, Promise, Date, Number, isFinite, String, JSON, Math };
  vm.createContext(ctx);
  vm.runInContext(emsJs, ctx);
  const config = normalizeConfig({ enabled: true, devices: { meter: { id: 'em' } } });
  const res = {
    'GET /ems/shadow': { enabled: true, deviceExists: true, shadow: true, config, pv: {}, current: null, charger: { current: null }, commands: [] },
    'GET /ems/consumers': { current: [], events: [] },
    'GET /ems/devices': { devices: [] }, 'GET /ems/flows': { flows: [] }, 'GET /meters': null,
    'GET /ems/command-flows': { ok: true, status: {} },
  };
  await ctx.window.EmsUi.init((m, p) => Promise.resolve(res[`${m} ${p}`]), 'de');
  const st = ctx.window.EmsUi._state;
  st.rows.length = 0;
  st.rows.push({ kind: 'consumer', name: 'Neu', control: true, deviceId: '', type: 'generic', mode: 'surplus' });
  st.rows.push({ kind: 'consumer', name: 'Zähler', control: false, deviceId: '', type: 'generic', mode: 'surplus' });
  st.rows.push({ kind: 'charger', name: 'Wallbox', control: true, deviceId: '' });
  ctx.window.EmsUi._render();
  const html = els.get('ems-view-devices').innerHTML;
  assert.equal((html.match(/Steuerung fehlt/g) || []).length, 1, 'nur der neue Verbraucher, nicht der Kostenzähler');
  assert.equal((html.match(/Gerät fehlt/g) || []).length, 1, 'Wallbox ohne Gerät');
});

test('Anzeige: «Testen» zeigt die Rückmeldung direkt neben dem Knopf (erfolgreich und fehlgeschlagen)', async () => {
  const fs = require('node:fs'); // eslint-disable-line global-require
  const path = require('node:path'); // eslint-disable-line global-require
  const vm = require('node:vm'); // eslint-disable-line global-require
  const { normalizeConfig } = require('../lib/ems/Config'); // eslint-disable-line global-require
  const emsJs = fs.readFileSync(path.join(__dirname, '../settings/ems.js'), 'utf8');
  const els = new Map();
  const handlers = {};
  const el = (id) => { if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '', value: '', checked: false, hidden: false, classList: { contains: () => true, toggle() {} }, addEventListener: (t, f) => { handlers[`${id}:${t}`] = f; } }); return els.get(id); };
  const ctx = { document: { getElementById: el }, window: {}, setInterval: () => 0, setTimeout: () => 0, console, Object, Promise, Date, Number, isFinite, String, JSON, Math };
  vm.createContext(ctx);
  vm.runInContext(emsJs, ctx);
  const config = normalizeConfig({ enabled: true, devices: { meter: { id: 'em' } } });
  const commands = [{ id: 'battery.hold', title: 'Batterie: halten', group: 'battery', groupTitle: 'Batterie' }, { id: 'battery.normal', title: 'Batterie: Normalbetrieb', group: 'battery', groupTitle: 'Batterie' }];
  let fail = false;
  const res = {
    'GET /ems/shadow': { enabled: true, deviceExists: true, shadow: true, config, pv: {}, current: null, charger: { current: null }, commands },
    'GET /ems/consumers': { current: [], events: [] },
    'GET /ems/devices': { devices: [] }, 'GET /ems/flows': { flows: [] }, 'GET /meters': null,
    'GET /ems/command-flows': { ok: true, status: {} },
  };
  await ctx.window.EmsUi.init((m, p) => (m === 'POST' && p === '/ems/command-test' ? (fail ? Promise.reject(new Error('Gerät antwortet nicht')) : Promise.resolve({ ok: true })) : Promise.resolve(res[`${m} ${p}`])), 'de');
  const click = async (attr, val) => { handlers['ems-view-devices:click']({ target: { getAttribute: (n) => (n === attr ? val : null), parentNode: null } }); await new Promise((r) => setTimeout(r, 15)); };
  await click('data-ems-open', 'cmd');
  await click('data-ems-cmdtest', 'battery.hold');
  assert.match(els.get('ems-view-devices').innerHTML, /data-ems-cmdtest="battery\.hold">Testen<\/button> <span class="ems-ok">✓ Befehl ausgegeben<\/span>/);
  assert.doesNotMatch(els.get('ems-view-devices').innerHTML, /data-ems-cmdtest="battery\.normal">Testen<\/button> <span/, 'nur beim gedrückten Befehl');
  fail = true;
  await click('data-ems-cmdtest', 'battery.normal');
  assert.match(els.get('ems-view-devices').innerHTML, /<span class="ems-bad">✗ Befehl fehlgeschlagen: Gerät antwortet nicht<\/span>/);
});
