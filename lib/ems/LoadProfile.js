'use strict';

const { localParts, localDateKey } = require('../time');

const DAYS_KEPT = 7;
const SAVE_EVERY_MS = 15 * 60 * 1000;
const MIN_SAMPLES = 3; // Viertelstunde zählt erst mit ein paar Messungen

/**
 * Gelernter Hausverbrauch: Durchschnitt pro Viertelstunde des Tages (lokale Zeit) über die letzten 7 Tage.
 * Gespeichert werden je Tag Summe und Anzahl der Messungen pro Viertelstunde. `store` = { get(key), set(key, value) }.
 */
class LoadProfile {
  constructor(store, tz = 'Europe/Zurich') {
    this.store = store;
    this.tz = tz;
    this.days = {};
    this.lastSave = 0;
    this._dirty = false;
    try {
      const v = store ? store.get('loadProfile') : null;
      if (v && typeof v === 'object' && v.days && typeof v.days === 'object') this.days = v.days;
    } catch (err) { /* leer starten */ }
  }

  static slotIndex(ms, tz) {
    const p = localParts(new Date(ms), tz);
    return p.hour * 4 + Math.floor(p.minute / 15);
  }

  /** Eine Messung (W) übernehmen. Unplausible Werte (negativ, über 50 kW) werden ignoriert. */
  record(nowMs, houseW) {
    const w = Number(houseW);
    if (!Number.isFinite(w) || w < 0 || w > 50000) return;
    const key = localDateKey(new Date(nowMs), this.tz);
    const day = this.days[key] || (this.days[key] = { s: new Array(96).fill(0), n: new Array(96).fill(0) });
    const i = LoadProfile.slotIndex(nowMs, this.tz);
    day.s[i] += w;
    day.n[i] += 1;
    const keys = Object.keys(this.days).sort();
    while (keys.length > DAYS_KEPT + 1) delete this.days[keys.shift()];
    this._dirty = true;
    if (!this.lastSave || nowMs - this.lastSave >= SAVE_EVERY_MS) this.flush(nowMs);
  }

  flush(nowMs = Date.now()) {
    if (!this._dirty || !this.store) return;
    try {
      this.store.set('loadProfile', { days: this.days });
    } catch (err) { /* nicht kritisch */ }
    this.lastSave = nowMs;
    this._dirty = false;
  }

  /** Durchschnitt (kW) für die Viertelstunde des Tages von `ms`, oder null ohne genug Messungen. */
  kwAt(ms) {
    const i = LoadProfile.slotIndex(ms, this.tz);
    let sum = 0;
    let cnt = 0;
    for (const d of Object.values(this.days)) {
      if (d.n[i] >= MIN_SAMPLES) {
        sum += d.s[i] / d.n[i]; cnt += 1;
      }
    }
    return cnt ? Math.round((sum / cnt) / 10) / 100 : null;
  }

  /** Anzahl Tage mit Messungen. */
  dayCount() {
    return Object.values(this.days).filter((d) => d.n.some((x) => x >= MIN_SAMPLES)).length;
  }

  /** Durchschnitt (kW) über eine Tageszeit (von bis Stunde, lokal), oder null. Für die Anzeige. */
  averageKw(fromHour, toHour) {
    const vals = [];
    for (let i = fromHour * 4; i < toHour * 4; i++) {
      let sum = 0;
      let cnt = 0;
      for (const d of Object.values(this.days)) {
        if (d.n[i] >= MIN_SAMPLES) {
          sum += d.s[i] / d.n[i]; cnt += 1;
        }
      }
      if (cnt) vals.push(sum / cnt);
    }
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) / 10) / 100 : null;
  }

  info() {
    return { days: this.dayCount(), morningKw: this.averageKw(5, 10), eveningKw: this.averageKw(17, 22) };
  }
}

module.exports = { LoadProfile, DAYS_KEPT };
