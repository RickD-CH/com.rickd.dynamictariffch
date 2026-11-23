'use strict';

// Schnellschalter im Verbraucher-Widget: «Nur Solar» und «Morgen nicht laden».

const test = require('node:test');
const assert = require('node:assert/strict');
const { EmsController } = require('../lib/ems/EmsController');
const { consumersWidget } = require('../lib/WidgetData');
const { normalizeConfig } = require('../lib/ems/Config');
const { localDateKey, addLocalDays } = require('../lib/time');

const TZ = 'Europe/Zurich';
const tomorrowKey = (nowMs) => localDateKey(addLocalDays(new Date(nowMs), 1, TZ), TZ);

function fake(carCfg) {
  let cfg = normalizeConfig({ enabled: true, car: carCfg });
  const f = {
    getConfig: () => cfg,
    homey: { clock: { getTimezone: () => TZ } },
    putConfig: (patch) => { cfg = normalizeConfig({ ...cfg, ...patch }); return cfg; },
    setCarTarget: (o) => EmsController.prototype.setCarTarget.call(f, o),
    clearCarTarget: () => EmsController.prototype.clearCarTarget.call(f),
  };
  return f;
}

test('«Nur Solar»: schaltet Netz nachladen aus und wieder ein, ohne die Wochenvorlage anzufassen', () => {
  const f = fake({ deviceId: 'car', capacityKwh: 52, schedule: { days: { mon: { on: true, time: '07:00', soc: 70 } } } });
  assert.equal(f.getConfig().car.schedule.gridCharge, true, 'Standard: Netz erlaubt');
  EmsController.prototype.setCarGridCharge.call(f, false); // Netz nachladen aus = «Nur Solar» an
  assert.equal(f.getConfig().car.schedule.gridCharge, false);
  EmsController.prototype.setCarGridCharge.call(f, true);
  assert.equal(f.getConfig().car.schedule.gridCharge, true);
  assert.equal(f.getConfig().car.schedule.days.mon.time, '07:00');
  assert.equal(f.getConfig().car.schedule.days.mon.soc, 70);
  assert.throws(() => EmsController.prototype.setCarGridCharge.call(fake({}), true), /Kein E-Auto/);
});

test('«Morgen nicht laden»: setzt den Eintrag für morgen mit Laden aus, löscht ihn wieder; ein fremder Eintrag bleibt', () => {
  const f = fake({ deviceId: 'car', capacityKwh: 52 });
  EmsController.prototype.setCarTomorrowOff.call(f, true);
  const o = f.getConfig().car.schedule.override;
  assert.equal(o.date, tomorrowKey(Date.now()));
  assert.equal(o.on, false);
  EmsController.prototype.setCarTomorrowOff.call(f, false);
  assert.equal(f.getConfig().car.schedule.override, null);
  // Eintrag «heute 90 %» (anderer Tag): «morgen nicht laden» ausschalten löscht ihn nicht
  f.setCarTarget({ day: 'today', soc: 90, time: '08:00', charge: true });
  EmsController.prototype.setCarTomorrowOff.call(f, false);
  assert.equal(f.getConfig().car.schedule.override.soc, 90);
});

test('Widget-Daten: controls nur mit eingerichtetem Auto; Zustand aus Konfiguration', () => {
  const nowMs = Date.now();
  const base = (car) => consumersWidget({
    shadow: { deviceExists: true, silent: false, config: { silent: false, consumers: [], charger: { id: 'wb', live: true }, car }, car: {}, charger: { current: { mine: {} } } },
    consumerCurrent: [],
    tz: TZ,
    nowMs,
  }).car;
  assert.equal(base(undefined).controls, null);
  assert.deepEqual(base({ deviceId: 'car', schedule: { gridCharge: true, override: null } }).controls, { solarOnly: false, tomorrowOff: false });
  assert.deepEqual(base({ deviceId: 'car', schedule: { gridCharge: false, override: { date: tomorrowKey(nowMs), on: false } } }).controls, { solarOnly: true, tomorrowOff: true });
  assert.equal(base({ deviceId: 'car', schedule: { override: { date: '2000-01-01', on: false } } }).controls.tomorrowOff, false, 'Eintrag für einen anderen Tag zählt nicht');
});
