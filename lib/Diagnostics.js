'use strict';

/**
 * Diagnose-Bericht zum Kopieren (für Fehlermeldungen, z. B. in einem GitHub-Issue).
 *
 *  - RingLog: merkt sich die letzten Log-Zeilen der App und der Geräte (nur im Arbeitsspeicher, wird nirgends hingesendet).
 *  - makeRedactor: macht einen Text anonym (Geräte-, Flow- und Verbrauchernamen durch Nummern ersetzt, Token, Messpunktnummer,
 *    IDs, IP-Adressen, E-Mail-Adressen und lange Zahlen/Schlüssel entfernt).
 *  - buildReport: baut den Text aus Einstellungen (nur Zusammenfassung, keine Zugangsdaten) und den letzten Meldungen.
 *
 * Es wird nichts automatisch gesendet: der Nutzer liest den Text und fügt ihn selbst irgendwo ein.
 */

const MAX_LINES = 200;
const NOISE = /Device\.zoneName is deprecated/i;
const MAX_LINE_CHARS = 300;

function safeJson(v) {
  try { return JSON.stringify(v); } catch (err) { return String(v); }
}

/** Fehler als «Name: Meldung» plus die obersten Stack-Zeilen, nur mit Dateiname und Zeile (keine lokalen Pfade). */
function errorText(err) {
  const head = `${err.name || 'Error'}: ${err.message || ''}`;
  const frames = String(err.stack || '').split('\n').slice(1, 4).map((l) => {
    const m = /([^\\/\s()]+:\d+:\d+)\)?\s*$/.exec(l);
    return m ? `at ${m[1]}` : '';
  }).filter(Boolean);
  return frames.length ? `${head} (${frames.join(' < ')})` : head;
}

function lineText(args) {
  return args.map((a) => {
    if (a instanceof Error) return errorText(a);
    if (a && typeof a === 'object') return safeJson(a);
    return String(a);
  }).join(' ');
}

class RingLog {
  constructor(max = MAX_LINES) {
    this.max = max;
    this.lines = [];
  }

  add(level, args, now = Date.now()) {
    const text = lineText(args).slice(0, MAX_LINE_CHARS);
    if (NOISE.test(text)) return; // Hinweise der Laufzeit würden sonst die echten Meldungen verdrängen
    this.lines.push({ ts: now, level, text });
    if (this.lines.length > this.max) this.lines.splice(0, this.lines.length - this.max);
  }

  /**
   * `log` und `error` eines Objekts so umhängen, dass die Zeilen hier mitgeschrieben werden. Nie ein Fehler: lässt sich das Objekt nicht
   * ändern (z. B. schreibgeschützt), bleibt alles wie es war. Gibt zurück, ob es geklappt hat.
   */
  attach(obj) {
    try {
      if (!obj || obj.__diagAttached || typeof obj.log !== 'function' || typeof obj.error !== 'function') return false;
      const origLog = obj.log.bind(obj);
      const origError = obj.error.bind(obj);
      obj.log = (...a) => { try { this.add('log', a); } catch (err) { /* nie stören */ } return origLog(...a); };
      obj.error = (...a) => { try { this.add('error', a); } catch (err) { /* nie stören */ } return origError(...a); };
      obj.__diagAttached = true;
      return true;
    } catch (err) {
      return false;
    }
  }

  /** Alles, was über die Konsole läuft (App- und Geräte-Meldungen der Homey-Laufzeit), mitschreiben. Nie ein Fehler. */
  attachConsole(con = console) {
    try {
      if (!con || con.__diagAttached) return false;
      for (const [method, level] of [['log', 'log'], ['info', 'log'], ['warn', 'log'], ['error', 'error']]) {
        const orig = typeof con[method] === 'function' ? con[method].bind(con) : null;
        if (orig) {
          con[method] = (...a) => { try { this.add(level, a); } catch (err) { /* nie stören */ } return orig(...a); };
        }
      }
      con.__diagAttached = true;
      return true;
    } catch (err) {
      return false;
    }
  }

  recent(n = 120) {
    return this.lines.slice(-n);
  }
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {{ names?: {name:string,label:string}[], secrets?: string[] }} o
 * @returns {(text:string)=>string}
 */
function makeRedactor({ names = [], secrets = [] } = {}) {
  const secs = secrets.filter((s) => typeof s === 'string' && s.trim().length >= 4).map((s) => s.trim());
  const nm = names
    .filter((n) => n && typeof n.name === 'string' && n.name.trim().length >= 3)
    .map((n) => ({ re: new RegExp(escapeRe(n.name.trim()), 'gi'), label: n.label, len: n.name.trim().length }))
    .sort((a, b) => b.len - a.len);
  return (text) => {
    let t = String(text === null || text === undefined ? '' : text);
    for (const s of secs) t = t.split(s).join('<geheim>');
    for (const n of nm) t = t.replace(n.re, n.label);
    t = t.replace(/Bearer\s+\S+/gi, 'Bearer <token>');
    t = t.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>');
    t = t.replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '<ip>');
    t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<mail>');
    t = t.replace(/\b[A-Za-z0-9+/_-]{24,}\b/g, '<schluessel>');
    t = t.replace(/\d{9,}/g, '<nr>');
    return t;
  };
}

const yn = (v) => (v ? 'ja' : 'nein');
const pick = (o, path) => path.split('.').reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o);
const hms = (ms, tz) => {
  try {
    return new Intl.DateTimeFormat('de-CH', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit',
    }).format(new Date(ms)).replace(',', '');
  } catch (err) { return new Date(ms).toISOString(); }
};

/**
 * @param {object} p
 * @param {object} p.info       { appVersion, homeyVersion, platform, language, tz, now }
 * @param {object} p.config     EMS-Konfiguration (normalisiert)
 * @param {object[]} p.priceDevices  [{ settings: {...ohne Zugangsdaten} }]
 * @param {{ts:number,level:string,text:string}[]} p.logs
 * @param {(t:string)=>string} p.redact
 */
function buildReport({
  info = {}, config = {}, priceDevices = [], logs = [], redact = (t) => t,
}) {
  const tz = info.tz || 'Europe/Zurich';
  const out = [];
  out.push('# Diagnose Dynamischer Stromtarif CH');
  out.push(`Erstellt: ${hms(info.now || Date.now(), tz)} (${tz})`);
  out.push(`App-Version: ${info.appVersion || '?'} | Homey: ${info.platform || '?'} ${info.homeyVersion || '?'} | Sprache: ${info.language || '?'}`);
  out.push('Anonymisiert: Geräte-, Flow- und Verbrauchernamen sind durch Nummern ersetzt, Zugangsdaten, IDs und Nummern entfernt. Der Text wird nirgends automatisch gesendet.');
  out.push('');
  out.push('## Preis-App');
  out.push(`Gekoppelte Geräte: ${priceDevices.length}`);
  priceDevices.forEach((d, i) => {
    const s = d && d.settings && typeof d.settings === 'object' ? d.settings : {};
    const keys = Object.keys(s).filter((k) => !/token|passw|secret|code/i.test(k)).sort();
    out.push(`- Gerät ${i + 1}: ${keys.map((k) => `${k}=${redact(typeof s[k] === 'object' ? safeJson(s[k]) : String(s[k]))}`).join(', ') || 'keine Einstellungen'}`);
  });
  out.push('');
  const c = config || {};
  out.push('## Energiemanagement');
  out.push(`EMS ein: ${yn(c.enabled)} | Testmodus (Silent): ${yn(c.silent)} | Schatten: ${yn(c.shadow)} | Vergleich: ${yn(c.compare)}`);
  out.push(`«live» heisst: Befehle senden ist eingestellt. Gesendet wird nur, wenn live gesetzt UND der Testmodus aus ist${c.silent ? ' (jetzt ist der Testmodus an: es wird nichts gesendet)' : ''}.`);
  out.push(`Zähler gewählt: ${yn(pick(c, 'devices.meter.id'))} | Haus gewählt: ${yn(pick(c, 'devices.house.id'))} | PV gewählt: ${yn(pick(c, 'devices.pv.id'))}`);
  out.push(`Hausbatterie: ${yn(pick(c, 'battery.deviceId'))}, Steuerung ${yn(pick(c, 'battery.control.enabled'))}, live ${yn(pick(c, 'battery.control.live'))}`);
  out.push(`Wallbox: ${yn(pick(c, 'charger.id'))}, live ${yn(pick(c, 'charger.live'))}`);
  out.push(`Warmwasser-Programm: ein ${yn(pick(c, 'dhw.enabled'))}, live ${yn(pick(c, 'dhw.live'))}, Ausgabe ${pick(c, 'dhw.output') || '?'}, Verzögern ${yn(pick(c, 'dhw.delay.enabled'))}`);
  out.push(`SG-Ready: ein ${yn(pick(c, 'sgready.enabled'))}, live ${yn(pick(c, 'sgready.live'))}, Ausgabe ${pick(c, 'sgready.output') || '?'}`);
  out.push(`Sicherung (Phasen): ein ${yn(pick(c, 'fuse.enabled'))}`);
  const cons = Array.isArray(c.consumers) ? c.consumers : [];
  out.push(`Verbraucher: ${cons.length}`);
  cons.forEach((x, i) => {
    out.push(`- Verbraucher ${i + 1}: Typ ${x.mode || '?'}, ein ${yn(x.enabled)}, live ${yn(x.live)}`
      + (x.mode === 'program' && x.program ? `, Programmdauer ${x.program.durationH} h, Wartezeit ${x.program.maxWaitH} h` : ''));
  });
  out.push('');
  const real = logs.filter((l) => !NOISE.test(l.text));
  out.push(`## Letzte Meldungen (${real.length})`);
  if (!real.length) out.push('(keine)');
  // Lärm weglassen (Hinweise der Homey-Laufzeit) und gleiche Zeilen nacheinander zusammenfassen
  const shown = [];
  for (const l of logs) {
    if (NOISE.test(l.text)) continue;
    const text = redact(l.text);
    const last = shown[shown.length - 1];
    if (last && last.text === text && last.level === l.level) last.n += 1;
    else shown.push({ ts: l.ts, level: l.level, text, n: 1 });
  }
  for (const l of shown) out.push(`${hms(l.ts, tz)} [${l.level === 'error' ? 'FEHLER' : 'log'}] ${l.text}${l.n > 1 ? ` (${l.n}×)` : ''}`);
  out.push('');
  return out.join('\n');
}

const diagLog = new RingLog();

module.exports = {
  RingLog, diagLog, makeRedactor, buildReport, MAX_LINES, MAX_LINE_CHARS,
};
