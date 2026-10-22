'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeHours, assessReports, assessPrices, overallLevel,
} = require('../lib/StatusRules');

const NOW = Date.UTC(2026, 9, 22, 12, 0);
const ago = (min) => NOW - min * 60000;

test('normalizeHours: Standard 1 h, 0 = aus, ungültig fällt auf den Standard', () => {
  assert.equal(normalizeHours(undefined), 1);
  assert.equal(normalizeHours(''), 1);
  assert.equal(normalizeHours('abc'), 1);
  assert.equal(normalizeHours(-2), 1);
  assert.equal(normalizeHours(500), 1);
  assert.equal(normalizeHours(0), 0);
  assert.equal(normalizeHours(2), 2);
  assert.equal(normalizeHours(1.3), 1.25);
});

test('wer nie gemeldet hat, wird nie gewarnt', () => {
  const r = assessReports({ now: NOW, last: { import: null, export: null }, thresholdHours: 1 });
  assert.equal(r.monitored, false);
  assert.equal(r.level, 'none');
  assert.deepEqual(r.stale, []);
});

test('Schwelle 1 h: 59 min ok, 61 min gelb, nach 6 h rot', () => {
  const lvl = (min) => assessReports({ now: NOW, last: { import: ago(min) }, thresholdHours: 1 }).level;
  assert.equal(lvl(5), 'ok');
  assert.equal(lvl(59), 'ok');
  assert.equal(lvl(61), 'warn');
  assert.equal(lvl(359), 'warn');
  assert.equal(lvl(361), 'alarm');
});

test('nur gemeldete Arten werden überwacht, der älteste Wert entscheidet', () => {
  const r = assessReports({
    now: NOW, last: { import: ago(5), export: ago(90), battery_charge: null }, thresholdHours: 1,
  });
  assert.equal(r.monitored, true);
  assert.equal(r.level, 'warn');
  assert.deepEqual(r.stale, ['export']);
  assert.equal(r.kinds.find((k) => k.kind === 'battery_charge').level, 'none');
});

test('Schwelle aus: kein Alarm, aber die Zeiten bleiben sichtbar', () => {
  const r = assessReports({ now: NOW, last: { import: ago(9999) }, thresholdHours: 0 });
  assert.equal(r.level, 'off');
  assert.equal(r.monitored, true);
  assert.equal(r.kinds[0].ageMin, 9999);
});

test('grössere Schwelle verschiebt Gelb und Rot (2 h: gelb ab 121 min, rot ab 12 h)', () => {
  const lvl = (min) => assessReports({ now: NOW, last: { import: ago(min) }, thresholdHours: 2 }).level;
  assert.equal(lvl(119), 'ok');
  assert.equal(lvl(121), 'warn');
  assert.equal(lvl(721), 'alarm');
});

test('Verbraucher werden nur aufgelistet, nie gewarnt', () => {
  const r = assessReports({
    now: NOW, last: { import: ago(5) }, consumers: { WP: ago(500), EV: null }, thresholdHours: 1,
  });
  assert.equal(r.level, 'ok');
  assert.equal(r.consumers.length, 2);
  assert.equal(r.consumers[0].ageMin, 500);
  assert.equal(r.consumers[1].ageMin, null);
});

test('Preis-Status: Auth-Fehler und fehlender aktueller Preis sind rot', () => {
  assert.equal(assessPrices({
    unavailable: true, haveCurrentPrice: true, failures: 0, lastOkAgeMin: 5, tomorrowMissingAfterCutoff: false,
  }).level, 'alarm');
  assert.deepEqual(assessPrices({
    unavailable: false, haveCurrentPrice: false, failures: 0, lastOkAgeMin: null, tomorrowMissingAfterCutoff: false,
  }).issues, ['no_current_price']);
});

test('Preis-Status: wiederholte Fehler, alte Daten und fehlende Preise für morgen sind gelb', () => {
  const base = {
    unavailable: false, haveCurrentPrice: true, failures: 0, lastOkAgeMin: 30, tomorrowMissingAfterCutoff: false,
  };
  assert.equal(assessPrices(base).level, 'ok');
  assert.equal(assessPrices({ ...base, failures: 3 }).level, 'warn');
  assert.equal(assessPrices({ ...base, lastOkAgeMin: 27 * 60 }).level, 'warn');
  assert.deepEqual(assessPrices({ ...base, tomorrowMissingAfterCutoff: true }).issues, ['no_tomorrow']);
});

test('overallLevel: schlechtester Wert, none/off zählen als ok', () => {
  assert.equal(overallLevel(['ok', 'warn', 'none']), 'warn');
  assert.equal(overallLevel(['none', 'off']), 'ok');
  assert.equal(overallLevel(['alarm', 'warn']), 'alarm');
});
