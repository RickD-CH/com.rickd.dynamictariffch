'use strict';

const {
  localParts, localDateKey, fromLocal,
} = require('../time');

const STORE_KEY = 'planAccuracy';
const DAYS_KEPT = 60;
const SAVE_EVERY_MS = 15 * 60 * 1000;
const MAX_STEP_MS = 15 * 60 * 1000; // so viel Zeit zählt ein einzelner Messwert höchstens
const MAX_WINDOW_GAP_MS = 20 * 60 * 1000; // so viel Messlücke verträgt ein Fenster, sonst zählt es nicht
const MAX_DAY_GAP_MS = 60 * 60 * 1000;
const MIN_DAYS = 5; // so viele Tage braucht ein Vergleich, bevor er etwas aussagt
const BETTER_BY = 0.1; // eine Methode gilt erst als besser, wenn ihr Fehler um 10 % kleiner ist
const PV_FROM_H = 6; // PV: Stand um 6 Uhr ...
const PV_NOW_H = 10.5; // ... und um 10:30 Uhr festhalten, daraus die Korrektur für den Rest des Tages
const PV_MIN_MORNING_KWH = 0.5;
const PV_MIN_REST_KWH = 1;
const RATIO_MIN = 0.3;
const RATIO_MAX = 2;

/** Zeitfenster, in denen die Prognose des Hausverbrauchs gemessen wird: Schlüssel, von Stunde, bis Stunde (lokal). */
const WINDOWS = [
  { key: 'm', from: 5, to: 10 },
  { key: 'd', from: 10, to: 17 },
  { key: 'e', from: 17, to: 22 },
];

const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;

/**
 * Plan-Genauigkeit: wie gut stimmen die Eingänge des Planers mit dem überein, was dann wirklich geschah? Sie misst nur, sie ändert nichts.
 *
 * Hausverbrauch: je Fenster (Morgen 5-10, Tag 10-17, Abend 17-22) wird beim Fensterbeginn festgehalten, was zwei Methoden aus dem gelernten
 * Profil erwarten (`mean` = Durchschnitt der letzten 7 Tage, wie ihn der Planer heute nutzt; `robust` = Median der gleichen Tagesart
 * Werktag/Wochenende), und am Ende mit dem gemessenen Verbrauch verglichen. So sieht man mit echten Daten, welche Methode besser prognostiziert.
 *
 * Solar: um 6 Uhr und um 10:30 Uhr wird die Rest-Prognose festgehalten. Das Verhältnis gemessen/prognostiziert am Morgen wird auf den Rest
 * des Tages angewendet («Nowcast»), und der Fehler davon wird mit dem Fehler der unveränderten Rest-Prognose verglichen.
 *
 * Fehlermass: Summe der Abweichungen geteilt durch die Summe des Gemessenen (in %), Verzerrung = Summe (Prognose - gemessen) / Summe gemessen.
 * `store` = { get(key), set(key, value) }. Reine Logik, keine Homey-Aufrufe.
 */
class PlanAccuracy {
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
   * Erwarteter Verbrauch (kWh) vom Zeitpunkt `nowMs` bis zum Ende des Fensters aus dem Profil (die angebrochene Viertelstunde zählt anteilig),
   * oder null, wenn irgendwo Daten fehlen. Gemessen wird ebenfalls ab `nowMs`, beide decken also dieselbe Zeit ab.
   */
  static _windowForecast(nowMs, tz, w, fn) {
    const p = localParts(new Date(nowMs), tz);
    let sum = 0;
    for (let q = w.from * 4; q < w.to * 4; q += 1) {
      const t = fromLocal(p.year, p.month, p.day, Math.floor(q / 4), (q % 4) * 15, tz).getTime();
      const part = Math.min(1, Math.max(0, (t + 900000 - nowMs) / 900000));
      if (part <= 0) continue;
      const kw = fn(t);
      if (!Number.isFinite(kw)) return null;
      sum += kw * 0.25 * part;
    }
    return round2(sum);
  }

  /**
   * @param {{nowMs:number, houseW:number|null, pvW:number|null, remainingKwh:number|null, loadProfile:object}} r
   *   remainingKwh: Rest-Prognose der Solaranlage bis Mitternacht (mit Faktor), loadProfile: LoadProfile (kwAt, kwAtRobust)
   */
  record({
    nowMs, houseW, pvW, remainingKwh, loadProfile,
  }) {
    const key = localDateKey(new Date(nowMs), this.tz);
    const p = localParts(new Date(nowMs), this.tz);
    const hour = p.hour + p.minute / 60;
    let d = this.days[key];
    if (!d) {
      d = {
        last: null, gap: 0, firstH: hour, act: 0, load: {}, pv: {},
      };
      this.days[key] = d;
      this._dirty = true;
    }
    const validHouse = Number.isFinite(houseW) && houseW >= 0 && houseW <= 50000;
    const validPv = Number.isFinite(pvW);
    const w = WINDOWS.find((x) => hour >= x.from && hour < x.to) || null;
    if (d.last !== null && nowMs > d.last) {
      const dt = nowMs - d.last;
      const step = Math.min(dt, MAX_STEP_MS);
      d.gap += dt - step;
      if (validPv) d.act += (Math.max(0, pvW) / 1000) * (step / 3600000);
      const cell = w ? d.load[w.key] : null;
      if (cell && cell.fa !== undefined) {
        cell.gap += dt - step;
        if (validHouse) cell.act += (houseW / 1000) * (step / 3600000);
      }
      this._dirty = true;
    }
    if (validPv || validHouse) d.last = nowMs;

    // Prognose des Verbrauchs festhalten: nur in der ersten Stunde des Fensters (sonst fehlt der Anfang des Fensters)
    if (w && !d.load[w.key] && hour < w.from + 1 && loadProfile && typeof loadProfile.kwAt === 'function') {
      const fa = PlanAccuracy._windowForecast(nowMs, this.tz, w, (t) => loadProfile.kwAt(t));
      const fr = typeof loadProfile.kwAtRobust === 'function' ? PlanAccuracy._windowForecast(nowMs, this.tz, w, (t) => loadProfile.kwAtRobust(t)) : null;
      if (fa !== null && fr !== null) {
        d.load[w.key] = {
          fa, fr, act: 0, gap: 0, at: nowMs,
        };
        this._dirty = true;
      }
    }

    // Solar: Stand um 6 Uhr und um 10:30 Uhr
    if (Number.isFinite(remainingKwh) && d.firstH <= PV_FROM_H + 0.5) {
      if (!d.pv.a6 && d.pv.a6 !== 0 && hour >= PV_FROM_H && hour < PV_FROM_H + 1) {
        d.pv.a6 = round2(d.act); d.pv.r6 = round2(remainingKwh); this._dirty = true;
      }
      if (d.pv.r6 !== undefined && d.pv.r10 === undefined && hour >= PV_NOW_H && hour < PV_NOW_H + 1.5) {
        d.pv.a10 = round2(d.act); d.pv.r10 = round2(remainingKwh); this._dirty = true;
      }
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

  /** Alles löschen. */
  reset() {
    this.days = {}; this._dirty = true; this._save(Date.now(), true);
  }

  /** Fehler (%) und Verzerrung (%) einer Liste von Paaren { fc, act }. */
  static _error(pairs) {
    const act = pairs.reduce((s, x) => s + x.act, 0);
    if (!(act > 0)) return null;
    const abs = pairs.reduce((s, x) => s + Math.abs(x.fc - x.act), 0);
    const bias = pairs.reduce((s, x) => s + (x.fc - x.act), 0);
    return { errPct: round1((abs / act) * 100), biasPct: round1((bias / act) * 100) };
  }

  /**
   * Ansicht für die Einstellungen.
   * @returns {{ needed:number, load:object, pv:object }}
   *   load.windows[]: { key, from, to, days, mean:{errPct,biasPct}, robust:{...}, better:'mean'|'robust'|null }
   *   pv: { days, plain:{...}, nowcast:{...}, better:'plain'|'nowcast'|null }
   */
  view(nowMs) {
    const todayKey = localDateKey(new Date(nowMs), this.tz);
    const keys = Object.keys(this.days).sort().filter((k) => k < todayKey);
    const better = (a, b, nameA, nameB) => {
      if (!a || !b) return null;
      if (b.errPct < a.errPct * (1 - BETTER_BY)) return nameB;
      if (a.errPct < b.errPct * (1 - BETTER_BY)) return nameA;
      return null;
    };
    const windows = WINDOWS.map((w) => {
      const pairs = [];
      for (const k of keys) {
        const c = this.days[k].load && this.days[k].load[w.key];
        if (c && c.gap <= MAX_WINDOW_GAP_MS && c.act > 0) pairs.push(c);
      }
      const mean = PlanAccuracy._error(pairs.map((c) => ({ fc: c.fa, act: c.act })));
      const robust = PlanAccuracy._error(pairs.map((c) => ({ fc: c.fr, act: c.act })));
      const enough = pairs.length >= MIN_DAYS;
      return {
        key: w.key,
        from: w.from,
        to: w.to,
        days: pairs.length,
        actualKwh: pairs.length ? round1(pairs.reduce((s, c) => s + c.act, 0) / pairs.length) : null,
        mean: enough ? mean : null,
        robust: enough ? robust : null,
        better: enough ? better(mean, robust, 'mean', 'robust') : null,
      };
    });
    const pvPairs = [];
    for (const k of keys) {
      const d = this.days[k];
      const v = d.pv || {};
      if (v.a6 === undefined || v.r10 === undefined || d.gap > MAX_DAY_GAP_MS) continue;
      const morningFc = v.r6 - v.r10;
      const morningAct = v.a10 - v.a6;
      const restFc = v.r10;
      const restAct = d.act - v.a10;
      if (!(morningFc >= PV_MIN_MORNING_KWH) || !(restFc >= PV_MIN_REST_KWH) || !(restAct >= 0)) continue;
      const ratio = Math.min(RATIO_MAX, Math.max(RATIO_MIN, morningAct / morningFc));
      pvPairs.push({ plain: restFc, nowcast: restFc * ratio, act: restAct });
    }
    const plain = PlanAccuracy._error(pvPairs.map((x) => ({ fc: x.plain, act: x.act })));
    const nowcast = PlanAccuracy._error(pvPairs.map((x) => ({ fc: x.nowcast, act: x.act })));
    const pvEnough = pvPairs.length >= MIN_DAYS;
    return {
      needed: MIN_DAYS,
      load: { windows },
      pv: {
        days: pvPairs.length,
        plain: pvEnough ? plain : null,
        nowcast: pvEnough ? nowcast : null,
        better: pvEnough ? better(plain, nowcast, 'plain', 'nowcast') : null,
      },
    };
  }
}

module.exports = {
  PlanAccuracy, WINDOWS, MIN_DAYS, BETTER_BY,
};
