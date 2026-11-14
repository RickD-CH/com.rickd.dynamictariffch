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
 *   `dhw`    Nur das Warmwasser-Programm der Wärmepumpe (optional beim Preis-Start, `priceAction: 'dhw'`): die
 *            SG-Ready-Relais bleiben auf 0:0, stattdessen ein/aus-Flow oder -Capability. Kommt Sonne dazu -> `boost`.
 *
 * Reihenfolge pro Lauf (`decideSgReady`):
 *   1. Zieltemperatur erreicht ODER Betriebsart der Wärmepumpe nicht freigegeben (z. B. nicht «Automatik») -> sofort `off` (Cooldown startet), egal in welcher Phase.
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
  startDelayMin: 10,
  minRunMin: 90,
  stopDelayMin: 8,
  cooldownMin: 30,
  sunTrigger: true, // false: nur der Preis-Auslöser (Warmwasser-Programm, siehe dhw.js)
  usePrice: false,
  maxPriceRp: 15,
  // Nur starten, wenn das Warmwasser unter diesem Wert liegt (0 = keine Prüfung). Gilt nur für den Start, nicht fürs Halten.
  priceBelowTemp: 45,
  pvBelowTemp: 45,
  // Preis-Start überspringen, solange die Sonne heute voraussichtlich noch genug liefert (Prognose Rest des Tages)
  priceSkipPv: true,
  priceSkipPvKwh: 6,
  // Preis-Start: 'sgready' = SG-Ready-Empfehlung wie bei Sonne, 'dhw' = nur das Warmwasser-Programm der Wärmepumpe ein/aus
  // (Flow, z. B. Modbus-Betriebsart, oder eine Capability-Funktion einer App). Zurück auf Normal beim Ende.
  priceAction: 'sgready',
  sensorId: '',
  tempCapability: 'measure_temperature',
  // Betriebsart der Wärmepumpe: nur wenn dieser Wert anliegt (z. B. «Automatik»), darf gesteuert werden.
  // Ohne Gerät/Capability keine Prüfung.
  modeId: '',
  modeCapability: '',
  modeOkValue: '',
  // Rückmeldung: den SG-Ready-Zustand von der Wärmepumpe übernehmen (z. B. «2 NORMAL»). Leer = nur der eigene Zustand zählt.
  feedbackId: '',
  feedbackCapability: '',
  output: 'relays', // 'relays' (zwei Relais, z. B. 2 Shellys) oder 'flows' (je Zustand ein Flow, z. B. Modbus)
  flowNormal: Object.freeze({ id: '', advanced: false, name: '' }),
  flowBoost: Object.freeze({ id: '', advanced: false, name: '' }),
  flowForced: Object.freeze({ id: '', advanced: false, name: '' }),
  recommendRelay: Object.freeze({ deviceId: '', capability: 'onoff' }),
  forceRelay: Object.freeze({ deviceId: '', capability: 'onoff' }),
});

function normalizeFlow(f) {
  const s = f && typeof f === 'object' ? f : {};
  return { id: typeof s.id === 'string' ? s.id : '', advanced: s.advanced === true, name: typeof s.name === 'string' ? s.name : '' };
}

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
    startDelayMin: num(v.startDelayMin, d.startDelayMin, 0, 120),
    minRunMin: num(v.minRunMin, d.minRunMin, 0, 480),
    stopDelayMin: num(v.stopDelayMin, d.stopDelayMin, 0, 120),
    cooldownMin: num(v.cooldownMin, d.cooldownMin, 0, 240),
    sunTrigger: v.sunTrigger !== false,
    usePrice: v.usePrice === true,
    maxPriceRp: num(v.maxPriceRp, d.maxPriceRp, 0, 200),
    priceBelowTemp: num(v.priceBelowTemp, d.priceBelowTemp, 0, 90),
    pvBelowTemp: num(v.pvBelowTemp, d.pvBelowTemp, 0, 90),
    priceSkipPv: v.priceSkipPv !== false,
    priceSkipPvKwh: num(v.priceSkipPvKwh, d.priceSkipPvKwh, 0, 200),
    priceAction: v.priceAction === 'dhw' ? 'dhw' : 'sgready',
    sensorId: typeof v.sensorId === 'string' ? v.sensorId : '',
    tempCapability: typeof v.tempCapability === 'string' && v.tempCapability ? v.tempCapability : d.tempCapability,
    modeId: typeof v.modeId === 'string' ? v.modeId : '',
    modeCapability: typeof v.modeCapability === 'string' ? v.modeCapability : '',
    modeOkValue: typeof v.modeOkValue === 'string' ? v.modeOkValue : '',
    feedbackId: typeof v.feedbackId === 'string' ? v.feedbackId : '',
    feedbackCapability: typeof v.feedbackCapability === 'string' ? v.feedbackCapability : '',
    output: v.output === 'flows' ? 'flows' : 'relays',
    flowNormal: normalizeFlow(v.flowNormal),
    flowBoost: normalizeFlow(v.flowBoost),
    flowForced: normalizeFlow(v.flowForced),
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
 *   wenn Sensor fehlt), modeBlocked (bool: Betriebsart nicht freigegeben), pvForecastKwh (Rest der heutigen
 *   PV-Prognose, null wenn unbekannt), nowMs, tz }
 * @returns {{ state:'off'|'boost'|'forced'|'dhw', reason:string, deadlineMs:number|null }} `deadlineMs`: Ende der
 *   Mindestlaufzeit (während `boost`/`forced` innerhalb der Sperre) oder Ende des Cooldowns (während `off` mit
 *   laufendem Cooldown), sonst `null`.
 */
function decideSgReady({
  cfg, st, pvW, exportW, soc, hasBattery, priceNow, tempWW, modeBlocked, externalBlock = null, pvForecastKwh = null, nowMs, tz = 'Europe/Zurich',
}) {
  const p = cfg;
  const basisW = Number.isFinite(p.basis === 'export' ? exportW : pvW) ? (p.basis === 'export' ? exportW : pvW) : null;
  const socKnown = hasBattery && Number.isFinite(soc);
  const socOk = (v) => !socKnown || soc >= v;

  // 1. Globale Abbruchbedingungen, in jeder Phase.
  const tempDone = Number.isFinite(tempWW) && tempWW >= p.targetTemp;
  // Betriebsart nicht freigegeben oder ein anderer Auslöser (z. B. SG-Ready übernimmt) sperrt: sofort aus
  const blockReason = modeBlocked === true ? 'Betriebsart nicht freigegeben' : (externalBlock || null);
  if (tempDone || blockReason) {
    if (st.state !== 'off') {
      st.cooldownUntil = nowMs + p.cooldownMin * 60000;
    }
    st.state = 'off'; st.okSince = null; st.badSince = null; st.forcedOkSince = null; st.forcedBadSince = null;
    return {
      state: 'off', reason: tempDone ? `Zieltemperatur erreicht (${tempWW.toFixed(1)} °C)` : blockReason, deadlineMs: st.cooldownUntil,
    };
  }

  const sunOpen = beforeTime(nowMs, p.windowTo, tz);
  // Start nur, wenn das Warmwasser überhaupt nachgeheizt werden muss. Sonne (gratis): unbekannte Temperatur blockiert nicht;
  // Preis (kostet): unbekannte Temperatur blockiert.
  const pvTempOk = !(p.pvBelowTemp > 0) || !Number.isFinite(tempWW) || tempWW < p.pvBelowTemp;
  const priceTempOk = !(p.priceBelowTemp > 0) || (Number.isFinite(tempWW) && tempWW < p.priceBelowTemp);
  const sunOn = p.sunTrigger !== false;
  const triggerA = sunOn && Number.isFinite(basisW) && basisW >= p.minSolarW && socOk(p.minSoc) && sunOpen && pvTempOk;
  const triggerAHold = sunOn && Number.isFinite(basisW) && basisW >= p.minSolarW && socOk(p.minSoc - p.socHysteresis);
  const priceOk = p.usePrice && Number.isFinite(priceNow) && priceNow <= p.maxPriceRp;
  // Lohnt sich nicht, per Preis zu starten, wenn die Sonne heute noch genug liefert und der Sonnen-Start noch offen ist
  const sunCovers = p.priceSkipPv && sunOpen && Number.isFinite(pvForecastKwh) && pvForecastKwh >= p.priceSkipPvKwh;
  const triggerB = priceOk && priceTempOk && !sunCovers;

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
      let why = 'wartet auf PV-Überschuss, vollen Akku oder einen günstigen Preis';
      if (priceOk && !priceTempOk) why = 'Preis günstig, aber das Warmwasser ist noch warm genug';
      else if (priceOk && sunCovers) why = `Preis günstig, aber die Sonne reicht heute voraussichtlich (Prognose ${pvForecastKwh.toFixed(1)} kWh)`;
      return { state: 'off', reason: why, deadlineMs: null };
    }
    if (!st.okSince) st.okSince = nowMs;
    if (socJump || nowMs - st.okSince >= p.startDelayMin * 60000) {
      // Sonne hat Vorrang; nur der reine Preis-Start kann stattdessen das Warmwasser-Programm sein
      const state = !triggerA && p.priceAction === 'dhw' ? 'dhw' : 'boost';
      st.state = state; st.boostStartedAt = nowMs; st.badSince = null;
      let reason = 'Start: günstiger Strompreis';
      if (triggerA) reason = 'Start: PV-Überschuss/Akku voll';
      else if (state === 'dhw') reason = 'Start: günstiger Strompreis (Warmwasser-Programm)';
      return { state, reason, deadlineMs: st.boostStartedAt + p.minRunMin * 60000 };
    }
    return { state: 'off', reason: 'Startbedingung erfüllt - wartet auf die Einschaltverzögerung', deadlineMs: null };
  }

  // st.state ist 'boost', 'forced' oder 'dhw'. Kommt während des Warmwasser-Programms die Sonne dazu, übernimmt SG-Ready.
  if (st.state === 'dhw' && triggerA) st.state = 'boost';
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
  // Halten ohne Temperatur-/Prognose-Bedingung des Starts; das Warmwasser-Programm hält nur per Preis
  const holdOk = st.state === 'dhw' ? priceOk : (triggerAHold || priceOk);
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
  // 'dhw' (nur Warmwasser-Programm) lässt die SG-Ready-Relais auf Normalbetrieb
  return { recommend: state === 'boost' || state === 'forced', force: state === 'forced' };
}

/**
 * Gemeldeten SG-Ready-Zustand der Wärmepumpe lesen: Standard-Nummern 1 bis 4 (1 EVU-Sperre, 2 Normal, 3 Empfehlung, 4 Anlaufbefehl),
 * als Zahl oder Text mit führender Nummer («2 NORMAL»), sonst an Stichworten erkannt. Unbekannt -> state null.
 * @returns {{ state:'lock'|'off'|'boost'|'forced'|null, raw:string|null }}
 */
function parseSgReadyState(raw) {
  if (raw === null || raw === undefined || raw === '') return { state: null, raw: null };
  const text = String(raw).trim();
  const up = text.toUpperCase();
  const byNum = {
    1: 'lock', 2: 'off', 3: 'boost', 4: 'forced',
  };
  const m = /^([1-4])(?!\d)/.exec(up);
  if (m) return { state: byNum[m[1]], raw: text };
  if (/SPERRE/.test(up)) return { state: 'lock', raw: text };
  if (/ANLAUF|BEFEHL|FORCED/.test(up)) return { state: 'forced', raw: text };
  if (/EMPFEHL|BOOST|RECOMMEND/.test(up)) return { state: 'boost', raw: text };
  if (/NORMAL/.test(up)) return { state: 'off', raw: text };
  return { state: null, raw: text };
}

module.exports = {
  DEFAULTS, normalizeSgReady, makeSgReadyState, decideSgReady, relaysFor, parseSgReadyState,
};
