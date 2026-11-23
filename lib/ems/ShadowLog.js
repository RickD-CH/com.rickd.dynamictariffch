'use strict';

const MAX_EVENTS = 300;
const SAVE_EVERY_MS = 5 * 60 * 1000;

/**
 * Protokoll der Moduswechsel eines Bereichs (zurzeit die Wallbox): speichert nur Wechsel.
 * `store` = { get(key), set(key, value) }, `area` trennt die Speicherschlüssel.
 */
class ShadowLog {
  constructor(store, tz = 'Europe/Zurich', area = '') {
    this.store = store;
    this.suffix = area ? `_${area}` : '';
    this.tz = tz;
    this.events = [];
    this.last = null;
    this.lastSave = 0;
    this._dirty = false;
    this._load();
  }

  _load() {
    try {
      const e = this.store.get(`shadowEvents${this.suffix}`);
      if (Array.isArray(e)) {
        this.events = e.filter((x) => x && typeof x === 'object').map((x) => ({
          ts: x.ts, soc: x.soc === undefined ? null : x.soc, price: x.price === undefined ? null : x.price, mine: x.mine, reason: x.reason,
        }));
      }
    } catch (err) { /* leer starten */ }
  }

  _save() {
    try {
      this.store.set(`shadowEvents${this.suffix}`, this.events);
    } catch (err) { /* nicht kritisch */ }
  }

  /**
   * @param {{nowMs:number, soc:number|null, price:number|null, mine:{mode:string, reason:string}}} r
   */
  record({
    nowMs, soc, price, mine,
  }) {
    const changed = !this.last || this.last.mine !== mine.mode;
    if (changed) {
      this.events.push({
        ts: nowMs,
        soc: soc === null || soc === undefined ? null : Math.round(soc),
        price: price === null || price === undefined ? null : Math.round(price * 10) / 10,
        mine: mine.mode,
        reason: mine.reason,
      });
      if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    }
    this.last = { mine: mine.mode };
    // Nicht bei jedem Lauf in die Einstellungen schreiben (das Wallbox-Protokoll läuft alle 15 bis 30 s): sofort bei einem Wechsel, sonst höchstens alle 5 Minuten.
    this._dirty = this._dirty || changed;
    if (changed) this.flush(nowMs);
    else if (this._dirty && (!this.lastSave || nowMs - this.lastSave >= SAVE_EVERY_MS)) this.flush(nowMs);
  }

  /** Alles löschen (Go-live: Testdaten weg). */
  reset() {
    this.events = []; this.last = null; this._dirty = true; this.flush();
  }

  /** Ausstehende Änderungen speichern (auch beim Beenden der App). */
  flush(nowMs = Date.now()) {
    if (!this._dirty) return;
    this._save();
    this.lastSave = nowMs;
    this._dirty = false;
  }

  summary() {
    return { events: this.events.slice(-60).reverse() };
  }
}

module.exports = { ShadowLog };
