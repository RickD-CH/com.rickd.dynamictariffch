'use strict';

/**
 * Batteriesteuerung: übersetzt den Modus des Batterie-Planers (charge / hold / normal) in Aktionskarten des
 * Batterie-Geräts. Reine Funktionen ohne Homey-Aufrufe und ohne feste Geräte-IDs; ausgeführt wird in Actuators.
 *
 * Eine Vorlage (Preset) beschreibt je Modus eine Folge von Karten (Kurz-ID der Karte am Gerät) mit Argumenten.
 * Platzhalter in Argumenten: '{power}' (Ladeleistung W), '{target_soc}' (Ziel-SoC %), '{normal_discharge}'
 * (normale Entladeleistung W). Erkannt wird eine Vorlage an den Karten, die das gewählte Gerät anbietet.
 */

const PRESETS = Object.freeze({
  // Batterie mit Zwangsladen, Entlade-Grenze und Betriebsmodus (Kartennamen wie am Gerät).
  luna2000: Object.freeze({
    requires: ['luna2000_start_force_charge', 'luna2000_stop_force_charge_discharge', 'luna2000_set_max_discharge_power', 'luna2000_set_working_mode'],
    charge: [
      { card: 'luna2000_start_force_charge', args: { power: '{power}', target_soc: '{target_soc}' } },
    ],
    hold: [
      { card: 'luna2000_stop_force_charge_discharge', args: {} },
      { card: 'luna2000_set_max_discharge_power', args: { power: 0 } },
    ],
    normal: [
      { card: 'luna2000_stop_force_charge_discharge', args: {} },
      { card: 'luna2000_set_working_mode', args: { mode: '2' } },
      // Lädt gerade das Auto, bleibt die Entladung gesperrt (Batterie speist das Auto nicht); nachgeholt, sobald es fertig ist.
      { card: 'luna2000_set_max_discharge_power', args: { power: '{normal_discharge}' }, skipWhenCarCharging: true },
    ],
  }),
});

const MODES = ['charge', 'hold', 'normal'];

/** Welche Vorlage passt zu den Karten des Geräts? `cardIds` = Kurz-IDs (ohne "homey:device:<id>:"). */
function detectPreset(cardIds) {
  const set = new Set(cardIds || []);
  for (const [name, p] of Object.entries(PRESETS)) {
    if (p.requires.every((c) => set.has(c))) return name;
  }
  return null;
}

/** Befehle für einen Modus: Platzhalter ersetzt, ausgelassene Schritte markiert. */
function buildCommands(preset, mode, values, { carCharging = false } = {}) {
  const p = PRESETS[preset];
  if (!p || !MODES.includes(mode)) return [];
  const fill = (v) => {
    if (typeof v !== 'string') return v;
    const m = /^\{(\w+)\}$/.exec(v);
    if (!m) return v;
    const n = Number(values[m[1]]);
    return Number.isFinite(n) ? Math.round(n) : v;
  };
  return p[mode].map((step) => ({
    card: step.card,
    args: Object.fromEntries(Object.entries(step.args).map(([k, v]) => [k, fill(v)])),
    skipped: !!(step.skipWhenCarCharging && carCharging),
  }));
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
  st.pendingRestore = mode === 'normal' && commands.some((c) => c.skipped);
}

module.exports = {
  PRESETS, MODES, detectPreset, buildCommands, makeBatteryControlState, stepBatteryControl, markSent,
};
