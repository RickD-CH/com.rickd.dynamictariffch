'use strict';

const { SLOT_MS, localParts } = require('./time');

const pad = (n) => String(n).padStart(2, '0');

function levelOf(avgRaw, dayAvgRaw, th) {
  if (!(dayAvgRaw > 0) || typeof avgRaw !== 'number') return null;
  const r = avgRaw / dayAvgRaw;
  if (r <= th.veryCheap) return 'very_cheap';
  if (r <= th.cheap) return 'cheap';
  if (r >= th.veryExpensive) return 'very_expensive';
  if (r >= th.expensive) return 'expensive';
  return 'normal';
}

/** Start indices (into `slots`) of the contiguous window with the lowest or highest average. */
function extremeWindow(slots, size, dir, fromMs) {
  let best = null;
  for (let i = 0; i + size <= slots.length; i += 1) {
    if (slots[i].start.getTime() < fromMs) continue;
    const win = slots.slice(i, i + size);
    const contiguous = win.every((s, j) => j === 0 || s.start - win[j - 1].start === SLOT_MS);
    if (!contiguous) continue;
    const avg = win.reduce((a, s) => a + s.integrated, 0) / size;
    if (best === null || (dir === 'min' ? avg < best.avg - 1e-12 : avg > best.avg + 1e-12)) best = { i, avg };
  }
  return best;
}

/**
 * Hourly price table of one local day, with quarter-hours, price level per hour (relative to the
 * day's average, same thresholds as the device) and the cheapest / most expensive block.
 *
 * @param {object} o
 * @param {{start: Date, integrated: number}[]} o.slots   sorted slots of that day
 * @param {number} o.nowMs
 * @param {string} o.tz
 * @param {{veryCheap:number, cheap:number, expensive:number, veryExpensive:number}} o.thresholds
 * @param {(raw:number)=>number|null} o.toDisplay   CHF/kWh -> Rp./kWh incl. VAT
 * @param {number} [o.blockHours=2]
 * @param {boolean} [o.futureOnlyCheapest=false]    cheapest block only from now on (today)
 */
function buildDayTable({
  slots, nowMs, tz, thresholds, toDisplay, blockHours = 2, futureOnlyCheapest = false,
}) {
  const valid = slots.filter((s) => typeof s.integrated === 'number' && Number.isFinite(s.integrated));
  if (valid.length < 4) return { available: false, hours: [] };

  const nowSlot = Math.floor(nowMs / SLOT_MS) * SLOT_MS;
  const size = Math.round(blockHours * 4);
  const dayAvgRaw = valid.reduce((a, s) => a + s.integrated, 0) / valid.length;

  const cheap = extremeWindow(valid, size, 'min', futureOnlyCheapest ? nowSlot : -Infinity);
  const pricey = extremeWindow(valid, size, 'max', -Infinity);
  const flag = (win) => new Set(win ? valid.slice(win.i, win.i + size).map((s) => s.start.getTime()) : []);
  const cheapSet = flag(cheap);
  const priceySet = flag(pricey);
  const blockInfo = (win) => (win ? {
    start: `${pad(localParts(valid[win.i].start, tz).hour)}:${pad(localParts(valid[win.i].start, tz).minute)}`,
    end: (() => {
      const e = new Date(valid[win.i + size - 1].start.getTime() + SLOT_MS);
      const p = localParts(e, tz);
      return `${pad(p.hour)}:${pad(p.minute)}`;
    })(),
    avg: toDisplay(win.avg),
  } : null);

  const byHour = new Map();
  for (const s of valid) {
    const h = localParts(s.start, tz).hour;
    if (!byHour.has(h)) byHour.set(h, []);
    byHour.get(h).push(s);
  }

  const hours = [...byHour.entries()].sort((a, b) => a[0] - b[0]).map(([h, list]) => {
    const raw = list.reduce((a, s) => a + s.integrated, 0) / list.length;
    const startMs = list[0].start.getTime();
    return {
      hour: `${pad(h)}:00`,
      avg: toDisplay(raw),
      min: toDisplay(Math.min(...list.map((s) => s.integrated))),
      max: toDisplay(Math.max(...list.map((s) => s.integrated))),
      level: levelOf(raw, dayAvgRaw, thresholds),
      cheap: list.filter((s) => cheapSet.has(s.start.getTime())).length * 2 >= list.length,
      pricey: list.filter((s) => priceySet.has(s.start.getTime())).length * 2 >= list.length,
      isNow: list.some((s) => s.start.getTime() === nowSlot),
      isPast: list[list.length - 1].start.getTime() < nowSlot,
      startMs,
      quarters: list.map((s) => {
        const p = localParts(s.start, tz);
        return {
          time: `${pad(p.hour)}:${pad(p.minute)}`,
          value: toDisplay(s.integrated),
          level: levelOf(s.integrated, dayAvgRaw, thresholds),
          isNow: s.start.getTime() === nowSlot,
        };
      }),
    };
  });

  return {
    available: true,
    avg: toDisplay(dayAvgRaw),
    min: toDisplay(Math.min(...valid.map((s) => s.integrated))),
    max: toDisplay(Math.max(...valid.map((s) => s.integrated))),
    cheapBlock: blockInfo(cheap),
    cheapFromNow: blockInfo(extremeWindow(valid, size, 'min', nowSlot)),
    priciestBlock: blockInfo(pricey),
    hours,
  };
}

module.exports = { buildDayTable, levelOf };
