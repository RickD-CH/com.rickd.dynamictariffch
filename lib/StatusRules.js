'use strict';

/**
 * Rules behind the status card and the "meter readings missing" alarm. Pure functions, no
 * Homey dependency. Levels: 'ok' < 'warn' < 'alarm'; 'none' = nothing to judge, 'off' = switched off.
 */

const GRID_KINDS = ['import', 'export', 'battery_charge', 'battery_discharge'];
const RANK = {
  none: 0, off: 0, ok: 1, warn: 2, alarm: 3,
};
const DEFAULT_HOURS = 1;
const MAX_HOURS = 48;
const RED_FACTOR = 6; // alarm level after 6 times the threshold, at least 6 hours

const worst = (levels) => levels.reduce((a, l) => (RANK[l] > RANK[a] ? l : a), 'none');

/** Sanitised monitoring threshold in hours; 0 = off. Invalid input falls back to the default. */
function normalizeHours(v) {
  if (v === null || v === undefined || v === '') return DEFAULT_HOURS;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > MAX_HOURS) return DEFAULT_HOURS;
  return Math.round(n * 4) / 4;
}

/**
 * Meter readings: a kind is monitored as soon as it has been reported at least once, so
 * users without any reporting Flow never see a warning.
 * @param {{now:number, last:Object<string,number|null>, consumers?:Object<string,number|null>, thresholdHours:number}} o
 */
function assessReports({
  now, last, consumers = {}, thresholdHours,
}) {
  const hours = normalizeHours(thresholdHours);
  const kinds = GRID_KINDS.map((kind) => {
    const t = last && typeof last[kind] === 'number' ? last[kind] : null;
    return {
      kind, last: t, ageMin: t === null ? null : Math.max(0, Math.round((now - t) / 60000)), level: 'none',
    };
  });
  const consumerList = Object.entries(consumers).map(([name, t]) => ({
    name,
    last: typeof t === 'number' ? t : null,
    ageMin: typeof t === 'number' ? Math.max(0, Math.round((now - t) / 60000)) : null,
  }));
  const monitored = kinds.some((k) => k.last !== null);
  if (hours === 0) {
    return {
      monitored, level: 'off', thresholdHours: 0, kinds, consumers: consumerList, stale: [],
    };
  }
  const warnMin = hours * 60;
  const alarmMin = Math.max(6, hours * RED_FACTOR) * 60;
  for (const k of kinds) {
    if (k.last === null) continue;
    if (k.ageMin > alarmMin) k.level = 'alarm';
    else if (k.ageMin > warnMin) k.level = 'warn';
    else k.level = 'ok';
  }
  const level = worst(kinds.map((k) => k.level));
  return {
    monitored,
    level,
    thresholdHours: hours,
    kinds,
    consumers: consumerList,
    stale: kinds.filter((k) => k.level === 'warn' || k.level === 'alarm').map((k) => k.kind),
  };
}

/**
 * Price data health.
 * @param {{unavailable:boolean, haveCurrentPrice:boolean, failures:number, lastOkAgeMin:number|null, tomorrowMissingAfterCutoff:boolean}} o
 */
function assessPrices({
  unavailable, haveCurrentPrice, failures, lastOkAgeMin, tomorrowMissingAfterCutoff,
}) {
  const issues = [];
  let level = 'ok';
  const raise = (l, code) => {
    issues.push(code); level = worst([level, l]);
  };
  if (unavailable) raise('alarm', 'auth');
  if (!haveCurrentPrice) raise('alarm', 'no_current_price');
  if (failures >= 3) raise('warn', 'fetch_failing');
  if (lastOkAgeMin !== null && lastOkAgeMin > 26 * 60) raise('warn', 'stale');
  if (tomorrowMissingAfterCutoff) raise('warn', 'no_tomorrow');
  return { level, issues };
}

function overallLevel(levels) {
  const l = worst(levels);
  return l === 'none' || l === 'off' ? 'ok' : l;
}

module.exports = {
  GRID_KINDS, DEFAULT_HOURS, normalizeHours, assessReports, assessPrices, overallLevel,
};
