'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const time = require('../lib/time');
const { InnostromClient, InnostromError, TEST_CREDENTIALS, normalizeSlot, workPrice } = require('../lib/InnostromClient');
const { PriceStore } = require('../lib/PriceStore');

const fx = (name) => require(path.join(__dirname, 'fixtures', name));
const slotsOf = (name) => fx(name).prices.map(normalizeSlot);

/** Fake-fetch, der eine Fixture (oder Fehler) zurückgibt und die URL merkt. */
function fakeFetch(status, body) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
  };
  fn.calls = calls;
  return fn;
}

// ---------------------------------------------------------------- time

test('toLocalIso: Winter +01:00, Sommer +02:00', () => {
  assert.equal(time.toLocalIso(new Date('2027-01-14T23:00:00Z')), '2027-01-15T00:00:00+01:00');
  assert.equal(time.toLocalIso(new Date('2026-09-25T10:00:00Z')), '2026-09-25T12:00:00+02:00');
});

test('fromLocal / startOfLocalDay / addLocalDays über Zeitumstellung', () => {
  const d = time.startOfLocalDay(new Date('2026-03-29T12:00:00Z'));
  assert.equal(time.toLocalIso(d), '2026-03-29T00:00:00+01:00');
  const next = time.addLocalDays(d, 1);
  assert.equal(time.toLocalIso(next), '2026-03-30T00:00:00+02:00');
  assert.equal((next - d) / time.SLOT_MS, 92);
  const a = time.startOfLocalDay(new Date('2026-10-25T12:00:00Z'));
  assert.equal((time.addLocalDays(a, 1) - a) / time.SLOT_MS, 100);
});

test('windowAround: Fenster über Mitternacht', () => {
  const now = new Date('2027-01-14T02:00:00Z'); // 03:00 lokal
  const w = time.windowAround(now, '22:00', '06:00');
  assert.equal(time.toLocalIso(w.from), '2027-01-13T22:00:00+01:00');
  assert.equal(time.toLocalIso(w.to), '2027-01-14T06:00:00+01:00');
  const later = time.windowAround(new Date('2027-01-14T12:00:00Z'), '22:00', '06:00'); // 13:00 lokal
  assert.equal(time.toLocalIso(later.from), '2027-01-14T22:00:00+01:00');
});

test('windowAround: gleiche Zeiten = 24h', () => {
  const w = time.windowAround(new Date('2027-01-14T12:00:00Z'), '00:00', '00:00');
  assert.equal((w.to - w.from) / 3600e3, 24);
});

// ---------------------------------------------------------------- client

test('workPrice summiert nur work/CHF_kWh', () => {
  assert.equal(workPrice([{ value: 0.1, unit: 'CHF_kWh', component: 'work' }, { value: 5, unit: 'CHF_kW', component: 'power' }]), 0.1);
  assert.equal(workPrice(undefined), null);
});

test('getPrices: URL, Header, Ende inklusiv -1s, Filterung', async () => {
  const f = fakeFetch(200, fx('test-env-integrated-5slots.json'));
  const c = new InnostromClient({ ...TEST_CREDENTIALS, environment: 'test', fetch: f });
  const from = new Date('2026-09-25T10:00:00Z');
  const to = new Date('2026-09-25T11:00:00Z');
  const { slots, publishedAt } = await c.getPrices({ from, to, tariffType: 'integrated' });

  const url = new URL(f.calls[0].url);
  assert.equal(url.origin + url.pathname, 'https://portal-test.dynamische-stromtarife.ch/api/v2/metering_code');
  assert.equal(url.searchParams.get('start_timestamp'), '2026-09-25T12:00:00+02:00');
  assert.equal(url.searchParams.get('end_timestamp'), '2026-09-25T12:59:59+02:00');
  assert.equal(url.searchParams.get('tariff_type'), 'integrated');
  assert.equal(f.calls[0].init.headers.Authorization, `Bearer ${TEST_CREDENTIALS.token}`);
  // Fixture enthält 5 Slots (API liefert Ende inklusiv) → Client schneidet auf 4 zurück
  assert.equal(slots.length, 4);
  assert.equal(slots[0].integrated, 0.2);
  assert.equal(publishedAt.toISOString(), '2026-09-24T12:00:55.846Z');
});

test('getPrices: leerer Folgetag ist kein Fehler', async () => {
  const c = new InnostromClient({ ...TEST_CREDENTIALS, fetch: fakeFetch(200, fx('empty-tomorrow.json')) });
  const { slots } = await c.getPrices({ from: new Date('2026-09-25T22:00:00Z'), to: new Date('2026-09-26T22:00:00Z') });
  assert.deepEqual(slots, []);
});

for (const [status, file, code] of [
  [401, 'error-401-no-auth.json', 'AUTH'],
  [403, 'error-403-invalid-token.json', 'AUTH'],
  [400, 'error-400-missing-params.json', 'BAD_REQUEST'],
  [500, { status: 'error', message: 'boom' }, 'SERVER'],
]) {
  test(`getPrices: HTTP ${status} → ${code}`, async () => {
    const body = typeof file === 'string' ? fx(file) : file;
    const c = new InnostromClient({ ...TEST_CREDENTIALS, fetch: fakeFetch(status, body) });
    await assert.rejects(
      c.getPrices({ from: new Date('2026-09-25T10:00:00Z'), to: new Date('2026-09-25T11:00:00Z') }),
      (e) => e instanceof InnostromError && e.code === code && e.retryable === (code === 'SERVER'),
    );
  });
}

test('getPrices: Netzwerkfehler → NETWORK (retryable)', async () => {
  const c = new InnostromClient({ ...TEST_CREDENTIALS, fetch: async () => { throw new Error('ECONNRESET'); } });
  await assert.rejects(c.getPrices({ from: new Date(0), to: new Date(3600e3) }), (e) => e.code === 'NETWORK' && e.retryable);
});

test('Token mit "Bearer "-Präfix wird bereinigt', () => {
  const c = new InnostromClient({ meteringCode: 'CH1', token: 'Bearer abc ' });
  assert.equal(c.token, 'abc');
});

// ---------------------------------------------------------------- store

test('PriceStore: aktueller Slot, Tagesstatistik, volle Tage', () => {
  const st = new PriceStore();
  st.upsert(slotsOf('synthetic-aew-day.json'));
  const now = new Date('2027-01-14T17:40:00Z'); // 18:40 lokal
  assert.equal(st.at(now).start.toISOString(), '2027-01-14T17:30:00.000Z');
  assert.ok(st.hasFullDay(now));
  const s = st.dayStats(now);
  assert.equal(s.count, 96);
  assert.ok(s.min < s.avg && s.avg < s.max);
  assert.equal(st.level(now), 'very_expensive');
  assert.equal(st.coveredUntil(now).toISOString(), '2027-01-14T23:00:00.000Z');
});

test('PriceStore: günstigste N Slots und Block im Nachtfenster', () => {
  const st = new PriceStore();
  st.upsert(slotsOf('synthetic-aew-day.json'));
  const from = new Date('2027-01-13T23:00:00Z'); // 00:00 lokal
  const to = new Date('2027-01-14T05:00:00Z'); // 06:00 lokal
  const cheap = st.cheapestSlots(from, to, 8);
  assert.equal(cheap.length, 8);
  const maxCheap = Math.max(...cheap.map((s) => s.integrated));
  const others = st.range(from, to).filter((s) => !cheap.includes(s));
  assert.ok(others.every((s) => s.integrated >= maxCheap));

  const block = st.cheapestBlock(from, to, 8);
  assert.equal((block.end - block.start) / time.SLOT_MS, 8);
  assert.ok(block.start >= from && block.end <= to);
});

test('PriceStore: isAmongCheapest braucht vollständige Daten', () => {
  const st = new PriceStore();
  st.upsert(slotsOf('synthetic-aew-day.json'));
  // Fenster 22:00–06:00 um 03:00 am 14.1.: Beginn am 13.1. 22:00 fehlt → null
  assert.equal(st.isAmongCheapest(new Date('2027-01-14T02:00:00Z'), '22:00', '06:00', 8), null);
  // Fenster 00:00–06:00: vollständig
  const cheapest = st.cheapestSlots(new Date('2027-01-13T23:00:00Z'), new Date('2027-01-14T05:00:00Z'), 1)[0];
  assert.equal(st.isAmongCheapest(new Date(cheapest.start.getTime() + 60e3), '00:00', '06:00', 1), true);
  assert.equal(st.isAmongCheapest(new Date('2027-01-14T04:50:00Z'), '00:00', '06:00', 1),
    cheapest.start.getTime() === new Date('2027-01-14T04:45:00Z').getTime());
});

test('PriceStore: Zeitumstellung (92 / 100 Slots) zählt als voller Tag', () => {
  const st = new PriceStore();
  st.upsert(slotsOf('synthetic-dst-spring.json'));
  st.upsert(slotsOf('synthetic-dst-autumn.json'));
  assert.ok(st.hasFullDay(new Date('2026-03-29T10:00:00Z')));
  assert.ok(st.hasFullDay(new Date('2026-10-25T10:00:00Z')));
  assert.equal(st.dayStats(new Date('2026-10-25T10:00:00Z')).count, 100);
});

test('PriceStore: hasFullDay mit ratio toleriert einzelne fehlende Slots', () => {
  const st = new PriceStore();
  const slots = slotsOf('synthetic-aew-day.json');
  st.upsert(slots.slice(1)); // ein Slot (von 96) fehlt komplett
  const day = slots[1].start;
  assert.equal(st.dayCoverage(day), 95 / 96);
  assert.equal(st.hasFullDay(day), false);
  assert.equal(st.hasFullDay(day, { ratio: 0.95 }), true);
  assert.equal(st.hasFullDay(day, { ratio: 0.99 }), false);
});

test('PriceStore: rank, prune, JSON-Roundtrip', () => {
  const st = new PriceStore();
  st.upsert(slotsOf('synthetic-aew-day.json'));
  const now = new Date('2027-01-14T03:10:00Z');
  const r = st.rankToday(now);
  assert.ok(r >= 1 && r <= 96);
  const copy = PriceStore.fromJSON(JSON.parse(JSON.stringify(st.toJSON())));
  assert.equal(copy.rankToday(now), r);
  copy.prune(new Date('2027-01-14T12:00:00Z'));
  assert.equal(copy.slots.size, 96 - 52);
});

test('PriceStore: anderes Feld (electricity)', () => {
  const st = new PriceStore({ field: 'electricity' });
  st.upsert(slotsOf('test-env-all-day.json'));
  assert.equal(st.value(st.at(new Date('2026-09-25T10:00:00Z'))), 0.1);
});
