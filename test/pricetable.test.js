'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { buildDayTable, levelOf } = require('../lib/PriceTable');
const { normalizeSlot } = require('../lib/InnostromClient');
const { startOfLocalDay, addLocalDays } = require('../lib/time');

const TZ = 'Europe/Zurich';
const TH = {
  veryCheap: 0.75, cheap: 0.9, expensive: 1.1, veryExpensive: 1.25,
};
const toDisplay = (raw) => Math.round(raw * 100 * 1.081 * 100) / 100;
const fx = (name) => require(path.join(__dirname, 'fixtures', name));

test('levelOf nutzt Verhältnis zum Tagesmittel', () => {
  assert.equal(levelOf(0.5, 1, TH), 'very_cheap');
  assert.equal(levelOf(0.85, 1, TH), 'cheap');
  assert.equal(levelOf(1, 1, TH), 'normal');
  assert.equal(levelOf(1.15, 1, TH), 'expensive');
  assert.equal(levelOf(1.3, 1, TH), 'very_expensive');
  assert.equal(levelOf(1, 0, TH), null);
});

test('Tabelle eines normalen Tages: 24 Stunden mit je 4 Viertelstunden', () => {
  const slots = fx('synthetic-aew-day.json').prices.map(normalizeSlot);
  const dayStart = startOfLocalDay(slots[0].start, TZ);
  const nowMs = dayStart.getTime() + 10 * 3600 * 1000 + 7 * 60 * 1000; // 10:07 local-ish
  const t = buildDayTable({
    slots, nowMs, tz: TZ, thresholds: TH, toDisplay, futureOnlyCheapest: true,
  });
  assert.equal(t.available, true);
  assert.equal(t.hours.length, 24);
  assert.ok(t.hours.every((h) => h.quarters.length === 4));
  assert.equal(t.hours.filter((h) => h.isNow).length, 1);
  assert.ok(t.cheapBlock && t.priciestBlock);
  assert.ok(t.cheapBlock.avg <= t.avg && t.priciestBlock.avg >= t.avg);
  assert.ok(t.hours.some((h) => h.cheap));
  assert.ok(t.hours.some((h) => h.pricey));
  assert.ok(t.hours.every((h) => !(h.cheap && h.pricey)));
});

test('günstigster Block nur ab jetzt, teuerster über den ganzen Tag', () => {
  const slots = fx('synthetic-aew-day.json').prices.map(normalizeSlot);
  const dayStart = startOfLocalDay(slots[0].start, TZ);
  const lateMs = dayStart.getTime() + 20 * 3600 * 1000;
  const t = buildDayTable({
    slots, nowMs: lateMs, tz: TZ, thresholds: TH, toDisplay, futureOnlyCheapest: true,
  });
  const cheapHour = t.hours.find((h) => h.cheap);
  assert.ok(!cheapHour || !cheapHour.isPast, 'cheapest block must not lie in the past');
  const all = buildDayTable({
    slots, nowMs: lateMs, tz: TZ, thresholds: TH, toDisplay, futureOnlyCheapest: false,
  });
  assert.ok(all.cheapBlock.avg <= t.cheapBlock.avg + 1e-9);
});

test('Zeitumstellung im Frühjahr: 23 Stunden, die übersprungene 02:00 fehlt', () => {
  const spring = fx('synthetic-dst-spring.json').prices.map(normalizeSlot);
  const t = buildDayTable({
    slots: spring, nowMs: 0, tz: TZ, thresholds: TH, toDisplay,
  });
  assert.equal(t.hours.length, 23);
  assert.ok(!t.hours.some((h) => h.hour === '02:00'));
});

test('zu wenige Daten: nicht verfügbar', () => {
  const slots = fx('synthetic-aew-day.json').prices.map(normalizeSlot).slice(0, 2);
  assert.equal(buildDayTable({
    slots, nowMs: 0, tz: TZ, thresholds: TH, toDisplay,
  }).available, false);
  assert.equal(addLocalDays(new Date(), 0, TZ) instanceof Date, true);
});
