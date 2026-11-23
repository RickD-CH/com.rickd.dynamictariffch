'use strict';

const QUARTER_MS = 15 * 60 * 1000;
const KEEP_MS = 49 * 60 * 60 * 1000;
const SAVE_EVERY_MS = 2 * 60 * 1000;
const STORE_KEY = 'planLog';

/** Wie "aktiv" ein Wallbox-Modus ist: innerhalb einer Viertelstunde gewinnt der aktivste. */
const CHARGER_RANK = {
  instant_ev: 6, solar_ev: 5, battery_priority: 4, holding: 3, error: 2, idle: 1, disabled: 0,
};

/**
 * Verlauf je Viertelstunde für die Plan-Sicht (letzte ~48 Stunden):
 *   { t, c: Wallbox-Modus, w: höchste Wallbox-Leistung (W), b: Batterie-Modus (Planer), k: { [verbraucherId]: 0|1 },
 *     p: mittlere PV-Leistung (W) der Viertelstunde, pn: Anzahl Messungen dafür }
 * Speichert höchstens alle 2 Minuten (oder wenn eine neue Viertelstunde beginnt), nie bei jedem 15-s-Lauf.
 * `store` = { get(key), set(key, value) }.
 */
class PlanLog {
  constructor(store) {
    this.store = store;
    this.entries = [];
    this.lastSave = 0;
    this._dirty = false;
    try {
      const v = store ? store.get(STORE_KEY) : null;
      if (Array.isArray(v)) this.entries = v.filter((e) => e && Number.isFinite(e.t));
    } catch (err) { /* leer starten */ }
  }

  /** Alles löschen (Go-live: Testdaten weg). */
  reset() {
    this.entries = [];
    try {
      if (this.store) this.store.set(STORE_KEY, []);
    } catch (err) { /* nicht kritisch */ }
    this._dirty = false;
  }

  _entry(nowMs) {
    const t = Math.floor(nowMs / QUARTER_MS) * QUARTER_MS;
    const last = this.entries[this.entries.length - 1];
    if (last && last.t === t) return { e: last, fresh: false };
    const e = { t };
    // Einsortieren (normalerweise am Ende)
    this.entries.push(e);
    if (last && last.t > t) this.entries.sort((a, b) => a.t - b.t);
    return { e, fresh: true };
  }

  /**
   * @param {{nowMs:number, charger?:{mode:string,powerW?:number|null}|null, consumers?:{id:string,isOn:boolean}[]|null, battery?:string|null}} r
   */
  record({
    nowMs, charger = null, consumers = null, battery = null, pvW = null,
  }) {
    const { e, fresh } = this._entry(nowMs);
    if (charger && charger.mode) {
      const rank = (m) => (m in CHARGER_RANK ? CHARGER_RANK[m] : 1);
      if (!e.c || rank(charger.mode) >= rank(e.c)) e.c = charger.mode;
      const w = Number(charger.powerW);
      if (Number.isFinite(w) && w > 0) e.w = Math.max(e.w || 0, Math.round(w));
    }
    if (battery) e.b = battery;
    if (Number.isFinite(pvW) && pvW >= 0) {
      const n = e.pn || 0;
      e.p = Math.round(((e.p || 0) * n + pvW) / (n + 1));
      e.pn = n + 1;
    }
    if (Array.isArray(consumers) && consumers.length) {
      e.k = e.k || {};
      for (const c of consumers) {
        if (!c || !c.id) continue;
        e.k[c.id] = c.isOn ? 1 : (e.k[c.id] || 0);
      }
    }
    const cutoff = nowMs - KEEP_MS;
    while (this.entries.length && this.entries[0].t < cutoff) this.entries.shift();
    this._dirty = true;
    if (fresh || nowMs - this.lastSave >= SAVE_EVERY_MS) this.flush(nowMs);
  }

  flush(nowMs = Date.now()) {
    if (!this._dirty) return;
    try {
      if (this.store) this.store.set(STORE_KEY, this.entries);
    } catch (err) { /* nicht kritisch */ }
    this.lastSave = nowMs;
    this._dirty = false;
  }

  /** Einträge ab `fromMs` (für die Plan-Sicht). */
  since(fromMs) {
    return this.entries.filter((e) => e.t >= fromMs);
  }
}

module.exports = { PlanLog, CHARGER_RANK, QUARTER_MS };
