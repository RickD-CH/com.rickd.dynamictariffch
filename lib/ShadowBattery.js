'use strict';

const SLOT_H = 0.25;

/**
 * "What would a battery have earned?" for one day, by dynamic programming over the battery
 * charge level. Nothing here controls anything: it replays the day's known household
 * residual (load minus PV, derived from the measured grid and battery flows) against the
 * day's prices.
 *
 * The residual stays fixed, so the comparison ignores that a different battery strategy would
 * change nothing else in the house. Losses use the round-trip efficiency split evenly between
 * charging and discharging. The battery may not export to the grid in either scenario.
 *
 * @param {object} o
 * @param {number[]} o.r   residual per slot in kWh (+ = house needs power, - = PV surplus)
 * @param {number[]} o.p   import price per slot (Rp./kWh)
 * @param {number[]} o.f   feed-in price per slot (Rp./kWh)
 * @param {number} o.capacityKwh   usable battery capacity
 * @param {number} o.powerKw       max charge/discharge power (AC side)
 * @param {number} o.roundTrip     round-trip efficiency, 0..1
 * @param {boolean} o.allowGridCharge  true = may charge from the grid, false = PV surplus only
 * @param {number} [o.startFrac=0.5]   charge level at the start; the day must end at least there
 * @returns {number} net cost of the day in Rp. (negative = net revenue)
 */
function optimalCost({
  r, p, f, capacityKwh, powerKw, roundTrip, allowGridCharge, startFrac = 0.5,
}) {
  const T = r.length;
  const step = 0.2;
  const N = Math.max(1, Math.floor(capacityKwh / step));
  const eta = Math.sqrt(Math.min(1, Math.max(0.5, roundTrip)));
  const kmax = Math.max(1, Math.floor((powerKw * SLOT_H * eta) / step));
  const start = Math.min(N, Math.max(0, Math.round((capacityKwh * startFrac) / step)));

  const gridCost = (g, t) => (g > 0 ? g * p[t] : g * f[t]);

  // value[s]: minimal cost from the next slot to the end if the level now is s steps
  let next = new Array(N + 1).fill(Infinity);
  for (let s = start; s <= N; s += 1) next[s] = 0;

  for (let t = T - 1; t >= 0; t -= 1) {
    const cur = new Array(N + 1).fill(Infinity);
    const surplus = Math.max(0, -r[t]);
    const need = Math.max(0, r[t]);
    for (let s = 0; s <= N; s += 1) {
      let best = Infinity;
      for (let k = -kmax; k <= kmax; k += 1) {
        const s2 = s + k;
        if (s2 < 0 || s2 > N || next[s2] === Infinity) continue;
        let ac;
        if (k > 0) ac = (k * step) / eta; // energy taken from the house/grid
        else ac = k * step * eta; // energy delivered (negative)
        if (k > 0 && !allowGridCharge && ac > surplus + 1e-9) continue;
        if (k < 0 && -ac > need + 1e-9) continue; // no battery export
        const total = gridCost(r[t] + ac, t) + next[s2];
        if (total < best) best = total;
      }
      cur[s] = best;
    }
    next = cur;
  }
  return next[start];
}

/** Net cost of the same day without any battery (Rp.). */
function noBatteryCost({ r, p, f }) {
  let c = 0;
  r.forEach((g, t) => {
    c += g > 0 ? g * p[t] : g * f[t];
  });
  return c;
}

/** All shadow figures of one day. Rp.; `actual` is the measured grid cost at dynamic prices. */
function analyzeDay(day, params) {
  const { r, p, f } = day;
  const noBattery = noBatteryCost({ r, p, f });
  const pvOnly = optimalCost({
    r, p, f, ...params, allowGridCharge: false,
  });
  const withGrid = optimalCost({
    r, p, f, ...params, allowGridCharge: true,
  });
  return {
    key: day.key,
    noBattery,
    actual: day.actual,
    pvOnly,
    withGrid,
    gridChargeValue: pvOnly - withGrid,
    unused: day.actual - withGrid,
    batteryGain: noBattery - day.actual,
  };
}

module.exports = { optimalCost, noBatteryCost, analyzeDay };
