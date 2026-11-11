'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizeSchedule, nextDeparture, carPlan } = require('../lib/ems/planner/carSchedule');
const { EmsRunner } = require('../lib/ems/EmsRunner');
const { ShadowLog } = require('../lib/ems/ShadowLog');
const { PriceFeed } = require('../lib/ems/PriceFeed');
const { PvFeed } = require('../lib/ems/PvFeed');
const { normalizeConfig } = require('../lib/ems/Config');
const { fromLocal } = require('../lib/time');

const TZ = 'Europe/Zurich';
const Q = 15 * 60 * 1000;
// Dienstag, 10.11.2026
const tue = (h, m = 0) => fromLocal(2026, 11, 10, h, m).getTime();
const wed = (h, m = 0) => fromLocal(2026, 11, 11, h, m).getTime();
const weekdays = (on, time = '06:00', soc = 80) => ({ days: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri'].map((d) => [d, { on, time, soc }])) });

/** Nachts 10 Rp., tags 25 Rp. (Di und Mi). */
function slots() {
  const out = [];
  const d0 = tue(0);
  for (let i = 0; i < 192; i++) {
    const h = (i % 96) / 4;
    out.push({ start: d0 + i * Q, end: d0 + (i + 1) * Q, price: h < 5 ? 10 : 25 });
  }
  return out;
}

// ---------------------------------------------------------------- Kalender

test('normalizeSchedule: Standard alle Tage aus, 06:00, 80 %, Netz nachladen an; ungültiges wird bereinigt', () => {
  const s = normalizeSchedule(undefined);
  assert.equal(s.days.mon.on, false);
  assert.equal(s.days.sun.time, '06:00');
  assert.equal(s.days.sat.soc, 80);
  assert.equal(s.gridCharge, true);
  assert.equal(s.holiday, false);
  assert.equal(s.override, null);
  const b = normalizeSchedule({ days: { mon: { on: true, time: '25:00', soc: 150 } }, gridCharge: false, override: { date: 'kaputt' } });
  assert.equal(b.days.mon.time, '06:00');
  assert.equal(b.days.mon.soc, 100);
  assert.equal(b.gridCharge, false);
  assert.equal(b.override, null);
});

test('nextDeparture: nächster Kalendertag; heute vor der Uhrzeit zählt heute; Ferien pausieren; Wochenende aus', () => {
  const sc = weekdays(true);
  assert.equal(nextDeparture({ schedule: sc, nowMs: tue(20), tz: TZ }).at, wed(6), 'Di abends -> Mi 06:00');
  assert.equal(nextDeparture({ schedule: sc, nowMs: tue(5), tz: TZ }).at, tue(6), 'Di 05:00 -> Di 06:00');
  const fri = fromLocal(2026, 11, 13, 20, 0).getTime();
  assert.equal(nextDeparture({ schedule: sc, nowMs: fri, tz: TZ }).at, fromLocal(2026, 11, 16, 6, 0).getTime(), 'Fr abends -> Mo (Wochenende aus)');
  assert.equal(nextDeparture({ schedule: { ...sc, holiday: true }, nowMs: tue(20), tz: TZ }), null, 'Ferien');
  assert.equal(nextDeparture({ schedule: weekdays(false), nowMs: tue(20), tz: TZ }), null, 'nichts eingetragen');
});

test('nextDeparture: «Nächste Abfahrt» überschreibt den Kalender an diesem Tag, auch mit «kein Laden»', () => {
  const sc = { ...weekdays(true), override: { date: '2026-11-11', on: true, time: '07:30', soc: 60 } };
  const d = nextDeparture({ schedule: sc, nowMs: tue(20), tz: TZ });
  assert.equal(d.at, wed(7, 30));
  assert.equal(d.soc, 60);
  assert.equal(d.source, 'override');
  const off = nextDeparture({ schedule: { ...weekdays(true), override: { date: '2026-11-11', on: false } }, nowMs: tue(20), tz: TZ });
  assert.equal(off.at, fromLocal(2026, 11, 12, 6, 0).getTime(), 'Mi ausgelassen -> Do 06:00');
  // Auch an einem Tag ohne Kalender-Eintrag (z. B. Samstag)
  const sat = nextDeparture({ schedule: { ...weekdays(false), override: { date: '2026-11-14', on: true, time: '09:00', soc: 90 } }, nowMs: tue(20), tz: TZ });
  assert.equal(sat.at, fromLocal(2026, 11, 14, 9, 0).getTime());
});

// ---------------------------------------------------------------- Planung

test('carPlan: Auto kommt mit 40 % nach Hause, soll morgen um 06:00 80 % haben - lädt in den günstigen Nachtstunden', () => {
  const r = carPlan({ schedule: weekdays(true), nowMs: tue(18), tz: TZ, soc: 40, capacityKwh: 60, powerKw: 11, slots: slots() });
  assert.equal(r.state, 'planned');
  assert.equal(r.needKwh, 24);
  assert.equal(r.starts.length, Math.ceil((24 / 11) * 4));
  assert.ok(r.starts.every((t) => t >= wed(0) && t < wed(5)), 'nur in der Nacht (10 Rp.)');
  assert.equal(r.wantOn, false, 'um 18:00 noch nicht');
  assert.match(r.reason, /Auto-Ziel 80 % bis 11\.11\. 06:00 \(24 kWh\)/);
  const night = carPlan({ schedule: weekdays(true), nowMs: r.starts[0] + 60000, tz: TZ, soc: 40, capacityKwh: 60, powerKw: 11, slots: slots() });
  assert.equal(night.wantOn, true, 'in der gewählten Viertelstunde laden');
});

test('carPlan: neu gerechnet mit dem aktuellen Ladestand; Ziel erreicht = nicht laden; Netz nachladen aus = nur Solar', () => {
  const r = carPlan({ schedule: weekdays(true), nowMs: wed(1), tz: TZ, soc: 70, capacityKwh: 60, powerKw: 11, slots: slots() });
  assert.equal(r.needKwh, 6);
  assert.equal(r.starts.length, Math.ceil((6 / 11) * 4));
  const done = carPlan({ schedule: weekdays(true), nowMs: wed(2), tz: TZ, soc: 80, capacityKwh: 60, powerKw: 11, slots: slots() });
  assert.equal(done.state, 'reached');
  assert.equal(done.wantOn, false);
  const solar = carPlan({ schedule: { ...weekdays(true), gridCharge: false }, nowMs: tue(18), tz: TZ, soc: 40, capacityKwh: 60, powerKw: 11, slots: slots() });
  assert.equal(solar.state, 'solar_only');
  assert.deepEqual(solar.starts, []);
  assert.equal(carPlan({ schedule: weekdays(true), nowMs: tue(18), tz: TZ, soc: null, capacityKwh: 60, powerKw: 11, slots: slots() }).state, 'no_soc');
  assert.equal(carPlan({ schedule: weekdays(true), nowMs: tue(18), tz: TZ, soc: 40, capacityKwh: 0, powerKw: 11, slots: slots() }).state, 'no_capacity');
  assert.equal(carPlan({ schedule: weekdays(false), nowMs: tue(18), tz: TZ, soc: 40, capacityKwh: 60, powerKw: 11, slots: slots() }).state, 'none');
  const short = carPlan({ schedule: weekdays(true), nowMs: wed(5, 30), tz: TZ, soc: 10, capacityKwh: 60, powerKw: 11, slots: slots() });
  assert.equal(short.state, 'short', 'zu wenig Zeit bis 06:00');
  assert.equal(short.wantOn, true, 'lädt trotzdem, was geht');
});

// ---------------------------------------------------------------- Runner

function runner({ soc = 40, connected = true, gridCharge = true } = {}) {
  const priceStore = { range: (a, b) => slots().filter((s) => s.start >= a.getTime() && s.start < b.getTime()).map((s) => ({ start: new Date(s.start), end: new Date(s.end), integrated: s.price / 100 })), value: (s) => s.integrated };
  const config = normalizeConfig({
    enabled: true, devices: { meter: { id: 'm' } }, charger: { id: 'wb' },
    car: { deviceId: 'car', capacityKwh: 60, schedule: { ...weekdays(true), gridCharge } },
  });
  const i = { gridW: 300, houseW: 300, pvW: 0, batterySoc: null, batteryW: 0, chargerRead: true, chargerConnected: connected, chargerPowerW: 0, chargerPhases: 3, carSoc: soc, andi: null };
  const r = new EmsRunner({
    getConfig: () => config, prices: new PriceFeed(() => ({ priceStore })), pv: new PvFeed(null, () => {}, { get: async () => ({ slots: [], stale: true }) }),
    inputs: { chargerInputs: async () => i, consumerStates: async () => new Map() },
    actuators: { charger: async (id, cmd) => ({ cmd: cmd.type }), consumer: async () => ({}) },
    shadowLog: new ShadowLog({ get() {}, set() {} }), store: null, tz: TZ,
  });
  return { r, i };
}

test('Runner: in einer geplanten Viertelstunde lädt die Wallbox für das Auto-Ziel (Silent: nur simuliert)', async () => {
  const { r } = runner();
  const plan = carPlan({ schedule: weekdays(true), nowMs: tue(18), tz: TZ, soc: 40, capacityKwh: 60, powerKw: (16 * 3 * 230) / 1000, slots: slots() });
  await r.tickCharger(plan.starts[0] + 60000);
  assert.equal(r.carCurrent.state, 'planned');
  assert.equal(r.carCurrent.wantOn, true);
  assert.equal(r.chargerCurrent.mine.mode, 'instant_ev');
  assert.match(r.chargerCurrent.mine.reason, /^Auto-Ziel 80 %/);
  assert.equal(r.chargerCurrent.live, false, 'Silent-Modus: nichts gesendet');
});

test('Runner: ohne angestecktes Auto oder mit erreichtem Ziel wird nicht geladen', async () => {
  const plan = carPlan({ schedule: weekdays(true), nowMs: tue(18), tz: TZ, soc: 40, capacityKwh: 60, powerKw: 11.04, slots: slots() });
  const away = runner({ connected: false });
  await away.r.tickCharger(plan.starts[0] + 60000);
  assert.notEqual(away.r.chargerCurrent.mine.mode, 'instant_ev');
  assert.equal(away.r.carCurrent.connected, false);
  const full = runner({ soc: 85 });
  await full.r.tickCharger(plan.starts[0] + 60000);
  assert.equal(full.r.carCurrent.state, 'reached');
  assert.notEqual(full.r.chargerCurrent.mine.mode, 'instant_ev');
});

// ---------------------------------------------------------------- Oberfläche

async function ui(car, carState) {
  const emsJs = fs.readFileSync(path.join(__dirname, '../settings/ems.js'), 'utf8');
  const els = new Map();
  const handlers = {};
  const el = (id) => { if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '', value: '', checked: false, hidden: false, classList: { contains: () => true, toggle() {} }, addEventListener: (t, f) => { handlers[`${id}:${t}`] = f; } }); return els.get(id); };
  const ctx = { document: { getElementById: el }, window: {}, setInterval: () => 0, console, Object, Promise, Date, Number, isFinite, String, JSON, Math };
  vm.createContext(ctx);
  vm.runInContext(emsJs, ctx);
  const config = normalizeConfig({ enabled: true, devices: { meter: { id: 'em' } }, charger: { id: 'wb' }, car });
  const calls = [];
  const res = {
    'GET /ems/shadow': { enabled: true, deviceExists: true, shadow: true, config, pv: {}, current: null, charger: { current: null }, car: carState },
    'GET /ems/consumers': { current: [], events: [] }, 'GET /ems/flows': { flows: [] }, 'GET /meters': null,
    'GET /ems/devices': { devices: [{ id: 'car', name: 'Auto', cls: 'car', caps: ['measure_battery'] }] },
    'PUT /ems/config': (b) => normalizeConfig({ ...config, ...b }),
  };
  await ctx.window.EmsUi.init((m, p, b) => { calls.push([m, p, b]); const x = res[`${m} ${p}`]; return Promise.resolve(typeof x === 'function' ? x(b) : x); }, 'de');
  return { ctx, els, el, handlers, calls };
}

test('Anzeige: Auto-Karte unter «Heute» mit Ladestand, nächstem Ziel, Status; «Nächste Abfahrt» speichert ein Überschreiben für morgen', async () => {
  const car = { deviceId: 'car', capacityKwh: 60, schedule: weekdays(true) };
  const state = { state: 'planned', soc: 40, connected: true, needKwh: 24, starts: [wed(0), wed(0, 15)], departure: { at: wed(6), soc: 80, source: 'calendar', date: '2026-11-11' } };
  const u = await ui(car, state);
  const html = u.els.get('ems-view-main').innerHTML;
  assert.match(html, /E-AUTO/);
  assert.match(html, /<b>40 %<\/b>/);
  assert.match(html, /Nächstes Ziel: 80 % bis/);
  assert.match(html, /\(Kalender\)/);
  assert.match(html, /Geplant: 00:00 - 00:30 \(24 kWh\)/);
  assert.match(html, /Nächste Abfahrt \(überschreibt den Kalender\)/);
  // Eingaben und Übernehmen
  const change = (f, value, checked) => u.handlers['ems-view-main:change']({ target: { getAttribute: (n) => (n === 'data-ems-carf' ? f : null), value, checked, parentNode: null } });
  change('time', '07:30');
  change('soc', '60');
  u.handlers['ems-view-main:click']({ target: { getAttribute: (n) => (n === 'data-ems-car' ? 'save' : null), parentNode: null } });
  await new Promise((r) => setTimeout(r, 20));
  const put = u.calls.find((c) => c[0] === 'PUT' && c[1] === '/ems/config');
  const o = put[2].car.schedule.override;
  assert.equal(o.time, '07:30');
  assert.equal(o.soc, 60);
  assert.equal(o.on, true);
  assert.match(o.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(put[2].car.deviceId, 'car', 'restliche Auto-Einstellungen bleiben');
  assert.equal(put[2].car.schedule.days.mon.on, true, 'Kalender bleibt');
});

test('Anzeige: Einrichten → E-Auto zeigt den Wochenkalender, Ferien und «Netz nachladen» (Standard an); ohne Auto keine Karte', async () => {
  const u = await ui({ deviceId: 'car', capacityKwh: 60 }, null);
  u.handlers['ems-view-devices:click']({ target: { getAttribute: (n) => (n === 'data-ems-open' ? 'src-car' : null), parentNode: null } });
  const html = u.els.get('ems-view-devices').innerHTML;
  assert.match(html, /Wochenkalender \(Abfahrt und Ziel-Ladestand\)/);
  for (const d of ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']) assert.match(html, new RegExp('<td>' + d + '</td>'));
  assert.match(html, /Ferien: Kalender pausiert/);
  assert.match(html, /id="ems-car-grid" type="checkbox" checked/);
  // Kalender speichern: Mo an, 05:45, 90 %
  u.el('ems-car-mon-on').checked = true;
  u.el('ems-car-mon-time').value = '05:45';
  u.el('ems-car-mon-soc').value = '90';
  u.el('ems-car-grid').checked = true;
  const body = u.ctx.window.EmsUi._collect().ems.car;
  assert.deepEqual(JSON.parse(JSON.stringify(body.schedule.days.mon)), { on: true, time: '05:45', soc: 90 });
  assert.equal(body.schedule.days.tue.on, false);
  assert.equal(body.schedule.gridCharge, true);
  const none = await ui({}, null);
  assert.doesNotMatch(none.els.get('ems-view-main').innerHTML, /E-AUTO/);
});
