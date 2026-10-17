'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeHourlyOutput, parseHourlyOutput, formatHourlyPrice } = require('../lib/HourlyOutput');

test('Standard: Rp./kWh inkl. MWST mit 2 Nachkommastellen wie measure_price_total', () => {
  assert.deepEqual(normalizeHourlyOutput(undefined), { unit: 'rp', vat: 'incl', decimals: null });
  assert.equal(formatHourlyPrice(0.18325, 8.1, normalizeHourlyOutput(null)), 19.81);
});

test('CHF/kWh inkl. MWST: ersetzt das Umrechnungs-Script (4 Stellen automatisch)', () => {
  const out = { unit: 'chf', vat: 'incl', decimals: null };
  assert.equal(formatHourlyPrice(0.18325, 8.1, out), 0.1981);
  assert.equal(formatHourlyPrice(0.18325, 8.1, { ...out, decimals: 3 }), 0.198);
});

test('ohne MWST und eigene Stellen', () => {
  assert.equal(formatHourlyPrice(0.1832, 8.1, { unit: 'rp', vat: 'excl', decimals: 1 }), 18.3);
  assert.equal(formatHourlyPrice(0.1832, 8.1, { unit: 'chf', vat: 'excl', decimals: 0 }), 0);
});

test('fehlender Preis bleibt null, ungültige Werte fallen auf Standard', () => {
  assert.equal(formatHourlyPrice(null, 8.1, {}), null);
  assert.equal(formatHourlyPrice(NaN, 8.1, {}), null);
  assert.deepEqual(normalizeHourlyOutput({ unit: 'x', vat: 'y', decimals: 99 }), { unit: 'rp', vat: 'incl', decimals: null });
});

test('parseHourlyOutput lehnt falsche Eingaben ab', () => {
  assert.deepEqual(parseHourlyOutput({ unit: 'chf', vat: 'excl', decimals: '' }), { unit: 'chf', vat: 'excl', decimals: null });
  assert.throws(() => parseHourlyOutput({ unit: 'eur', vat: 'incl' }), /unit/);
  assert.throws(() => parseHourlyOutput({ unit: 'rp', vat: 'maybe' }), /VAT/);
  assert.throws(() => parseHourlyOutput({ unit: 'rp', vat: 'incl', decimals: 7 }), /decimals/);
  assert.throws(() => parseHourlyOutput({ unit: 'rp', vat: 'incl', decimals: 1.5 }), /decimals/);
});
