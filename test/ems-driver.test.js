'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

// ---------------------------------------------------------------- Attrappe für das Modul "homey"
class FakeDevice {
  constructor(homey, caps = {}) {
    this.homey = homey;
    this._caps = { ...caps };
    this.listeners = {};
    this.errors = [];
  }
  hasCapability(c) { return c in this._caps; }
  async addCapability(c) { this._caps[c] = null; this.added = (this.added || []).concat(c); }
  getCapabilityValue(c) { return this._caps[c] === undefined ? null : this._caps[c]; }
  async setCapabilityValue(c, v) { this._caps[c] = v; }
  registerCapabilityListener(c, f) { this.listeners[c] = f; }
  error(...a) { this.errors.push(a.join(' ')); }
}
class FakeDriver {
  constructor(homey, devices = []) { this.homey = homey; this._devices = devices; }
  getDevices() { return this._devices; }
}
const origLoad = Module._load;
Module._load = function patched(request, ...rest) {
  if (request === 'homey') return { Device: FakeDevice, Driver: FakeDriver, App: class {} };
  return origLoad.call(this, request, ...rest);
};
const EmsDevice = require('../drivers/ems/device');
const { CAPABILITIES } = EmsDevice;
const EmsDriver = require('../drivers/ems/driver');
Module._load = origLoad;

const { buildDeviceState, MODES } = require('../lib/ems/DeviceState');
const { EmsController } = require('../lib/ems/EmsController');

const CAPS = { onoff: false, ems_mode: null, ems_status_text: null, ems_surplus: null, ems_charge_now: false };

function makeHomey({ ems = null, priceDevices = [{}] } = {}) {
  const fired = [];
  return {
    fired,
    app: { ems },
    drivers: { getDriver: (id) => ({ getDevices: () => (id === 'innostrom' ? priceDevices : []) }) },
    i18n: { getLanguage: () => 'de' },
    flow: {
      getDeviceTriggerCard: (id) => ({ trigger: async (dev, tokens) => { fired.push([id, tokens]); } }),
    },
  };
}

// ---------------------------------------------------------------- Zustand

test('DeviceState: ausgeschaltet, vor dem ersten Lauf, bekannter und unbekannter Modus', () => {
  assert.equal(buildDeviceState({ enabled: false, charger: null, chargeNow: false }).mode, 'disabled');
  const first = buildDeviceState({ enabled: true, charger: null, chargeNow: false });
  assert.equal(first.mode, 'idle');
  const s = buildDeviceState({
    enabled: true,
    charger: { mine: { mode: 'solar_ev', reason: '16A/3ph' }, gridW: -3250.4, pvW: 6400.6, houseW: 1200.2, batteryW: -45.5, releasedW: 3300 },
    chargeNow: true, priceRp: 31.456, forecast: { todayKwh: 12.345, tomorrowKwh: 20.04, nowKw: 3.456 },
  });
  assert.deepEqual(s, {
    enabled: true, mode: 'solar_ev', text: '16A/3ph', surplusW: 3250, pvW: 6401, houseW: 1200, gridW: -3250, batteryW: -45, releasedW: 3300,
    chargeNow: true, priceRp: 31.5, pvTodayKwh: 12.3, pvTomorrowKwh: 20, pvNowKw: 3.46,
  });
  // Fehlende Werte bleiben null (werden am Gerät nicht überschrieben)
  const partial = buildDeviceState({ enabled: true, charger: { mine: { mode: 'idle', reason: '' }, gridW: 10 }, chargeNow: false });
  assert.equal(partial.pvW, null);
  assert.equal(partial.pvTodayKwh, null);
  assert.equal(partial.priceRp, null);
  // Ausgeschaltet: keine Messwerte, aber Preis und Prognose bleiben
  const off = buildDeviceState({ enabled: false, charger: null, chargeNow: false, priceRp: 30, forecast: { todayKwh: 1, tomorrowKwh: 2, nowKw: 0.5 } });
  assert.equal(off.pvW, null);
  assert.equal(off.priceRp, 30);
  assert.equal(buildDeviceState({ enabled: true, charger: { mine: { mode: 'quatsch', reason: 'x' }, gridW: 100 }, chargeNow: false }).mode, 'idle');
  assert.equal(buildDeviceState({ enabled: true, charger: { mine: { mode: 'error', reason: 'x' }, gridW: null }, chargeNow: false }).surplusW, 0);
  assert.equal(buildDeviceState({ enabled: true, charger: { mine: { mode: 'holding', reason: '' }, gridW: 400 }, chargeNow: false }).surplusW, 0, 'Netzbezug ist kein Überschuss');
});

test('Capability ems_mode und Flow-Dropdown kennen dieselben Modi wie der Code', () => {
  const cap = JSON.parse(fs.readFileSync(path.join(__dirname, '../.homeycompose/capabilities/ems_mode.json'), 'utf8'));
  assert.deepEqual(cap.values.map((v) => v.id), MODES);
  const cond = JSON.parse(fs.readFileSync(path.join(__dirname, '../.homeycompose/flow/conditions/ems_mode_is.json'), 'utf8'));
  assert.deepEqual(cond.args[1].values.map((v) => v.id), MODES);
});

test('Treiber-Konfiguration: eigene Capabilities und Flow-Karten für den Treiber "ems"', () => {
  const root = path.join(__dirname, '..');
  const drv = JSON.parse(fs.readFileSync(path.join(root, 'drivers/ems/driver.compose.json'), 'utf8'));
  assert.equal(drv.id, 'ems');
  assert.deepEqual(drv.capabilities, CAPABILITIES, 'Treiber und Gerät kennen dieselben Capabilities in derselben Reihenfolge');
  for (const c of CAPABILITIES.filter((x) => x !== 'onoff')) {
    const file = path.join(root, '.homeycompose/capabilities', c + '.json');
    assert.ok(fs.existsSync(file), c);
    const cap = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.ok(cap.icon && fs.existsSync(path.join(root, cap.icon)), c + ' hat ein vorhandenes Icon');
    assert.ok(cap.title.en && cap.title.de, c + ' hat Titel');
  }
  for (const f of ['triggers/ems_mode_changed', 'triggers/ems_consumer_switched', 'conditions/ems_mode_is']) {
    const card = JSON.parse(fs.readFileSync(path.join(root, '.homeycompose/flow', f + '.json'), 'utf8'));
    assert.equal(card.args[0].filter, 'driver_id=ems', f + ' ist an den EMS-Treiber gebunden');
  }
  // Die App-weiten Sofortladen-Karten gibt es nicht mehr (Capability ersetzt sie)
  assert.ok(!fs.existsSync(path.join(root, '.homeycompose/flow/actions/ems_charge_now_on.json')));
  // Bilder für den Treiber
  for (const f of ['small', 'large', 'xlarge']) assert.ok(fs.existsSync(path.join(root, 'drivers/ems/assets/images', f + '.png')));
});

// ---------------------------------------------------------------- Treiber

test('Treiber: bietet genau ein Gerät an, danach keines mehr', async () => {
  const homey = makeHomey();
  const first = new EmsDriver(homey, []);
  first.homey = homey;
  const list = await first.onPairListDevices();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'Energiemanagement');
  assert.deepEqual(list[0].data, { id: 'ems' });
  const second = new EmsDriver(homey, [{}]);
  second.homey = homey;
  assert.deepEqual(await second.onPairListDevices(), []);
});

test('Treiber: ohne Preis-Gerät (Innostrom) kein Koppeln, mit klarer Meldung', async () => {
  const homey = makeHomey({ priceDevices: [] });
  const drv = new EmsDriver(homey, []);
  drv.homey = homey;
  await assert.rejects(() => drv.onPairListDevices(), /Preis-Gerät/);
  const en = makeHomey({ priceDevices: [] });
  en.i18n.getLanguage = () => 'en';
  const d2 = new EmsDriver(en, []);
  d2.homey = en;
  await assert.rejects(() => d2.onPairListDevices(), /price device first/);
  const noDriver = makeHomey();
  noDriver.drivers = { getDriver: () => { throw new Error('kein Treiber'); } };
  const d3 = new EmsDriver(noDriver, []);
  d3.homey = noDriver;
  await assert.rejects(() => d3.onPairListDevices(), /Preis-Gerät/);
});

// ---------------------------------------------------------------- Gerät

function makeDevice(emsStub) {
  const homey = makeHomey({ ems: emsStub });
  const dev = new EmsDevice(homey, { ...CAPS });
  return { dev, homey };
}
const emsStub = () => {
  const calls = [];
  return {
    calls,
    attachDevice: (d) => calls.push(['attach']),
    detachDevice: (d) => calls.push(['detach']),
    setEnabled: (v) => calls.push(['enabled', v]),
    setChargeNow: async (v) => calls.push(['chargeNow', v]),
  };
};

test('Gerät: ergänzt beim Start fehlende Capabilities (Update eines gekoppelten Geräts)', async () => {
  const { dev } = makeDevice(emsStub());
  await dev.onInit();
  for (const c of CAPABILITIES) assert.ok(dev.hasCapability(c), c);
  assert.deepEqual(dev.added.sort(), CAPABILITIES.filter((c) => !(c in CAPS)).sort());
});

test('Gerät: meldet sich beim EMS an und leitet Schalter weiter', async () => {
  const ems = emsStub();
  const { dev } = makeDevice(ems);
  await dev.onInit();
  assert.deepEqual(ems.calls[0], ['attach']);
  await dev.listeners.onoff(true);
  await dev.listeners.ems_charge_now(true);
  assert.deepEqual(ems.calls.slice(1), [['enabled', true], ['chargeNow', true]]);
  await dev.onDeleted();
  assert.deepEqual(ems.calls.at(-1), ['detach']);
});

test('Gerät: publish setzt Capabilities, Modus-Auslöser nur bei echtem Wechsel', async () => {
  const { dev, homey } = makeDevice(emsStub());
  await dev.onInit();
  const st = (mode, text = 't') => ({
    enabled: true, mode, text, surplusW: 120, chargeNow: false, pvW: 700, houseW: 800, gridW: 8, batteryW: -46,
    releasedW: 0, priceRp: 34.3, pvTodayKwh: 0.2, pvTomorrowKwh: 4.9, pvNowKw: 0.32,
  });
  await dev.publish(st('idle'));
  assert.equal(dev.getCapabilityValue('ems_mode'), 'idle');
  assert.equal(dev.getCapabilityValue('ems_surplus'), 120);
  assert.equal(dev.getCapabilityValue('onoff'), true);
  assert.equal(dev.getCapabilityValue('ems_pv_power'), 700);
  assert.equal(dev.getCapabilityValue('ems_house_power'), 800);
  assert.equal(dev.getCapabilityValue('ems_grid_power'), 8);
  assert.equal(dev.getCapabilityValue('ems_battery_power'), -46);
  assert.equal(dev.getCapabilityValue('ems_price'), 34.3);
  assert.equal(dev.getCapabilityValue('ems_pv_tomorrow'), 4.9);
  assert.equal(dev.getCapabilityValue('ems_pv_now'), 0.32);
  // Fehlende Werte überschreiben nichts
  await dev.publish({ enabled: true, mode: 'idle', text: 't', surplusW: 0, chargeNow: false, pvW: null, houseW: null, gridW: null, batteryW: null, releasedW: null, priceRp: null, pvTodayKwh: null, pvTomorrowKwh: null, pvNowKw: null });
  assert.equal(dev.getCapabilityValue('ems_pv_power'), 700);
  assert.equal(dev.getCapabilityValue('ems_pv_tomorrow'), 4.9);
  assert.deepEqual(homey.fired, [], 'erster Zustand löst keinen Wechsel aus');
  await dev.publish(st('idle', 'anderer Text'));
  assert.deepEqual(homey.fired, [], 'gleicher Modus löst nichts aus');
  await dev.publish(st('solar_ev', '10A/3ph'));
  assert.equal(homey.fired.length, 1);
  assert.deepEqual(homey.fired[0], ['ems_mode_changed', { mode: 'solar_ev', status: '10A/3ph' }]);
});

test('Gerät: Verbraucher-Auslöser mit Tokens', async () => {
  const { dev, homey } = makeDevice(emsStub());
  await dev.onInit();
  dev.fireConsumerSwitched({ name: 'Entfeuchter', cmd: 'on', live: false, reason: 'SoC 99%' });
  dev.fireConsumerSwitched({ name: 'Entfeuchter', cmd: 'off', live: true, reason: 'fertig' });
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(homey.fired[0], ['ems_consumer_switched', { name: 'Entfeuchter', state: 'on', live: false, reason: 'SoC 99%' }]);
  assert.deepEqual(homey.fired[1][1].state, 'off');
  assert.equal(homey.fired[1][1].live, true);
});

// ---------------------------------------------------------------- Controller

function makeApp() {
  const settings = new Map();
  const timers = new Map();
  let nextId = 1;
  const homey = {
    settings: { get: (k) => settings.get(k), set: (k, v) => settings.set(k, JSON.parse(JSON.stringify(v))) },
    clock: { getTimezone: () => 'Europe/Zurich' },
    drivers: { getDriver: () => ({ getDevices: () => [] }) },
    setTimeout: (f, ms) => { const id = nextId++; timers.set(id, ms); return id; },
    clearTimeout: (id) => { timers.delete(id); },
  };
  const logs = [];
  const app = { homey, log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push('ERR ' + a.join(' ')) };
  return { app, timers, settings, logs };
}
function fakeEmsDevice() {
  const published = [];
  const events = [];
  return {
    published, events,
    publish: async (s) => { published.push(s); },
    fireConsumerSwitched: (e) => events.push(e),
  };
}

test('Controller: ohne Gerät läuft nichts, auch wenn "ein" gesetzt ist', () => {
  const { app, timers } = makeApp();
  const c = new EmsController(app);
  app.homey.settings.set('ems.config', { enabled: true });
  c.start();
  assert.equal(c.hasDevice(), false);
  assert.equal(c.isActive(), false);
  assert.equal(timers.size, 0, 'keine Timer ohne Gerät');
  const sh = c.getShadow();
  assert.equal(sh.deviceExists, false);
  assert.equal(sh.enabled, true);
  c.stop();
});

test('Controller: Gerät anmelden, ein/aus steuert die Timer, abmelden hält an', () => {
  const { app, timers } = makeApp();
  const c = new EmsController(app);
  c.start();
  const dev = fakeEmsDevice();
  c.attachDevice(dev);
  assert.equal(timers.size, 0, 'Gerät da, aber ausgeschaltet: keine Timer');
  assert.equal(c.getShadow().deviceExists, true);
  assert.equal(dev.published.at(-1).mode, 'disabled');

  c.setEnabled(true);
  assert.equal(c.isActive(), true);
  assert.equal(timers.size, 2, 'Batterie- und Wallbox-Lauf geplant');
  assert.equal(dev.published.at(-1).enabled, true);
  assert.equal(dev.published.at(-1).mode, 'idle');

  c.setEnabled(false);
  assert.equal(timers.size, 0);
  assert.equal(dev.published.at(-1).mode, 'disabled');

  c.setEnabled(true);
  assert.equal(timers.size, 2);
  c.detachDevice(dev);
  assert.equal(timers.size, 0, 'ohne Gerät angehalten');
  assert.equal(c.getShadow().deviceExists, false);
  c.stop();
});

test('Controller: Sofortladen ändert die Konfiguration und wird dem Gerät gemeldet', async () => {
  const { app } = makeApp();
  const c = new EmsController(app);
  c.start();
  const dev = fakeEmsDevice();
  c.attachDevice(dev);
  await c.setChargeNow(true);
  assert.equal(c.getConfig().charger.chargeNow, true);
  assert.equal(dev.published.at(-1).chargeNow, true);
  await c.setChargeNow(false);
  assert.equal(dev.published.at(-1).chargeNow, false);
  c.stop();
});

test('Controller: Verbraucher-Ereignisse gehen ans Gerät, ohne Gerät passiert nichts', () => {
  const { app } = makeApp();
  const c = new EmsController(app);
  c.start();
  c._onConsumerEvent({ name: 'X', cmd: 'on' }); // ohne Gerät: kein Fehler
  const dev = fakeEmsDevice();
  c.attachDevice(dev);
  c._onConsumerEvent({ name: 'X', cmd: 'on', live: false, reason: 'r' });
  assert.equal(dev.events.length, 1);
  assert.equal(dev.events[0].name, 'X');
  c.stop();
});

test('Controller: "jetzt rechnen" verlangt das Gerät', async () => {
  const { app } = makeApp();
  const c = new EmsController(app);
  c.start();
  await assert.rejects(() => c.runNow(), /Gerät nicht hinzugefügt/);
  c.stop();
});

test('Controller: ein beim Start schon vorhandenes Gerät wird gefunden', () => {
  const { app } = makeApp();
  const dev = fakeEmsDevice();
  app.homey.drivers.getDriver = (id) => ({ getDevices: () => (id === 'ems' ? [dev] : []) });
  const c = new EmsController(app);
  c.start();
  assert.equal(c.hasDevice(), true);
  c.stop();
});

test('Controller: PV-Prognose einliefern und Faktor setzen, Kachel bekommt die Prognose', () => {
  const { app } = makeApp();
  const c = new EmsController(app);
  c.start();
  const dev = fakeEmsDevice();
  c.attachDevice(dev);
  const hour = 3600 * 1000;
  const start = Math.floor(Date.now() / hour) * hour + hour; // nächste volle Stunde
  const res = c.setPvForecast([{ start: new Date(start).toISOString(), kwh: 2 }, { start: new Date(start + hour).toISOString(), kwh: 1 }]);
  assert.equal(res.count, 2);
  assert.ok(dev.published.length >= 2);
  assert.equal(c.getShadow().pv.source, 'external');
  assert.equal(c.getShadow().pv.slots, 2);
  assert.throws(() => c.setPvForecast('kaputt'), /gültige JSON-Liste/);
  assert.equal(c.setPvFactor(0.8), 0.8);
  assert.equal(c.getConfig().pv.factor, 0.8);
  assert.throws(() => c.setPvFactor(0), /grösser als 0/);
  assert.throws(() => c.setPvFactor('x'), /grösser als 0/);
  c.stop();
});

test('PV-Flow-Aktionen: an den EMS-Treiber gebunden, mit Hinweis und Beispiel', () => {
  const root = path.join(__dirname, '..');
  const f = JSON.parse(fs.readFileSync(path.join(root, '.homeycompose/flow/actions/ems_set_pv_forecast.json'), 'utf8'));
  assert.equal(f.args[0].filter, 'driver_id=ems');
  assert.equal(f.args[1].type, 'text');
  assert.match(f.hint.de, /"start"/);
  assert.match(f.hint.en, /12 hours/);
  const k = JSON.parse(fs.readFileSync(path.join(root, '.homeycompose/flow/actions/ems_set_pv_factor.json'), 'utf8'));
  assert.equal(k.args[0].filter, 'driver_id=ems');
  assert.equal(k.args[1].type, 'number');
  assert.ok(k.args[1].min > 0 && k.args[1].max >= 2);
  const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(appJs, /getActionCard\('ems_set_pv_forecast'\)/);
  assert.match(appJs, /getActionCard\('ems_set_pv_factor'\)/);
});
