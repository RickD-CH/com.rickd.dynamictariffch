'use strict';

// «Heute»: Sofort laden mit Grenze, «Automatisch laden», Auto-Zeile vor dem ersten Lauf, Protokoll-Filter.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EmsRunner } = require('../lib/ems/EmsRunner');
const { ShadowLog } = require('../lib/ems/ShadowLog');
const { PriceFeed } = require('../lib/ems/PriceFeed');
const { PvFeed } = require('../lib/ems/PvFeed');
const { normalizeConfig } = require('../lib/ems/Config');

const T0 = Date.UTC(2026, 10, 11, 12, 0, 0);
const mem = () => {
  const m = new Map(); return { get: (k) => m.get(k), set: (k, v) => m.set(k, JSON.parse(JSON.stringify(v))) };
};

// ---------------------------------------------------------------- Sofort laden mit Grenze

function runner(limit) {
  const config = normalizeConfig({
    enabled: true, devices: { meter: { id: 'm' } }, charger: { id: 'wb', chargeNow: true, chargeNowLimit: limit }, car: { deviceId: 'car', capacityKwh: 60 },
  });
  const i = {
    gridW: 300, houseW: 300, pvW: 0, batterySoc: null, batteryW: 0, chargerRead: true, chargerConnected: true, chargerPowerW: 11000, chargerPhases: 3, carSoc: 50, other: null,
  };
  const off = [];
  const r = new EmsRunner({
    getConfig: () => config,
    prices: new PriceFeed(() => null),
    pv: new PvFeed(null, () => {}),
    inputs: { chargerInputs: async () => i, consumerStates: async () => new Map() },
    actuators: { charger: async (id, cmd) => ({ cmd: cmd.type }), consumer: async () => ({}) },
    shadowLog: new ShadowLog(mem()),
    store: null,
    onChargeNowOff: (reason) => { off.push(reason); config.charger.chargeNow = false; },
  });
  return {
    r, i, off, config,
  };
}

test('Config: Grenze für Sofortladen wird geprüft (Standard ohne Grenze)', () => {
  assert.deepEqual(normalizeConfig({}).charger.chargeNowLimit, { kind: 'none', value: null });
  assert.deepEqual(normalizeConfig({ charger: { chargeNowLimit: { kind: 'soc', value: 300 } } }).charger.chargeNowLimit, { kind: 'soc', value: 100 });
  assert.deepEqual(normalizeConfig({ charger: { chargeNowLimit: { kind: 'kwh' } } }).charger.chargeNowLimit, { kind: 'kwh', value: 10 });
  assert.equal(normalizeConfig({ charger: { chargeNowLimit: { kind: 'egal' } } }).charger.chargeNowLimit.kind, 'none');
});

test('Sofortladen bis Ladestand: geht aus, sobald das Auto die Grenze erreicht', async () => {
  const { r, i, off } = runner({ kind: 'soc', value: 80 });
  await r.tickCharger(T0);
  assert.deepEqual(off, []);
  assert.equal(r.chargerCurrent.chargeNow.soc, 50);
  i.carSoc = 80;
  await r.tickCharger(T0 + 60000);
  assert.deepEqual(off, ['Ladestand 80 % erreicht']);
  assert.notEqual(r.chargerCurrent.mine.mode, 'instant_ev', 'in diesem Lauf schon nicht mehr sofort laden');
});

test('Sofortladen bis kWh: zählt die geladene Energie (Leistung x Zeit) und geht bei der Grenze aus', async () => {
  const { r, off } = runner({ kind: 'kwh', value: 1 });
  await r.tickCharger(T0);
  await r.tickCharger(T0 + 120000); // 11 kW x 2 min = 0.37 kWh
  assert.equal(r.chargerCurrent.chargeNow.kwh, 0.4);
  assert.deepEqual(off, []);
  await r.tickCharger(T0 + 240000);
  await r.tickCharger(T0 + 360000); // 1.1 kWh
  assert.deepEqual(off, ['1 kWh geladen']);
  const none = runner({ kind: 'none' });
  for (let k = 0; k < 10; k++) await none.r.tickCharger(T0 + k * 120000);
  assert.deepEqual(none.off, [], 'ohne Grenze bleibt es an');
});

// ---------------------------------------------------------------- Oberfläche

function uiEnv({
  cfg = {}, shadow = {}, events = [], chargerEvents = [],
} = {}) {
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
  const calls = [];
  const config = normalizeConfig({
    enabled: true, devices: { meter: { id: 'em' } }, charger: { id: 'wb' }, consumers: [{ id: 'dry', name: 'Entfeuchter' }, { id: 'boil', name: 'Boiler' }], ...cfg,
  });
  const res = {
    'GET /ems/shadow': {
      enabled: true, deviceExists: true, shadow: true, config, pv: {}, current: null, charger: { current: { live: false, mine: { mode: 'solar_ev', reason: '10A/3ph' }, connected: true, ...(shadow.charger || {}) }, events: chargerEvents }, car: shadow.car, fuse: shadow.fuse,
    },
    'GET /ems/consumers': { current: [], events },
    'GET /ems/devices': { devices: [] },
    'GET /ems/flows': { flows: [] },
    'GET /meters': null,
    'PUT /ems/config': (b) => normalizeConfig({ ...config, ...b, charger: { ...config.charger, ...(b.charger || {}) } }),
  };
  const init = () => ctx.window.EmsUi.init((m, p, b) => {
    calls.push([m, p, b]); const x = res[`${m} ${p}`]; return Promise.resolve(typeof x === 'function' ? x(b) : x);
  }, 'de');
  const main = () => els.get('ems-view-main').innerHTML.replace(/<style>[\s\S]*?<\/style>/g, '');
  const click = (attr, v) => handlers['ems-view-main:click']({ target: { getAttribute: (n) => (n === attr ? v : null), parentNode: null } });
  const change = (attr, v, value) => handlers['ems-view-main:change']({ target: { getAttribute: (n) => (n === attr ? v : null), parentNode: null, value } });
  return {
    init, main, click, change, calls,
  };
}

test('Heute: Auto-Zeile vor dem ersten Lauf mit Hinweis statt «-»; Wallbox heisst «Automatisch laden»', async () => {
  const u = uiEnv({ cfg: { car: { deviceId: 'car', capacityKwh: 60 }, charger: { id: 'wb', live: true } }, shadow: { car: undefined } });
  await u.init();
  assert.match(u.main(), /E-Auto <span class="car-badge"[^>]*>angesteckt<\/span><\/span><span class="ems-item-s ems-muted" style="white-space:normal">Daten folgen mit dem nächsten Lauf/);
  assert.doesNotMatch(u.main(), /E-Auto -/);
  assert.match(u.main(), /Automatisch laden<\/span><span class="ems-item-s ems-muted">Lädt mit Solarstrom - 10A\/3ph - Silent/);
  const off = uiEnv();
  await off.init();
  assert.match(off.main(), /Aus: die Wallbox läuft wie bisher \(eigene App oder Flows\)/);
});

test('Heute: Sofort laden zeigt die Grenze und den Fortschritt; Grenze aufklappbar, Änderung wird gespeichert', async () => {
  const u = uiEnv({
    cfg: { car: { deviceId: 'car', capacityKwh: 60 }, charger: { id: 'wb', chargeNow: true, chargeNowLimit: { kind: 'soc', value: 80 } } },
    shadow: { charger: { chargeNow: { kwh: 3.2, soc: 52, limit: { kind: 'soc', value: 80 } } } },
  });
  await u.init();
  assert.match(u.main(), /Sofort laden \(volle Leistung\)<\/span><span class="ems-item-s ems-muted">bis 80 % \(jetzt 52 %\)/);
  assert.match(u.main(), /<summary data-ems-cnopen="1">Grenze<\/summary>/);
  assert.match(u.main(), /<option value="soc" selected>bis Ladestand \(%\)/);
  u.change('data-ems-cnlim', 'kind', 'kwh');
  await new Promise((res) => setTimeout(res, 10));
  const put = u.calls.filter((c) => c[0] === 'PUT').pop();
  assert.deepEqual(JSON.parse(JSON.stringify(put[2])), { charger: { chargeNowLimit: { kind: 'kwh', value: 10 } } });
  assert.match(u.main(), /bis 10 kWh/);
  const noCar = uiEnv();
  await noCar.init();
  assert.doesNotMatch(noCar.main(), /value="soc"/, 'ohne Auto kein Ladestand');
  assert.match(noCar.main(), /bis zum Abstecken/);
});

test('Protokoll: «nur Schaltungen» blendet Warte-Wechsel der Wallbox aus; Verbraucher einzeln filterbar', async () => {
  const now = Date.now();
  const u = uiEnv({
    chargerEvents: [
      { ts: now - 50000, mine: 'idle', reason: 'a' },
      { ts: now - 40000, mine: 'battery_priority', reason: 'b' },
      { ts: now - 30000, mine: 'solar_ev', reason: 'c' },
      { ts: now - 20000, mine: 'instant_ev', reason: 'd' },
      { ts: now - 10000, mine: 'holding', reason: 'e' },
    ],
    events: [
      { ts: now - 5000, id: 'dry', name: 'Entfeuchter', cmd: 'on', live: false, reason: 'x' },
      { ts: now - 4000, id: 'boil', name: 'Boiler', cmd: 'on', live: false, reason: 'y' },
    ],
  });
  await u.init();
  const count = () => (u.main().match(/class="pl-time"/g) || []).length;
  assert.equal(count(), 7);
  u.click('data-ems-logcmd', '1');
  assert.match(u.main(), /log-chip on" data-ems-logcmd="1">nur Schaltungen/);
  assert.equal(count(), 4, 'Wallbox: Start (solar) und Ende (holding), dazu zwei Verbraucher');
  assert.doesNotMatch(u.main(), /Batterie hat Vorrang/);
  u.click('data-ems-logcmd', '1');
  u.click('data-ems-logf', 'cons');
  assert.match(u.main(), /data-ems-logdev="Boiler">Boiler/);
  u.click('data-ems-logdev', 'Boiler');
  assert.equal(count(), 1);
  assert.match(u.main(), /Boiler ein/);
  u.click('data-ems-logdev', '*');
  assert.equal(count(), 2);
});

test('Protokoll: Filter erscheinen für eingerichtete Bereiche auch ohne Einträge, «nur Schaltungen» immer', async () => {
  const u = uiEnv({ chargerEvents: [{ ts: Date.now() - 10000, mine: 'idle', reason: 'a' }] });
  await u.init();
  assert.match(u.main(), /data-ems-logf="car">Wallbox/);
  assert.match(u.main(), /data-ems-logf="cons">Verbraucher/, 'Verbraucher eingerichtet, noch ohne Eintrag');
  assert.match(u.main(), /data-ems-logcmd="1">nur Schaltungen/);
  u.click('data-ems-logf', 'cons');
  assert.match(u.main(), /Noch keine Einträge/);
});

test('Protokoll: Wechsel nur des Vergleichs-EMS erzeugen keine Wallbox-Einträge (gleicher eigener Modus)', async () => {
  const now = Date.now();
  const u = uiEnv({
    chargerEvents: [
      { ts: now - 50000, mine: 'battery_priority', other: 'idle', reason: '17% < 50%' },
      { ts: now - 40000, mine: 'battery_priority', other: 'holding', reason: '17% < 50%' },
      { ts: now - 30000, mine: 'battery_priority', other: 'idle', reason: '18% < 50%' },
      { ts: now - 20000, mine: 'idle', other: 'idle', reason: 'kein Überschuss' },
      { ts: now - 10000, mine: 'idle', other: 'holding', reason: 'kein Überschuss' },
    ],
  });
  await u.init();
  u.click('data-ems-logf', 'car');
  assert.equal((u.main().match(/class="pl-time"/g) || []).length, 2, 'nur die zwei eigenen Wechsel');
});

test('Verbraucher-Symbol: in der Config geprüft, im Protokoll verwendet; Wallbox mit Auto-Symbol, wenn ein Auto eingerichtet ist', async () => {
  assert.equal(normalizeConfig({ consumers: [{ id: 'p', icon: 'bike' }] }).consumers[0].icon, 'bike');
  assert.equal(normalizeConfig({ consumers: [{ id: 'p', icon: 'unsinn' }] }).consumers[0].icon, '');
  const now = Date.now();
  const u = uiEnv({
    cfg: { car: { deviceId: 'car', capacityKwh: 60 }, consumers: [{ id: 'dry', name: 'Entfeuchter' }, { id: 'boil', name: 'eBike', icon: 'bike' }] },
    events: [{ ts: now - 5000, id: 'boil', name: 'eBike', cmd: 'on', live: false, reason: 'x' }],
    chargerEvents: [{ ts: now - 9000, mine: 'idle', reason: 'a' }],
  });
  await u.init();
  const html = u.main();
  const bike = 'M2 16.5a3.5';
  const car = 'M5 17H3v-5l2-5h14';
  const logPart = html.slice(html.indexOf('id="ems-log"'));
  assert.ok(logPart.indexOf(bike) > 0, 'eBike-Eintrag mit Velo-Symbol');
  assert.ok(logPart.indexOf(car) > 0, 'Wallbox-Eintrag mit Auto-Symbol');
});

test('E-Auto-Badge: nicht angesteckt, lädt, Ziel erreicht, angesteckt', async () => {
  const badge = async (car, charger) => {
    const u = uiEnv({ cfg: { car: { deviceId: 'car', capacityKwh: 60 } }, shadow: { car, charger } });
    await u.init();
    const m = u.main().match(/class="car-badge"[^>]*>([^<]+)</);
    return m ? m[1] : null;
  };
  assert.equal(await badge({ soc: 40, state: 'planned', connected: false }, { connected: false }), 'nicht angesteckt');
  assert.equal(await badge({ soc: 40, state: 'planned', connected: true }, { connected: true, chargerPowerW: 7000 }), 'lädt');
  assert.equal(await badge({ soc: 80, state: 'reached', connected: true }, { connected: true, chargerPowerW: 0 }), 'Ziel erreicht');
  assert.equal(await badge({ soc: 50, state: 'none', connected: true }, { connected: true, chargerPowerW: 0 }), 'angesteckt');
});

test('Hausanschluss-Zeile: höchste Phase in A, darunter klein kW gesamt, unten L1 bis L3 mit A, kW und Balken', async () => {
  const u = uiEnv({
    cfg: { fuse: { enabled: true } },
    shadow: {
      fuse: {
        limitA: 36, maxA: 2.5, phasesA: [2.5, 1.8, 2.2], phase: 1, over: false, capAmps: 16, shed: [], live: false, gridW: -20,
      },
    },
  });
  await u.init();
  const html = u.main();
  assert.match(html, /<span class="ems-item-n">Hausanschluss 2\.5 A von 36 A<\/span><span class="ems-item-s ems-muted">1\.5 kW · simuliert<\/span>/);
  assert.match(html, /<span class="ems-muted">L1<\/span> <b>2\.5 A<\/b><\/div><div class="fuse-bar"><i style="width:7%;[^"]*"><\/i><\/div><div class="ems-muted fuse-kw">0\.6 kW<\/div>/);
  assert.match(html, /L2<\/span> <b>1\.8 A<\/b>[\s\S]*?fuse-kw">0\.4 kW/);
  assert.match(html, /L3<\/span> <b>2\.2 A<\/b>[\s\S]*?fuse-kw">0\.5 kW/);
  assert.equal((html.match(/class="fuse-bar"/g) || []).length, 3, 'ein Balken je Phase');
  assert.doesNotMatch(html, /Einspeisung|Bezug/);
});
