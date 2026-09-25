'use strict';

const {
  SLOT_MS, startOfLocalDay, addLocalDays, windowAround, DEFAULT_TZ,
} = require('./time');

/**
 * Hält die bekannten 15-Minuten-Slots im Speicher und beantwortet die Fragen, die Flow-Karten
 * brauchen. Reine Logik, keine Homey- oder Netzwerk-Abhängigkeit → gut testbar.
 *
 * Slot-Format: siehe normalizeSlot() in InnostromClient.js
 * Das Feld, nach dem bewertet wird, ist konfigurierbar (Standard 'integrated' = Gesamtpreis).
 */
class PriceStore {
  /**
   * @param {object} [opts]
   * @param {'integrated'|'electricity'|'grid'|'dso'|'feedIn'} [opts.field='integrated']
   * @param {string} [opts.tz='Europe/Zurich']
   */
  constructor({ field = 'integrated', tz = DEFAULT_TZ } = {}) {
    this.field = field;
    this.tz = tz;
    /** @type {Map<number, object>} key = start.getTime() */
    this.slots = new Map();
  }

  /** Slots hinzufügen/überschreiben (neuere Werte gewinnen). */
  upsert(slots) {
    for (const s of slots) this.slots.set(s.start.getTime(), s);
  }

  /** Alles vor `before` löschen (Speicher klein halten, z. B. alles älter als gestern). */
  prune(before) {
    for (const k of this.slots.keys()) if (k < before.getTime()) this.slots.delete(k);
  }

  /** Sortierte Slots mit start in [from, to). */
  range(from, to) {
    return [...this.slots.values()]
      .filter((s) => s.start >= from && s.start < to)
      .sort((a, b) => a.start - b.start);
  }

  /** Slot, der `now` enthält (oder null). */
  at(now) {
    const key = Math.floor(now.getTime() / SLOT_MS) * SLOT_MS;
    return this.slots.get(key) || null;
  }

  /** Nächster Slot nach dem aktuellen. */
  next(now) {
    return this.at(new Date(Math.floor(now.getTime() / SLOT_MS) * SLOT_MS + SLOT_MS));
  }

  /** Preis (Zahl) des Slots gemäss this.field, oder null. */
  value(slot) {
    if (!slot) return null;
    const v = slot[this.field];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }

  /** Ende der lückenlos bekannten Daten ab `now` (exklusiv), oder null wenn der aktuelle Slot fehlt. */
  coveredUntil(now) {
    let t = Math.floor(now.getTime() / SLOT_MS) * SLOT_MS;
    if (!this.slots.has(t)) return null;
    while (this.slots.has(t)) t += SLOT_MS;
    return new Date(t);
  }

  /** Sind alle Slots des lokalen Kalendertags von `day` vorhanden? (92/96/100 Slots) */
  hasFullDay(day) {
    const from = startOfLocalDay(day, this.tz);
    const to = addLocalDays(day, 1, this.tz);
    const expected = Math.round((to - from) / SLOT_MS);
    return this.range(from, to).filter((s) => this.value(s) !== null).length === expected;
  }

  /** min / max / avg über [from, to). null, wenn keine Daten. */
  stats(from, to) {
    const vals = this.range(from, to).map((s) => this.value(s)).filter((v) => v !== null);
    if (vals.length === 0) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    return {
      min: Math.min(...vals), max: Math.max(...vals), avg: sum / vals.length, count: vals.length,
    };
  }

  /** Statistik des lokalen Tages, in dem `now` liegt. */
  dayStats(now) {
    return this.stats(startOfLocalDay(now, this.tz), addLocalDays(now, 1, this.tz));
  }

  /**
   * Die `count` günstigsten Slots in [from, to) (nicht zusammenhängend).
   * Bei Gleichstand gewinnt der frühere Slot (deterministisch).
   * @returns {object[]} nach Zeit sortiert
   */
  cheapestSlots(from, to, count) {
    return this._extremeSlots(from, to, count, 1);
  }

  /** Die `count` teuersten Slots in [from, to). */
  mostExpensiveSlots(from, to, count) {
    return this._extremeSlots(from, to, count, -1);
  }

  _extremeSlots(from, to, count, dir) {
    const cands = this.range(from, to).filter((s) => this.value(s) !== null);
    return cands
      .slice()
      .sort((a, b) => dir * (this.value(a) - this.value(b)) || a.start - b.start)
      .slice(0, Math.max(0, count))
      .sort((a, b) => a.start - b.start);
  }

  /**
   * Günstigster zusammenhängender Block von `durationSlots` Viertelstunden, der ganz in
   * [from, to) liegt. Lücken in den Daten brechen einen Block.
   * @returns {{ start: Date, end: Date, avg: number, slots: object[] } | null}
   */
  cheapestBlock(from, to, durationSlots) {
    const list = this.range(from, to).filter((s) => this.value(s) !== null);
    let best = null;
    for (let i = 0; i + durationSlots <= list.length; i++) {
      const block = list.slice(i, i + durationSlots);
      const contiguous = block.every((s, j) => j === 0 || s.start - block[j - 1].start === SLOT_MS);
      if (!contiguous) continue;
      const avg = block.reduce((a, s) => a + this.value(s), 0) / durationSlots;
      if (!best || avg < best.avg - 1e-12) {
        best = {
          start: block[0].start, end: new Date(block[durationSlots - 1].start.getTime() + SLOT_MS), avg, slots: block,
        };
      }
    }
    return best;
  }

  /**
   * Gehört die aktuelle Viertelstunde zu den `count` günstigsten im Zeitfenster
   * "von HH:MM bis HH:MM" (lokal, über Mitternacht möglich)?
   * Liefert null, wenn für das Fenster nicht alle Preise bekannt sind (Aufrufer entscheidet,
   * z. B. Flow-Bedingung = false + Log).
   */
  isAmongCheapest(now, fromHHMM, toHHMM, count) {
    return this._isAmong(now, fromHHMM, toHHMM, count, 1);
  }

  isAmongMostExpensive(now, fromHHMM, toHHMM, count) {
    return this._isAmong(now, fromHHMM, toHHMM, count, -1);
  }

  _isAmong(now, fromHHMM, toHHMM, count, dir) {
    const { from, to } = windowAround(now, fromHHMM, toHHMM, this.tz);
    if (now < from) return false; // Fenster hat noch nicht begonnen
    const expected = Math.round((to - from) / SLOT_MS);
    const have = this.range(from, to).filter((s) => this.value(s) !== null).length;
    if (have < expected) return null;
    const key = Math.floor(now.getTime() / SLOT_MS) * SLOT_MS;
    return this._extremeSlots(from, to, count, dir).some((s) => s.start.getTime() === key);
  }

  /**
   * Rang des aktuellen Slots im lokalen Tag: 1 = günstigster. null wenn unbekannt.
   */
  rankToday(now) {
    const cur = this.at(now);
    const v = this.value(cur);
    if (v === null) return null;
    const vals = this.range(startOfLocalDay(now, this.tz), addLocalDays(now, 1, this.tz))
      .map((s) => this.value(s)).filter((x) => x !== null);
    return 1 + vals.filter((x) => x < v).length;
  }

  /**
   * Preisniveau relativ zum Tagesdurchschnitt.
   * @returns {'very_cheap'|'cheap'|'normal'|'expensive'|'very_expensive'|null}
   */
  level(now, {
    cheap = 0.9, veryCheap = 0.75, expensive = 1.1, veryExpensive = 1.25,
  } = {}) {
    const v = this.value(this.at(now));
    const st = this.dayStats(now);
    if (v === null || !st || st.avg <= 0) return null;
    const r = v / st.avg;
    if (r <= veryCheap) return 'very_cheap';
    if (r <= cheap) return 'cheap';
    if (r >= veryExpensive) return 'very_expensive';
    if (r >= expensive) return 'expensive';
    return 'normal';
  }

  /** Für Persistenz (this.homey.settings / device store). */
  toJSON() {
    return [...this.slots.values()].map((s) => ({ ...s, start: s.start.toISOString(), end: s.end.toISOString() }));
  }

  static fromJSON(arr, opts) {
    const st = new PriceStore(opts);
    st.upsert((arr || []).map((s) => ({ ...s, start: new Date(s.start), end: new Date(s.end) })));
    return st;
  }
}

module.exports = { PriceStore };
