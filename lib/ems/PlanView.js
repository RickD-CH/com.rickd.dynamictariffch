'use strict';

const { localParts, startOfLocalDay, addLocalDays } = require('../time');

const QUARTER_MS = 15 * 60 * 1000;
const BLOCK_SLOTS = 8; // günstigster Block: 2 Stunden

/** Preisniveau relativ zum Tagesmittel (gleiche Schwellen wie PriceStore.level, zu drei Stufen zusammengefasst). */
function levelOf(price, avg) {
  if (price === null || !(avg > 0)) return 'normal';
  const r = price / avg;
  if (r <= 0.9) return 'cheap';
  if (r >= 1.1) return 'expensive';
  return 'normal';
}

const round2 = (v) => Math.round(v * 100) / 100;

/**
 * Plan-Sicht für die Einstellungsseite: je Tag Viertelstunden-Raster mit Preis, PV-Prognose und je Zeile
 * (Batterie, Wallbox, Verbraucher) dem Zustand. Reine Funktion.
 *
 * Wichtig für die Ehrlichkeit der Anzeige: nur die Batterie hat einen echten Plan (`planned: true`).
 * Wallbox und Verbraucher regeln nach dem aktuellen Überschuss, dort gibt es nur den Verlauf (`planned: false`).
 *
 * @param {object} p
 * @param {number} p.nowMs
 * @param {string} p.tz
 * @param {{start:number,end:number,price:number}[]} p.priceSlots   Rp./kWh, beliebiger Bereich
 * @param {{end:number,kw:number,h:number}[]|null} p.pvSlots        null = keine frische Prognose
 * @param {{mode:string, chargeSlots?:object[], reserveSlots?:object[]}|null} p.batteryPlan
 * @param {number} p.reserveHours                                    Reserve-Stunden der Batterie-Regel (0 = keine Halte-Zeiten)
 * @param {object[]} p.log                                           Einträge von PlanLog
 * @param {boolean} p.chargerEnabled
 * @param {{id:string,name:string}[]} p.consumers
 * @param {boolean} p.hasBattery
 * @param {{id:string,name:string|null,starts:number[]}[]} [p.jobs]   Aufträge (Vorschau): geplante Viertelstunden, immer `planned`
 */
function buildPlan(p) {
  const {
    nowMs, tz, priceSlots = [], pvSlots = null, batteryPlan = null, reserveHours = 0, log = [],
    chargerEnabled = false, consumers = [], hasBattery = false, jobs = [],
  } = p;
  const priceByStart = new Map(priceSlots.map((s) => [s.start, s]));
  const logByT = new Map(log.map((e) => [e.t, e]));
  const nowQ = Math.floor(nowMs / QUARTER_MS) * QUARTER_MS;
  const chargeSet = new Set(((batteryPlan && batteryPlan.chargeSlots) || []).map((s) => s.start));
  const reserveSet = new Set(((batteryPlan && batteryPlan.reserveSlots) || []).map((s) => s.start));

  const todayStart = startOfLocalDay(new Date(nowMs), tz);
  const days = [];
  for (const [offset, key] of [[0, 'today'], [1, 'tomorrow']]) {
    const from = (offset === 0 ? todayStart : addLocalDays(new Date(nowMs), 1, tz)).getTime();
    const to = addLocalDays(new Date(nowMs), offset + 1, tz).getTime();
    const times = [];
    for (let t = from; t < to; t += QUARTER_MS) times.push(t);
    const prices = times.map((t) => {
      const s = priceByStart.get(t);
      return s && Number.isFinite(s.price) ? s.price : null;
    });
    const known = prices.filter((v) => v !== null);
    if (offset === 1 && known.length === 0) continue; // morgen erst, wenn Preise da sind
    const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0;

    const slots = times.map((t, i) => {
      let pvKw = null;
      if (pvSlots) {
        pvKw = 0;
        for (const s of pvSlots) {
          const start = s.end - s.h * 3600000;
          if (t >= start && t < s.end) { pvKw = round2(s.kw); break; }
        }
      }
      return { t, price: prices[i] === null ? null : round2(prices[i]), level: levelOf(prices[i], avg), pvKw };
    });

    // Günstigster Block ab jetzt
    let block = null;
    for (let i = 0; i + BLOCK_SLOTS <= times.length; i++) {
      if (times[i] < nowQ) continue;
      let sum = 0; let ok = true;
      for (let j = 0; j < BLOCK_SLOTS; j++) {
        if (prices[i + j] === null) { ok = false; break; }
        sum += prices[i + j];
      }
      if (!ok) continue;
      const a = sum / BLOCK_SLOTS;
      if (!block || a < block.avg - 1e-9) block = { from: times[i], to: times[i] + BLOCK_SLOTS * QUARTER_MS, avg: round2(a), i };
    }

    const rows = [];
    if (hasBattery) {
      const cells = times.map((t, i) => {
        if (t < nowQ) {
          const e = logByT.get(t);
          return { state: e && e.b ? e.b : null, planned: false };
        }
        if (!batteryPlan) return { state: null, planned: false };
        if (t === nowQ) return { state: batteryPlan.mode, planned: false };
        if (prices[i] === null) return { state: null, planned: true };
        if (chargeSet.has(t)) return { state: 'charge', planned: true };
        if (reserveSet.has(t)) return { state: 'normal', planned: true };
        return { state: reserveHours > 0 ? 'hold' : 'normal', planned: true };
      });
      rows.push({ id: 'battery', kind: 'battery', name: null, cells });
    }
    if (chargerEnabled) {
      rows.push({
        id: 'charger', kind: 'charger', name: null,
        cells: times.map((t) => {
          const e = t <= nowQ ? logByT.get(t) : null;
          return { state: e && e.c ? e.c : null, powerW: e && e.w ? e.w : null, planned: false };
        }),
      });
    }
    for (const c of consumers) {
      rows.push({
        id: c.id, kind: 'consumer', name: c.name,
        cells: times.map((t) => {
          const e = t <= nowQ ? logByT.get(t) : null;
          const v = e && e.k && c.id in e.k ? e.k[c.id] : null;
          return { state: v === null ? null : (v ? 'on' : 'off'), planned: false };
        }),
      });
    }

    for (const j of jobs) {
      const set = new Set(j.starts || []);
      rows.push({
        id: 'job:' + j.id, kind: 'job', name: j.name,
        cells: times.map((t) => (set.has(t) ? { state: 'on', planned: true } : { state: null, planned: false })),
      });
    }

    // Beschriftung der Zeitachse: volle 3-Stunden-Marken in lokaler Zeit
    const ticks = [];
    times.forEach((t, i) => {
      const lp = localParts(new Date(t), tz);
      if (lp.minute === 0 && lp.hour % 3 === 0) ticks.push({ i, label: String(lp.hour) });
    });

    const pvKwh = pvSlots ? round2(slots.reduce((a, s) => a + (s.pvKw || 0) * 0.25, 0)) : null;
    days.push({
      key, from, to, slots, rows, ticks,
      stats: {
        min: known.length ? round2(Math.min(...known)) : null,
        max: known.length ? round2(Math.max(...known)) : null,
        avg: known.length ? round2(avg) : null,
        pvKwh,
        cheapestBlock: block ? { from: block.from, to: block.to, avg: block.avg, i: block.i, n: BLOCK_SLOTS } : null,
      },
    });
  }
  return { nowMs, nowQ, days };
}

module.exports = { buildPlan, levelOf, BLOCK_SLOTS };
