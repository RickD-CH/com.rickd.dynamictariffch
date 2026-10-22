'use strict';

/**
 * Values for the cost capabilities and the "day summarised" trigger, derived from a
 * CostTracker summary (money in Rp.). Pure functions, no Homey dependency.
 */

const round = (v, d) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};
const chf = (rp) => round(rp / 100, 2);

/**
 * Tokens of the trigger for one finished day, or null when the day has no data.
 * @param {object} summary CostTracker.summary(dayKey, dayKey, refs)
 * @param {string} dayKey  "YYYY-MM-DD"
 */
function buildDigest(summary, dayKey) {
  if (!summary || !summary.days) return null;
  const compared = Boolean(summary.configured);
  return {
    date: `${dayKey.slice(8, 10)}.${dayKey.slice(5, 7)}.`,
    importKwh: round(summary.importKwh, 2),
    exportKwh: round(summary.exportKwh, 2),
    costDyn: chf(summary.netCostDyn),
    costRef: compared && summary.netCostRef !== null ? chf(summary.netCostRef) : 0,
    savings: compared && summary.savings !== null ? chf(summary.savings) : 0,
    avgImportPrice: summary.avgImportPriceDyn === null ? 0 : round(summary.avgImportPriceDyn, 1),
    batteryBenefit: compared && summary.batteryBenefit !== null ? chf(summary.batteryBenefit) : 0,
    compared,
  };
}

/** Capability values; null where there is nothing to compare with (no reference tariff). */
function costValues(today, month) {
  const compared = (s) => Boolean(s && s.configured);
  return {
    cost_today: today ? chf(today.netCostDyn) : null,
    cost_ref_today: compared(today) && today.netCostRef !== null ? chf(today.netCostRef) : null,
    savings_today: compared(today) && today.savings !== null ? chf(today.savings) : null,
    savings_month: compared(month) && month.savings !== null ? chf(month.savings) : null,
    avg_import_price_today: today && today.avgImportPriceDyn !== null ? round(today.avgImportPriceDyn, 2) : null,
  };
}

module.exports = { buildDigest, costValues };
