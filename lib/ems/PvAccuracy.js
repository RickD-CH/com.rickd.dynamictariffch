'use strict';

const { localDateKey, localParts } = require('../time');

const STORE_KEY = 'pvAccuracy';
const DAYS_KEPT = 100;
const SAVE_EVERY_MS = 15 * 60 * 1000;
const MAX_STEP_MS = 15 * 60 * 1000; // so viel Zeit zählt ein einzelner Messwert höchstens
const MAX_GAP_MS = 60 * 60 * 1000; // so viel Messlücke verträgt ein Tag, sonst gilt er nicht
const SNAPSHOT_FROM_H = 6; // Prognose des Tages festhalten: frühestens ab dieser lokalen Stunde ...
const SNAPSHOT_UNTIL_H = 12; // ... und nur, wenn der Tag bis dahin schon beobachtet wurde (sonst fehlt die Produktion davor)
const OBSERVED_BY_H = 9;
const MIN_FORECAST_KWH = 2; // kleinere Tage (Nebel, Winter) sagen über den Faktor nichts aus
const MIN_ACTUAL_KWH = 0.3;
const RECOMMEND_DAYS = 30;
const RECENT_DAYS = 14;
const RECENT_MIN = 5;
const MIN_DAYS = 7;
const FACTOR_MIN = 0.3;
const FACTOR_MAX = 2;

const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Prognose-Genauigkeit der Solaranlage (Tagesbilanz) und Empfehlung für den Korrekturfaktor.
 *
 * Je Tag wird festgehalten:
 *   fc   Prognose für den ganzen Tag, morgens festgehalten (= bis dahin Gemessenes + Rest-Prognose), MIT dem damaligen Faktor
 *   f    der Faktor, mit dem diese Prognose damals gerechnet war (ohne ihn: Prognose / f = rohe Prognose)
 *   act  Solarproduktion des Tages in kWh, aus den Leistungsmesswerten aufsummiert
 *   gap  Zeit ohne Messwerte (ms); zu viele Lücken -> der Tag zählt nicht
 *
 * Empfehlung: Median von (gemessen / rohe Prognose) über die letzten 30 vollständigen Tage mit nennenswerter Produktion,
 * erst ab 7 solchen Tagen. Reine Logik, keine Homey-Aufrufe. `store` = { get(key), set(key, value) }.
 */
class PvAccuracy {
  constructor(store, tz = 'Europe/Zurich') {
    this.store = store;
    this.tz = tz;
    this.days = {};
    this.lastSave = 0;
    this._dirty = false;
    try {
      const v = store ? store.get(STORE_KEY) : null;
      if (v && typeof v === 'object' && v.days && typeof v.days === 'object') this.days = v.days;
    } catch (err) { /* leer starten */ }
  }

  /**
   * @param {{nowMs:number, pvW:number|null, remainingKwh:number|null, factor:number|null}} r
   *   remainingKwh: Rest-Prognose bis Mitternacht (mit Faktor), factor: der darin angewendete Faktor
   */
  record({
    nowMs, pvW, remainingKwh, factor,
  }) {
    const key = localDateKey(new Date(nowMs), this.tz);
    let d = this.days[key];
    const hour = localParts(new Date(nowMs), this.tz).hour;
    if (!d) {
      d = {
        act: 0, gap: 0, last: null, first: nowMs, firstH: hour, fc: null, f: null, fcAt: null,
      };
      this.days[key] = d;
      this._dirty = true;
    }
    const validPv = Number.isFinite(pvW);
    if (validPv && d.last !== null && nowMs > d.last) {
      const dt = nowMs - d.last;
      const step = Math.min(dt, MAX_STEP_MS);
      d.gap += dt - step;
      d.act += (Math.max(0, pvW) / 1000) * (step / 3600000);
      d.last = nowMs;
      this._dirty = true;
    } else if (validPv && d.last === null) {
      d.last = nowMs;
    }
    if (d.fc === null && Number.isFinite(remainingKwh) && hour >= SNAPSHOT_FROM_H && hour < SNAPSHOT_UNTIL_H && d.firstH <= OBSERVED_BY_H) {
      d.fc = round1(d.act + remainingKwh);
      d.f = Number.isFinite(factor) && factor > 0 ? factor : 1;
      d.fcAt = nowMs;
      this._dirty = true;
      this._save(nowMs, true);
    }
    this._prune();
    this._save(nowMs, false);
  }

  _prune() {
    const keys = Object.keys(this.days).sort();
    if (keys.length > DAYS_KEPT) {
      for (const k of keys.slice(0, keys.length - DAYS_KEPT)) delete this.days[k];
      this._dirty = true;
    }
  }

  _save(nowMs, force) {
    if (!this._dirty || !this.store) return;
    if (!force && nowMs - this.lastSave < SAVE_EVERY_MS) return;
    try {
      this.store.set(STORE_KEY, { days: this.days });
      this.lastSave = nowMs;
      this._dirty = false;
    } catch (err) { /* nicht kritisch */ }
  }

  /**
   * Frühere Tagesbilanzen übernehmen (z. B. aus einem alten Protokoll): [{ day:'JJJJ-MM-TT', forecastKwh, actualKwh }].
   * forecastKwh ist die Prognose OHNE Faktor, actualKwh die gemessene Tagesproduktion. Vorhandene Tage bleiben unverändert.
   * @returns {{ added:number, skipped:number }}
   */
  importDays(list) {
    let added = 0;
    let skipped = 0;
    for (const x of Array.isArray(list) ? list : []) {
      const day = x && typeof x.day === 'string' ? x.day : '';
      const fc = Number(x && x.forecastKwh);
      const act = Number(x && x.actualKwh);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !(fc > 0) || !(act >= 0) || this.days[day]) {
        skipped += 1; continue;
      }
      this.days[day] = {
        act: round2(act), gap: 0, last: null, first: null, firstH: 0, fc: round1(fc), f: 1, fcAt: null, imported: true,
      };
      added += 1;
    }
    if (added) {
      this._dirty = true;
      this._prune();
      this._save(Date.now(), true);
    }
    return { added, skipped };
  }

  /** Tage, die in die Auswertung dürfen: Prognose morgens festgehalten, kaum Messlücken, ein späterer Tag existiert (der Tag ist vorbei). */
  _complete(todayKey) {
    return Object.keys(this.days).sort().filter((k) => {
      const d = this.days[k];
      return k < todayKey && d.fc !== null && d.f > 0 && d.gap <= MAX_GAP_MS;
    });
  }

  /**
   * Ansicht für die Einstellungen: Empfehlung und die letzten Tage.
   * @returns {{ recommend:{ factor:number|null, days:number, needed:number, p25:number|null, p75:number|null }, rows:object[] }}
   */
  view(nowMs, days = 14) {
    const todayKey = localDateKey(new Date(nowMs), this.tz);
    const complete = this._complete(todayKey);
    const ratios = [];
    for (const k of complete.slice(-RECOMMEND_DAYS)) {
      const d = this.days[k];
      const raw = d.fc / d.f;
      if (raw >= MIN_FORECAST_KWH && d.act >= MIN_ACTUAL_KWH) ratios.push(d.act / raw);
    }
    const sorted = ratios.slice().sort((a, b) => a - b);
    const recentSorted = ratios.slice(-RECENT_DAYS).sort((a, b) => a - b);
    const enough = sorted.length >= MIN_DAYS;
    const median = enough ? quantile(sorted, 0.5) : null;
    const rows = Object.keys(this.days).sort().slice(-days).reverse().map((k) => {
      const d = this.days[k];
      const raw = d.fc !== null && d.f > 0 ? d.fc / d.f : null;
      const isToday = k === todayKey;
      return {
        day: k,
        forecastKwh: raw === null ? null : round1(raw),
        actualKwh: round1(d.act),
        ratio: raw && raw >= MIN_FORECAST_KWH && !isToday && d.gap <= MAX_GAP_MS ? round2(d.act / raw) : null,
        today: isToday,
        counted: !isToday && d.fc !== null && d.gap <= MAX_GAP_MS && raw >= MIN_FORECAST_KWH && d.act >= MIN_ACTUAL_KWH,
      };
    });
    return {
      recommend: {
        factor: enough ? round2(Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, median))) : null,
        days: sorted.length,
        needed: MIN_DAYS,
        p25: enough ? round2(quantile(sorted, 0.25)) : null,
        p75: enough ? round2(quantile(sorted, 0.75)) : null,
        // zum Vergleich: nur die letzten 14 Tage (folgt dem Jahreszeitenverlauf schneller, streut aber mehr)
        recent: recentSorted.length >= RECENT_MIN
          ? { factor: round2(Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, quantile(recentSorted, 0.5)))), days: recentSorted.length }
          : null,
      },
      rows,
    };
  }
}

module.exports = {
  PvAccuracy, DAYS_KEPT, MIN_DAYS, RECOMMEND_DAYS, MAX_GAP_MS,
};
