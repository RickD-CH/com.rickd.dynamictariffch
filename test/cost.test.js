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
  const ref = normalizeRef({
    price: 30, ntPrice: 20, ntFrom: '21:00', ntTo: '07:00', ntWeekend: true,
  });
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

test('Batterie aus PV: Ladung wird zum entgangenen Einspeisepreis bewertet', () => {
  const t = new CostTracker({ tz: TZ });
  const ref = { price: 30, feedIn: 0 };
  const priceAt = (start) => ({ dyn: start.getTime() < at(12).getTime() ? 10 : 40, feedIn: 5 });
  t.report('battery_charge', 0, at(3, 0), priceAt, ref);
  t.report('battery_charge', 1, at(3, 15), priceAt, ref);
  t.report('battery_discharge', 0, at(18, 0), priceAt, ref);
  t.report('battery_discharge', 1, at(18, 15), priceAt, ref);
  const s = t.summary('2027-01-14', '2027-01-14', ref);
  // dyn: 40 (avoided import) - 5 (feed-in forgone) = 35 ; ref: 30 - 0 = 30
  assert.equal(s.batteryBenefit, 5);
  assert.equal(s.batteryChargeKwh, 1);
  assert.equal(s.batteryDischargeKwh, 1);
});

test('Batterie aus dem Netz: Import derselben Viertelstunde wird zum Bezugspreis bewertet', () => {
  const t = new CostTracker({ tz: TZ });
  const ref = { price: 30, feedIn: 8 };
  // cheap at night (10 Rp.), expensive in the evening (40 Rp.), like a real price list
  const priceAt = (start) => ({ dyn: start.getTime() < at(12).getTime() ? 10 : 40, feedIn: 5 });
  t.report('import', 0, at(3, 0), priceAt, ref);
  t.report('battery_charge', 0, at(3, 0), priceAt, ref);
  t.report('import', 1, at(3, 15), priceAt, ref);
  t.report('battery_charge', 1, at(3, 15), priceAt, ref);
  t.report('battery_discharge', 0, at(18, 0), priceAt, ref);
  t.report('battery_discharge', 1, at(18, 15), priceAt, ref);
  const s = t.summary('2027-01-14', '2027-01-14', ref);
  // dyn: 40 (avoided) - 10 (grid charge) = 30 ; ref: 30 - 30 = 0 -> benefit 30
  assert.equal(s.batteryBenefit, 30);
});

test('Fixkosten-Differenz läuft pro Kalendertag seit Beginn und senkt die Ersparnis', () => {
  const t = new CostTracker({ tz: TZ });
  const refs = [{ from: '', price: 30, fixedDiff: 3.65 }]; // 3.65 CHF/month = 0.12 CHF/day
  t.report('import', 0, at(10, 0), flat(20), refs);
  t.report('import', 1, at(10, 15), flat(20), refs);
  const s = t.summary('2027-01-14', '2027-01-14', refs);
  assert.equal(Math.round(s.fixedCostDiff * 100) / 100, 12); // Rp.
  assert.equal(Math.round(s.savings * 100) / 100, 10 - 12);
  assert.equal(t.summary('2027-01-14', '2027-01-14', [{ price: 30 }]).fixedCostDiff, 0);
});

test('negative Preise werden gezählt', () => {
  const t = new CostTracker({ tz: TZ });
  t.report('import', 0, at(10, 0), flat(-5), REF);
  t.report('import', 1, at(10, 15), flat(-5), REF);
  t.report('export', 0, at(10, 0), flat(10, -2), REF);
  t.report('export', 2, at(10, 15), flat(10, -2), REF);
  const s = t.summary('2027-01-14', '2027-01-14', REF);
  assert.equal(s.negativeImportKwh, 1);
  assert.equal(s.negativeExportKwh, 2);
  assert.equal(s.importCostDyn, -5);
  assert.equal(s.exportRevenueDyn, -4);
});

test('Verbraucher: Durchschnittspreis, Vorteil zum Tagesmittel und Ersparnis gegen Referenz', () => {
  const t = new CostTracker({ tz: TZ });
  const priceAt = () => ({ dyn: 10, feedIn: 0, dayAvg: 25 });
  assert.equal(t.reportConsumer('E-Auto', 100, at(3, 0), priceAt, REF).status, 'baseline');
  assert.equal(t.reportConsumer('E-Auto', 102, at(3, 15), priceAt, REF).status, 'ok');
  const [c] = t.consumerSummary('2027-01-14', '2027-01-14', REF);
  assert.equal(c.name, 'E-Auto');
  assert.equal(c.kwh, 2);
  assert.equal(c.avgPrice, 10);
  assert.equal(c.avgDayPrice, 25);
  assert.equal(c.advantage, 15);
  assert.equal(c.savingsVsRef, 40);
  assert.equal(t.reportConsumer('', 1, at(3, 30), priceAt, REF).status, 'invalid');
  for (let i = 0; i < 6; i += 1) t.reportConsumer(`V${i}`, 1, at(3, 30), priceAt, REF);
  assert.equal(t.reportConsumer('zu viel', 1, at(3, 30), priceAt, REF).status, 'limit');
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

const { normalizeRefs, refForDay, sanitizeRefPeriods } = require('../lib/CostTracker');

test('Referenzzeiträume: pro Tag gilt der zuletzt begonnene Eintrag', () => {
  const refs = normalizeRefs([
    { from: '2027-01-01', price: 28 },
    { from: '', price: 26 },
  ]);
  assert.equal(refForDay(refs, '2026-12-31').price, 26);
  assert.equal(refForDay(refs, '2027-01-01').price, 28);
  assert.equal(refForDay(refs, '2027-06-30').price, 28);
  assert.equal(refForDay([], '2027-01-01'), null);
});

test('Auswertung über einen Preiswechsel nutzt pro Tag den damaligen Referenzpreis', () => {
  const t = new CostTracker({ tz: TZ });
  const day = (d, h) => new Date(Date.UTC(2027, 0, d, h - 1));
  const refs = [{ from: '', price: 30 }, { from: '2027-01-15', price: 40 }];
  t.report('import', 0, day(14, 10), flat(20), refs);
  t.report('import', 1, new Date(day(14, 10).getTime() + 15 * 60000), flat(20), refs);
  t.report('import', 1, day(15, 10), flat(20), refs); // 23h later, > smear window: only 15:45-slot logic applies
  t.report('import', 2, new Date(day(15, 10).getTime() + 15 * 60000), flat(20), refs);
  const d14 = t.summary('2027-01-14', '2027-01-14', refs);
  const d15 = t.summary('2027-01-15', '2027-01-15', refs);
  assert.equal(d14.netCostRef, 30);
  assert.equal(d15.netCostRef, 40);
  const both = t.summary('2027-01-14', '2027-01-15', refs);
  assert.equal(both.netCostRef, 70);
  assert.equal(both.savings, 30);
});

test('Tage ohne gültigen Referenzzeitraum bleiben aus dem Vergleich', () => {
  const t = new CostTracker({ tz: TZ });
  const refs = [{ from: '2027-01-15', price: 40 }];
  t.report('import', 0, at(10, 0), flat(20), refs);
  t.report('import', 1, at(10, 15), flat(20), refs);
  const s = t.summary('2027-01-14', '2027-01-14', refs);
  assert.equal(s.configured, false);
  assert.equal(s.savings, null);
  assert.equal(s.importKwh, 1);
  assert.equal(s.netCostDyn, 20);
});

test('sanitizeRefPeriods: validiert, sortiert und behält die Rechnerzeilen', () => {
  const out = sanitizeRefPeriods([
    { from: '2027-01-01', price: '28.5', importLines: [{ name: 'Netz', value: 0.1 }] },
    {
      from: '', price: 26, feedIn: 10.2, ntFrom: '21:00', ntTo: '07:00',
    },
  ]);
  assert.equal(out[0].from, '');
  assert.equal(out[1].price, 28.5);
  assert.equal(out[1].importLines[0].name, 'Netz');
  assert.equal(out[1].linesExclVat, true);
  assert.throws(() => sanitizeRefPeriods([{ from: '01.01.2027', price: 1 }]));
  assert.throws(() => sanitizeRefPeriods([{ price: -1 }]));
  assert.throws(() => sanitizeRefPeriods([{ price: 1, ntFrom: '25:00' }]));
  assert.throws(() => sanitizeRefPeriods('x'));
});

test('Daten verwalten: Tage, Verbraucher und Zählerbasis löschen', () => {
  const t = new CostTracker({ tz: TZ });
  const day = (d, h) => new Date(Date.UTC(2027, 0, d, h - 1));
  const priceAt = () => ({ dyn: 20, feedIn: 5, dayAvg: 20 });
  for (const d of [14, 15, 16]) {
    t.report('import', d * 10, day(d, 10), priceAt, REF);
    t.report('import', d * 10 + 1, new Date(day(d, 10).getTime() + 15 * 60000), priceAt, REF);
    t.reportConsumer('WP', d * 10, day(d, 10), priceAt, REF);
    t.reportConsumer('WP', d * 10 + 1, new Date(day(d, 10).getTime() + 15 * 60000), priceAt, REF);
  }
  assert.equal(t.daily('2027-01-01', '2027-12-31', REF).length, 3);
  assert.equal(t.deleteDays('2027-01-15', '2027-01-15'), 1);
  assert.deepEqual(t.daily('2027-01-01', '2027-12-31', REF).map((d) => d.key), ['2027-01-14', '2027-01-16']);
  assert.equal(t.slotsOf('2027-01-15').length, 0);
  assert.equal(t.consumerSummary('2027-01-15', '2027-01-15', REF)[0].kwh, 0);
  t.resetBaselines();
  assert.equal(t.lastReports().import, null);
  assert.equal(t.daily('2027-01-01', '2027-12-31', REF).length, 2);
  assert.equal(t.report('import', 500, day(17, 10), priceAt, REF).status, 'baseline');
  assert.equal(t.deleteConsumer('WP'), true);
  assert.equal(t.deleteConsumer('WP'), false);
  assert.equal(t.consumerSummary('2027-01-01', '2027-12-31', REF).length, 0);
});

test('dayPriceRows: gespeicherte Tagespreise als Viertelstundenzeilen', () => {
  const t = new CostTracker();
  const start = new Date('2026-10-14T22:00:00Z'); // local midnight in Zurich
  t.ensureDayPrices('2026-10-15', start, (s) => ({ dyn: 20 + (s.getTime() - start.getTime()) / 900000 / 100, feedIn: 5 }));
  const rows = t.dayPriceRows('2026-10-15');
  assert.equal(rows.length, 96);
  assert.equal(rows[0].price, 20);
  assert.equal(rows[0].feedIn, 5);
  assert.equal(rows[1].start.getTime() - rows[0].start.getTime(), 900000);
  assert.deepEqual(t.dayPriceRows('2026-01-01'), []);
});
