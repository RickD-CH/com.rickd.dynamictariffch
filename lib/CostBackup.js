'use strict';

const zlib = require('zlib');
const { sanitizeRefPeriods, MAX_CONSUMERS } = require('./CostTracker');
const { parseHourlyOutput } = require('./HourlyOutput');

/**
 * Backup of the collected cost data (and optionally the app settings) as one compact text.
 * Pure functions, no Homey dependency: packing, strict validation of untrusted input,
 * merging and the preparation for restoring. The token is never part of a backup.
 */

const FORMAT = 'innostrom-cost-backup';
const VERSION = 1;
const MAX_TEXT = 3 * 1024 * 1024; // pasted text
const MAX_JSON = 8 * 1024 * 1024; // after decompression
const MAX_DAYS = 400;
const MAX_SLOT_DAYS = 31;
const MAX_FIELDS = 40;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);

class BackupError extends Error {}
const fail = (message) => {
  throw new BackupError(message);
};
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Object of finite numbers only (a day entry). */
function cleanNumbers(obj, what) {
  if (!isObj(obj)) fail(`${what}: not an object`);
  const keys = Object.keys(obj);
  if (keys.length > MAX_FIELDS) fail(`${what}: too many fields`);
  const out = {};
  for (const k of keys) {
    if (UNSAFE.has(k)) fail(`${what}: bad key`);
    if (!isNum(obj[k])) fail(`${what}: ${k} is not a number`);
    out[k] = obj[k];
  }
  return out;
}

function cleanDays(days, what) {
  if (!isObj(days)) fail(`${what}: not an object`);
  const keys = Object.keys(days);
  if (keys.length > MAX_DAYS) fail(`${what}: too many days`);
  const out = {};
  for (const k of keys) {
    if (!DAY_KEY.test(k)) fail(`${what}: bad day key`);
    out[k] = cleanNumbers(days[k], `${what}.${k}`);
  }
  return out;
}

function cleanCounters(counters, what) {
  if (counters === undefined) return {};
  if (!isObj(counters)) fail(`${what}: not an object`);
  const out = {};
  for (const [k, v] of Object.entries(counters)) {
    if (UNSAFE.has(k)) fail(`${what}: bad key`);
    if (!isObj(v) || !isNum(v.value) || !isNum(v.time)) fail(`${what}.${k}: bad counter`);
    out[k] = { value: v.value, time: v.time };
  }
  return out;
}

function cleanSlots(slots) {
  if (slots === undefined) return {};
  if (!isObj(slots)) fail('slots: not an object');
  const dayKeys = Object.keys(slots);
  if (dayKeys.length > MAX_SLOT_DAYS) fail('slots: too many days');
  const out = {};
  for (const dk of dayKeys) {
    if (!DAY_KEY.test(dk)) fail('slots: bad day key');
    const map = slots[dk];
    if (!isObj(map)) fail('slots: bad day');
    const ms = Object.keys(map);
    if (ms.length > 110) fail('slots: too many slots');
    out[dk] = {};
    for (const m of ms) {
      const arr = map[m];
      if (!/^\d{10,14}$/.test(m) || !Array.isArray(arr) || arr.length > 6 || !arr.every(isNum)) fail('slots: bad slot');
      out[dk][m] = arr.slice();
    }
  }
  return out;
}

function cleanDayPrices(dayPrices) {
  if (dayPrices === undefined) return {};
  if (!isObj(dayPrices)) fail('dayPrices: not an object');
  const keys = Object.keys(dayPrices);
  if (keys.length > MAX_SLOT_DAYS) fail('dayPrices: too many days');
  const out = {};
  for (const k of keys) {
    const v = dayPrices[k];
    if (!DAY_KEY.test(k) || !isObj(v) || !isNum(v.start) || !Number.isInteger(v.n) || v.n < 80 || v.n > 110) fail('dayPrices: bad entry');
    if (!Array.isArray(v.vals) || v.vals.length !== v.n * 2 || !v.vals.every((x) => x === null || isNum(x))) fail('dayPrices: bad values');
    out[k] = {
      start: v.start, n: v.n, vals: v.vals.slice(), partial: Boolean(v.partial),
    };
  }
  return out;
}

function cleanConsumers(consumers) {
  if (consumers === undefined) return {};
  if (!isObj(consumers)) fail('consumers: not an object');
  const names = Object.keys(consumers);
  if (names.length > MAX_CONSUMERS) fail('consumers: too many');
  const out = {};
  for (const name of names) {
    const c = consumers[name];
    if (UNSAFE.has(name) || name.length === 0 || name.length > 30 || !isObj(c)) fail('consumers: bad entry');
    out[name] = { counter: cleanCounters(c.counter, `consumer ${name} counter`), days: cleanDays(c.days || {}, `consumer ${name}`) };
  }
  return out;
}

/** Validates the cost part and returns a sanitised copy (CostTracker.toJSON() shape). */
function cleanCost(cost) {
  if (!isObj(cost)) fail('cost data missing');
  if (cost.since !== null && cost.since !== undefined && !isNum(cost.since)) fail('since: not a number');
  return {
    since: cost.since === undefined ? null : cost.since,
    counters: cleanCounters(cost.counters, 'counters'),
    days: cleanDays(cost.days || {}, 'days'),
    slots: cleanSlots(cost.slots),
    consumers: cleanConsumers(cost.consumers),
    dayPrices: cleanDayPrices(cost.dayPrices),
  };
}

/** Only known, valid app settings survive; everything else is dropped silently. */
function cleanSettings(s) {
  const out = {};
  if (!isObj(s)) return out;
  if (Array.isArray(s.ref_periods)) {
    try {
      out.ref_periods = sanitizeRefPeriods(s.ref_periods);
    } catch (e) { /* invalid: ignore */ }
  }
  if (isNum(s.vat_percent) && s.vat_percent >= 0 && s.vat_percent <= 100) out.vat_percent = Math.round(s.vat_percent * 100) / 100;
  if (isObj(s.battery_params)) {
    const b = s.battery_params;
    const ok = isNum(b.capacityKwh) && b.capacityKwh > 0 && b.capacityKwh <= 100
      && isNum(b.powerKw) && b.powerKw > 0 && b.powerKw <= 50
      && isNum(b.roundTrip) && b.roundTrip > 0.5 && b.roundTrip <= 1;
    if (ok) {
      out.battery_params = { capacityKwh: b.capacityKwh, powerKw: b.powerKw, roundTrip: b.roundTrip };
      if (isNum(b.minSocPct) && b.minSocPct >= 0 && b.minSocPct <= 50) out.battery_params.minSocPct = Math.round(b.minSocPct);
      if (isNum(b.maxSocPct) && b.maxSocPct >= 50 && b.maxSocPct <= 100) out.battery_params.maxSocPct = Math.round(b.maxSocPct);
    }
  }
  if (s.feed_in_mode === 'reference' || s.feed_in_mode === 'api') out.feed_in_mode = s.feed_in_mode;
  if (isObj(s.hourly_output)) {
    try {
      out.hourly_output = parseHourlyOutput(s.hourly_output);
    } catch (e) { /* invalid: ignore */ }
  }
  return out;
}

/**
 * @param {{cost: object, settings?: object, appVersion?: string, metering?: string, now?: number}} o
 * @returns {string} base64 of gzip(JSON)
 */
function pack({
  cost, settings, appVersion, metering, now = Date.now(),
}) {
  const payload = {
    format: FORMAT,
    version: VERSION,
    createdAt: now,
    appVersion: appVersion || null,
    metering: metering || null,
    cost,
    settings: settings || {},
  };
  return zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'), { level: 9 }).toString('base64');
}

/**
 * Reads and validates a backup text. Throws BackupError with a short reason on any problem.
 * @returns {{createdAt:number, appVersion:string|null, metering:string|null, cost:object, settings:object}}
 */
function unpack(text) {
  const raw = String(text || '').trim();
  if (!raw) fail('empty');
  if (raw.length > MAX_TEXT) fail('too large');
  let json;
  try {
    if (raw[0] === '{') json = raw;
    else json = zlib.gunzipSync(Buffer.from(raw.replace(/\s+/g, ''), 'base64'), { maxOutputLength: MAX_JSON }).toString('utf8');
  } catch (e) {
    fail('not a backup');
  }
  let p;
  try {
    p = JSON.parse(json);
  } catch (e) {
    fail('not a backup');
  }
  if (!isObj(p) || p.format !== FORMAT) fail('not a backup');
  if (p.version !== VERSION) fail('unsupported version');
  return {
    createdAt: isNum(p.createdAt) ? p.createdAt : null,
    appVersion: typeof p.appVersion === 'string' ? p.appVersion.slice(0, 20) : null,
    metering: typeof p.metering === 'string' ? p.metering.slice(0, 40) : null,
    cost: cleanCost(p.cost),
    settings: cleanSettings(p.settings),
  };
}

const PREVIEW_ROWS = 31;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Preview of the content: the most recent days (Rp. for money), totals and consumer totals. */
function previewOf(cost) {
  const dayKeys = Object.keys(cost.days).sort();
  const row = (key) => {
    const d = cost.days[key];
    return {
      key,
      importKwh: num(d.impAll),
      exportKwh: num(d.expAll),
      batteryChargeKwh: num(d.bcAll),
      batteryDischargeKwh: num(d.bdAll),
      netCostDyn: num(d.impDyn) - num(d.expDyn),
    };
  };
  const rows = dayKeys.map(row);
  const total = rows.reduce((a, r) => ({
    importKwh: a.importKwh + r.importKwh,
    exportKwh: a.exportKwh + r.exportKwh,
    batteryChargeKwh: a.batteryChargeKwh + r.batteryChargeKwh,
    batteryDischargeKwh: a.batteryDischargeKwh + r.batteryDischargeKwh,
    netCostDyn: a.netCostDyn + r.netCostDyn,
  }), {
    importKwh: 0, exportKwh: 0, batteryChargeKwh: 0, batteryDischargeKwh: 0, netCostDyn: 0,
  });
  const consumers = Object.entries(cost.consumers).map(([name, c]) => ({
    name, kwh: Object.values(c.days).reduce((a, d) => a + num(d.kwh), 0), days: Object.keys(c.days).length,
  }));
  return {
    rows: rows.slice(-PREVIEW_ROWS).reverse(), hiddenRows: Math.max(0, rows.length - PREVIEW_ROWS), total, consumerTotals: consumers,
  };
}

function summarize(backup) {
  const dayKeys = Object.keys(backup.cost.days).sort();
  return {
    preview: previewOf(backup.cost),
    createdAt: backup.createdAt,
    appVersion: backup.appVersion,
    metering: backup.metering,
    days: dayKeys.length,
    firstDay: dayKeys[0] || null,
    lastDay: dayKeys[dayKeys.length - 1] || null,
    slotDays: Object.keys(backup.cost.slots).length,
    consumers: Object.keys(backup.cost.consumers),
    settings: Object.keys(backup.settings),
  };
}

/** Meter baselines are dropped on restore so an old reading is never compared with a new one. */
function withoutBaselines(cost) {
  const out = JSON.parse(JSON.stringify(cost));
  out.counters = {};
  for (const c of Object.values(out.consumers)) c.counter = {};
  return out;
}

/** Union of two cost data sets; days that exist in `base` always win. Baselines of `base` stay. */
function mergeCost(base, incoming) {
  const out = JSON.parse(JSON.stringify(base));
  const inc = JSON.parse(JSON.stringify(incoming));
  if (inc.since !== null && (out.since === null || inc.since < out.since)) out.since = inc.since;
  for (const part of ['days', 'slots', 'dayPrices']) {
    out[part] = out[part] || {};
    for (const [k, v] of Object.entries(inc[part] || {})) if (!(k in out[part])) out[part][k] = v;
  }
  out.consumers = out.consumers || {};
  for (const [name, c] of Object.entries(inc.consumers || {})) {
    if (!out.consumers[name]) {
      if (Object.keys(out.consumers).length >= MAX_CONSUMERS) continue;
      out.consumers[name] = { counter: {}, days: c.days };
      continue;
    }
    for (const [k, v] of Object.entries(c.days)) if (!(k in out.consumers[name].days)) out.consumers[name].days[k] = v;
  }
  return out;
}

module.exports = {
  FORMAT, VERSION, BackupError, pack, unpack, summarize, mergeCost, withoutBaselines, cleanCost, cleanSettings,
};
