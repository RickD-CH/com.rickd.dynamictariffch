'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');

const { CostTracker } = require('../lib/CostTracker');
const {
  pack, unpack, summarize, mergeCost, withoutBaselines, BackupError,
} = require('../lib/CostBackup');

const TZ = 'Europe/Zurich';
const at = (day, h, m = 0) => new Date(Date.UTC(2027, 0, day, h - 1, m));
const price = () => ({ dyn: 20, feedIn: 5, dayAvg: 22 });
const REF = { price: 30 };

function sampleTracker() {
  const t = new CostTracker({ tz: TZ });
  for (const day of [13, 14, 15]) {
    t.report('import', 100 + day * 10, at(day, 10, 0), price, REF);
    t.report('import', 100 + day * 10 + 2, at(day, 10, 15), price, REF);
    t.report('battery_charge', 50, at(day, 10, 0), price, REF);
    t.report('battery_charge', 51, at(day, 10, 15), price, REF);
  }
  t.reportConsumer('Wärmepumpe', 10, at(14, 11, 0), price, REF);
  t.reportConsumer('Wärmepumpe', 11, at(14, 11, 15), price, REF);
  return t;
}

test('Roundtrip: Sicherung packen und wieder lesen ergibt dieselben Summen', () => {
  const t = sampleTracker();
  const text = pack({
    cost: t.toJSON(), settings: { vat_percent: 8.1 }, appVersion: '0.2.3', metering: '…5892', now: 1000,
  });
  assert.equal(typeof text, 'string');
  const b = unpack(text);
  assert.equal(b.createdAt, 1000);
  assert.equal(b.appVersion, '0.2.3');
  assert.deepEqual(b.settings, { vat_percent: 8.1 });
  const back = CostTracker.fromJSON(b.cost, { tz: TZ });
  const a = t.summary('2027-01-01', '2027-12-31', REF);
  const c = back.summary('2027-01-01', '2027-12-31', REF);
  assert.equal(c.importKwh, a.importKwh);
  assert.equal(c.netCostDyn, a.netCostDyn);
  assert.equal(c.days, 3);
  assert.deepEqual(back.consumerSummary('2027-01-01', '2027-12-31', REF).map((x) => x.name), ['Wärmepumpe']);
});

test('summarize nennt Tage, Zeitraum und Verbraucher', () => {
  const t = sampleTracker();
  const s = summarize(unpack(pack({ cost: t.toJSON() })));
  assert.equal(s.days, 3);
  assert.equal(s.firstDay, '2027-01-13');
  assert.equal(s.lastDay, '2027-01-15');
  assert.deepEqual(s.consumers, ['Wärmepumpe']);
});

test('kaputte oder fremde Texte werden abgelehnt', () => {
  assert.throws(() => unpack(''), BackupError);
  assert.throws(() => unpack('hallo'), BackupError);
  assert.throws(() => unpack(zlib.gzipSync('{"format":"x"}').toString('base64')), BackupError);
  const ok = JSON.parse(zlib.gunzipSync(Buffer.from(pack({ cost: sampleTracker().toJSON() }), 'base64')).toString());
  const bad = (mut) => {
    const p = JSON.parse(JSON.stringify(ok)); mut(p);
    return zlib.gzipSync(JSON.stringify(p)).toString('base64');
  };
  assert.throws(() => unpack(bad((p) => {
    p.version = 99;
  })), BackupError);
  assert.throws(() => unpack(bad((p) => {
    p.cost.days['kaputt'] = {};
  })), BackupError);
  assert.throws(() => unpack(bad((p) => {
    p.cost.days['2027-01-13'].impAll = 'x';
  })), BackupError);
  assert.throws(() => unpack(bad((p) => {
    p.cost.days['2027-01-13'].impAll = null;
  })), BackupError);
  assert.throws(() => unpack(bad((p) => {
    p.cost.counters.import = { value: -1, time: 'a' };
  })), BackupError);
});

test('Prototype-Schlüssel und zu viele Verbraucher werden abgelehnt', () => {
  const ok = JSON.parse(zlib.gunzipSync(Buffer.from(pack({ cost: sampleTracker().toJSON() }), 'base64')).toString());
  const enc = (p) => zlib.gzipSync(JSON.stringify(p)).toString('base64');
  const p1 = JSON.parse(JSON.stringify(ok));
  p1.cost.consumers = JSON.parse('{"__proto__": {"counter": {}, "days": {}}}');
  assert.throws(() => unpack(enc(p1)), BackupError);
  const p2 = JSON.parse(JSON.stringify(ok));
  p2.cost.consumers = {};
  for (let i = 0; i < 7; i += 1) p2.cost.consumers[`V${i}`] = { counter: {}, days: {} };
  assert.throws(() => unpack(enc(p2)), BackupError);
});

test('Einstellungen: nur bekannte, gültige Werte kommen durch, das Token nie', () => {
  const text = pack({
    cost: new CostTracker({ tz: TZ }).toJSON(),
    settings: {
      vat_percent: 8.1,
      token: 'geheim',
      feed_in_mode: 'api',
      battery_params: {
        capacityKwh: 13.8, powerKw: 5, roundTrip: 0.9, minSocPct: 5, maxSocPct: 90,
      },
      hourly_output: { unit: 'chf', vat: 'incl', decimals: 3 },
      ref_periods: [{ from: '', price: 26, feedIn: 10 }],
    },
  });
  const s = unpack(text).settings;
  assert.equal(s.vat_percent, 8.1);
  assert.equal(s.feed_in_mode, 'api');
  assert.equal(s.token, undefined);
  assert.deepEqual(s.hourly_output, { unit: 'chf', vat: 'incl', decimals: 3 });
  assert.equal(s.battery_params.capacityKwh, 13.8);
  assert.equal(s.ref_periods.length, 1);
  const bad = unpack(pack({
    cost: new CostTracker({ tz: TZ }).toJSON(),
    settings: {
      vat_percent: 500, battery_params: { capacityKwh: -1 }, hourly_output: { unit: 'x' }, feed_in_mode: 'foo',
    },
  })).settings;
  assert.deepEqual(bad, {});
});

test('Wiederherstellen ohne Zählerbasis, Zusammenführen behält vorhandene Tage', () => {
  const full = sampleTracker();
  const incoming = unpack(pack({ cost: full.toJSON() })).cost;
  assert.ok(Object.keys(incoming.counters).length > 0);
  const replaced = withoutBaselines(incoming);
  assert.deepEqual(replaced.counters, {});
  assert.deepEqual(replaced.consumers['Wärmepumpe'].counter, {});
  assert.equal(Object.keys(replaced.days).length, 3);

  const fresh = new CostTracker({ tz: TZ });
  fresh.report('import', 500, at(15, 12, 0), price, REF);
  fresh.report('import', 505, at(15, 12, 15), price, REF);
  const freshDay = JSON.parse(JSON.stringify(fresh.days['2027-01-15']));
  const merged = mergeCost(fresh.toJSON(), replaced);
  assert.equal(Object.keys(merged.days).length, 3, 'two days added from the backup');
  assert.deepEqual(merged.days['2027-01-15'], freshDay, 'existing day wins');
  assert.ok(merged.counters.import, 'baseline of the existing device stays');
  assert.ok(merged.consumers['Wärmepumpe']);
});

test('grosse Datenmenge: 366 Tage bleiben klein und unverändert', () => {
  const t = new CostTracker({ tz: TZ });
  const start = Date.UTC(2026, 0, 1);
  let value = 0;
  for (let d = 0; d < 366; d += 1) {
    for (let q = 0; q < 8; q += 1) {
      value += 0.3;
      t.report('import', value, new Date(start + d * 86400000 + q * 900000 + 8 * 3600000), price, REF);
    }
  }
  const json = t.toJSON();
  const text = pack({ cost: json });
  assert.ok(text.length < 400 * 1024, `compressed size ${text.length}`);
  const back = unpack(text);
  assert.equal(Object.keys(back.cost.days).length, Object.keys(json.days).length);
});

test('Vorschau: neueste Tage zuerst, Summen und Verbrauchertotale', () => {
  const t = sampleTracker();
  const s = summarize(unpack(pack({ cost: t.toJSON() })));
  assert.equal(s.preview.rows.length, 3);
  assert.equal(s.preview.rows[0].key, '2027-01-15');
  assert.equal(s.preview.rows[2].key, '2027-01-13');
  assert.equal(s.preview.hiddenRows, 0);
  const sum = s.preview.rows.reduce((a, r) => a + r.importKwh, 0);
  assert.ok(Math.abs(sum - s.preview.total.importKwh) < 1e-9);
  assert.equal(s.preview.consumerTotals[0].name, 'Wärmepumpe');
  assert.ok(s.preview.consumerTotals[0].kwh > 0);
});
