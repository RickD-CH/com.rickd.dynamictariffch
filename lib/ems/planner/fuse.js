'use strict';

/**
 * Hausanschluss-Schutz: hält jede Phase unter der Grenze der Hausanschluss-Sicherung.
 * Reine Funktionen, keine Homey-Aufrufe, keine festen Geräte.
 *
 * Zwei Stufen:
 *   1. Drosseln (vorbeugend, bei jedem Lauf): die Wallbox bekommt höchstens so viel Strom, wie auf der knappsten Phase,
 *      die sie nutzt, noch frei ist (Grenze minus Hausverbrauch auf dieser Phase). Unter dem Mindeststrom wird gestoppt.
 *   2. Abschalten: liegt eine Phase trotzdem länger als die Wartezeit über der Grenze, wird der nächste laufende Eintrag
 *      der Abschalt-Liste ausgeschaltet (Wallbox, Sauna, ...), danach nach jeweils einer weiteren Wartezeit der nächste.
 * Freigabe: alle Phasen mindestens 2 A unter der Grenze während `restoreMin`. Die Wallbox darf dann wieder laden;
 * ausgeschaltete Geräte schaltet die App nicht wieder ein.
 */

const VOLT = 230;
const HYSTERESIS_A = 2;
const MAX_SHED = 8;
const DEFAULT_CAPS = ['measure_current.phase1', 'measure_current.phase2', 'measure_current.phase3'];

function normalizeFlowRef(f) {
  if (!f || typeof f !== 'object' || typeof f.id !== 'string' || !f.id) return null;
  return { id: f.id, advanced: f.advanced === true, name: typeof f.name === 'string' ? f.name : '' };
}

function normalizeShed(e) {
  if (!e || typeof e !== 'object') return null;
  if (e.kind === 'charger') return { kind: 'charger' };
  if (e.kind === 'device' && typeof e.id === 'string' && e.id) return { kind: 'device', id: e.id, name: typeof e.name === 'string' ? e.name : '' };
  if (e.kind === 'flow') {
    const flow = normalizeFlowRef(e.flow);
    return flow ? { kind: 'flow', flow, name: typeof e.name === 'string' && e.name ? e.name : flow.name } : null;
  }
  return null;
}

/** Einstellungen prüfen. Standard: aus, Sicherung 40 A, Reserve 90 %, Abschalt-Liste = Wallbox. */
function normalizeFuse(f) {
  const s = f && typeof f === 'object' ? f : {};
  const num = (v, fb, lo, hi) => {
    const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fb;
  };
  const caps = Array.isArray(s.caps) && s.caps.length === 3 && s.caps.every((c) => typeof c === 'string') ? s.caps.slice() : DEFAULT_CAPS.slice();
  const seen = new Set();
  const shed = (Array.isArray(s.shed) ? s.shed : [{ kind: 'charger' }])
    .map(normalizeShed)
    .filter((e) => {
      if (!e) return false;
      const k = e.kind === 'device' ? `d:${e.id}` : (e.kind === 'flow' ? `f:${e.flow.id}` : 'charger');
      if (seen.has(k)) return false;
      seen.add(k); return true;
    })
    .slice(0, MAX_SHED);
  return {
    enabled: s.enabled === true,
    live: s.live === true, // sonst nur simulieren (Silent-Modus gilt zusätzlich)
    amps: Math.round(num(s.amps, 40, 6, 250)),
    reservePct: Math.round(num(s.reservePct, 90, 50, 100)),
    meterId: typeof s.meterId === 'string' ? s.meterId : '', // leer = Netzzähler
    caps,
    throttle: s.throttle !== false, // Wallbox vorbeugend drosseln
    holdS: Math.round(num(s.holdS, 10, 0, 120)),
    restoreMin: Math.round(num(s.restoreMin, 5, 1, 60)),
    shed,
  };
}

function limitA(fuse) {
  return Math.round(fuse.amps * fuse.reservePct) / 100;
}

function maxPhase(phasesA) {
  let max = null;
  let phase = null;
  (phasesA || []).forEach((v, k) => {
    if (Number.isFinite(v) && (max === null || v > max)) {
      max = v; phase = k + 1;
    }
  });
  return { max, phase };
}

/**
 * Höchster Wallbox-Strom (A pro Phase), bei dem keine genutzte Phase über die Grenze geht.
 * Der Strom der Wallbox wird aus ihrer Leistung geschätzt; einphasig lädt sie auf Phase 1.
 * @returns {number|null} null = keine Messung
 */
function chargerCapAmps({
  phasesA, limit, chargerW, chargerPhases, maxAmps,
}) {
  const ph = chargerPhases === 1 ? 1 : 3;
  const used = ph === 1 ? [0] : [0, 1, 2];
  const own = Math.max(0, Number(chargerW) || 0) / (ph * VOLT);
  let free = null;
  for (const k of used) {
    const v = phasesA && phasesA[k];
    if (!Number.isFinite(v)) continue;
    const f = limit - (v - own);
    free = free === null ? f : Math.min(free, f);
  }
  if (free === null) return null;
  return Math.max(0, Math.min(maxAmps, Math.floor(free)));
}

function makeFuseState() {
  return {
    overSince: null, clearSince: null, lastShedAt: null, level: 0, shed: [],
  };
}

/**
 * Einen Schritt weiter: muss jetzt etwas abgeschaltet oder darf freigegeben werden?
 * `entries` = Abschalt-Liste mit `active` (läuft gerade) und einem Schlüssel `key`.
 * @returns {{ action:'none'|'shed'|'release', entry:object|null, over:boolean, max:number|null, phase:number|null }}
 */
function stepFuse({
  st, phasesA, limit, nowMs, holdMs, restoreMs, entries,
}) {
  const { max, phase } = maxPhase(phasesA);
  const base = {
    action: 'none', entry: null, max, phase, over: false,
  };
  if (max === null) return base; // keine Messung: nichts ändern
  if (max > limit) {
    st.clearSince = null;
    if (st.overSince === null) st.overSince = nowMs;
    const waited = nowMs - st.overSince >= holdMs;
    const gap = st.lastShedAt === null || nowMs - st.lastShedAt >= Math.max(holdMs, 5000);
    if (waited && gap) {
      const next = entries.find((e) => e.active && !st.shed.includes(e.key));
      if (next) {
        st.shed.push(next.key);
        st.level = st.shed.length;
        st.lastShedAt = nowMs;
        return {
          ...base, over: true, action: 'shed', entry: next,
        };
      }
    }
    return { ...base, over: true };
  }
  st.overSince = null;
  if (st.shed.length) {
    if (max <= limit - HYSTERESIS_A) {
      if (st.clearSince === null) st.clearSince = nowMs;
      if (nowMs - st.clearSince >= restoreMs) {
        st.shed = []; st.level = 0; st.clearSince = null; st.lastShedAt = null;
        return { ...base, action: 'release' };
      }
    } else {
      st.clearSince = null;
    }
  }
  return base;
}

module.exports = {
  VOLT, HYSTERESIS_A, MAX_SHED, DEFAULT_CAPS, normalizeFuse, limitA, maxPhase, chargerCapAmps, makeFuseState, stepFuse,
};
