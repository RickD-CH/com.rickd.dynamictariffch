'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Actuators } = require('../lib/ems/Actuators');
const { Inputs } = require('../lib/ems/Inputs');
const { EmsRunner } = require('../lib/ems/EmsRunner');
const { ShadowLog } = require('../lib/ems/ShadowLog');
const { PriceFeed } = require('../lib/ems/PriceFeed');
const { PvFeed } = require('../lib/ems/PvFeed');
const { JobStore } = require('../lib/ems/JobStore');
const { normalizeConfig } = require('../lib/ems/Config');
const { fromLocal } = require('../lib/time');

const Q = 15 * 60 * 1000;
const day0 = fromLocal(2026, 11, 10, 0, 0).getTime();
const at = (h, m = 0) => day0 + (h * 60 + m) * 60 * 1000;

// ---------------------------------------------------------------- Konfiguration

test('Config: Verbraucher kennt Schaltart und zwei Flows, ungültiges wird bereinigt', () => {
  const c = normalizeConfig({ consumers: [
    { id: 'flow:a', name: 'Sauna', controlKind: 'flow', flowOn: { id: 'f1', advanced: true, name: 'Sauna an' }, flowOff: { id: 'f2', name: 'Sauna aus' }, assumedW: 3000 },
    { id: 'dev', name: 'Lampe' },
    { id: 'x', controlKind: 'quatsch', flowOn: 'kaputt', assumedW: -5 },
  ] }).consumers;
  assert.equal(c[0].controlKind, 'flow');
  assert.equal(JSON.stringify(c[0].flowOn), JSON.stringify({ id: 'f1', advanced: true, name: 'Sauna an' }));
  assert.equal(JSON.stringify(c[0].flowOff), JSON.stringify({ id: 'f2', advanced: false, name: 'Sauna aus' }));
  assert.equal(c[0].assumedW, 3000);
  assert.equal(c[1].controlKind, 'device');
  assert.equal(c[1].flowOn.id, '');
  assert.equal(c[2].controlKind, 'device');
  assert.equal(c[2].assumedW, 0);
});

// ---------------------------------------------------------------- Ausgang

function fakeActuators() {
  const calls = [];
  const act = new Actuators({}, () => {});
  act._api = async () => ({
    flow: {
      triggerFlow: async (a) => { calls.push(['flow', a.id]); },
      triggerAdvancedFlow: async (a) => { calls.push(['advanced', a.id]); },
    },
    devices: { setCapabilityValue: async (a) => { calls.push(['device', a.deviceId, a.capabilityId, a.value]); } },
  });
  return { act, calls };
}

test('Actuators: Verbraucher über Flow - Standard- und erweiterter Flow, Testbetrieb nur simuliert, ohne Flow nichts', async () => {
  const { act, calls } = fakeActuators();
  assert.deepEqual(await act.consumer('flow:x', true, { live: true, flow: { id: 'f1', advanced: false, name: 'A' } }), { cmd: 'on', live: true, via: 'flow', flow: 'A' });
  await act.consumer('flow:x', false, { live: true, flow: { id: 'f2', advanced: true, name: 'B' } });
  assert.deepEqual(calls, [['flow', 'f1'], ['advanced', 'f2']]);
  calls.length = 0;
  assert.equal((await act.consumer('flow:x', true, { live: false, flow: { id: 'f1', advanced: false, name: 'A' } })).live, false);
  assert.equal(calls.length, 0, 'Testbetrieb startet keinen Flow');
  assert.equal((await act.consumer('flow:x', true, { live: true, flow: { id: '', advanced: false, name: '' } })).skipped, true);
  assert.equal(calls.length, 0);
  await act.consumer('dev1', true, { live: true });
  assert.deepEqual(calls, [['device', 'dev1', 'onoff', true]], 'ohne flow: wie bisher das Gerät');
});

test('Inputs.listFlows: nur startbare, aktive, nicht defekte Flows, Standard und erweitert, sortiert', async () => {
  const inputs = new Inputs({}, () => {});
  inputs._api = async () => ({
    flow: {
      getFlows: async () => ({
        a: { id: 'a', name: 'Zebra', triggerable: true, enabled: true },
        b: { id: 'b', name: 'Nicht startbar', triggerable: false, enabled: true },
        c: { id: 'c', name: 'Aus', triggerable: true, enabled: false },
        d: { id: 'd', name: 'Defekt', triggerable: true, enabled: true, broken: true },
      }),
      getAdvancedFlows: async () => ({ e: { id: 'e', name: 'Anfang', triggerable: true, enabled: true } }),
    },
  });
  const list = await inputs.listFlows();
  assert.equal(JSON.stringify(list), JSON.stringify([{ id: 'e', name: 'Anfang', advanced: true }, { id: 'a', name: 'Zebra', advanced: false }]));
  const broken = new Inputs({}, () => {});
  broken._api = async () => { throw new Error('keine Verbindung'); };
  assert.deepEqual(await broken.listFlows(), []);
});

// ---------------------------------------------------------------- Runner

const mem = () => { const m = new Map(); return { get: (k) => m.get(k), set: (k, v) => m.set(k, JSON.parse(JSON.stringify(v))) }; };

function setup({ consumer = {}, inputs = {}, jobs = [] } = {}) {
  const slots = [];
  for (let i = 0; i < 192; i++) slots.push({ start: new Date(day0 + i * Q), end: new Date(day0 + (i + 1) * Q), integrated: (i % 96) < 20 ? 0.1 : 0.25 });
  const prices = new PriceFeed(() => ({ priceStore: { range: (a, b) => slots.filter((s) => s.start >= a && s.start < b), value: (s) => s.integrated } }));
  const pv = new PvFeed(null, () => {}, { get: async () => ({ slots: [], stale: true }) });
  const asked = [];
  const calls = [];
  const state = { i: { gridW: -2000, houseW: 500, pvW: 3000, batterySoc: 60, batteryW: 0, chargerRead: true, chargerConnected: false, chargerPowerW: 0, chargerPhases: 3, andi: null, ...inputs } };
  const fakeInputs = {
    battery: async () => ({ soc: 60, capacityKwh: 10, error: null }),
    andiBatteryPlan: async () => null,
    chargerInputs: async () => state.i,
    consumerStates: async (ids) => { asked.push(ids); return new Map(ids.map((id) => [id, { actualOn: false, powerW: 0, available: true }])); },
  };
  const actuators = { charger: async () => ({}), consumer: async (id, on, o) => { calls.push({ id, on, live: o.live, flow: o.flow }); return { cmd: on ? 'on' : 'off', live: o.live }; } };
  const config = normalizeConfig({
    enabled: true, devices: { meter: { id: 'm' } }, charger: { id: '', enabled: false },
    consumers: [{ id: 'flow:s1', name: 'Sauna', controlKind: 'flow', flowOn: { id: 'fOn', name: 'Sauna an' }, flowOff: { id: 'fOff', name: 'Sauna aus' }, assumedW: 3000, mode: 'surplus', startSustainS: 0, stopGraceS: 0, minRunMin: 0, minOffMin: 0, live: false, ...consumer }],
  });
  const js = new JobStore(mem());
  for (const j of jobs) js.put(j);
  const runner = new EmsRunner({ getConfig: () => config, prices, pv, inputs: fakeInputs, actuators, jobs: js, shadowLog: new ShadowLog(mem()), store: mem() });
  return { runner, calls, asked, js, state, config };
}

test('Runner: flow-gesteuerter Verbraucher - kein Geräte-Lesen, Befehl startet den passenden Flow, Zustand wird selbst geführt', async () => {
  const { runner, calls, asked, state } = setup();
  await runner.tickCharger(at(12));
  assert.deepEqual(asked, [[]], 'es wird kein Gerät gelesen');
  assert.equal(calls.length, 1);
  assert.deepEqual([calls[0].id, calls[0].on, calls[0].live], ['flow:s1', true, false]);
  assert.equal(calls[0].flow.id, 'fOn', 'Einschalten startet den Ein-Flow');
  assert.equal(runner.consumerCurrent[0].isOn, true, 'selbst geführter Zustand');
  assert.notEqual(runner.consumerCurrent[0].reason, 'Gerät nicht erreichbar');
  // Überschuss weg: Aus-Flow
  state.i.gridW = 3000;
  await runner.tickCharger(at(12, 1));
  const off = calls[calls.length - 1];
  assert.equal(off.on, false);
  assert.equal(off.flow.id, 'fOff');
});

test('Runner: Flow-Verbraucher mit Leistung - eigener Verbrauch zählt zum Überschuss, kein Flattern', async () => {
  const live = setup({ consumer: { live: true }, inputs: { gridW: -3200 } });
  await live.runner.tickCharger(at(12));
  assert.equal(live.calls.length, 1);
  assert.equal(live.calls[0].live, true);
  // jetzt läuft er: der gemessene Export sinkt um seine 3000 W, der Überschuss (200 + 3000) bleibt aber ausreichend
  live.state.i.gridW = -200;
  await live.runner.tickCharger(at(12, 1));
  assert.equal(live.calls.length, 1, 'bleibt an, kein zweiter Befehl');
  assert.equal(live.runner.consumerCurrent[0].isOn, true);
  const noPower = setup({ consumer: { live: true, assumedW: 0 }, inputs: { gridW: -3200 } });
  await noPower.runner.tickCharger(at(12));
  noPower.state.i.gridW = -200;
  await noPower.runner.tickCharger(at(12, 1));
  assert.equal(noPower.calls[noPower.calls.length - 1].on, false, 'ohne Leistungsangabe fällt er wieder aus (Überschuss scheinbar weg)');
});

test('Runner: Auftrag funktioniert auch mit Flow-Verbraucher (zeitgesteuert über die günstigen Viertelstunden)', async () => {
  const job = { id: 'flow:s1', kind: 'consumer', time: '03:00', amount: 1, deadline: at(3), need: 4, ran: [], runningQ: null, contiguous: true, maxPrice: null, createdAt: at(0) };
  const { runner, calls } = setup({ jobs: [job], inputs: { gridW: 500, pvW: 0 } });
  await runner.tickCharger(at(1, 1));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].on, true);
  assert.equal(calls[0].flow.id, 'fOn');
  assert.match(runner.consumerCurrent[0].reason, /Auftrag/);
});

// ---------------------------------------------------------------- Anzeige

const emsJs = fs.readFileSync(path.join(__dirname, '../settings/ems.js'), 'utf8');

async function startUi(extra = {}) {
  const els = new Map();
  const handlers = {};
  const el = (id) => {
    if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '', value: '', checked: false, hidden: false, classList: { contains: () => true, toggle: () => {} }, addEventListener: (t, f) => { handlers[`${id}:${t}`] = f; } });
    return els.get(id);
  };
  const ctx = { document: { getElementById: el }, window: {}, setInterval: () => 0, console, Object, Promise, Date, Number, isFinite, String, JSON, Math };
  vm.createContext(ctx);
  vm.runInContext(emsJs, ctx);
  const config = normalizeConfig({ enabled: true, devices: { meter: { id: 'em' } }, consumers: extra.consumers || [] });
  const flows = [{ id: 'f1', name: 'Sauna an', advanced: false }, { id: 'f2', name: 'Sauna aus', advanced: true }];
  const res = {
    'GET /ems/shadow': { enabled: true, deviceExists: true, shadow: true, config, pv: {}, current: null, charger: { current: null } },
    'GET /ems/consumers': { current: [], events: [] }, 'GET /ems/devices': { devices: [{ id: 'lamp', name: 'Lampe', cls: 'light', caps: ['onoff'] }] },
    'GET /ems/flows': { flows: extra.noFlows ? [] : flows }, 'GET /meters': null,
  };
  await ctx.window.EmsUi.init((m, p) => Promise.resolve(res[`${m} ${p}`]), 'de');
  const setup = () => els.get('ems-view-devices').innerHTML;
  const set = (id, value) => { el(id).value = value; };
  const click = (attrs) => handlers['ems-view-devices:click']({ target: { getAttribute: (n) => (n in attrs ? attrs[n] : null), parentNode: null } });
  const change = (attrs) => handlers['ems-view-devices:change']({ target: { getAttribute: (n) => (n in attrs ? attrs[n] : null), value: '', parentNode: null } });
  return { ctx, setup, set, click, change };
}

test('Anzeige: Verbraucher per Flow - Schaltart wählbar, Flow-Dropdowns, Hinweis, wird als Flow-Verbraucher gespeichert', async () => {
  const ui = await startUi();
  ui.click({ 'data-ems-add': '1' });
  let html = ui.setup();
  assert.match(html, /Schalten über/);
  assert.match(html, /Gerät \(ein\/aus\)/);
  assert.match(html, /Homey-Flows \(ein und aus\)/);
  assert.doesNotMatch(html, /Flow zum Einschalten/);
  // auf Flow umstellen
  ui.set('row1-kind', 'flow');
  ui.change({ 'data-ems-mode': '1' });
  html = ui.setup();
  assert.match(html, /Flow zum Einschalten/);
  assert.match(html, /Flow zum Ausschalten/);
  assert.match(html, /Sauna an/);
  assert.match(html, /Sauna aus \(erweitert\)/);
  assert.match(html, /Start-Trigger «Dieser Flow wird gestartet»/);
  assert.match(html, /Leistung des Verbrauchers/);
  // Flows wählen
  ui.set('row1-name', 'Sauna');
  ui.set('row1-flowOn', 'f1');
  ui.set('row1-flowOff', 'f2');
  ui.set('row1-assumedW', '3000');
  ui.change({ 'data-ems-mode': '1' });
  const c = ui.ctx.window.EmsUi._collect().ems.consumers;
  assert.equal(c.length, 1);
  assert.equal(c[0].controlKind, 'flow');
  assert.match(c[0].id, /^flow:/);
  assert.equal(JSON.stringify(c[0].flowOn), JSON.stringify({ id: 'f1', advanced: false, name: 'Sauna an' }));
  assert.equal(JSON.stringify(c[0].flowOff), JSON.stringify({ id: 'f2', advanced: true, name: 'Sauna aus' }));
  assert.equal(c[0].assumedW, 3000);
  assert.match(ui.setup(), /Bei Überschuss - Testbetrieb|Bei voller Batterie - Testbetrieb/, 'Betriebsart erscheint, sobald ein Flow gewählt ist');
  // zurück auf Gerät: künstliche ID verschwindet
  ui.set('row1-kind', 'device');
  ui.change({ 'data-ems-mode': '1' });
  assert.equal(ui.ctx.window.EmsUi._collect().ems.consumers.length, 0, 'ohne Gerät kein Verbraucher');
});

test('Anzeige: ohne startbare Flows steht ein Hinweis, gespeicherter Flow-Verbraucher bleibt erhalten', async () => {
  const saved = [{ id: 'flow:abc', name: 'Sauna', controlKind: 'flow', flowOn: { id: 'f1', name: 'Sauna an' }, flowOff: { id: 'f2', name: 'Sauna aus' }, assumedW: 2000, mode: 'surplus' }];
  const ui = await startUi({ consumers: saved, noFlows: true });
  ui.click({ 'data-ems-open': 'row1' });
  const html = ui.setup();
  assert.match(html, /keine startbaren Flows gefunden/);
  assert.match(html, /<option value="f1" selected>Sauna an/, 'gewählter Flow bleibt sichtbar, auch wenn die Liste leer ist');
  const c = ui.ctx.window.EmsUi._collect().ems.consumers[0];
  assert.equal(c.id, 'flow:abc');
  assert.equal(c.flowOn.id, 'f1');
});
