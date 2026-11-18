'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LoadProfile } = require('../lib/ems/LoadProfile');
const { PlanAccuracy } = require('../lib/ems/PlanAccuracy');
const { fromLocal } = require('../lib/time');

const TZ = 'Europe/Zurich';
const mem = () => {
  const m = new Map();
  return { get: (k) => m.get(k), set: (k, v) => m.set(k, JSON.parse(JSON.stringify(v))) };
};
const at = (day, h, m = 0) => fromLocal(2026, 11, day, h, m, TZ).getTime();

/** Profil mit festen Werten je Tag und Viertelstunde (W), ohne einzelne Messungen zu simulieren. */
function profile(days) {
  const lp = new LoadProfile(mem(), TZ);
  for (const [key, fn] of Object.entries(days)) {
    const s = new Array(96).fill(0);
    const n = new Array(96).fill(0);
    for (let q = 0; q < 96; q += 1) {
      s[q] = fn(q) * 10;
      n[q] = 10;
    }
    lp.days[key] = { s, n };
  }
  return lp;
}

test('LoadProfile robust: Median statt Durchschnitt, ein einzelner Grossverbraucher verfälscht ihn nicht', () => {
  const days = {};
  for (let d = 4; d <= 10; d += 1) days[`2026-11-${String(d).padStart(2, '0')}`] = () => (d === 5 || d === 6 ? 3000 : 800);
  const lp = profile(days);
  const t = at(11, 19);
  assert.ok(lp.kwAt(t) > 1.3, 'der Durchschnitt wird hochgezogen');
  assert.equal(lp.kwAtRobust(t), 0.8, 'der Median nicht');
});

test('LoadProfile robust: Wochenende und Werktag getrennt, sobald genug Tage der gleichen Art da sind; sonst alle Tage', () => {
  const days = {};
  for (const k of ['2026-10-31', '2026-11-01', '2026-11-07', '2026-11-08']) days[k] = () => 2000; // Sa, So, Sa, So
  for (const k of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09']) days[k] = () => 500;
  const lp = profile(days);
  assert.equal(lp.kwAtRobust(at(14, 12)), 2, 'Samstag: nur Wochenendtage');
  assert.equal(lp.kwAtRobust(at(11, 12)), 0.5, 'Mittwoch: nur Werktage');
  const few = profile({ '2026-11-07': () => 2000, '2026-11-09': () => 500, '2026-11-10': () => 500, '2026-11-11': () => 500 });
  assert.equal(few.kwAtRobust(at(14, 12)), 0.5, 'nur ein Wochenendtag: alle Tage');
});

test('LoadProfile: der Durchschnitt `kwAt` nutzt weiter nur die letzten Tage (7 plus heute), obwohl 14 gespeichert werden', () => {
  const days = {};
  for (let d = 1; d <= 14; d += 1) days[`2026-11-${String(d).padStart(2, '0')}`] = () => (d <= 5 ? 5000 : 1000);
  const lp = profile(days);
  assert.equal(lp.kwAt(at(15, 12)), 1, 'die ältesten Tage zählen nicht mit');
});

/** Einen Tag mit Messwerten alle 5 Minuten durchspielen. */
function playDay(pa, lp, day, { house = () => 800, pv = () => 0, remaining = () => null, from = 4, to = 23 } = {}) {
  for (let min = from * 60; min <= to * 60; min += 5) {
    const t = at(day, Math.floor(min / 60), min % 60);
    pa.record({
      nowMs: t, houseW: house(min / 60), pvW: pv(min / 60), remainingKwh: remaining(min / 60), loadProfile: lp,
    });
  }
}

test('Plan-Genauigkeit Verbrauch: beide Methoden werden am echten Verbrauch gemessen, die bessere erkannt', () => {
  const days = {};
  for (let d = 4; d <= 10; d += 1) days[`2026-11-${String(d).padStart(2, '0')}`] = () => (d === 5 || d === 6 ? 3000 : 800);
  const lp = profile(days);
  const pa = new PlanAccuracy(mem(), TZ);
  for (let d = 11; d <= 16; d += 1) playDay(pa, lp, d, { house: () => 800 });
  const v = pa.view(at(17, 8));
  const evening = v.load.windows.find((w) => w.key === 'e');
  assert.equal(evening.days, 6);
  assert.ok(Math.abs(evening.actualKwh - 4) < 0.3, `Abendverbrauch ca. 4 kWh (800 W x 5 h), war ${evening.actualKwh}`);
  assert.ok(evening.mean.errPct > 40, 'Durchschnitt liegt wegen der Ausreisser daneben');
  assert.ok(evening.robust.errPct < 5, 'der Median trifft');
  assert.equal(evening.better, 'robust');
  assert.ok(evening.mean.biasPct > 0, 'der Durchschnitt prognostiziert zu viel');
});

test('Plan-Genauigkeit Verbrauch: zu wenig Tage = kein Urteil; ein Tag mit Messlücke zählt nicht', () => {
  const lp = profile({ '2026-11-10': () => 800 });
  const pa = new PlanAccuracy(mem(), TZ);
  playDay(pa, lp, 11);
  const early = pa.view(at(12, 8)).load.windows.find((w) => w.key === 'e');
  assert.equal(early.days, 1);
  assert.equal(early.better, null);
  assert.equal(early.mean, null, 'unter 5 Tagen keine Zahlen');
  const gap = new PlanAccuracy(mem(), TZ);
  for (let d = 11; d <= 16; d += 1) {
    for (let min = 4 * 60; min <= 23 * 60; min += 5) {
      if (d === 12 && min >= 18 * 60 && min < 20 * 60) continue; // 2 Stunden ohne Messwerte am Abend
      gap.record({
        nowMs: at(d, Math.floor(min / 60), min % 60), houseW: 800, pvW: 0, remainingKwh: null, loadProfile: lp,
      });
    }
  }
  assert.equal(gap.view(at(17, 8)).load.windows.find((w) => w.key === 'e').days, 5, 'der Tag mit Lücke fällt heraus');
});

test('Plan-Genauigkeit Solar: das Verhältnis am Morgen korrigiert die Rest-Prognose, der Vergleich zeigt den kleineren Fehler', () => {
  const lp = profile({ '2026-11-10': () => 800 });
  const pa = new PlanAccuracy(mem(), TZ);
  // Prognose 2 kW von 06:00 bis 18:00, gemessen die Hälfte (1 kW): das Verhältnis 0.5 gilt den ganzen Tag
  const remaining = (h) => (h < 6 ? 24 : (h > 18 ? 0 : 2 * (18 - h)));
  const pv = (h) => (h >= 5 && h < 18 ? 1000 : 0);
  for (let d = 11; d <= 16; d += 1) playDay(pa, lp, d, { pv, remaining, from: 5 });
  const v = pa.view(at(17, 8));
  assert.equal(v.pv.days, 6);
  assert.ok(v.pv.plain.errPct > 80, `ohne Korrektur doppelt zu viel, war ${v.pv.plain.errPct}`);
  assert.ok(v.pv.nowcast.errPct < 10, `mit Korrektur nahe dran, war ${v.pv.nowcast.errPct}`);
  assert.equal(v.pv.better, 'nowcast');
  assert.ok(v.pv.plain.biasPct > 80, 'unkorrigiert zu hoch');
});

test('Plan-Genauigkeit: übersteht einen Neustart (gespeichert) und kann gelöscht werden', () => {
  const store = mem();
  const lp = profile({ '2026-11-10': () => 800 });
  const pa = new PlanAccuracy(store, TZ);
  for (let d = 11; d <= 15; d += 1) playDay(pa, lp, d);
  pa._save(Date.now(), true);
  const again = new PlanAccuracy(store, TZ);
  assert.equal(again.view(at(16, 8)).load.windows.find((w) => w.key === 'm').days, 5);
  again.reset();
  assert.equal(again.view(at(16, 8)).load.windows.find((w) => w.key === 'm').days, 0);
});

test('Puffer-Schätzung: 75. Perzentil der Unterschätzung des Verbrauchs (grösseres von Morgen/Abend), in % der Kapazität aufgerundet', () => {
  const lp = profile({ '2026-11-10': () => 800 });
  const pa = new PlanAccuracy(mem(), TZ);
  // Prognose 800 W, gemessen an den Abenden 800 W + 0 / 200 / 400 / 600 / 800 W: Unterschätzung 0, 1, 2, 3, 4 kWh... je 5 h
  const extra = { 11: 0, 12: 200, 13: 400, 14: 600, 15: 800, 16: 1000 };
  for (const d of [11, 12, 13, 14, 15, 16]) playDay(pa, lp, d, { house: (h) => (h >= 17 && h < 22 ? 800 + extra[d] : 800) });
  const e = pa.bufferEstimate(at(17, 8), 13.8);
  assert.equal(e.basis, 'e');
  assert.equal(e.days, 6);
  assert.ok(e.kwh > 2.5 && e.kwh < 4.3, `75. Perzentil: 4. von 6 Tagen = ca. 3 kWh, war ${e.kwh}`);
  assert.equal(e.pct, Math.min(15, Math.ceil((e.kwh / 13.8) * 100 - 1e-9)), "Standard-Obergrenze 15 %");
  assert.equal(pa.bufferEstimate(at(17, 8), 40).pct, Math.ceil((e.kwh / 40) * 100 - 1e-9), "grosse Batterie: Prozent kleiner, nicht gedeckelt");
  assert.equal(pa.bufferEstimate(at(17, 8), 13.8, 10).pct, 10, 'Obergrenze');
  assert.equal(pa.bufferEstimate(at(17, 8), 0), null, 'ohne Kapazität nichts');
});

test('Puffer-Schätzung: zu wenig Tage = keine Schätzung; Überschätzung zählt als Puffer 0', () => {
  const lp = profile({ '2026-11-10': () => 800 });
  const few = new PlanAccuracy(mem(), TZ);
  for (const d of [11, 12, 13]) playDay(few, lp, d);
  assert.equal(few.bufferEstimate(at(17, 8), 13.8), null);
  const low = new PlanAccuracy(mem(), TZ);
  for (const d of [11, 12, 13, 14, 15, 16]) playDay(low, lp, d, { house: () => 300 }); // Haus braucht weniger als erwartet
  assert.equal(low.bufferEstimate(at(17, 8), 13.8).pct, 0);
});
