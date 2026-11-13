'use strict';

/**
 * Batterie-Planer: Laden aus dem Netz / Halten (Entladung sperren) / Normal.
 *
 * Reine Funktion für 15-Minuten-Slots, mit drei optionalen Verbesserungen, die einzeln abschaltbar sind:
 *
 *   - `solarMinKwh` (weicher Solar-Tor): zwischen solarMinKwh und solarLimitKwh sinkt das
 *     Ziel linear von targetSoc auf targetSocMin. Gleich/über solarLimitKwh wird nicht geladen.
 *   - `commitSlot` (Zielwert-Flattern): ein begonnener Ladeslot wird zu Ende geladen, solange
 *     das Ziel nicht erreicht ist (sonst wechselt Laden/Halten im Minutentakt, weil
 *     die Restmenge schrumpft und der aktuelle Slot aus der Auswahl fällt).
 *   - Reserve in Stunden (Reserve nach Energie folgt in Phase 2).
 *   - `bridge` (Morgen überbrücken): greift die Solar-Grenze (kein Netzladen, weil die Sonne die Batterie füllt), wird
 *     trotzdem so viel geladen, wie die teuren Viertelstunden bis zum Moment brauchen, in dem die Sonne das Haus deckt
 *     (PV-Prognose >= bridgeLoadKw). Geladen wird nur vor dieser Lücke und nur, wenn es sich trotz Verlust lohnt.
 *
 * Eingabe:
 *   cfg     { enabled, targetSoc, targetSocMin, chargePowerKw, capacityKwh, reserveHours,
 *             solarLimitKwh, solarMinKwh, commitSlot, lookaheadHours }
 *   soc     Prozent oder null
 *   slots   [{ start, end, price }] (ms), aufsteigend, null/[] = Preise unbekannt
 *   solarKwh  erwartete PV in der Vorschau (Faktor schon angewendet) oder null (Prognose veraltet)
 *   prev    { mode, slotStart } Zustand vom letzten Lauf oder null
 *   nowMs
 * Ausgabe: { mode: 'charge'|'hold'|'normal', reason, chargeSlots, reserveSlots, solarKwh,
 *            solarLimitKwh, targetEff, deniedMode?, deniedReason? }
 */

const {
  slotsBetween, selectCheapest, selectExpensive, currentSlot, selectedNow, pick, HOUR_MS,
} = require('./slots');
const { localParts } = require('../../time');

const DEFAULTS = Object.freeze({
  enabled: true,
  targetSoc: 90,
  targetSocMin: 50,
  chargePowerKw: 5,
  capacityKwh: 0,
  reserveHours: 6,
  solarLimitKwh: 16,
  solarMinKwh: 0,
  commitSlot: true,
  lookaheadHours: 24,
  bridge: true,
  bridgeLoadKw: 1, // Hausverbrauch, bis die Sonne übernimmt
  floorSoc: 10, // tiefer wird die Batterie nicht entladen (für die Rechnung)
  efficiency: 0.9, // Hin und zurück
});

const round1 = (v) => Math.round(v * 10) / 10;

/** Ziel-SoC unter Berücksichtigung des (weichen) Solar-Tors. */
function effectiveTarget(c, solarKwh) {
  const full = Number(c.targetSoc);
  if (solarKwh === null || !(c.solarLimitKwh > 0)) return { target: full, blocked: false };
  if (solarKwh >= c.solarLimitKwh) return { target: full, blocked: true };
  if (c.solarMinKwh > 0 && c.solarMinKwh < c.solarLimitKwh && solarKwh > c.solarMinKwh) {
    const frac = (solarKwh - c.solarMinKwh) / (c.solarLimitKwh - c.solarMinKwh);
    const floor = Math.min(full, Number(c.targetSocMin));
    return { target: Math.round(full - frac * (full - floor)), blocked: false };
  }
  return { target: full, blocked: false };
}

/**
 * Morgen überbrücken: wie viel Ladung brauchen die teuren Viertelstunden bis die Sonne das Haus deckt, und wann lädt man
 * sie am günstigsten nach? Nur vor der Lücke, nur wenn (Preis Laden / Wirkungsgrad) < Durchschnitt der Lücke.
 * @returns {{ target:number, untilMs:number, chargeSlots:object[], gapSlots:object[] }|null} null = nichts zu tun
 */
function bridgePlan({
  c, soc, window, reserveSlots, pvKwAt, nowMs,
}) {
  if (!c.bridge || typeof pvKwAt !== 'function' || !(c.capacityKwh > 0) || !(c.chargePowerKw > 0)) return null;
  const sun = window.find((s) => s.start >= nowMs - 15 * 60000 && pvKwAt(s.start) >= c.bridgeLoadKw);
  if (!sun) return null;
  const reserve = new Set(reserveSlots.map((s) => s.start));
  const gapSlots = window.filter((s) => s.start < sun.start && reserve.has(s.start));
  if (!gapSlots.length) return null;
  const needKwh = gapSlots.length * 0.25 * c.bridgeLoadKw;
  const haveKwh = Math.max(0, ((Number(soc) - c.floorSoc) / 100) * c.capacityKwh) * c.efficiency;
  if (haveKwh >= needKwh) return null;
  const target = Math.min(Number(c.targetSoc), Math.ceil(Number(soc) + ((needKwh - haveKwh) / c.efficiency / c.capacityKwh) * 100));
  const firstGap = gapSlots[0].start;
  const avgGap = gapSlots.reduce((a, s) => a + s.price, 0) / gapSlots.length;
  const before = window.filter((s) => s.start < firstGap && s.price / c.efficiency < avgGap);
  if (!before.length || target <= Number(soc)) return null;
  const hours = ((((target - Number(soc)) / 100) * c.capacityKwh) * 1000) / (c.chargePowerKw * 1000);
  const chosen = pick(before, selectCheapest(before, hours, true));
  return {
    target, untilMs: sun.start, chargeSlots: chosen, gapSlots,
  };
}

function decideBattery({
  cfg, soc, slots, solarKwh = null, prev = null, nowMs, pvKwAt = null, tz = 'Europe/Zurich',
}) {
  const c = { ...DEFAULTS, ...(cfg || {}) };
  const none = { chargeSlots: [], reserveSlots: [] };
  if (!c.enabled) return { mode: 'normal', reason: 'Batteriesteuerung ausgeschaltet', ...none };
  if (soc === null || soc === undefined || !Number.isFinite(Number(soc))) {
    return { mode: 'normal', reason: 'SoC unbekannt', ...none };
  }
  const horizonMs = nowMs + c.lookaheadHours * HOUR_MS;
  const window = slotsBetween(slots, nowMs, horizonMs);
  if (!window.length) return { mode: 'normal', reason: 'keine Preise', ...none };

  const solarLimit = Number(c.solarLimitKwh) > 0 ? Number(c.solarLimitKwh) : 0;
  const { target, blocked } = effectiveTarget({ ...c, solarLimitKwh: solarLimit }, solarKwh);
  const solarInfo = solarLimit > 0 && solarKwh !== null
    ? { solarKwh: round1(solarKwh), solarLimitKwh: solarLimit } : {};
  const suffix = blocked
    ? ` - Sonne ${solarKwh.toFixed(1)} kWh, kein Netzladen` : '';

  // --- Laden ---
  let chargeSlots = [];
  let isChargeNow = false;
  let committed = false;
  const chargePowerW = Number(c.chargePowerKw) * 1000;
  if (!blocked && Number(soc) < target && c.capacityKwh > 0 && chargePowerW > 0) {
    const neededKwh = ((target - Number(soc)) / 100) * c.capacityKwh;
    const hoursNeeded = (neededKwh * 1000) / chargePowerW;
    const selected = selectCheapest(window, hoursNeeded, true);
    chargeSlots = pick(window, selected);
    isChargeNow = selectedNow(selected, window, nowMs);
    // Begonnenen Ladeslot zu Ende laden (kein Minutentakt-Flattern am Ende der Ladung).
    if (!isChargeNow && c.commitSlot && prev && prev.mode === 'charge') {
      const cur = currentSlot(window, nowMs);
      if (cur && prev.slotStart === cur.start) {
        isChargeNow = true; committed = true;
      }
    }
  }

  // --- Was die Batterie sonst tut (Reserve für die teuersten Stunden) ---
  let otherwise = { mode: 'normal', reason: blocked ? suffix.replace(/^ - /, '') : 'nichts zu tun', reserveSlots: [] };
  if (c.reserveHours > 0) {
    const selected = selectExpensive(window, c.reserveHours);
    const reserveSlots = pick(window, selected);
    otherwise = selectedNow(selected, window, nowMs)
      ? { mode: 'normal', reason: `teure Zeit: entladen${suffix}`, reserveSlots }
      : { mode: 'hold', reason: `Reserve für teure Stunden${suffix}`, reserveSlots };
  }

  // --- Morgen überbrücken (nur wenn die Solar-Grenze das Netzladen sonst verhindert) ---
  if (blocked && !isChargeNow) {
    const br = bridgePlan({
      c, soc, window, reserveSlots: otherwise.reserveSlots, pvKwAt, nowMs,
    });
    if (br) {
      const cur = currentSlot(window, nowMs);
      let now = !!(cur && br.chargeSlots.some((s) => s.start === cur.start));
      let committedBridge = false;
      if (!now && c.commitSlot && prev && prev.mode === 'charge' && cur && prev.slotStart === cur.start && Number(soc) < br.target) {
        now = true; committedBridge = true;
      }
      const lp = localParts(new Date(br.untilMs), tz);
      const until = `${String(lp.hour).padStart(2, '0')}:${String(lp.minute).padStart(2, '0')}`;
      const why = `Morgen überbrücken: ${br.target} % bis Sonne (${until})`;
      if (now) {
        return {
          mode: 'charge',
          reason: committedBridge ? `Ladeviertelstunde zu Ende (${why})` : why,
          deniedMode: otherwise.mode,
          deniedReason: otherwise.reason,
          chargeSlots: br.chargeSlots,
          reserveSlots: otherwise.reserveSlots,
          targetEff: br.target,
          bridge: { target: br.target, untilMs: br.untilMs },
          ...solarInfo,
        };
      }
      chargeSlots = br.chargeSlots;
      otherwise = { ...otherwise, bridge: { target: br.target, untilMs: br.untilMs } };
    }
  }

  if (isChargeNow) {
    return {
      mode: 'charge',
      reason: committed ? 'Ladeviertelstunde zu Ende' : 'günstige Zeit: laden',
      deniedMode: otherwise.mode,
      deniedReason: otherwise.reason,
      chargeSlots,
      reserveSlots: otherwise.reserveSlots,
      targetEff: target,
      ...solarInfo,
    };
  }
  return {
    mode: otherwise.mode,
    reason: otherwise.reason,
    chargeSlots,
    reserveSlots: otherwise.reserveSlots,
    targetEff: otherwise.bridge ? otherwise.bridge.target : target,
    ...(otherwise.bridge ? { bridge: otherwise.bridge } : {}),
    ...solarInfo,
  };
}

module.exports = {
  decideBattery, effectiveTarget, bridgePlan, DEFAULTS,
};
