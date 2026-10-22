'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { CostTracker } = require('../lib/CostTracker');
const { buildDigest, costValues } = require('../lib/DailyDigest');

const TZ = 'Europe/Zurich';
const at = (h, m = 0) => new Date(Date.UTC(2027, 0, 14, h - 1, m));
const price = () => ({ dyn: 20, feedIn: 5, dayAvg: 22 });
const REF = { price: 30, feedIn: 5 };

function day(ref) {
  const t = new CostTracker({ tz: TZ });
  t.report('import', 100, at(10, 0), price, ref);
  t.report('import', 104, at(10, 15), price, ref);
  t.report('export', 50, at(10, 0), price, ref);
  t.report('export', 51, at(10, 15), price, ref);
  return t;
}

test('Tageszusammenfassung mit Referenztarif: Werte in CHF, Vergleich möglich', () => {
  const t = day(REF);
  const s = t.summary('2027-01-14', '2027-01-14', REF);
  const d = buildDigest(s, '2027-01-14');
  assert.equal(d.date, '14.01.');
  assert.equal(d.importKwh, 4);
  assert.equal(d.exportKwh, 1);
  assert.equal(d.compared, true);
  assert.equal(d.costDyn, 0.75); // 4 * 20 - 1 * 5 = 75 Rp.
  assert.equal(d.costRef, 1.15); // 4 * 30 - 1 * 5 = 115 Rp.
  assert.equal(d.savings, 0.4);
  assert.equal(d.avgImportPrice, 20);
});

test('ohne Referenztarif: Vergleich "nein" und Nullen statt leere Werte', () => {
  const t = day(undefined);
  const s = t.summary('2027-01-14', '2027-01-14', undefined);
  const d = buildDigest(s, '2027-01-14');
  assert.equal(d.compared, false);
  assert.equal(d.costRef, 0);
  assert.equal(d.savings, 0);
  assert.ok(d.costDyn > 0);
});

test('Tag ohne Daten: keine Zusammenfassung', () => {
  const t = new CostTracker({ tz: TZ });
  assert.equal(buildDigest(t.summary('2027-01-14', '2027-01-14', REF), '2027-01-14'), null);
  assert.equal(buildDigest(null, '2027-01-14'), null);
});

test('Capability-Werte: mit Referenz gefüllt, ohne Referenz leer (null)', () => {
  const t = day(REF);
  const today = t.summary('2027-01-14', '2027-01-14', REF);
  const month = t.summary('2027-01-01', '2027-01-14', REF);
  const v = costValues(today, month);
  assert.equal(v.cost_today, 0.75);
  assert.equal(v.cost_ref_today, 1.15);
  assert.equal(v.savings_today, 0.4);
  assert.equal(v.savings_month, 0.4);
  assert.equal(v.avg_import_price_today, 20);
  const none = costValues(day(undefined).summary('2027-01-14', '2027-01-14', undefined), null);
  assert.equal(none.cost_ref_today, null);
  assert.equal(none.savings_today, null);
  assert.equal(none.savings_month, null);
  assert.ok(none.cost_today > 0);
});

test('Tageszusammenfassung mit Batterie-Analyse: Effizienz und Wert der Netzladung', () => {
  const t = day(REF);
  const s = t.summary('2027-01-14', '2027-01-14', REF);
  const d = buildDigest(s, '2027-01-14', { efficiency: 69, gridChargeValue: 132 });
  assert.equal(d.batteryEfficiency, 69);
  assert.equal(d.gridChargeValue, 1.32);
  const none = buildDigest(s, '2027-01-14', { efficiency: null, gridChargeValue: 0 });
  assert.equal(none.batteryEfficiency, 0);
  assert.equal(buildDigest(s, '2027-01-14').batteryEfficiency, 0);
});
