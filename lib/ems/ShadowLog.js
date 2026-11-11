'use strict';

const { localDateKey } = require('../time');

const MAX_EVENTS = 300;
const MAX_DAYS = 45;
const SAVE_EVERY_MS = 5 * 60 * 1000;

/**
 * Schattenprotokoll: was der Planer tun würde, verglichen mit dem, was Andis EMS tut.
 * Speichert nur Wechsel (Ereignisse) und Tageszähler. `store` = { get(key), set(key, value) }.
 */
class ShadowLog {
  constructor(store, tz = 'Europe/Zurich', area = '') {
    this.store = store;
    this.suffix = area ? `_${area}` : '';
    this.tz = tz;
    this.events = [];
    this.days = {};
    this.last = null;
    this.lastSave = 0;
    this._dirty = false;
    this._load();
  }

  _load() {
    try {
      const e = this.store.get(`shadowEvents${this.suffix}`);
      const d = this.store.get(`shadowDays${this.suffix}`);
      if (Array.isArray(e)) this.events = e;
      if (d && typeof d === 'object') this.days = d;
    } catch (err) { /* leer starten */ }
  }

  _save() {
    try {
      this.store.set(`shadowEvents${this.suffix}`, this.events);
      this.store.set(`shadowDays${this.suffix}`, this.days);
    } catch (err) { /* nicht kritisch */ }
  }

  /**
   * @param {{nowMs:number, soc:number|null, price:number|null, mine:object, andi:object|null}} r
   *   mine = Ergebnis von decideBattery, andi = { mode } oder null (nicht lesbar)
   */
  record({
    nowMs, soc, price, mine, andi,
  }) {
    const key = localDateKey(new Date(nowMs), this.tz);
    const day = this.days[key] || (this.days[key] = {
      ticks: 0, compared: 0, agree: 0, mine: {}, andi: {},
    });
    day.ticks += 1;
    const m = mine.mode;
    day.mine[m] = (day.mine[m] || 0) + 1;
    if (andi && andi.mode) {
      const a = andi.mode;
      day.andi[a] = (day.andi[a] || 0) + 1;
      day.compared += 1;
      if (a === m) day.agree += 1;
    }

    const changed = !this.last || this.last.mine !== mine.mode || this.last.andi !== (andi && andi.mode);
    if (changed) {
      this.events.push({
        ts: nowMs,
        soc: soc === null ? null : Math.round(soc),
        price: price === null ? null : Math.round(price * 10) / 10,
        mine: mine.mode,
        reason: mine.reason,
        andi: andi && andi.mode ? andi.mode : null,
      });
      if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    }
    this.last = { mine: mine.mode, andi: andi && andi.mode ? andi.mode : null };

    const keys = Object.keys(this.days).sort();
    while (keys.length > MAX_DAYS) delete this.days[keys.shift()];
    // Nicht bei jedem Lauf in die Einstellungen schreiben (das Wallbox-Protokoll läuft alle 15 bis 30 s):
    // sofort bei einem Wechsel, sonst höchstens alle 5 Minuten. Die Tageszähler holen den Rest beim nächsten Speichern nach.
    this._dirty = true;
    if (changed || !this.lastSave || nowMs - this.lastSave >= SAVE_EVERY_MS) this.flush(nowMs);
  }

  /** Ausstehende Änderungen speichern (auch beim Beenden der App). */
  flush(nowMs = Date.now()) {
    if (!this._dirty) return;
    this._save();
    this.lastSave = nowMs;
    this._dirty = false;
  }

  summary(nowMs = Date.now()) {
    const today = localDateKey(new Date(nowMs), this.tz);
    const pct = (d) => (d && d.compared ? Math.round((d.agree / d.compared) * 100) : null);
    const all = Object.values(this.days).reduce((a, d) => ({
      compared: a.compared + d.compared, agree: a.agree + d.agree,
    }), { compared: 0, agree: 0 });
    return {
      today: this.days[today] ? { ...this.days[today], agreePct: pct(this.days[today]) } : null,
      overallAgreePct: pct(all),
      days: Object.entries(this.days).sort().slice(-14).map(([k, d]) => ({ day: k, ...d, agreePct: pct(d) })),
      events: this.events.slice(-60).reverse(),
    };
  }
}

module.exports = { ShadowLog };
