'use strict';

/**
 * Zeit-Hilfsfunktionen für Europe/Zurich – ohne Abhängigkeiten.
 * Homey läuft intern in UTC; alle "lokalen" Angaben (Mitternacht, "zwischen 22:00 und 06:00")
 * müssen explizit in der Zeitzone des Nutzers gerechnet werden. Zeitumstellung beachten:
 * ein Tag hat 92, 96 oder 100 Viertelstunden.
 */

const SLOT_MS = 15 * 60 * 1000;
const DEFAULT_TZ = 'Europe/Zurich';

const fmtCache = new Map();
function formatter(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'longOffset',
    }));
  }
  return fmtCache.get(tz);
}

/** Lokale Datumsbestandteile + Offset ("+01:00") eines Zeitpunkts. */
function localParts(date, tz = DEFAULT_TZ) {
  const p = Object.fromEntries(formatter(tz).formatToParts(date).map((x) => [x.type, x.value]));
  const offset = p.timeZoneName === 'GMT' ? '+00:00' : p.timeZoneName.replace('GMT', '');
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second), offset,
  };
}

/** RFC3339 mit lokalem Offset, z. B. "2027-01-14T00:00:00+01:00". */
function toLocalIso(date, tz = DEFAULT_TZ) {
  const p = localParts(date, tz);
  const z = (n) => String(n).padStart(2, '0');
  return `${p.year}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}:${z(p.second)}${p.offset}`;
}

/** Lokaler Kalendertag als "YYYY-MM-DD". */
function localDateKey(date, tz = DEFAULT_TZ) {
  return toLocalIso(date, tz).slice(0, 10);
}

/**
 * UTC-Zeitpunkt für eine lokale Wanduhrzeit (Jahr, Monat 1-12, Tag, Stunde, Minute).
 * Existiert die Uhrzeit wegen Zeitumstellung nicht (z. B. 02:30 im März), wird die nächste
 * gültige Zeit geliefert.
 */
function fromLocal(year, month, day, hour = 0, minute = 0, tz = DEFAULT_TZ) {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  // Zwei Iterationen reichen für Offsets, die sich um die Umstellung herum ändern.
  let t = wanted;
  for (let i = 0; i < 3; i++) {
    const p = localParts(new Date(t), tz);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const diff = wanted - asUtc;
    if (diff === 0) return new Date(t);
    t += diff;
  }
  // Nicht existierende Uhrzeit (Lücke im Frühling): auf nächste Viertelstunde vorrücken.
  let probe = Math.floor(t / SLOT_MS) * SLOT_MS;
  while (localParts(new Date(probe), tz).hour < hour) probe += SLOT_MS;
  return new Date(probe);
}

/** Lokale Mitternacht (Tagesbeginn) des Tages, in dem `date` liegt. */
function startOfLocalDay(date, tz = DEFAULT_TZ) {
  const p = localParts(date, tz);
  return fromLocal(p.year, p.month, p.day, 0, 0, tz);
}

/** Lokale Mitternacht `n` Tage nach dem Tag von `date` (n darf negativ sein). */
function addLocalDays(date, n, tz = DEFAULT_TZ) {
  const p = localParts(date, tz);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + n));
  return fromLocal(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 0, 0, tz);
}

/** Beginn der Viertelstunde, in der `date` liegt. (Zürich hat nur ganzstündige Offsets.) */
function floorToSlot(date) {
  return new Date(Math.floor(date.getTime() / SLOT_MS) * SLOT_MS);
}

/** "HH:MM" → { hour, minute }; wirft bei ungültiger Eingabe. */
function parseHHMM(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(str).trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`Ungültige Uhrzeit: ${str}`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

/**
 * Das Zeitfenster "von HH:MM bis HH:MM", das `now` enthält oder als nächstes beginnt.
 * Fenster über Mitternacht (z. B. 22:00–06:00) werden korrekt behandelt.
 * Gleiche Start- und Endzeit = 24 Stunden.
 * @returns {{ from: Date, to: Date }}  to ist exklusiv
 */
function windowAround(now, fromHHMM, toHHMM, tz = DEFAULT_TZ) {
  const f = parseHHMM(fromHHMM);
  const t = parseHHMM(toHHMM);
  const wraps = t.hour * 60 + t.minute <= f.hour * 60 + f.minute;
  for (const dayOffset of [-1, 0, 1]) {
    const base = addLocalDays(now, dayOffset, tz);
    const bp = localParts(base, tz);
    const from = fromLocal(bp.year, bp.month, bp.day, f.hour, f.minute, tz);
    const endBase = wraps ? addLocalDays(base, 1, tz) : base;
    const ep = localParts(endBase, tz);
    const to = fromLocal(ep.year, ep.month, ep.day, t.hour, t.minute, tz);
    if (now < to) return { from, to };
  }
  throw new Error('windowAround: kein Fenster gefunden'); // sollte nie passieren
}

module.exports = {
  SLOT_MS, DEFAULT_TZ, localParts, toLocalIso, localDateKey, fromLocal,
  startOfLocalDay, addLocalDays, floorToSlot, parseHHMM, windowAround,
};
