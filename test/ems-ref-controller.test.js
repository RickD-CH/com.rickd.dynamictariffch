'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EmsController } = require('../lib/ems/EmsController');
const { Inputs } = require('../lib/ems/Inputs');
const { planWidget, consumersWidget, refsView } = require('../lib/WidgetData');

function makeApp() {
  const settings = new Map();
  const timers = new Map();
  let nextId = 1;
  const homey = {
    settings: { get: (k) => settings.get(k), set: (k, v) => settings.set(k, JSON.parse(JSON.stringify(v))) },
    clock: { getTimezone: () => 'Europe/Zurich' },
    drivers: { getDriver: () => ({ getDevices: () => [] }) },
    setTimeout: (f, ms) => { const id = nextId++; timers.set(id, { f, ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
  };
  const logs = [];
  return { app: { homey, log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(`ERR ${a.join(' ')}`) }, timers, settings, logs };
}

const CFG = {
  enabled: true,
  devices: { meter: { id: 'meter', capability: 'measure_power' } },
  battery: { deviceId: 'bat', socCapability: 'measure_battery' },
  charger: { id: 'wb' },
  car: { deviceId: 'car', socCapability: 'measure_battery', capacityKwh: 52 },
};

function withWorld(devices, flows, fn) {
  const orig = Inputs.prototype.refWorld;
  Inputs.prototype.refWorld = async () => ({ devices: new Map(Object.entries(devices)), flowIds: new Set(flows) });
  return Promise.resolve(fn()).finally(() => { Inputs.prototype.refWorld = orig; });
}

const WORLD = {
  meter: { name: 'Zähler', caps: ['measure_power'] },
  bat: { name: 'Batterie', caps: ['measure_battery'] },
  wb: { name: 'Wallbox', caps: ['evcharger_charging_state', 'measure_power'] },
};

test('checkRefs: findet das gelöschte Auto, ersetzt das Ergebnis bei der nächsten Prüfung', async () => {
  const { app, settings } = makeApp();
  settings.set('ems.config', CFG);
  const c = new EmsController(app);
  assert.deepEqual(c.refCheckResult(), { at: 0, ok: false, issues: [] }, 'vor der ersten Prüfung nichts behaupten');
  await withWorld(WORLD, [], async () => {
    const r = await c.checkRefs();
    assert.equal(r.ok, true);
    assert.deepEqual(r.issues.map((i) => i.key), ['car.deviceId']);
    assert.equal(c.refCheckResult().issues.length, 1);
  });
  await withWorld({ ...WORLD, car: { name: 'Auto', caps: ['measure_battery'] } }, [], async () => {
    const r = await c.checkRefs();
    assert.deepEqual(r.issues, []);
  });
});

test('checkRefs: bei einem Lesefehler bleibt das letzte Ergebnis, ok ist false', async () => {
  const { app, settings, logs } = makeApp();
  settings.set('ems.config', CFG);
  const c = new EmsController(app);
  await withWorld(WORLD, [], () => c.checkRefs());
  const orig = Inputs.prototype.refWorld;
  Inputs.prototype.refWorld = async () => { throw new Error('API weg'); };
  try {
    const r = await c.checkRefs();
    assert.equal(r.ok, false);
    assert.equal(r.issues.length, 1, 'das letzte Ergebnis wird nicht gelöscht');
    assert.ok(logs.some((l) => l.includes('nicht prüfbar')));
  } finally {
    Inputs.prototype.refWorld = orig;
  }
});

test('clearRef: entfernt den Verweis aus der Konfiguration und prüft neu', async () => {
  const { app, settings } = makeApp();
  settings.set('ems.config', CFG);
  const c = new EmsController(app);
  await withWorld(WORLD, [], async () => {
    const r = await c.clearRef('car.deviceId');
    assert.deepEqual(r.issues, []);
  });
  const stored = settings.get('ems.config');
  assert.equal(stored.car.deviceId, '');
  assert.equal(stored.car.capacityKwh, 52, 'andere Einstellungen bleiben');
  assert.equal(stored.battery.deviceId, 'bat');
  assert.equal(stored.enabled, true);
});

test('clearRef: unbekannter Schlüssel wird abgelehnt und ändert nichts', async () => {
  const { app, settings } = makeApp();
  settings.set('ems.config', CFG);
  const c = new EmsController(app);
  const before = JSON.stringify(settings.get('ems.config'));
  await assert.rejects(() => c.clearRef('battery.deviceId.x'), /nicht entfernbar/);
  await assert.rejects(() => c.clearRef(undefined), /nicht entfernbar/);
  assert.equal(JSON.stringify(settings.get('ems.config')), before);
});

test('Widget-Daten: refsView ist null ohne Probleme, sonst mit Zähler der kritischen', () => {
  assert.equal(refsView(null), null);
  assert.equal(refsView({ ok: true, issues: [] }), null);
  const v = refsView({
    ok: true,
    issues: [
      { area: 'car', field: 'device', problem: 'device', name: '', critical: false, key: 'car.deviceId', id: 'x' },
      { area: 'battery', field: 'device', problem: 'capability', name: 'Batterie', caps: ['measure_battery'], critical: true, key: 'battery.deviceId', id: 'y' },
    ],
  });
  assert.equal(v.critical, 1);
  assert.equal(v.issues.length, 2);
  assert.ok(!('key' in v.issues[0]) && !('id' in v.issues[0]), 'keine IDs und Schlüssel an die Widgets');
});

test('Widget-Daten: Plan- und Verbraucher-Widget geben die Verweise weiter', () => {
  const rc = { ok: true, issues: [{ area: 'car', field: 'device', problem: 'device', name: '', critical: false }] };
  const shadow = { deviceExists: true, config: { enabled: true, consumers: [] } };
  assert.equal(consumersWidget({ shadow, consumerCurrent: [], refCheck: rc }).refs.issues.length, 1);
  assert.equal(consumersWidget({ shadow, consumerCurrent: [] }).refs, null);
  const p = planWidget({ plan: { days: [] }, shadow, tz: 'Europe/Zurich', refCheck: rc });
  assert.equal(p.refs.issues[0].area, 'car');
});

test('Timer: die Prüfung wird nur geplant, solange das EMS aktiv ist', () => {
  const { app, timers, settings } = makeApp();
  settings.set('ems.config', { enabled: false });
  const c = new EmsController(app);
  c.start();
  assert.equal(timers.size, 0);
  c.stop();
  assert.equal(timers.size, 0);
});
