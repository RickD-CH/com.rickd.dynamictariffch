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
  const i = { gridW: 300, houseW: 300, pvW: 0, batterySoc: null, batteryW: 0, chargerRead: true, chargerConnected: connected, chargerPowerW: 0, chargerPhases: 3, carSoc: soc, other: null };
  const r = new EmsRunner({
    getConfig: () => config, prices: new PriceFeed(() => ({ priceStore })), pv: new PvFeed(null, () => {}),
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
  const ctx = { document: { getElementById: el }, window: {}, setInterval: () => 0, setTimeout, clearTimeout, console, Object, Promise, Date, Number, isFinite, String, JSON, Math };
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

test('Anzeige: «Heute» zeigt eine kurze Auto-Zeile; «Ausblick» die Auto-Karte mit Status und «Heute/Morgen», das ein Übersteuern speichert', async () => {
  const car = { deviceId: 'car', capacityKwh: 60, schedule: weekdays(true) };
  const state = { state: 'planned', soc: 40, connected: false, needKwh: 24, starts: [wed(0), wed(0, 15)], departure: { at: wed(6), soc: 80, source: 'calendar', date: '2026-11-11' } };
  const u = await ui(car, state);
  const today = u.els.get('ems-view-main').innerHTML;
  assert.match(today, /id="ems-car-line"/);
  assert.match(today, /<p class="lbl">E-AUTO<\/p><div class="ems-list"><div class="ems-item" id="ems-car-line">/, 'eigener Abschnitt E-Auto');
  assert.match(today, /Auto 40 % <span class="car-badge"[^>]*>nicht angesteckt<\/span><\/span>/, 'Name, Ladestand und Zustand als Badge');
  assert.match(today, /80 % bis .* - Geplant 00:00-00:30<\/span>/, 'Zustand nicht mehr im Text');
  assert.doesNotMatch(today, /data-ems-carf|Wochenvorlage/, 'kein Formular unter «Heute»');
  const plan = u.els.get('ems-view-plan').innerHTML;
  assert.match(plan, /E-AUTO/);
  assert.match(plan, /<b>Auto 40 %<\/b><span class="car-badge"[^>]*>nicht angesteckt<\/span>/, 'Name, Ladestand und Badge');
  assert.match(plan, /Nächstes Ziel: 80 % bis .*\(Vorlage\)/);
  assert.match(plan, /Geplant: 00:00 - 00:30 \(24 kWh\)/);
  assert.ok(plan.indexOf('Heute oder morgen anders') < plan.indexOf('Wochenvorlage (Mo bis So)'), '«Heute/Morgen» oben, Vorlage darunter');
  const change = (f, value, checked) => u.handlers['ems-view-plan:change']({ target: { getAttribute: (n) => (n === 'data-ems-carf' ? f : null), value, checked, parentNode: null } });
  change('time', '07:30');
  change('soc', '60');
  u.handlers['ems-view-plan:click']({ target: { getAttribute: (n) => (n === 'data-ems-car' ? 'save' : null), parentNode: null } });
  await new Promise((r) => setTimeout(r, 20));
  const put = u.calls.find((c) => c[0] === 'PUT' && c[1] === '/ems/config');
  const o = put[2].car.schedule.override;
  assert.equal(o.time, '07:30');
  assert.equal(o.soc, 60);
  assert.equal(o.on, true);
  assert.match(o.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(put[2].car.deviceId, 'car', 'restliche Auto-Einstellungen bleiben');
  assert.equal(put[2].car.schedule.days.mon.on, true, 'Vorlage bleibt');
});

test('Anzeige: Wochenvorlage einklappbar unter «Ausblick», je Tag eigenes Ziel; jede Änderung wird sofort gespeichert und behält «Heute/Morgen»', async () => {
  const car = { deviceId: 'car', capacityKwh: 60, schedule: { ...weekdays(true), override: { date: '2026-11-11', on: true, time: '07:00', soc: 70 } } };
  const u = await ui(car, null);
  let plan = u.els.get('ems-view-plan').innerHTML;
  assert.match(plan, /<details class="ems-adv car-tpl"><summary data-ems-carcalopen="1">Wochenvorlage \(Mo bis So\) <span id="ems-carcal-st"/, 'eingeklappt');
  assert.doesNotMatch(plan, /Vorlage speichern|Verwerfen/, 'kein Speichern-Knopf mehr');
  for (const d of ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']) assert.match(plan, new RegExp('<td>' + d + '</td>'));
  assert.match(plan, /Ferien: keine Ladeziele \(Solar lädt weiter\)/);
  assert.match(plan, /data-ems-carcal="grid" checked/, 'Netz nachladen standardmässig an');
  // Freitag: anderes Ziel, Samstag einschalten
  const change = (cc, value, checked) => u.handlers['ems-view-plan:change']({ target: { getAttribute: (n) => (n === 'data-ems-carcal' ? cc : null), value, checked, parentNode: null } });
  change('fri:soc', '100');
  change('fri:time', '05:30');
  change('sat:on', null, true);
  change('sat:time', '09:00');
  u.ctx.window.EmsUi._render();
  plan = u.els.get('ems-view-plan').innerHTML;
  assert.match(plan, /data-ems-carcal="fri:soc" value="100"/, 'noch nicht gespeicherte Änderung übersteht das Neuzeichnen');
  assert.equal(u.calls.filter((c) => c[0] === 'PUT').length, 0, 'mehrere schnelle Änderungen werden gebündelt');
  await new Promise((r) => setTimeout(r, 650));
  const puts = u.calls.filter((c) => c[0] === 'PUT' && c[1] === '/ems/config');
  assert.equal(puts.length, 1, 'ein Speichern für vier Änderungen');
  const put = puts[0];
  const sc = put[2].car.schedule;
  assert.deepEqual(JSON.parse(JSON.stringify(sc.days.fri)), { on: true, time: '05:30', soc: 100 });
  assert.deepEqual(JSON.parse(JSON.stringify(sc.days.sat)), { on: true, time: '09:00', soc: 80 });
  assert.equal(sc.days.mon.soc, 80);
  assert.equal(sc.override.time, '07:00', '«Heute/Morgen» bleibt beim Speichern der Vorlage');
  // Einrichten: nur noch Gerät, Wert, Grösse und Hinweis
  u.handlers['ems-view-devices:click']({ target: { getAttribute: (n) => (n === 'data-ems-open' ? 'src-car' : null), parentNode: null } });
  const setup = u.els.get('ems-view-devices').innerHTML;
  assert.match(setup, /unter «Ausblick» ein/);
  assert.doesNotMatch(setup, /data-ems-carcal/);
  const none = await ui({}, null);
  assert.doesNotMatch(none.els.get('ems-view-main').innerHTML + none.els.get('ems-view-plan').innerHTML, /E-AUTO|ems-car-line/);
});

test('Anzeige: Ferien-Schalter sichtbar unter der eingeklappten Vorlage; aktive Ferien stehen auf der Karte und unter «Heute»', async () => {
  const u = await ui({ deviceId: 'car', capacityKwh: 60, schedule: { ...weekdays(true), holiday: true, holidayUntil: '2099-11-20' } }, null);
  const plan = u.els.get('ems-view-plan').innerHTML;
  const detailsEnd = plan.indexOf('</details>', plan.indexOf('car-tpl'));
  assert.ok(plan.indexOf('data-ems-carcal="holiday"') > detailsEnd, 'Ferien nicht mehr in der eingeklappten Vorlage');
  assert.match(plan, /data-ems-carcal="holiday" checked/);
  assert.match(plan, /Ferien bis 20\.11\./);
  assert.match(u.els.get('ems-view-main').innerHTML, /Ferien bis 20\.11\./);
  const open = await ui({ deviceId: 'car', capacityKwh: 60, schedule: { ...weekdays(true), holiday: true } }, null);
  assert.match(open.els.get('ems-view-plan').innerHTML, /Ferien bis ausgeschaltet/);
  const past = await ui({ deviceId: 'car', capacityKwh: 60, schedule: { ...weekdays(true), holiday: true, holidayUntil: '2020-01-01' } }, null);
  assert.doesNotMatch(past.els.get('ems-view-plan').innerHTML, /Ferien bis/, 'abgelaufene Ferien zeigen nichts');
});

test('carPlan: Abfahrt weit hinter den bekannten Preisen - nur den Anteil der bekannten Zeit belegen, Rest wenn neue Preise da sind', () => {
  // Bekannt sind Di und Mi; Abfahrt erst Freitag 06:00 (nur Freitag aktiv)
  const fri = { days: { fri: { on: true, time: '06:00', soc: 80 } } };
  const known = slots().map((s) => ({ ...s, price: s.price === 10 ? 10 : 25 + ((s.start / Q) % 4) }));
  const r = carPlan({ schedule: fri, nowMs: tue(8), tz: TZ, soc: 20, capacityKwh: 60, powerKw: 11, slots: known });
  assert.equal(r.state, 'planned');
  assert.ok(r.plan.patient);
  assert.ok(r.starts.length > 0 && r.starts.length < Math.ceil((36 / 11) * 4), 'nicht alles im Voraus');
  assert.ok(r.starts.every((t) => known.find((s) => s.start === t).price === 10), 'nur die günstigen Nachtstunden');
  assert.match(r.reason, /Rest wenn neue Preise da sind/);
  // Abfahrt morgen früh (Lücke unter 12 h): normale Planung wie bisher
  const soon = carPlan({ schedule: weekdays(true), nowMs: tue(18), tz: TZ, soc: 40, capacityKwh: 60, powerKw: 11, slots: slots() });
  assert.ok(!soon.plan.patient);
});

// ---------------------------------------------------------------- Auf neue Preise warten (Abfahrt hinter den bekannten Preisen, aber unter 12 h)

/** Preise bis Mitternacht wie am echten Tag (23.11.2026): tags um 27 Rp., abends fallend bis 22.5 Rp. */
function knownToMidnight(from) {
  const evening = { 22: [29.67, 28.63, 27, 25.7], 23: [25.3, 24.97, 24, 22.49] };
  const out = [];
  for (let t = from; t < tue(24); t += Q) {
    const lp = new Date(t);
    const h = Number(lp.toLocaleString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }));
    const q = Math.floor(Number(lp.toLocaleString('en-GB', { timeZone: TZ, minute: '2-digit' })) / 15);
    const price = evening[h] ? evening[h][q] : (h === 12 && q >= 2 ? 27.3 : 30 + (h % 5));
    out.push({ start: t, end: t + Q, price });
  }
  return out;
}

test('carPlan: Preise reichen nicht bis zur Abfahrt - jetzt nur klar günstige Viertelstunden (bis 10 % über der günstigsten), den Rest später', () => {
  const known = knownToMidnight(tue(10, 45));
  const r = carPlan({ schedule: weekdays(true), nowMs: tue(10, 45), tz: TZ, soc: 40, capacityKwh: 52, powerKw: 11.04, slots: known });
  assert.equal(r.state, 'planned');
  assert.ok(r.plan.patient, 'nicht alles jetzt');
  const prices = r.starts.map((t) => known.find((s) => s.start === t).price);
  assert.ok(prices.every((p) => p <= 22.49 * 1.1 + 1e-9), `nur Preise bis 24.7 Rp.: ${prices}`);
  assert.ok(!r.starts.includes(tue(12, 30)), 'das Mittagsloch (27 Rp.) ist nicht klar günstig');
  assert.ok(r.starts.length < r.plan.need, 'der Rest folgt mit den neuen Preisen');
  assert.match(r.reason, /Rest wenn neue Preise da sind/);
});

test('carPlan: ist die noch unbekannte Zeit zu kurz für den Rest, wird der Rest aus den bekannten Preisen erzwungen', () => {
  // 12 h Bedarf (48 Viertelstunden) bei nur 6 h Frist hinter den bekannten Preisen (24 Viertelstunden unbekannt): 24 müssen jetzt gewählt werden
  const known = knownToMidnight(tue(18));
  const r = carPlan({ schedule: weekdays(true), nowMs: tue(18), tz: TZ, soc: 0, capacityKwh: 158, powerKw: 11.04, slots: known });
  assert.ok(r.plan.need > 24 && r.plan.need <= 48, `Bedarf ${r.plan.need}`);
  assert.ok(r.starts.length >= r.plan.need - 24, `mindestens 24 jetzt (nur 24 bekannt): ${r.starts.length}`);
});

test('carPlan: sind die Preise bis zur Abfahrt bekannt, gilt weiter die günstigsten Viertelstunden insgesamt', () => {
  const r = carPlan({ schedule: weekdays(true), nowMs: tue(18), tz: TZ, soc: 40, capacityKwh: 60, powerKw: 11, slots: slots() });
  assert.ok(!r.plan.patient);
  assert.equal(r.starts.length, r.plan.need);
});
