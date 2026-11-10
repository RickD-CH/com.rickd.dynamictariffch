'use strict';

const { HomeyAPI } = require('homey-api');

/**
 * Ausgänge des EMS. Das ist die EINZIGE Stelle, die Geräte schaltet.
 *
 * Wallbox (go-e): dieselben Flow-Karten, die Richards bisherige Flows von Andis EMS verwendeten:
 *   Start   -> evcharger_charging_start
 *   Leistung-> target_power_set { target_power: W }  (Stopp = 0 W)
 * Verbraucher: Capability onoff des gewählten Geräts.
 *
 * `live: false` (Trockenlauf) führt nichts aus und gibt nur zurück, was passiert wäre.
 * Jeder Befehl ist begrenzt (Timeout), damit ein hängendes Gerät den Lauf nicht blockiert.
 */

const TIMEOUT_MS = 8000;

const withTimeout = (p, ms, what) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`${what}: Zeitüberschreitung`)), ms)),
]);

class Actuators {
  constructor(homey, log = () => {}) {
    this.homey = homey;
    this.log = log;
    this._apiPromise = null;
  }

  async _api() {
    if (!this._apiPromise) {
      this._apiPromise = HomeyAPI.createAppAPI({ homey: this.homey }).catch((err) => {
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

  /** Verbraucher ein/aus. */
  async consumer(deviceId, on, { live }) {
    if (live) {
      const api = await this._api();
      await withTimeout(api.devices.setCapabilityValue({ deviceId, capabilityId: 'onoff', value: !!on }), TIMEOUT_MS, 'onoff');
    }
    return { cmd: on ? 'on' : 'off', live };
  }
}

module.exports = { Actuators, TIMEOUT_MS };
