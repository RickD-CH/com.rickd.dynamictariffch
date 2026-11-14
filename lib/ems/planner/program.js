'use strict';

/**
 * Verbraucher-Typ «Programm starten»: ein einziger Start-Befehl statt Dauerschalten (Geschirrspüler, Waschmaschine,
 * Tumbler - Geräte, die ihr Programm nach dem Start selbst zu Ende fahren, auch mehrmals am Tag).
 *
 * Reihenfolge pro Lauf:
 *   1. Status-Capability zeigt einen anderen Wert als "bereit"? -> nichts tun. Deckt auch den Fall ab, dass jemand
 *      das Gerät von Hand gestartet hat (oder es noch läuft) - ohne das würden wir sonst mitten in den Lauf einen
 *      zweiten Start-Befehl schicken. Welche Capability/Wert "bereit" bedeutet, ist frei wählbar (jedes Gerät/jede
 *      Marke ist anders, manche haben so eine Capability gar nicht - dann bleibt das Feld leer und das entfällt).
 *   2. Fernbedienung nicht aktiv? -> nichts tun, egal was sonst zutrifft (zwingende Voraussetzung am Gerät selbst,
 *      z. B. Electrolux: ohne das kann gar kein Befehl ankommen). Auch frei wählbar, oder leer lassen.
 *   3. Tür offen (falls ein Türsensor gewählt ist)? -> nichts tun.
 *   4. Manueller Start (`forceNow`)? -> jetzt starten, unabhängig von allem Folgenden (siehe unten).
 *   5. **Kürzlich gestartet** (weniger als `durationH` her)? -> nichts tun (Abkühlpause, kein Takten mitten in
 *      ein laufendes Programm hinein). Kein Tages-Limit sonst - das Gerät darf am selben Tag mehrfach laufen.
 *   6. **Automatik nicht bewusst eingeschaltet?** -> nichts tun (siehe unten, wichtiger Sicherheitspunkt).
 *   7. Genug PV-Überschuss, mindestens `startSustainS` am Stück? -> jetzt starten.
 *   8. Nur wenn heute noch nichts gestartet wurde (PV-Überschuss darf öfter): innerhalb des Zeitfensters [windowFrom, windowFrom + maxWaitH]? Dann:
 *        - Frist erreicht (Ende des Fensters) -> jetzt starten (Sicherheitsnetz, egal zu welchem Preis).
 *        - sonst: ist die laufende Viertelstunde die günstigste im restlichen Fenster? -> jetzt starten.
 *   9. Sonst warten.
 *
 * **Fernbedienung an heisst nur «bereit», nicht «darf automatisch starten».** Richard braucht Fernstart manchmal
 * auch nur, damit die Electrolux-App ein spezielles, nur dort wählbares Programm starten kann - das darf unser EMS
 * nicht einfach übersteuern, bloss weil Fernbedienung zufällig an ist. Die automatische PV-/Preis-Logik läuft
 * deshalb nur, wenn zusätzlich **Automatik** bewusst eingeschaltet ist (`st.programArmed`, über Widget oder Flow,
 * Standard aus, jeden Tag neu). Der manuelle Start (`forceNow`) ist davon unabhängig immer möglich, sobald die
 * zwingenden Voraussetzungen erfüllt sind - das ist ja schon die bewusste Wahl.
 *
 * `durationH` (übliche Programmdauer) ist die einzige Bremse gegen ein sofortiges erneutes Auslösen - kein
 * fixes Tages-Limit: Richard will z. B. den Geschirrspüler auch mehrmals am Tag automatisch starten können.
 */

const { localParts, localDateKey } = require('../../time');

const formatHM = (ms, tz) => {
  const lp = localParts(new Date(ms), tz);
  return `${String(lp.hour).padStart(2, '0')}:${String(lp.minute).padStart(2, '0')}`;
};

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
  stateCapability: '',
  stateIdleValue: '',
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
    stateCapability: String(s.stateCapability || d.stateCapability),
    stateIdleValue: String(s.stateIdleValue || d.stateIdleValue),
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
 * @param {object} x { cfg (program-Teil, bereits normalisiert), st (okSince/badSince/programDay/programStartedAt/
 *   programArmed), remoteValue, doorValue, stateValue, exportW, slots, nowMs, tz, forceNow (manuell: sofort
 *   starten, siehe unten) }
 * @returns {{ start:boolean, reason:string, blocked:'state'|'door'|'remote'|'cooldown'|'armed'|null,
 *   deadlineMs:number|null }}
 *   `blocked` nennt eine zwingende Voraussetzung, die gerade nicht erfüllt ist (fürs Widget: Knopf ausgegraut mit
 *   Grund, statt ihn einfach nichts tun zu lassen). `deadlineMs` ist das Ende des heutigen Zeitfensters, auch wenn
 *   gerade gewartet wird (für «spätestens um HH:MM» in der Anzeige).
 *
 * `forceNow` (manueller Start, z. B. Widget-Knopf): überspringt die Abkühlpause und die PV-/Preis-Wahl - startet
 * sofort, sobald die zwingenden Voraussetzungen (Status/Fernbedienung/Tür) erfüllt sind. Ein bewusster Klick zählt
 * mehr als die automatische Abkühlpause (die nur die automatische Logik vor sich selbst schützt, nicht vor einer
 * gewollten zweiten Ladung).
 */
function decideProgram({
  cfg, st, remoteValue, doorValue, stateValue, exportW, slots, nowMs, tz = 'Europe/Zurich', forceNow = false,
}) {
  const p = cfg;
  const day = localDateKey(new Date(nowMs), tz);
  if (st.programDay !== day) {
    // Echter Tageswechsel (nicht der allererste Lauf überhaupt) -> Automatik wieder aus, muss neu eingeschaltet
    // werden. Beim allerersten Lauf (programDay noch nie gesetzt) NICHT zurücksetzen: sonst würde das Einschalten
    // der Automatik sofort wieder verworfen, wenn im selben Moment der erste Lauf für dieses Gerät passiert.
    if (st.programDay !== undefined && st.programDay !== null) st.programArmed = false;
    st.programDay = day; st.okSince = null; st.badSince = null;
  }
  const { fromMs, toMs } = windowOf(p, nowMs, tz);
  // Läuft das Gerät schon (von Hand gestartet, oder noch vom letzten Mal)? Dann nicht nochmals einen Befehl senden.
  // Nur wenn eine Status-Capability gewählt ist - sonst kennen wir den Ist-Zustand des Geräts gar nicht.
  if (p.stateCapability && stateValue !== p.stateIdleValue) {
    st.okSince = null;
    return {
      start: false, reason: `Gerät nicht bereit (Status: ${stateValue === null || stateValue === undefined ? 'unbekannt' : stateValue})`, blocked: 'state', deadlineMs: toMs,
    };
  }
  if (p.remoteCapability && remoteValue !== p.remoteOkValue) {
    st.okSince = null;
    return {
      start: false, reason: `Fernbedienung nicht aktiv (${remoteValue === null || remoteValue === undefined ? 'unbekannt' : remoteValue})`, blocked: 'remote', deadlineMs: toMs,
    };
  }
  if (p.doorCapability && doorValue !== p.doorOkValue) {
    st.okSince = null;
    return {
      start: false, reason: `Tür offen (${doorValue === null || doorValue === undefined ? 'unbekannt' : doorValue})`, blocked: 'door', deadlineMs: toMs,
    };
  }
  if (forceNow) {
    st.programStartedAt = nowMs;
    return {
      start: true, reason: 'Manuell gestartet', blocked: null, deadlineMs: toMs,
    };
  }
  // Abkühlpause statt Tages-Limit: kein neuer Befehl, solange das letzte Programm noch laufen dürfte - danach
  // (auch mehrmals am selben Tag) wieder ganz normal möglich.
  if (st.programStartedAt) {
    const cooldownMs = p.durationH * 3600000;
    const elapsed = nowMs - st.programStartedAt;
    if (elapsed < cooldownMs) {
      return {
        start: false, reason: `kürzlich gestartet - wieder ab ${formatHM(st.programStartedAt + cooldownMs, tz)} möglich`, blocked: 'cooldown', deadlineMs: toMs,
      };
    }
  }
  if (!st.programArmed) {
    st.okSince = null;
    return {
      start: false, reason: 'bereit - Automatik ausgeschaltet (manuell starten oder Automatik einschalten)', blocked: 'armed', deadlineMs: toMs,
    };
  }
  // PV-Überschuss, mindestens startSustainS am Stück (gleiches Muster wie die anderen Verbraucher)
  const surplusOk = Number.isFinite(exportW) && exportW >= p.minSurplusW;
  if (surplusOk) {
    if (!st.okSince) st.okSince = nowMs;
  } else st.okSince = null;
  if (surplusOk && nowMs - st.okSince >= p.startSustainS * 1000) {
    st.programStartedAt = nowMs;
    return {
      start: true, reason: `Start bei PV-Überschuss (${Math.round(exportW)} W)`, blocked: null, deadlineMs: toMs,
    };
  }
  if (nowMs < fromMs) {
    return {
      start: false, reason: `wartet auf PV-Überschuss oder das Zeitfenster ab ${p.windowFrom}`, blocked: null, deadlineMs: toMs,
    };
  }
  // Die Zeitplan-Auslöser (Frist, günstigste Viertelstunde) gelten höchstens einmal pro Tag - sonst würde z. B. nach
  // der Frist jedes Mal nach Ablauf der Abkühlpause erneut gestartet. Nur PV-Überschuss (oben) darf mehrmals auslösen.
  if (st.programStartedAt && localDateKey(new Date(st.programStartedAt), tz) === day) {
    return {
      start: false, reason: 'heute schon gestartet - weitere Starts nur noch bei PV-Überschuss', blocked: null, deadlineMs: toMs,
    };
  }
  if (nowMs >= toMs) {
    st.programStartedAt = nowMs;
    return {
      start: true, reason: 'Start: maximale Wartezeit erreicht (Preis-Sicherheitsnetz)', blocked: null, deadlineMs: toMs,
    };
  }
  const nowQ = Math.floor(nowMs / 900000) * 900000;
  const priced = (slots || []).filter((s) => Number.isFinite(s.price) && s.start >= nowQ && s.start < toMs);
  if (!priced.length) {
    return {
      start: false, reason: 'wartet auf PV-Überschuss oder Preise für das Zeitfenster', blocked: null, deadlineMs: toMs,
    };
  }
  const cheapest = [...priced].sort((a, b) => (a.price - b.price) || (a.start - b.start))[0];
  if (cheapest.start === nowQ) {
    st.programStartedAt = nowMs;
    return {
      start: true, reason: `Start: günstigster Moment im Zeitfenster (${cheapest.price.toFixed(1)} Rp.)`, blocked: null, deadlineMs: toMs,
    };
  }
  return {
    start: false, reason: `wartet auf PV-Überschuss oder den günstigsten Moment bis ${p.windowFrom} +${p.maxWaitH} h`, blocked: null, deadlineMs: toMs,
  };
}

module.exports = {
  DEFAULTS, normalizeProgram, decideProgram, windowOf,
};
