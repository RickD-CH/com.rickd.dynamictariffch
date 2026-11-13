'use strict';

// Franken-Auswertung der Batterie-Entscheide (Modell): zwei virtuelle Batterien und ein Haus ohne Batterie.

const test = require('node:test');
const assert = require('node:assert/strict');
const { DecisionLedger } = require('../lib/ems/DecisionLedger');
const { fromLocal } = require('../lib/time');

const at = (d, h, m = 0) => fromLocal(2026, 11, d, h, m).getTime();
const P = {
  capacityKwh: 10, efficiency: 0.9, powerKw: 5, floorSoc: 10, targetSoc: 90,
};
const mem = () => {
  const m = new Map(); return { get: (k) => m.get(k), set: (k, v) => m.set(k, JSON.parse(JSON.stringify(v))) };
};

test('Abend 1 kW zu 40 Rp.: entladen (unser EMS) ist günstiger als halten (anderes EMS); ohne Batterie am teuersten', () => {
  const l = new DecisionLedger(mem(), 'Europe/Zurich');
  l.step({
    nowMs: at(13, 18), mine: 'normal', other: 'hold', price: 40, houseW: 1000, pvW: 0, socPct: 50, p: P,
  });
  for (let m = 5; m <= 120; m += 5) {
    l.step({
      nowMs: at(13, 18, m), mine: 'normal', other: 'hold', price: 40, houseW: 1000, pvW: 0, socPct: 50, p: P,
    });
  }
  const t = l.summary().today;
  assert.equal(t.hours, 2);
  assert.equal(t.none, 0.8, '2 kWh x 40 Rp.');
  assert.equal(t.other, 0.8, 'halten = alles aus dem Netz');
  assert.equal(t.mine, 0, 'Batterie deckt das Haus');
});

test('Tagesabschluss: übrige Ladung wird zum Tagesdurchschnitt verrechnet; Summe nur über Tage mit beiden EMS', () => {
  const store = mem();
  const l = new DecisionLedger(store, 'Europe/Zurich');
  const step = (nowMs, mine, other, price) => l.step({
    nowMs, mine, other, price, houseW: 1000, pvW: 0, socPct: 50, p: P,
  });
  step(at(13, 18), 'normal', 'hold', 40);
  for (let m = 15; m <= 120; m += 15) step(at(13, 18, m), 'normal', 'hold', 40);
  step(at(14, 0, 5), 'hold', 'hold', 20); // neuer Tag schliesst den 13.11.
  const d = l.summary().days[0];
  assert.equal(d.day, '2026-11-13');
  // unser EMS hat 2 kWh (geliefert) aus der Batterie genommen = 2 / 0.95 kWh Ladung weniger, zu 40 Rp. verrechnet
  assert.ok(Math.abs(d.mine - (2 / Math.sqrt(0.9)) * 0.4) < 0.02, `mine ${d.mine}`);
  assert.equal(d.other, 0.8);
  assert.ok(d.mine > d.other - 0.01, 'bei konstantem Preis bringt Entladen nichts (Verlust)');
  assert.equal(l.summary().total.days, 1);
  l.flush(at(14, 1));
  const again = new DecisionLedger(store, 'Europe/Zurich');
  assert.equal(again.summary().days[0].day, '2026-11-13', 'übersteht Neustart');
});

test('Laden aus dem Netz: günstig laden kostet heute, die Ladung zählt am Tagesende als Guthaben; Solarüberschuss lädt gratis', () => {
  const l = new DecisionLedger(mem(), 'Europe/Zurich');
  const step = (nowMs, mine, price, houseW, pvW) => l.step({
    nowMs, mine, other: null, price, houseW, pvW, socPct: 20, p: P,
  });
  step(at(13, 3), 'charge', 12, 500, 0);
  step(at(13, 3, 15), 'charge', 12, 500, 0);
  const t = l.summary().today;
  assert.ok(t.mine > t.none, 'heute teurer (geladen)');
  assert.equal(t.other, null, 'ohne anderes EMS kein Vergleichswert');
  const s = new DecisionLedger(mem(), 'Europe/Zurich');
  s.step({
    nowMs: at(13, 12), mine: 'hold', other: 'hold', price: 20, feedIn: 10, houseW: 500, pvW: 3500, socPct: 50, p: P,
  });
  s.step({
    nowMs: at(13, 12, 15), mine: 'hold', other: 'normal', price: 20, feedIn: 10, houseW: 500, pvW: 3500, socPct: 50, p: P,
  });
  assert.equal(s.summary().today.mine, s.summary().today.other, 'bei Überschuss gleich: beide laden aus der Sonne');
  assert.ok(s.summary().today.none < 0, 'ohne Batterie wird eingespeist und vergütet');
});
