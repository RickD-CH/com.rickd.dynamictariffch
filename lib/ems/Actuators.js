'use strict';

// homey-api wird erst beim ersten Gebrauch geladen (ca. 26 MB): wer nur Preise bezieht, braucht es nie.
let HomeyAPI = null;
const loadHomeyApi = () => {
  // eslint-disable-next-line global-require
  if (!HomeyAPI) ({ HomeyAPI } = require('homey-api'));
  return HomeyAPI;
};

/**
 * Ausgänge des EMS. Das ist die EINZIGE Stelle, die Geräte schaltet.
 *
 * Wallbox (go-e): dieselben Flow-Karten der Wallbox:
 *   Start   -> evcharger_charging_start
 *   Leistung-> target_power_set { target_power: W }  (Stopp = 0 W)
 * Verbraucher: Capability onoff des gewählten Geräts oder ein Homey-Flow (Standard- oder erweiterter Flow, Start-Trigger).
 *
 * `live: false` (Trockenlauf) führt nichts aus und gibt nur zurück, was passiert wäre.
 * Jeder Befehl ist begrenzt (Timeout), damit ein hängendes Gerät den Lauf nicht blockiert.
 */

const TIMEOUT_MS = 8000;

// Der Timer wird nach dem Befehl gelöscht, damit pro Befehl kein 8-s-Timer übrig bleibt.
const withTimeout = (p, ms, what) => {
  let timer;
  const t = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${what}: Zeitüberschreitung`)), ms); // eslint-disable-line homey-app/global-timers
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
};

class Actuators {
  constructor(homey, log = () => {}) {
    this.homey = homey;
    this.log = log;
    this._apiPromise = null;
  }

  async _api() {
    if (!this._apiPromise) {
      this._apiPromise = loadHomeyApi().createAppAPI({ homey: this.homey }).catch((err) => {
        this._apiPromise = null;
        throw err;
      });
    }
    return this._apiPromise;
  }

  async _runCard(id, args) {
    const api = await this._api();
    return withTimeout(api.flow.runFlowCardAction({ id, args: args || {} }), TIMEOUT_MS, id);
  }

  /** Wallbox-Befehl ausführen. cmd = { type:'start' } | { type:'set', amps, phases } | { type:'stop' } */
  async charger(chargerId, cmd, { live }) {
    const prefix = `homey:device:${chargerId}`;
    if (cmd.type === 'start') {
      if (live) await this._runCard(`${prefix}:evcharger_charging_start`);
      return { cmd: 'start', live };
    }
    const watts = cmd.type === 'stop' ? 0 : cmd.amps * cmd.phases * 230;
    if (live) await this._runCard(`${prefix}:target_power_set`, { target_power: watts });
    return { cmd: cmd.type, watts, live };
  }

  /**
   * Batterie-Befehle: Aktionskarten des Batterie-Geräts der Reihe nach. Ausgelassene Schritte (`skipped`) werden nicht
   * gesendet. `live: false` sendet nichts und gibt nur zurück, was passiert wäre.
   */
  async battery(deviceId, commands, { live }) {
    const out = [];
    for (const c of commands) {
      if (c.skipped) {
        out.push({
          card: c.card, args: c.args, live, skipped: true,
        }); continue;
      }
      if (live) await this._runCard(`homey:device:${deviceId}:${c.card}`, c.args);
      out.push({ card: c.card, args: c.args, live });
    }
    return out;
  }

  /**
   * Hausanschluss-Schutz: ein Gerät ausschalten. onoff aus, sonst Thermostat-Modus «off».
   * @returns {Promise<{cmd:'off', live:boolean, via:string, skipped?:boolean}>}
   */
  async shed(deviceId, { live, offFlow = null }) {
    if (offFlow && offFlow.id) {
      if (live) await this._triggerFlow(offFlow);
      return {
        cmd: 'off', live, via: 'flow', flow: offFlow.name || offFlow.id,
      };
    }
    const api = await this._api();
    const dev = await withTimeout(api.devices.getDevice({ id: deviceId }), TIMEOUT_MS, 'Gerät');
    const caps = (dev && dev.capabilitiesObj) || {};
    let capabilityId = null;
    let value = null;
    if (caps.onoff) {
      capabilityId = 'onoff'; value = false;
    } else if (caps.thermostat_mode) {
      capabilityId = 'thermostat_mode'; value = 'off';
    }
    if (!capabilityId) {
      return {
        cmd: 'off', live, via: 'none', skipped: true,
      };
    }
    if (live) await withTimeout(api.devices.setCapabilityValue({ deviceId, capabilityId, value }), TIMEOUT_MS, capabilityId);
    return { cmd: 'off', live, via: capabilityId };
  }

  /** Programmstart (z. B. Geschirrspüler): eine Enum-Capability auf den Start-Wert setzen, einmalig. */
  async program(deviceId, capability, value, { live }) {
    if (live) {
      const api = await this._api();
      await withTimeout(api.devices.setCapabilityValue({ deviceId, capabilityId: capability, value }), TIMEOUT_MS, capability);
    }
    return {
      cmd: 'program', capability, value, live,
    };
  }

  /** Einen Flow starten (Standard- oder erweiterter Flow mit dem Trigger «Dieser Flow wird gestartet»). */
  async _triggerFlow(flow) {
    const api = await this._api();
    const p = flow.advanced ? api.flow.triggerAdvancedFlow({ id: flow.id }) : api.flow.triggerFlow({ id: flow.id });
    return withTimeout(p, TIMEOUT_MS, `Flow ${flow.name || flow.id}`);
  }

  /**
   * Verbraucher ein/aus. Mit `flow` ({ id, advanced, name }) wird dieser Flow gestartet, sonst das Gerät geschaltet.
   * Ein Flow ohne Auswahl tut nichts (`skipped`).
   */
  async consumer(deviceId, on, { live, flow = null }) {
    if (flow !== null) {
      if (!flow.id) {
        return {
          cmd: on ? 'on' : 'off', live, via: 'flow', skipped: true,
        };
      }
      if (live) await this._triggerFlow(flow);
      return {
        cmd: on ? 'on' : 'off', live, via: 'flow', flow: flow.name || flow.id,
      };
    }
    if (live) {
      const api = await this._api();
      await withTimeout(api.devices.setCapabilityValue({ deviceId, capabilityId: 'onoff', value: !!on }), TIMEOUT_MS, 'onoff');
    }
    return { cmd: on ? 'on' : 'off', live };
  }
}

module.exports = { Actuators, TIMEOUT_MS };
