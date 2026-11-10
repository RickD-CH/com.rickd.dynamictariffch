'use strict';

/**
 * Slot-Hilfen für den Planer. Reine Funktionen, keine Homey-Aufrufe.
 *
 * Ein Slot ist { start: ms, end: ms, price: CHF/kWh (oder Rp., nur Rangfolge zählt) }.
 * Die Länge wird aus start/end gelesen (Viertelstunde bei Innostrom, Stunde bei anderen Quellen).
 *
 * Auswahllogik: Algorithmus aus Andi Wirz' FusionSolar-EMS (lib/ems/priceForecast.js,
 * _priceSelectCheapestSlots / _priceSelectExpensiveSlots, MIT-Lizenz), neu geschrieben für
 * beliebige Slot-Längen.
 */

const HOUR_MS = 3600 * 1000;

/** Slots, die [fromMs, toMs) berühren, aufsteigend. */
function slotsBetween(slots, fromMs, toMs) {
  if (!Array.isArray(slots)) return [];
  return slots.filter((s) => s.end > fromMs && s.start < toMs).sort((a, b) => a.start - b.start);
}

const hoursOf = (s) => (s.end - s.start) / HOUR_MS;

/**
 * Die billigsten Slots, bis `hoursNeeded` Stunden zusammen sind.
 * `preferEarlierOnTie`: bei gleichem Preis gewinnt der frühere (Batterie: nichts zu verschieben).
 * @returns {Set<number>} Startzeiten der gewählten Slots
 */
function selectCheapest(slots, hoursNeeded, preferEarlierOnTie = true) {
  const selected = new Set();
  if (!Array.isArray(slots) || !slots.length || !(hoursNeeded > 0)) return selected;
  const order = [...slots].sort((a, b) => (a.price - b.price)
    || (preferEarlierOnTie ? a.start - b.start : b.start - a.start));
  let remaining = hoursNeeded;
  for (const s of order) {
    if (remaining <= 1e-9) break;
    selected.add(s.start);
    remaining -= hoursOf(s);
  }
  return selected;
}

/** Die teuersten Slots, bis `hours` Stunden zusammen sind. Gleicher Preis: der frühere. */
function selectExpensive(slots, hours) {
  const selected = new Set();
  if (!Array.isArray(slots) || !slots.length || !(hours > 0)) return selected;
  const order = [...slots].sort((a, b) => (b.price - a.price) || (a.start - b.start));
  let remaining = hours;
  for (const s of order) {
    if (remaining <= 1e-9) break;
    selected.add(s.start);
    remaining -= hoursOf(s);
  }
  return selected;
}

/** Der Slot, der `nowMs` enthält, oder null. */
function currentSlot(slots, nowMs) {
  return (slots || []).find((s) => s.start <= nowMs && nowMs < s.end) || null;
}

/** Ist der aktuelle Slot in der gewählten Menge? */
function selectedNow(selected, slots, nowMs) {
  const cur = currentSlot(slots, nowMs);
  return !!(cur && selected.has(cur.start));
}

/** Die gewählten Slots als sortierte Liste. */
function pick(slots, selected) {
  return slots.filter((s) => selected.has(s.start)).sort((a, b) => a.start - b.start);
}

module.exports = {
  HOUR_MS, slotsBetween, selectCheapest, selectExpensive, currentSlot, selectedNow, pick, hoursOf,
};
