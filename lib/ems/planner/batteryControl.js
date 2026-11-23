'use strict';

/**
 * Batteriesteuerung: übersetzt den Modus des Batterie-Planers (charge / hold / normal) in einen Befehl für den Auslöser
 * «Das Energiemanagement gibt einen Befehl» (battery.charge / battery.hold / battery.normal). Reine Funktionen ohne
 * Homey-Aufrufe und ohne feste Geräte-IDs; ausgegeben wird in Actuators.
 *
 * Welche Karten des Batterie-Geräts der Flow des Nutzers ausführt, ist seine Sache (Rezepte stehen in den Einstellungen unter «Flow-Rezepte»).
 * Tags des Auslösers: power (Ladeleistung W), target_soc (Ziel-SoC %), discharge (normale Entladeleistung W).
 */

const MODES = ['charge', 'hold', 'normal'];

/**
 * Befehl für einen Modus. Läuft die Wallbox (carCharging), bleibt die Entladung gesperrt: «Normal» geht dann mit
 * Entladegrenze 0 raus (`locked`) und wird nachgeholt, sobald das Auto nicht mehr lädt.
 * @returns {{ id:string, values:object, locked:boolean }[]}
 */
function buildCommands(mode, values, { carCharging = false } = {}) {
  if (!MODES.includes(mode)) return [];
  if (mode === 'charge') return [{ id: 'battery.charge', values: { power: Math.round(Number(values.power) || 0), target_soc: Math.round(Number(values.target_soc) || 0) }, locked: false }];
  if (mode === 'hold') return [{ id: 'battery.hold', values: {}, locked: false }];
  return [{
    id: 'battery.normal', values: { discharge: carCharging ? 0 : Math.round(Number(values.normal_discharge) || 0) }, locked: !!carCharging,
  }];
}

/** Zustand der Batteriesteuerung (im Speicher, nicht persistent: nach einem Neustart wird neu gesendet). */
function makeBatteryControlState() {
  return {
    warm: false, lastMode: null, lastSentAt: null, pendingRestore: false, liveSeen: undefined,
  };
}

/**
 * Soll jetzt gesendet werden?
 *   - erster Lauf nach dem Start oder Umschalten: nur beobachten
 *   - Moduswechsel: senden
 *   - Laden und Halten: alle `repeatMs` wiederholen (Geräte setzen Werte manchmal zurück)
 *   - Normal mit ausgelassener Entlade-Freigabe (Auto lud): nachholen, sobald das Auto nicht mehr lädt
 * @returns {{ send:boolean, reason:string }}
 */
function stepBatteryControl({
  st, mode, nowMs, repeatMs = 10 * 60 * 1000, carCharging = false, live,
}) {
  if (st.liveSeen !== undefined && st.liveSeen !== live) {
    st.warm = false; st.lastMode = null; st.lastSentAt = null; st.pendingRestore = false;
  }
  st.liveSeen = live;
  if (!st.warm) {
    st.warm = true; st.lastMode = null; return { send: false, reason: 'erster Lauf: nur beobachten' };
  }
  if (mode !== st.lastMode) return { send: true, reason: st.lastMode ? `Wechsel ${st.lastMode} -> ${mode}` : `Start: ${mode}` };
  if ((mode === 'charge' || mode === 'hold') && st.lastSentAt !== null && nowMs - st.lastSentAt >= repeatMs) return { send: true, reason: 'Wiederholung' };
  if (mode === 'normal' && st.pendingRestore && !carCharging) return { send: true, reason: 'Entladung freigeben (Auto lädt nicht mehr)' };
  return { send: false, reason: '' };
}

/** Nach dem Senden den Zustand fortschreiben. */
function markSent(st, mode, nowMs, commands) {
  st.lastMode = mode;
  st.lastSentAt = nowMs;
  st.pendingRestore = mode === 'normal' && commands.some((c) => c.locked);
}

module.exports = {
  MODES, buildCommands, makeBatteryControlState, stepBatteryControl, markSent,
};
