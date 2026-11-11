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

function decideBattery({
  cfg, soc, slots, solarKwh = null, prev = null, nowMs,
}) {
  const c = { ...DEFAULTS, ...(cfg || {}) };
  const none = { chargeSlots: [], reserveSlots: [] };
  if (!c.enabled) return { mode: 'normal', reason: 'Batteriesteuerung ausgeschaltet', ...none };
  if (soc === null || soc === undefined || !Number.isFinite(Number(soc))) {
    return { mode: 'normal', reason: 'SoC unbekannt', ...none };
  }
  const horizonMs = nowMs + c.lookaheadHours * HOUR_MS;
  const window = slotsBetween(slots, nowMs, horizonMs);
  if (!window.length) return { mode: 'normal', reason: 'keine Preise - Standardverhalten', ...none };

  const solarLimit = Number(c.solarLimitKwh) > 0 ? Number(c.solarLimitKwh) : 0;
  const { target, blocked } = effectiveTarget({ ...c, solarLimitKwh: solarLimit }, solarKwh);
  const solarInfo = solarLimit > 0 && solarKwh !== null
    ? { solarKwh: round1(solarKwh), solarLimitKwh: solarLimit } : {};
  const suffix = blocked
    ? ` - Netzladen pausiert, Sonne ${solarKwh.toFixed(1)} kWh >= ${solarLimit} kWh` : '';

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
      ? { mode: 'normal', reason: `in einem der teuersten Slots - Entladung erlaubt${suffix}`, reserveSlots }
      : { mode: 'hold', reason: `Kapazität für die teuersten Stunden reserviert${suffix}`, reserveSlots };
  }

  if (isChargeNow) {
    return {
      mode: 'charge',
      reason: committed ? 'begonnenen Ladeslot zu Ende laden' : 'in einem gewählten günstigen Slot',
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
    targetEff: target,
    ...solarInfo,
  };
}

module.exports = { decideBattery, effectiveTarget, DEFAULTS };
