'use strict';

/**
 * Warmwasser-Programm bei günstigem Preis, unabhängig von der SG-Ready-Steuerung (sgready.js): wenn der Strom günstig ist
 * und das Warmwasser unter `belowTemp` liegt, wird das Warmwasser-Programm der Wärmepumpe gestartet (Flow, z. B. Modbus-Betriebsart,
 * oder Capability einer App) und beim Ende wieder auf Normal gesetzt. Die Entscheidung ist dieselbe Zustandsmaschine wie bei SG-Ready
 * (Einschaltverzögerung, Mindestlaufzeit, Ausschaltverzögerung, Abkühlpause, Zieltemperatur, Betriebsart), nur ohne Sonnen-Auslöser
 * (`dhwToSgCfg`). Übernimmt SG-Ready wegen Sonne, wird das Warmwasser-Programm beendet (Sonne hat Vorrang).
 */

const { normalizeSgReady } = require('./sgready');

const DEFAULTS = Object.freeze({
  enabled: false,
  live: false, // sonst nur simulieren (Silent-Modus gilt zusätzlich)
  maxPriceRp: 15,
  belowTemp: 45, // nur starten, wenn das Warmwasser darunter liegt (0 = keine Prüfung)
  targetTemp: 56, // Programm beenden, sobald das Warmwasser diese Temperatur erreicht
  skipPv: true, // nicht per Preis starten, solange die Sonne heute noch genug liefert
  skipPvKwh: 6,
  skipPvUntil: '17:00', // nur bis zu dieser Uhrzeit zählt die Sonnenprognose
  startDelayMin: 10,
  minRunMin: 90,
  stopDelayMin: 8,
  cooldownMin: 30,
  sensorId: '',
  tempCapability: 'measure_temperature',
  modeId: '',
  modeCapability: '',
  modeOkValue: '',
  output: 'flows', // 'flows' | 'capability'
  flowOn: Object.freeze({ id: '', advanced: false, name: '' }),
  flowOff: Object.freeze({ id: '', advanced: false, name: '' }),
  device: Object.freeze({
    deviceId: '', capability: '', onValue: '', offValue: '',
  }),
});

function normalizeFlow(f) {
  const s = f && typeof f === 'object' ? f : {};
  return { id: typeof s.id === 'string' ? s.id : '', advanced: s.advanced === true, name: typeof s.name === 'string' ? s.name : '' };
}

function normalizeDevice(r) {
  const s = r && typeof r === 'object' ? r : {};
  const str = (x) => (typeof x === 'string' ? x : '');
  return {
    deviceId: str(s.deviceId), capability: str(s.capability), onValue: str(s.onValue), offValue: str(s.offValue),
  };
}

function normalizeDhw(v) {
  const d = DEFAULTS;
  const s = v && typeof v === 'object' ? v : {};
  // Zahlen und Uhrzeit prüft dieselbe Normalisierung wie bei SG-Ready
  const n = normalizeSgReady({
    maxPriceRp: s.maxPriceRp,
    priceBelowTemp: s.belowTemp,
    targetTemp: s.targetTemp,
    priceSkipPvKwh: s.skipPvKwh,
    windowTo: s.skipPvUntil,
    startDelayMin: s.startDelayMin,
    minRunMin: s.minRunMin,
    stopDelayMin: s.stopDelayMin,
    cooldownMin: s.cooldownMin,
  });
  return {
    enabled: s.enabled === true,
    live: s.live === true,
    maxPriceRp: n.maxPriceRp,
    belowTemp: n.priceBelowTemp,
    targetTemp: n.targetTemp,
    skipPv: s.skipPv !== false,
    skipPvKwh: n.priceSkipPvKwh,
    skipPvUntil: n.windowTo,
    startDelayMin: n.startDelayMin,
    minRunMin: n.minRunMin,
    stopDelayMin: n.stopDelayMin,
    cooldownMin: n.cooldownMin,
    sensorId: typeof s.sensorId === 'string' ? s.sensorId : '',
    tempCapability: typeof s.tempCapability === 'string' && s.tempCapability ? s.tempCapability : d.tempCapability,
    modeId: typeof s.modeId === 'string' ? s.modeId : '',
    modeCapability: typeof s.modeCapability === 'string' ? s.modeCapability : '',
    modeOkValue: typeof s.modeOkValue === 'string' ? s.modeOkValue : '',
    output: s.output === 'capability' ? 'capability' : 'flows',
    flowOn: normalizeFlow(s.flowOn),
    flowOff: normalizeFlow(s.flowOff),
    device: normalizeDevice(s.device),
  };
}

/** Einstellungen als SG-Ready-Konfiguration ohne Sonnen-Auslöser, mit Preis-Auslöser und dem Zustand «dhw». */
function dhwToSgCfg(d) {
  return normalizeSgReady({
    enabled: true,
    sunTrigger: false,
    usePrice: true,
    maxPriceRp: d.maxPriceRp,
    priceBelowTemp: d.belowTemp,
    priceSkipPv: d.skipPv,
    priceSkipPvKwh: d.skipPvKwh,
    windowTo: d.skipPvUntil,
    priceAction: 'dhw',
    targetTemp: d.targetTemp,
    startDelayMin: d.startDelayMin,
    minRunMin: d.minRunMin,
    stopDelayMin: d.stopDelayMin,
    cooldownMin: d.cooldownMin,
    allowForced: false,
  });
}

module.exports = { DEFAULTS, normalizeDhw, dhwToSgCfg };
