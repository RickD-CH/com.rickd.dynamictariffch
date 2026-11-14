'use strict';

const { normalizeCustom } = require('./planner/batteryControl');
const { normalizeFuse } = require('./planner/fuse');
const { DEFAULTS: BATTERY_DEFAULTS } = require('./planner/battery');
const { DEFAULTS: CONSUMER_DEFAULTS } = require('./planner/consumer');
const { normalizeSchedule } = require('./planner/carSchedule');
const { normalizeProgram } = require('./planner/program');
const { normalizeSgReady } = require('./planner/sgready');
const { normalizeDhw } = require('./planner/dhw');

/**
 * Standardkonfiguration. Keine Geräte-IDs im Code: die Geräte werden in den Einstellungen gewählt
 * und liegen nur auf dem jeweiligen Homey.
 * `enabled: false`: das EMS ist standardmässig ganz aus (keine Zugriffe, keine Timer).
 * `live` je Bereich (Wallbox, Verbraucher) ist standardmässig aus: dann wird nur berechnet und protokolliert.
 */
const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  silent: true, // Silent-Modus: global nur simulieren, egal wie die Schalter je Gerät stehen
  tickMinutes: 5,
  refreshS: 0, // Rechenintervall Wallbox/Verbraucher in Sekunden, 0 = automatisch
  // Geräte (leer = noch nicht gewählt). Die Capability-Namen sind Vorgaben, in den Einstellungen änderbar.
  devices: {
    meter: { id: '', capability: 'measure_power' }, // Netz, + = Bezug
    house: { id: '', capability: 'measure_power' }, // Hausverbrauch (kann derselbe Zähler sein)
    inverter: { id: '', capability: 'measure_power' }, // PV-Leistung
    compareEms: '', // optional: EMS-Gerät der Huawei-FusionSolar-App, nur zum Vergleich gelesen
  },
  charger: {
    enabled: true,
    costName: 'E-Auto', // Name im Kostenbericht (Zähler der Wallbox)
    live: false, // true = Befehle wirklich an die Wallbox senden
    chargeNow: false, // Sofortladen (volle Leistung)
    chargeNowAutoOff: true, // Sofortladen aus, wenn das Auto abgesteckt wird
    id: '', // Wallbox (go-e)
    stateCapability: 'evcharger_charging_state',
    powerCapability: 'measure_power',
    phaseCapability: 'goe_measure_phase_switching', // '1' = 1 Phase, '2' = 3 Phasen
    // Befehle an die Wallbox (Flow-Karten des Geräts): Standard go-e. startCard leer = keine Start-Karte, die Leistung startet das Laden.
    startCard: 'evcharger_charging_start',
    powerCard: 'target_power_set',
    powerArg: 'target_power', // Argument der Karte, in das die Leistung in Watt kommt
    maxAmps: 16,
    minAmps: 6,
    phases: 3,
    phaseSwitch: true,
    stepHoldS: 30,
    stepDownHoldS: 30,
  },
  car: { deviceId: '', socCapability: 'measure_battery', capacityKwh: 0 }, // optional: E-Auto mit Ladestand (für Aufträge mit Ziel-Ladestand)
  share: {
    socLow: 50, socHigh: 80, pctLow: 0, pctHigh: 100, minSoc: 0,
  }, // Überschuss-Rampe
  evStepUpSoc: 97, // Akku-voll-Regel ab dieser Ladung, 0 = aus
  forecastGate: { mode: 'adaptive', kwh: 5 }, // 'off' | 'manual' | 'adaptive'
  gridImportLimitKw: 24,
  pv: { factor: 1, source: 'auto', device: { id: '', today: '', tomorrow: '' } }, // Korrekturfaktor und Quelle der PV-Prognose
  consumers: [],
  battery: {
    ...BATTERY_DEFAULTS,
    deviceId: '', // Hausbatterie
    socCapability: 'measure_battery',
    capacityCapability: 'battery_rated_capacity',
    capacityKwh: 13.8, // Fallback, wenn die Kapazität nicht gelesen werden kann
    targetSoc: 90,
    chargePowerKw: 5,
    reserveHours: 6,
    solarLimitKwh: 16,
    solarMinKwh: 0, // 0 = harter Solar-Tor; >0 = weicher Übergang
    backupReserve: { active: false, soc: 50 },
  },
});

const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/** Ein Verbraucher (z. B. Luftentfeuchter); null, wenn kein Gerät gewählt ist. */
/** Flow als Schaltziel: { id, advanced, name }. Ohne id = nicht gewählt. */
/** Feuchte-Notlauf: Grenzen prüfen, "aus" liegt immer unter "ein". */
function normalizeHumidity(h) {
  const d = CONSUMER_DEFAULTS.humidity;
  const src = h && typeof h === 'object' ? h : {};
  const onAbove = Math.min(100, Math.max(10, num(src.onAbove, d.onAbove)));
  let offBelow = Math.min(100, Math.max(1, num(src.offBelow, d.offBelow)));
  if (offBelow >= onAbove) offBelow = Math.max(1, onAbove - 4);
  return {
    enabled: src.enabled === true && !!src.sensorId,
    sensorId: String(src.sensorId || ''),
    capability: String(src.capability || d.capability),
    onAbove,
    offBelow,
    runMin: Math.min(1440, Math.max(1, num(src.runMin, d.runMin))),
  };
}

/** Höchstzahl gesteuerter Verbraucher (jeder wird bei jedem Lauf gelesen). Die Oberfläche zeigt dieselbe Grenze. */
const MAX_CONSUMERS = 8;

function normalizeFlowRef(f) {
  const src = f && typeof f === 'object' ? f : {};
  return { id: String(src.id || ''), advanced: src.advanced === true, name: String(src.name || '').slice(0, 80) };
}

/** Akku eines Verbrauchers (eBike ...): Grenzen in sinnvoller Reihenfolge (chargeBelow < resumeBelow < stopAt). */
function normalizeAccu(a) {
  const d = CONSUMER_DEFAULTS.accu;
  const src = a && typeof a === 'object' ? a : {};
  const stopAt = Math.round(Math.min(100, Math.max(20, num(src.stopAt, d.stopAt))));
  let resumeBelow = Math.round(Math.min(99, Math.max(5, num(src.resumeBelow, d.resumeBelow))));
  if (resumeBelow >= stopAt) resumeBelow = Math.max(5, stopAt - 5);
  let chargeBelow = Math.round(Math.min(90, Math.max(0, num(src.chargeBelow, d.chargeBelow))));
  if (chargeBelow >= resumeBelow) chargeBelow = Math.max(0, resumeBelow - 10);
  return {
    enabled: src.enabled === true && !!src.sensorId,
    sensorId: String(src.sensorId || ''),
    capability: String(src.capability || d.capability),
    stopAt,
    resumeBelow,
    chargeBelow,
    maxRunMin: Math.round(Math.min(1440, Math.max(0, num(src.maxRunMin, d.maxRunMin)))), // 0 = ohne Höchstdauer
  };
}

const CONSUMER_ICONS = ['plug', 'bike', 'dehumidifier', 'dishwasher', 'boiler', 'washer', 'tumbler', 'fan', 'heatpump', 'pool', 'ac', 'heater', 'sauna', 'freezer', 'pump', 'light', 'mower', 'purifier', 'aquarium'];

/** Überschuss-Rampe der Hausbatterie: ab socLow bekommt das Auto pctLow % des Solarstroms, ab socHigh pctHigh %, dazwischen linear. */
function normalizeShare(v) {
  const d = DEFAULT_CONFIG.share;
  const s = v && typeof v === 'object' ? v : {};
  const pct = (x, fb) => Math.min(100, Math.max(0, num(x, fb)));
  return {
    ...d, ...s,
    socLow: pct(s.socLow, d.socLow), socHigh: pct(s.socHigh, d.socHigh), pctLow: pct(s.pctLow, d.pctLow), pctHigh: pct(s.pctHigh, d.pctHigh), minSoc: pct(s.minSoc, d.minSoc),
    // Prognose-Bonus: Rampe bis zu so viele Prozentpunkte früher, wenn die Solarprognose die Batterie sicher füllt (0 = aus)
    forecastBonus: Math.min(40, Math.max(0, num(s.forecastBonus, 0))),
  };
}

function normalizeConsumer(c) {
  if (!c || typeof c !== 'object' || !c.id) return null;
  const d = CONSUMER_DEFAULTS;
  const mode = ['full', 'soc', 'surplus', 'program'].includes(c.mode) ? c.mode : d.mode;
  const clamp = (v, lo, hi, fb) => Math.min(hi, Math.max(lo, num(v, fb)));
  return {
    id: String(c.id),
    name: String(c.name || 'Verbraucher').slice(0, 60),
    enabled: c.enabled !== false,
    live: c.live === true,
    mode,
    fullSoc: clamp(c.fullSoc, 50, 100, d.fullSoc),
    socOn: clamp(c.socOn, 1, 100, d.socOn),
    hysteresis: clamp(c.hysteresis, 1, 50, d.hysteresis),
    minSurplusW: clamp(c.minSurplusW, 0, 20000, d.minSurplusW),
    startSustainS: clamp(c.startSustainS, 0, 3600, d.startSustainS),
    stopGraceS: clamp(c.stopGraceS, 0, 3600, d.stopGraceS),
    minRunMin: clamp(c.minRunMin, 0, 1440, d.minRunMin),
    minOffMin: clamp(c.minOffMin, 0, 1440, d.minOffMin),
    protectSoc: clamp(c.protectSoc, 0, 100, d.protectSoc),
    batteryFirstSoc: c.batteryFirstSoc === null || c.batteryFirstSoc === undefined || c.batteryFirstSoc === '' || !Number.isFinite(Number(c.batteryFirstSoc))
      ? null : clamp(c.batteryFirstSoc, 0, 100, null), // Hausbatterie zuerst bis (%); null = gemeinsame Regel
    useForecastGate: c.useForecastGate !== false,
    type: c.type === 'dehumidifier' ? 'dehumidifier' : 'generic',
    // Symbol in der Anzeige (leer = nach Typ: Tropfen beim Entfeuchter, sonst Steckdose)
    // Der frühere «Tropfen» war das Symbol des Luftentfeuchters: er wird zum Luftentfeuchter-Gerät
    icon: c.icon === 'drop' ? 'dehumidifier' : (CONSUMER_ICONS.includes(c.icon) ? c.icon : ''),
    // Schalten über ein Gerät (onoff) oder über zwei Homey-Flows (ein/aus), z. B. für Geräte ohne eigenes Gerät in Homey
    controlKind: c.controlKind === 'flow' ? 'flow' : 'device',
    flowOn: normalizeFlowRef(c.flowOn),
    flowOff: normalizeFlowRef(c.flowOff),
    assumedW: clamp(c.assumedW, 0, 20000, 0), // Leistung, mit der bei Flow-Steuerung gerechnet wird (kein Messwert)
    humidity: normalizeHumidity(c.humidity),
    accu: normalizeAccu(c.accu),
    // Verbraucher-Typ «Programm starten» (mode === 'program'): ein Start-Befehl statt Dauerschalten
    program: normalizeProgram(c.program),
  };
}

/** Gespeicherte Konfiguration mit den Standardwerten zusammenführen und prüfen. */
/** Grenze für Sofortladen: 'none' (bis abgesteckt oder ausgeschaltet), 'soc' (Ladestand %), 'kwh' (geladene Energie). */
function normalizeChargeNowLimit(l) {
  const kind = l && ['none', 'soc', 'kwh'].includes(l.kind) ? l.kind : 'none';
  const n = Number(l && l.value);
  if (kind === 'soc') return { kind, value: Number.isFinite(n) ? Math.min(100, Math.max(10, Math.round(n))) : 80 };
  if (kind === 'kwh') return { kind, value: Number.isFinite(n) ? Math.min(150, Math.max(1, Math.round(n * 10) / 10)) : 10 };
  return { kind: 'none', value: null };
}

function normalizeConfig(stored) {
  const s = stored && typeof stored === 'object' ? stored : {};
  const b = { ...DEFAULT_CONFIG.battery, ...(s.battery || {}) };
  const d = s.devices && typeof s.devices === 'object' ? s.devices : {};
  const ch = { ...DEFAULT_CONFIG.charger, ...(s.charger || {}) };
  const consumers = (Array.isArray(s.consumers) ? s.consumers : []).map(normalizeConsumer).filter(Boolean).slice(0, MAX_CONSUMERS);
  return {
    enabled: s.enabled === true,
    // Silent-Modus (Standard an): nichts wird geschaltet, auch wenn einzelne Geräte auf live stehen
    silent: s.silent !== false,
    shadow: true,
    // Vergleich mit einem anderen Energiemanagement (nur Testphase): ohne ihn liest die App keine fremde App.
    compare: s.compare === true || (s.compare === undefined && typeof d.compareEms === 'string' && d.compareEms !== ''),
    devices: {
      meter: { ...DEFAULT_CONFIG.devices.meter, ...(d.meter || {}) },
      house: { ...DEFAULT_CONFIG.devices.house, ...(d.house || {}) },
      inverter: { ...DEFAULT_CONFIG.devices.inverter, ...(d.inverter || {}) },
      compareEms: typeof d.compareEms === 'string' ? d.compareEms : DEFAULT_CONFIG.devices.compareEms,
    },
    charger: {
      ...ch,
      enabled: ch.enabled !== false,
      live: ch.live === true,
      costName: String(ch.costName || 'E-Auto').trim().slice(0, 30) || 'E-Auto',
      chargeNow: ch.chargeNow === true,
      chargeNowAutoOff: ch.chargeNowAutoOff !== false, // Sofortladen geht aus, wenn das Auto abgesteckt wird
      chargeNowLimit: normalizeChargeNowLimit(ch.chargeNowLimit), // Sofortladen bis Ladestand % oder kWh
      maxAmps: Math.min(32, Math.max(6, num(ch.maxAmps, 16))),
      minAmps: Math.min(32, Math.max(6, num(ch.minAmps, 6))),
      phases: num(ch.phases, 3) === 1 ? 1 : 3,
      phaseSwitch: ch.phaseSwitch === true,
      stateCapability: String(ch.stateCapability || '').trim() || 'evcharger_charging_state',
      powerCapability: String(ch.powerCapability || '').trim() || 'measure_power',
      phaseCapability: typeof ch.phaseCapability === 'string' ? ch.phaseCapability.trim() : 'goe_measure_phase_switching',
      startCard: typeof ch.startCard === 'string' ? ch.startCard.trim() : 'evcharger_charging_start',
      powerCard: String(ch.powerCard || '').trim() || 'target_power_set',
      powerArg: String(ch.powerArg || '').trim() || 'target_power',
      stepHoldS: Math.max(0, num(ch.stepHoldS, 30)),
      stepDownHoldS: Math.max(0, num(ch.stepDownHoldS, 30)),
    },
    fuse: normalizeFuse(s.fuse), // Hausanschluss-Schutz
    sgready: normalizeSgReady(s.sgready), // SG-Ready-Steuerung (z. B. Boiler/Wärmepumpe)
    dhw: normalizeDhw(s.dhw), // Warmwasser-Programm bei günstigem Preis, unabhängig von SG-Ready
    car: {
      deviceId: String((s.car && s.car.deviceId) || ''),
      socCapability: String((s.car && s.car.socCapability) || 'measure_battery'),
      capacityKwh: Math.min(300, Math.max(0, num(s.car && s.car.capacityKwh, 0))),
      // Wochenkalender, «Nächste Abfahrt» (überschreibt den Kalender), Ferienmodus, «Netz nachladen»
      schedule: normalizeSchedule(s.car && s.car.schedule),
    },
    share: normalizeShare(s.share),
    evStepUpSoc: Math.min(100, Math.max(0, num(s.evStepUpSoc, 97))),
    forecastGate: { ...DEFAULT_CONFIG.forecastGate, ...(s.forecastGate || {}) },
    gridImportLimitKw: Math.max(0, num(s.gridImportLimitKw, 24)),
    pv: {
      factor: Math.min(3, Math.max(0.1, num(s.pv && s.pv.factor, 1))),
      source: ['auto', 'homey', 'device', 'external'].includes(s.pv && s.pv.source) ? s.pv.source : 'auto',
      device: {
        id: String((s.pv && s.pv.device && s.pv.device.id) || ''),
        today: String((s.pv && s.pv.device && s.pv.device.today) || ''),
        tomorrow: String((s.pv && s.pv.device && s.pv.device.tomorrow) || ''),
      },
    },
    consumers,
    refreshS: [15, 30, 60, 300].includes(Math.round(num(s.refreshS, 0))) ? Math.round(num(s.refreshS, 0)) : 0,
    tickMinutes: Math.min(15, Math.max(1, Math.round(num(s.tickMinutes, DEFAULT_CONFIG.tickMinutes)))),
    battery: {
      ...b,
      enabled: b.enabled !== false,
      commitSlot: b.commitSlot !== false,
      targetSoc: Math.min(100, Math.max(0, num(b.targetSoc, 90))),
      targetSocMin: Math.min(100, Math.max(0, num(b.targetSocMin, 50))),
      chargePowerKw: Math.min(10, Math.max(0.5, num(b.chargePowerKw, 5))),
      reserveHours: Math.min(24, Math.max(0, num(b.reserveHours, 6))),
      reserveMode: (s.battery && s.battery.reserveMode) === 'fixed' ? 'fixed' : 'auto', // auto = Fahrplan, fixed = feste Spitzenstunden
      minSpreadRp: Math.min(20, Math.max(0, num(b.minSpreadRp, 3))),
      solarLimitKwh: Math.max(0, num(b.solarLimitKwh, 16)),
      solarMinKwh: Math.max(0, num(b.solarMinKwh, 0)),
      bridge: b.bridge !== false, // Morgen überbrücken trotz Solar-Grenze
      bridgeLoadKw: Math.min(10, Math.max(0.1, num(b.bridgeLoadKw, 1))),
      bridgeLoadMode: b.bridgeLoadMode === 'fixed' ? 'fixed' : 'auto', // auto = gelernter Hausverbrauch
      floorSoc: Math.min(50, Math.max(0, num(b.floorSoc, 10))),
      capacityKwh: Math.max(0, num(b.capacityKwh, 13.8)),
      // Notstrom-Reserve: aktiv nur per Klick (Gerät/Oberfläche) oder Flow, nie per Neustart oder Vorlage
      backupReserve: {
        active: !!(b.backupReserve && b.backupReserve.active === true),
        soc: Math.min(100, Math.max(0, num(b.backupReserve && b.backupReserve.soc, 50))),
      },
      // Batteriesteuerung über Aktionskarten des Batterie-Geräts (Standard aus, und live nur mit eigenem Schalter)
      control: {
        enabled: !!(b.control && b.control.enabled === true),
        live: !!(b.control && b.control.live === true),
        preset: b.control && typeof b.control.preset === 'string' ? b.control.preset : '',
        normalDischargeW: Math.min(100000, Math.max(0, num(b.control && b.control.normalDischargeW, 7000))),
        repeatMin: Math.min(60, Math.max(2, num(b.control && b.control.repeatMin, 10))),
        custom: normalizeCustom(b.control && b.control.custom), // eigene Zuordnung (Vorlage 'custom')
      },
    },
  };
}

/**
 * Schaltet die Steuerung eines Bereichs ein/aus ("Befehle senden"), ohne die übrigen Einstellungen
 * anzufassen. target = 'charger' oder die Geräte-ID eines Verbrauchers. Gibt die neue, geprüfte
 * Konfiguration zurück; unbekanntes Ziel -> null.
 */
function applyToggle(stored, target, on) {
  const cfg = normalizeConfig(stored);
  if (target === 'charger') return normalizeConfig({ ...cfg, charger: { ...cfg.charger, live: on === true } });
  if (target === 'battery') return normalizeConfig({ ...cfg, battery: { ...cfg.battery, control: { ...cfg.battery.control, live: on === true } } });
  if (!cfg.consumers.some((x) => x.id === target)) return null;
  return normalizeConfig({
    ...cfg,
    consumers: cfg.consumers.map((x) => (x.id === target ? { ...x, live: on === true } : x)),
  });
}

module.exports = {
  DEFAULT_CONFIG, normalizeConfig, normalizeConsumer, applyToggle, MAX_CONSUMERS,
};
