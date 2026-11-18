'use strict';

// Ausblick Hausanschluss: erwarteter Netzbezug gegen die Grenze der Sicherung.

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOutlook, hourly } = require('../lib/ems/planner/gridOutlook');
const { fromLocal } = require('../lib/time');

const Q = 900000;
const at = (h, m = 0) => fromLocal(2026, 11, 18, h, m).getTime();
const between = (a, b) => (t) => t >= a && t < b;

test('Ausblick: Grenze = 3 Phasen x Grenzstrom x 230 V; Haus allein bleibt weit darunter', () => {
  const o = buildOutlook({ nowMs: at(20), limitA: 36, baseKwAt: () => 1.1 });
  assert.equal(o.limitKw, 24.8);
  assert.equal(o.status, 'ok');
  assert.equal(o.peak.gridKw, 1.1);
  assert.equal(o.slots.length, 96, '24 Stunden');
  assert.equal(o.phaseNote, true);
});

test('Ausblick: Batterie, Geschirrspüler und Auto zur gleichen Zeit ergeben die Spitze samt Beteiligten', () => {
  const night = between(at(23), at(23, 45));
  const o = buildOutlook({
    nowMs: at(20),
    limitA: 36,
    baseKwAt: () => 1.1,
    loads: [
      { key: 'battery', name: 'Batterie', kwAt: (t) => (night(t) ? 5 : 0) },
      { key: 'car', name: 'E-Auto', kwAt: (t) => (night(t) ? 11 : 0) },
      { key: 'job:gwa', name: 'GWA', kwAt: (t) => (between(at(23, 15), at(23, 45))(t) ? 2 : 0) },
    ],
  });
  assert.equal(o.peak.t, at(23, 15));
  assert.equal(o.peak.gridKw, 19.1);
  assert.deepEqual(o.peak.parts.map((p) => p.name), ['Batterie', 'E-Auto', 'GWA']);
  assert.equal(o.peak.pct, 77);
  assert.equal(o.status, 'ok');
});

test('Ausblick: ab 80 % «knapp», ab 100 % «über der Grenze»; Sonne zieht vom Bezug ab', () => {
  const load = (kw) => ({ key: 'x', name: 'X', kwAt: () => kw });
  assert.equal(buildOutlook({ nowMs: at(8), limitA: 36, baseKwAt: () => 1, loads: [load(19)] }).status, 'tight');
  assert.equal(buildOutlook({ nowMs: at(8), limitA: 36, baseKwAt: () => 1, loads: [load(25)] }).status, 'over');
  const sunny = buildOutlook({ nowMs: at(8), limitA: 36, baseKwAt: () => 1, pvKwAt: () => 6, loads: [load(25)] });
  assert.equal(sunny.peak.gridKw, 20);
  assert.equal(sunny.status, 'tight');
  const surplus = buildOutlook({ nowMs: at(8), limitA: 36, baseKwAt: () => 1, pvKwAt: () => 6 });
  assert.equal(surplus.peak.gridKw, 0, 'Überschuss belastet den Bezug nicht');
});

test('Ausblick: ohne Verbrauchsprofil oder Grenze kein Urteil; Stundenwerte nehmen die höchste Viertelstunde', () => {
  assert.equal(buildOutlook({ nowMs: at(8), limitA: 36 }).status, 'unknown');
  assert.equal(buildOutlook({ nowMs: at(8), limitA: 0, baseKwAt: () => 1 }).status, 'unknown');
  const o = buildOutlook({
    nowMs: at(8), limitA: 36, horizonH: 2, baseKwAt: (t) => (t === at(8, 30) ? 4 : 1),
  });
  const h = hourly(o);
  assert.equal(h.length, 2);
  assert.equal(h[0].gridKw, 4);
  assert.equal(h[1].gridKw, 1);
  assert.ok(h[0].t < h[1].t);
  assert.equal(Q, 900000);
});
