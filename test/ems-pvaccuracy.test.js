'use strict';

// Prognose-Genauigkeit der Solaranlage: Tagesbilanz, Empfehlung für den Korrekturfaktor, Automatik.

const test = require('node:test');
const assert = require('node:assert/strict');
const { PvAccuracy, DAYS_KEPT } = require('../lib/ems/PvAccuracy');
const { fromLocal } = require('../lib/time');

const TZ = 'Europe/Zurich';
const at = (day, h, m = 0) => fromLocal(2026, 11, day, h, m, TZ).getTime();
const mem = () => {
  const m = new Map();
  return { get: (k) => m.get(k), set: (k, v) => m.set(k, JSON.parse(JSON.stringify(v))) };
};

/** Einen Tag simulieren: morgens 07:00 Prognose (ohne Faktor `rawKwh`, angewendeter Faktor f), dann alle 5 Minuten 07:00-17:00 mit konstanter Leistung `kw`. */
function day(acc, d, { rawKwh, f = 1, kw }) {
  acc.record({ nowMs: at(d, 7), pvW: 0, remainingKwh: rawKwh * f, factor: f });
  for (let t = 7 * 60 + 5; t <= 17 * 60; t += 5) {
    acc.record({ nowMs: at(d, Math.floor(t / 60), t % 60), pvW: kw * 1000, remainingKwh: 0, factor: f });
  }
}

test('Tagesbilanz: Prognose morgens festgehalten, Produktion aus den Leistungswerten aufsummiert', () => {
  const acc = new PvAccuracy(null, TZ);
  day(acc, 1, { rawKwh: 20, kw: 2 }); // 10 h x 2 kW = 20 kWh
  const v = acc.view(at(2, 8));
  const row = v.rows.find((r) => r.day === '2026-11-01');
  assert.equal(row.forecastKwh, 20);
  assert.equal(row.actualKwh, 20);
  assert.equal(row.ratio, 1);
  assert.equal(row.counted, true);
});

test('Empfehlung: erst ab 7 vollständigen Tagen, Median von gemessen / roher Prognose, unabhängig vom damals eingestellten Faktor', () => {
  const acc = new PvAccuracy(null, TZ);
  for (let d = 1; d <= 6; d++) day(acc, d, { rawKwh: 20, kw: 1.6 }); // Verhältnis 0.8
  let v = acc.view(at(8, 8));
  assert.equal(v.recommend.factor, null, 'erst 6 Tage');
  assert.equal(v.recommend.days, 6);
  day(acc, 7, { rawKwh: 20, kw: 1.6 });
  v = acc.view(at(8, 8));
  assert.equal(v.recommend.factor, 0.8);
  assert.equal(v.recommend.days, 7);
  // ein Tag mit Faktor 0.5 festgehalten: Prognose 10 = roh 20, gemessen 16 -> trotzdem Verhältnis 0.8 zur rohen Prognose
  const acc2 = new PvAccuracy(null, TZ);
  for (let d = 1; d <= 7; d++) day(acc2, d, { rawKwh: 20, f: 0.5, kw: 1.6 });
  assert.equal(acc2.view(at(8, 8)).recommend.factor, 0.8, 'Faktor der Prognose wird herausgerechnet');
});

test('Empfehlung: Ausreisser beeinflussen den Median kaum, kleine Tage und Tage mit Messlücken zählen nicht', () => {
  const acc = new PvAccuracy(null, TZ);
  for (let d = 1; d <= 6; d++) day(acc, d, { rawKwh: 20, kw: 1.6 });
  day(acc, 7, { rawKwh: 20, kw: 0.2 }); // Nebeltag, Verhältnis 0.1
  day(acc, 8, { rawKwh: 1, kw: 0.1 }); // Prognose unter 2 kWh: zählt nicht
  // Tag 9: Messlücke von 3 Stunden
  acc.record({ nowMs: at(9, 7), pvW: 0, remainingKwh: 20, factor: 1 });
  acc.record({ nowMs: at(9, 8), pvW: 1000, remainingKwh: 0, factor: 1 });
  acc.record({ nowMs: at(9, 11), pvW: 1000, remainingKwh: 0, factor: 1 });
  const v = acc.view(at(10, 8));
  assert.equal(v.recommend.days, 7, 'Tage 1-7 (Nebeltag zählt), nicht der kleine und nicht der mit Lücke');
  assert.equal(v.recommend.factor, 0.8, 'Median bleibt beim Normalwert');
  assert.ok(v.recommend.p25 !== null && v.recommend.p75 !== null);
});

test('Tage ohne Beobachtung am Morgen zählen nicht (die Produktion davor fehlt), der heutige Tag auch nicht', () => {
  const acc = new PvAccuracy(null, TZ);
  // App startet erst um 10 Uhr: keine Prognose-Festhaltung
  acc.record({ nowMs: at(3, 10), pvW: 1000, remainingKwh: 15, factor: 1 });
  acc.record({ nowMs: at(3, 10, 5), pvW: 1000, remainingKwh: 15, factor: 1 });
  const v = acc.view(at(4, 8));
  assert.equal(v.rows.find((r) => r.day === '2026-11-03').forecastKwh, null);
  assert.equal(v.recommend.days, 0);
  const t = acc.view(at(3, 11)).rows.find((r) => r.today);
  assert.equal(t.counted, false, 'heute zählt nie');
});

test('Speichern und Aufräumen: übersteht Neustart, höchstens 100 Tage', () => {
  const store = mem();
  const acc = new PvAccuracy(store, TZ);
  day(acc, 1, { rawKwh: 20, kw: 2 });
  acc.record({ nowMs: at(2, 8), pvW: 0, remainingKwh: 0, factor: 1 }); // Speichern wird mindestens einmal ausgelöst (Prognose-Festhaltung speichert sofort)
  const again = new PvAccuracy(store, TZ);
  assert.equal(again.days['2026-11-01'].fc, 20);
  const big = new PvAccuracy(null, TZ);
  for (let k = 0; k < DAYS_KEPT + 20; k++) {
    big.days[`2026-${String(1 + Math.floor(k / 28)).padStart(2, '0')}-${String(1 + (k % 28)).padStart(2, '0')}`] = {
      act: 1, gap: 0, last: 1, first: 1, firstH: 6, fc: 5, f: 1, fcAt: 1,
    };
  }
  big.record({ nowMs: at(20, 8), pvW: 0, remainingKwh: 0, factor: 1 });
  assert.ok(Object.keys(big.days).length <= DAYS_KEPT, 'älteste Tage fallen weg');
});

test('Import früherer Tagesbilanzen: übernimmt gültige Tage, lässt vorhandene und ungültige aus, zählt für die Empfehlung, «letzte 14 Tage» als Vergleich', () => {
  const store = mem();
  const acc = new PvAccuracy(store, TZ);
  day(acc, 9, { rawKwh: 20, kw: 1.6 }); // eigener Tag, Verhältnis 0.8
  const list = [];
  for (let d = 1; d <= 8; d++) list.push({ day: `2026-10-${String(d).padStart(2, '0')}`, forecastKwh: 10, actualKwh: 5 }); // Verhältnis 0.5
  list.push({ day: '2026-11-09', forecastKwh: 99, actualKwh: 1 }); // gibt es schon: bleibt
  list.push({ day: 'kaputt', forecastKwh: 5, actualKwh: 5 });
  list.push({ day: '2026-10-20', forecastKwh: 0, actualKwh: 5 });
  list.push({ day: '2026-10-21', forecastKwh: 5, actualKwh: -1 });
  const r = acc.importDays(list);
  assert.deepEqual(r, { added: 8, skipped: 4 });
  assert.equal(acc.days['2026-11-09'].fc, 20, 'vorhandener Tag unverändert');
  const v = acc.view(at(11, 8));
  assert.equal(v.recommend.days, 9, '8 importierte + 1 eigener Tag');
  assert.equal(v.recommend.factor, 0.5, 'Median der 9 Tage');
  assert.equal(v.recommend.recent.days, 9);
  assert.equal(new PvAccuracy(store, TZ).days['2026-10-03'].imported, true, 'bleibt nach einem Neustart');
  assert.deepEqual(acc.importDays(list), { added: 0, skipped: 12 }, 'zweiter Import ändert nichts');
  assert.deepEqual(acc.importDays(null), { added: 0, skipped: 0 });
});
