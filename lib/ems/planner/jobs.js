'use strict';

const Q = 15 * 60 * 1000;

/**
 * Auftragsplaner: wählt die Viertelstunden, in denen ein Auftrag laufen soll.
 * Reine Funktion, keine Homey-Aufrufe, keine festen Geräte.
 *
 * Ein Auftrag braucht `hours` Laufzeit bis spätestens `deadlineMs`. Gewählt werden die günstigsten
 * Viertelstunden (oder, mit `contiguous`, der günstigste zusammenhängende Block), optional nur unter
 * einer Preisgrenze.
 *
 * @param {object} p
 * @param {{start:number,end:number,price:number}[]} p.slots   Preise in Rp./kWh
 * @param {number} p.nowMs
 * @param {number} p.deadlineMs                                Ende des letzten erlaubten Slots
 * @param {number} p.hours                                     benötigte Laufzeit
 * @param {number|null} [p.maxPrice]                           Preisgrenze Rp./kWh (null = keine)
 * @param {boolean} [p.contiguous]                             am Stück
 * @returns {{ starts:number[], need:number, feasible:boolean, missing:number, avg:number|null, from:number|null, to:number|null, reason:string }}
 *   reason: 'ok' | 'nothing' | 'deadline_passed' | 'prices_missing' | 'too_expensive' | 'too_short' | 'no_block'
 */
function planJob({ slots, nowMs, deadlineMs, hours, maxPrice = null, contiguous = false }) {
  const need = Math.ceil(Number(hours) * 4 - 1e-9);
  const out = (starts, reason, extra = {}) => {
    const sorted = [...starts].sort((a, b) => a - b);
    const byStart = new Map((slots || []).map((s) => [s.start, s]));
    const prices = sorted.map((t) => byStart.get(t).price);
    return {
      starts: sorted, need: Math.max(0, need), feasible: reason === 'ok' || reason === 'nothing', missing: Math.max(0, need - sorted.length),
      avg: prices.length ? Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100 : null,
      from: sorted.length ? sorted[0] : null, to: sorted.length ? sorted[sorted.length - 1] + Q : null, reason, ...extra,
    };
  };
  if (!(need > 0)) return out([], 'nothing');
  const nowQ = Math.floor(nowMs / Q) * Q;
  if (!(deadlineMs > nowQ)) return out([], 'deadline_passed');

  const priced = (slots || []).filter((s) => Number.isFinite(s.price) && s.start >= nowQ && s.end <= deadlineMs).sort((a, b) => a.start - b.start);
  const lastKnownEnd = priced.length ? priced[priced.length - 1].end : nowQ;
  const open = priced.filter((s) => maxPrice === null || maxPrice === undefined || s.price <= maxPrice);

  if (contiguous) {
    let best = null;
    for (let i = 0; i + need <= open.length; i++) {
      const block = open.slice(i, i + need);
      if (!block.every((s, j) => j === 0 || s.start - block[j - 1].start === Q)) continue;
      const avg = block.reduce((a, s) => a + s.price, 0) / need;
      if (!best || avg < best.avg - 1e-9) best = { avg, block };
    }
    if (best) return out(best.block.map((s) => s.start), 'ok');
  } else if (open.length >= need) {
    const order = [...open].sort((a, b) => (a.price - b.price) || (a.start - b.start)).slice(0, need);
    return out(order.map((s) => s.start), 'ok');
  }

  // Es reicht nicht: zeigen, was möglich wäre, und warum es nicht reicht.
  let reason;
  if (priced.length < need && deadlineMs > lastKnownEnd) reason = 'prices_missing';
  else if (open.length < need && priced.length >= need) reason = 'too_expensive';
  else if (contiguous && open.length >= need) reason = 'no_block';
  else reason = 'too_short';
  const partial = [...open].sort((a, b) => (a.price - b.price) || (a.start - b.start)).slice(0, need).map((s) => s.start);
  return out(contiguous ? [] : partial, reason);
}

module.exports = { planJob };
