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
const { planSchedule } = require('./batterySchedule');

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
  reserveMode: 'fixed', // 'auto' = Fahrplan (Ladung in die teuersten Viertelstunden bis zum nächsten Nachladen)
  minSpreadRp: 5, // Netzladen erst ab dieser Ersparnis je kWh (nach Wirkungsgrad); enthält den Verschleiss
  bridge: true,
  bridgeLoadKw: 1, // Hausverbrauch, bis die Sonne übernimmt
  floorSoc: 10, // tiefer wird die Batterie nicht entladen (für die Rechnung)
  bufferPct: 0, // Puffer (% der Kapazität): der Fahrplan hält zusätzlich so viel Ladung in Reserve, falls das Haus mehr braucht als gelernt
  efficiency: 0.9, // Hin und zurück
  backupReserve: { active: false, soc: 50 }, // Notstrom-Reserve: per Klick oder Flow aktiviert, hält mind. diesen SoC
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
 * Der Hausverbrauch kommt aus `loadKwAt(t)` (gelernt) oder, ohne Daten, aus `bridgeLoadKw`.
 * @returns {object|null} Rechnung für Anzeige und Entscheid; status 'charge' | 'enough' | 'unprofitable' | 'nogap' | 'nosun'
 */
function bridgePlan({
  c, soc, window, reserveSlots, pvKwAt, loadKwAt = null, nowMs,
}) {
  if (!c.bridge || typeof pvKwAt !== 'function' || !(c.capacityKwh > 0) || !(c.chargePowerKw > 0)) return null;
  const load = (t) => {
    const v = typeof loadKwAt === 'function' ? loadKwAt(t) : null;
    return Number.isFinite(v) && v > 0 ? v : c.bridgeLoadKw;
  };
  const learned = typeof loadKwAt === 'function';
  const sun = window.find((s) => s.start >= nowMs - 15 * 60000 && pvKwAt(s.start) >= load(s.start));
  if (!sun) return { status: 'nosun', learned };
  const reserve = new Set(reserveSlots.map((s) => s.start));
  const gapSlots = window.filter((s) => s.start < sun.start && reserve.has(s.start));
  if (!gapSlots.length) return { status: 'nogap', untilMs: sun.start, learned };
  const r2 = (v) => Math.round(v * 10) / 10;
  const needKwh = gapSlots.reduce((sum, s) => sum + load(s.start) * 0.25, 0);
  const loadKw = needKwh / (gapSlots.length * 0.25);
  const haveKwh = Math.max(0, ((Number(soc) - c.floorSoc) / 100) * c.capacityKwh) * c.efficiency;
  const base = {
    untilMs: sun.start,
    gapFrom: gapSlots[0].start,
    gapTo: gapSlots[gapSlots.length - 1].end,
    gapCount: gapSlots.length,
    needKwh: r2(needKwh),
    haveKwh: r2(haveKwh),
    loadKw: Math.round(loadKw * 100) / 100,
    learned,
  };
  if (haveKwh >= needKwh) return { ...base, status: 'enough' };
  const target = Math.min(Number(c.targetSoc), Math.ceil(Number(soc) + ((needKwh - haveKwh) / c.efficiency / c.capacityKwh) * 100));
  const avgGap = gapSlots.reduce((s1, s) => s1 + s.price, 0) / gapSlots.length;
  const before = window.filter((s) => s.start < base.gapFrom && s.price / c.efficiency < avgGap);
  if (!before.length || target <= Number(soc)) return { ...base, status: 'unprofitable' };
  const chargeKwh = ((target - Number(soc)) / 100) * c.capacityKwh;
  const chosen = pick(before, selectCheapest(before, chargeKwh / c.chargePowerKw, true));
  return {
    ...base, status: 'charge', target, chargeKwh: r2(chargeKwh), chargeSlots: chosen, chargeAt: chosen.length ? chosen[0].start : null,
  };
}

/** Fahrplan (reserveMode 'auto'): Entscheid für die laufende Viertelstunde und Kennzahlen für die Vorschau. */
function decideBySchedule({
  c, soc, slots, nowMs, pvKwAt, loadKwAt, feedInRp, tz, solarInfo,
}) {
  // Puffer: für die Planung liegt die Untergrenze um den Puffer höher, die Ladung dort bleibt als Reserve gegen höheren Verbrauch
  const cPlan = { ...c, floorSoc: Math.min(100, (Number(c.floorSoc) || 0) + Math.max(0, Number(c.bufferPct) || 0)) };
  const r = planSchedule({
    slots, nowMs, soc, c: cPlan, pvKwAt, loadKwAt, feedInRp,
  });
  const hm = (ms) => {
    const p = localParts(new Date(ms), tz);
    return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
  };
  const eps = 1e-3;
  const chargeSlots = r.slots.filter((s, i) => r.charge[i] > eps);
  // «Entladen erlaubt» auch dort, wo die Sonne das Haus deckt (Batterie lädt dann gratis)
  const reserveSlots = r.slots.filter((s, i) => r.discharge[i] > eps || r.need[i] <= eps);
  const sum = (arr, f) => arr.reduce((a, x, i) => a + f(x, i), 0);
  const chgKwh = sum(r.charge, (x) => x);
  const disKwh = sum(r.discharge, (x) => x);
  const valueChf = Math.round((sum(r.discharge, (x, i) => x * r.slots[i].price) - sum(r.charge, (x, i) => x * r.slots[i].price)) / 10) / 10;
  const schedule = {
    chargeKwh: Math.round(chgKwh * 10) / 10,
    dischargeKwh: Math.round(disKwh * 10) / 10,
    chargeFrom: chargeSlots.length ? chargeSlots[0].start : null,
    chargeTo: chargeSlots.length ? chargeSlots[chargeSlots.length - 1].end : null,
    chargeAvg: chgKwh > eps ? Math.round((sum(r.charge, (x, i) => x * r.slots[i].price) / chgKwh) * 10) / 10 : null,
    dischargeAvg: disKwh > eps ? Math.round((sum(r.discharge, (x, i) => x * r.slots[i].price) / disKwh) * 10) / 10 : null,
    valueChf,
    learned: typeof loadKwAt === 'function',
  };
  const base = {
    chargeSlots, reserveSlots, schedule, ...solarInfo,
  };
  const i = r.index;
  if (i < 0) return { ...base, mode: 'normal', reason: 'keine Preise für jetzt' };
  if (r.charge[i] > eps) {
    let k = i;
    while (k + 1 < r.slots.length && r.charge[k + 1] > eps) k += 1;
    const target = Math.min(Number(c.targetSoc), Math.max(Number(soc) + 1, Math.ceil((r.energy[k] / r.cap) * 100)));
    const next = r.slots.findIndex((s, x) => x > k && r.discharge[x] > eps);
    return {
      ...base, mode: 'charge', targetEff: target, reason: `günstig laden bis ${target} %${next >= 0 ? ` für teure Zeit ab ${hm(r.slots[next].start)}` : ''}`,
    };
  }
  if (r.discharge[i] > eps) return { ...base, mode: 'normal', reason: 'teure Zeit: entladen' };
  if (r.need[i] <= eps) return { ...base, mode: 'normal', reason: 'Sonne deckt das Haus' };
  const next = r.slots.findIndex((s, x) => x > i && r.discharge[x] > eps);
  const nextCharge = r.slots.findIndex((s, x) => x > i && r.charge[x] > eps);
  const empty = r.energy[i] <= (Number(c.floorSoc) / 100) * r.cap + 0.05;
  if (empty) return { ...base, mode: 'hold', reason: nextCharge >= 0 ? `Batterie leer bis Nachladen um ${hm(r.slots[nextCharge].start)}` : 'Batterie leer' };
  return {
    ...base, mode: 'hold', reason: next >= 0 ? `Ladung aufsparen für ${hm(r.slots[next].start)} (${r.slots[next].price.toFixed(1)} Rp.)` : 'Ladung aufsparen',
  };
}

function decideBattery({
  cfg, soc, slots, solarKwh = null, prev = null, nowMs, pvKwAt = null, loadKwAt = null, tz = 'Europe/Zurich', feedInRp = 0,
}) {
  const c = { ...DEFAULTS, ...(cfg || {}) };
  const none = { chargeSlots: [], reserveSlots: [] };
  if (!c.enabled) return { mode: 'normal', reason: 'Batteriesteuerung ausgeschaltet', ...none };
  if (soc === null || soc === undefined || !Number.isFinite(Number(soc))) {
    return { mode: 'normal', reason: 'SoC unbekannt', ...none };
  }
  // Notstrom-Reserve: per Klick oder Flow aktiviert, überstimmt die übrige Planung. Unter dem Ziel wird sofort aus
  // dem Netz nachgeladen (Preis spielt keine Rolle mehr - das ist der Zweck der Reserve), darüber nicht entladen.
  if (c.backupReserve && c.backupReserve.active) {
    const target = Math.min(100, Math.max(0, Number(c.backupReserve.soc)));
    if (Number(soc) < target) {
      return {
        ...none, mode: 'charge', reason: `Notstrom-Reserve: laden bis ${target} %`, targetEff: target, backupReserve: true,
      };
    }
    return {
      ...none, mode: 'hold', reason: `Notstrom-Reserve: hält mind. ${target} %`, backupReserve: true,
    };
  }
  const horizonMs = nowMs + c.lookaheadHours * HOUR_MS;
  const window = slotsBetween(slots, nowMs, horizonMs);
  if (!window.length) return { mode: 'normal', reason: 'keine Preise', ...none };

  if (c.reserveMode === 'auto' && c.capacityKwh > 0) {
    return decideBySchedule({
      c, soc, slots, nowMs, pvKwAt, loadKwAt, feedInRp, tz, solarInfo: solarKwh !== null ? { solarKwh: round1(solarKwh) } : {},
    });
  }
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
      c, soc, window, reserveSlots: otherwise.reserveSlots, pvKwAt, loadKwAt, nowMs,
    });
    // Rechnung immer mitgeben (Vorschau), Laden nur bei Bedarf
    if (br) otherwise = { ...otherwise, bridgeInfo: { ...br, chargeSlots: undefined } };
    if (br && br.status === 'charge') {
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
          bridgeInfo: otherwise.bridgeInfo,
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
    ...(otherwise.bridgeInfo ? { bridgeInfo: otherwise.bridgeInfo } : {}),
    ...solarInfo,
  };
}

module.exports = {
  decideBattery, decideBySchedule, effectiveTarget, bridgePlan, DEFAULTS,
};
