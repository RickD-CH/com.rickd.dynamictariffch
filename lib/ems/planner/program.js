'use strict';

/**
 * Verbraucher-Typ «Programm starten»: ein einziger Start-Befehl statt Dauerschalten (Geschirrspüler, Waschmaschine,
 * Tumbler - Geräte, die ihr Programm nach dem Start selbst zu Ende fahren).
 *
 * Reihenfolge pro Lauf:
 *   1. Heute schon gestartet? -> nichts tun (Tageszähler, kein Dauerlauf-Risiko).
 *   2. Fernbedienung nicht aktiv? -> nichts tun, egal was sonst zutrifft (zwingende Voraussetzung am Gerät selbst,
 *      z. B. Electrolux: ohne das kann gar kein Befehl ankommen).
 *   3. Tür offen (falls ein Türsensor gewählt ist)? -> nichts tun.
 *   4. Genug PV-Überschuss, mindestens `startSustainS` am Stück? -> jetzt starten.
 *   5. Innerhalb des Zeitfensters [windowFrom, windowFrom + maxWaitH]? Dann:
 *        - Frist erreicht (Ende des Fensters) -> jetzt starten (Sicherheitsnetz, egal zu welchem Preis).
 *        - sonst: ist die laufende Viertelstunde die günstigste im restlichen Fenster? -> jetzt starten.
 *   6. Sonst warten.
 *
 * `durationH` ist nur zur Information (wie lange das Programm normalerweise dauert) und fliesst nicht in die
 * Zeitwahl ein - das Gerät fährt sein Programm nach dem Start selbst.
 */

const { localParts, localDateKey } = require('../../time');

const DEFAULTS = Object.freeze({
  enabled: false,
  windowFrom: '18:00',
  maxWaitH: 4,
  durationH: 3,
  minSurplusW: 2000,
  startSustainS: 300,
  remoteCapability: '',
  remoteOkValue: 'Enabled',
  doorCapability: '',
  doorOkValue: 'Closed',
  startCapability: 'dishwasher_execute_command',
  startValue: 'START',
});

function normalizeProgram(p) {
  const d = DEFAULTS;
  const s = p && typeof p === 'object' ? p : {};
  const num = (v, fb) => (Number.isFinite(Number(v)) ? Number(v) : fb);
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/.test(s.windowFrom) ? s.windowFrom : d.windowFrom;
  return {
    enabled: s.enabled === true,
    windowFrom: hhmm,
    maxWaitH: Math.min(12, Math.max(1, num(s.maxWaitH, d.maxWaitH))),
    durationH: Math.min(8, Math.max(0.5, num(s.durationH, d.durationH))),
    minSurplusW: Math.max(0, num(s.minSurplusW, d.minSurplusW)),
    startSustainS: Math.min(3600, Math.max(0, num(s.startSustainS, d.startSustainS))),
    remoteCapability: String(s.remoteCapability || d.remoteCapability),
    remoteOkValue: String(s.remoteOkValue || d.remoteOkValue),
    doorCapability: String(s.doorCapability || d.doorCapability),
    doorOkValue: String(s.doorOkValue || d.doorOkValue),
    startCapability: String(s.startCapability || d.startCapability),
    startValue: String(s.startValue || d.startValue),
  };
}

/** Heutiger Fensterbeginn (lokale Zeit `windowFrom`) und Ende (+ maxWaitH), unabhängig von der Prozess-Zeitzone. */
function windowOf(p, nowMs, tz) {
  const lp = localParts(new Date(nowMs), tz);
  const [fh, fm] = p.windowFrom.split(':').map(Number);
  const fromMs = nowMs + ((fh - lp.hour) * 60 + (fm - lp.minute)) * 60000 - lp.second * 1000;
  return { fromMs, toMs: fromMs + p.maxWaitH * 3600000 };
}

/**
 * @param {object} x { cfg (program-Teil, bereits normalisiert), st (okSince/badSince/programDay/programStartedAt),
 *   remoteValue, doorValue, exportW, slots, nowMs, tz }
 * @returns {{ start:boolean, reason:string }}
 */
function decideProgram({
  cfg, st, remoteValue, doorValue, exportW, slots, nowMs, tz = 'Europe/Zurich',
}) {
  const p = cfg;
  const day = localDateKey(new Date(nowMs), tz);
  if (st.programDay !== day) {
    st.programDay = day; st.programStartedAt = null; st.okSince = null; st.badSince = null;
  }
  if (st.programStartedAt) return { start: false, reason: 'heute schon gestartet' };
  if (p.remoteCapability && remoteValue !== p.remoteOkValue) {
    st.okSince = null;
    return { start: false, reason: `Fernbedienung nicht aktiv (${remoteValue === null || remoteValue === undefined ? 'unbekannt' : remoteValue})` };
  }
  if (p.doorCapability && doorValue !== p.doorOkValue) {
    st.okSince = null;
    return { start: false, reason: `Tür offen (${doorValue === null || doorValue === undefined ? 'unbekannt' : doorValue})` };
  }
  // PV-Überschuss, mindestens startSustainS am Stück (gleiches Muster wie die anderen Verbraucher)
  const surplusOk = Number.isFinite(exportW) && exportW >= p.minSurplusW;
  if (surplusOk) {
    if (!st.okSince) st.okSince = nowMs;
  } else st.okSince = null;
  if (surplusOk && nowMs - st.okSince >= p.startSustainS * 1000) {
    st.programStartedAt = nowMs;
    return { start: true, reason: `Start bei PV-Überschuss (${Math.round(exportW)} W)` };
  }
  const { fromMs, toMs } = windowOf(p, nowMs, tz);
  if (nowMs < fromMs) {
    return { start: false, reason: `wartet auf PV-Überschuss oder das Zeitfenster ab ${p.windowFrom}` };
  }
  if (nowMs >= toMs) {
    st.programStartedAt = nowMs;
    return { start: true, reason: 'Start: maximale Wartezeit erreicht (Preis-Sicherheitsnetz)' };
  }
  const nowQ = Math.floor(nowMs / 900000) * 900000;
  const priced = (slots || []).filter((s) => Number.isFinite(s.price) && s.start >= nowQ && s.start < toMs);
  if (!priced.length) return { start: false, reason: 'wartet auf PV-Überschuss oder Preise für das Zeitfenster' };
  const cheapest = [...priced].sort((a, b) => (a.price - b.price) || (a.start - b.start))[0];
  if (cheapest.start === nowQ) {
    st.programStartedAt = nowMs;
    return { start: true, reason: `Start: günstigster Moment im Zeitfenster (${cheapest.price.toFixed(1)} Rp.)` };
  }
  return { start: false, reason: `wartet auf PV-Überschuss oder den günstigsten Moment bis ${p.windowFrom} +${p.maxWaitH} h` };
}

module.exports = {
  DEFAULTS, normalizeProgram, decideProgram, windowOf,
};
