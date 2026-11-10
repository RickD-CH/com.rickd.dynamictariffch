'use strict';

const { normalizeConfig, applyToggle } = require('./Config');
const { PriceFeed } = require('./PriceFeed');
const { PvFeed } = require('./PvFeed');
const { Inputs } = require('./Inputs');
const { ShadowLog } = require('./ShadowLog');
const { EmsRunner } = require('./EmsRunner');
const { Actuators } = require('./Actuators');

const SETTINGS_PREFIX = 'ems.';

/**
 * Hängt das EMS an die App: Konfiguration, Protokolle, Zeitplanung. Die Entscheidungslogik liegt
 * in lib/ems/planner/* (rein), die Ein- und Ausgänge in Inputs/Actuators.
 *
 * Läuft nur, wenn in der Konfiguration `enabled` gesetzt ist; sonst ist das EMS vollständig aus
 * und die App verhält sich wie vorher (keine Zugriffe, keine Timer).
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
    return cfg;
  }

  /** Steuerung eines Bereichs ein/aus (Schalter in den Einstellungen). */
  setLive(target, on) {
    const stored = this.homey.settings.get(SETTINGS_PREFIX + 'config') || {};
    const cfg = applyToggle(stored, target, on);
    if (!cfg) throw new Error('Unbekanntes Ziel: ' + target);
    this.homey.settings.set(SETTINGS_PREFIX + 'config', cfg);
    this.app.log('EMS: ' + target + ' -> ' + (on ? 'Befehle senden' : 'nur Trockenlauf'));
    if (this.runner && cfg.enabled) {
      this.runner.tickCharger().catch((err) => this.app.error('EMS-Lauf:', err && err.message));
    }
    return cfg;
  }

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
      tz,
      log: (m) => this.app.log(m),
    });
    this.app.log('EMS-Modul bereit (' + (this.getConfig().enabled ? 'aktiv, Schattenmodus' : 'ausgeschaltet') + ')');
    this._reschedule();
  }

  stop() {
    this._stopped = true;
    if (this._timer) this.homey.clearTimeout(this._timer);
    if (this._chargerTimer) this.homey.clearTimeout(this._chargerTimer);
    this._timer = null;
    this._chargerTimer = null;
  }

  _reschedule() {
    if (this._stopped || !this.runner) return;
    if (this._timer) this.homey.clearTimeout(this._timer);
    if (this._chargerTimer) this.homey.clearTimeout(this._chargerTimer);
    this._timer = null;
    this._chargerTimer = null;
    if (!this.getConfig().enabled) return;
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
      if (this.getConfig().enabled) this._schedule();
    }, delay);
  }

  /** Wallbox-Lauf: Wartezeit kommt aus dem Lauf selbst (15 s mit Auto, sonst 5 min). */
  _scheduleCharger(delayMs) {
    if (this._stopped) return;
    this._chargerTimer = this.homey.setTimeout(async () => {
      let next = 5 * 60 * 1000;
      try {
        next = await this.runner.tickCharger();
      } catch (err) {
        this.app.error('EMS-Wallbox-Lauf fehlgeschlagen:', err && err.message);
      }
      if (this.getConfig().enabled) this._scheduleCharger(next);
    }, delayMs);
  }

  /** Sofortladen der Wallbox ein/aus (Flow-Karten); wirkt im nächsten schnellen Lauf. */
  async setChargeNow(on) {
    this.putConfig({ charger: { chargeNow: on === true } });
    if (this.runner && this.getConfig().enabled) {
      this.runner.tickCharger().catch((err) => this.app.error('EMS-Sofortladen:', err && err.message));
    }
    return true;
  }

  async runNow() {
    if (!this.runner) throw new Error('EMS nicht gestartet');
    await this.runner.tickCharger();
    return this.runner.tick();
  }

  getShadow() {
    const cfg = this.getConfig();
    if (!this.runner) return { enabled: cfg.enabled, shadow: true, config: cfg };
    return {
      enabled: cfg.enabled,
      shadow: true,
      config: cfg,
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
