'use strict';

/**
 * Zustand des EMS für das Gerät "Energiemanagement" (rein, ohne Homey).
 * Der Modus kommt aus dem Wallbox-Lauf; er ist die Zusammenfassung für Kachel und Flows.
 * Werte, die gerade nicht vorliegen, sind null und werden am Gerät nicht überschrieben.
 */

const MODES = ['disabled', 'idle', 'holding', 'solar_ev', 'instant_ev', 'battery_priority', 'error'];

const finite = (v) => (Number.isFinite(v) ? v : null);
const round = (v, d = 0) => (finite(v) === null ? null : Math.round(v * 10 ** d) / 10 ** d);

/**
 * @param {{enabled:boolean, charger:object|null, chargeNow:boolean, priceRp?:number|null,
 *          forecast?:{todayKwh:number|null, tomorrowKwh:number|null, nowKw:number|null}}} p
 *   charger = Ergebnis von runner.chargerCurrent (oder null vor dem ersten Lauf)
 */
function buildDeviceState({ enabled, charger, chargeNow, priceRp = null, forecast = null }) {
  const f = forecast || {};
  const common = {
    chargeNow: chargeNow === true,
    priceRp: round(priceRp, 1),
    pvTodayKwh: round(f.todayKwh, 1),
    pvTomorrowKwh: round(f.tomorrowKwh, 1),
    pvNowKw: round(f.nowKw, 2),
  };
  const none = { pvW: null, houseW: null, gridW: null, batteryW: null, releasedW: null };
  if (!enabled) return { enabled: false, mode: 'disabled', text: 'Ausgeschaltet', surplusW: 0, ...none, ...common };
  if (!charger) return { enabled: true, mode: 'idle', text: 'Wartet auf den ersten Lauf', surplusW: 0, ...none, ...common };
  const mode = charger.mine && MODES.includes(charger.mine.mode) ? charger.mine.mode : 'idle';
  const gridW = finite(charger.gridW);
  return {
    enabled: true,
    mode,
    text: (charger.mine && charger.mine.reason) || '',
    surplusW: gridW === null ? 0 : Math.max(0, Math.round(-gridW)),
    pvW: round(charger.pvW),
    houseW: round(charger.houseW),
    gridW: round(charger.gridW),
    batteryW: round(charger.batteryW),
    releasedW: round(charger.releasedW),
    ...common,
  };
}

module.exports = { buildDeviceState, MODES };
