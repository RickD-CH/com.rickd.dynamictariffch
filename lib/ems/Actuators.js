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
 * Homey erlaubt Apps nicht, Aktionskarten anderer Geräte auszuführen oder Flows zu starten (HTTP 403 «Missing Scopes»).
 * Darum geben Batterie, Wallbox, Flow-Verbraucher, SG-Ready und Hausanschluss-Schutz ihre Befehle über den Auslöser
 * «Das Energiemanagement gibt einen Befehl» (ems_command) aus; ein Flow des Nutzers führt dann die Karte seines Geräts aus.
 * Direkt geschrieben werden nur Capabilities (Verbraucher mit onoff, SG-Ready-Relais, Programmstart), das ist erlaubt.
 *
 * `live: false` (Trockenlauf) löst nichts aus und gibt nur zurück, was passiert wäre.
 * Jeder Befehl ist begrenzt (Timeout), damit ein hängendes Gerät den Lauf nicht blockiert.
 */

const TIMEOUT_MS = 8000;
// Auslöser warten, bis die Flows durchgelaufen sind (bei der Batterie zwei bis drei Modbus-Karten, zusammen mehrere Sekunden): grosszügiger
const FLOW_TIMEOUT_MS = 30000;

// Der Timer wird nach dem Befehl gelöscht, damit pro Befehl kein 8-s-Timer übrig bleibt.
const withTimeout = (p, ms, what) => {
  let timer;
  const t = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${what}: Zeitüberschreitung`)), ms); // eslint-disable-line homey-app/global-timers
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
};

const { commandTokens } = require('./commands');

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

  _lang() {
    try {
      return this.homey.i18n.getLanguage() === 'de' ? 'de' : 'en';
    } catch (err) {
      return 'de';
    }
  }

  /** Befehl als Auslöser «Das Energiemanagement gibt einen Befehl» abgeben; ein Flow des Nutzers führt ihn aus. */
  async _fire(id, tokens) {
    return withTimeout(this.homey.flow.getTriggerCard('ems_command').trigger(tokens, { id }), FLOW_TIMEOUT_MS, `Befehl ${id}`);
  }

  /**
   * Einen Befehl ausgeben. Ohne `live` nur gemeldet.
   * @param {string} id Befehls-ID (z. B. battery.charge, consumer.<id>.on)
   * @param {object} values { power, target_soc, discharge, amps, phases }
   * @param {{live:boolean, name?:string, lang?:string}} o
   */
  async command(id, values, { live, name = '', lang = null }) {
    const tokens = commandTokens(id, values, name, lang || this._lang());
    if (live) await this._fire(id, tokens);
    return {
      cmd: 'command', command: id, via: 'command', live, values: { power: tokens.power, target_soc: tokens.target_soc, discharge: tokens.discharge, amps: tokens.amps, phases: tokens.phases },
    };
  }

  /** Einen App-Auslöser (Flow-Karte «Wenn») mit Werten feuern. Ohne `live` nur gemeldet. */
  async trigger(id, tokens, { live }) {
    if (live) await withTimeout(this.homey.flow.getTriggerCard(id).trigger(tokens || {}), FLOW_TIMEOUT_MS, id);
    return {
      cmd: 'trigger', live, via: 'trigger', trigger: id, tokens,
    };
  }

  /** Wallbox-Befehl ausgeben (Auslöser): cmd = { type:'start' } | { type:'set', amps, phases } | { type:'stop' }. */
  async charger(chargerId, cmd, { live, lang = null }) {
    if (cmd.type === 'start') {
      await this.command('charger.start', {}, { live, lang });
      return { cmd: 'start', live };
    }
    if (cmd.type === 'stop') {
      await this.command('charger.stop', {}, { live, lang });
      return { cmd: 'stop', watts: 0, live };
    }
    const watts = cmd.amps * cmd.phases * 230;
    await this.command('charger.set', { power: watts, amps: cmd.amps, phases: cmd.phases }, { live, lang });
    return { cmd: cmd.type, watts, live };
  }

  /**
   * Batterie-Befehl ausgeben (ein Befehl je Modus, siehe planner/batteryControl.buildCommands).
   * `live: false` sendet nichts und gibt nur zurück, was passiert wäre.
   */
  async battery(deviceId, commands, { live, lang = null }) {
    const out = [];
    for (const c of commands) {
      out.push(await this.command(c.id, c.values, { live, lang }));
    }
    return out;
  }

  /**
   * Hausanschluss-Schutz: ein Gerät ausschalten. onoff aus, sonst Thermostat-Modus «off».
   * @returns {Promise<{cmd:'off', live:boolean, via:string, skipped?:boolean}>}
   */
  async shed(deviceId, { live, offFlow = null, name = '', lang = null }) {
    if (offFlow && offFlow.id) {
      // Gerät ohne schaltbare Capability: der Nutzer verbindet den Befehl «Schutz: ... ausschalten» mit seinem Flow
      const id = `shed.${deviceId || 'charger'}`;
      await this.command(id, {}, { live, name, lang });
      return {
        cmd: 'off', live, via: 'command', command: id, flow: offFlow.name || offFlow.id,
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

  /**
   * Verbraucher ein/aus. Mit `command` (Befehls-ID, z. B. consumer.<id>.on) wird der Befehl als Auslöser ausgegeben,
   * sonst die Capability onoff des Geräts gesetzt.
   */
  async consumer(deviceId, on, { live, command = null, name = '', lang = null }) {
    if (command) {
      await this.command(command, {}, { live, name, lang });
      return {
        cmd: on ? 'on' : 'off', live, via: 'command', command,
      };
    }
    if (live) {
      const api = await this._api();
      await withTimeout(api.devices.setCapabilityValue({ deviceId, capabilityId: 'onoff', value: !!on }), TIMEOUT_MS, 'onoff');
    }
    return { cmd: on ? 'on' : 'off', live };
  }
}

module.exports = { Actuators, TIMEOUT_MS, FLOW_TIMEOUT_MS };
