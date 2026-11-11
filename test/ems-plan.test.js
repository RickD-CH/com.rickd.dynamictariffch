'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PlanLog } = require('../lib/ems/PlanLog');
const { buildPlan, levelOf } = require('../lib/ems/PlanView');
const { startOfLocalDay, addLocalDays } = require('../lib/time');
const { normalizeConfig } = require('../lib/ems/Config');

const TZ = 'Europe/Zurich';
const Q = 15 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 10, 10, 7); // 11:07 Zürich (Winterzeit)
const day0 = startOfLocalDay(new Date(NOW), TZ).getTime();
const day1 = addLocalDays(new Date(NOW), 1, TZ).getTime();
const day2 = addLocalDays(new Date(NOW), 2, TZ).getTime();

/** Preise: 20 Rp., von 13:00 bis 15:00 Ortszeit 5 Rp. (günstigster 2-h-Block), abends 40 Rp. */
function prices(from, to, withBlock = true) {
  const out = [];
  for (let t = from; t < to; t += Q) {
    const h = (t - from) / 3600000;
    let price = 20;
    if (withBlock && h >= 13 && h < 15) price = 5;
    if (h >= 18 && h < 20) price = 40;
    out.push({ start: t, end: t + Q, price });
  }
  return out;
}
const memStore = () => { const m = new Map(); return { get: (k) => m.get(k), set: (k, v) => m.set(k, JSON.parse(JSON.stringify(v))), m }; };

// ---------------------------------------------------------------- PlanLog

test('PlanLog: eine Viertelstunde = ein Eintrag, aktivster Wallbox-Modus gewinnt, Verbraucher "war an" bleibt', () => {
  const store = memStore();
  const log = new PlanLog(store);
  const t = NOW - (NOW % Q);
  log.record({ nowMs: t + 1000, charger: { mode: 'holding', powerW: 0 }, consumers: [{ id: 'dry', isOn: false }] });
  log.record({ nowMs: t + 60000, charger: { mode: 'solar_ev', powerW: 1400 }, consumers: [{ id: 'dry', isOn: true }] });
  log.record({ nowMs: t + 120000, charger: { mode: 'idle', powerW: 0 }, consumers: [{ id: 'dry', isOn: false }], battery: 'hold' });
  assert.equal(log.entries.length, 1);
  assert.deepEqual(log.entries[0], { t, c: 'solar_ev', w: 1400, b: 'hold', k: { dry: 1 } });
  log.record({ nowMs: t + Q + 5000, charger: { mode: 'idle' } });
  assert.equal(log.entries.length, 2);
  assert.equal(log.entries[1].c, 'idle');
});

test('PlanLog: speichert nicht bei jedem Lauf, behält nur ~49 Stunden, lädt gespeicherte Einträge', () => {
  const store = memStore();
  let sets = 0;
  const counting = { get: store.get, set: (k, v) => { sets += 1; store.set(k, v); } };
  const log = new PlanLog(counting);
  const t = NOW - (NOW % Q);
  for (let s = 0; s < 14; s++) log.record({ nowMs: t + s * 15000, charger: { mode: 'idle' } });
  assert.ok(sets <= 2, 'höchstens ein paar Schreibvorgänge in 3.5 Minuten: ' + sets);
  log.flush(t + 300000);
  assert.equal(store.get('planLog').length, 1);
  // alte Einträge verfallen
  log.record({ nowMs: t - 50 * 3600000, charger: { mode: 'idle' } }); // sehr alt: wird sofort wieder entfernt
  log.record({ nowMs: t + 3 * Q, charger: { mode: 'idle' } });
  assert.ok(log.entries.every((e) => e.t >= t - 49 * 3600000 + 3 * Q - 3600000));
  const again = new PlanLog(store);
  assert.ok(again.entries.length >= 1);
  assert.equal(new PlanLog({ get: () => 'kaputt', set: () => {} }).entries.length, 0);
});

// ---------------------------------------------------------------- buildPlan

function plan(extra = {}) {
  return buildPlan({
    nowMs: NOW, tz: TZ, priceSlots: [...prices(day0, day1), ...prices(day1, day2)],
    pvSlots: null, batteryPlan: null, reserveHours: 0, log: [], chargerEnabled: false, consumers: [], hasBattery: false,
    ...extra,
  });
}

test('buildPlan: heute und morgen im Viertelstunden-Raster, Preisniveau, günstigster 2-h-Block ab jetzt', () => {
  const p = plan();
  assert.deepEqual(p.days.map((d) => d.key), ['today', 'tomorrow']);
  const d = p.days[0];
  assert.equal(d.slots.length, 96);
  assert.equal(d.slots[0].t, day0);
  const at = (h) => d.slots[h * 4];
  assert.equal(at(13).level, 'cheap');
  assert.equal(at(19).level, 'expensive');
  assert.equal(at(9).level, 'normal');
  assert.deepEqual(d.stats.cheapestBlock && [d.stats.cheapestBlock.from, d.stats.cheapestBlock.to, d.stats.cheapestBlock.avg, d.stats.cheapestBlock.n], [day0 + 13 * 3600000, day0 + 15 * 3600000, 5, 8]);
  assert.equal(d.stats.min, 5);
  assert.equal(d.stats.max, 40);
  assert.deepEqual(d.ticks.slice(0, 3), [{ i: 0, label: '0' }, { i: 12, label: '3' }, { i: 24, label: '6' }]);
});

test('buildPlan: morgen erscheint erst, wenn Preise da sind; Block liegt nie in der Vergangenheit', () => {
  const only = plan({ priceSlots: prices(day0, day1) });
  assert.deepEqual(only.days.map((d) => d.key), ['today']);
  // Der günstigste Block des Tages liegt vor jetzt: dann zählt nur, was noch kommt
  const early = plan({ priceSlots: prices(day0, day1).map((s) => ({ ...s, price: s.start >= day0 + 2 * 3600000 && s.start < day0 + 4 * 3600000 ? 1 : s.price })) });
  assert.ok(early.days[0].stats.cheapestBlock.from >= early.nowQ);
});

test('buildPlan: Zeitumstellung (92 und 100 Viertelstunden) und fehlende Preise', () => {
  const springNow = Date.UTC(2027, 2, 28, 10, 0); // 28.3.2027, Umstellung auf Sommerzeit
  const s0 = startOfLocalDay(new Date(springNow), TZ).getTime();
  const s1 = addLocalDays(new Date(springNow), 1, TZ).getTime();
  const spring = buildPlan({ nowMs: springNow, tz: TZ, priceSlots: prices(s0, s1), pvSlots: null, batteryPlan: null, log: [], consumers: [] });
  assert.equal(spring.days[0].slots.length, 92);
  const autNow = Date.UTC(2026, 9, 25, 10, 0);
  const a0 = startOfLocalDay(new Date(autNow), TZ).getTime();
  const a1 = addLocalDays(new Date(autNow), 1, TZ).getTime();
  assert.equal(buildPlan({ nowMs: autNow, tz: TZ, priceSlots: prices(a0, a1), log: [], consumers: [] }).days[0].slots.length, 100);
  const none = buildPlan({ nowMs: NOW, tz: TZ, priceSlots: [], log: [], consumers: [] });
  assert.equal(none.days[0].stats.min, null);
  assert.equal(none.days[0].stats.cheapestBlock, null);
  assert.equal(levelOf(null, 10), 'normal');
  assert.equal(levelOf(5, 0), 'normal');
});

test('buildPlan: PV-Prognose pro Viertelstunde, null wenn veraltet', () => {
  const pvSlots = [];
  for (let h = 8; h < 16; h++) pvSlots.push({ end: day0 + (h + 1) * 3600000, kw: h === 12 ? 4 : 1, h: 1 });
  const d = plan({ pvSlots }).days[0];
  assert.equal(d.slots[12 * 4].pvKw, 4);
  assert.equal(d.slots[12 * 4 + 3].pvKw, 4);
  assert.equal(d.slots[2 * 4].pvKw, 0);
  assert.equal(d.stats.pvKwh, 11);
  assert.equal(plan({ pvSlots: null }).days[0].slots[48].pvKw, null);
  assert.equal(plan({ pvSlots: null }).days[0].stats.pvKwh, null);
});

test('buildPlan: Batterie = Verlauf bis jetzt, ab jetzt der Plan (geplant), Halten nur mit Reserve-Stunden', () => {
  const batteryPlan = {
    mode: 'hold',
    chargeSlots: [{ start: day0 + 13 * 3600000, end: day0 + 13.25 * 3600000, price: 5 }, { start: day0 + 13.25 * 3600000, end: day0 + 13.5 * 3600000, price: 5 }],
    reserveSlots: [{ start: day0 + 19 * 3600000, end: day0 + 19.25 * 3600000, price: 40 }],
  };
  const log = [{ t: day0 + 3 * 3600000, b: 'charge' }, { t: day0 + 8 * 3600000, b: 'normal' }];
  const d = plan({ hasBattery: true, batteryPlan, reserveHours: 6, log }).days[0];
  const row = d.rows.find((r) => r.id === 'battery');
  assert.deepEqual(row.cells[3 * 4], { state: 'charge', planned: false });
  assert.deepEqual(row.cells[8 * 4], { state: 'normal', planned: false });
  assert.deepEqual(row.cells[5 * 4], { state: null, planned: false }, 'kein Verlauf = leer');
  assert.deepEqual(row.cells[Math.floor((NOW - day0) / Q)], { state: 'hold', planned: false }, 'jetzt = aktueller Entscheid');
  assert.deepEqual(row.cells[13 * 4], { state: 'charge', planned: true });
  assert.deepEqual(row.cells[19 * 4], { state: 'normal', planned: true });
  assert.deepEqual(row.cells[16 * 4], { state: 'hold', planned: true });
  // ohne Reserve-Stunden gibt es kein Halten
  const none = plan({ hasBattery: true, batteryPlan, reserveHours: 0 }).days[0].rows[0];
  assert.deepEqual(none.cells[16 * 4], { state: 'normal', planned: true });
  // ohne Batterie keine Zeile; ohne Plan nur Verlauf
  assert.equal(plan().days[0].rows.length, 0);
  const noPlan = plan({ hasBattery: true, batteryPlan: null, log }).days[0].rows[0];
  assert.deepEqual(noPlan.cells[16 * 4], { state: null, planned: false });
});

test('buildPlan: Wallbox und Verbraucher zeigen nur den Verlauf, nie einen Plan', () => {
  const log = [
    { t: day0 + 10 * 3600000, c: 'solar_ev', w: 3000, k: { dry: 1 } },
    { t: day0 + 10.25 * 3600000, c: 'holding', k: { dry: 0 } },
  ];
  const d = plan({ chargerEnabled: true, consumers: [{ id: 'dry', name: 'Entfeuchter' }], log }).days[0];
  const ch = d.rows.find((r) => r.kind === 'charger');
  const co = d.rows.find((r) => r.kind === 'consumer');
  assert.deepEqual(ch.cells[40], { state: 'solar_ev', powerW: 3000, planned: false });
  assert.equal(ch.cells[41].state, 'holding');
  assert.equal(co.name, 'Entfeuchter');
  assert.deepEqual(co.cells[40], { state: 'on', planned: false });
  assert.deepEqual(co.cells[41], { state: 'off', planned: false });
  assert.ok(ch.cells.slice(50).every((c) => c.state === null && c.planned === false), 'Zukunft bleibt leer');
  assert.ok(co.cells.slice(50).every((c) => c.state === null));
  const tomorrow = plan({ chargerEnabled: true, log }).days[1];
  assert.ok(tomorrow.rows[0].cells.every((c) => c.state === null));
});

// ---------------------------------------------------------------- Anzeige

const emsJs = fs.readFileSync(path.join(__dirname, '../settings/ems.js'), 'utf8');

function makeEnv(responses) {
  const els = new Map();
  const handlers = {};
  const el = (id) => {
    if (!els.has(id)) {
      els.set(id, { id, innerHTML: '', textContent: '', value: '', checked: false, hidden: false, classList: { contains: () => true, toggle: () => {} }, addEventListener: (t, f) => { handlers[`${id}:${t}`] = f; } });
    }
    return els.get(id);
  };
  const ctx = { document: { getElementById: el }, window: {}, setInterval: () => 0, console, Object, Promise, Date, Number, isFinite, String, JSON, Math };
  vm.createContext(ctx);
  vm.runInContext(emsJs, ctx);
  const api = (method, p) => Promise.resolve(responses[`${method} ${p}`]);
  return { ctx, els, handlers, api };
}

async function startUi(planResponse, lang = 'de') {
  const config = normalizeConfig({ enabled: true, battery: { deviceId: 'bat' }, charger: { id: 'wb' }, consumers: [{ id: 'dry', name: 'Entfeuchter' }] });
  const env = makeEnv({
    'GET /ems/shadow': { enabled: true, deviceExists: true, shadow: true, config, pv: {}, current: { mine: { mode: 'hold' }, errors: [] }, charger: { current: { live: false, mine: { mode: 'idle', reason: 'x' }, connected: false } } },
    'GET /ems/consumers': { current: [], events: [] },
    'GET /ems/devices': { devices: [] },
    'GET /meters': null,
    'GET /ems/plan': planResponse,
  });
  await env.ctx.window.EmsUi.init(env.api, lang);
  return env;
}

test('Anzeige: Plan unter dem Betrieb mit Preis, Solar, Zeilen, Tabs Heute/Morgen und "jetzt"-Linie', async () => {
  const p = {
    ...plan({
      hasBattery: true, chargerEnabled: true, consumers: [{ id: 'dry', name: 'Entfeuchter' }], reserveHours: 6,
      pvSlots: [{ end: day0 + 13 * 3600000, kw: 3, h: 1 }],
      batteryPlan: { mode: 'hold', chargeSlots: [{ start: day0 + 13 * 3600000, end: day0 + 13.25 * 3600000, price: 5 }], reserveSlots: [] },
      log: [{ t: day0 + 10 * 3600000, c: 'solar_ev', w: 2000, k: { dry: 1 } }],
    }),
    active: true, dryRun: { charger: true, consumers: ['dry'] },
  };
  const env = await startUi(p);
  const html = env.els.get('ems-view-plan').innerHTML;
  assert.match(html, /PLAN/);
  assert.match(html, /id="ems-plan"/);
  assert.match(html, />Heute</);
  assert.match(html, />Morgen</);
  assert.equal((html.match(/class="pl-svg"/g) || []).length, 5, 'Preis, Solar, Batterie, Wallbox, Entfeuchter');
  assert.match(html, /Batterie \(Plan\)/);
  assert.match(html, /Wallbox \(Verlauf\) - simuliert/);
  assert.match(html, /Entfeuchter - simuliert/);
  assert.match(html, /class="pl-now"/);
  assert.match(html, /Günstigster Block \(2 h\)/);
  assert.match(html, /13:00 - 15:00/);
  assert.match(html, /stroke-dasharray/, 'geplante Batterie-Abschnitte gestrichelt');
  assert.doesNotMatch(html, /undefined|NaN/);
  // Morgen: keine "jetzt"-Linie
  env.handlers['ems-view-plan:click']({ target: { getAttribute: (n) => (n === 'data-ems-planday' ? 'tomorrow' : null), parentNode: null } });
  const tomorrow = env.els.get('ems-view-plan').innerHTML;
  assert.doesNotMatch(tomorrow, /class="pl-now"/);
  assert.match(tomorrow, /subtab active" data-ems-planday="tomorrow"/);
});

test('Anzeige: ohne Plan-Daten oder ohne Preise kein Absturz, englische Texte', async () => {
  const none = await startUi(undefined);
  assert.doesNotMatch(none.els.get('ems-view-plan').innerHTML, /ems-plan/);
  const noPrices = await startUi({ ...buildPlan({ nowMs: NOW, tz: TZ, priceSlots: [], log: [], consumers: [] }), dryRun: {} });
  assert.match(noPrices.els.get('ems-view-plan').innerHTML, /Für diesen Tag sind noch keine Preise da/);
  const en = await startUi({ ...plan(), dryRun: {} }, 'en');
  assert.match(en.els.get('ems-view-plan').innerHTML, /Cheapest block \(2 h\)/);
});

test('Anzeige: Legende unter jeder Grafik, Tabelle ab jetzt über beide Tage mit Preisniveau und Zuständen', async () => {
  const p = {
    ...plan({
      hasBattery: true, chargerEnabled: true, consumers: [{ id: 'dry', name: 'Entfeuchter' }], reserveHours: 6,
      pvSlots: [{ end: day0 + 12 * 3600000, kw: 3, h: 1 }],
      batteryPlan: { mode: 'hold', chargeSlots: [{ start: day0 + 13 * 3600000, end: day0 + 13.25 * 3600000, price: 5 }, { start: day0 + 13.25 * 3600000, end: day0 + 13.5 * 3600000, price: 5 }, { start: day1 + 2 * 3600000, end: day1 + 2.25 * 3600000, price: 5 }], reserveSlots: [] },
      log: [{ t: day0 + 10 * 3600000, c: 'solar_ev', w: 2000, k: { dry: 1 }, p: 2500, pn: 3 }, { t: day0 + 10.25 * 3600000, c: 'solar_ev', w: 2000, k: { dry: 1 }, p: 2600, pn: 3 }],
    }),
    active: true, dryRun: {},
  };
  const env = await startUi(p);
  const html = env.els.get('ems-view-plan').innerHTML;
  const at = (s, from = 0) => html.indexOf(s, from);
  // je Grafik eine eigene Legende, direkt nach ihrer Grafik
  assert.equal((html.match(/class="pl-leg"/g) || []).length, 5, 'Preis, Solar, Batterie, Wallbox, Entfeuchter');
  const priceSvg = at('<svg class="pl-svg" viewBox="0 0 960 80"');
  assert.ok(at('class="pl-leg"', priceSvg) > priceSvg && at('class="pl-leg"', priceSvg) < at('Solar-Prognose'), 'Preis-Legende vor dem Solar-Titel');
  const batLabel = at('Batterie (Plan)');
  assert.ok(at('Netzladen', batLabel) > batLabel && at('Netzladen', batLabel) < at('Wallbox (Verlauf)'), 'Batterie-Legende zwischen Batterie- und Wallbox-Grafik');
  assert.ok(at('Prognose</span><span>') > 0 || at('>Prognose<') > 0 || html.includes('Prognose'), 'Solar-Legende');
  assert.doesNotMatch(html.slice(0, at('class="ems-cards"')).split('class="pl-axis"')[1] || '', /class="pl-leg"/, 'keine gesammelte Legende mehr nach der Zeitachse');
  // Tabelle
  const table = html.slice(at('class="ems-t pl-tab"'));
  assert.match(html, /AB JETZT: WANN PASSIERT WAS/);
  assert.ok(table.includes('<span class="ems-s">Mi</span> '), 'morgen ist dabei, mit kurzem Wochentag (10.11.2026 ist ein Dienstag)');
  assert.ok(table.includes('<span class="pl-chip pl-chip-plan">Batterie: Laden</span>'), 'kurzer Text, geplant = gestrichelter Rahmen');
  assert.ok(table.includes('title="Batterie: Laden (geplant)"'), 'voller Text als Tooltip');
  assert.ok(table.includes('13:00-13:30'));
  assert.match(table, /class="pl-cur"/, 'aktuelle Zeile');
  assert.match(table, /pl-dot pl-c/, 'Preisniveau als Punkt');
  assert.doesNotMatch(table.slice(0, table.indexOf('</table>')), /undefined|NaN/);
  assert.ok(!table.includes('10:00-10:30'), 'Vergangenes steht nicht in der Tabelle');
  // Eine Zeile je Eintrag: kein Umbruch in den Zellen, zu langer Inhalt wird gekürzt
  assert.ok(html.includes('.pl-tab td{white-space:nowrap}'));
  assert.ok(html.includes('.pl-tab td.pl-what{max-width:0;width:100%;overflow:hidden;text-overflow:ellipsis}'));
  assert.ok(!table.includes('(Entladung gesperrt)'), 'keine langen Texte in der Tabelle');
});

test('Anzeige: Solar-Grafik zeigt mit einer Linie, was die Anlage bisher geliefert hat, plus Kennzahl', async () => {
  const log = [];
  for (let q = 0; q < 8; q++) log.push({ t: day0 + 9 * 3600000 + q * Q, p: 1000 + q * 500, pn: 5 });
  const p = { ...plan({ pvSlots: [{ end: day0 + 12 * 3600000, kw: 3, h: 3 }], log }), dryRun: {} };
  const day = p.days[0];
  assert.equal(day.slots[9 * 4].pvActualKw, 1);
  assert.equal(day.slots[9 * 4 + 7].pvActualKw, 4.5);
  assert.equal(day.slots[11 * 4].pvActualKw, null);
  assert.equal(day.stats.pvActualKwh, 5.5);
  const env = await startUi(p);
  const html = env.els.get('ems-view-plan').innerHTML;
  assert.match(html, /<polyline class="pl-pva"/);
  assert.ok(html.includes('bisher erreicht 5.5 kWh'));
  assert.match(html, /kW erreicht/);
  // ohne Messung keine Linie
  const none = await startUi({ ...plan({ pvSlots: [{ end: day0 + 12 * 3600000, kw: 3, h: 3 }] }), dryRun: {} });
  assert.doesNotMatch(none.els.get('ems-view-plan').innerHTML, /<polyline/);
});

test('PlanLog: PV-Leistung wird je Viertelstunde gemittelt', () => {
  const log = new PlanLog(memStore());
  const t = NOW - (NOW % Q);
  log.record({ nowMs: t + 1000, pvW: 1000 });
  log.record({ nowMs: t + 31000, pvW: 3000 });
  log.record({ nowMs: t + 61000, pvW: null });
  assert.equal(log.entries[0].p, 2000);
  assert.equal(log.entries[0].pn, 2);
});

test('Anzeige: Tabelle ohne Preisdaten sagt es', async () => {
  const env = await startUi({ ...buildPlan({ nowMs: NOW, tz: TZ, priceSlots: [], log: [], consumers: [] }), dryRun: {} });
  assert.match(env.els.get('ems-view-plan').innerHTML, /Für diesen Tag sind noch keine Preise da/);
});
