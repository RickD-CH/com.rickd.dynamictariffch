'use strict';

// Flow-Karten des Energiemanagements (Fehler, Auto-Ziel, Silent-Modus), Sofortladen beim Abstecken,
// E-Auto: Solarstrom bevorzugen und Ferien mit Enddatum.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { nextDeparture, carPlan, solarAdjusted } = require('../lib/ems/planner/carSchedule');
const { EmsController } = require('../lib/ems/EmsController');
const { EmsRunner } = require('../lib/ems/EmsRunner');
const { ShadowLog } = require('../lib/ems/ShadowLog');
const { PriceFeed } = require('../lib/ems/PriceFeed');
const { PvFeed } = require('../lib/ems/PvFeed');
const { normalizeConfig } = require('../lib/ems/Config');
const { fromLocal } = require('../lib/time');

const TZ = 'Europe/Zurich';
const Q = 15 * 60 * 1000;
const tue = (h, m = 0) => fromLocal(2026, 11, 10, h, m).getTime();
const weekdays = (on, time = '06:00', soc = 80) => ({ days: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri'].map((d) => [d, { on, time, soc }])) });

// ---------------------------------------------------------------- Ferien mit Enddatum

test('Ferien: ohne Datum pausiert die Vorlage, mit Datum nur bis und mit diesem Tag', () => {
  const now = tue(18);
  assert.equal(nextDeparture({ schedule: { ...weekdays(true), holiday: true }, nowMs: now, tz: TZ }), null);
  const d = nextDeparture({ schedule: { ...weekdays(true), holiday: true, holidayUntil: '2026-11-12' }, nowMs: now, tz: TZ });
  assert.equal(d.date, '2026-11-13', 'Mi und Do pausiert, Fr wieder');
  const bad = nextDeparture({ schedule: { ...weekdays(true), holiday: true, holidayUntil: 'kaputt' }, nowMs: now, tz: TZ });
  assert.equal(bad, null, 'ungültiges Datum = bis ausgeschaltet');
});

// ---------------------------------------------------------------- Solarstrom bevorzugen

test('E-Auto: Viertelstunden mit erwartetem Solarüberschuss werden vor billigem Nachtstrom gewählt', () => {
  // Mo bis Fr 18:00 Abfahrt, jetzt Di 06:30: Nacht ist vorbei, tags 25 Rp., mittags Sonne
  const now = tue(6, 30);
  const out = [];
  for (let i = 0; i < 96; i++) out.push({ start: tue(0) + i * Q, end: tue(0) + (i + 1) * Q, price: 25 });
  const pvKwAt = (t) => (t >= tue(11) && t < tue(14) ? 5 : 0);
  const adj = solarAdjusted(out, pvKwAt);
  assert.equal(adj.filter((s) => s.solar).length, 12, '11-14 Uhr gilt als kostenlos');
  assert.equal(solarAdjusted(out, null), out, 'ohne Prognose unverändert');
  const p = carPlan({
    schedule: weekdays(true, '18:00'), nowMs: now, tz: TZ, soc: 60, capacityKwh: 60, powerKw: 11, slots: out, pvKwAt,
  });
  assert.equal(p.state, 'planned');
  assert.ok(p.starts.every((t) => t >= tue(11) && t < tue(14)), 'alle gewählten Viertelstunden in der Sonne');
  // Zu wenig Überschuss (unter Grundlast plus Mindestladeleistung) zählt nicht
  assert.equal(solarAdjusted(out, () => 1.5).some((s) => s.solar), false);
});

// ---------------------------------------------------------------- Sofortladen beim Abstecken

function chargerRunner({ autoOff = true } = {}) {
  const config = normalizeConfig({
    enabled: true, silent: false, devices: { meter: { id: 'm' } }, charger: { id: 'wb', chargeNow: true, chargeNowAutoOff: autoOff },
  });
  const i = {
    gridW: 300, houseW: 300, pvW: 0, batterySoc: null, batteryW: 0, chargerRead: true, chargerConnected: true, chargerPowerW: 0, chargerPhases: 3, other: null,
  };
  const off = [];
  const r = new EmsRunner({
    getConfig: () => config,
    prices: new PriceFeed(() => ({ priceStore: { range: () => [], value: (s) => s.integrated } })),
    pv: new PvFeed(null, () => {}, { get: async () => ({ slots: [], stale: true }) }),
    inputs: { chargerInputs: async () => i, consumerStates: async () => new Map() },
    actuators: { charger: async (id, cmd) => ({ cmd: cmd.type }), consumer: async () => ({}) },
    shadowLog: new ShadowLog({ get() {}, set() {} }),
    store: null,
    tz: TZ,
    onChargeNowOff: () => off.push(1),
  });
  return { r, i, off };
}

test('Sofortladen: geht aus, sobald das Auto abgesteckt wird (abschaltbar); ohne vorher angesteckt nichts', async () => {
  const a = chargerRunner();
  await a.r.tickCharger(tue(12));
  assert.deepEqual(a.off, []);
  a.i.chargerConnected = false;
  await a.r.tickCharger(tue(12) + 30000);
  assert.equal(a.off.length, 1, 'beim Abstecken einmal ausgeschaltet');

  const b = chargerRunner({ autoOff: false });
  await b.r.tickCharger(tue(12));
  b.i.chargerConnected = false;
  await b.r.tickCharger(tue(12) + 30000);
  assert.deepEqual(b.off, [], 'Option aus: bleibt an');

  const c = chargerRunner();
  c.i.chargerConnected = false;
  await c.r.tickCharger(tue(12));
  assert.deepEqual(c.off, [], 'war nie angesteckt (z. B. nach Neustart): nichts');
});

test('Config: «Sofort laden» beim Abstecken ausschalten ist standardmässig an', () => {
  assert.equal(normalizeConfig({}).charger.chargeNowAutoOff, true);
  assert.equal(normalizeConfig({ charger: { chargeNowAutoOff: false } }).charger.chargeNowAutoOff, false);
});

// ---------------------------------------------------------------- Controller: Auslöser und Aktionen

function makeCtrl() {
  const settings = new Map();
  const homey = {
    settings: { get: (k) => settings.get(k), set: (k, v) => settings.set(k, JSON.parse(JSON.stringify(v))) },
    clock: { getTimezone: () => TZ },
    drivers: { getDriver: () => ({ getDevices: () => [] }) },
    setTimeout: () => 1,
    clearTimeout: () => {},
  };
  const ctrl = new EmsController({ homey, log() {}, error() {} });
  const fired = [];
  ctrl.emsDevice = {
    publish: async () => {},
    fireError: (a, m) => fired.push(['error', a, m]),
    fireCarTargetReached: (s, t) => fired.push(['car', s, t]),
  };
  ctrl.runner = {
    current: { errors: [] }, chargerCurrent: null, batteryControl: null, carCurrent: null,
  };
  return { ctrl, fired, settings };
}

test('Fehler-Auslöser: je neues Problem einmal; Zusätze und «nicht gewählt» lösen nichts Neues aus', () => {
  const { ctrl, fired } = makeCtrl();
  const r = ctrl.runner;
  r.chargerCurrent = { mine: { mode: 'error', reason: 'Geräte noch nicht gewählt (Einstellungen)' } };
  ctrl._fireEvents();
  assert.deepEqual(fired, [], 'Einrichtung ist kein Fehler');
  r.chargerCurrent = { mine: { mode: 'error', reason: 'Netzzähler nicht lesbar' } };
  ctrl._fireEvents();
  r.chargerCurrent = { mine: { mode: 'error', reason: 'Netzzähler nicht lesbar - Mindeststrom' } };
  ctrl._fireEvents();
  assert.deepEqual(fired, [['error', 'charger', 'Netzzähler nicht lesbar']]);
  r.batteryControl = { error: 'Karte fehlt' };
  r.current.errors = ['Keine Preise'];
  ctrl._fireEvents();
  assert.deepEqual(fired.slice(1), [['error', 'battery', 'Karte fehlt'], ['error', 'data', 'Keine Preise']]);
  // Problem weg und wieder da: neu ausgelöst
  r.chargerCurrent = { mine: { mode: 'idle', reason: '' } };
  ctrl._fireEvents();
  r.chargerCurrent = { mine: { mode: 'error', reason: 'Netzzähler nicht lesbar' } };
  ctrl._fireEvents();
  assert.equal(fired.filter((f) => f[1] === 'charger').length, 2);
});

test('Auto-Ziel erreicht: löst beim Wechsel auf «erreicht» einmal aus, nicht beim Start', () => {
  const { ctrl, fired } = makeCtrl();
  const r = ctrl.runner;
  r.carCurrent = { state: 'reached', soc: 81, departure: { soc: 80 } };
  ctrl._fireEvents();
  assert.deepEqual(fired, [], 'beim Start schon erreicht: kein Auslöser');
  r.carCurrent = { state: 'planned', soc: 60, departure: { soc: 80 } };
  ctrl._fireEvents();
  r.carCurrent = { state: 'reached', soc: 80, departure: { soc: 80 } };
  ctrl._fireEvents();
  ctrl._fireEvents();
  assert.deepEqual(fired, [['car', 80, 80]]);
});

test('Aktionen: Silent-Modus setzen, Auto-Ziel für heute/morgen setzen und wieder aufheben', () => {
  const { ctrl, settings } = makeCtrl();
  settings.set('ems.config', normalizeConfig({ silent: true, car: { deviceId: 'car', capacityKwh: 60, schedule: weekdays(true) } }));
  ctrl.setSilent(false);
  assert.equal(ctrl.getConfig().silent, false);
  ctrl.setSilent(true);
  assert.equal(ctrl.getConfig().silent, true);
  ctrl.setCarTarget({
    day: 'tomorrow', soc: 90, time: '07:30', charge: true,
  });
  const o = ctrl.getConfig().car.schedule.override;
  assert.equal(o.soc, 90);
  assert.equal(o.time, '07:30');
  assert.equal(o.on, true);
  assert.match(o.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(ctrl.getConfig().car.schedule.days.mon.on, true, 'Vorlage bleibt');
  ctrl.clearCarTarget();
  assert.equal(ctrl.getConfig().car.schedule.override, null);
  settings.set('ems.config', normalizeConfig({}));
  assert.throws(() => ctrl.setCarTarget({ day: 'today' }), /Kein E-Auto/);
});

test('Aktion/Bedingung «Sofort laden»: schaltet den Schalter wie am Gerät, Lauf wird angestossen', async () => {
  const { ctrl, settings } = makeCtrl();
  settings.set('ems.config', normalizeConfig({ silent: true, devices: { meter: { id: 'm' } }, charger: { id: 'wb' } }));
  assert.equal(ctrl.getConfig().charger.chargeNow, false);
  await ctrl.setChargeNow(true);
  assert.equal(ctrl.getConfig().charger.chargeNow, true);
  await ctrl.setChargeNow(false);
  assert.equal(ctrl.getConfig().charger.chargeNow, false);
});

test('Aktion/Bedingung «Notstrom-Reserve»: schaltet wie am Gerät, die eingestellte Reserve (%) bleibt dabei erhalten', async () => {
  const { ctrl, settings } = makeCtrl();
  settings.set('ems.config', normalizeConfig({
    silent: true, devices: { meter: { id: 'm' } }, battery: { deviceId: 'bat', backupReserve: { soc: 65 } },
  }));
  assert.deepEqual(ctrl.getConfig().battery.backupReserve, { active: false, soc: 65 });
  await ctrl.setBackupReserve(true);
  assert.deepEqual(ctrl.getConfig().battery.backupReserve, { active: true, soc: 65 }, 'die Reserve (%) bleibt beim Einschalten erhalten');
  await ctrl.setBackupReserve(false);
  assert.deepEqual(ctrl.getConfig().battery.backupReserve, { active: false, soc: 65 });
  // Default ohne eigene Angabe
  settings.set('ems.config', normalizeConfig({}));
  assert.deepEqual(ctrl.getConfig().battery.backupReserve, { active: false, soc: 50 });
});

// ---------------------------------------------------------------- Karten vorhanden und registriert

test('Flow-Karten: Dateien vorhanden (de/en) und in app.js registriert', () => {
  const root = path.join(__dirname, '..');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  for (const [dir, id] of [['triggers', 'ems_error'], ['triggers', 'ems_car_target_reached'], ['actions', 'ems_set_silent'], ['actions', 'ems_car_set_target'], ['actions', 'ems_car_clear_target'], ['actions', 'ems_charge_now_set'], ['actions', 'ems_backup_reserve_set'], ['conditions', 'ems_silent_is_on'], ['conditions', 'ems_charge_now_is_on'], ['conditions', 'ems_backup_reserve_is_on']]) {
    const card = JSON.parse(fs.readFileSync(path.join(root, '.homeycompose/flow', dir, `${id}.json`), 'utf8'));
    assert.ok(card.title.de && card.title.en, id);
    assert.ok(card.args.some((a) => a.type === 'device' && a.filter === 'driver_id=ems'), id);
    if (dir !== 'triggers') assert.ok(app.includes(`'${id}'`), `${id} in app.js`);
  }
  const dev = fs.readFileSync(path.join(root, 'drivers/ems/device.js'), 'utf8');
  assert.ok(dev.includes("getDeviceTriggerCard('ems_error')") && dev.includes("getDeviceTriggerCard('ems_car_target_reached')"));
});

test('SG-Ready und Warmwasser-Programm: Auslöser nur bei echtem Wechsel, nicht beim ersten Zustand und nicht beim Aus-/Einschalten', () => {
  const { ctrl, fired } = makeCtrl();
  ctrl.emsDevice.fireSgReady = (s, r) => fired.push(['sg', s, r]);
  ctrl.emsDevice.fireDhw = (on, r) => fired.push(['dhw', on, r]);
  const r = ctrl.runner;
  r.sgReadyCurrent = { state: 'off', reason: 'wartet' };
  r.dhwCurrent = { on: false, reason: 'wartet' };
  ctrl._fireEvents();
  assert.deepEqual(fired, [], 'erster beobachteter Zustand');
  r.sgReadyCurrent = { state: 'boost', reason: 'Start' };
  r.dhwCurrent = { on: true, reason: 'Start WW' };
  ctrl._fireEvents();
  assert.deepEqual(fired, [['sg', 'boost', 'Start'], ['dhw', true, 'Start WW']]);
  ctrl._fireEvents();
  assert.equal(fired.length, 2, 'keine Wiederholung ohne Wechsel');
  r.sgReadyCurrent = null; // Modul ausgeschaltet
  r.dhwCurrent = null;
  ctrl._fireEvents();
  r.sgReadyCurrent = { state: 'off', reason: 'wartet' }; // wieder eingeschaltet: das ist kein Wechsel
  r.dhwCurrent = { on: false, reason: 'wartet' };
  ctrl._fireEvents();
  assert.equal(fired.length, 2);
  r.sgReadyCurrent = { state: 'forced', reason: 'Zwang' };
  ctrl._fireEvents();
  assert.deepEqual(fired[2], ['sg', 'forced', 'Zwang']);
});

test('SG-Ready/Warmwasser-Flow-Karten: Dateien (de/en), an den EMS-Treiber gebunden, Bedingungen in app.js, Auslöser im Gerät', () => {
  const root = path.join(__dirname, '..');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  for (const [dir, id] of [['triggers', 'ems_sgready_changed'], ['triggers', 'ems_dhw_changed'], ['conditions', 'ems_sgready_is'], ['conditions', 'ems_dhw_is_running']]) {
    const card = JSON.parse(fs.readFileSync(path.join(root, '.homeycompose/flow', dir, `${id}.json`), 'utf8'));
    assert.ok(card.title.de && card.title.en, id);
    assert.equal(card.args[0].filter, 'driver_id=ems', id);
    if (dir === 'conditions') assert.ok(app.includes(`'${id}'`), `${id} in app.js`);
  }
  const dev = fs.readFileSync(path.join(root, 'drivers/ems/device.js'), 'utf8');
  assert.ok(dev.includes("getDeviceTriggerCard('ems_sgready_changed')") && dev.includes("getDeviceTriggerCard('ems_dhw_changed')"));
  const cond = JSON.parse(fs.readFileSync(path.join(root, '.homeycompose/flow/conditions/ems_sgready_is.json'), 'utf8'));
  assert.deepEqual(cond.args[1].values.map((v) => v.id), ['normal', 'boost', 'forced']);
});

test('Aktionen «jetzt aufheizen» / «jetzt starten»: Dateien (de/en), an den EMS-Treiber gebunden, in app.js verdrahtet', () => {
  const root = path.join(__dirname, '..');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  for (const [id, mod] of [['ems_sgready_start', 'sgready'], ['ems_dhw_start', 'dhw']]) {
    const card = JSON.parse(fs.readFileSync(path.join(root, '.homeycompose/flow/actions', `${id}.json`), 'utf8'));
    assert.ok(card.title.de && card.title.en && card.hint.de && card.hint.en, id);
    assert.equal(card.args[0].filter, 'driver_id=ems', id);
    assert.ok(app.includes(`getActionCard('${id}')`) && app.includes(`startModuleNow('${mod}')`), `${id} in app.js`);
  }
});
