'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { CostTracker, normalizeRef, isLowTariff } = require('../lib/CostTracker');

const TZ = 'Europe/Zurich';
// 2027-01-14 (Thu) 10:00 local = 09:00Z
const at = (h, m = 0) => new Date(Date.UTC(2027, 0, 14, h - 1, m));
const flat = (dyn, feedIn = 5) => () => ({ dyn, feedIn });
const REF = { price: 30 };

test('erste Meldung ist nur die Basislinie', () => {
  const t = new CostTracker({ tz: TZ });
  assert.equal(t.report('import', 100, at(10), flat(20), REF).status, 'baseline');
  assert.equal(t.summary('2027-01-14', '2027-01-14', REF).importKwh, 0);
});

test('Delta wird mit dem Preis der Viertelstunde bewertet', () => {
  const t = new CostTracker({ tz: TZ });
  t.report('import', 100, at(10, 0), flat(20), REF);
  const r = t.report('import', 101, at(10, 15), flat(20), REF);
  assert.equal(r.status, 'ok');
  const s = t.summary('2027-01-14', '2027-01-14', REF);
  assert.equal(s.importKwh, 1);
  assert.equal(s.importCostDyn, 20);
  assert.equal(s.netCostRef, 30);
  assert.equal(s.savings, 10);
  assert.equal(s.avgImportPriceDyn, 20);
});

test('Delta wird zeitanteilig auf die abgedeckten Viertelstunden verteilt', () => {
  const t = new CostTracker({ tz: TZ });
  const priceAt = (start) => ({ dyn: start.getUTCMinutes() === 0 ? 10 : 30, feedIn: 0 });
  t.report('import', 0, at(10, 0), priceAt, REF);
  t.report('import', 2, at(10, 30), priceAt, REF); // slots 10:00 (10) and 10:15 (30), 1 kWh each
  const s = t.summary('2027-01-14', '2027-01-14', REF);
  assert.equal(s.importKwh, 2);
  assert.equal(s.importCostDyn, 40);
  assert.equal(t.slotsOf('2027-01-14').length, 2);
});

test('lange Pause ohne Änderung: Delta nur auf die letzte Stunde', () => {
  const t = new CostTracker({ tz: TZ });
  const priceAt = (start) => ({ dyn: start.getTime() >= at(9, 0).getTime() ? 50 : 1, feedIn: 0 });
  t.report('export', 0, at(0, 30), priceAt, REF);
  t.report('export', 1, at(10, 0), priceAt, REF);
  const s = t.summary('2027-01-14', '2027-01-14', REF);
  assert.equal(s.exportKwh, 1);
  assert.equal(s.unpricedImportKwh, 0);
  const slots = t.slotsOf('2027-01-14');
  assert.equal(slots.length, 4);
  assert.ok(slots.every((x) => x[0] >= at(9, 0).getTime()));
});

test('Zähler-Reset und Lücke über 24h werden nicht bewertet', () => {
  const t = new CostTracker({ tz: TZ });
  t.report('import', 100, at(10), flat(20), REF);
  assert.equal(t.report('import', 5, at(10, 15), flat(20), REF).status, 'reset');
  const later = new Date(at(10, 15).getTime() + 25 * 3600 * 1000);
  assert.equal(t.report('import', 9, later, flat(20), REF).status, 'gap');
  assert.equal(t.summary('2027-01-01', '2027-12-31', REF).importKwh, 0);
  assert.equal(t.report('import', -1, later, flat(20), REF).status, 'invalid');
});

test('Slots ohne Preis zählen als unbewertet und gehen nicht in den Vergleich', () => {
  const t = new CostTracker({ tz: TZ });
  t.report('import', 0, at(10, 0), () => ({ dyn: null, feedIn: null }), REF);
  t.report('import', 1, at(10, 15), () => ({ dyn: null, feedIn: null }), REF);
  const s = t.summary('2027-01-14', '2027-01-14', REF);
  assert.equal(s.importKwh, 1);
  assert.equal(s.unpricedImportKwh, 1);
  assert.equal(s.netCostDyn, 0);
  assert.equal(s.netCostRef, 0);
});

test('Einspeisung wird gegen den Einspeisetarif gerechnet', () => {
  const t = new CostTracker({ tz: TZ });
  const ref = { price: 30, feedIn: 8 };
  t.report('export', 0, at(10, 0), flat(20, 4), ref);
  t.report('export', 2, at(10, 15), flat(20, 4), ref);
  const s = t.summary('2027-01-14', '2027-01-14', ref);
  assert.equal(s.exportRevenueDyn, 8);
  assert.equal(s.netCostDyn, -8);
  assert.equal(s.netCostRef, -16);
  assert.equal(s.savings, -8);
});

test('Referenzpreis wirkt rückwirkend, Niedertarif nach Zeitfenster und Wochenende', () => {
  const ref = normalizeRef({ price: 30, ntPrice: 20, ntFrom: '21:00', ntTo: '07:00', ntWeekend: true });
  assert.equal(isLowTariff(at(22), ref, TZ), true);
  assert.equal(isLowTariff(at(6), ref, TZ), true);
  assert.equal(isLowTariff(at(12), ref, TZ), false);
  // Sat 2027-01-16 noon
  assert.equal(isLowTariff(new Date(Date.UTC(2027, 0, 16, 11)), ref, TZ), true);

  const t = new CostTracker({ tz: TZ });
  t.report('import', 0, at(22, 0), flat(25), ref);
  t.report('import', 1, at(22, 15), flat(25), ref);
  assert.equal(t.summary('2027-01-14', '2027-01-14', ref).netCostRef, 20);
  assert.equal(t.summary('2027-01-14', '2027-01-14', { ...ref, ntPrice: 10 }).netCostRef, 10);
  assert.equal(t.summary('2027-01-14', '2027-01-14', {}).savings, null);
});

test('Batterie: Nutzen = Entlade- minus Ladewert, gegen den Referenzpreis', () => {
  const t = new CostTracker({ tz: TZ });
  t.report('battery_charge', 0, at(3, 0), flat(10), REF);
  t.report('battery_charge', 1, at(3, 15), flat(10), REF);
  t.report('battery_discharge', 0, at(18, 0), flat(40), REF);
  t.report('battery_discharge', 1, at(18, 15), flat(40), REF);
  const s = t.summary('2027-01-14', '2027-01-14', REF);
  // dyn: 40 - 10 = 30 ; ref: 30 - 30 = 0
  assert.equal(s.batteryBenefit, 30);
  assert.equal(s.batteryChargeKwh, 1);
  assert.equal(s.batteryDischargeKwh, 1);
});

test('JSON-Roundtrip, daily und reset', () => {
  const t = new CostTracker({ tz: TZ });
  t.report('import', 0, at(10, 0), flat(20), REF);
  t.report('import', 1, at(10, 15), flat(20), REF);
  const t2 = CostTracker.fromJSON(JSON.parse(JSON.stringify(t.toJSON())), { tz: TZ });
  assert.equal(t2.daily('2027-01-01', '2027-12-31', REF).length, 1);
  assert.equal(t2.summary('2027-01-14', '2027-01-14', REF).importCostDyn, 20);
  assert.ok(t2.lastReports().import);
  t2.reset();
  assert.equal(t2.daily('2027-01-01', '2027-12-31', REF).length, 0);
});
