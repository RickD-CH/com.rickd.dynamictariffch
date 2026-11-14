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
  const c = normalizeConfig({
    consumers: [
      {
        id: 'flow:a', name: 'Sauna', controlKind: 'flow', flowOn: { id: 'f1', advanced: true, name: 'Sauna an' }, flowOff: { id: 'f2', name: 'Sauna aus' }, assumedW: 3000,
      },
      { id: 'dev', name: 'Lampe' },
      {
        id: 'x', controlKind: 'quatsch', flowOn: 'kaputt', assumedW: -5,
      },
    ],
  }).consumers;
  assert.equal(c[0].controlKind, 'flow');
  assert.equal(JSON.stringify(c[0].flowOn), JSON.stringify({ id: 'f1', advanced: true, name: 'Sauna an' }));
  assert.equal(JSON.stringify(c[0].flowOff), JSON.stringify({ id: 'f2', advanced: false, name: 'Sauna aus' }));
  assert.equal(c[0].assumedW, 3000);
  assert.equal(c[1].controlKind, 'device');
  assert.equal(c[1].flowOn.id, '');
  assert.equal(c[2].controlKind, 'device');
  assert.equal(c[2].assumedW, 0);
});

test('Config: Verbraucher-Symbol - jedes im Setup wählbare Icon wird auch gespeichert, unbekannte fallen weg', () => {
  // Deckt genau den Bug ab, bei dem diese Liste nicht mit settings/ems.js Schritt gehalten hat (z. B. 'dishwasher'
  // fehlte hier, obwohl im Setup wählbar - die Auswahl wurde beim Speichern dann stillschweigend verworfen).
  const icons = ['plug', 'bike', 'drop', 'dishwasher', 'boiler', 'washer', 'tumbler', 'fan', 'heatpump'];
  icons.forEach((icon) => {
    const c = normalizeConfig({ consumers: [{ id: icon, name: icon, icon }] }).consumers;
    assert.equal(c[0].icon, icon, `Icon "${icon}" muss erhalten bleiben`);
  });
  assert.equal(normalizeConfig({ consumers: [{ id: 'x', icon: 'flame' }] }).consumers[0].icon, '', 'unbekanntes/entferntes Icon fällt weg');
});

// ---------------------------------------------------------------- Ausgang

function fakeActuators() {
  const calls = [];
  const act = new Actuators({}, () => {});
  act._api = async () => ({
    flow: {
      triggerFlow: async (a) => {
        calls.push(['flow', a.id]);
      },
      triggerAdvancedFlow: async (a) => {
        calls.push(['advanced', a.id]);
      },
    },
    devices: {
      setCapabilityValue: async (a) => {
        calls.push(['device', a.deviceId, a.capabilityId, a.value]);
      },
    },
  });
  return { act, calls };
}

test('Actuators: Verbraucher über Flow - Standard- und erweiterter Flow, Testbetrieb nur simuliert, ohne Flow nichts', async () => {
  const { act, calls } = fakeActuators();
  assert.deepEqual(await act.consumer('flow:x', true, { live: true, flow: { id: 'f1', advanced: false, name: 'A' } }), {
    cmd: 'on', live: true, via: 'flow', flow: 'A',
  });
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

test('Actuators.shed: mit eigenem Aus-Flow wird der Flow ausgelöst statt das Gerät zu lesen, ohne wie bisher', async () => {
  const { act, calls } = fakeActuators();
  const r = await act.shed('sauna', { live: true, offFlow: { id: 'f9', advanced: true, name: 'Sauna aus' } });
  assert.deepEqual(r, {
    cmd: 'off', live: true, via: 'flow', flow: 'Sauna aus',
  });
  assert.deepEqual(calls, [['advanced', 'f9']]);
  calls.length = 0;
  assert.equal((await act.shed('sauna', { live: false, offFlow: { id: 'f9', advanced: false, name: '' } })).live, false);
  assert.equal(calls.length, 0, 'Testbetrieb löst keinen Flow aus');
  act._api = async () => ({
    devices: {
      getDevice: async () => ({ capabilitiesObj: { onoff: {} } }),
      setCapabilityValue: async (a) => {
        calls.push(['device', a.deviceId, a.capabilityId, a.value]);
      },
    },
  });
  await act.shed('dev1', { live: true, offFlow: null });
  assert.deepEqual(calls, [['device', 'dev1', 'onoff', false]], 'ohne offFlow: wie bisher automatisch erkannt');
});

test('Actuators.shed: funktioniert auch ohne Geräte-Id (Wallbox hat keine eigene Shed-Geräte-Id, nur ihren Aus-Flow)', async () => {
  const { act, calls } = fakeActuators();
  const r = await act.shed(null, { live: true, offFlow: { id: 'f10', advanced: false, name: 'Wallbox aus' } });
  assert.deepEqual(r, {
    cmd: 'off', live: true, via: 'flow', flow: 'Wallbox aus',
  });
  assert.deepEqual(calls, [['flow', 'f10']]);
});

test('Inputs.listFlows: nur startbare, aktive, nicht defekte Flows, Standard und erweitert, sortiert', async () => {
  const inputs = new Inputs({}, () => {});
  inputs._api = async () => ({
    flow: {
      getFlows: async () => ({
        a: {
          id: 'a', name: 'Zebra', triggerable: true, enabled: true,
        },
        b: {
          id: 'b', name: 'Nicht startbar', triggerable: false, enabled: true,
        },
        c: {
          id: 'c', name: 'Aus', triggerable: true, enabled: false,
        },
        d: {
          id: 'd', name: 'Defekt', triggerable: true, enabled: true, broken: true,
        },
      }),
      getAdvancedFlows: async () => ({
        e: {
          id: 'e', name: 'Anfang', triggerable: true, enabled: true,
        },
      }),
    },
  });
  const list = await inputs.listFlows();
  assert.equal(JSON.stringify(list), JSON.stringify([{ id: 'e', name: 'Anfang', advanced: true }, { id: 'a', name: 'Zebra', advanced: false }]));
  const broken = new Inputs({}, () => {});
  broken._api = async () => {
    throw new Error('keine Verbindung');
  };
  assert.deepEqual(await broken.listFlows(), []);
});

// ---------------------------------------------------------------- Runner

const mem = () => {
  const m = new Map(); return { get: (k) => m.get(k), set: (k, v) => m.set(k, JSON.parse(JSON.stringify(v))) };
};

function setup({ consumer = {}, inputs = {}, jobs = [] } = {}) {
  const slots = [];
  for (let i = 0; i < 192; i++) slots.push({ start: new Date(day0 + i * Q), end: new Date(day0 + (i + 1) * Q), integrated: (i % 96) < 20 ? 0.1 : 0.25 });
  const prices = new PriceFeed(() => ({ priceStore: { range: (a, b) => slots.filter((s) => s.start >= a && s.start < b), value: (s) => s.integrated } }));
  const pv = new PvFeed(null, () => {}, { get: async () => ({ slots: [], stale: true }) });
  const asked = [];
  const calls = [];
  const state = {
    i: {
      gridW: -2000, houseW: 500, pvW: 3000, batterySoc: 60, batteryW: 0, chargerRead: true, chargerConnected: false, chargerPowerW: 0, chargerPhases: 3, other: null, ...inputs,
    },
  };
  const fakeInputs = {
    battery: async () => ({ soc: 60, capacityKwh: 10, error: null }),
    compareBatteryPlan: async () => null,
    chargerInputs: async () => state.i,
    consumerStates: async (ids) => {
      asked.push(ids); return new Map(ids.map((id) => [id, { actualOn: false, powerW: 0, available: true }]));
    },
  };
  const actuators = {
    charger: async () => ({}),
    consumer: async (id, on, o) => {
      calls.push({
        id, on, live: o.live, flow: o.flow,
      }); return { cmd: on ? 'on' : 'off', live: o.live };
    },
  };
  const config = normalizeConfig({
    enabled: true,
    silent: false,
    devices: { meter: { id: 'm' } },
    charger: { id: '', enabled: false },
    consumers: [{
      id: 'flow:s1', name: 'Sauna', controlKind: 'flow', flowOn: { id: 'fOn', name: 'Sauna an' }, flowOff: { id: 'fOff', name: 'Sauna aus' }, assumedW: 3000, mode: 'surplus', startSustainS: 0, stopGraceS: 0, minRunMin: 0, minOffMin: 0, live: false, ...consumer,
    }],
  });
  const js = new JobStore(mem());
  for (const j of jobs) js.put(j);
  const runner = new EmsRunner({
    getConfig: () => config, prices, pv, inputs: fakeInputs, actuators, jobs: js, shadowLog: new ShadowLog(mem()), store: mem(),
  });
  return {
    runner, calls, asked, js, state, config,
  };
}

test('Runner: flow-gesteuerter Verbraucher - kein Geräte-Lesen, Befehl startet den passenden Flow, Zustand wird selbst geführt', async () => {
  const {
    runner, calls, asked, state,
  } = setup();
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
  const job = {
    id: 'flow:s1', kind: 'consumer', time: '03:00', amount: 1, deadline: at(3), need: 4, ran: [], runningQ: null, contiguous: true, maxPrice: null, createdAt: at(0),
  };
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
  const timers = [];
  const calls = [];
  const el = (id) => {
    if (!els.has(id)) {
      // Wert und Häkchen kommen aus dem gezeichneten HTML, solange der Test sie nicht selbst setzt (wie im Browser)
      const own = {};
      const tag = () => {
        const html = (els.get('ems-view-devices') || { innerHTML: '' }).innerHTML;
        const m = new RegExp('<(input|select|textarea)\\b[^>]*\\bid="' + id + '"[^>]*>').exec(html);
        return m ? { kind: m[1], tag: m[0], at: m.index + m[0].length, html } : null;
      };
      const unesc = (x) => x.replace(/&amp;/g, '&').replace(/&quot;/g, '"');
      els.set(id, {
        id,
        innerHTML: '',
        textContent: '',
        get value() {
          if ('value' in own) return own.value;
          const t = tag();
          if (!t) return '';
          if (t.kind === 'select') {
            const part = t.html.slice(t.at, t.html.indexOf('</select>', t.at));
            const sel = /<option value="([^"]*)"[^>]*selected/.exec(part) || /<option value="([^"]*)"/.exec(part);
            return sel ? unesc(sel[1]) : '';
          }
          const v = /\bvalue="([^"]*)"/.exec(t.tag);
          return v ? unesc(v[1]) : '';
        },
        set value(v) { own.value = v; },
        get checked() {
          if ('checked' in own) return own.checked;
          const t = tag();
          return !!t && /\schecked\b/.test(t.tag);
        },
        set checked(v) { own.checked = v; },
        hidden: false,
        classList: { contains: () => true, toggle: () => {} },
        addEventListener: (t, f) => {
          handlers[`${id}:${t}`] = f;
        },
      });
    }
    return els.get(id);
  };
  const ctx = {
    document: { getElementById: el }, window: {}, setInterval: () => 0, setTimeout: (f) => timers.push(f), clearTimeout: (n) => { timers[n - 1] = null; }, console, Object, Promise, Date, Number, isFinite, String, JSON, Math,
  };
  vm.createContext(ctx);
  vm.runInContext(emsJs, ctx);
  const config = normalizeConfig({
    enabled: true, devices: { meter: { id: 'em' } }, consumers: extra.consumers || [], sgready: extra.sgready, dhw: extra.dhw,
  });
  const flows = [{ id: 'f1', name: 'Sauna an', advanced: false }, { id: 'f2', name: 'Sauna aus', advanced: true }];
  const res = {
    'GET /ems/shadow': {
      enabled: true, deviceExists: true, shadow: true, config, pv: {}, current: null, charger: { current: null }, dhwPrices: extra.dhwPrices,
    },
    'GET /ems/consumers': { current: [], events: [] },
    'GET /ems/devices': {
      devices: [{
        id: 'lamp', name: 'Lampe', cls: 'light', caps: ['onoff'],
      }],
    },
    'GET /ems/flows': { flows: extra.noFlows ? [] : flows },
    'GET /meters': null,
  };
  await ctx.window.EmsUi.init((m, p, body) => {
    calls.push([m, p, body]);
    return Promise.resolve(res[`${m} ${p}`]);
  }, 'de');
  const setup = () => els.get('ems-view-devices').innerHTML;
  const set = (id, value) => {
    el(id).value = value;
  };
  const click = (attrs) => handlers['ems-view-devices:click']({ target: { getAttribute: (n) => (n in attrs ? attrs[n] : null), parentNode: null } });
  const change = (attrs) => handlers['ems-view-devices:change']({ target: { getAttribute: (n) => (n in attrs ? attrs[n] : null), value: '', parentNode: null } });
  const input = (attrs) => handlers['ems-view-devices:input']({ target: { tagName: 'INPUT', getAttribute: (n) => (n in attrs ? attrs[n] : null), parentNode: null } });
  const flush = async () => {
    const fs = timers.splice(0).filter(Boolean);
    fs.forEach((f) => f());
    await new Promise((r) => setImmediate(r));
  };
  return {
    ctx, setup, set, click, change, input, flush, calls,
  };
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
  assert.match(ui.setup(), /Bei Überschuss - nicht gesteuert|Bei voller Batterie - nicht gesteuert/, 'Betriebsart erscheint, sobald ein Flow gewählt ist');
  // zurück auf Gerät: künstliche ID verschwindet
  ui.set('row1-kind', 'device');
  ui.change({ 'data-ems-mode': '1' });
  assert.equal(ui.ctx.window.EmsUi._collect().ems.consumers.length, 0, 'ohne Gerät kein Verbraucher');
});

test('Anzeige: ohne startbare Flows steht ein Hinweis, gespeicherter Flow-Verbraucher bleibt erhalten', async () => {
  const saved = [{
    id: 'flow:abc', name: 'Sauna', controlKind: 'flow', flowOn: { id: 'f1', name: 'Sauna an' }, flowOff: { id: 'f2', name: 'Sauna aus' }, assumedW: 2000, mode: 'surplus',
  }];
  const ui = await startUi({ consumers: saved, noFlows: true });
  ui.click({ 'data-ems-open': 'row1' });
  const html = ui.setup();
  assert.match(html, /keine startbaren Flows gefunden/);
  assert.match(html, /<option value="f1" selected>Sauna an/, 'gewählter Flow bleibt sichtbar, auch wenn die Liste leer ist');
  const c = ui.ctx.window.EmsUi._collect().ems.consumers[0];
  assert.equal(c.id, 'flow:abc');
  assert.equal(c.flowOn.id, 'f1');
});

test('Symbol-Wahl eines Verbrauchers speichert sofort (kein Speichern-Knopf nötig), aber nie eine Zeile ohne Gerät', async () => {
  const els = new Map();
  const handlers = {};
  const el = (id) => {
    if (!els.has(id)) {
      els.set(id, {
        id,
        innerHTML: '',
        textContent: '',
        value: '',
        checked: false,
        hidden: false,
        classList: { contains: () => true, toggle: () => {} },
        addEventListener: (t, f) => {
          handlers[`${id}:${t}`] = f;
        },
      });
    }
    return els.get(id);
  };
  const ctx = {
    document: { getElementById: el }, window: {}, setInterval: () => 0, console, Object, Promise, Date, Number, isFinite, String, JSON, Math,
  };
  vm.createContext(ctx);
  vm.runInContext(emsJs, ctx);
  const config = normalizeConfig({ enabled: true, devices: { meter: { id: 'em' } }, consumers: [] });
  const puts = [];
  const res = {
    'GET /ems/shadow': {
      enabled: true, deviceExists: true, shadow: true, config, pv: {}, current: null, charger: { current: null },
    },
    'GET /ems/consumers': { current: [], events: [] },
    'GET /ems/devices': {
      devices: [{
        id: 'lamp', name: 'Lampe', cls: 'light', caps: ['onoff'],
      }],
    },
    'GET /ems/flows': { flows: [] },
    'GET /meters': null,
  };
  const api = (m, p, body) => {
    if (m === 'PUT' && p === '/ems/config') {
      puts.push(JSON.parse(JSON.stringify(body)));
      return Promise.resolve(normalizeConfig(body));
    }
    return Promise.resolve(res[`${m} ${p}`]);
  };
  await ctx.window.EmsUi.init(api, 'de');
  const click = (attrs) => handlers['ems-view-devices:click']({ target: { getAttribute: (n) => (n in attrs ? attrs[n] : null), parentNode: null } });
  const set = (id, value) => {
    el(id).value = value;
  };

  click({ 'data-ems-add': '1' }); // neue, noch leere Zeile (row1), automatisch geöffnet
  click({ 'data-ems-icon': '1:washer' }); // Symbol wählen, bevor ein Gerät gewählt ist
  assert.equal(puts.length, 0, 'ohne Gerät wird nicht gespeichert - die Zeile würde collect() sonst ganz verwerfen');

  set('row1-dev', 'lamp');
  click({ 'data-ems-icon': '1:washer' });
  assert.equal(puts.length, 1, 'mit Gerät: Symbol-Klick speichert sofort');
  assert.equal(puts[0].consumers[0].icon, 'washer');
  await Promise.resolve().then(() => {}).then(() => {}).then(() => {}); // Promise-Kette von save() sauber auslaufen lassen
});

test('Anzeige: SG-Ready-Bereich ist da, standardmässig aus, und die Einstellungen gehen mit dem Speichern mit', async () => {
  const ui = await startUi();
  assert.match(ui.setup(), /BOILER \/ WÄRMEPUMPE \(SG-READY\)/);
  assert.match(ui.setup(), /SG-Ready-Steuerung/);
  ui.click({ 'data-ems-open': 'sg' });
  const html = ui.setup();
  assert.match(html, /SG-Ready steuern/);
  assert.match(html, /Mindestlaufzeit/, 'die Einstellungen sind auch im ausgeschalteten Zustand sichtbar');
  const sg = ui.ctx.window.EmsUi._collect().ems.sgready;
  assert.equal(sg.enabled, false);
  assert.equal(sg.minRunMin, 90);
});

test('Anzeige: SG-Ready - Erklärtexte, Betriebsart, Ausgabe über Relais oder Flows', async () => {
  const relays = await startUi({
    sgready: {
      enabled: true, modeId: 'lamp', modeCapability: 'onoff', modeOkValue: 'Automatik',
    },
  });
  relays.click({ 'data-ems-open': 'sg' });
  const h1 = relays.setup();
  assert.match(h1, /Boost beenden ab Warmwasser/);
  assert.match(h1, /Der eigentliche Zielwert steht in der Wärmepumpe selbst/);
  assert.match(h1, /Einschaltverzögerung/);
  assert.match(h1, /Betriebsart der Wärmepumpe/);
  assert.match(h1, /Relais Empfehlung/);
  assert.doesNotMatch(h1, /Flow Normalbetrieb/);
  const flows = await startUi({ sgready: { enabled: true, output: 'flows', flowBoost: { id: 'f1', name: 'Sauna an' } } });
  flows.click({ 'data-ems-open': 'sg' });
  const h2 = flows.setup();
  assert.match(h2, /Flow Normalbetrieb \(0:0\)/);
  assert.match(h2, /Flow Empfehlung \(0:1\)/);
  assert.doesNotMatch(h2, /Relais Empfehlung/);
  flows.set('ems-sg-fb', 'f1'); // die nachgebildete Oberfläche liefert sonst leere Werte
  flows.set('ems-sg-output', 'flows');
  const sg = flows.ctx.window.EmsUi._collect().ems.sgready;
  assert.equal(sg.output, 'flows');
  assert.equal(sg.flowBoost.id, 'f1');
  assert.equal(relays.ctx.window.EmsUi._collect().ems.sgready.modeOkValue, 'Automatik');
  assert.ok(h1.indexOf('SG-Ready-Steuerung') > h1.indexOf('Verbraucher') && h1.indexOf('SG-Ready-Steuerung') < h1.indexOf('Hausanschluss-Schutz'), 'Boiler steht unter den Verbrauchern, vor dem Hausanschluss');
});

test('Anzeige: Warmwasser-Programm - günstigste Stunden statt Preis, mit Vorschau für heute und morgen, per Flow oder App-Funktion', async () => {
  const off = await startUi();
  assert.match(off.setup(), /WARMWASSER-PROGRAMM BEI GÜNSTIGEM PREIS/);
  off.click({ 'data-ems-open': 'dhw' });
  const h0 = off.setup();
  assert.match(h0, /Warmwasser-Programm bei günstigem Preis starten/);
  assert.match(h0, /Nur starten unter Warmwasser/, 'die Einstellungen sind auch im ausgeschalteten Zustand sichtbar');
  // Preise: heute 02:00-03:00 für 8 Rp., sonst 30 Rp.; morgen 05:00-07:00 günstig
  const day = (d0, cheapFrom, cheapTo) => Array.from({ length: 96 }, (_, k) => [d0 + k * 900000, d0 + k * 900000 >= cheapFrom && d0 + k * 900000 < cheapTo ? 8 : 30]);
  const d0 = Date.UTC(2026, 10, 13, 0, 0) - 3600000; // 00:00 Zürich
  const prices = { today: day(d0, d0 + 2 * 3600000, d0 + 3 * 3600000), tomorrow: day(d0 + 86400000, d0 + 86400000 + 5 * 3600000, d0 + 86400000 + 7 * 3600000) };
  const flows = await startUi({ dhw: { enabled: true, flowOn: { id: 'f1', name: 'Sauna an' }, cheapHours: 1 }, dhwPrices: prices });
  flows.click({ 'data-ems-open': 'dhw' });
  const h = flows.setup();
  assert.match(h, /Günstigste Stunden pro Tag/);
  assert.doesNotMatch(h, /Höchster Preis/, 'kein fester Preis mehr');
  assert.match(h, /Vorschau: <b>Heute:<\/b> 02:00-03:00 \(Ø 8\.0 Rp\.\)/);
  assert.match(h, /<b>Morgen:<\/b> 05:00-06:00 \(Ø 8\.0 Rp\.\)/, '1 h von den 2 günstigen Morgenstunden: die früheste bei Gleichstand');
  assert.match(h, /Nur starten unter Warmwasser/);
  assert.match(h, /Flow Warmwasser-Programm ein/);
  assert.doesNotMatch(h, /Gerät und Capability der App-Funktion/);
  const c1 = flows.ctx.window.EmsUi._collect().ems;
  assert.equal(c1.dhw.flowOn.id, 'f1');
  assert.equal(c1.dhw.cheapHours, 1);
  assert.equal(c1.dhw.belowTemp, 45, 'Standard 45 °C');
  const none = await startUi({ dhw: { enabled: true }, dhwPrices: { today: [], tomorrow: [] } });
  none.click({ 'data-ems-open': 'dhw' });
  assert.match(none.setup(), /Vorschau: noch keine Preise für heute/);
  const cap = await startUi({
    dhw: {
      enabled: true,
      output: 'capability',
      device: {
        deviceId: 'lamp', capability: 'onoff', onValue: 'true', offValue: 'false',
      },
    },
  });
  cap.click({ 'data-ems-open': 'dhw' });
  const h2 = cap.setup();
  assert.match(h2, /Gerät und Capability der App-Funktion/);
  assert.match(h2, /Wert für zurück auf Normal/);
  assert.doesNotMatch(h2, /Flow Warmwasser-Programm ein/);
  assert.equal(cap.ctx.window.EmsUi._collect().ems.dhw.device.offValue, 'false');
  const sg = await startUi({ sgready: { enabled: true } });
  sg.click({ 'data-ems-open': 'sg' });
  assert.doesNotMatch(sg.setup(), /Preis-Start|günstigem Strompreis|Was startet der Preis/, 'der Preis gehört zum eigenen Bereich');
});

test('Anzeige: kurze Erklärungen hinter einem ⓘ - eingeklappt, ein Klick klappt sie auf, nur bei erklärungsbedürftigen Feldern', async () => {
  const ui = await startUi({ consumers: [{ id: 'lamp', name: 'Lampe', mode: 'surplus' }] });
  ui.click({ 'data-ems-open': 'row1' });
  const html = ui.setup();
  assert.match(html, /Mindestlaufzeit \(min\) <i class="ems-tip" data-ems-tip="tip-row1-minRunMin">/);
  assert.match(html, /<small class="ems-tiptext" id="tip-row1-minRunMin" hidden>Nach dem Einschalten läuft es mindestens so lange/);
  assert.match(html, /data-ems-tip="tip-row1-mode"/, 'auch die Betriebsart ist erklärt');
  assert.doesNotMatch(html, /data-ems-tip="tip-row1-name"/, 'selbsterklärende Felder (Name) bekommen keinen Text');
  ui.click({ 'data-ems-tip': 'tip-row1-minRunMin' }); // schaltet nur um, kein Neuaufbau, kein Fehler
  const prog = await startUi({ consumers: [{ id: 'gwa', name: 'GWA', mode: 'program' }] });
  prog.click({ 'data-ems-open': 'row1' });
  const h2 = prog.setup();
  assert.match(h2, /Programmdauer \(h\)/);
  assert.doesNotMatch(h2, /nur Info/, 'die Dauer ist jetzt die Sperrzeit nach einem Start, nicht mehr «nur Info»');
  assert.match(h2, /startet die Automatik nicht nochmals/);
});

test('Anzeige: Zieltemperatur fest oder aus der Wärmepumpe (WW-Soll), Betriebsart-Wert während des Programms, Höchstdauer', async () => {
  const man = await startUi({
    dhw: {
      enabled: true, modeId: 'lamp', modeCapability: 'onoff', modeOkValue: 'Automatik', modeProgramValue: 'Warmwasser',
    },
  });
  man.click({ 'data-ems-open': 'dhw' });
  const h = man.setup();
  assert.match(h, /Zieltemperatur/);
  assert.match(h, /Fest eingestellt/);
  assert.doesNotMatch(h, /Toleranz unter WW-Soll/, 'fest: keine Geräte-Felder');
  assert.match(h, /Betriebsart während des Programms/);
  assert.match(h, /Höchstdauer \(Min\.\)/);
  assert.equal(man.ctx.window.EmsUi._collect().ems.dhw.modeProgramValue, 'Warmwasser');
  assert.equal(man.ctx.window.EmsUi._collect().ems.dhw.targetTemp, 50, 'Standard 50 °C');
  assert.equal(man.ctx.window.EmsUi._collect().ems.dhw.maxRunMin, 180);
  const dev = await startUi({
    dhw: {
      enabled: true, targetSource: 'device', targetId: 'lamp', targetCapability: 'onoff', targetTol: 2,
    },
    sgready: {
      enabled: true, targetSource: 'device', targetId: 'lamp', targetCapability: 'onoff',
    },
  });
  dev.click({ 'data-ems-open': 'dhw' });
  const h2 = dev.setup();
  assert.match(h2, /Aus der Wärmepumpe \(WW-Soll\)/);
  assert.match(h2, /Toleranz unter WW-Soll/);
  assert.match(h2, /Ersatz-Ziel, falls der WW-Soll nicht lesbar ist/);
  const c = dev.ctx.window.EmsUi._collect().ems;
  assert.equal(c.dhw.targetSource, 'device');
  assert.equal(c.dhw.targetTol, 2);
  assert.equal(c.sgready.targetSource, 'device');
});

test('Automatisch speichern: kurz nach der letzten Eingabe, nur ein Speichern bei mehreren Eingaben, Schalter mit eigenem Speichern lösen es nicht aus', async () => {
  const ui = await startUi({ dhw: { enabled: true } });
  ui.click({ 'data-ems-open': 'dhw' });
  const puts = () => ui.calls.filter(([m, p]) => m === 'PUT' && p === '/ems/config');
  const before = puts().length;
  ui.set('ems-dhw-cheap', '3');
  ui.input({ id: 'ems-dhw-cheap' });
  ui.input({ id: 'ems-dhw-cheap' });
  assert.equal(puts().length, before, 'nicht sofort');
  await ui.flush();
  assert.equal(puts().length, before + 1, 'ein einziges Speichern');
  assert.equal(puts()[puts().length - 1][2].dhw.cheapHours, 3);
  ui.input({ 'data-ems-enable': '1' });
  await ui.flush();
  assert.equal(puts().length, before + 1, 'Schalter speichern selbst');
});
