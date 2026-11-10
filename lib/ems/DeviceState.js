'use strict';

/**
 * Zustand des EMS für das Gerät "Energiemanagement" (rein, ohne Homey).
 * Der Modus kommt aus dem Wallbox-Lauf; er ist die Zusammenfassung für Kachel und Flows.
 */

const MODES = ['disabled', 'idle', 'holding', 'solar_ev', 'instant_ev', 'battery_priority', 'error'];

/**
 * @param {{enabled:boolean, charger:object|null, chargeNow:boolean}} p
 *   charger = Ergebnis von runner.chargerCurrent (oder null vor dem ersten Lauf)
 * @returns {{enabled:boolean, mode:string, text:string, surplusW:number, chargeNow:boolean}}
 */
function buildDeviceState({ enabled, charger, chargeNow }) {
  if (!enabled) return { enabled: false, mode: 'disabled', text: 'Ausgeschaltet', surplusW: 0, chargeNow: chargeNow === true };
  if (!charger) return { enabled: true, mode: 'idle', text: 'Wartet auf den ersten Lauf', surplusW: 0, chargeNow: chargeNow === true };
  const mode = charger.mine && MODES.includes(charger.mine.mode) ? charger.mine.mode : 'idle';
  const gridW = Number.isFinite(charger.gridW) ? charger.gridW : null;
  return {
    enabled: true,
    mode,
    text: (charger.mine && charger.mine.reason) || '',
    surplusW: gridW === null ? 0 : Math.max(0, Math.round(-gridW)),
    chargeNow: chargeNow === true,
  };
}

module.exports = { buildDeviceState, MODES };
