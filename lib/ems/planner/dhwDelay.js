'use strict';

/**
 * Warmwasser verzögern (Teil des Warmwasser-Programms): Fällt das Warmwasser im Zeitfenster unter die Startschwelle der Wärmepumpe und
 * wird heute noch genug Sonne erwartet, wird der Start der Wärmepumpe hinausgezögert (der WW-Soll wird per Flow abgesenkt), damit das
 * Warmwasser mit Solarstrom (SG-Ready) oder im günstigen Block erzeugt wird statt morgens mit Netzstrom. Danach wird der Soll wieder
 * freigegeben. Reine Funktion, keine Homey-Aufrufe.
 *
 * Wann es verzögert (alles muss stimmen): eingeschaltet, im Zeitfenster, heute noch nicht verzögert, Warmwasser unter der Startschwelle
 * (Soll - Hysterese + Marge) aber nicht unter der Komfortgrenze, die Freigabezeit ist noch nicht vorbei.
 *
 * Bis wann (Freigabezeit):
 *   - genug PV-Prognose (>= minForecastKwh)                 -> Freigabe Mo-Fr / Wochenende zur eingestellten Uhrzeit (die Sonne heizt über SG-Ready)
 *   - zu wenig Prognose, Preisoptimierung aktiv (priceOn)   -> ebenfalls bis zur Freigabezeit: in den günstigen Stunden startet das
 *                                                              Warmwasser-Programm selbst (das beendet die Verzögerung)
 *   - zu wenig Prognose, keine Preisoptimierung             -> feste Uhrzeit releaseLow (z. B. 10:00)
 *
 * Wann es freigibt: Freigabezeit erreicht, Komfortgrenze unterschritten, SG-Ready läuft, Pause, neuer Tag oder nach 14 Stunden.
 * Startet in der Zwischenzeit das Warmwasser-Programm selbst, endet die Verzögerung ohne Flow (das Programm hebt den Soll ohnehin an).
 */

const {
  localParts, fromLocal, parseHHMM, localDateKey,
} = require('../../time');

const MAX_DELAY_MS = 14 * 3600 * 1000;

const DEFAULTS = Object.freeze({
  enabled: false,
  flowDelay: Object.freeze({ id: '', advanced: false, name: '' }),
  windowFrom: '05:00',
  windowTo: '14:00',
  minForecastKwh: 15,
  releaseWeekday: '16:00',
  releaseWeekend: '15:00',
  releaseLow: '10:00',
  comfortTemp: 32,
  startMargin: 3,
});

function makeDelayState() {
  return {
    active: false, since: null, releaseAt: null, day: null, lastDay: null, why: '',
  };
}

function normalizeDelay(v) {
  const d = DEFAULTS;
  const s = v && typeof v === 'object' ? v : {};
  const time = (x, fb) => {
    try {
      const t = parseHHMM(String(x));
      return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
    } catch (err) { return fb; }
  };
  const num = (x, fb, lo, hi) => {
    const n = Number(x);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fb;
  };
  const f = s.flowDelay && typeof s.flowDelay === 'object' ? s.flowDelay : {};
  return {
    enabled: s.enabled === true,
    flowDelay: { id: typeof f.id === 'string' ? f.id : '', advanced: f.advanced === true, name: typeof f.name === 'string' ? f.name : '' },
    windowFrom: time(s.windowFrom, d.windowFrom),
    windowTo: time(s.windowTo, d.windowTo),
    minForecastKwh: num(s.minForecastKwh, d.minForecastKwh, 0, 200),
    releaseWeekday: time(s.releaseWeekday, d.releaseWeekday),
    releaseWeekend: time(s.releaseWeekend, d.releaseWeekend),
    releaseLow: time(s.releaseLow, d.releaseLow),
    comfortTemp: num(s.comfortTemp, d.comfortTemp, 10, 60),
    startMargin: num(s.startMargin, d.startMargin, 0, 10),
  };
}

/** Freigabezeit von heute (ms): Mo-Fr oder Wochenende, je nach Einstellung. */
function releaseTimeOf(cfg, nowMs, tz = 'Europe/Zurich') {
  const lp = localParts(new Date(nowMs), tz);
  const wd = new Date(Date.UTC(lp.year, lp.month - 1, lp.day)).getUTCDay();
  const t = parseHHMM(wd === 0 || wd === 6 ? cfg.releaseWeekend : cfg.releaseWeekday);
  return fromLocal(lp.year, lp.month, lp.day, t.hour, t.minute, tz).getTime();
}

const hm = (ms, tz) => {
  const p = localParts(new Date(ms), tz);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
};

/**
 * @param {object} p
 * @param {object} p.cfg                     normalisierte Verzögerungs-Einstellungen
 * @param {object} p.st                      Zustand (makeDelayState), wird nicht verändert
 * @param {number} p.nowMs
 * @param {string} [p.tz]
 * @param {number|null} p.tempWW             Warmwasser-Ist (°C)
 * @param {number|null} p.sollBase           WW-Soll der Wärmepumpe vor jeder Absenkung (°C)
 * @param {number} p.hyst                    Hysterese der Wärmepumpe (K)
 * @param {number|null} p.forecastKwh        Rest-Prognose von heute (kWh), null = unbekannt
 * @param {boolean} p.priceOn                Preisoptimierung aktiv (Datum erreicht)
 * @param {boolean} [p.paused]               Modul pausiert
 * @param {boolean} [p.sgActive]             SG-Ready läuft
 * @param {boolean} [p.dhwRunning]           das Warmwasser-Programm läuft
 * @returns {{ action:'start'|'release'|'end'|'none', reason:string, releaseAt:number|null }}
 */
function decideDelay({
  cfg, st, nowMs, tz = 'Europe/Zurich', tempWW, sollBase, hyst = 0, forecastKwh, priceOn = false,
  paused = false, sgActive = false, dhwRunning = false, hpHeating = false,
}) {
  const none = (reason) => ({ action: 'none', reason, releaseAt: null });
  const lp = localParts(new Date(nowMs), tz);
  const day = localDateKey(new Date(nowMs), tz);

  if (st.active) {
    const rel = (reason) => ({ action: 'release', reason, releaseAt: null });
    if (paused) return rel('Pausiert: Soll wieder freigegeben');
    if (dhwRunning) return { action: 'end', reason: 'Warmwasser-Programm läuft', releaseAt: null };
    if (sgActive) return rel('SG-Ready läuft: Soll wieder freigegeben');
    if (Number.isFinite(tempWW) && tempWW < cfg.comfortTemp) return rel(`Komfort: Warmwasser ${tempWW.toFixed(1)} °C unter ${cfg.comfortTemp} °C`);
    if (Number.isFinite(st.releaseAt) && nowMs >= st.releaseAt) return rel('Freigabe: Zeit erreicht');
    if (st.day && st.day !== day) return rel('Neuer Tag: Soll wieder freigegeben');
    if (Number.isFinite(st.since) && nowMs - st.since > MAX_DELAY_MS) return rel('Sicherheit: länger als 14 Stunden');
    return { action: 'none', reason: `Verzögert bis ${hm(st.releaseAt, tz)}`, releaseAt: st.releaseAt };
  }

  if (!cfg.enabled) return none('Verzögern ist aus');
  if (paused) return none('Pausiert');
  if (dhwRunning) return none('Warmwasser-Programm läuft');
  if (sgActive) return none('SG-Ready läuft');
  // Die Wärmepumpe bereitet schon Warmwasser: Absenken des Solls würde den laufenden Zyklus abbrechen
  if (hpHeating === true) return none('Wärmepumpe bereitet schon Warmwasser');
  if (st.lastDay === day) return none('Heute schon verzögert');
  const minutes = lp.hour * 60 + lp.minute;
  const mins = (s) => { const t = parseHHMM(s); return t.hour * 60 + t.minute; };
  if (minutes < mins(cfg.windowFrom) || minutes >= mins(cfg.windowTo)) return none(`Ausserhalb des Zeitfensters ${cfg.windowFrom}-${cfg.windowTo}`);
  if (!Number.isFinite(tempWW) || !Number.isFinite(sollBase)) return none('Warmwasser-Temperatur oder -Soll unbekannt');
  const threshold = sollBase - hyst + cfg.startMargin;
  if (tempWW >= threshold) return none(`Warmwasser ${tempWW.toFixed(1)} °C noch über der Startschwelle ${threshold.toFixed(1)} °C`);
  if (tempWW < cfg.comfortTemp) return none(`Komfort: Warmwasser unter ${cfg.comfortTemp} °C, nicht verzögern`);

  const at = (s) => {
    const t = parseHHMM(s);
    return fromLocal(lp.year, lp.month, lp.day, t.hour, t.minute, tz).getTime();
  };
  const releaseTime = releaseTimeOf(cfg, nowMs, tz);
  if (Number.isFinite(forecastKwh) && forecastKwh >= cfg.minForecastKwh) {
    if (nowMs >= releaseTime) return none('Freigabezeit schon vorbei');
    return { action: 'start', reason: `PV-Prognose ${forecastKwh.toFixed(1)} kWh: Sonne zuerst, Freigabe ${hm(releaseTime, tz)}`, releaseAt: releaseTime };
  }
  if (priceOn) {
    if (nowMs >= releaseTime) return none('Freigabezeit schon vorbei');
    return { action: 'start', reason: `Wenig Sonne: das Warmwasser-Programm heizt in den günstigen Stunden, Freigabe ${hm(releaseTime, tz)}`, releaseAt: releaseTime };
  }
  const low = at(cfg.releaseLow);
  if (nowMs >= low) return none('Freigabezeit schon vorbei');
  return { action: 'start', reason: `Wenig Sonne: Freigabe ${hm(low, tz)}`, releaseAt: low };
}

module.exports = {
  decideDelay, normalizeDelay, makeDelayState, releaseTimeOf, DEFAULTS, MAX_DELAY_MS,
};
