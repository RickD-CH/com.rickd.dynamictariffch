'use strict';

// Batterie-Fahrplan (reserveMode 'auto'): Ladung in die teuersten Viertelstunden bis zum nächsten Nachladen.
// Szenario mit den echten Werten vom 12./13.11.2026: Abend 33 bis 36 Rp., Nacht ab 11.9 Rp., Morgen bis 43 Rp.,
// Sonne 24.6 kWh am 13.11.

const test = require('node:test');
const assert = require('node:assert/strict');
const { planSchedule } = require('../lib/ems/planner/batterySchedule');
const { decideBattery } = require('../lib/ems/planner/battery');
const { normalizeConfig } = require('../lib/ems/Config');
const { fromLocal } = require('../lib/time');

const Q = 900000;
const at = (d, h, m = 0) => fromLocal(2026, 11, d, h, m).getTime();
const P12 = {
  19: 36.3, 20: 35.3, 21: 33, 22: 28, 23: 25,
};
const P13 = [24.0, 21.6, 16.2, 13.5, 11.9, 14.8, 24.5, 38.8, 43.0, 38.8, 32.6, 26.8, 23.1, 17.5, 16.1, 23.4, 27.3, 34.7, 41.7, 43.7, 43.0, 35.3, 27.4, 25.0];
const PV13 = [0, 0, 0, 0, 0, 0, 0, 0, 0.3, 1.8, 3.1, 3.9, 4.0, 4.0, 3.5, 2.6, 1.3, 0, 0, 0, 0, 0, 0, 0];
const slots = [];
for (let h = 19; h < 24; h++) for (let q = 0; q < 4; q++) slots.push({ start: at(12, h, q * 15), end: at(12, h, q * 15) + Q, price: P12[h] });
for (let h = 0; h < 24; h++) for (let q = 0; q < 4; q++) slots.push({ start: at(13, h, q * 15), end: at(13, h, q * 15) + Q, price: P13[h] });
const pvKwAt = (t) => (t < at(13, 0) ? 0 : PV13[Math.floor((t - at(13, 0)) / 3600000)] || 0);
const c = {
  reserveMode: 'auto', capacityKwh: 13.8, targetSoc: 90, floorSoc: 10, chargePowerKw: 5, efficiency: 0.9, bridgeLoadKw: 1.3, minSpreadRp: 3,
};
const idx = (r, t) => r.slots.findIndex((s) => s.start === t);

test('Fahrplan: Abend entladen, nachts günstig nachladen, Morgen decken, Sonne füllt (statt Abend halten)', () => {
  const r = planSchedule({
    slots, nowMs: at(12, 19, 1), soc: 36, c, pvKwAt, feedInRp: 8,
  });
  assert.ok(r.discharge[idx(r, at(12, 20))] > 0, '20:00 zu 35 Rp.: entladen (das andere EMS hielt)');
  assert.ok(r.discharge[idx(r, at(12, 21))] > 0);
  assert.ok(r.charge[idx(r, at(13, 4))] > 0, 'nachts um 04:00 zu 11.9 Rp. nachladen');
  assert.equal(r.charge[idx(r, at(13, 5))], 0, '14.8 Rp. lohnt sich nach Verlust und Mindestspanne nicht');
  for (const h of [7, 8]) assert.ok(r.discharge[idx(r, at(13, h))] > 0, `${h}:00 teurer Morgen gedeckt`);
  assert.ok(r.slots.every((s, i) => r.charge[i] === 0 || s.price < 15), 'nur günstig nachladen');
  const socAt = (t) => (r.energy[idx(r, t)] / r.cap) * 100;
  assert.ok(socAt(at(13, 15, 45)) > 95, 'die Sonne füllt die Batterie bis am Nachmittag');
  assert.ok(Math.min(...r.energy) >= (10 / 100) * 13.8 - 0.01, 'nie unter der Untergrenze');
});

test('Fahrplan: ohne Preisunterschied kein Netzladen; leere Batterie und kein Nutzen = kein Plan', () => {
  const flat = slots.map((s) => ({ ...s, price: 20 }));
  const r = planSchedule({
    slots: flat, nowMs: at(12, 19, 1), soc: 50, c, pvKwAt: null,
  });
  assert.equal(r.charge.reduce((a, b) => a + b, 0), 0);
  assert.ok(r.discharge.reduce((a, b) => a + b, 0) > 0, 'vorhandene Ladung wird trotzdem genutzt');
});

test('decideBattery automatisch: Entscheid je Tageszeit mit verständlichem Grund', () => {
  const d = (nowMs, soc) => decideBattery({
    cfg: c, soc, slots, nowMs, pvKwAt, tz: 'Europe/Zurich', feedInRp: 8,
  });
  const evening = d(at(12, 20, 5), 33);
  assert.equal(evening.mode, 'normal');
  assert.equal(evening.reason, 'teure Zeit: entladen');
  const night = d(at(13, 2, 5), 10);
  assert.equal(night.mode, 'hold');
  assert.equal(night.reason, 'Batterie leer bis Nachladen um 04:00');
  const charge = d(at(13, 4, 5), 10);
  assert.equal(charge.mode, 'charge');
  assert.match(charge.reason, /^günstig laden bis \d+ % für teure Zeit ab 0[5-7]:\d\d$/);
  assert.ok(charge.targetEff > 10 && charge.targetEff <= 90);
  const noon = d(at(13, 12, 5), 50);
  assert.equal(noon.mode, 'normal');
  assert.equal(noon.reason, 'Sonne deckt das Haus');
  assert.ok(evening.schedule.chargeKwh > 0);
  assert.ok(evening.schedule.dischargeAvg > evening.schedule.chargeAvg, 'entladen teurer als laden');
  assert.ok(evening.schedule.valueChf > 0);
});

test('Config: Fahrplan ist der neue Standard, feste Spitzenstunden bleiben wählbar', () => {
  assert.equal(normalizeConfig({}).battery.reserveMode, 'auto');
  assert.equal(normalizeConfig({ battery: { reserveMode: 'fixed' } }).battery.reserveMode, 'fixed');
  const fixed = decideBattery({
    cfg: { ...c, reserveMode: 'fixed', reserveHours: 6 }, soc: 33, slots, nowMs: at(12, 20, 5), pvKwAt, tz: 'Europe/Zurich',
  });
  assert.equal(fixed.schedule, undefined, 'fest = bisheriger Planer');
});

// ---------------------------------------------------------------- Anzeige

async function ui(battery, shadowExtra) {
  const fs = require('node:fs'); // eslint-disable-line global-require
  const path = require('node:path'); // eslint-disable-line global-require
  const vm = require('node:vm'); // eslint-disable-line global-require
  const emsJs = fs.readFileSync(path.join(__dirname, '../settings/ems.js'), 'utf8');
  const els = new Map();
  const handlers = {};
  const el = (id) => {
    if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '', value: '', checked: false, hidden: false, classList: { contains: () => true, toggle() {} }, addEventListener: (t, f) => { handlers[`${id}:${t}`] = f; } });
    return els.get(id);
  };
  const ctx = { document: { getElementById: el }, window: {}, setInterval: () => 0, console, Object, Promise, Date, Number, isFinite, String, JSON, Math };
  vm.createContext(ctx);
  vm.runInContext(emsJs, ctx);
  const config = normalizeConfig({ enabled: true, compare: true, devices: { meter: { id: 'em' } }, battery: { deviceId: 'bat', ...battery } });
  const res = {
    'GET /ems/shadow': {
      enabled: true, deviceExists: true, shadow: true, config, pv: {}, charger: { current: null }, ...shadowExtra,
    },
    'GET /ems/consumers': { current: [], events: [] },
    'GET /ems/devices': { devices: [{ id: 'bat', name: 'Batterie', caps: ['measure_battery'] }] },
    'GET /ems/flows': { flows: [] },
    'GET /meters': null,
    'GET /ems/battery-cards': { deviceId: 'bat', preset: null, cards: [] },
  };
  await ctx.window.EmsUi.init((m, p) => Promise.resolve(res[`${m} ${p}`]), 'de');
  handlers['ems-view-devices:click']({ target: { getAttribute: (n) => (n === 'data-ems-open' ? 'src-bat' : null), parentNode: null } });
  return { ctx, els, el };
}

test('Anzeige: Spitzenstunden «automatisch (Fahrplan)» als Standard mit Vorschau; feste Felder nur bei «feste Anzahl»', async () => {
  const schedule = {
    chargeKwh: 2.5, chargeFrom: at(13, 4), chargeTo: at(13, 4, 45), chargeAvg: 11.9, dischargeKwh: 6.1, dischargeAvg: 38.2, valueChf: 2.03,
  };
  const u = await ui({}, { current: { soc: 36, mine: { mode: 'normal', reason: 'teure Zeit: entladen', schedule } } });
  const html = u.els.get('ems-view-devices').innerHTML;
  assert.match(html, /<option value="auto" selected>automatisch \(Fahrplan\)<\/option>/);
  assert.doesNotMatch(html, /id="ems-bp-reserve"|id="ems-bp-solar"|id="ems-bp-bridge"/, 'feste Felder versteckt');
  assert.match(html, /Fahrplan: lädt 2\.5 kWh um 04:00 bis 04:45 \(Schnitt 11\.9 Rp\.\), gibt 6\.1 kWh in die teuersten Viertelstunden ab \(Schnitt 38\.2 Rp\.\)\. Nutzen ca\. 2\.03 CHF\./);
  u.el('ems-bp-mode').value = 'fixed';
  assert.equal(u.ctx.window.EmsUi._collect().ems.battery.reserveMode, 'fixed');
});

test('Vergleich: Kosten der Entscheide je Tag in CHF, Differenz grün wenn dieses EMS günstiger', async () => {
  const ledger = {
    today: {
      day: '2026-11-13', mine: 0.42, other: 0.51, none: 1.1, hours: 6,
    },
    days: [{
      day: '2026-11-12', mine: 1.2, other: 1.35, none: 2.4, hours: 24,
    }],
    total: {
      days: 1, mine: 1.2, other: 1.35, none: 2.4,
    },
  };
  const u = await ui({}, {
    ledger, overallAgreePct: 90, days: [], events: [], charger: { current: null, days: [], events: [] },
  });
  const cmp = u.els.get('ems-cmp-data').innerHTML;
  assert.match(cmp, /KOSTEN DER ENTSCHEIDE \(MODELL\)/);
  assert.match(cmp, /<td>heute bisher<\/td><td>0\.42<\/td><td>0\.51<\/td><td>1\.10<\/td><td class="ems-ok">-0\.09<\/td>/);
  assert.match(cmp, /<td>12\.11\.<\/td><td>1\.20<\/td><td>1\.35<\/td>/);
  assert.match(cmp, /Summe \(1\)/);
});
