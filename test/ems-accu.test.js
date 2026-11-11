'use strict';

// Verbraucher mit Akku (eBike an einer Steckdose): Grenze, Freigabe, Tiefentladeschutz, Höchstdauer.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { evaluateConsumer, makeConsumerState } = require('../lib/ems/planner/consumer');
const { normalizeConfig } = require('../lib/ems/Config');
const { EmsRunner } = require('../lib/ems/EmsRunner');
const { ShadowLog } = require('../lib/ems/ShadowLog');
const { PriceFeed } = require('../lib/ems/PriceFeed');
const { PvFeed } = require('../lib/ems/PvFeed');

const MIN = 60000;
const T0 = Date.UTC(2026, 10, 11, 10, 0, 0);
const accu = {
  enabled: true, sensorId: 'bike', capability: 'measure_battery', stopAt: 80, resumeBelow: 75, chargeBelow: 20, maxRunMin: 240,
};
// eBike: bei Überschuss (300 W, 5 min stabil), ohne Hausbatterie-Bezug
const cfg = {
  mode: 'surplus', minSurplusW: 300, startSustainS: 300, stopGraceS: 120, minRunMin: 0, minOffMin: 0, protectSoc: 0, useForecastGate: false, accu,
};
const env = (over = {}) => ({
  soc: null, gridW: -1500, batteryW: 0, pvW: 3000, share: {}, hasBattery: false, actualOn: null, powerW: null, ...over,
});
const step = (st, nowMs, over) => evaluateConsumer({
  cfg, st, env: env(over), now: nowMs,
});

test('Akku: lädt mit Überschuss, stoppt bei 80 % und lädt erst unter 75 % wieder', () => {
  const st = makeConsumerState();
  assert.equal(step(st, T0, { accu: 50 }).wantOn, false, 'Überschuss muss erst 5 min anstehen');
  const on = step(st, T0 + 5 * MIN, { accu: 50 });
  assert.equal(on.wantOn, true);
  assert.deepEqual(on.commands, [{ type: 'on' }]);
  const full = step(st, T0 + 60 * MIN, { accu: 80 });
  assert.equal(full.wantOn, false);
  assert.deepEqual(full.commands, [{ type: 'off' }]);
  assert.match(full.reason, /Akku 80 % >= 80 % \(frei unter 75 %\)/);
  step(st, T0 + 61 * MIN, { accu: 78 });
  assert.equal(step(st, T0 + 70 * MIN, { accu: 78 }).wantOn, false, 'trotz Überschuss gesperrt (78 % > 75 %)');
  assert.match(step(st, T0 + 71 * MIN, { accu: 76 }).reason, /Akku geladen \(frei unter 75 %\)/);
  step(st, T0 + 80 * MIN, { accu: 74 });
  assert.equal(step(st, T0 + 86 * MIN, { accu: 74 }).wantOn, true, 'unter 75 %: wieder frei');
});

test('Akku: unter 20 % wird auch ohne Überschuss geladen, bis 30 %; ein Auftrag stoppt trotzdem bei 80 %', () => {
  const st = makeConsumerState();
  const low = step(st, T0, { accu: 15, gridW: 500 });
  assert.equal(low.wantOn, true);
  assert.match(low.reason, /Akku 15 % unter 20 %: wird geladen/);
  assert.equal(step(st, T0 + 30 * MIN, { accu: 25, gridW: 500 }).wantOn, true);
  step(st, T0 + 60 * MIN, { accu: 30, gridW: 500 });
  assert.equal(step(st, T0 + 63 * MIN, { accu: 31, gridW: 500 }).wantOn, false, 'ab 30 %: normale Regel (kein Überschuss, nach der Nachlaufzeit aus)');
  const job = makeConsumerState();
  const r = evaluateConsumer({
    cfg, st: job, env: env({ accu: 82, gridW: 500, job: { wantOn: true, reason: 'Auftrag' } }), now: T0,
  });
  assert.equal(r.wantOn, false, 'Akkugrenze geht vor den Auftrag');
});

test('Akku: Sicherheit nach 240 min am Stück, gesperrt bis unter 75 % oder ohne Ladestand 12 h', () => {
  const st = makeConsumerState();
  step(st, T0, { accu: null });
  step(st, T0 + 5 * MIN, { accu: null });
  assert.equal(st.isOn, true);
  assert.equal(step(st, T0 + 200 * MIN, { accu: null }).wantOn, true);
  const stop = step(st, T0 + 245 * MIN, { accu: null });
  assert.equal(stop.wantOn, false);
  assert.match(stop.reason, /Sicherheit: 240 min am Stück geladen, Ladestand unbekannt/);
  assert.equal(step(st, T0 + 8 * 60 * MIN, { accu: null }).wantOn, false, 'gesperrt');
  step(st, T0 + 18 * 60 * MIN, { accu: null });
  assert.equal(st.accuFull, false, 'nach 12 h ohne Ladestand frei');
  const known = makeConsumerState();
  step(known, T0, { accu: 40 });
  step(known, T0 + 5 * MIN, { accu: 40 });
  step(known, T0 + 250 * MIN, { accu: 70 });
  assert.equal(known.accuFull, true);
  step(known, T0 + 260 * MIN, { accu: 70 });
  assert.equal(known.accuFull, false, 'Ladestand bekannt und unter 75 %: wieder frei');
  const none = { ...cfg, accu: { ...accu, maxRunMin: 0 } };
  const st0 = makeConsumerState();
  evaluateConsumer({ cfg: none, st: st0, env: env(), now: T0 });
  evaluateConsumer({ cfg: none, st: st0, env: env(), now: T0 + 5 * MIN });
  assert.equal(evaluateConsumer({ cfg: none, st: st0, env: env(), now: T0 + 600 * MIN }).wantOn, true, '0 = ohne Höchstdauer');
});

test('Config: Akku-Grenzen in sinnvoller Reihenfolge, ohne Sensor aus', () => {
  const c = normalizeConfig({ consumers: [{ id: 'plug', name: 'eBike', accu: { enabled: true, sensorId: 'bike', stopAt: 70, resumeBelow: 90, chargeBelow: 80 } }] }).consumers[0].accu;
  assert.equal(c.enabled, true);
  assert.equal(c.stopAt, 70);
  assert.equal(c.resumeBelow, 65);
  assert.equal(c.chargeBelow, 55);
  assert.equal(c.maxRunMin, 240);
  assert.equal(normalizeConfig({ consumers: [{ id: 'p', accu: { enabled: true } }] }).consumers[0].accu.enabled, false);
});

test('Runner: liest den Ladestand vom gewählten Gerät (auch 0 bis 1) und schaltet die Steckdose', async () => {
  const config = normalizeConfig({
    enabled: true,
    devices: { meter: { id: 'm' } },
    charger: { enabled: false },
    consumers: [{
      id: 'plug', name: 'eBike', mode: 'surplus', minSurplusW: 300, startSustainS: 0, accu: { ...accu, capability: 'measure_battery.ebike' },
    }],
  });
  const read = [];
  const runner = new EmsRunner({
    getConfig: () => config,
    prices: new PriceFeed(() => null),
    pv: new PvFeed(null, () => {}, { get: async () => ({ slots: [], stale: true }) }),
    inputs: {
      chargerInputs: async () => ({
        gridW: -1200, houseW: 300, pvW: 1500, batterySoc: null, batteryW: 0, chargerRead: false, chargerConnected: false, chargerPowerW: 0, other: null,
      }),
      consumerStates: async (ids) => {
        read.push(...ids);
        return new Map(ids.map((id) => [id, id === 'bike' ? { available: true, values: { 'measure_battery.ebike': 0.85 } } : { actualOn: false, powerW: 0, available: true, values: {} }]));
      },
    },
    actuators: { charger: async () => ({}), consumer: async (id, on) => ({ cmd: on ? 'on' : 'off' }) },
    shadowLog: new ShadowLog({ get() {}, set() {} }),
    store: null,
  });
  await runner.tickCharger(T0);
  assert.ok(read.includes('bike'), 'Ladestand-Gerät wird gelesen');
  assert.equal(runner.consumerCurrent[0].wantOn, false);
  assert.match(runner.consumerCurrent[0].reason, /Akku 85 % >= 80 %/);
});

test('Anzeige: Akku-Block bei jedem Verbraucher, Felder erst nach dem Einschalten, wird gespeichert', async () => {
  const emsJs = fs.readFileSync(path.join(__dirname, '../settings/ems.js'), 'utf8');
  const els = new Map();
  const handlers = {};
  const el = (id) => {
    if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '', value: '', checked: false, hidden: false, classList: { contains: () => true, toggle() {} }, addEventListener: (t, f) => { handlers[`${id}:${t}`] = f; } });
    return els.get(id);
  };
  const ctx = { document: { getElementById: el }, window: {}, setInterval: () => 0, console, Object, Promise, Date, Number, isFinite, String, JSON, Math };
  vm.createContext(ctx);
  vm.runInContext(emsJs, ctx);
  const config = normalizeConfig({ enabled: true, devices: { meter: { id: 'em' } }, consumers: [{ id: 'plug', name: 'eBike', mode: 'surplus' }] });
  const res = {
    'GET /ems/shadow': { enabled: true, deviceExists: true, shadow: true, config, pv: {}, current: null, charger: { current: null } },
    'GET /ems/consumers': { current: [], events: [] },
    'GET /ems/devices': { devices: [{ id: 'plug', name: 'Steckdose', caps: ['onoff', 'measure_power'] }, { id: 'bike', name: 'eBike Bridge', caps: ['measure_battery.ebike_battery_so', 'measure_duration'] }] },
    'GET /ems/flows': { flows: [] },
    'GET /meters': null,
  };
  await ctx.window.EmsUi.init((m, p) => Promise.resolve(res[`${m} ${p}`]), 'de');
  const click = (attr, v) => handlers['ems-view-devices:click']({ target: { getAttribute: (n) => (n === attr ? v : null), parentNode: null } });
  const rowIdx = ctx.window.EmsUi._state.rows.findIndex((r) => r.name === 'eBike');
  click('data-ems-open', `row${rowIdx}`);
  let html = els.get('ems-view-devices').innerHTML;
  assert.match(html, /Akku \(z\. B\. eBike, Rasenmäher\)/);
  assert.doesNotMatch(html, /Stoppen bei/, 'Felder erst nach dem Einschalten');
  const pre = `row${rowIdx}-accuEnable`;
  el(pre).checked = true;
  handlers['ems-view-devices:change']({ target: { id: pre, getAttribute: () => null, parentNode: null } });
  html = els.get('ems-view-devices').innerHTML;
  assert.match(html, /Stoppen bei \(%\)/);
  assert.match(html, /<option value="bike">eBike Bridge<\/option>/);
  const base = pre.replace(/accuEnable$/, '');
  el(`${base}accuSensor`).value = 'bike';
  el(`${base}accuCap`).value = 'measure_battery';
  el(`${base}accuStop`).value = '80';
  el(`${base}accuResume`).value = '75';
  el(`${base}accuLow`).value = '20';
  el(`${base}accuMax`).value = '240';
  const body = ctx.window.EmsUi._collect().ems.consumers.find((c) => c.name === 'eBike');
  assert.equal(body.accu.enabled, true);
  assert.equal(body.accu.sensorId, 'bike');
  assert.equal(body.accu.capability, 'measure_battery.ebike_battery_so', 'unpassender Wert: erster Batterie-Wert des Geräts');
  assert.equal(body.accu.stopAt, 80);
});
