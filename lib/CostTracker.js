'use strict';

const {
  SLOT_MS, localParts, localDateKey, parseHHMM,
} = require('./time');

// A report older than this has lost too much context to attribute its delta anywhere sensible.
const MAX_GAP_MS = 24 * 60 * 60 * 1000;
// A counter that did not change sends no report, so its delta belongs to the time just
// before the report. Attribute it to at most the last hour instead of smearing it over
// a long idle gap.
const MAX_SMEAR_MS = 60 * 60 * 1000;
const SLOT_DAYS_KEPT = 3;
const DAYS_KEPT = 400;

const KINDS = ['import', 'export', 'battery_charge', 'battery_discharge'];

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
  bcHT: 0,
  bcNT: 0,
  bcDyn: 0,
  bdHT: 0,
  bdNT: 0,
  bdDyn: 0,
});

function minutesOf(hhmm) {
  const t = parseHHMM(hhmm);
  return t.hour * 60 + t.minute;
}

/** Reference-tariff config, all prices in Rp./kWh. price 0 = not configured. */
function normalizeRef(ref = {}) {
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
  return {
    price: num(ref.price),
    ntPrice: num(ref.ntPrice),
    ntFrom: ref.ntFrom || '',
    ntTo: ref.ntTo || '',
    ntWeekend: Boolean(ref.ntWeekend),
    feedIn: num(ref.feedIn),
  };
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

class CostTracker {
  constructor({ tz = 'Europe/Zurich' } = {}) {
    this.tz = tz;
    this.counters = {};
    this.days = {};
    this.slots = {};
  }

  /**
   * Feed one cumulative counter reading (kWh).
   * @param {string} kind one of import | export | battery_charge | battery_discharge
   * @param {number} value cumulative kWh
   * @param {Date} now
   * @param {(slotStart: Date) => ({dyn: number|null, feedIn: number|null})} priceAt
   *        dynamic import price and feed-in price in Rp./kWh, dyn null if the slot has none
   * @param {object} refConfig see normalizeRef
   * @returns {{status: string, kwh?: number}}
   */
  report(kind, value, now, priceAt, refConfig) {
    if (!KINDS.includes(kind)) throw new Error(`Unbekannte Zählerart: ${kind}`);
    const v = Number(value);
    if (!Number.isFinite(v) || v < 0) return { status: 'invalid' };

    const ref = normalizeRef(refConfig);
    const nowMs = now.getTime();
    const last = this.counters[kind];
    this.counters[kind] = { value: v, time: nowMs };

    if (!last) return { status: 'baseline' };
    if (nowMs <= last.time) return { status: 'ignored' };

    const delta = v - last.value;
    if (delta < 0) return { status: 'reset' };
    if (delta === 0) return { status: 'ok', kwh: 0 };
    if (nowMs - last.time > MAX_GAP_MS) return { status: 'gap' };

    const fromMs = Math.max(last.time, nowMs - MAX_SMEAR_MS);
    const span = nowMs - fromMs;
    for (let s = Math.floor(fromMs / SLOT_MS) * SLOT_MS; s < nowMs; s += SLOT_MS) {
      const overlap = Math.min(s + SLOT_MS, nowMs) - Math.max(s, fromMs);
      if (overlap <= 0) continue;
      this._addSlot(kind, new Date(s), delta * (overlap / span), priceAt, ref);
    }
    this._prune();
    return { status: 'ok', kwh: delta };
  }

  _addSlot(kind, start, kwh, priceAt, ref) {
    const dayKey = localDateKey(start, this.tz);
    const day = this.days[dayKey] || (this.days[dayKey] = emptyDay());
    const slotMap = this.slots[dayKey] || (this.slots[dayKey] = {});
    const entry = slotMap[start.getTime()] || (slotMap[start.getTime()] = [0, 0, 0, 0]);
    entry[KINDS.indexOf(kind)] += kwh;

    const prices = priceAt(start) || {};
    const nt = isLowTariff(start, ref, this.tz);
    const dyn = typeof prices.dyn === 'number' ? prices.dyn : null;

    if (kind === 'import') {
      day.impAll += kwh;
      if (dyn !== null) {
        day[nt ? 'impNT' : 'impHT'] += kwh; day.impDyn += kwh * dyn;
      }
    } else if (kind === 'export') {
      day.expAll += kwh;
      if (dyn !== null) {
        day.expPriced += kwh; day.expDyn += kwh * (prices.feedIn || 0);
      }
    } else if (kind === 'battery_charge') {
      day.bcAll += kwh;
      if (dyn !== null) {
        day[nt ? 'bcNT' : 'bcHT'] += kwh; day.bcDyn += kwh * dyn;
      }
    } else {
      day.bdAll += kwh;
      if (dyn !== null) {
        day[nt ? 'bdNT' : 'bdHT'] += kwh; day.bdDyn += kwh * dyn;
      }
    }
  }

  /** Totals over the day keys fromKey..toKey (inclusive, "YYYY-MM-DD"), priced against `refConfig`. */
  summary(fromKey, toKey, refConfig) {
    const ref = normalizeRef(refConfig);
    const sum = emptyDay();
    let dayCount = 0;
    for (const [key, d] of Object.entries(this.days)) {
      if (key < fromKey || key > toKey) continue;
      dayCount += 1;
      for (const f of Object.keys(sum)) sum[f] += d[f];
    }
    const refNtPrice = ref.ntPrice > 0 ? ref.ntPrice : ref.price;
    const refCost = (ht, nt) => ht * ref.price + nt * refNtPrice;

    const configured = ref.price > 0;
    const dynNet = sum.impDyn - sum.expDyn;
    const refNet = refCost(sum.impHT, sum.impNT) - sum.expPriced * ref.feedIn;
    const batDyn = sum.bdDyn - sum.bcDyn;
    const batRef = refCost(sum.bdHT, sum.bdNT) - refCost(sum.bcHT, sum.bcNT);
    const impPriced = sum.impHT + sum.impNT;

    return {
      days: dayCount,
      configured,
      importKwh: sum.impAll,
      exportKwh: sum.expAll,
      batteryChargeKwh: sum.bcAll,
      batteryDischargeKwh: sum.bdAll,
      unpricedImportKwh: sum.impAll - impPriced,
      // Rp.
      importCostDyn: sum.impDyn,
      exportRevenueDyn: sum.expDyn,
      netCostDyn: dynNet,
      netCostRef: configured ? refNet : null,
      savings: configured ? refNet - dynNet : null,
      batteryBenefit: configured && (sum.bdAll + sum.bcAll) > 0 ? batDyn - batRef : null,
      avgImportPriceDyn: impPriced > 0 ? sum.impDyn / impPriced : null,
      avgImportPriceRef: configured && impPriced > 0 ? refCost(sum.impHT, sum.impNT) / impPriced : null,
    };
  }

  /** Per-day summaries, oldest first. */
  daily(fromKey, toKey, refConfig) {
    return Object.keys(this.days)
      .filter((k) => k >= fromKey && k <= toKey)
      .sort()
      .map((key) => ({ key, ...this.summary(key, key, refConfig) }));
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

  reset() {
    this.counters = {};
    this.days = {};
    this.slots = {};
  }

  _prune() {
    const dayKeys = Object.keys(this.days).sort();
    for (const k of dayKeys.slice(0, Math.max(0, dayKeys.length - DAYS_KEPT))) delete this.days[k];
    const slotKeys = Object.keys(this.slots).sort();
    for (const k of slotKeys.slice(0, Math.max(0, slotKeys.length - SLOT_DAYS_KEPT))) delete this.slots[k];
  }

  toJSON() {
    return { counters: this.counters, days: this.days, slots: this.slots };
  }

  static fromJSON(data, opts) {
    const t = new CostTracker(opts);
    if (data && typeof data === 'object') {
      t.counters = data.counters || {};
      t.days = data.days || {};
      t.slots = data.slots || {};
    }
    return t;
  }
}

module.exports = {
  CostTracker, normalizeRef, isLowTariff, refImportPrice, KINDS,
};
