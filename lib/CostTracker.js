'use strict';

const {
  SLOT_MS, localParts, localDateKey, parseHHMM, startOfLocalDay, addLocalDays,
} = require('./time');

// A report older than this has lost too much context to attribute its delta anywhere sensible.
const MAX_GAP_MS = 24 * 60 * 60 * 1000;
// A counter that did not change sends no report, so its delta belongs to the time just
// before the report. Attribute it to at most the last hour instead of smearing it over
// a long idle gap.
const MAX_SMEAR_MS = 60 * 60 * 1000;
// Per-slot flows and prices stay long enough for the shadow battery analysis.
const SLOT_DAYS_KEPT = 14;
const DAYS_KEPT = 366;
const MAX_CONSUMERS = 6;

const KINDS = ['import', 'export', 'battery_charge', 'battery_discharge'];
const BATTERY_FIELDS = ['bcGridHT', 'bcGridNT', 'bcPv', 'bcGridDyn', 'bcPvDyn', 'bdHT', 'bdNT', 'bdDyn'];

const emptyDay = () => ({
  impAll: 0,
  expAll: 0,
  bcAll: 0,
  bdAll: 0,
  impHT: 0,
  impNT: 0,
  impDyn: 0,
  expPriced: 0,
  expDyn: 0,
  bcGridHT: 0,
  bcGridNT: 0,
  bcPv: 0,
  bcGridDyn: 0,
  bcPvDyn: 0,
  bdHT: 0,
  bdNT: 0,
  bdDyn: 0,
  negImp: 0,
  negExp: 0,
});

const emptyConsumerDay = () => ({
  kwh: 0, ht: 0, nt: 0, dyn: 0, dayAvgW: 0, unpriced: 0,
});

function minutesOf(hhmm) {
  const t = parseHHMM(hhmm);
  return t.hour * 60 + t.minute;
}

/** Reference-tariff config, prices in Rp./kWh, fixedDiff in CHF/month. price 0 = not configured. */
function normalizeRef(ref = {}) {
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
  return {
    price: num(ref.price),
    ntPrice: num(ref.ntPrice),
    ntFrom: ref.ntFrom || '',
    ntTo: ref.ntTo || '',
    ntWeekend: Boolean(ref.ntWeekend),
    feedIn: num(ref.feedIn),
    fixedDiff: Number.isFinite(Number(ref.fixedDiff)) ? Number(ref.fixedDiff) : 0,
  };
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reference tariff periods, oldest first. Accepts one config object or an array; each entry
 * is valid from `from` ("YYYY-MM-DD", empty = since forever) until the next entry starts.
 */
function normalizeRefs(input) {
  let list = [];
  if (Array.isArray(input)) list = input;
  else if (input) list = [input];
  return list
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({ from: DAY_KEY.test(r.from || '') ? r.from : '', ...normalizeRef(r) }))
    .sort((a, b) => {
      if (a.from === b.from) return 0;
      return a.from < b.from ? -1 : 1;
    });
}

/** The reference period valid on `dayKey`, or null. */
function refForDay(refs, dayKey) {
  let cur = null;
  for (const r of refs) if (r.from <= dayKey) cur = r;
  return cur;
}

/**
 * Validates reference periods coming from the settings page and keeps the calculator lines
 * so the page can show them again. Throws on invalid input.
 */
function sanitizeRefPeriods(input) {
  if (!Array.isArray(input) || input.length > 12) throw new Error('Invalid periods');
  const num = (v, allowNegative = false) => {
    if (v === undefined || v === null || v === '') return 0;
    const n = Number(v);
    if (!Number.isFinite(n) || n > 1000 || n < (allowNegative ? -1000 : 0)) throw new Error('Invalid price');
    return Math.round(n * 100) / 100;
  };
  const hhmm = (v) => {
    if (v === undefined || v === null || v === '') return '';
    parseHHMM(v);
    return String(v).trim();
  };
  const lines = (arr) => (Array.isArray(arr) ? arr.slice(0, 20).map((l) => ({
    name: String((l && l.name) || '').slice(0, 40),
    value: Number.isFinite(Number(l && l.value)) ? Number(l.value) : 0,
  })) : []);
  const out = input.map((p) => {
    const from = p.from ? String(p.from) : '';
    if (from && !DAY_KEY.test(from)) throw new Error('Invalid date');
    return {
      from,
      price: num(p.price),
      ntPrice: num(p.ntPrice),
      ntFrom: hhmm(p.ntFrom),
      ntTo: hhmm(p.ntTo),
      ntWeekend: Boolean(p.ntWeekend),
      feedIn: num(p.feedIn),
      fixedDiff: num(p.fixedDiff, true),
      importLines: lines(p.importLines),
      exportLines: lines(p.exportLines),
      linesExclVat: p.linesExclVat !== false,
    };
  });
  return out.sort((a, b) => {
    if (a.from === b.from) return 0;
    return a.from < b.from ? -1 : 1;
  });
}

/** True if the slot starting at `start` falls in the reference low-tariff period. */
function isLowTariff(start, ref, tz) {
  if (!(ref.ntPrice > 0)) return false;
  const p = localParts(start, tz);
  if (ref.ntWeekend) {
    const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    if (dow === 0 || dow === 6) return true;
  }
  if (!ref.ntFrom || !ref.ntTo) return false;
  let from; let to;
  try {
    from = minutesOf(ref.ntFrom);
    to = minutesOf(ref.ntTo);
  } catch (e) {
    return false;
  }
  if (from === to) return false;
  const t = p.hour * 60 + p.minute;
  return from < to ? (t >= from && t < to) : (t >= from || t < to);
}

/** Reference import price (Rp./kWh) for a slot. */
function refImportPrice(start, ref, tz) {
  return isLowTariff(start, ref, tz) ? ref.ntPrice : ref.price;
}

/** Day keys from `from` to `to` inclusive ("YYYY-MM-DD"), calendar arithmetic only. */
function eachDayKey(from, to) {
  const out = [];
  const [y, m, d] = from.split('-').map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i < 4000; i += 1) {
    const key = cur.toISOString().slice(0, 10);
    if (key > to) break;
    out.push(key);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

class CostTracker {
  constructor({ tz = 'Europe/Zurich' } = {}) {
    this.tz = tz;
    this.since = null;
    this.counters = {};
    this.days = {};
    this.slots = {};
    this.consumers = {};
    this.dayPrices = {};
  }

  /**
   * Validates one cumulative counter reading against the last one.
   * @returns {{status: string, delta?: number, fromMs?: number}}
   */
  _window(holder, key, value, nowMs) {
    const v = Number(value);
    if (!Number.isFinite(v) || v < 0) return { status: 'invalid' };
    const last = holder[key];
    holder[key] = { value: v, time: nowMs };
    if (this.since === null) this.since = nowMs;
    if (!last) return { status: 'baseline' };
    if (nowMs <= last.time) return { status: 'ignored' };
    const delta = v - last.value;
    if (delta < 0) return { status: 'reset' };
    if (delta === 0) return { status: 'ok', delta: 0 };
    if (nowMs - last.time > MAX_GAP_MS) return { status: 'gap' };
    return { status: 'ok', delta, fromMs: Math.max(last.time, nowMs - MAX_SMEAR_MS) };
  }

  _distribute(fromMs, nowMs, delta, fn) {
    const span = nowMs - fromMs;
    for (let s = Math.floor(fromMs / SLOT_MS) * SLOT_MS; s < nowMs; s += SLOT_MS) {
      const overlap = Math.min(s + SLOT_MS, nowMs) - Math.max(s, fromMs);
      if (overlap > 0) fn(new Date(s), delta * (overlap / span));
    }
  }

  /**
   * Feed one cumulative counter reading (kWh).
   * @param {string} kind one of import | export | battery_charge | battery_discharge
   * @param {number} value cumulative kWh
   * @param {Date} now
   * @param {(slotStart: Date) => ({dyn: number|null, feedIn: number|null, dayAvg?: number|null})} priceAt
   *        dynamic import price, feed-in price and day average price in Rp./kWh, dyn null if the slot has none
   * @param {object|object[]} refConfig reference period(s), see normalizeRefs
   * @returns {{status: string, kwh?: number}}
   */
  report(kind, value, now, priceAt, refConfig) {
    if (!KINDS.includes(kind)) throw new Error(`Unbekannte Zählerart: ${kind}`);
    const refs = normalizeRefs(refConfig);
    const nowMs = now.getTime();
    const w = this._window(this.counters, kind, value, nowMs);
    if (w.status !== 'ok' || !w.delta) return { status: w.status, kwh: w.delta };

    const touched = new Set();
    this._distribute(w.fromMs, nowMs, w.delta, (start, kwh) => {
      touched.add(this._addSlot(kind, start, kwh, priceAt, refs));
    });
    // Battery grid/PV split depends on import and charge of the same slot: redo those days.
    touched.forEach((dayKey) => this._recomputeBattery(dayKey, priceAt, refs));
    this._prune();
    return { status: 'ok', kwh: w.delta };
  }

  _addSlot(kind, start, kwh, priceAt, refs) {
    const dayKey = localDateKey(start, this.tz);
    const day = this.days[dayKey] || (this.days[dayKey] = emptyDay());
    const slotMap = this.slots[dayKey] || (this.slots[dayKey] = {});
    const entry = slotMap[start.getTime()] || (slotMap[start.getTime()] = [0, 0, 0, 0]);
    entry[KINDS.indexOf(kind)] += kwh;
    this._ensureDayPrices(dayKey, start, priceAt);

    if (kind === 'battery_charge') {
      day.bcAll += kwh; return dayKey;
    }
    if (kind === 'battery_discharge') {
      day.bdAll += kwh; return dayKey;
    }

    const prices = priceAt(start) || {};
    const ref = refForDay(refs, dayKey);
    const nt = ref ? isLowTariff(start, ref, this.tz) : false;
    const dyn = typeof prices.dyn === 'number' ? prices.dyn : null;

    if (kind === 'import') {
      day.impAll += kwh;
      if (dyn !== null) {
        day[nt ? 'impNT' : 'impHT'] += kwh;
        day.impDyn += kwh * dyn;
        if (dyn < 0) day.negImp += kwh;
      }
    } else {
      day.expAll += kwh;
      if (dyn !== null) {
        const feedIn = prices.feedIn || 0;
        day.expPriced += kwh;
        day.expDyn += kwh * feedIn;
        if (feedIn < 0) day.negExp += kwh;
      }
    }
    return dayKey;
  }

  /** Stores the day's dynamic and feed-in price per slot (Rp./kWh) for the shadow analysis. */
  _ensureDayPrices(dayKey, start, priceAt) {
    const existing = this.dayPrices[dayKey];
    if (existing && !existing.partial) return;
    const dayStart = startOfLocalDay(start, this.tz);
    const n = Math.round((addLocalDays(dayStart, 1, this.tz) - dayStart) / SLOT_MS);
    const vals = [];
    let partial = false;
    for (let i = 0; i < n; i += 1) {
      const pr = priceAt(new Date(dayStart.getTime() + i * SLOT_MS)) || {};
      if (typeof pr.dyn !== 'number') partial = true;
      vals.push(typeof pr.dyn === 'number' ? Math.round(pr.dyn * 100) / 100 : null);
      vals.push(typeof pr.feedIn === 'number' ? Math.round(pr.feedIn * 100) / 100 : null);
    }
    this.dayPrices[dayKey] = {
      start: dayStart.getTime(), n, vals, partial,
    };
  }

  /**
   * Full days (after tracking started, before today) that can be replayed by the shadow
   * battery analysis, oldest first.
   */
  shadowDayKeys(todayKey) {
    if (this.since === null) return [];
    const firstKey = localDateKey(new Date(this.since), this.tz);
    return Object.keys(this.slots)
      .filter((k) => k > firstKey && k < todayKey && this.dayPrices[k] && !this.dayPrices[k].partial)
      .sort();
  }

  /** Residual (load minus PV), prices and the measured grid cost of one day for the analysis. */
  shadowInputs(dayKey) {
    const dp = this.dayPrices[dayKey];
    if (!dp) return null;
    const slotMap = this.slots[dayKey] || {};
    const r = []; const p = []; const f = [];
    let actual = 0;
    for (let i = 0; i < dp.n; i += 1) {
      const e = slotMap[dp.start + i * SLOT_MS] || [0, 0, 0, 0];
      const price = dp.vals[2 * i];
      const feedIn = dp.vals[2 * i + 1] === null ? 0 : dp.vals[2 * i + 1];
      r.push(e[0] - e[1] + e[3] - e[2]);
      p.push(price);
      f.push(feedIn);
      actual += e[0] * price - e[1] * feedIn;
    }
    return {
      key: dayKey, r, p, f, actual,
    };
  }

  /**
   * Battery energy split per slot: what the grid imported in the same slot is assumed to
   * have charged the battery first (valued at the import price); the rest came from PV
   * (valued at the feed-in price it would otherwise have earned). Discharge is valued at
   * the import price it avoided.
   */
  _recomputeBattery(dayKey, priceAt, refs) {
    const day = this.days[dayKey];
    if (!day) return;
    for (const f of BATTERY_FIELDS) day[f] = 0;
    const ref = refForDay(refs, dayKey);
    for (const [ms, imp, , bc, bd] of this.slotsOf(dayKey)) {
      if (bc <= 0 && bd <= 0) continue;
      const start = new Date(ms);
      const prices = priceAt(start) || {};
      if (typeof prices.dyn !== 'number') continue;
      const nt = ref ? isLowTariff(start, ref, this.tz) : false;
      const grid = Math.min(bc, imp);
      day[nt ? 'bcGridNT' : 'bcGridHT'] += grid;
      day.bcGridDyn += grid * prices.dyn;
      day.bcPv += bc - grid;
      day.bcPvDyn += (bc - grid) * (prices.feedIn || 0);
      day[nt ? 'bdNT' : 'bdHT'] += bd;
      day.bdDyn += bd * prices.dyn;
    }
  }

  /** First and last day keys covered by tracking (for fixed costs), or null. */
  _trackedRange() {
    const keys = Object.keys(this.days).sort();
    const times = Object.values(this.counters).map((c) => c.time);
    if (this.since === null && !keys.length) return null;
    let firstKey = this.since !== null ? localDateKey(new Date(this.since), this.tz) : keys[0];
    if (keys.length && keys[0] < firstKey) [firstKey] = keys;
    let lastKey = keys.length ? keys[keys.length - 1] : firstKey;
    if (times.length) {
      const k = localDateKey(new Date(Math.max(...times)), this.tz);
      if (k > lastKey) lastKey = k;
    }
    return { firstKey, lastKey };
  }

  /**
   * Totals over the day keys fromKey..toKey (inclusive, "YYYY-MM-DD"). Each day is priced
   * against the reference period valid on that day; days without one are left out of the
   * comparison (but not out of the kWh and dynamic cost totals).
   */
  summary(fromKey, toKey, refInput) {
    const refs = normalizeRefs(refInput);
    const sum = emptyDay();
    let dayCount = 0;
    let comparedDays = 0;
    let dynNetCompared = 0;
    let refNet = 0;
    let batDyn = 0;
    let batRef = 0;
    let batKwh = 0;
    let impPricedCompared = 0;
    let impDynCompared = 0;
    let impRefCost = 0;
    let fixedCost = 0;

    for (const [key, d] of Object.entries(this.days)) {
      if (key < fromKey || key > toKey) continue;
      dayCount += 1;
      for (const f of Object.keys(sum)) sum[f] += d[f] || 0;

      const ref = refForDay(refs, key);
      if (!ref || !(ref.price > 0)) continue;
      comparedDays += 1;
      const ntPrice = ref.ntPrice > 0 ? ref.ntPrice : ref.price;
      const cost = (ht, nt) => ht * ref.price + nt * ntPrice;
      dynNetCompared += d.impDyn - d.expDyn;
      refNet += cost(d.impHT, d.impNT) - d.expPriced * ref.feedIn;
      batDyn += d.bdDyn - d.bcGridDyn - d.bcPvDyn;
      batRef += cost(d.bdHT, d.bdNT) - cost(d.bcGridHT, d.bcGridNT) - d.bcPv * ref.feedIn;
      batKwh += d.bcAll + d.bdAll;
      impPricedCompared += d.impHT + d.impNT;
      impDynCompared += d.impDyn;
      impRefCost += cost(d.impHT, d.impNT);
    }

    // Fixed-cost difference accrues every calendar day since tracking started.
    const range = this._trackedRange();
    if (range) {
      const lo = fromKey > range.firstKey ? fromKey : range.firstKey;
      const hi = toKey < range.lastKey ? toKey : range.lastKey;
      if (lo <= hi) {
        for (const key of eachDayKey(lo, hi)) {
          const ref = refForDay(refs, key);
          if (ref && ref.price > 0 && ref.fixedDiff) fixedCost += (ref.fixedDiff * 100 * 12) / 365;
        }
      }
    }

    const configured = comparedDays > 0;
    const impPriced = sum.impHT + sum.impNT;

    return {
      days: dayCount,
      configured,
      importKwh: sum.impAll,
      exportKwh: sum.expAll,
      batteryChargeKwh: sum.bcAll,
      batteryDischargeKwh: sum.bdAll,
      unpricedImportKwh: sum.impAll - impPriced,
      negativeImportKwh: sum.negImp,
      negativeExportKwh: sum.negExp,
      // Rp.
      importCostDyn: sum.impDyn,
      exportRevenueDyn: sum.expDyn,
      netCostDyn: sum.impDyn - sum.expDyn,
      fixedCostDiff: configured ? fixedCost : 0,
      netCostRef: configured ? refNet : null,
      savings: configured ? refNet - dynNetCompared - fixedCost : null,
      batteryBenefit: configured && batKwh > 0 ? batDyn - batRef : null,
      avgImportPriceDyn: impPriced > 0 ? sum.impDyn / impPriced : null,
      avgImportPriceRef: configured && impPricedCompared > 0 ? impRefCost / impPricedCompared : null,
      avgImportPriceDynCompared: configured && impPricedCompared > 0 ? impDynCompared / impPricedCompared : null,
    };
  }

  /** Per-day summaries, oldest first. */
  daily(fromKey, toKey, refInput) {
    return Object.keys(this.days)
      .filter((k) => k >= fromKey && k <= toKey)
      .sort()
      .map((key) => ({ key, ...this.summary(key, key, refInput) }));
  }

  /** Per-slot kWh [start ms, import, export, battery charge, battery discharge] of one day. */
  slotsOf(dayKey) {
    return Object.entries(this.slots[dayKey] || {})
      .map(([ms, v]) => [Number(ms), ...v])
      .sort((a, b) => a[0] - b[0]);
  }

  /** Last report time (ms) per kind. */
  lastReports() {
    return Object.fromEntries(KINDS.map((k) => [k, this.counters[k] ? this.counters[k].time : null]));
  }

  /**
   * Feed one cumulative counter reading (kWh) of a single consumer (EV, heat pump, ...),
   * valued at the dynamic slot price. These are informational and not part of the totals.
   */
  reportConsumer(name, value, now, priceAt, refConfig) {
    const key = String(name || '').trim().slice(0, 30);
    if (!key) return { status: 'invalid' };
    if (!this.consumers[key] && Object.keys(this.consumers).length >= MAX_CONSUMERS) return { status: 'limit' };
    const c = this.consumers[key] || (this.consumers[key] = { counter: {}, days: {} });
    const refs = normalizeRefs(refConfig);
    const nowMs = now.getTime();
    const w = this._window(c.counter, 'v', value, nowMs);
    if (w.status !== 'ok' || !w.delta) return { status: w.status, kwh: w.delta };

    this._distribute(w.fromMs, nowMs, w.delta, (start, kwh) => {
      const dayKey = localDateKey(start, this.tz);
      const day = c.days[dayKey] || (c.days[dayKey] = emptyConsumerDay());
      const prices = priceAt(start) || {};
      if (typeof prices.dyn !== 'number') {
        day.unpriced += kwh; return;
      }
      const ref = refForDay(refs, dayKey);
      const nt = ref ? isLowTariff(start, ref, this.tz) : false;
      day.kwh += kwh;
      day[nt ? 'nt' : 'ht'] += kwh;
      day.dyn += kwh * prices.dyn;
      day.dayAvgW += kwh * (typeof prices.dayAvg === 'number' ? prices.dayAvg : prices.dyn);
    });
    const keys = Object.keys(c.days).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - DAYS_KEPT))) delete c.days[k];
    return { status: 'ok', kwh: w.delta };
  }

  /** Per-consumer totals over fromKey..toKey. Prices in Rp./kWh, values in Rp. */
  consumerSummary(fromKey, toKey, refInput) {
    const refs = normalizeRefs(refInput);
    return Object.entries(this.consumers).map(([name, c]) => {
      let kwh = 0; let dyn = 0; let dayAvgW = 0; let refCost = 0; let refKwh = 0; let refDyn = 0;
      for (const [key, d] of Object.entries(c.days)) {
        if (key < fromKey || key > toKey) continue;
        kwh += d.kwh; dyn += d.dyn; dayAvgW += d.dayAvgW;
        const ref = refForDay(refs, key);
        if (ref && ref.price > 0) {
          refCost += d.ht * ref.price + d.nt * (ref.ntPrice > 0 ? ref.ntPrice : ref.price);
          refKwh += d.kwh;
          refDyn += d.dyn;
        }
      }
      const avgPrice = kwh > 0 ? dyn / kwh : null;
      const avgDayPrice = kwh > 0 ? dayAvgW / kwh : null;
      return {
        name,
        kwh,
        avgPrice,
        avgDayPrice,
        advantage: kwh > 0 ? avgDayPrice - avgPrice : null,
        valueDyn: dyn,
        savingsVsRef: refKwh > 0 ? refCost - refDyn : null,
        last: c.counter.v ? c.counter.v.time : null,
      };
    });
  }

  /** Deletes the collected days fromKey..toKey (inclusive) incl. consumers; returns how many days went. */
  deleteDays(fromKey, toKey) {
    let n = 0;
    for (const k of Object.keys(this.days)) {
      if (k >= fromKey && k <= toKey) {
        delete this.days[k]; delete this.slots[k]; n += 1;
      }
    }
    for (const k of Object.keys(this.slots)) if (k >= fromKey && k <= toKey) delete this.slots[k];
    for (const c of Object.values(this.consumers)) {
      for (const k of Object.keys(c.days)) if (k >= fromKey && k <= toKey) delete c.days[k];
    }
    return n;
  }

  deleteConsumer(name) {
    const had = Boolean(this.consumers[name]);
    delete this.consumers[name];
    return had;
  }

  /** Forget the last counter readings (e.g. after replacing a meter); collected data stays. */
  resetBaselines() {
    this.counters = {};
    for (const c of Object.values(this.consumers)) c.counter = {};
  }

  reset() {
    this.since = null;
    this.counters = {};
    this.days = {};
    this.slots = {};
    this.consumers = {};
    this.dayPrices = {};
  }

  _prune() {
    const dayKeys = Object.keys(this.days).sort();
    for (const k of dayKeys.slice(0, Math.max(0, dayKeys.length - DAYS_KEPT))) delete this.days[k];
    const slotKeys = Object.keys(this.slots).sort();
    for (const k of slotKeys.slice(0, Math.max(0, slotKeys.length - SLOT_DAYS_KEPT))) delete this.slots[k];
    const priceKeys = Object.keys(this.dayPrices).sort();
    for (const k of priceKeys.slice(0, Math.max(0, priceKeys.length - SLOT_DAYS_KEPT))) delete this.dayPrices[k];
  }

  toJSON() {
    const slots = {};
    for (const [k, m] of Object.entries(this.slots)) {
      slots[k] = {};
      for (const [ms, v] of Object.entries(m)) slots[k][ms] = v.map((x) => Math.round(x * 10000) / 10000);
    }
    return {
      since: this.since, counters: this.counters, days: this.days, slots, consumers: this.consumers, dayPrices: this.dayPrices,
    };
  }

  static fromJSON(data, opts) {
    const t = new CostTracker(opts);
    if (data && typeof data === 'object') {
      t.since = data.since === undefined ? null : data.since;
      t.counters = data.counters || {};
      t.days = data.days || {};
      t.slots = data.slots || {};
      t.consumers = data.consumers || {};
      t.dayPrices = data.dayPrices || {};
    }
    return t;
  }
}

module.exports = {
  CostTracker, normalizeRef, normalizeRefs, refForDay, sanitizeRefPeriods, isLowTariff, refImportPrice, KINDS, MAX_CONSUMERS,
};
