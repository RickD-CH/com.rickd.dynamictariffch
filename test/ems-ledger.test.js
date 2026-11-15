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

test('EMS-Daten löschen (Go-live): Vergleich, Franken-Auswertung, Protokoll und Plan-Verlauf weg, gelernter Verbrauch bleibt', () => {
  const { EmsController } = require('../lib/ems/EmsController'); // eslint-disable-line global-require
  const { ShadowLog } = require('../lib/ems/ShadowLog'); // eslint-disable-line global-require
  const { PlanLog } = require('../lib/ems/PlanLog'); // eslint-disable-line global-require
  const { LoadProfile } = require('../lib/ems/LoadProfile'); // eslint-disable-line global-require
  const store = mem();
  const homey = {
    settings: store, clock: { getTimezone: () => 'Europe/Zurich' }, drivers: { getDriver: () => ({ getDevices: () => [] }) }, setTimeout: () => 1, clearTimeout: () => {},
  };
  const ctrl = new EmsController({ homey, log() {}, error() {} });
  ctrl.shadowLog = new ShadowLog(store);
  ctrl.chargerLog = new ShadowLog(store, 'Europe/Zurich', 'charger');
  ctrl.planLog = new PlanLog(store);
  ctrl.shadowLog.record({
    nowMs: at(13, 12), soc: 50, price: 30, mine: { mode: 'hold', reason: 'x' }, other: { mode: 'normal' },
  });
  ctrl.planLog.record({ nowMs: at(13, 12), battery: 'hold' });
  const ledger = new DecisionLedger(store, 'Europe/Zurich');
  ledger.step({
    nowMs: at(13, 12), mine: 'hold', other: 'hold', price: 30, houseW: 800, pvW: 0, socPct: 50, p: P,
  });
  ledger.step({
    nowMs: at(13, 12, 5), mine: 'hold', other: 'hold', price: 30, houseW: 800, pvW: 0, socPct: 50, p: P,
  });
  const load = new LoadProfile(store, 'Europe/Zurich');
  for (let k = 0; k < 4; k++) load.record(at(13, 7, k * 3), 1500);
  load.flush(at(13, 8));
  const saved = [];
  ctrl.runner = {
    ledger, loadProfile: load, consumerEvents: [{ ts: 1 }], batteryEvents: [{ ts: 2 }], fuseEvents: [{ ts: 3 }], _save: (k, v) => saved.push([k, v]),
  };
  ctrl.resetData();
  assert.deepEqual(ctrl.shadowLog.summary().days, []);
  assert.deepEqual(ctrl.shadowLog.summary().events, []);
  assert.deepEqual(ctrl.planLog.entries, []);
  assert.equal(ledger.summary().today, null);
  assert.deepEqual(ledger.summary().days, []);
  assert.deepEqual(ctrl.runner.consumerEvents, []);
  assert.deepEqual(ctrl.runner.batteryEvents, []);
  assert.deepEqual(ctrl.runner.fuseEvents, []);
  assert.deepEqual(saved.map((x) => x[0]).sort(), ['batteryEvents', 'consumerEvents', 'fuseEvents']);
  assert.equal(load.kwAt(at(14, 7)), 1.5, 'gelernter Verbrauch bleibt');
  assert.deepEqual(new DecisionLedger(store, 'Europe/Zurich').summary().days, [], 'auch nach Neustart leer');
});

test('Echte Batterie leer: «Halten» zählt wie «Normal», das Modell kauft nicht teuer zu, wenn es noch Ladung hätte', () => {
  const l = new DecisionLedger(mem(), 'Europe/Zurich');
  const step = (m, socPct) => l.step({
    nowMs: at(13, 8, m), mine: 'hold', other: 'normal', price: 43, houseW: 1000, pvW: 0, socPct, p: P,
  });
  step(0, 30); // Tagesstart: Modell bei 30 %
  for (let m = 15; m <= 60; m += 15) step(m, 10); // echte Batterie an der Untergrenze
  const t = l.summary().today;
  assert.equal(t.mine, t.other, 'gleiche Kosten, weil «Halten» bei leerer Batterie nichts ändert');
});

test('Aufschlüsselung: Kosten je Situation (Entscheid ich | Entscheid anderes EMS | Preisstufe), geordnet nach dem Unterschied; ohne anderes EMS keine Zeile', () => {
  const l = new DecisionLedger(mem(), 'Europe/Zurich');
  const run = (day, h, mine, other, price) => {
    for (let m = 0; m <= 120; m += 15) {
      l.step({
        nowMs: at(day, h, m), mine, other, price, houseW: 1000, pvW: 0, socPct: 50, p: P,
      });
    }
  };
  run(13, 8, 'normal', 'hold', 25); // mittlere Preise: wir entladen, das andere EMS hält
  const b1 = l.summary().breakdown;
  assert.equal(b1.length, 1);
  assert.deepEqual([b1[0].mine, b1[0].other, b1[0].band], ['normal', 'hold', 'mid']);
  assert.equal(b1[0].hours, 2);
  assert.equal(b1[0].mineChf, 0, 'unsere Batterie deckt das Haus');
  assert.equal(b1[0].otherChf, 0.5, 'das andere EMS kauft 2 kWh zu 25 Rp.');
  assert.equal(b1[0].diffChf, -0.5, 'negativ = wir sind in dieser Situation günstiger');
  assert.equal(b1[0].otherKwh, 2);
  // später: beide entladen zu hohen Preisen (gleiche Entscheide), unsere Batterie wurde vorher aber schon geleert
  const l2 = new DecisionLedger(mem(), 'Europe/Zurich');
  for (let m = 0; m <= 60; m += 15) {
    l2.step({
      nowMs: at(13, 18, m), mine: 'normal', other: 'hold', price: 20, houseW: 4000, pvW: 0, socPct: 50, p: P,
    });
  }
  for (let m = 15; m <= 75; m += 15) {
    l2.step({
      nowMs: at(13, 19, m), mine: 'normal', other: 'normal', price: 40, houseW: 4000, pvW: 0, socPct: 50, p: P,
    });
  }
  const b2 = l2.summary().breakdown.find((x) => x.band === 'high');
  assert.deepEqual([b2.mine, b2.other], ['normal', 'normal']);
  assert.ok(b2.diffChf > 0, 'gleiche Entscheide, aber unsere leere Batterie kauft zu 40 Rp. ein: die Folge des früheren Entscheids');
  // ohne anderes EMS: nichts zu vergleichen
  const l3 = new DecisionLedger(mem(), 'Europe/Zurich');
  for (let m = 0; m <= 60; m += 15) {
    l3.step({
      nowMs: at(13, 8, m), mine: 'normal', other: null, price: 25, houseW: 1000, pvW: 0, socPct: 50, p: P,
    });
  }
  assert.deepEqual(l3.summary().breakdown, []);
});

test('Aufschlüsselung: nach dem Tagesabschluss bleibt sie erhalten (abgerundet gespeichert), die Tageszeilen tragen sie nicht doppelt', () => {
  const store = mem();
  const l = new DecisionLedger(store, 'Europe/Zurich');
  const feed = (day) => {
    for (let m = 0; m <= 120; m += 15) {
      l.step({
        nowMs: at(day, 8, m), mine: 'normal', other: 'hold', price: 25, houseW: 1000, pvW: 0, socPct: 50, p: P,
      });
    }
  };
  feed(13);
  feed(14); // neuer Tag: der 13. wird abgeschlossen
  l.flush();
  const re = new DecisionLedger(store, 'Europe/Zurich');
  const s = re.summary();
  assert.equal(s.breakdown.length, 1);
  assert.equal(s.breakdown[0].hours, 4, 'beide Tage');
  assert.equal(s.days[0].cls, undefined, 'Tageszeilen ohne Aufschlüsselung (sie steht gesammelt in breakdown)');
});
