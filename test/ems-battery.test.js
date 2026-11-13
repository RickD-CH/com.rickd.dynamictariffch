'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { decideBattery, effectiveTarget } = require('../lib/ems/planner/battery');
const { selectCheapest, selectExpensive } = require('../lib/ems/planner/slots');
const { sumKwh } = require('../lib/ems/PvFeed');
const { fromLocal } = require('../lib/time');

const Q = 15 * 60 * 1000;
const day0 = fromLocal(2026, 11, 10, 0, 0).getTime();
const at = (h, m = 0) => day0 + (h * 60 + m) * 60 * 1000;

/** 96 Viertelstunden: Nacht 02-06 billig (15 Rp.), Tag 25, Abend 17-21 teuer (40). */
function dayPrices(from = day0) {
  const slots = [];
  for (let i = 0; i < 96; i += 1) {
    const h = i / 4;
    let price = 25;
    if (h >= 2 && h < 6) price = 15;
    if (h >= 17 && h < 21) price = 40;
    slots.push({ start: from + i * Q, end: from + (i + 1) * Q, price });
  }
  return slots;
}

const cfg = { capacityKwh: 13.8, targetSoc: 90, chargePowerKw: 5, reserveHours: 6, solarLimitKwh: 16 };

test('ohne Preise: normal', () => {
  const r = decideBattery({ cfg, soc: 50, slots: [], nowMs: at(3) });
  assert.equal(r.mode, 'normal');
});

test('SoC unbekannt: normal', () => {
  const r = decideBattery({ cfg, soc: null, slots: dayPrices(), nowMs: at(3) });
  assert.equal(r.mode, 'normal');
});

test('nachts im billigsten Slot: laden', () => {
  const slots = [...dayPrices(), ...dayPrices(day0 + 96 * Q)];
  // 50 % -> 90 % = 5.5 kWh = 1.1 h = 5 Viertelstunden, alle im Fenster 02:00-06:00
  const r = decideBattery({ cfg, soc: 50, slots, solarKwh: 3, nowMs: at(3, 5) });
  assert.equal(r.mode, 'charge');
  assert.ok(r.chargeSlots.length >= 5 && r.chargeSlots.length <= 6);
  assert.ok(r.chargeSlots.every((s) => s.start >= at(2) && s.start < at(6)));
});

test('Mittag, nicht im billigen Fenster: halten oder normal, nicht laden', () => {
  const slots = [...dayPrices(), ...dayPrices(day0 + 96 * Q)];
  const r = decideBattery({ cfg, soc: 50, slots, solarKwh: 3, nowMs: at(12) });
  assert.notEqual(r.mode, 'charge');
});

test('Reserve: in den teuersten Slots Entladung erlaubt, sonst halten', () => {
  const slots = [...dayPrices(), ...dayPrices(day0 + 96 * Q)];
  const c4 = { ...cfg, reserveHours: 4 };
  const cheap = decideBattery({ cfg: c4, soc: 90, slots, solarKwh: 3, nowMs: at(10) });
  assert.equal(cheap.mode, 'hold');
  const peak = decideBattery({ cfg: c4, soc: 90, slots, solarKwh: 3, nowMs: at(18) });
  assert.equal(peak.mode, 'normal');
  assert.equal(peak.reserveSlots.length, 16);
});

test('Solar-Tor hart: Prognose >= Schwelle blockiert das Netzladen', () => {
  const slots = [...dayPrices(), ...dayPrices(day0 + 96 * Q)];
  const r = decideBattery({ cfg, soc: 40, slots, solarKwh: 16.1, nowMs: at(3) });
  assert.notEqual(r.mode, 'charge');
  assert.match(r.reason, /kein Netzladen/);
});

test('Solar-Tor veraltet (null): bleibt offen', () => {
  const slots = [...dayPrices(), ...dayPrices(day0 + 96 * Q)];
  const r = decideBattery({ cfg, soc: 40, slots, solarKwh: null, nowMs: at(3) });
  assert.equal(r.mode, 'charge');
});

test('weicher Solar-Tor: Ziel sinkt linear zwischen min und Schwelle', () => {
  const c = { targetSoc: 90, targetSocMin: 50, solarMinKwh: 4, solarLimitKwh: 16 };
  assert.equal(effectiveTarget(c, 3).target, 90);
  assert.equal(effectiveTarget(c, 4).target, 90);
  assert.equal(effectiveTarget(c, 10).target, 70);
  assert.equal(effectiveTarget(c, 15.9).target, 50);
  assert.equal(effectiveTarget(c, 16).blocked, true);
  // ohne solarMinKwh: harter Solar-Tor, kein Übergang
  assert.equal(effectiveTarget({ ...c, solarMinKwh: 0 }, 10).target, 90);
});

test('weicher Solar-Tor senkt die Ladung: weniger Slots bei mehr Sonne', () => {
  const slots = [...dayPrices(), ...dayPrices(day0 + 96 * Q)];
  const soft = { ...cfg, solarMinKwh: 4 };
  const low = decideBattery({ cfg: soft, soc: 50, slots, solarKwh: 3, nowMs: at(3) });
  const mid = decideBattery({ cfg: soft, soc: 50, slots, solarKwh: 10, nowMs: at(3) });
  assert.ok(mid.chargeSlots.length < low.chargeSlots.length);
  assert.equal(mid.targetEff, 70);
});

test('begonnener Ladeslot wird zu Ende geladen (commitSlot)', () => {
  const slots = [...dayPrices(), ...dayPrices(day0 + 96 * Q)];
  const nowMs = at(3, 5);
  const first = decideBattery({ cfg, soc: 88, slots, solarKwh: 3, nowMs });
  // 88 % -> 90 % = 0.28 kWh: ein Slot genügt; Auswahl kann den aktuellen verlassen,
  // aber nach "charge" im selben Slot bleibt es bei charge
  const prev = { mode: 'charge', slotStart: at(3) };
  const again = decideBattery({ cfg, soc: 89, slots, solarKwh: 3, prev, nowMs });
  assert.equal(again.mode, 'charge');
  const off = decideBattery({ cfg: { ...cfg, commitSlot: false }, soc: 89, slots, solarKwh: 3, prev, nowMs });
  assert.ok(['charge', 'hold', 'normal'].includes(off.mode));
  assert.ok(first);
});

test('Ziel erreicht: nicht mehr laden', () => {
  const slots = [...dayPrices(), ...dayPrices(day0 + 96 * Q)];
  const r = decideBattery({ cfg, soc: 90, slots, solarKwh: 3, prev: { mode: 'charge', slotStart: at(3) }, nowMs: at(3, 5) });
  assert.notEqual(r.mode, 'charge');
});

test('Auswahl: billigste und teuerste Slots, früher bei Gleichstand', () => {
  const s = [0, 1, 2, 3].map((i) => ({ start: i * Q, end: (i + 1) * Q, price: i === 2 ? 5 : 10 }));
  assert.deepEqual([...selectCheapest(s, 0.5)].sort(), [Q * 0, Q * 2].sort());
  assert.deepEqual([...selectExpensive(s, 0.5)].sort(), [0, Q].sort());
});

test('sumKwh: Slots mit Ende im Fenster', () => {
  const slots = [{ end: 1000, kw: 2, h: 0.5 }, { end: 2000, kw: 4, h: 0.5 }, { end: 3000, kw: 6, h: 0.5 }];
  assert.equal(sumKwh(slots, 1000, 3000), 5);
});

// ---------------------------------------------------------------- Notstrom-Reserve

test('Notstrom-Reserve: unter dem Ziel laden (egal zu welchem Preis), überstimmt den Fahrplan', () => {
  const c = { ...cfg, backupReserve: { active: true, soc: 60 } };
  const r = decideBattery({ cfg: c, soc: 40, slots: dayPrices(), nowMs: at(19) }); // 19 Uhr: sonst teure Zeit -> entladen
  assert.equal(r.mode, 'charge');
  assert.equal(r.targetEff, 60);
  assert.match(r.reason, /Notstrom-Reserve.*60/);
  assert.equal(r.backupReserve, true);
});

test('Notstrom-Reserve: am oder über dem Ziel halten, nicht weiter entladen', () => {
  const c = { ...cfg, backupReserve: { active: true, soc: 60 } };
  const r = decideBattery({ cfg: c, soc: 60, slots: dayPrices(), nowMs: at(19) });
  assert.equal(r.mode, 'hold');
  assert.match(r.reason, /Notstrom-Reserve.*60/);
  const above = decideBattery({ cfg: c, soc: 80, slots: dayPrices(), nowMs: at(19) });
  assert.equal(above.mode, 'hold', 'auch deutlich darüber wird nicht entladen, solange aktiv');
});

test('Notstrom-Reserve: aus = normale Planung (Fahrplan oder feste Reserve) läuft wie bisher', () => {
  const c = { ...cfg, backupReserve: { active: false, soc: 60 } };
  const r = decideBattery({ cfg: c, soc: 40, slots: dayPrices(), nowMs: at(19) });
  assert.equal(r.mode, 'normal', 'teure Abendstunde, Reserve aus: normal entladen wie ohne das Feld');
  assert.equal(r.backupReserve, undefined);
});

test('Notstrom-Reserve: wirkt auch im Fahrplan-Modus (reserveMode auto)', () => {
  const c = { ...cfg, reserveMode: 'auto', backupReserve: { active: true, soc: 50 } };
  const r = decideBattery({ cfg: c, soc: 20, slots: dayPrices(), nowMs: at(19) });
  assert.equal(r.mode, 'charge');
  assert.equal(r.targetEff, 50);
});
