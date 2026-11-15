'use strict';

const { localDateKey } = require('../time');

const DAYS_KEPT = 45;
const SAVE_EVERY_MS = 15 * 60 * 1000;
const MAX_STEP_MS = 15 * 60 * 1000;

/** Preisstufe (Rp./kWh) für die Aufschlüsselung der Kosten nach Situation. */
const bandOf = (price) => (price < 20 ? 'low' : (price < 30 ? 'mid' : 'high'));
const round3 = (v) => Math.round(v * 1000) / 1000;

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
 *
 * Eigenes Szenario («mine» virtuell, `v`): unser Planer entscheidet auf dem Ladestand der virtuellen Batterie, die er selbst erzeugt hat, nicht auf dem der
 * echten (die das andere EMS steuert). So ist der Vergleich fair; das andere EMS entscheidet ja auf seiner echten Batterie. Das Zeitfenster `w` beginnt am
 * Tagesanfang (oder beim ersten Lauf mit diesem Szenario) und gilt für alle drei Kosten gleich.
 *
 * Das andere EMS steuert die echte Batterie: seine simulierte Batterie wird bei jedem Lauf auf den echten Ladestand des letzten Laufs gesetzt (`rE`),
 * sonst läuft sie über den Tag davon (Plan gelesen, Verluste, Leistungsgrenzen). Es wird also nur noch ein Lauf simuliert, nicht ein ganzer Tag. Unser
 * Szenario (`v`) dagegen läuft über den Tag auf seinem eigenen Ladestand.
 *
 * Eichung (`cal`): die Kosten, die der Netzzähler wirklich gemessen hat (Bezug x Preis - Einspeisung x Einspeisepreis), gegen die simulierte Batterie des
 * anderen EMS im gleichen Zeitfenster, dazu die mittlere Abweichung zwischen simuliertem und echtem Ladestand. Stimmt das, ist das Modell glaubwürdig.
 *
 * Aufschlüsselung (`cls`, ab 15.11.2026): die Kosten jedes Laufs werden nach Situation gebucht, also nach dem Entscheid dieses EMS, dem Entscheid des
 * anderen EMS und der Preisstufe. So sieht man, in welchen Situationen der Unterschied entsteht (z. B. «wir entladen, das andere hält» zu mittleren
 * Preisen) und was frühere Entscheide später kosten (gleiche Entscheide, aber unterschiedlicher Ladestand). Nicht enthalten: die am Tagesende
 * verrechnete Restladung (Tagesdurchschnittspreis).
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

  /** Zeitfenster für das eigene Szenario beginnen: die virtuelle Batterie startet beim echten Ladestand, die Kosten der anderen zählen ab jetzt. */
  _startWindow(e0) {
    this.cur.v = {
      e: e0, cost: 0, imp: 0, exp: 0,
    };
    this.cur.w = {
      e0v: e0, e0o: this.cur.other.e, cOther: this.cur.other.cost, cNone: this.cur.none.cost, n: 0, otherN: 0, priceSum: 0, hours: 0,
    };
  }

  /** Kosten des Zeitfensters (eigenes Szenario gegen das andere EMS) und Eichung gegen den Zähler, in CHF. Übrige Ladung zählt zum Durchschnittspreis. */
  static _windowResult(cur) {
    const r2 = (v) => Math.round((v / 100) * 100) / 100;
    const out = { v: null, cal: null };
    if (cur.v && cur.w && cur.w.n > 0) {
      const w = cur.w;
      const avg = w.priceSum / w.n;
      out.v = {
        mine: r2(cur.v.cost - (cur.v.e - w.e0v) * avg),
        other: w.otherN >= w.n * 0.8 ? r2(cur.other.cost - w.cOther - (cur.other.e - w.e0o) * avg) : null,
        none: r2(cur.none.cost - w.cNone),
        hours: Math.round(w.hours * 10) / 10,
      };
    }
    const k = cur.cal;
    if (k && k.errN > 0 && cur.n > 0) {
      const avg = cur.priceSum / cur.n;
      const kwh = (v) => Math.round(v * 100) / 100;
      out.cal = {
        hours: Math.round(k.hours * 10) / 10,
        realChf: r2(k.rCost - (k.rE1 - k.rE0) * avg),
        simChf: r2(k.sCost - k.sE * avg),
        realRawChf: r2(k.rCost),
        simRawChf: r2(k.sCost),
        realImpKwh: kwh(k.rImp),
        simImpKwh: kwh(k.sImp),
        realExpKwh: kwh(k.rExp),
        simExpKwh: kwh(k.sExp),
        socErr: Math.round((k.errSum / k.errN) * 10) / 10,
      };
    }
    return out;
  }

  static _roundCls(cls) {
    const out = {};
    for (const [k, c] of Object.entries(cls || {})) {
      out[k] = {
        h: round3(c.h), cm: round3(c.cm), co: round3(c.co), im: round3(c.im), io: round3(c.io),
      };
    }
    return out;
  }

  /** Tagesabschluss: Kosten in CHF, übrig gebliebene Ladung zum Tagesdurchschnitt verrechnet. */
  _close(cur) {
    if (!cur || !cur.n) return;
    const avg = cur.priceSum / cur.n;
    const chf = (v) => (v ? Math.round(((v.cost - (v.e - cur.e0) * avg) / 100) * 100) / 100 : null);
    const win = DecisionLedger._windowResult(cur);
    this.days[cur.day] = {
      v: win.v,
      cal: win.cal,
      cls: DecisionLedger._roundCls(cur.cls),
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
        day, e0, last: nowMs, n: 0, otherN: 0, priceSum: 0, hours: 0, mine: fresh(), other: fresh(), none: fresh(), cls: {}, rE: e0,
      };
      if (x.mineV) this._startWindow(e0);
      this._dirty = true;
      return;
    }
    const dtMs = Math.min(MAX_STEP_MS, nowMs - this.cur.last);
    this.cur.last = nowMs;
    if (!(dtMs > 0)) return;
    // die simulierte Batterie des anderen EMS startet jeden Lauf beim echten Ladestand des letzten Laufs
    if (other && Number.isFinite(this.cur.rE)) this.cur.other = { ...this.cur.other, e: Math.min(cap, Math.max(0, this.cur.rE)) };
    if (x.mineV && !this.cur.v) {
      this._startWindow(e0);
      this.cur.cls = {}; // die Aufschlüsselung gilt ab jetzt für das eigene Szenario
    }
    const env = {
      netKw: (houseW - (Number.isFinite(pvW) ? pvW : 0)) / 1000, dtH: dtMs / 3600000, price, feedIn: Number.isFinite(x.feedIn) ? x.feedIn : 0, p,
    };
    // Ist die echte Batterie leer (an der Untergrenze), bedeutet «Halten» dasselbe wie «Normal»: es gibt nichts zu
    // entladen. Das Modell kann aber noch Ladung haben (es weicht über den Tag etwas von der echten Batterie ab) und
    // würde sonst teuer zukaufen, obwohl in Wirklichkeit kein Unterschied besteht.
    const empty = socPct <= (x.p.floorSoc || 10) + 1;
    const asRun = (mode) => (empty && mode === 'hold' ? 'normal' : mode);
    const before = { m: this.cur.mine, o: this.cur.other, v: this.cur.v };
    this.cur.mine = DecisionLedger.simulate(this.cur.mine, asRun(mine), env);
    if (this.cur.v) {
      const tV = Number.isFinite(x.p.targetVSoc) ? (x.p.targetVSoc / 100) * cap : p.target;
      this.cur.v = DecisionLedger.simulate(this.cur.v, x.mineV, { ...env, p: { ...p, target: tV } });
      const w = this.cur.w;
      w.n += 1; w.priceSum += price; w.hours += env.dtH; if (other) w.otherN += 1;
    }
    if (other) {
      const tOther = Number.isFinite(x.p.targetOtherSoc) ? (x.p.targetOtherSoc / 100) * cap : p.target;
      this.cur.other = DecisionLedger.simulate(this.cur.other, asRun(other), { ...env, p: { ...p, target: tOther } });
      this.cur.otherN += 1;
      // Kosten dieses Laufs nach Situation buchen (Entscheid ich | Entscheid anderes EMS | Preisstufe)
      if (!this.cur.cls) this.cur.cls = {};
      const own = this.cur.v ? { mode: x.mineV, now: this.cur.v, was: before.v } : { mode: mine, now: this.cur.mine, was: before.m };
      const key = `${own.mode}|${other}|${bandOf(price)}`;
      const c = this.cur.cls[key] || (this.cur.cls[key] = { h: 0, cm: 0, co: 0, im: 0, io: 0 });
      c.h += env.dtH;
      c.cm += own.now.cost - own.was.cost;
      c.co += this.cur.other.cost - before.o.cost;
      c.im += own.now.imp - own.was.imp;
      c.io += this.cur.other.imp - before.o.imp;
      // Eichung: echter Netzzähler gegen die simulierte Batterie des anderen EMS, nur in Läufen mit beidem
      if (Number.isFinite(x.gridW)) {
        const g = x.gridW / 1000;
        const realE = (socPct / 100) * cap;
        if (!this.cur.cal) {
          this.cur.cal = {
            hours: 0, rCost: 0, rImp: 0, rExp: 0, sCost: 0, sImp: 0, sExp: 0, sE: 0, rE0: realE, rE1: realE, errSum: 0, errN: 0,
          };
        }
        const k = this.cur.cal;
        const imp = Math.max(0, g) * env.dtH;
        const exp = Math.max(0, -g) * env.dtH;
        k.hours += env.dtH;
        k.rCost += imp * price - exp * env.feedIn;
        k.rImp += imp; k.rExp += exp;
        k.sCost += this.cur.other.cost - before.o.cost;
        k.sImp += this.cur.other.imp - before.o.imp;
        k.sExp += this.cur.other.exp - before.o.exp;
        k.sE += this.cur.other.e - before.o.e;
        k.rE1 = realE;
        k.errSum += Math.abs(((this.cur.other.e - realE) / cap) * 100);
        k.errN += 1;
      }
      // und nach dem Lauf beim echten Ladestand von jetzt (der Rest bis zum nächsten Lauf ist ein neuer Lauf)
      this.cur.other = { ...this.cur.other, e: Math.min(cap, e0) };
    }
    this.cur.rE = e0;
    this.cur.none = DecisionLedger.simulate({ ...this.cur.none, e: 0 }, 'hold', { ...env, p: { ...p, cap: 0 } });
    this.cur.n += 1;
    this.cur.priceSum += price;
    this.cur.hours += env.dtH;
    this._dirty = true;
    if (!this.lastSave || nowMs - this.lastSave >= SAVE_EVERY_MS) this.flush(nowMs);
  }

  /** Ladestand (%) der virtuellen Batterie des eigenen Szenarios; ohne laufenden Tag oder ohne Szenario der echte Ladestand. */
  virtualSoc(nowMs, capacityKwh, realSoc) {
    const day = localDateKey(new Date(nowMs), this.tz);
    if (this.cur && this.cur.day === day && this.cur.v && capacityKwh > 0) return (this.cur.v.e / capacityKwh) * 100;
    return realSoc;
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

  /**
   * Aufschlüsselung nach Situation über alle Tage mit beiden Auswertungen und den laufenden Tag: Stunden, Kosten (CHF) und Netzbezug (kWh)
   * je Situation, geordnet nach dem Unterschied (zuerst, was dieses EMS im Vergleich am meisten kostet).
   */
  _breakdown() {
    const acc = {};
    const add = (cls) => {
      for (const [k, c] of Object.entries(cls || {})) {
        const a = acc[k] || (acc[k] = { h: 0, cm: 0, co: 0, im: 0, io: 0 });
        a.h += c.h; a.cm += c.cm; a.co += c.co; a.im += c.im; a.io += c.io;
      }
    };
    for (const d of Object.values(this.days)) if (d.mine !== null && d.other !== null) add(d.cls);
    if (this.cur && this.cur.otherN) add(this.cur.cls);
    const chf = (v) => Math.round(v) / 100;
    const kwh = (v) => Math.round(v * 100) / 100;
    return Object.entries(acc).map(([k, a]) => {
      const [mine, other, band] = k.split('|');
      return {
        mine, other, band, hours: Math.round(a.h * 100) / 100, mineChf: chf(a.cm), otherChf: chf(a.co), diffChf: chf(a.cm - a.co), mineKwh: kwh(a.im), otherKwh: kwh(a.io),
      };
    }).sort((x, y) => y.diffChf - x.diffChf);
  }

  /** Abgeschlossene Tage (neueste zuerst), der laufende Tag als Zwischenstand, Summen. */
  summary() {
    const days = Object.entries(this.days).sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, d]) => {
      const rest = { ...d };
      delete rest.cls; // die Aufschlüsselung steht gesammelt in `breakdown`
      return { day, ...rest };
    });
    const both = days.filter((d) => d.mine !== null && d.other !== null);
    const win = this.cur && this.cur.n ? DecisionLedger._windowResult(this.cur) : { v: null, cal: null };
    const sum = (arr, k) => Math.round(arr.reduce((a, d) => a + (d[k] || 0), 0) * 100) / 100;
    let today = null;
    if (this.cur && this.cur.n) {
      const chf = (v) => Math.round((v.cost / 100) * 100) / 100;
      today = {
        day: this.cur.day, mine: chf(this.cur.mine), other: this.cur.otherN ? chf(this.cur.other) : null, none: chf(this.cur.none), hours: Math.round(this.cur.hours * 10) / 10, v: win.v, cal: win.cal,
      };
    }
    // eigenes Szenario: nur Zeitfenster mit beiden Kosten; Eichung: Summe über alle Fenster mit Messung
    const vDays = days.map((d) => d.v).concat(win.v ? [win.v] : []).filter((v) => v && v.mine !== null && v.other !== null);
    const calDays = days.map((d) => d.cal).concat(win.cal ? [win.cal] : []).filter((c) => c);
    const sumV = (k) => Math.round(vDays.reduce((a, v) => a + (v[k] || 0), 0) * 100) / 100;
    const sumC = (k) => Math.round(calDays.reduce((a, c) => a + (c[k] || 0), 0) * 100) / 100;
    const calHours = calDays.reduce((a, c) => a + c.hours, 0);
    const closedV = days.filter((d) => d.v && d.v.mine !== null && d.v.other !== null);
    const wonDays = closedV.filter((d) => d.v.mine < d.v.other).length;
    return {
      days,
      today,
      breakdown: this._breakdown(),
      total: {
        days: both.length, mine: sum(both, 'mine'), other: sum(both, 'other'), none: sum(days, 'none'),
      },
      virt: {
        windows: vDays.length, hours: sumV('hours'), mine: sumV('mine'), other: sumV('other'), none: sumV('none'), closedDays: closedV.length, wonDays,
      },
      cal: {
        windows: calDays.length,
        hours: Math.round(calHours * 10) / 10,
        realChf: sumC('realChf'),
        simChf: sumC('simChf'),
        realRawChf: sumC('realRawChf'),
        simRawChf: sumC('simRawChf'),
        realImpKwh: sumC('realImpKwh'),
        simImpKwh: sumC('simImpKwh'),
        realExpKwh: sumC('realExpKwh'),
        simExpKwh: sumC('simExpKwh'),
        socErr: calHours > 0 ? Math.round((calDays.reduce((a, c) => a + c.socErr * c.hours, 0) / calHours) * 10) / 10 : null,
      },
    };
  }
}

module.exports = { DecisionLedger };
