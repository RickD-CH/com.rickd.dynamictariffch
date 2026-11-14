'use strict';

/**
 * SG-Ready-Steuerung (Wärmepumpe/Boiler, z. B. Warmwasserbereitung): zwei Relais-Ausgänge statt eines einzelnen
 * Ein/Aus, nach dem Standard-SG-Ready-Schema (EVU/Hersteller-Lastenheft). Reine, zustandsbehaftete Funktion -
 * keine Homey-Aufrufe, keine festen Geräte-Ids (siehe `lib/ems/planner/program.js` für dasselbe Prinzip).
 *
 * Eigenes Modul statt Verbraucher-Typ: hier hängen zwei Relais, eine Zieltemperatur, ein Zeitfenster und ein
 * mehrstufiger Anti-Takt-Timer zusammen - das passt nicht in die "ein Gerät, ein/aus"-Form der Verbraucher-Liste.
 *
 * Zustände (klassische SG-Ready-Nomenklatur "EIN1:EIN2"):
 *   `off`    (0:0) Normalbetrieb - Ausgangs- und Rückfallzustand.
 *   `boost`  (0:1) Empfehlung - PV-Überschuss, voller Hausakku oder günstiger Strompreis.
 *   `forced` (1:1) Zwangsladung (optional, meist der elektrische Heizstab - standardmässig ausgeschaltet, da
 *            energieintensiv). Nur erreichbar aus `boost`, nie direkt aus `off`.
 *
 * Reihenfolge pro Lauf (`decideSgReady`):
 *   1. Zieltemperatur erreicht ODER Ferienmodus aktiv -> sofort `off` (Cooldown startet), egal in welcher Phase.
 *   2. Zustand `off`:
 *      a. Cooldown-Timer läuft noch -> abwarten.
 *      b. Start-Bedingung (PV/Akku ODER Preis) erfüllt? Erst nach `startDelayMin` am Stück -> `boost`.
 *         Ausnahme: springt der Akku-SoC frisch über die Schwelle, während die Solarleistung schon reicht,
 *         zählt das sofort als erfüllt (kein Warten auf einen zweiten Trigger).
 *   3. Zustand `boost`/`forced`:
 *      a. Innerhalb der Mindestlaufzeit (`minRunMin` seit Start von `boost`) -> fest verriegelt, Wolken oder ein
 *         leicht sinkender Akku-SoC brechen nicht ab (nur Schritt 1 kann unterbrechen).
 *      b. Danach (Halten): Bedingungen mit Hysterese (Akku-SoC-Schwelle minus `socHysteresis`) weiterhin erfüllt?
 *         -> bleibt an. Sonst erst nach `stopDelayMin` ohne Bedingung -> zurück zu `off` (Cooldown startet).
 *      c. Eskalation zu `forced` (nur wenn erlaubt): Solarleistung über `forcedMinW` (plus Akku-Bedingung) für
 *         `startDelayMin` am Stück -> `forced`. Rückfall zu `boost`, sobald das für `stopDelayMin` nicht mehr
 *         gilt. `boostStartedAt`/die Mindestlaufzeit laufen beim Wechsel `boost` <-> `forced` nahtlos weiter.
 *
 * Start-Bedingung PV/Akku (Trigger A, nur vor `windowTo`): Solarleistung oder Netzeinspeisung (`basis`) über
 * `minSolarW`, UND (falls ein Hausakku konfiguriert ist) dessen SoC über `minSoc`. Ohne Akku entfällt die
 * SoC-Bedingung. Preis-Trigger (Trigger B, falls `usePrice`): aktueller Preis unter `maxPriceRp`, unabhängig von
 * `windowTo` - ein günstiger Nachtpreis darf auch nach der spätesten Startzeit noch auslösen.
 */

const { localParts } = require('../../time');

const DEFAULTS = Object.freeze({
  enabled: false,
  live: false, // sonst nur simulieren (Silent-Modus gilt zusätzlich)
  basis: 'pv', // 'pv' (Solarleistung) oder 'export' (Netzeinspeisung) - 'pv' ist Standard, da ein Hausakku den
  // Netzüberschuss sonst "verschluckt", bevor die Wärmepumpe ihn sieht.
  minSolarW: 1500,
  minSoc: 98,
  socHysteresis: 10,
  allowForced: false,
  forcedMinW: 4500,
  targetTemp: 56,
  windowTo: '17:00',
  respectHoliday: true,
  startDelayMin: 10,
  minRunMin: 90,
  stopDelayMin: 8,
  cooldownMin: 30,
  usePrice: true,
  maxPriceRp: 15,
  sensorId: '',
  tempCapability: 'measure_temperature',
  holidayId: '',
  holidayCapability: '',
  holidayOnValue: true,
  recommendRelay: Object.freeze({ deviceId: '', capability: 'onoff' }),
  forceRelay: Object.freeze({ deviceId: '', capability: 'onoff' }),
});

function normalizeRelay(r) {
  const s = r && typeof r === 'object' ? r : {};
  return { deviceId: typeof s.deviceId === 'string' ? s.deviceId : '', capability: typeof s.capability === 'string' && s.capability ? s.capability : 'onoff' };
}

function normalizeSgReady(s) {
  const d = DEFAULTS;
  const v = s && typeof s === 'object' ? s : {};
  const num = (x, fb, lo, hi) => {
    const n = Number(x);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fb;
  };
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/.test(v.windowTo) ? v.windowTo : d.windowTo;
  return {
    enabled: v.enabled === true,
    live: v.live === true,
    basis: v.basis === 'export' ? 'export' : 'pv',
    minSolarW: num(v.minSolarW, d.minSolarW, 0, 20000),
    minSoc: num(v.minSoc, d.minSoc, 0, 100),
    socHysteresis: num(v.socHysteresis, d.socHysteresis, 0, 50),
    allowForced: v.allowForced === true,
    forcedMinW: num(v.forcedMinW, d.forcedMinW, 0, 30000),
    targetTemp: num(v.targetTemp, d.targetTemp, 20, 90),
    windowTo: hhmm,
    respectHoliday: v.respectHoliday !== false,
    startDelayMin: num(v.startDelayMin, d.startDelayMin, 0, 120),
    minRunMin: num(v.minRunMin, d.minRunMin, 0, 480),
    stopDelayMin: num(v.stopDelayMin, d.stopDelayMin, 0, 120),
    cooldownMin: num(v.cooldownMin, d.cooldownMin, 0, 240),
    usePrice: v.usePrice !== false,
    maxPriceRp: num(v.maxPriceRp, d.maxPriceRp, 0, 200),
    sensorId: typeof v.sensorId === 'string' ? v.sensorId : '',
    tempCapability: typeof v.tempCapability === 'string' && v.tempCapability ? v.tempCapability : d.tempCapability,
    holidayId: typeof v.holidayId === 'string' ? v.holidayId : '',
    holidayCapability: typeof v.holidayCapability === 'string' ? v.holidayCapability : '',
    holidayOnValue: v.holidayOnValue === undefined ? d.holidayOnValue : v.holidayOnValue === true,
    recommendRelay: normalizeRelay(v.recommendRelay),
    forceRelay: normalizeRelay(v.forceRelay),
  };
}

function makeSgReadyState() {
  return {
    state: 'off', okSince: null, badSince: null, forcedOkSince: null, forcedBadSince: null, boostStartedAt: null, cooldownUntil: null, lastSocOk: null,
  };
}

/** Ist `nowMs` (lokale Zeit) noch vor der Uhrzeit `hhmm` heute? */
function beforeTime(nowMs, hhmm, tz) {
  const lp = localParts(new Date(nowMs), tz);
  const [h, m] = hhmm.split(':').map(Number);
  return lp.hour * 60 + lp.minute < h * 60 + m;
}

function fmtTime(ms, tz) {
  const lp = localParts(new Date(ms), tz);
  return `${String(lp.hour).padStart(2, '0')}:${String(lp.minute).padStart(2, '0')}`;
}

/**
 * @param {object} x { cfg (bereits normalisiert), st (Zustand, siehe makeSgReadyState), pvW, exportW, soc
 *   (Hausakku-SoC, null wenn unbekannt), hasBattery, priceNow (Rp./kWh, null wenn unbekannt), tempWW (°C, null
 *   wenn Sensor fehlt), holiday (bool|null), nowMs, tz }
 * @returns {{ state:'off'|'boost'|'forced', reason:string, deadlineMs:number|null }} `deadlineMs`: Ende der
 *   Mindestlaufzeit (während `boost`/`forced` innerhalb der Sperre) oder Ende des Cooldowns (während `off` mit
 *   laufendem Cooldown), sonst `null`.
 */
function decideSgReady({
  cfg, st, pvW, exportW, soc, hasBattery, priceNow, tempWW, holiday, nowMs, tz = 'Europe/Zurich',
}) {
  const p = cfg;
  const basisW = Number.isFinite(p.basis === 'export' ? exportW : pvW) ? (p.basis === 'export' ? exportW : pvW) : null;
  const socKnown = hasBattery && Number.isFinite(soc);
  const socOk = (v) => !socKnown || soc >= v;

  // 1. Globale Abbruchbedingungen, in jeder Phase.
  const tempDone = Number.isFinite(tempWW) && tempWW >= p.targetTemp;
  const holidayBlock = p.respectHoliday && holiday === true;
  if (tempDone || holidayBlock) {
    if (st.state !== 'off') {
      st.cooldownUntil = nowMs + p.cooldownMin * 60000;
    }
    st.state = 'off'; st.okSince = null; st.badSince = null; st.forcedOkSince = null; st.forcedBadSince = null;
    return {
      state: 'off', reason: tempDone ? `Zieltemperatur erreicht (${tempWW.toFixed(1)} °C)` : 'Ferienmodus aktiv', deadlineMs: st.cooldownUntil,
    };
  }

  const triggerA = Number.isFinite(basisW) && basisW >= p.minSolarW && socOk(p.minSoc) && beforeTime(nowMs, p.windowTo, tz);
  const triggerAHold = Number.isFinite(basisW) && basisW >= p.minSolarW && socOk(p.minSoc - p.socHysteresis);
  const triggerB = p.usePrice && Number.isFinite(priceNow) && priceNow <= p.maxPriceRp;

  if (st.state === 'off') {
    if (st.cooldownUntil && nowMs < st.cooldownUntil) {
      return { state: 'off', reason: `Abkühlpause bis ${fmtTime(st.cooldownUntil, tz)}`, deadlineMs: st.cooldownUntil };
    }
    st.cooldownUntil = null;
    // Sonderfall: Akku-SoC springt frisch über die Schwelle, während die Solarleistung schon reicht -> sofort,
    // ohne auf die Einschaltverzögerung zu warten (der PV-Teil der Bedingung stand ja schon länger an).
    const socJump = socKnown && st.lastSocOk === false && soc >= p.minSoc && Number.isFinite(basisW) && basisW >= p.minSolarW && beforeTime(nowMs, p.windowTo, tz);
    st.lastSocOk = socKnown ? soc >= p.minSoc : null;
    if (!triggerA && !triggerB) {
      st.okSince = null;
      return { state: 'off', reason: 'wartet auf PV-Überschuss, vollen Akku oder einen günstigen Preis', deadlineMs: null };
    }
    if (!st.okSince) st.okSince = nowMs;
    if (socJump || nowMs - st.okSince >= p.startDelayMin * 60000) {
      st.state = 'boost'; st.boostStartedAt = nowMs; st.badSince = null;
      return { state: 'boost', reason: triggerA ? 'Start: PV-Überschuss/Akku voll' : 'Start: günstiger Strompreis', deadlineMs: st.boostStartedAt + p.minRunMin * 60000 };
    }
    return { state: 'off', reason: 'Startbedingung erfüllt - wartet auf die Einschaltverzögerung', deadlineMs: null };
  }

  // st.state ist 'boost' oder 'forced'
  const lockUntil = st.boostStartedAt + p.minRunMin * 60000;
  const locked = nowMs < lockUntil;

  if (p.allowForced && st.state === 'boost') {
    const forcedReady = Number.isFinite(basisW) && basisW >= p.forcedMinW && socOk(p.minSoc);
    if (forcedReady) {
      if (!st.forcedOkSince) st.forcedOkSince = nowMs;
    } else st.forcedOkSince = null;
    if (forcedReady && nowMs - st.forcedOkSince >= p.startDelayMin * 60000) st.state = 'forced';
  } else if (p.allowForced && st.state === 'forced') {
    const forcedOk = Number.isFinite(basisW) && basisW >= p.forcedMinW;
    if (forcedOk) {
      st.forcedBadSince = null;
    } else {
      if (!st.forcedBadSince) st.forcedBadSince = nowMs;
      if (nowMs - st.forcedBadSince >= p.stopDelayMin * 60000) {
        st.state = 'boost'; st.forcedBadSince = null;
      }
    }
  }

  if (locked) {
    return {
      state: st.state, reason: 'Mindestlaufzeit läuft noch', deadlineMs: lockUntil,
    };
  }
  const holdOk = triggerAHold || triggerB;
  if (holdOk) {
    st.badSince = null;
    return {
      state: st.state, reason: 'hält (Bedingungen weiterhin erfüllt)', deadlineMs: null,
    };
  }
  if (!st.badSince) st.badSince = nowMs;
  if (nowMs - st.badSince >= p.stopDelayMin * 60000) {
    st.state = 'off'; st.cooldownUntil = nowMs + p.cooldownMin * 60000; st.badSince = null; st.forcedBadSince = null; st.okSince = null;
    return {
      state: 'off', reason: 'Bedingungen weggefallen - Ausschaltverzögerung abgelaufen', deadlineMs: st.cooldownUntil,
    };
  }
  return {
    state: st.state, reason: 'Bedingungen kurz weg - Ausschaltverzögerung läuft', deadlineMs: null,
  };
}

/** Relais-Zustand (EIN1/EIN2-Pegel) für einen Zustand - unabhängig davon, welches physische Relais was ist. */
function relaysFor(state) {
  return { recommend: state === 'boost' || state === 'forced', force: state === 'forced' };
}

module.exports = {
  DEFAULTS, normalizeSgReady, makeSgReadyState, decideSgReady, relaysFor,
};
