'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sunTimes, dailyCurve } = require('../lib/ems/SolarCurve');
const { PvFeed, sumKwh } = require('../lib/ems/PvFeed');
const { Inputs } = require('../lib/ems/Inputs');
const { EmsRunner } = require('../lib/ems/EmsRunner');
const { ShadowLog } = require('../lib/ems/ShadowLog');
const { PriceFeed } = require('../lib/ems/PriceFeed');
const { normalizeConfig } = require('../lib/ems/Config');
const { fromLocal, startOfLocalDay, addLocalDays } = require('../lib/time');

const TZ = 'Europe/Zurich';
const Q = 15 * 60 * 1000;
const NOW = fromLocal(2026, 6, 20, 10, 0).getTime(); // Sommer, 10 Uhr
const day0 = startOfLocalDay(new Date(NOW), TZ).getTime();
const day1 = addLocalDays(new Date(NOW), 1, TZ).getTime();

// ---------------------------------------------------------------- Kurve

test('Sonnenzeiten: Sommer lang, Winter kurz, Mittelland plausibel', () => {
  const sum = sunTimes(2026, 6, 20, 47.4, 8.0);
  const win = sunTimes(2026, 12, 21, 47.4, 8.0);
  const hoursSummer = (sum.sunset - sum.sunrise) / 3600000;
  const hoursWinter = (win.sunset - win.sunrise) / 3600000;
  assert.ok(hoursSummer > 15.5 && hoursSummer < 16.5, 'Sommer ' + hoursSummer);
  assert.ok(hoursWinter > 8 && hoursWinter < 8.8, 'Winter ' + hoursWinter);
  // Sommer: Aufgang ca. 05:25 Ortszeit (03:25 UTC), Untergang ca. 21:30 (19:30 UTC)
  assert.ok(new Date(sum.sunrise).getUTCHours() === 3 || new Date(sum.sunrise).getUTCHours() === 4);
  assert.equal(sunTimes(2026, 12, 21, 89, 0), null, 'Polarnacht');
});

test('Tageskurve: Summe = Tageswert, nachts 0, Maximum um die Mittagszeit', () => {
  const slots = dailyCurve({ totalKwh: 30, dayStartMs: day0, dayEndMs: day1, lat: 47.4, lon: 8.0, tz: TZ });
  assert.ok(slots.length > 50 && slots.length < 70, 'Sommertag ca. 16 h = 64 Viertelstunden: ' + slots.length);
  assert.ok(Math.abs(sumKwh(slots, day0, day1 + 1) - 30) < 0.001);
  const peak = slots.reduce((a, b) => (b.kw > a.kw ? b : a));
  const peakHour = new Date(peak.end - Q / 2).getUTCHours() + 2; // UTC -> Sommerzeit
  assert.ok(peakHour >= 12 && peakHour <= 14, 'Maximum mittags: ' + peakHour);
  assert.ok(slots.every((s) => s.kw >= 0 && s.h === 0.25));
  assert.equal(slots.filter((s) => s.end <= day0 + 3 * 3600000).length, 0, 'nachts nichts');
  assert.deepEqual(dailyCurve({ totalKwh: -1, dayStartMs: day0, dayEndMs: day1, lat: 47, lon: 8, tz: TZ }), []);
  assert.deepEqual(dailyCurve({ totalKwh: NaN, dayStartMs: day0, dayEndMs: day1, lat: 47, lon: 8, tz: TZ }), []);
  const zero = dailyCurve({ totalKwh: 0, dayStartMs: day0, dayEndMs: day1, lat: 47.4, lon: 8.0, tz: TZ });
  assert.ok(zero.every((s) => s.kw === 0));
});

test('PvFeed.setDaily: heute und morgen, Faktor angewendet, Reste und Kennzahlen stimmen', () => {
  const pv = new PvFeed(null, () => {});
  pv.configure({ factor: 0.8 });
  assert.equal(pv.setDaily({ todayKwh: 20, tomorrowKwh: 10, source: 'homey' }, NOW, TZ), true);
  assert.equal(pv.source, 'homey');
  assert.ok(Math.abs(pv.tomorrowKwh(NOW, TZ) - 8) < 0.01, 'morgen 10 x 0.8');
  const remaining = pv.remainingTodayKwh(NOW, TZ);
  assert.ok(remaining > 0 && remaining < 16, 'Rest heute weniger als der Tageswert 16: ' + remaining);
  assert.equal(pv.isStale(NOW), false);
  assert.equal(pv.info(NOW).daily.todayKwh, 20);
  assert.equal(pv.setDaily({ todayKwh: null, tomorrowKwh: null }, NOW, TZ), false, 'ohne Werte nichts übernehmen');
  assert.equal(pv.source, 'homey');
  assert.equal(pv.setDaily({ todayKwh: 12, tomorrowKwh: null, source: 'device' }, NOW, TZ), true);
  assert.equal(pv.tomorrowKwh(NOW, TZ), 0, 'nur heute: morgen leer');
});

// ---------------------------------------------------------------- Quellen lesen

function makeInputs(api) {
  const inputs = new Inputs({}, () => {});
  inputs._api = async () => api;
  return inputs;
}

test('Inputs.solarForecast: Homey-Tags, Gerät, automatisch, Fehlerfälle', async () => {
  const api = {
    flowtoken: { getFlowTokenValue: async ({ id }) => ({ value: id.endsWith('TodayKwh') ? 12.5 : 7.25 }) },
    devices: { getDevice: async ({ id }) => ({ available: true, capabilitiesObj: { 'meter_power.a': { value: 20 }, 'meter_power.b': { value: 15 } } }) },
  };
  const pv = { device: { id: 'fs', today: 'meter_power.a', tomorrow: 'meter_power.b' } };
  const inputs = makeInputs(api);
  assert.deepEqual(await inputs.solarForecast(pv, 'homey'), { todayKwh: 12.5, tomorrowKwh: 7.25, source: 'homey', todayCurve: null, tomorrowCurve: null });
  assert.deepEqual(await inputs.solarForecast(pv, 'device'), { todayKwh: 20, tomorrowKwh: 15, source: 'device' });
  assert.equal((await inputs.solarForecast(pv, 'auto')).source, 'homey');
  assert.equal(await inputs.solarForecast({ device: { id: '' } }, 'device'), null);
  const none = makeInputs({ flowtoken: { getFlowTokenValue: async () => { throw new Error('kein Tag'); } }, devices: api.devices });
  assert.equal(await none.solarForecast(pv, 'homey'), null);
  assert.equal((await none.solarForecast(pv, 'auto')).source, 'device', 'auto fällt auf das gewählte Gerät zurück');
  assert.equal(await makeInputs({ flowtoken: { getFlowTokenValue: async () => ({ value: 'abc' }) } }).solarForecast({}, 'homey'), null);
});

// ---------------------------------------------------------------- Runner: Quellenwahl

function runnerWith(pvCfg, { daily = { todayKwh: 20, tomorrowKwh: 10, source: 'homey' }, external = null } = {}) {
  const calls = { daily: 0 };
  const pv = new PvFeed(null, () => {});
  if (external) pv.setExternal(external, NOW - 60000);
  const config = normalizeConfig({ enabled: true, devices: { meter: { id: 'm' } }, pv: pvCfg });
  const inputs = {
    solarForecast: async () => { calls.daily += 1; return daily; },
    battery: async () => ({ soc: 50, capacityKwh: 10, error: null }),
    compareBatteryPlan: async () => null,
    chargerInputs: async () => ({ gridW: 0, houseW: 0, pvW: 0, batterySoc: 50, batteryW: 0, chargerRead: true, chargerConnected: false, chargerPowerW: 0, chargerPhases: 3, other: null }),
    consumerStates: async () => new Map(),
  };
  const runner = new EmsRunner({
    getConfig: () => config, prices: new PriceFeed(() => null), pv, inputs, shadowLog: new ShadowLog({ get() {}, set() {} }), store: null, tz: TZ,
  });
  return { runner, pv, calls, config };
}

test('Runner: Quelle auto - frisch eingelieferte Prognose gewinnt, sonst Homey; Tageswerte höchstens alle 15 Minuten', async () => {
  const ext = [{ start: NOW, end: NOW + 3600000, kw: 2 }, { start: NOW + 3600000, end: NOW + 7200000, kw: 3 }];
  const withExt = runnerWith({ source: 'auto' }, { external: ext });
  await withExt.runner._refreshPv(withExt.config, NOW);
  assert.equal(withExt.pv.source, 'external');
  assert.equal(withExt.calls.daily, 0, 'Homey wird nicht gefragt');
  const noExt = runnerWith({ source: 'auto' });
  await noExt.runner._refreshPv(noExt.config, NOW);
  assert.equal(noExt.pv.source, 'homey');
  assert.equal(noExt.calls.daily, 1);
  await noExt.runner._refreshPv(noExt.config, NOW + 5 * 60000);
  assert.equal(noExt.calls.daily, 1, 'innerhalb von 15 Minuten kein neuer Abruf, Prognose bleibt');
  assert.equal(noExt.pv.source, 'homey');
  await noExt.runner._refreshPv(noExt.config, NOW + 16 * 60000);
  assert.equal(noExt.calls.daily, 2);
  noExt.config.pv.factor = 0.5; // Faktor geändert: sofort neu
  await noExt.runner._refreshPv(noExt.config, NOW + 17 * 60000);
  assert.equal(noExt.calls.daily, 3);
  assert.ok(Math.abs(noExt.pv.tomorrowKwh(NOW + 17 * 60000, TZ) - 5) < 0.01);
});

test('Runner: Quelle homey/device lesen Tageswerte, external ignoriert sie, Lesefehler fällt zurück', async () => {
  const homey = runnerWith({ source: 'homey' });
  await homey.runner._refreshPv(homey.config, NOW);
  assert.equal(homey.pv.source, 'homey');
  const dev = runnerWith({ source: 'device', device: { id: 'x', today: 'a', tomorrow: 'b' } }, { daily: { todayKwh: 5, tomorrowKwh: 6, source: 'device' } });
  await dev.runner._refreshPv(dev.config, NOW);
  assert.equal(dev.pv.source, 'device');
  const ext = runnerWith({ source: 'external' });
  await ext.runner._refreshPv(ext.config, NOW);
  assert.equal(ext.calls.daily, 0);
  assert.equal(ext.pv.source, null, 'nichts eingeliefert = keine Prognose');
  const broken = runnerWith({ source: 'homey' }, { daily: null });
  await broken.runner._refreshPv(broken.config, NOW);
  assert.equal(broken.pv.source, null, 'Quelle nicht lesbar: keine (veraltete) Prognose');
  assert.equal(broken.pv.isStale(NOW), true);
});

test('Config: Quelle der Prognose nur erlaubte Werte, Gerät wird bereinigt', () => {
  assert.equal(normalizeConfig({}).pv.source, 'auto');
  for (const v of ['auto', 'homey', 'device', 'external']) assert.equal(normalizeConfig({ pv: { source: v } }).pv.source, v);
  assert.equal(normalizeConfig({ pv: { source: 'xyz' } }).pv.source, 'auto');
  assert.deepEqual(JSON.parse(JSON.stringify(normalizeConfig({ pv: { device: { id: 5, today: null } } }).pv.device)), { id: '5', today: '', tomorrow: '' });
});

// ---------------------------------------------------------------- Anzeige

const emsJs = fs.readFileSync(path.join(__dirname, '../settings/ems.js'), 'utf8');

async function startUi(pvInfo, cfgOver = {}) {
  const els = new Map();
  const handlers = {};
  const el = (id) => {
    if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '', value: '', checked: false, hidden: false, classList: { contains: () => true, toggle: () => {} }, addEventListener: (t, f) => { handlers[`${id}:${t}`] = f; } });
    return els.get(id);
  };
  const ctx = { document: { getElementById: el }, window: {}, setInterval: () => 0, console, Object, Promise, Date, Number, isFinite, String, JSON, Math };
  vm.createContext(ctx);
  vm.runInContext(emsJs, ctx);
  const config = normalizeConfig({ enabled: true, devices: { meter: { id: 'em' } }, ...cfgOver });
  const devices = [{ id: 'fs', name: 'Forecast.Solar', cls: 'other', caps: ['meter_power.a', 'meter_power.b'], capTitles: { 'meter_power.a': 'Prognose heute', 'meter_power.b': 'Prognose morgen' } }];
  const res = {
    'GET /ems/shadow': { enabled: true, deviceExists: true, shadow: true, config, pv: pvInfo, current: null, charger: { current: null } },
    'GET /ems/consumers': { current: [], events: [] }, 'GET /ems/devices': { devices }, 'GET /meters': null,
  };
  const api = (m, p) => Promise.resolve(res[`${m} ${p}`]);
  await ctx.window.EmsUi.init(api, 'de');
  const setup = () => els.get('ems-view-devices').innerHTML;
  const click = (attrs) => handlers['ems-view-devices:click']({ target: { getAttribute: (n) => (n in attrs ? attrs[n] : null), parentNode: null } });
  const change = (attrs, value) => handlers['ems-view-devices:change']({ target: { getAttribute: (n) => (n in attrs ? attrs[n] : null), value, parentNode: null } });
  return { ctx, setup, click, change };
}

test('Anzeige: Solarprognose - Quelle wählbar, Gerät mit Tageswerten, Info zur aktuellen Quelle', async () => {
  const ui = await startUi({ source: 'homey', factor: 1, fetchedAt: Date.now() - 5 * 60000, stale: false, slots: 120, daily: { todayKwh: 12.34, tomorrowKwh: 7.8 }, externalAt: null });
  assert.match(ui.setup(), /Quelle Homey, zuletzt vor 5 min, heute 12\.3 \/ morgen 7\.8 kWh/);
  ui.click({ 'data-ems-open': 'src-fc' });
  let html = ui.setup();
  assert.match(html, /data-ems-pv="source"/);
  assert.match(html, /Automatisch \(eingeliefert, sonst Homey\)/);
  assert.match(html, /Homey \(Energie-Prognose\)/);
  assert.match(html, /Nur per Flow-Aktion einliefern/);
  assert.doesNotMatch(html, /data-ems-pv="device"/);
  ui.change({ 'data-ems-pv': 'source' }, 'device');
  html = ui.setup();
  assert.match(html, /data-ems-pv="device"/);
  ui.change({ 'data-ems-pv': 'device' }, 'fs');
  html = ui.setup();
  assert.match(html, /<option value="meter_power\.a" selected>/, 'heute automatisch gewählt');
  assert.match(html, /<option value="meter_power\.b" selected>/, 'morgen automatisch gewählt');
  const body = ui.ctx.window.EmsUi._collect().ems.pv;
  assert.equal(body.source, 'device');
  assert.equal(JSON.stringify(body.device), JSON.stringify({ id: 'fs', today: 'meter_power.a', tomorrow: 'meter_power.b' }));
  assert.equal(body.factor, 1);
});

test('Anzeige: eingelieferte Prognose und fehlende Prognose werden benannt', async () => {
  const ext = await startUi({ source: 'external', factor: 1, externalAt: Date.now() - 3600000, fetchedAt: Date.now() - 3600000, stale: false, slots: 48 });
  assert.match(ext.setup(), /Quelle Flow-Aktion, zuletzt vor 60 min \(48 Einträge\)/);
  const none = await startUi({ source: null, factor: 1, externalAt: null, stale: true, slots: 0 });
  assert.match(none.setup(), /nicht eingeliefert/);
});

// ---------------------------------------------------------------- Verlauf aus Homeys Tagesbericht

/** Homey-Tagesbericht: 96 Viertelstunden, Sonne 08-16 Uhr mit Zacken (Wolken). */
function report(dayStart, peakW) {
  const arr = [];
  for (let i = 0; i < 96; i++) {
    const h = i / 4;
    const v = h >= 8 && h < 16 ? Math.round(peakW * Math.sin(((h - 8) / 8) * Math.PI) * (i % 3 === 0 ? 0.6 : 1)) : 0;
    arr.push({ t: new Date(dayStart + i * 900000).toISOString(), v });
  }
  return { electricity: { solarForecastMeasurePower: arr, solarForecastTotalWh: 0 } };
}

test('Inputs.solarForecast: liest den Verlauf aus Homeys Tagesbericht für heute, für morgen erst wenn vorhanden', async () => {
  const day0 = startOfLocalDay(new Date(NOW), TZ).getTime();
  const asked = [];
  const api = {
    flowtoken: { getFlowTokenValue: async ({ id }) => ({ value: id.endsWith('TodayKwh') ? 12.5 : 7.25 }) },
    energy: {
      getReportDay: async ({ date }) => {
        asked.push(date);
        if (date === '2026-06-20') return report(day0, 2000);
        throw new Error('Not Found: EnergyReportDay');
      },
    },
  };
  const r = await makeInputs(api).solarForecast({}, 'homey', { nowMs: NOW, tz: TZ });
  assert.deepEqual(asked, ['2026-06-20', '2026-06-21'], 'lokale Daten heute und morgen');
  assert.equal(r.todayCurve.length, 96);
  assert.equal(r.todayCurve[0].start, day0);
  assert.equal(r.tomorrowCurve, null, 'morgen noch kein Bericht');
  assert.equal(r.todayKwh, 12.5);
  const flat = { ...api, energy: { getReportDay: async () => ({ electricity: { solarForecastMeasurePower: [] } }) } };
  assert.equal((await makeInputs(flat).solarForecast({}, 'homey', { nowMs: NOW, tz: TZ })).todayCurve, null, 'leer = Sonnenkurve');
});

test('PvFeed.setDaily: echter Verlauf von Homey statt Sonnenkurve; morgen ohne Verlauf weiter als Kurve; Faktor gilt', () => {
  const day0 = startOfLocalDay(new Date(NOW), TZ).getTime();
  const day1 = addLocalDays(new Date(NOW), 1, TZ).getTime();
  const curve = report(day0, 2000).electricity.solarForecastMeasurePower.map((x) => ({ start: Date.parse(x.t), w: x.v }));
  const pv = new PvFeed(null, () => {});
  pv.configure({ factor: 0.5 });
  assert.equal(pv.setDaily({
    todayKwh: null, tomorrowKwh: 8, source: 'homey', todayCurve: curve, tomorrowCurve: null,
  }, NOW, TZ), true);
  assert.deepEqual(pv.daily.shape, { today: 'homey', tomorrow: 'curve' });
  const slot = pv.slots.find((s) => s.end === day0 + 37 * 900000); // 09:00-09:15
  assert.equal(slot.h, 0.25);
  assert.equal(slot.kw, (curve[36].w / 1000) * 0.5, 'Wert der Viertelstunde mal Faktor');
  const zig = pv.slots.find((s) => s.end === day0 + 49 * 900000); // 12:00, Zacke (i % 3 === 0)
  const next = pv.slots.find((s) => s.end === day0 + 50 * 900000);
  assert.ok(zig.kw < next.kw, 'Wolken-Zacken bleiben erhalten');
  assert.ok(pv.daily.todayKwh > 0, 'ohne Tagessumme aus dem Verlauf gerechnet');
  assert.ok(pv.slots.some((s) => s.end > day1), 'morgen als Sonnenkurve');
});
