'use strict';

const { localDateKey } = require('../time');

const DAYS_KEPT = 45;
const SAVE_EVERY_MS = 15 * 60 * 1000;
const MAX_STEP_MS = 15 * 60 * 1000;

/**
 * Franken-Auswertung der Batterie-Entscheide (Modell): zwei virtuelle Batterien laufen mit, eine nach den Entscheiden
 * dieses EMS («mine»), eine nach denen des anderen EMS («other»), dazu ein Haus ohne Batterie («none»). Alle bekommen
 * den echten Hausverbrauch, den echten Solarstrom und die echten Preise. Jeden Tag starten beide Batterien beim echten
 * Ladestand; am Tagesende wird die Ladung, die mehr oder weniger übrig ist, zum Tagesdurchschnittspreis verrechnet.
 *
 * Modell pro Lauf (Dauer = Zeit seit dem letzten Lauf, höchstens 15 min):
 *   Laden  : aus dem Netz mit Ladeleistung bis zum Ziel, dazu Solarüberschuss
 *   Halten : nicht entladen, Solarüberschuss lädt
 *   Normal : Haus aus der Batterie bis zur Untergrenze, Solarüberschuss lädt
 * Kosten = Bezug x Preis - Einspeisung x Einspeisepreis.
 */
class DecisionLedger {
  constructor(store, tz = 'Europe/Zurich') {
    this.store = store;
    this.tz = tz;
    this.days = {};
    this.cur = null;
    this.lastSave = 0;
    this._dirty = false;
    try {
      const v = store ? store.get('decisionLedger') : null;
      if (v && typeof v === 'object') {
        this.days = v.days && typeof v.days === 'object' ? v.days : {};
        this.cur = v.cur && typeof v.cur === 'object' ? v.cur : null;
      }
    } catch (err) { /* leer starten */ }
  }

  static simulate(v, mode, {
    netKw, dtH, price, feedIn, p,
  }) {
    const effIn = Math.sqrt(p.eff);
    const effOut = Math.sqrt(p.eff);
    let imp = 0;
    let exp = 0;
    let { e } = v;
    if (mode === 'charge') {
      const room = Math.max(0, p.target - e);
      const gridKw = Math.min(p.powerKw, room / dtH / effIn);
      e += gridKw * dtH * effIn;
      imp += gridKw * dtH;
    }
    if (netKw > 0) {
      let dis = 0;
      if (mode === 'normal') dis = Math.min(netKw, p.powerKw, (Math.max(0, e - p.floor) * effOut) / dtH);
      e -= (dis * dtH) / effOut;
      imp += (netKw - dis) * dtH;
    } else {
      const s = -netKw;
      const inKw = Math.min(s, p.powerKw, Math.max(0, p.cap - e) / dtH / effIn);
      e += inKw * dtH * effIn;
      exp += (s - inKw) * dtH;
    }
    return {
      e, cost: v.cost + imp * price - exp * feedIn, imp: v.imp + imp, exp: v.exp + exp,
    };
  }

  /** Tagesabschluss: Kosten in CHF, übrig gebliebene Ladung zum Tagesdurchschnitt verrechnet. */
  _close(cur) {
    if (!cur || !cur.n) return;
    const avg = cur.priceSum / cur.n;
    const chf = (v) => (v ? Math.round(((v.cost - (v.e - cur.e0) * avg) / 100) * 100) / 100 : null);
    this.days[cur.day] = {
      mine: chf(cur.mine), other: cur.otherN > 0 && cur.otherN >= cur.n * 0.8 ? chf(cur.other) : null, none: Math.round((cur.none.cost / 100) * 100) / 100, hours: Math.round(cur.hours * 10) / 10,
    };
    const keys = Object.keys(this.days).sort();
    while (keys.length > DAYS_KEPT) delete this.days[keys.shift()];
  }

  /**
   * Einen Lauf verbuchen.
   * @param {object} x { nowMs, mine, other|null, price (Rp.), feedIn (Rp.), houseW, pvW, socPct, p: { capacityKwh, efficiency, powerKw, floorSoc, targetSoc } }
   */
  step(x) {
    const {
      nowMs, mine, other, price, houseW, pvW, socPct,
    } = x;
    if (!Number.isFinite(price) || !Number.isFinite(houseW) || !Number.isFinite(socPct) || !(x.p && x.p.capacityKwh > 0)) return;
    const cap = x.p.capacityKwh;
    const p = {
      cap, eff: Math.min(1, Math.max(0.5, x.p.efficiency || 0.9)), powerKw: x.p.powerKw || 5, floor: ((x.p.floorSoc || 10) / 100) * cap, target: ((x.p.targetSoc || 90) / 100) * cap,
    };
    const day = localDateKey(new Date(nowMs), this.tz);
    const e0 = (socPct / 100) * cap;
    if (!this.cur || this.cur.day !== day) {
      this._close(this.cur);
      const fresh = () => ({
        e: e0, cost: 0, imp: 0, exp: 0,
      });
      this.cur = {
        day, e0, last: nowMs, n: 0, otherN: 0, priceSum: 0, hours: 0, mine: fresh(), other: fresh(), none: fresh(),
      };
      this._dirty = true;
      return;
    }
    const dtMs = Math.min(MAX_STEP_MS, nowMs - this.cur.last);
    this.cur.last = nowMs;
    if (!(dtMs > 0)) return;
    const env = {
      netKw: (houseW - (Number.isFinite(pvW) ? pvW : 0)) / 1000, dtH: dtMs / 3600000, price, feedIn: Number.isFinite(x.feedIn) ? x.feedIn : 0, p,
    };
    this.cur.mine = DecisionLedger.simulate(this.cur.mine, mine, env);
    if (other) {
      const tOther = Number.isFinite(x.p.targetOtherSoc) ? (x.p.targetOtherSoc / 100) * cap : p.target;
      this.cur.other = DecisionLedger.simulate(this.cur.other, other, { ...env, p: { ...p, target: tOther } });
      this.cur.otherN += 1;
    }
    this.cur.none = DecisionLedger.simulate({ ...this.cur.none, e: 0 }, 'hold', { ...env, p: { ...p, cap: 0 } });
    this.cur.n += 1;
    this.cur.priceSum += price;
    this.cur.hours += env.dtH;
    this._dirty = true;
    if (!this.lastSave || nowMs - this.lastSave >= SAVE_EVERY_MS) this.flush(nowMs);
  }

  /** Alles löschen (Go-live: Testdaten weg). */
  reset() {
    this.days = {}; this.cur = null; this._dirty = true; this.flush();
  }

  flush(nowMs = Date.now()) {
    if (!this._dirty || !this.store) return;
    try {
      this.store.set('decisionLedger', { days: this.days, cur: this.cur });
    } catch (err) { /* nicht kritisch */ }
    this.lastSave = nowMs;
    this._dirty = false;
  }

  /** Abgeschlossene Tage (neueste zuerst), der laufende Tag als Zwischenstand, Summen. */
  summary() {
    const days = Object.entries(this.days).sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, d]) => ({ day, ...d }));
    const both = days.filter((d) => d.mine !== null && d.other !== null);
    const sum = (arr, k) => Math.round(arr.reduce((a, d) => a + (d[k] || 0), 0) * 100) / 100;
    let today = null;
    if (this.cur && this.cur.n) {
      const chf = (v) => Math.round((v.cost / 100) * 100) / 100;
      today = {
        day: this.cur.day, mine: chf(this.cur.mine), other: this.cur.otherN ? chf(this.cur.other) : null, none: chf(this.cur.none), hours: Math.round(this.cur.hours * 10) / 10,
      };
    }
    return {
      days,
      today,
      total: {
        days: both.length, mine: sum(both, 'mine'), other: sum(both, 'other'), none: sum(days, 'none'),
      },
    };
  }
}

module.exports = { DecisionLedger };
