'use strict';

const { normalizeConfig, applyToggle } = require('./Config');
const { PriceFeed } = require('./PriceFeed');
const { PvFeed } = require('./PvFeed');
const { Inputs } = require('./Inputs');
const { ShadowLog } = require('./ShadowLog');
const { EmsRunner } = require('./EmsRunner');
const { Actuators } = require('./Actuators');
const { buildDeviceState } = require('./DeviceState');

const SETTINGS_PREFIX = 'ems.';

/**
 * Hängt das EMS an die App: Konfiguration, Protokolle, Zeitplanung. Die Entscheidungslogik liegt
 * in lib/ems/planner/* (rein), die Ein- und Ausgänge in Inputs/Actuators.
 *
 * Das EMS läuft nur, wenn
 *   1. das Gerät "Energiemanagement" (drivers/ems) hinzugefügt wurde UND
 *   2. in der Konfiguration `enabled` gesetzt ist (das ist auch der Ein/Aus-Schalter des Geräts).
 * Sonst gibt es weder Timer noch Zugriffe, und die App verhält sich wie ohne EMS.
 */
class EmsController {
  /** @param {import('homey').App} app */
  constructor(app) {
    this.app = app;
    this.homey = app.homey;
    this._stopped = false;
    this._timer = null;
    this._chargerTimer = null;
    this.runner = null;
    this.emsDevice = null;
  }

  _store() {
    return {
      get: (k) => this.homey.settings.get(SETTINGS_PREFIX + k),
      set: (k, v) => this.homey.settings.set(SETTINGS_PREFIX + k, v),
    };
  }

  _device() {
    try {
      return this.homey.drivers.getDriver('innostrom').getDevices()[0] || null;
    } catch (err) {
      return null;
    }
  }

  getConfig() {
    return normalizeConfig(this.homey.settings.get(SETTINGS_PREFIX + 'config'));
  }

  hasDevice() {
    return !!this.emsDevice;
  }

  /** Läuft das EMS gerade? Gerät vorhanden und eingeschaltet. */
  isActive() {
    return this.hasDevice() && this.getConfig().enabled;
  }

  // ------------------------------------------------------------ Gerät "Energiemanagement"

  attachDevice(device) {
    this.emsDevice = device;
    this.app.log('EMS-Gerät angemeldet');
    this._reschedule();
    this._publish();
  }

  detachDevice(device) {
    if (this.emsDevice !== device) return;
    this.emsDevice = null;
    this.app.log('EMS-Gerät abgemeldet, EMS angehalten');
    this._reschedule();
  }

  /** Aktuellen Zustand auf das Gerät schreiben (Kachel) und Flow-Auslöser feuern. */
  _publish() {
    if (!this.emsDevice) return;
    const cfg = this.getConfig();
    const state = buildDeviceState({
      enabled: cfg.enabled,
      charger: this.runner ? this.runner.chargerCurrent : null,
      chargeNow: cfg.charger.chargeNow,
    });
    Promise.resolve(this.emsDevice.publish(state))
      .catch((err) => this.app.error('EMS-Gerät:', err && err.message));
  }

  _onConsumerEvent(e) {
    if (!this.emsDevice) return;
    try { this.emsDevice.fireConsumerSwitched(e); } catch (err) { this.app.error('EMS-Auslöser:', err && err.message); }
  }

  // ------------------------------------------------------------ Konfiguration

  putConfig(body) {
    const stored = this.homey.settings.get(SETTINGS_PREFIX + 'config') || {};
    const merged = { ...stored, ...(body || {}) };
    for (const k of ['battery', 'charger', 'devices', 'share', 'forecastGate']) {
      merged[k] = { ...(stored[k] || {}), ...((body || {})[k] || {}) };
    }
    if (body && Array.isArray(body.consumers)) merged.consumers = body.consumers;
    const cfg = normalizeConfig(merged);
    this.homey.settings.set(SETTINGS_PREFIX + 'config', cfg);
    this._reschedule();
    this._publish();
    return cfg;
  }

  /** EMS ein/aus (Schalter am Gerät oder in den Einstellungen). */
  setEnabled(on) {
    return this.putConfig({ enabled: on === true });
  }

  /** Steuerung eines Bereichs ein/aus (Schalter in den Einstellungen). */
  setLive(target, on) {
    const stored = this.homey.settings.get(SETTINGS_PREFIX + 'config') || {};
    const cfg = applyToggle(stored, target, on);
    if (!cfg) throw new Error('Unbekanntes Ziel: ' + target);
    this.homey.settings.set(SETTINGS_PREFIX + 'config', cfg);
    this.app.log('EMS: ' + target + ' -> ' + (on ? 'Befehle senden' : 'nur Trockenlauf'));
    if (this.runner && this.isActive()) {
      this.runner.tickCharger().then(() => this._publish())
        .catch((err) => this.app.error('EMS-Lauf:', err && err.message));
    }
    return cfg;
  }

  /** Sofortladen der Wallbox ein/aus (Schalter am Gerät oder Flow); wirkt im nächsten schnellen Lauf. */
  async setChargeNow(on) {
    this.putConfig({ charger: { chargeNow: on === true } });
    if (this.runner && this.isActive()) {
      this.runner.tickCharger().then(() => this._publish())
        .catch((err) => this.app.error('EMS-Sofortladen:', err && err.message));
    }
    return true;
  }

  // ------------------------------------------------------------ Start, Stopp, Zeitplan

  start() {
    const tz = this.homey.clock.getTimezone();
    const store = this._store();
    this.shadowLog = new ShadowLog(store, tz);
    this.chargerLog = new ShadowLog(store, tz, 'charger');
    this.runner = new EmsRunner({
      getConfig: () => this.getConfig(),
      prices: new PriceFeed(() => this._device(), (m) => this.app.log(m)),
      pv: new PvFeed(this.homey, (m) => this.app.log(m)),
      inputs: new Inputs(this.homey, (m) => this.app.log(m)),
      actuators: new Actuators(this.homey, (m) => this.app.log(m)),
      store,
      shadowLog: this.shadowLog,
      chargerLog: this.chargerLog,
      onConsumerEvent: (e) => this._onConsumerEvent(e),
      tz,
      log: (m) => this.app.log(m),
    });
    // Ein Gerät kann schon initialisiert sein, bevor das EMS bereit war.
    if (!this.emsDevice) {
      try { this.emsDevice = this.homey.drivers.getDriver('ems').getDevices()[0] || null; } catch (err) { /* noch kein Treiber */ }
    }
    this.app.log('EMS-Modul bereit (' + (this.hasDevice() ? (this.getConfig().enabled ? 'aktiv, Schattenmodus' : 'Gerät da, ausgeschaltet') : 'kein Gerät, inaktiv') + ')');
    this._reschedule();
    this._publish();
  }

  stop() {
    this._stopped = true;
    this._clearTimers();
  }

  _clearTimers() {
    if (this._timer) this.homey.clearTimeout(this._timer);
    if (this._chargerTimer) this.homey.clearTimeout(this._chargerTimer);
    this._timer = null;
    this._chargerTimer = null;
  }

  _reschedule() {
    if (this._stopped || !this.runner) return;
    this._clearTimers();
    if (!this.isActive()) return;
    this._schedule(5000);
    this._scheduleCharger(8000);
  }

  /** Nächsten Batterie-Lauf auf die nächste `tickMinutes`-Grenze legen (kein setInterval). */
  _schedule(firstDelayMs = null) {
    if (this._stopped) return;
    const stepMs = this.getConfig().tickMinutes * 60 * 1000;
    const now = Date.now();
    const delay = firstDelayMs !== null ? firstDelayMs : (Math.floor(now / stepMs) + 1) * stepMs - now + 2000;
    this._timer = this.homey.setTimeout(async () => {
      try {
        await this.runner.tick();
      } catch (err) {
        this.app.error('EMS-Lauf fehlgeschlagen:', err && err.message);
      }
      if (this.isActive()) this._schedule();
    }, delay);
  }

  /** Wallbox-Lauf: Wartezeit kommt aus dem Lauf selbst (15 s mit Auto, sonst 5 min). */
  _scheduleCharger(delayMs) {
    if (this._stopped) return;
    this._chargerTimer = this.homey.setTimeout(async () => {
      let next = 5 * 60 * 1000;
      try {
        next = await this.runner.tickCharger();
        this._publish();
      } catch (err) {
        this.app.error('EMS-Wallbox-Lauf fehlgeschlagen:', err && err.message);
      }
      if (this.isActive()) this._scheduleCharger(next);
    }, delayMs);
  }

  async runNow() {
    if (!this.runner) throw new Error('EMS nicht gestartet');
    if (!this.hasDevice()) throw new Error('Energiemanagement-Gerät nicht hinzugefügt');
    await this.runner.tickCharger();
    this._publish();
    return this.runner.tick();
  }

  getShadow() {
    const cfg = this.getConfig();
    const base = { enabled: cfg.enabled, deviceExists: this.hasDevice(), shadow: true, config: cfg };
    if (!this.runner) return base;
    return {
      ...base,
      current: this.runner.current,
      lastTickAt: this.runner.lastTickAt,
      ...this.shadowLog.summary(),
      charger: { current: this.runner.chargerCurrent, ...this.chargerLog.summary() },
    };
  }

  /** Alle Geräte mit ihren Capabilities für die Auswahl in den Einstellungen. */
  async listDevices() {
    const inputs = new Inputs(this.homey, (m) => this.app.log(m));
    return inputs.listDevices();
  }
}

module.exports = { EmsController };
