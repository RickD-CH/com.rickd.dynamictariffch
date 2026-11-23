'use strict';

// Morgen überbrücken: Solar-Grenze verhindert Netzladen, die teuren Viertelstunden bis die Sonne das Haus deckt
// werden trotzdem abgedeckt. Szenario mit den echten Werten vom 13.11.2026.

const test = require('node:test');
const assert = require('node:assert/strict');
const { decideBattery } = require('../lib/ems/planner/battery');
const { normalizeConfig } = require('../lib/ems/Config');
const { fromLocal } = require('../lib/time');

const Q = 15 * 60 * 1000;
const at = (h, m = 0) => fromLocal(2026, 11, 13, h, m).getTime();
// Stundenpreise 13.11. (Rp./kWh) und PV-Prognose (kW)
const PRICE = [24.0, 21.6, 16.2, 13.5, 11.9, 14.8, 24.5, 38.8, 43.0, 38.8, 32.6, 26.8, 23.1, 17.5, 16.1, 23.4, 27.3, 34.7, 41.7, 43.7, 43.0, 35.3, 27.4, 25.0];
const PV = [0, 0, 0, 0, 0, 0, 0, 0, 0.3, 1.8, 3.1, 3.9, 4.0, 4.0, 3.5, 2.6, 1.3, 0, 0, 0, 0, 0, 0, 0];
const slots = [];
for (let i = 0; i < 96 + 8; i++) slots.push({ start: at(0) + i * Q, end: at(0) + (i + 1) * Q, price: PRICE[Math.floor(i / 4) % 24] });
const pvKwAt = (t) => PV[Math.floor((t - at(0)) / 3600000) % 24] || 0;
const cfg = (over = {}) => ({
  enabled: true, targetSoc: 90, chargePowerKw: 5, capacityKwh: 13.8, reserveHours: 6, solarLimitKwh: 16, ...over,
});
const decide = (nowMs, soc, over, prev = null) => decideBattery({
  cfg: cfg(over), soc, slots, solarKwh: 24.6, prev, nowMs, pvKwAt, tz: 'Europe/Zurich',
});

test('Ohne Überbrücken (wie bisher): bei viel Sonne kein Netzladen, die Batterie geht mit 23 % in den teuren Morgen', () => {
  const r = decide(at(0, 30), 23, { bridge: false });
  assert.notEqual(r.mode, 'charge');
  assert.deepEqual(r.chargeSlots, []);
  assert.match(r.reason, /kein Netzladen/);
});

test('Morgen überbrücken: plant günstiges Laden vor 07:00 für die teuren Viertelstunden bis die Sonne um 09:00 übernimmt', () => {
  const r = decide(at(0, 30), 23, { bridgeLoadKw: 1.5 });
  assert.ok(r.bridge, 'Überbrücken aktiv');
  assert.ok(r.bridge.target > 23 && r.bridge.target < 90, `Ziel ${r.bridge.target} %`);
  assert.equal(new Date(r.bridge.untilMs).getTime(), at(9), 'Sonne deckt ab 09:00 (1.8 kW >= 1.5 kW)');
  assert.ok(r.chargeSlots.length > 0);
  assert.ok(r.chargeSlots.every((s) => s.start < at(7)), 'nur vor der Lücke');
  assert.ok(r.chargeSlots.every((s) => s.price <= 14.8), 'in den günstigsten Viertelstunden (um 04:00)');
  // In der gewählten Viertelstunde wird geladen
  const run = decide(r.chargeSlots[0].start + 60000, 23, { bridgeLoadKw: 1.5 });
  assert.equal(run.mode, 'charge');
  assert.match(run.reason, /Morgen überbrücken: \d+ % bis Sonne \(09:00\)/);
  assert.equal(run.targetEff, r.bridge.target, 'Ziel an die Batterie: nur so viel wie nötig');
});

test('Morgen überbrücken: genug Ladung = nichts tun; teure Lücke billiger als Laden mit Verlust = nichts tun', () => {
  assert.equal(decide(at(0, 30), 60, {}).bridge, undefined, 'mit 60 % reicht es');
  const cheapMorning = slots.map((s) => ({ ...s, price: 15 }));
  const r = decideBattery({
    cfg: cfg({ bridgeLoadKw: 1.5 }), soc: 23, slots: cheapMorning, solarKwh: 24.6, nowMs: at(0, 30), pvKwAt, tz: 'Europe/Zurich',
  });
  assert.equal(r.bridge, undefined, 'ohne Preisunterschied lohnt sich Laden nicht');
  assert.equal(decideBattery({
    cfg: cfg(), soc: 23, slots, solarKwh: 24.6, nowMs: at(0, 30), pvKwAt: null,
  }).bridge, undefined, 'ohne PV-Prognose kein Überbrücken');
});

test('Config: Überbrücken standardmässig an, 1 kW Morgenverbrauch, Untergrenze 10 %', () => {
  const b = normalizeConfig({}).battery;
  assert.equal(b.bridge, true);
  assert.equal(b.bridgeLoadKw, 1);
  assert.equal(b.floorSoc, 10);
  assert.equal(normalizeConfig({ battery: { bridge: false, bridgeLoadKw: 50, floorSoc: 99 } }).battery.bridgeLoadKw, 10);
});

test('Anzeige: «Planung» unter Einrichten → Hausbatterie mit Spitzenstunden, Ziel, Ladeleistung, Solar-Grenze und Morgen überbrücken', async () => {
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
  const config = normalizeConfig({ enabled: true, devices: { meter: { id: 'em' } }, battery: { deviceId: 'bat', reserveHours: 6, reserveMode: 'fixed' } });
  const res = {
    'GET /ems/shadow': {
      enabled: true,
      deviceExists: true,
      shadow: true,
      config,
      pv: {},
      charger: { current: null },
      load: { days: 5, morningKw: 1.34 },
      current: {
        soc: 23,
        mine: {
          mode: 'hold',
          reason: 'Reserve',
          bridgeInfo: {
            status: 'charge', chargeKwh: 0.6, target: 28, chargeAt: at(4), gapFrom: at(7), gapTo: at(9), untilMs: at(9), needKwh: 2.7, haveKwh: 1.6, loadKw: 1.34, learned: true,
          },
        },
      },
    },
    'GET /ems/consumers': { current: [], events: [] },
    'GET /ems/devices': { devices: [{ id: 'bat', name: 'Batterie', caps: ['measure_battery'] }] },
    'GET /ems/flows': { flows: [] },
    'GET /meters': null,
  };
  await ctx.window.EmsUi.init((m, p) => Promise.resolve(res[`${m} ${p}`]), 'de');
  handlers['ems-view-devices:click']({ target: { getAttribute: (n) => (n === 'data-ems-open' ? 'src-bat' : null), parentNode: null } });
  const html = els.get('ems-view-devices').innerHTML;
  assert.match(html, /<b>Planung<\/b>/);
  assert.match(html, /Spitzenstunden mit der Batterie abdecken \(h\)/);
  assert.match(html, /id="ems-bp-reserve"[^>]*value="6"/);
  assert.match(html, /Morgen überbrücken/);
  assert.match(html, /Verbrauch bis die Sonne übernimmt/);
  assert.match(html, /<option value="auto" selected>automatisch \(gelernt\): 1\.3 kW<\/option>/);
  assert.match(html, /Gelernt: 1\.3 kW am Morgen \(Schnitt 05 bis 10 Uhr, 5 Tage\)/);
  assert.match(html, /Morgen überbrücken: lädt 0\.6 kWh bis 28 % um 04:00\. Grund: teuer 07:00 bis 09:00, die Sonne übernimmt ab 09:00\. Bedarf 2\.7 kWh \(1\.34 kW gelernt\), vorhanden 1\.6 kWh\./);
  assert.doesNotMatch(html, /id="ems-bp-load"/, 'fester Wert nur bei «fester Wert»');
  el('ems-bp-reserve').value = '4';
  el('ems-bp-target').value = '80';
  el('ems-bp-power').value = '4';
  el('ems-bp-solar').value = '20';
  el('ems-bp-bridge').checked = true;
  el('ems-bp-loadmode').value = 'fixed';
  el('ems-bp-load').value = '1.5';
  el('ems-bp-floor').value = '15';
  const b = ctx.window.EmsUi._collect().ems.battery;
  assert.equal(b.reserveHours, 4);
  assert.equal(b.targetSoc, 80);
  assert.equal(b.chargePowerKw, 4);
  assert.equal(b.solarLimitKwh, 20);
  assert.equal(b.bridge, true);
  assert.equal(b.bridgeLoadKw, 1.5);
  assert.equal(b.bridgeLoadMode, 'fixed');
  assert.equal(b.floorSoc, 15);
});

// ---------------------------------------------------------------- Gelernter Hausverbrauch

test('LoadProfile: lernt den Verbrauch je Viertelstunde des Tages, Durchschnitt über die Tage, übersteht Neustart', () => {
  const { LoadProfile } = require('../lib/ems/LoadProfile'); // eslint-disable-line global-require
  const mem = new Map();
  const store = { get: (k) => mem.get(k), set: (k, v) => mem.set(k, JSON.parse(JSON.stringify(v))) };
  const lp = new LoadProfile(store, 'Europe/Zurich');
  const day = (d, h, m = 0) => fromLocal(2026, 11, d, h, m).getTime();
  assert.equal(lp.kwAt(day(13, 7)), null, 'ohne Messungen nichts');
  for (const d of [11, 12]) {
    for (let s = 0; s < 4; s++) lp.record(day(d, 7, s * 3), d === 11 ? 1000 : 2000); // 07:00 bis 07:09
    for (let s = 0; s < 4; s++) lp.record(day(d, 13, s * 3), 400);
  }
  lp.record(day(12, 7, 10), -50);
  lp.record(day(12, 7, 11), 99999);
  assert.equal(lp.kwAt(day(13, 7, 5)), 1.5, '07:00-07:15: Schnitt von 1 und 2 kW');
  assert.equal(lp.kwAt(day(13, 13)), 0.4);
  assert.equal(lp.kwAt(day(13, 8)), null, '08:00 noch nicht gelernt');
  assert.equal(lp.dayCount(), 2);
  lp.flush(day(12, 14));
  const again = new LoadProfile(store, 'Europe/Zurich');
  assert.equal(again.kwAt(day(13, 7)), 1.5, 'nach Neustart noch da');
  assert.equal(again.info().days, 2);
});

test('Morgen überbrücken mit gelerntem Verbrauch: mehr Verbrauch = mehr Nachladen; Rechnung als Vorschau mit Status', () => {
  const low = decideBattery({
    cfg: cfg(), soc: 23, slots, solarKwh: 24.6, nowMs: at(0, 30), pvKwAt, tz: 'Europe/Zurich', loadKwAt: () => 0.8,
  });
  assert.equal(low.bridgeInfo.status, 'enough', '0.8 kW: 23 % reichen');
  assert.equal(low.bridgeInfo.learned, true);
  const high = decideBattery({
    cfg: cfg(), soc: 23, slots, solarKwh: 24.6, nowMs: at(0, 30), pvKwAt, tz: 'Europe/Zurich', loadKwAt: () => 2,
  });
  assert.equal(high.bridgeInfo.status, 'charge');
  assert.equal(high.bridgeInfo.loadKw, 2);
  assert.ok(high.bridgeInfo.chargeKwh > 0);
  assert.ok(high.bridgeInfo.needKwh > high.bridgeInfo.haveKwh);
  assert.equal(high.bridgeInfo.gapFrom, at(7));
  assert.equal(high.bridgeInfo.untilMs, at(10), '2 kW Verbrauch: 1.8 kW Sonne um 09:00 reichen nicht, erst ab 10:00');
  assert.ok(high.bridgeInfo.chargeAt < at(7));
  const noLearn = decideBattery({
    cfg: cfg({ bridgeLoadKw: 2 }), soc: 23, slots, solarKwh: 24.6, nowMs: at(0, 30), pvKwAt, tz: 'Europe/Zurich', loadKwAt: () => null,
  });
  assert.equal(noLearn.bridgeInfo.loadKw, 2, 'ohne gelernten Wert: fester Wert');
  const notBlocked = decideBattery({
    cfg: cfg(), soc: 23, slots, solarKwh: 5, nowMs: at(0, 30), pvKwAt, tz: 'Europe/Zurich',
  });
  assert.equal(notBlocked.bridgeInfo, undefined, 'Solar-Grenze greift nicht: normales Netzladen, keine Überbrückung');
});
