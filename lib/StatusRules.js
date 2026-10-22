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
 * Meter readings: a kind is monitored as soon as it has been reported at least once (and is not
 * switched off), so users without any reporting Flow never see a warning. Consumers are only
 * monitored when listed in `monitoredConsumers`.
 * @param {{now:number, last:Object<string,number|null>, consumers?:Object<string,number|null>, thresholdHours:number,
 *   enabledKinds?:Object<string,boolean>, monitoredConsumers?:string[]}} o
 */
function assessReports({
  now, last, consumers = {}, thresholdHours, enabledKinds, monitoredConsumers = [],
}) {
  const hours = normalizeHours(thresholdHours);
  const age = (t) => (typeof t === 'number' ? Math.max(0, Math.round((now - t) / 60000)) : null);
  const kinds = GRID_KINDS.map((kind) => {
    const t = last && typeof last[kind] === 'number' ? last[kind] : null;
    return {
      kind, last: t, ageMin: age(t), enabled: !enabledKinds || enabledKinds[kind] !== false, level: 'none',
    };
  });
  const consumerList = Object.entries(consumers).map(([name, t]) => ({
    name,
    last: typeof t === 'number' ? t : null,
    ageMin: age(t),
    monitored: monitoredConsumers.includes(name),
    level: 'none',
  }));
  const monitored = kinds.some((k) => k.last !== null);
  if (hours === 0) {
    return {
      monitored, level: 'off', thresholdHours: 0, kinds, consumers: consumerList, stale: [], staleConsumers: [],
    };
  }
  const warnMin = hours * 60;
  const alarmMin = Math.max(6, hours * RED_FACTOR) * 60;
  const judge = (item) => {
    if (item.last === null) return;
    if (item.ageMin > alarmMin) item.level = 'alarm';
    else if (item.ageMin > warnMin) item.level = 'warn';
    else item.level = 'ok';
  };
  kinds.filter((k) => k.enabled).forEach(judge);
  consumerList.filter((c) => c.monitored).forEach(judge);
  const late = (x) => x.level === 'warn' || x.level === 'alarm';
  return {
    monitored,
    level: worst([...kinds.map((k) => k.level), ...consumerList.map((c) => c.level)]),
    thresholdHours: hours,
    kinds,
    consumers: consumerList,
    stale: kinds.filter(late).map((k) => k.kind),
    staleConsumers: consumerList.filter(late).map((c) => c.name),
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
