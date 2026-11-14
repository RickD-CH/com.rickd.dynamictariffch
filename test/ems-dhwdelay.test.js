'use strict';

// Warmwasser verzögern: Entscheidung (rein), Konfiguration.

const test = require('node:test');
const assert = require('node:assert/strict');
const { decideDelay, normalizeDelay, makeDelayState } = require('../lib/ems/planner/dhwDelay');
const { fromLocal } = require('../lib/time');

const TZ = 'Europe/Zurich';
// 2026-11-13 ist ein Freitag, 2026-11-14 ein Samstag
const at = (d, h, m = 0) => fromLocal(2026, 11, d, h, m, TZ).getTime();
const cfg = normalizeDelay({ enabled: true });
const base = (o = {}) => ({
  cfg, st: makeDelayState(), nowMs: at(13, 7), tz: TZ, tempWW: 43, sollBase: 48, hyst: 4, forecastKwh: 20, priceOn: false, ...o,
});

test('Konfiguration: Standardwerte, Grenzen, ungültige Uhrzeit fällt zurück, standardmässig aus', () => {
  const d = normalizeDelay({});
  assert.equal(d.enabled, false);
  assert.deepEqual([d.windowFrom, d.windowTo, d.releaseWeekday, d.releaseWeekend, d.releaseLow], ['05:00', '14:00', '16:00', '15:00', '10:00']);
  assert.deepEqual([d.minForecastKwh, d.comfortTemp, d.startMargin], [15, 32, 3]);
  const x = normalizeDelay({ windowFrom: 'kaputt', minForecastKwh: 999, comfortTemp: 1, startMargin: 50, releaseWeekday: '7:05' });
  assert.equal(x.windowFrom, '05:00');
  assert.equal(x.minForecastKwh, 200);
  assert.equal(x.comfortTemp, 10);
  assert.equal(x.startMargin, 10);
  assert.equal(x.releaseWeekday, '07:05');
});

test('Verzögern mit genug PV-Prognose: Freigabe Mo-Fr 16:00, am Wochenende 15:00', () => {
  const r = decideDelay(base());
  assert.equal(r.action, 'start');
  assert.equal(r.releaseAt, at(13, 16));
  assert.match(r.reason, /PV-Prognose 20\.0 kWh/);
  const we = decideDelay(base({ nowMs: at(14, 7) }));
  assert.equal(we.releaseAt, at(14, 15), 'Samstag');
});

test('Startschwelle = Soll - Hysterese + Marge: darüber wird nicht verzögert (die Wärmepumpe startet noch nicht)', () => {
  assert.equal(decideDelay(base({ tempWW: 47 })).action, 'none', '48 - 4 + 3 = 47: nicht darunter');
  assert.equal(decideDelay(base({ tempWW: 46.9 })).action, 'start');
});

test('Keine Verzögerung: aus, ausserhalb des Fensters, Freigabezeit vorbei, Komfortgrenze, unbekannt, schon verzögert, Pause, SG-Ready, Programm', () => {
  assert.equal(decideDelay(base({ cfg: normalizeDelay({}) })).action, 'none');
  assert.match(decideDelay(base({ nowMs: at(13, 4) })).reason, /Zeitfenster/);
  assert.match(decideDelay(base({ nowMs: at(13, 14, 30) })).reason, /Zeitfenster/);
  assert.match(decideDelay(base({ tempWW: 31 })).reason, /Komfort/);
  assert.match(decideDelay(base({ tempWW: null })).reason, /unbekannt/);
  assert.match(decideDelay(base({ sollBase: null })).reason, /unbekannt/);
  assert.match(decideDelay(base({ st: { ...makeDelayState(), lastDay: '2026-11-13' } })).reason, /schon verzögert/);
  assert.equal(decideDelay(base({ paused: true })).action, 'none');
  assert.equal(decideDelay(base({ sgActive: true })).action, 'none');
  assert.equal(decideDelay(base({ dhwRunning: true })).action, 'none');
});

test('Wenig Sonne mit Preisoptimierung: bis zur Freigabezeit warten, in den günstigen Stunden startet das Programm selbst; nach der Freigabezeit nicht mehr verzögern', () => {
  const r = decideDelay(base({ forecastKwh: 5, priceOn: true }));
  assert.equal(r.action, 'start');
  assert.equal(r.releaseAt, at(13, 16), 'Mo-Fr 16:00');
  assert.match(r.reason, /Warmwasser-Programm heizt in den günstigen Stunden/);
  assert.match(decideDelay(base({ forecastKwh: 5, priceOn: true, nowMs: at(13, 16, 30), cfg: normalizeDelay({ enabled: true, windowTo: '18:00' }) })).reason, /Freigabezeit schon vorbei/);
});

test('Wenig Sonne ohne Preisoptimierung: feste Uhrzeit 10:00; danach nicht mehr verzögern', () => {
  const r = decideDelay(base({ forecastKwh: 5, priceOn: false }));
  assert.equal(r.releaseAt, at(13, 10));
  assert.match(decideDelay(base({ forecastKwh: 5, nowMs: at(13, 10, 30) })).reason, /Freigabezeit schon vorbei/);
  assert.equal(decideDelay(base({ forecastKwh: null })).releaseAt, at(13, 10), 'Prognose unbekannt = wenig Sonne');
});

test('Aktive Verzögerung: gibt frei bei Zeit, Komfortgrenze, SG-Ready, Pause, neuem Tag, nach 14 h; endet ohne Flow, wenn das Programm startet; sonst bleibt sie', () => {
  const st = { ...makeDelayState(), active: true, since: at(13, 7), releaseAt: at(13, 16), day: '2026-11-13' };
  const run = (o) => decideDelay(base({ st, nowMs: at(13, 9), tempWW: 40, ...o }));
  assert.equal(run({}).action, 'none');
  assert.match(run({}).reason, /Verzögert bis 16:00/);
  assert.equal(run({ nowMs: at(13, 16) }).action, 'release');
  assert.match(run({ tempWW: 31.5 }).reason, /Komfort/);
  assert.equal(run({ tempWW: 31.5 }).action, 'release');
  assert.equal(run({ sgActive: true }).action, 'release');
  assert.equal(run({ paused: true }).action, 'release');
  assert.equal(run({ nowMs: at(14, 6) }).action, 'release', 'neuer Tag');
  assert.equal(decideDelay(base({ st: { ...st, releaseAt: at(14, 23) }, nowMs: at(13, 22), tempWW: 40 })).action, 'release', '14 Stunden');
  const end = run({ dhwRunning: true });
  assert.equal(end.action, 'end', 'das Programm hebt den Soll an: kein Freigabe-Flow nötig');
});
