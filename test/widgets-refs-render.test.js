'use strict';

// Die beiden Widget-Seiten wirklich ausführen (mit Attrappe für Seite und Homey) und prüfen, was bei gelöschten Geräten/Flows angezeigt wird.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const de = JSON.parse(fs.readFileSync(path.join(root, 'locales/de.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(root, 'locales/en.json'), 'utf8'));

function lookup(tree, key) {
  return key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), tree);
}

async function renderWidget(file, apiPath, data, lang = de) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const code = scripts.filter((s) => s.includes('function onHomeyReady')).join(';');
  const els = {};
  const el = (id) => els[id] || (els[id] = {
    id, innerHTML: '', textContent: '', style: {}, addEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
  });
  const document = {
    getElementById: el, body: { scrollHeight: 100 }, querySelectorAll: () => [], addEventListener() {}, documentElement: { style: {} },
  };
  const Homey = {
    __: (k) => { const v = lookup(lang, k); return typeof v === 'string' ? v : `«${k}»`; },
    api: async (method, p) => { assert.equal(p, apiPath); return JSON.parse(JSON.stringify(data)); },
    ready() {}, setHeight() {},
  };
  const ctx = vm.createContext({
    document, window: {}, console, setInterval: () => 0, setTimeout: () => 0, clearTimeout() {}, Math, JSON, Date, Number, String, Object, Array, isFinite, parseFloat,
  });
  vm.runInContext(`${code}\nthis.__ready = onHomeyReady;`, ctx);
  ctx.__ready(Homey);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  return el('root').innerHTML;
}

const REFS = {
  critical: 1,
  issues: [
    { area: 'battery', field: 'device', problem: 'device', name: '', caps: null, critical: true },
    { area: 'car', field: 'device', problem: 'capability', name: 'Mein Auto', caps: ['measure_battery'], critical: false },
    { area: 'consumer', field: 'flowOn', problem: 'flow', name: 'Entfeuchter', caps: null, critical: false },
  ],
};

const planData = (refs) => ({
  ems: true, enabled: true, silent: false, hasBattery: false, hasCharger: false, price: 31.5, min: 20, max: 40, battery: null, charger: null,
  slots: [{ i: 0, time: '17:00', price: 31.5 }, { i: 1, time: '17:15', price: 30 }], ticks: [], nowIdx: 0, refs,
});

test('Plan-Widget: ohne Verweisprobleme keine Warnzeile', async () => {
  const h = await renderWidget('widgets/plan/public/index.html', '/plan', planData(null));
  assert.ok(!h.includes('refwarn'), h.slice(0, 300));
});

test('Plan-Widget: Warnzeile nennt die betroffenen Bereiche, bei kritischen in Rot', async () => {
  const h = await renderWidget('widgets/plan/public/index.html', '/plan', planData(REFS));
  assert.match(h, /class="refwarn crit"/);
  assert.match(h, /Gelöscht: Batterie, Mein Auto, Entfeuchter/);
  assert.ok(!h.includes('«refs.'), 'alle Texte sind übersetzt');
  const nonCrit = await renderWidget('widgets/plan/public/index.html', '/plan', planData({ critical: 0, issues: [REFS.issues[1]] }));
  assert.match(nonCrit, /class="refwarn"/);
  assert.match(nonCrit, /Capability fehlt \(measure_battery\)/, 'Einzelheiten stehen im Tooltip');
});

test('Plan-Widget (Englisch): Texte vorhanden', async () => {
  const h = await renderWidget('widgets/plan/public/index.html', '/plan', planData(REFS), en);
  assert.match(h, /Deleted: Battery, Mein Auto, Entfeuchter/);
  assert.ok(!h.includes('«refs.'));
});

const consData = (refs) => ({
  ems: true, silent: false, car: null, sgready: null, dhw: null, consumers: [], refs,
});

test('Verbraucher-Widget: Liste der gelöschten Verweise mit Hinweis, ohne Probleme nichts', async () => {
  const none = await renderWidget('widgets/consumers/public/index.html', '/consumers', consData(null));
  assert.ok(!none.includes('class="refs'));
  const h = await renderWidget('widgets/consumers/public/index.html', '/consumers', consData(REFS));
  assert.match(h, /class="refs crit"/);
  assert.match(h, /Batterie: Gerät gelöscht/);
  assert.match(h, /Mein Auto: Capability fehlt \(measure_battery\)/);
  assert.match(h, /Entfeuchter · Flow ein: Flow gelöscht/);
  assert.match(h, /Einstellungen/);
  assert.ok(!h.includes('«refs.'));
});

test('Verbraucher-Widget: mehr als vier Probleme werden zusammengefasst', async () => {
  const many = { critical: 0, issues: Array.from({ length: 6 }, (_, i) => ({ area: 'consumer', field: 'device', problem: 'device', name: `V${i}`, caps: null, critical: false })) };
  const h = await renderWidget('widgets/consumers/public/index.html', '/consumers', consData(many));
  assert.match(h, /V3: Gerät gelöscht/);
  assert.ok(!h.includes('V4: Gerät'));
  assert.match(h, /\+2 weitere/);
});

test('Texte der Verweisprüfung gibt es für jeden Bereich, jedes Feld und jedes Problem in Deutsch und Englisch', () => {
  const { collectRefs } = require('../lib/ems/refCheck');
  const { normalizeConfig } = require('../lib/ems/Config');
  const cfg = normalizeConfig({
    devices: { meter: { id: 'a' }, house: { id: 'a' }, inverter: { id: 'a' } },
    battery: { deviceId: 'b' },
    charger: { id: 'c', phaseSwitch: true, phaseCapability: 'p' },
    car: { deviceId: 'd' },
    pv: { source: 'device', device: { id: 'e', today: 'x', tomorrow: 'y' } },
    consumers: [
      {
        id: 'u1', name: 'A', mode: 'program', program: { enabled: true }, accu: { enabled: true, sensorId: 's' }, humidity: { enabled: true, sensorId: 'h' },
      },
      { id: 'flow:z', name: 'B', controlKind: 'flow', flowOn: { id: 'f1' }, flowOff: { id: 'f2' } },
    ],
    fuse: { enabled: true, meterId: 'm', shed: [{ kind: 'device', id: 'sh', offFlow: { id: 'sf' } }] },
    sgready: {
      enabled: true, output: 'flows', sensorId: 's', modeId: 'm', feedbackId: 'f', flowNormal: { id: 'n' }, flowBoost: { id: 'b' }, flowForced: { id: 'g' },
    },
    dhw: {
      enabled: true, output: 'flows', targetSource: 'device', targetId: 't', sensorId: 's', modeId: 'm', heatingId: 'h', flowOn: { id: 'o' }, flowOff: { id: 'p' }, delay: { enabled: true, flowDelay: { id: 'q' } },
    },
  });
  const sg2 = collectRefs({ ...cfg, sgready: { ...cfg.sgready, output: 'relays', allowForced: true, recommendRelay: { deviceId: 'r', capability: 'onoff' }, forceRelay: { deviceId: 'w', capability: 'onoff' } } });
  const refs = [...collectRefs(cfg), ...sg2.filter((r) => r.area === 'sgready')];
  assert.ok(refs.length > 25, `genug Verweise erfasst (${refs.length})`);
  for (const lang of [de, en]) {
    for (const r of refs) {
      assert.equal(typeof lookup(lang, `refs.area.${r.area}`), 'string', `Bereich ${r.area}`);
      if (r.field !== 'device') assert.equal(typeof lookup(lang, `refs.field.${r.field}`), 'string', `Feld ${r.field}`);
    }
    for (const p of ['device', 'flow', 'capability']) assert.equal(typeof lookup(lang, `refs.problem.${p}`), 'string');
  }
  // dieselben Texte stehen in den Einstellungen (settings/ems.js)
  const src = fs.readFileSync(path.join(root, 'settings/ems.js'), 'utf8');
  for (const r of refs) {
    assert.ok(new RegExp(`\\b${r.area}: '`).test(src), `Einstellungen: Bereich ${r.area}`);
    if (r.field !== 'device') assert.ok(new RegExp(`\\b${r.field}: '`).test(src), `Einstellungen: Feld ${r.field}`);
  }
});
