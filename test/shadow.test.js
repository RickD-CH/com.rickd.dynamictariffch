'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { optimalCost, noBatteryCost, analyzeDay } = require('../lib/ShadowBattery');
const { CostTracker } = require('../lib/CostTracker');

const base = {
  capacityKwh: 2, powerKw: 20, roundTrip: 1,
};

test('Netzladung bei günstigem Preis, Entladung bei teurem: 20 statt 50 Rp.', () => {
  const day = { r: [1, 1], p: [10, 40], f: [0, 0] };
  assert.equal(noBatteryCost(day), 50);
  // start level 1.0 kWh (50 %): charge 1.0 in the cheap slot, discharge 1.0 in the expensive one
  assert.ok(Math.abs(optimalCost({ ...day, ...base, allowGridCharge: true }) - 20) < 1e-6);
  // without surplus PV nothing can be charged, so the day cannot end at the start level with savings
  assert.ok(Math.abs(optimalCost({ ...day, ...base, allowGridCharge: false }) - 50) < 1e-6);
});

test('PV-Überschuss wird zum entgangenen Einspeisepreis geladen und später genutzt', () => {
  // slot 0: 1 kWh surplus (feed-in 5), slot 1: house needs 1 kWh at 40
  const day = { r: [-1, 1], p: [10, 40], f: [5, 5] };
  assert.equal(noBatteryCost(day), -5 + 40);
  const pvOnly = optimalCost({ ...day, ...base, allowGridCharge: false });
  assert.ok(Math.abs(pvOnly - 0) < 1e-6); // surplus stored (no revenue), later no import
});

test('Verluste: mit 81 % Wirkungsgrad bringt das Laden weniger', () => {
  const day = { r: [1, 1], p: [10, 40], f: [0, 0] };
  const lossless = optimalCost({ ...day, ...base, allowGridCharge: true });
  const lossy = optimalCost({ ...day, ...base, roundTrip: 0.81, allowGridCharge: true });
  assert.ok(lossy > lossless);
  assert.ok(lossy < 50);
});

test('Optimum ist nie schlechter als keine Batterie und Netzladung nie schlechter als nur PV', () => {
  const r = []; const p = []; const f = [];
  for (let i = 0; i < 96; i += 1) {
    const h = i / 4;
    r.push(0.1 + 0.2 * Math.sin(h / 3) - (h > 9 && h < 16 ? 0.4 : 0));
    p.push(20 + 25 * Math.max(0, Math.sin((h - 14) / 24 * 2 * Math.PI + 1)));
    f.push(18);
  }
  const params = { capacityKwh: 13.8, powerKw: 5, roundTrip: 0.9 };
  const none = noBatteryCost({ r, p, f });
  const pvOnly = optimalCost({ r, p, f, ...params, allowGridCharge: false });
  const withGrid = optimalCost({ r, p, f, ...params, allowGridCharge: true });
  assert.ok(pvOnly <= none + 1e-6);
  assert.ok(withGrid <= pvOnly + 1e-6);
});

test('analyzeDay liefert Vergleichswerte', () => {
  const day = {
    key: '2027-01-14', r: [1, 1], p: [10, 40], f: [0, 0], actual: 50,
  };
  const a = analyzeDay(day, base);
  assert.equal(a.noBattery, 50);
  assert.ok(Math.abs(a.withGrid - 20) < 1e-6);
  assert.ok(Math.abs(a.gridChargeValue - 30) < 1e-6);
  assert.ok(Math.abs(a.unused - 30) < 1e-6);
  assert.equal(a.batteryGain, 0);
});

test('CostTracker liefert Schattentage mit Preisen und Residuum', () => {
  const TZ = 'Europe/Zurich';
  const day = (d, h, m = 0) => new Date(Date.UTC(2027, 0, d, h - 1, m));
  const priceAt = (start) => ({ dyn: start.getUTCHours() < 12 ? 10 : 40, feedIn: 5, dayAvg: 25 });
  const t = new CostTracker({ tz: TZ });
  const feed = (kind, v0, v1, d) => {
    t.report(kind, v0, day(d, 10, 0), priceAt, { price: 26 });
    t.report(kind, v1, day(d, 10, 15), priceAt, { price: 26 });
  };
  feed('import', 0, 1, 14); // baseline day: not eligible (tracking started that day)
  feed('import', 1, 2, 15);
  feed('battery_discharge', 0, 0.5, 15);
  assert.deepEqual(t.shadowDayKeys('2027-01-16'), ['2027-01-15']);
  assert.deepEqual(t.shadowDayKeys('2027-01-15'), []);
  const inp = t.shadowInputs('2027-01-15');
  assert.equal(inp.r.length, 96);
  assert.equal(inp.p.length, 96);
  assert.ok(Math.abs(inp.r.reduce((a, b) => a + b, 0) - 1.5) < 1e-3); // 1 kWh import + 0.5 discharge
  const back = CostTracker.fromJSON(JSON.parse(JSON.stringify(t.toJSON())), { tz: TZ });
  assert.deepEqual(back.shadowDayKeys('2027-01-16'), ['2027-01-15']);
});

test('Ladebereich: Reserve und Obergrenze begrenzen den Nutzen', () => {
  // 10 kWh battery, huge price spread: the usable window decides how much can be shifted
  const day = { r: [0, 0, 6], p: [10, 10, 50], f: [0, 0, 0] };
  const params = {
    capacityKwh: 10, powerKw: 50, roundTrip: 1, allowGridCharge: true,
  };
  const wide = optimalCost({ ...day, ...params, startFrac: 0.5 });
  const narrow = optimalCost({
    ...day, ...params, startFrac: 0.5, minFrac: 0.05, maxFrac: 0.9,
  });
  assert.ok(narrow >= wide - 1e-9, 'a narrower window is never cheaper');
  const noBat = noBatteryCost(day);
  assert.ok(narrow <= noBat + 1e-9);
  // window 50..60 % with start 50 %: only 1 kWh can be shifted (10 -> 50 Rp.)
  const capped = optimalCost({
    ...day, ...params, startFrac: 0.5, minFrac: 0.5, maxFrac: 0.6,
  });
  assert.ok(Math.abs(capped - (noBat - 1 * (50 - 10))) < 1e-6);
});
