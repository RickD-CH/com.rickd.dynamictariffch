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
 *   6. **Automatik nicht bewusst eingeschaltet?** -> nichts tun (siehe unten, wichtiger Sicherheitspunkt). Die Automatik gilt für EINEN Lauf:
 *      sie geht nach jedem Start (auch dem manuellen) von selbst aus, oder wenn die Wartezeit samt Nachfrist ohne Start vorbei ist.
 *   7. Genug PV-Überschuss, mindestens `startSustainS` am Stück? -> jetzt starten.
 *   8. Innerhalb des Zeitfensters [Einschaltzeit der Automatik (frühestens windowFrom), + Wartezeit]? Dann:
 *        - Frist erreicht (Ende des Fensters) -> jetzt starten (Sicherheitsnetz, egal zu welchem Preis).
 *        - sonst: beginnt jetzt der günstigste zusammenhängende Block der Programmdauer (durationH), dessen Start noch im Fenster liegt
 *          (der Block darf über das Fensterende hinausreichen, es zählt der Durchschnittspreis)? -> jetzt starten.
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

// Nachfrist nach dem Ende der Wartezeit: ist die Maschine dann noch nicht startbereit, verfällt die Automatik
const EXPIRE_GRACE_MS = 60 * 60 * 1000;

const DEFAULTS = Object.freeze({
  enabled: false,
  windowFrom: '', // frühester Beginn des Preis-Starts (leer = sofort ab dem Einschalten der Automatik)
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

const SLOT_MS = 15 * 60 * 1000;

/**
 * Günstigster zusammenhängender Block von `hours` Stunden, dessen Start zwischen fromMs und lastStartMs (inklusive) liegt.
 * Es zählen nur vollständige Blöcke (alle Viertelstunden mit Preis), der Durchschnittspreis entscheidet, bei Gleichstand der frühere.
 * @returns {{ start:number, end:number, avg:number }|null}
 */
function cheapestBlock(slots, fromMs, lastStartMs, hours) {
  const n = Math.max(1, Math.round(hours * 4));
  const priceAt = new Map();
  for (const s of slots || []) if (Number.isFinite(s.price)) priceAt.set(s.start, s.price);
  let best = null;
  for (let t = fromMs; t <= lastStartMs; t += SLOT_MS) {
    let sum = 0;
    let ok = true;
    for (let k = 0; k < n; k += 1) {
      const pr = priceAt.get(t + k * SLOT_MS);
      if (pr === undefined) { ok = false; break; }
      sum += pr;
    }
    if (ok && (!best || sum / n < best.avg - 1e-9)) best = { start: t, end: t + n * SLOT_MS, avg: sum / n };
  }
  return best;
}

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

/** Lokale Uhrzeit `hhmm` am Tag von `refMs` (ms), unabhängig von der Prozess-Zeitzone. */
function localTimeOn(refMs, hhmm, tz) {
  const lp = localParts(new Date(refMs), tz);
  const [fh, fm] = hhmm.split(':').map(Number);
  return refMs + ((fh - lp.hour) * 60 + (fm - lp.minute)) * 60000 - lp.second * 1000;
}

/**
 * Zeitfenster des Preis-Starts. Mit eingeschalteter Automatik (`st.armedAt`) beginnt es beim Einschalten (frühestens zur Uhrzeit
 * `windowFrom`, falls eingestellt) und dauert die gewählte Wartezeit (`st.armWaitH`, sonst `maxWaitH`). Ohne Einschaltzeit (alter
 * Zustand): wie früher heute ab `windowFrom` (leer = jetzt).
 */
function windowOf(p, nowMs, tz, st = {}) {
  const waitH = Number.isFinite(st.armWaitH) && st.armWaitH > 0 ? st.armWaitH : p.maxWaitH;
  let fromMs;
  if (Number.isFinite(st.armedAt)) {
    fromMs = st.armedAt;
    if (p.windowFrom) fromMs = Math.max(fromMs, localTimeOn(st.armedAt, p.windowFrom, tz));
  } else {
    fromMs = p.windowFrom ? localTimeOn(nowMs, p.windowFrom, tz) : nowMs;
  }
  return { fromMs, toMs: fromMs + waitH * 3600000 };
}

/** Automatik beenden (nach einem Start oder wenn sie abgelaufen ist). */
function disarm(st) {
  st.programArmed = false;
  st.armedAt = null;
  st.armWaitH = null;
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
    // Tageswechsel: nur die Zeit-Zähler zurücksetzen. Die Automatik bleibt (sie kann über Mitternacht gelten, z. B. am Abend
    // eingeschaltet für einen Start um 04:00), sie endet mit dem Lauf oder mit dem Ablauf der Wartezeit.
    st.programDay = day; st.okSince = null; st.badSince = null;
  }
  const { fromMs, toMs } = windowOf(p, nowMs, tz, st);
  // Automatik abgelaufen: Wartezeit samt Nachfrist vorbei und nicht gestartet (z. B. Maschine nie bereit gemeldet)
  if (st.programArmed && Number.isFinite(st.armedAt) && nowMs > toMs + EXPIRE_GRACE_MS) {
    disarm(st);
    st.okSince = null;
    return {
      start: false, reason: 'Automatik abgelaufen: die Wartezeit ist vorbei, es wurde nicht gestartet', blocked: 'armed', deadlineMs: null, disarmed: true,
    };
  }
  // Läuft das Gerät schon (von Hand gestartet, oder noch vom letzten Mal)? Dann nicht nochmals einen Befehl senden.
  // Nur wenn eine Status-Capability gewählt ist - sonst kennen wir den Ist-Zustand des Geräts gar nicht.
  if (p.stateCapability && stateValue !== p.stateIdleValue) {
    st.okSince = null;
    return {
      start: false, reason: `Gerät nicht bereit (Status: ${stateValue === null || stateValue === undefined ? 'unbekannt' : stateValue})`, blocked: 'state', deadlineMs: toMs,
    };
  }
  if (p.remoteCapability && String(remoteValue).trim().toLowerCase() !== String(p.remoteOkValue).trim().toLowerCase()) {
    st.okSince = null;
    return {
      start: false, reason: `Fernbedienung nicht aktiv (${remoteValue === null || remoteValue === undefined ? 'unbekannt' : remoteValue})`, blocked: 'remote', deadlineMs: toMs,
    };
  }
  if (p.doorCapability && String(doorValue).trim().toLowerCase() !== String(p.doorOkValue).trim().toLowerCase()) {
    st.okSince = null;
    return {
      start: false, reason: `Tür offen (${doorValue === null || doorValue === undefined ? 'unbekannt' : doorValue})`, blocked: 'door', deadlineMs: toMs,
    };
  }
  if (forceNow) {
    st.programStartedAt = nowMs;
    disarm(st); // der Lauf läuft: die Automatik wäre sonst nach der Abkühlpause für einen zweiten Start bereit
    return {
      start: true, reason: 'Manuell gestartet', blocked: null, deadlineMs: null,
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
      start: false, reason: 'bereit - Automatik ausgeschaltet (manuell starten oder Automatik einschalten)', blocked: 'armed', deadlineMs: null,
    };
  }
  // PV-Überschuss, mindestens startSustainS am Stück (gleiches Muster wie die anderen Verbraucher)
  const surplusOk = Number.isFinite(exportW) && exportW >= p.minSurplusW;
  if (surplusOk) {
    if (!st.okSince) st.okSince = nowMs;
  } else st.okSince = null;
  if (surplusOk && nowMs - st.okSince >= p.startSustainS * 1000) {
    st.programStartedAt = nowMs;
    disarm(st);
    return {
      start: true, reason: `Start bei PV-Überschuss (${Math.round(exportW)} W)`, blocked: null, deadlineMs: null,
    };
  }
  if (nowMs < fromMs) {
    return {
      start: false, reason: `wartet auf PV-Überschuss oder das Zeitfenster ab ${p.windowFrom}`, blocked: null, deadlineMs: toMs,
    };
  }
  if (nowMs >= toMs) {
    st.programStartedAt = nowMs;
    disarm(st);
    return {
      start: true, reason: 'Start: maximale Wartezeit erreicht (Preis-Sicherheitsnetz)', blocked: null, deadlineMs: null,
    };
  }
  const nowQ = Math.floor(nowMs / 900000) * 900000;
  const block = cheapestBlock(slots, nowQ, toMs - SLOT_MS, p.durationH);
  if (!block) {
    return {
      start: false, reason: 'wartet auf PV-Überschuss oder Preise für das Zeitfenster', blocked: null, deadlineMs: toMs,
    };
  }
  const label = `${formatHM(block.start, tz)}-${formatHM(block.end, tz)}, Ø ${block.avg.toFixed(1)} Rp.`;
  if (block.start === nowQ) {
    st.programStartedAt = nowMs;
    disarm(st);
    return {
      start: true, reason: `Start: günstigster ${p.durationH}-h-Block im Zeitfenster (${label})`, blocked: null, deadlineMs: null, plannedStartMs: block.start, plannedEndMs: block.end,
    };
  }
  return {
    start: false, reason: `wartet auf PV-Überschuss oder den günstigsten Block (${label})`, blocked: null, deadlineMs: toMs, plannedStartMs: block.start, plannedEndMs: block.end,
  };
}

module.exports = {
  DEFAULTS, normalizeProgram, decideProgram, windowOf, cheapestBlock, disarm, EXPIRE_GRACE_MS,
};
