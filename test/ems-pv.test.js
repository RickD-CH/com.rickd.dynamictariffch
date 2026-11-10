'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PvFeed, parseExternal, sumKwh } = require('../lib/ems/PvFeed');
const { normalizeConfig } = require('../lib/ems/Config');
const { fromLocal } = require('../lib/time');

const TZ = 'Europe/Zurich';
const H = 3600 * 1000;
const day0 = fromLocal(2026, 11, 10, 0, 0, TZ).getTime();
const at = (h, m = 0) => day0 + (h * 60 + m) * 60 * 1000;
const iso = (h) => new Date(at(h)).toISOString();

function memStore() {
  const m = new Map();
  return { get: (k) => m.get(k), set: (k, v) => m.set(k, JSON.parse(JSON.stringify(v))), raw: m };
}

/** Stündliche Prognose: 08-16 Uhr, glockenförmig, Summe 10 kWh heute, 6 kWh morgen. */
function hourly() {
  const values = [0.2, 0.8, 1.6, 2.2, 2.4, 1.8, 0.8, 0.2];
  const out = values.map((kwh, i) => ({ start: iso(8 + i), kwh }));
  const tomorrow = [0.1, 0.5, 1.2, 1.5, 1.4, 0.9, 0.3, 0.1].map((kwh, i) => ({ start: new Date(at(8 + i) + 24 * H).toISOString(), kwh }));
  return [...out, ...tomorrow];
}

test('parseExternal: kwh und kw, Slot-Länge aus end, hours oder Standard', () => {
  const a = parseExternal([{ start: iso(9), kwh: 1.5 }]);
  assert.equal(a.slots.length, 1);
  assert.equal(a.slots[0].h, 1);
  assert.equal(a.slots[0].kw, 1.5);
  assert.equal(a.slots[0].end, at(10));
  const b = parseExternal([{ start: iso(9), end: new Date(at(9, 30)).toISOString(), kwh: 0.5 }]);
  assert.equal(b.slots[0].h, 0.5);
  assert.equal(b.slots[0].kw, 1);
  const c = parseExternal([{ start: iso(9), hours: 2, kw: 3 }]);
  assert.equal(c.slots[0].kw, 3);
  assert.equal(c.slots[0].end, at(11));
  const d = parseExternal([{ end: at(12), hours: 0.25, kwh: 0.5 }]);
  assert.equal(d.slots[0].kw, 2);
  const e = parseExternal(JSON.stringify([{ start: at(9), kwh: 1 }]));
  assert.equal(e.slots.length, 1);
  // sortiert nach Ende
  const f = parseExternal([{ start: iso(11), kwh: 1 }, { start: iso(9), kwh: 1 }]);
  assert.deepEqual(f.slots.map((s) => s.end), [at(10), at(12)]);
});

test('parseExternal: unbrauchbare Eingaben werden mit klarer Meldung abgelehnt', () => {
  assert.throws(() => parseExternal('kein json'), /gültige JSON-Liste/);
  assert.throws(() => parseExternal('{"a":1}'), /nicht leere Liste/);
  assert.throws(() => parseExternal([]), /nicht leere Liste/);
  assert.throws(() => parseExternal([{ start: iso(9) }]), /Kein Eintrag brauchbar/);
  assert.throws(() => parseExternal([{ kwh: 1 }]), /Kein Eintrag brauchbar/);
  assert.throws(() => parseExternal(new Array(401).fill({ start: iso(9), kwh: 1 })), /Zu viele Einträge/);
  // einzelne schlechte Einträge werden übersprungen und gezählt
  const r = parseExternal([{ start: iso(9), kwh: 1 }, { start: 'quatsch', kwh: 1 }, null, { start: iso(10), kwh: -5 }]);
  assert.equal(r.slots.length, 1);
  assert.equal(r.skipped, 3);
});

test('PvFeed: Summen heute (Rest), morgen, jetzt, 24 h', () => {
  const feed = new PvFeed(null, () => {}, null, memStore());
  feed.setExternal(hourly(), at(7));
  const now = at(12, 30);
  const rest = feed.remainingTodayKwh(now, TZ);
  // ab 12:30: Slots mit Ende nach 12:30 -> 12-13 (Ende 13:00), 13-14, ... Summe = 2.4 + 1.8 + 0.8 + 0.2 + (Slot 11-12 endet 12:00, nicht mehr) = 5.2
  assert.ok(Math.abs(rest - 5.2) < 1e-9, 'Rest heute ' + rest);
  assert.ok(Math.abs(feed.tomorrowKwh(now, TZ) - 6) < 1e-9);
  assert.equal(feed.nowKw(now), 2.4, 'Slot 12-13 läuft');
  feed.setExternal(hourly(), at(20));
  assert.equal(feed.nowKw(at(22)), 0, 'zwischen den Slots: keine Erzeugung');
  assert.ok(feed.forecastKwh(now, 24) > 5);
  assert.equal(sumKwh([], 0, 10), 0);
});

test('PvFeed: Korrekturfaktor wird beim Lesen angewendet und wirkt sofort', async () => {
  const feed = new PvFeed(null, () => {}, null, memStore());
  feed.configure({ factor: 1 });
  feed.setExternal(hourly(), at(7));
  assert.ok(Math.abs(feed.remainingTodayKwh(at(8), TZ) - 10) < 1e-9);
  feed.configure({ factor: 0.75 });
  await feed.refresh(at(8));
  assert.ok(Math.abs(feed.remainingTodayKwh(at(8), TZ) - 7.5) < 1e-9);
  assert.equal(feed.info(at(8)).factor, 0.75);
  // Ungültige Faktoren fallen auf 1 zurück
  feed.configure({ factor: -2 });
  assert.equal(feed.userFactor, 1);
});

test('PvFeed: eingelieferte Prognose überlebt einen Neustart, wird nach 12 h veraltet', async () => {
  const store = memStore();
  const first = new PvFeed(null, () => {}, null, store);
  first.setExternal(hourly(), at(7));
  const second = new PvFeed(null, () => {}, null, store);
  await second.refresh(at(8));
  assert.equal(second.source, 'external');
  assert.equal(second.isStale(at(8)), false);
  assert.notEqual(second.remainingTodayKwh(at(8), TZ), null);
  await second.refresh(at(7) + 13 * H);
  assert.equal(second.source, null);
  assert.equal(second.isStale(at(7) + 13 * H), true);
  assert.equal(second.remainingTodayKwh(at(7) + 13 * H, TZ), null, 'veraltet = null, das Tor bleibt offen');
  assert.match(second.error, /veraltet/);
});

test('PvFeed: Übergangsquelle nur, wenn sie erlaubt ist; Eigenes hat Vorrang', async () => {
  const client = { get: async () => ({ slots: [{ end: at(13), kw: 2, h: 1 }], stale: false, factor: 0.75 }) };
  const off = new PvFeed(null, () => {}, client, memStore());
  off.configure({ useFallback: false });
  await off.refresh(at(12));
  assert.equal(off.source, null, 'ohne Vergleichsquelle wird die andere App nicht gefragt');
  assert.equal(off.remainingTodayKwh(at(12), TZ), null);

  const on = new PvFeed(null, () => {}, client, memStore());
  on.configure({ useFallback: true });
  await on.refresh(at(12));
  assert.equal(on.source, 'fallback');
  assert.equal(on.remainingTodayKwh(at(12), TZ), 2);

  // Jetzt eigene Prognose einliefern: sie gewinnt
  on.setExternal(hourly(), at(12));
  await on.refresh(at(12, 5));
  assert.equal(on.source, 'external');
});

test('Konfiguration: PV-Faktor mit Grenzen', () => {
  assert.equal(normalizeConfig(null).pv.factor, 1);
  assert.equal(normalizeConfig({ pv: { factor: 0.75 } }).pv.factor, 0.75);
  assert.equal(normalizeConfig({ pv: { factor: 50 } }).pv.factor, 3);
  assert.equal(normalizeConfig({ pv: { factor: 0 } }).pv.factor, 0.1);
  assert.equal(normalizeConfig({ pv: { factor: 'x' } }).pv.factor, 1);
});
