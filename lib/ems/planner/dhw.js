'use strict';

/**
 * Warmwasser-Programm bei günstigem Preis, unabhängig von der SG-Ready-Steuerung (sgready.js): wenn die aktuelle Viertelstunde zu den
 * günstigsten `cheapHours` Stunden des Tages gehört und das Warmwasser unter `belowTemp` liegt, wird das Warmwasser-Programm der Wärmepumpe gestartet (Flow, z. B. Modbus-Betriebsart,
 * oder Capability einer App) und beim Ende wieder auf Normal gesetzt. Die Entscheidung ist dieselbe Zustandsmaschine wie bei SG-Ready
 * (Einschaltverzögerung, Mindestlaufzeit, Ausschaltverzögerung, Abkühlpause, Zieltemperatur, Betriebsart), nur ohne Sonnen-Auslöser
 * (`dhwToSgCfg`). Übernimmt SG-Ready wegen Sonne, wird das Warmwasser-Programm beendet (Sonne hat Vorrang).
 */

const { normalizeSgReady } = require('./sgready');
const { startOfLocalDay, addLocalDays } = require('../../time');

const SLOT_MS = 15 * 60 * 1000;

const DEFAULTS = Object.freeze({
  enabled: false,
  live: false, // sonst nur simulieren (Silent-Modus gilt zusätzlich)
  cheapHours: 2, // Auslöser: die günstigsten N Stunden des (lokalen) Tages
  belowTemp: 45, // nur starten, wenn das Warmwasser darunter liegt (0 = keine Prüfung)
  targetTemp: 56, // Programm beenden, sobald das Warmwasser diese Temperatur erreicht
  skipPv: true, // nicht per Preis starten, solange die Sonne heute noch genug liefert
  skipPvKwh: 6,
  skipPvUntil: '17:00', // nur bis zu dieser Uhrzeit zählt die Sonnenprognose
  startDelayMin: 10,
  minRunMin: 90,
  stopDelayMin: 8,
  cooldownMin: 30,
  sensorId: '',
  tempCapability: 'measure_temperature',
  modeId: '',
  modeCapability: '',
  modeOkValue: '',
  output: 'flows', // 'flows' | 'capability'
  flowOn: Object.freeze({ id: '', advanced: false, name: '' }),
  flowOff: Object.freeze({ id: '', advanced: false, name: '' }),
  device: Object.freeze({
    deviceId: '', capability: '', onValue: '', offValue: '',
  }),
});

function normalizeFlow(f) {
  const s = f && typeof f === 'object' ? f : {};
  return { id: typeof s.id === 'string' ? s.id : '', advanced: s.advanced === true, name: typeof s.name === 'string' ? s.name : '' };
}

function normalizeDevice(r) {
  const s = r && typeof r === 'object' ? r : {};
  const str = (x) => (typeof x === 'string' ? x : '');
  return {
    deviceId: str(s.deviceId), capability: str(s.capability), onValue: str(s.onValue), offValue: str(s.offValue),
  };
}

function normalizeDhw(v) {
  const d = DEFAULTS;
  const s = v && typeof v === 'object' ? v : {};
  // Zahlen und Uhrzeit prüft dieselbe Normalisierung wie bei SG-Ready
  const n = normalizeSgReady({
    priceBelowTemp: s.belowTemp,
    targetTemp: s.targetTemp,
    priceSkipPvKwh: s.skipPvKwh,
    windowTo: s.skipPvUntil,
    startDelayMin: s.startDelayMin,
    minRunMin: s.minRunMin,
    stopDelayMin: s.stopDelayMin,
    cooldownMin: s.cooldownMin,
  });
  return {
    enabled: s.enabled === true,
    live: s.live === true,
    cheapHours: Math.min(12, Math.max(0.25, Math.round((Number.isFinite(Number(s.cheapHours)) ? Number(s.cheapHours) : d.cheapHours) * 4) / 4)),
    belowTemp: n.priceBelowTemp,
    targetTemp: n.targetTemp,
    skipPv: s.skipPv !== false,
    skipPvKwh: n.priceSkipPvKwh,
    skipPvUntil: n.windowTo,
    startDelayMin: n.startDelayMin,
    minRunMin: n.minRunMin,
    stopDelayMin: n.stopDelayMin,
    cooldownMin: n.cooldownMin,
    sensorId: typeof s.sensorId === 'string' ? s.sensorId : '',
    tempCapability: typeof s.tempCapability === 'string' && s.tempCapability ? s.tempCapability : d.tempCapability,
    modeId: typeof s.modeId === 'string' ? s.modeId : '',
    modeCapability: typeof s.modeCapability === 'string' ? s.modeCapability : '',
    modeOkValue: typeof s.modeOkValue === 'string' ? s.modeOkValue : '',
    output: s.output === 'capability' ? 'capability' : 'flows',
    flowOn: normalizeFlow(s.flowOn),
    flowOff: normalizeFlow(s.flowOff),
    device: normalizeDevice(s.device),
  };
}

/** Einstellungen als SG-Ready-Konfiguration ohne Sonnen-Auslöser, mit Preis-Auslöser und dem Zustand «dhw». */
function dhwToSgCfg(d) {
  return normalizeSgReady({
    enabled: true,
    sunTrigger: false,
    usePrice: true,
    priceBelowTemp: d.belowTemp,
    priceSkipPv: d.skipPv,
    priceSkipPvKwh: d.skipPvKwh,
    windowTo: d.skipPvUntil,
    priceAction: 'dhw',
    targetTemp: d.targetTemp,
    startDelayMin: d.startDelayMin,
    minRunMin: d.minRunMin,
    stopDelayMin: d.stopDelayMin,
    cooldownMin: d.cooldownMin,
    allowForced: false,
  });
}

/**
 * Die günstigsten `hours` Stunden (Viertelstunden, nicht zwingend zusammenhängend) eines lokalen Tages.
 * @param {{start:number,end:number,price:number}[]} slots  Preise in Rp./kWh
 * @param {number} nowMs  bestimmt den Tag (dayOffset 0 = heute, 1 = morgen)
 * @returns {{ranges:{startMs:number,endMs:number}[], avgRp:number, count:number, starts:Set<number>}|null}  null, wenn der Tag (noch) nicht
 *   genug Preise hat (z. B. morgen vor der Veröffentlichung)
 */
function cheapestOfDay(slots, nowMs, tz, hours, dayOffset = 0) {
  const day0 = addLocalDays(startOfLocalDay(new Date(nowMs), tz), dayOffset, tz).getTime();
  const day1 = addLocalDays(new Date(day0), 1, tz).getTime();
  const inDay = (slots || []).filter((s) => Number.isFinite(s.price) && s.start >= day0 && s.start < day1);
  const n = Math.max(1, Math.round(hours * 4));
  if (inDay.length < n) return null;
  const chosen = [...inDay].sort((a, b) => (a.price - b.price) || (a.start - b.start)).slice(0, n).sort((a, b) => a.start - b.start);
  const ranges = [];
  for (const s of chosen) {
    const end = s.end || s.start + SLOT_MS;
    const last = ranges[ranges.length - 1];
    if (last && last.endMs === s.start) last.endMs = end;
    else ranges.push({ startMs: s.start, endMs: end });
  }
  const avgRp = chosen.reduce((a, s) => a + s.price, 0) / chosen.length;
  return {
    ranges, avgRp, count: n, starts: new Set(chosen.map((s) => s.start)),
  };
}

/** Vorschau für heute und morgen (ohne die interne Menge): Zeiträume in ms und Durchschnittspreis, null wenn der Tag unbekannt ist. */
function cheapestPreview(slots, nowMs, tz, hours) {
  const strip = (c) => (c ? { ranges: c.ranges, avgRp: Math.round(c.avgRp * 100) / 100, count: c.count } : null);
  const today = cheapestOfDay(slots, nowMs, tz, hours, 0);
  const nowQ = Math.floor(nowMs / SLOT_MS) * SLOT_MS;
  return {
    today: strip(today), tomorrow: strip(cheapestOfDay(slots, nowMs, tz, hours, 1)), nowCheap: today ? today.starts.has(nowQ) : null,
  };
}

/** Preise von heute und morgen für die Vorschau in den Einstellungen: [[startMs, Rp./kWh], ...] je Tag. */
function priceDays(slots, nowMs, tz) {
  const day0 = startOfLocalDay(new Date(nowMs), tz).getTime();
  const day1 = addLocalDays(new Date(day0), 1, tz).getTime();
  const day2 = addLocalDays(new Date(day0), 2, tz).getTime();
  const pick = (a, b) => (slots || []).filter((s) => Number.isFinite(s.price) && s.start >= a && s.start < b).map((s) => [s.start, s.price]);
  return { today: pick(day0, day1), tomorrow: pick(day1, day2) };
}

module.exports = {
  DEFAULTS, normalizeDhw, dhwToSgCfg, cheapestOfDay, cheapestPreview, priceDays,
};
