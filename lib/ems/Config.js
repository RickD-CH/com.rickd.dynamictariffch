'use strict';

const { DEFAULTS: BATTERY_DEFAULTS } = require('./planner/battery');
const { DEFAULTS: CONSUMER_DEFAULTS } = require('./planner/consumer');

/**
 * Standardkonfiguration. Keine Geräte-IDs im Code: die Geräte werden in den Einstellungen gewählt
 * und liegen nur auf dem jeweiligen Homey.
 * `enabled: false`: das EMS ist standardmässig ganz aus (keine Zugriffe, keine Timer).
 * `live` je Bereich (Wallbox, Verbraucher) ist standardmässig aus: dann wird nur berechnet und protokolliert.
 */
const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  tickMinutes: 5,
  // Geräte (leer = noch nicht gewählt). Die Capability-Namen sind Vorgaben, in den Einstellungen änderbar.
  devices: {
    meter: { id: '', capability: 'measure_power' }, // Netz, + = Bezug
    house: { id: '', capability: 'measure_power' }, // Hausverbrauch (kann derselbe Zähler sein)
    inverter: { id: '', capability: 'measure_power' }, // PV-Leistung
    andiEms: '', // optional: EMS-Gerät der Huawei-FusionSolar-App, nur zum Vergleich gelesen
  },
  charger: {
    enabled: true,
    costName: 'E-Auto', // Name im Kostenbericht (Zähler der Wallbox)
    live: false, // true = Befehle wirklich an die Wallbox senden
    chargeNow: false, // Sofortladen (volle Leistung)
    id: '', // Wallbox (go-e)
    stateCapability: 'evcharger_charging_state',
    powerCapability: 'measure_power',
    phaseCapability: 'goe_measure_phase_switching', // '1' = 1 Phase, '2' = 3 Phasen
    maxAmps: 16, minAmps: 6, phases: 3, phaseSwitch: true, stepHoldS: 30, stepDownHoldS: 30,
  },
  share: { socLow: 50, socHigh: 80, pctLow: 0, pctHigh: 100, minSoc: 0 }, // Überschuss-Rampe
  evStepUpSoc: 97, // Akku-voll-Regel ab dieser Ladung, 0 = aus
  forecastGate: { mode: 'adaptive', kwh: 5 }, // 'off' | 'manual' | 'adaptive'
  gridImportLimitKw: 24,
  pv: { factor: 1 }, // Korrekturfaktor auf die eingelieferte PV-Prognose
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
    solarMinKwh: 0, // 0 = harter Solar-Tor wie bei Andi; >0 = weicher Übergang
  },
});

const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/** Ein Verbraucher (z. B. Luftentfeuchter); null, wenn kein Gerät gewählt ist. */
function normalizeConsumer(c) {
  if (!c || typeof c !== 'object' || !c.id) return null;
  const d = CONSUMER_DEFAULTS;
  const mode = ['full', 'soc', 'surplus'].includes(c.mode) ? c.mode : d.mode;
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
    useForecastGate: c.useForecastGate !== false,
    type: c.type === 'dehumidifier' ? 'dehumidifier' : 'generic',
    humidity: normalizeHumidity(c.humidity),
  };
}

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

/** Gespeicherte Konfiguration mit den Standardwerten zusammenführen und prüfen. */
function normalizeConfig(stored) {
  const s = stored && typeof stored === 'object' ? stored : {};
  const b = { ...DEFAULT_CONFIG.battery, ...(s.battery || {}) };
  const d = s.devices && typeof s.devices === 'object' ? s.devices : {};
  const ch = { ...DEFAULT_CONFIG.charger, ...(s.charger || {}) };
  const consumers = (Array.isArray(s.consumers) ? s.consumers : []).slice(0, 5).map(normalizeConsumer).filter(Boolean);
  return {
    enabled: s.enabled === true,
    shadow: true,
    devices: {
      meter: { ...DEFAULT_CONFIG.devices.meter, ...(d.meter || {}) },
      house: { ...DEFAULT_CONFIG.devices.house, ...(d.house || {}) },
      inverter: { ...DEFAULT_CONFIG.devices.inverter, ...(d.inverter || {}) },
      andiEms: typeof d.andiEms === 'string' ? d.andiEms : DEFAULT_CONFIG.devices.andiEms,
    },
    charger: {
      ...ch,
      enabled: ch.enabled !== false,
      live: ch.live === true,
      costName: String(ch.costName || 'E-Auto').trim().slice(0, 30) || 'E-Auto',
      chargeNow: ch.chargeNow === true,
      maxAmps: Math.min(32, Math.max(6, num(ch.maxAmps, 16))),
      minAmps: Math.min(32, Math.max(6, num(ch.minAmps, 6))),
      phases: num(ch.phases, 3) === 1 ? 1 : 3,
      phaseSwitch: ch.phaseSwitch === true,
      stepHoldS: Math.max(0, num(ch.stepHoldS, 30)),
      stepDownHoldS: Math.max(0, num(ch.stepDownHoldS, 30)),
    },
    share: { ...DEFAULT_CONFIG.share, ...(s.share || {}) },
    evStepUpSoc: Math.min(100, Math.max(0, num(s.evStepUpSoc, 97))),
    forecastGate: { ...DEFAULT_CONFIG.forecastGate, ...(s.forecastGate || {}) },
    gridImportLimitKw: Math.max(0, num(s.gridImportLimitKw, 24)),
    pv: { factor: Math.min(3, Math.max(0.1, num(s.pv && s.pv.factor, 1))) },
    consumers,
    tickMinutes: Math.min(15, Math.max(1, Math.round(num(s.tickMinutes, DEFAULT_CONFIG.tickMinutes)))),
    battery: {
      ...b,
      enabled: b.enabled !== false,
      commitSlot: b.commitSlot !== false,
      targetSoc: Math.min(100, Math.max(0, num(b.targetSoc, 90))),
      targetSocMin: Math.min(100, Math.max(0, num(b.targetSocMin, 50))),
      chargePowerKw: Math.min(10, Math.max(0.5, num(b.chargePowerKw, 5))),
      reserveHours: Math.min(24, Math.max(0, num(b.reserveHours, 6))),
      solarLimitKwh: Math.max(0, num(b.solarLimitKwh, 16)),
      solarMinKwh: Math.max(0, num(b.solarMinKwh, 0)),
      capacityKwh: Math.max(0, num(b.capacityKwh, 13.8)),
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
  if (!cfg.consumers.some((x) => x.id === target)) return null;
  return normalizeConfig({
    ...cfg,
    consumers: cfg.consumers.map((x) => (x.id === target ? { ...x, live: on === true } : x)),
  });
}

module.exports = { DEFAULT_CONFIG, normalizeConfig, normalizeConsumer, applyToggle };
