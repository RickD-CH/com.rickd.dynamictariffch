'use strict';

/**
 * Elektroauto: Ziel-Ladestand zur Abfahrt. Reine Funktionen, keine Homey-Aufrufe.
 *
 * Quellen der Abfahrt, in dieser Reihenfolge:
 *   1. «Nächste Abfahrt» (override) für ein bestimmtes Datum: überschreibt den Kalender an diesem Tag (auch «kein Laden»)
 *   2. Wochenkalender (Mo bis So: an/aus, Uhrzeit, Ziel-SoC); im Ferienmodus pausiert (optional bis und mit einem Datum)
 *
 * Solarstrom wird bevorzugt: Viertelstunden mit erwartetem Überschuss zählen bei der Auswahl als kostenlos.
 *
 * Geplant wird mit dem aktuellen Ladestand: benötigte Energie = (Ziel - Ladestand) / 100 x Batteriegrösse, verteilt auf die
 * günstigsten Viertelstunden bis zur Abfahrt. «Netz nachladen» aus = nur Solarstrom (die normale Überschuss-Regel), kein Plan.
 * Bei jedem Lauf wird neu gerechnet; ist das Ziel erreicht, wird nicht mehr geladen.
 */

const {
  localParts, fromLocal, addLocalDays, parseHHMM,
} = require('../../time');
const { planJob } = require('./jobs');

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const Q = 15 * 60 * 1000;

const pad = (n) => String(n).padStart(2, '0');

/** Kalender prüfen und mit Standardwerten ergänzen (alle Tage aus, 06:00, 80 %). */
function normalizeSchedule(s) {
  const src = s && typeof s === 'object' ? s : {};
  const days = {};
  const validTime = (t, fb) => {
    try {
      parseHHMM(t); return String(t).trim();
    } catch (err) {
      return fb;
    }
  };
  const soc = (v, fb) => {
    const n = Number(v); return Number.isFinite(n) ? Math.min(100, Math.max(10, Math.round(n))) : fb;
  };
  for (const d of DAYS) {
    const e = src.days && typeof src.days[d] === 'object' ? src.days[d] : {};
    days[d] = { on: e.on === true, time: validTime(e.time, '06:00'), soc: soc(e.soc, 80) };
  }
  const o = src.override && typeof src.override === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(String(src.override.date || '')) ? src.override : null;
  return {
    days,
    holiday: src.holiday === true,
    holidayUntil: /^\d{4}-\d{2}-\d{2}$/.test(String(src.holidayUntil || '')) ? String(src.holidayUntil) : '', // leer = bis ausgeschaltet
    gridCharge: src.gridCharge !== false, // «Netz nachladen» (force load), Standard an
    override: o ? {
      date: String(o.date), on: o.on !== false, time: validTime(o.time, '06:00'), soc: soc(o.soc, 80),
    } : null,
  };
}

function dateKey(lp) {
  return `${lp.year}-${pad(lp.month)}-${pad(lp.day)}`;
}

/**
 * Nächste Abfahrt ab jetzt (bis 8 Tage voraus).
 * @returns {{ at:number, soc:number, source:'override'|'calendar', date:string } | null}
 */
function nextDeparture({ schedule, nowMs, tz }) {
  const sc = normalizeSchedule(schedule);
  for (let d = 0; d <= 7; d++) {
    const lp = localParts(addLocalDays(new Date(nowMs), d, tz), tz);
    const key = dateKey(lp);
    const weekday = DAYS[new Date(Date.UTC(lp.year, lp.month - 1, lp.day)).getUTCDay()];
    let entry = null;
    let source = 'calendar';
    if (sc.override && sc.override.date === key) {
      if (!sc.override.on) continue; // an diesem Tag ausdrücklich kein Ziel
      entry = sc.override;
      source = 'override';
    } else if (!(sc.holiday && (!sc.holidayUntil || key <= sc.holidayUntil)) && sc.days[weekday].on) {
      entry = sc.days[weekday];
    }
    if (!entry) continue;
    const t = parseHHMM(entry.time);
    const at = fromLocal(lp.year, lp.month, lp.day, t.hour, t.minute, tz).getTime();
    if (at > nowMs) {
      return {
        at, soc: entry.soc, source, date: key,
      };
    }
  }
  return null;
}

/**
 * Was soll das Auto jetzt tun?
 * @returns {{ state:'none'|'no_soc'|'no_capacity'|'reached'|'solar_only'|'planned'|'short', wantOn:boolean, starts:number[],
 *             needKwh:number|null, departure:object|null, reason:string, plan:object|null }}
 *   state 'short' = es reicht nicht ganz (zu wenig Zeit oder Preise fehlen); es wird trotzdem in den gewählten Viertelstunden geladen.
 */
/**
 * Solarstrom bevorzugen: Viertelstunden, in denen die Prognose genug Überschuss erwarten lässt (PV minus Grundlast
 * mindestens die kleinste Ladeleistung), zählen bei der Auswahl als kostenlos.
 */
function solarAdjusted(slots, pvKwAt, baseLoadKw = 0.5, minChargeKw = 1.4) {
  if (typeof pvKwAt !== 'function') return slots;
  return slots.map((s) => {
    const pv = pvKwAt(s.start);
    return Number.isFinite(pv) && pv - baseLoadKw >= minChargeKw ? { ...s, price: 0, solar: true } : s;
  });
}

function carPlan({
  schedule, nowMs, tz, soc, capacityKwh, powerKw, slots, pvKwAt = null,
}) {
  const sc = normalizeSchedule(schedule);
  const departure = nextDeparture({ schedule: sc, nowMs, tz });
  const base = {
    wantOn: false, starts: [], needKwh: null, departure, plan: null,
  };
  if (!departure) return { ...base, state: 'none', reason: 'kein Ziel' };
  if (soc === null || soc === undefined || !Number.isFinite(Number(soc))) return { ...base, state: 'no_soc', reason: 'Ladestand des Autos unbekannt' };
  if (!(capacityKwh > 0)) return { ...base, state: 'no_capacity', reason: 'Batteriegrösse des Autos fehlt' };
  if (Number(soc) >= departure.soc) return { ...base, state: 'reached', reason: `Ziel ${departure.soc} % erreicht` };
  const needKwh = Math.round((((departure.soc - Number(soc)) / 100) * capacityKwh) * 10) / 10;
  if (!sc.gridCharge) {
    return {
      ...base, needKwh, state: 'solar_only', reason: `nur Solarstrom (noch ${needKwh} kWh bis ${departure.soc} %)`,
    };
  }
  const plan = planJob({
    slots: solarAdjusted(slots, pvKwAt), nowMs, deadlineMs: departure.at, hours: needKwh / Math.max(0.5, powerKw),
  });
  const nowQ = Math.floor(nowMs / Q) * Q;
  const wantOn = plan.starts.includes(nowQ);
  const lt = localParts(new Date(departure.at), tz);
  return {
    ...base,
    needKwh,
    plan,
    starts: plan.starts,
    wantOn,
    state: plan.feasible ? 'planned' : 'short',
    reason: `Auto-Ziel ${departure.soc} % bis ${lt.day}.${lt.month}. ${pad(lt.hour)}:${pad(lt.minute)} (${needKwh} kWh)`,
  };
}

module.exports = {
  DAYS, normalizeSchedule, nextDeparture, carPlan, solarAdjusted,
};
