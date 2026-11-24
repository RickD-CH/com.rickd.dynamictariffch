'use strict';

// Mindest-Gewinn je kWh («Verschleiss-Zuschlag»): Netzladen nur, wenn Ladepreis ÷ Wirkungsgrad + Mindest-Gewinn unter dem Preis der teuren Zeit liegt.

const test = require('node:test');
const assert = require('node:assert/strict');
const { planSchedule } = require('../lib/ems/planner/batterySchedule');
const { normalizeConfig } = require('../lib/ems/Config');
const { fromLocal } = require('../lib/time');

const Q = 900000;
const at = (h, m = 0) => fromLocal(2026, 11, 13, h, m).getTime();
const base = {
  capacityKwh: 13.8, targetSoc: 90, floorSoc: 10, chargePowerKw: 5, efficiency: 0.9, bridgeLoadKw: 1.3,
};

/** Nacht 14 Rp., Tag `day` Rp., keine Sonne: Nachladen nachts für den Tag. */
function plan(dayPrice, minSpreadRp) {
  const slots = [];
  for (let h = 0; h < 24; h++) for (let q = 0; q < 4; q++) slots.push({ start: at(h, q * 15), end: at(h, q * 15) + Q, price: h < 5 ? 14 : dayPrice });
  const r = planSchedule({
    slots, nowMs: at(0, 5), soc: 12, c: { ...base, minSpreadRp }, pvKwAt: null, feedInRp: 0,
  });
  return r.charge.reduce((a, b) => a + b, 0);
}

test('Mindest-Gewinn: kleiner Preisunterschied lädt bei 3 Rp., bei 10 Rp. nicht mehr', () => {
  // Nacht 14 Rp. -> 15.6 Rp. nach Wirkungsgrad; Tag 24 Rp.: Gewinn 8.4 Rp.
  assert.ok(plan(24, 3) > 0, 'bei 3 Rp. Mindest-Gewinn wird geladen');
  assert.equal(plan(24, 10), 0, 'bei 10 Rp. lohnt es sich nicht');
});

test('Mindest-Gewinn: grosser Preisunterschied lädt auch mit Zuschlag', () => {
  // Tag 36 Rp.: Gewinn 20 Rp.
  assert.ok(plan(36, 10) > 0);
  assert.ok(plan(36, 5) > 0);
});

test('Mindest-Gewinn: je höher der Wert, desto weniger Netzladen (nie mehr)', () => {
  const kwh = [0, 3, 5, 8, 12, 20].map((s) => plan(26, s));
  for (let i = 1; i < kwh.length; i++) assert.ok(kwh[i] <= kwh[i - 1] + 1e-9, `Wert ${i}: ${kwh}`);
  assert.ok(kwh[0] > kwh[kwh.length - 1]);
});

test('Konfiguration: Voreinstellung 5 Rp., gespeicherte Werte bleiben, Grenzen 0 bis 20', () => {
  assert.equal(normalizeConfig({}).battery.minSpreadRp, 5);
  assert.equal(normalizeConfig({ battery: { minSpreadRp: 8.5 } }).battery.minSpreadRp, 8.5);
  assert.equal(normalizeConfig({ battery: { minSpreadRp: 0 } }).battery.minSpreadRp, 0);
  assert.equal(normalizeConfig({ battery: { minSpreadRp: 99 } }).battery.minSpreadRp, 20);
  assert.equal(normalizeConfig({ battery: { minSpreadRp: -4 } }).battery.minSpreadRp, 0);
});
