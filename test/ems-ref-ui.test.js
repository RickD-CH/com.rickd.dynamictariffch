'use strict';

// Einstellungsseite: gelöschte Geräte und Flows werden im Kasten oben, an den Zeilen und in der Zusammenfassung angezeigt; «Verweis entfernen» ruft den Server.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizeConfig } = require('../lib/ems/Config');

const emsJs = fs.readFileSync(path.join(__dirname, '../settings/ems.js'), 'utf8');

async function openSetup({ refs, lang = 'de', config }) {
  const els = new Map();
  const handlers = {};
  const el = (id) => {
    if (!els.has(id)) {
      els.set(id, {
        id, innerHTML: '', textContent: '', value: '', checked: false, hidden: false, classList: { contains: () => true, toggle() {} }, addEventListener: (t, f) => { handlers[`${id}:${t}`] = f; },
      });
    }
    return els.get(id);
  };
  const ctx = {
    document: { getElementById: el }, window: {}, setInterval: () => 0, console, Object, Promise, Date, Number, isFinite, String, JSON, Math,
  };
  vm.createContext(ctx);
  vm.runInContext(emsJs, ctx);
  const cfg = config || normalizeConfig({
    enabled: true,
    devices: { meter: { id: 'em' } },
    battery: { deviceId: 'bat' },
    car: { deviceId: 'car' },
    consumers: [{ id: 'sock', name: 'eBike', mode: 'surplus' }],
  });
  const calls = [];
  let issues = refs;
  const res = {
    'GET /ems/shadow': {
      enabled: true, deviceExists: true, shadow: true, config: cfg, pv: {}, current: null, charger: { current: null },
    },
    'GET /ems/consumers': { current: [], events: [] },
    'GET /ems/devices': { devices: [{ id: 'em', name: 'Zähler', caps: ['measure_power'] }, { id: 'bat', name: 'Batterie', caps: ['measure_battery'] }] },
    'GET /ems/flows': { flows: [] },
    'GET /meters': null,
    'GET /ems/plan': null,
    'GET /ems/jobs': { jobs: [] },
    'GET /ems/command-flows': { ok: true, status: {} },
    'GET /ems/ref-check?fresh=1': null,
  };
  const api = (m, p, b) => {
    calls.push([m, p, b]);
    if (p === '/ems/ref-check?fresh=1') return Promise.resolve({ ok: true, issues });
    if (m === 'POST' && p === '/ems/ref-clear') {
      issues = issues.filter((i) => i.key !== b.key);
      return Promise.resolve({ ok: true, issues });
    }
    return Promise.resolve(res[`${m} ${p}`]);
  };
  await ctx.window.EmsUi.init(api, lang);
  return {
    html: () => els.get('ems-view-devices').innerHTML, handlers, calls, ctx,
  };
}

const CAR = {
  key: 'car.deviceId', area: 'car', field: 'device', kind: 'device', problem: 'device', name: '', id: 'car', critical: false, fixable: true, removes: 'ref',
};
const BIKE = {
  key: 'consumer.sock', area: 'consumer', field: 'device', kind: 'device', problem: 'device', name: 'eBike', id: 'sock', critical: false, fixable: true, removes: 'consumer',
};

test('Einrichtung ohne Probleme: kein Kasten, keine roten Abzeichen', async () => {
  const ui = await openSetup({ refs: [] });
  assert.ok(!ui.html().includes('Gelöschte Geräte oder Flows'));
  assert.ok(!ui.html().includes('Gerät gelöscht'));
});

test('Gelöschtes E-Auto: Kasten oben, Abzeichen an der Zeile, Zusammenfassung statt UUID', async () => {
  const ui = await openSetup({ refs: [CAR] });
  const h = ui.html();
  assert.match(h, /Gelöschte Geräte oder Flows/);
  assert.match(h, /E-Auto: Gerät gelöscht/);
  assert.match(h, /data-ems-refclear="car.deviceId">Verweis entfernen/);
  assert.match(h, /ems-tag-required" title="E-Auto: Gerät gelöscht">Gerät gelöscht/, 'Abzeichen an der Zeile «E-Auto»');
  assert.ok(!h.includes('>car<'), 'nicht die rohe Geräte-ID anzeigen');
});

test('Gelöschter Verbraucher: Abzeichen an seiner Zeile und Knopf «Verbraucher entfernen»', async () => {
  const ui = await openSetup({ refs: [BIKE] });
  const h = ui.html();
  assert.match(h, /data-ems-refclear="consumer.sock">Verbraucher entfernen/);
  assert.match(h, /eBike: Gerät gelöscht/);
});

test('Entfernen: ruft den Server, lädt die Konfiguration neu und der Kasten verschwindet', async () => {
  const ui = await openSetup({ refs: [CAR] });
  ui.handlers['ems-view-devices:click']({ target: { getAttribute: (n) => (n === 'data-ems-refclear' ? 'car.deviceId' : null), parentNode: null } });
  await new Promise((r) => setTimeout(r, 30));
  const post = ui.calls.find((c) => c[0] === 'POST' && c[1] === '/ems/ref-clear');
  assert.deepEqual(JSON.parse(JSON.stringify(post[2])), { key: 'car.deviceId' });
  assert.ok(!ui.html().includes('Gelöschte Geräte oder Flows'));
  assert.ok(ui.calls.filter((c) => c[1] === '/ems/shadow').length >= 2, 'Konfiguration wurde neu geholt');
});

test('Englisch: Texte vorhanden', async () => {
  const ui = await openSetup({ refs: [{ ...CAR, problem: 'capability', caps: ['measure_battery'] }], lang: 'en' });
  const h = ui.html();
  assert.match(h, /Deleted devices or flows/);
  assert.match(h, /EV: Capability missing \(measure_battery\)/);
  assert.match(h, /Remove reference/);
});

test('Mehrere Arten gemischt: Abzeichen «Verweis fehlt»', async () => {
  const ui = await openSetup({
    refs: [
      { ...BIKE, key: 'consumer.sock', problem: 'device' },
      {
        ...BIKE, key: 'consumer.sock.accu', field: 'accu', problem: 'capability', caps: ['x'], removes: 'ref',
      },
    ],
  });
  assert.match(ui.html(), />Verweis fehlt</);
});
