'use strict';

const Homey = require('homey');

/**
 * Gerät "Energiemanagement": zeigt den Zustand des EMS-Moduls und schaltet es ein/aus.
 * Die Logik liegt im EmsController (lib/ems); das Gerät meldet sich dort an (attachDevice).
 */
// Alle Capabilities des Geräts in Anzeigereihenfolge. Fehlende werden beim Start ergänzt, damit ein
// schon gekoppeltes Gerät nach einem Update die neuen Werte bekommt.
const CAPABILITIES = [
  'onoff', 'ems_charge_now', 'ems_mode', 'ems_status_text', 'ems_surplus', 'ems_released',
  'ems_pv_power', 'ems_house_power', 'ems_grid_power', 'ems_battery_power', 'ems_price',
  'ems_pv_today', 'ems_pv_tomorrow', 'ems_pv_now',
];

class EmsDevice extends Homey.Device {
  async onInit() {
    for (const cap of CAPABILITIES) {
      if (!this.hasCapability(cap)) await this.addCapability(cap).catch((err) => this.error(`Capability ${cap} ergänzen:`, err && err.message));
    }
    this._lastMode = this.getCapabilityValue('ems_mode');

    this.registerCapabilityListener('onoff', async (value) => {
      this._ems().setEnabled(value === true);
    });
    this.registerCapabilityListener('ems_charge_now', async (value) => {
      await this._ems().setChargeNow(value === true);
    });

    this._ems().attachDevice(this);
  }

  _ems() {
    const { app } = this.homey;
    if (!app || !app.ems) throw new Error('Energiemanagement nicht bereit');
    return app.ems;
  }

  async onDeleted() {
    try {
      this._ems().detachDevice(this);
    } catch (err) { /* App wird gerade beendet */ }
  }

  async onUninit() {
    try {
      this._ems().detachDevice(this);
    } catch (err) { /* App wird gerade beendet */ }
  }

  async _set(cap, value) {
    if (!this.hasCapability(cap) || this.getCapabilityValue(cap) === value) return;
    await this.setCapabilityValue(cap, value).catch((err) => this.error(`Capability ${cap}:`, err && err.message));
  }

  /**
   * Zustand aus dem Controller übernehmen.
   * @param {{enabled:boolean, mode:string, text:string, surplusW:number, chargeNow:boolean}} s
   */
  async publish(s) {
    await this._set('onoff', s.enabled);
    await this._set('ems_status_text', s.text || '');
    await this._set('ems_surplus', s.surplusW);
    await this._set('ems_charge_now', s.chargeNow);
    // Messwerte und Prognose: nur setzen, was gerade vorliegt
    const values = {
      ems_released: s.releasedW,
      ems_pv_power: s.pvW,
      ems_house_power: s.houseW,
      ems_grid_power: s.gridW,
      ems_battery_power: s.batteryW,
      ems_price: s.priceRp,
      ems_pv_today: s.pvTodayKwh,
      ems_pv_tomorrow: s.pvTomorrowKwh,
      ems_pv_now: s.pvNowKw,
    };
    for (const [cap, v] of Object.entries(values)) {
      if (v !== null && v !== undefined) await this._set(cap, v);
    }
    const changed = this._lastMode !== null && this._lastMode !== undefined && this._lastMode !== s.mode;
    await this._set('ems_mode', s.mode);
    this._lastMode = s.mode;
    if (changed) {
      this.homey.flow.getDeviceTriggerCard('ems_mode_changed')
        .trigger(this, { mode: s.mode, status: s.text || '' })
        .catch((err) => this.error('Trigger ems_mode_changed:', err && err.message));
    }
  }

  /** Ein Verbraucher wurde (im Testbetrieb oder live) ein- oder ausgeschaltet. */
  fireConsumerSwitched(e) {
    this.homey.flow.getDeviceTriggerCard('ems_consumer_switched')
      .trigger(this, {
        name: e.name, state: e.cmd === 'on' ? 'on' : 'off', live: e.live === true, reason: e.reason || '',
      })
      .catch((err) => this.error('Trigger ems_consumer_switched:', err && err.message));
  }
}

module.exports = EmsDevice;
module.exports.CAPABILITIES = CAPABILITIES;
