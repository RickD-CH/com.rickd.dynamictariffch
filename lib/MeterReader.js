'use strict';

const { Inputs } = require('./ems/Inputs');
const { MAX_CONSUMERS } = require('./CostTracker'); // dieselbe Grenze wie die Kostenrechnung (6)

/**
 * Liest die kumulierten kWh-Zähler (Netzbezug, Einspeisung, Batterie, Verbraucher) selbst aus den
 * gewählten Geräten und meldet sie dem Innostrom-Gerät, so wie es sonst ein Flow mit den Karten
 * "Zählerstand melden" tut. Braucht die Berechtigung homey:manager:api.
 *
 * Standardmässig aus. Die alten Flow-Karten funktionieren unverändert weiter.
 * Gelesen wird im gewählten Takt (Standard 15 Minuten, kurz nach der Grenze, kein setInterval), einmal sofort beim Speichern
 * und einmal kurz nach dem Start der App.
 */

const KINDS = ['import', 'export', 'battery_charge', 'battery_discharge'];
const SETTINGS_KEY = 'meters.config';
const INTERVALS = [5, 10, 15, 30, 60]; // Minuten, Standard 15
const OFFSET_MS = 20 * 1000; // Zähler haben dann ihren neuen Wert

const str = (v) => (typeof v === 'string' ? v : '');

/** Gespeicherte Konfiguration prüfen und mit Standardwerten ergänzen. */
function normalizeMeters(stored) {
  const s = stored && typeof stored === 'object' ? stored : {};
  const src = s.sources && typeof s.sources === 'object' ? s.sources : {};
  const sources = {};
  for (const k of KINDS) {
    const e = src[k] && typeof src[k] === 'object' ? src[k] : {};
    sources[k] = { deviceId: str(e.deviceId), capability: str(e.capability) };
  }
  const consumers = (Array.isArray(s.consumers) ? s.consumers : [])
    // icon: Symbol des Kostenzählers (nur Anzeige in den Einstellungen), ein kurzer Name wie «heatpump»
    .map((c) => ({
      name: str(c && c.name).trim().slice(0, 60), deviceId: str(c && c.deviceId), capability: str(c && c.capability), icon: /^[a-z]{1,20}$/.test(str(c && c.icon)) ? str(c.icon) : '',
    }))
    .filter((c) => c.name && c.deviceId && c.capability)
    .slice(0, MAX_CONSUMERS);
  const intervalMin = INTERVALS.includes(Number(s.intervalMin)) ? Number(s.intervalMin) : 15;
  return {
    enabled: s.enabled === true, intervalMin, sources, consumers,
  };
}

class MeterReader {
  /** @param {import('homey').App} app */
  constructor(app, { inputs = null } = {}) {
    this.app = app;
    this.homey = app.homey;
    this.inputs = inputs || new Inputs(this.homey, (m) => app.log(m));
    this.status = {};
    this._timer = null;
    this._stopped = false;
  }

  getConfig() {
    return normalizeMeters(this.homey.settings.get(SETTINGS_KEY));
  }

  /**
   * Speichern führt mit der bestehenden Konfiguration zusammen: nicht mitgeschickte Teile (Zähler, Verbraucher,
   * Schalter) bleiben, wie sie sind. So können zwei Oberflächen je einen Teil ändern, ohne sich zu überschreiben.
   */
  putConfig(body) {
    const cur = this.getConfig();
    const b = body && typeof body === 'object' ? body : {};
    const sources = {};
    for (const k of KINDS) sources[k] = b.sources && b.sources[k] ? b.sources[k] : cur.sources[k];
    const cfg = normalizeMeters({
      enabled: b.enabled === undefined ? cur.enabled : b.enabled,
      intervalMin: b.intervalMin === undefined ? cur.intervalMin : b.intervalMin,
      sources,
      consumers: b.consumers === undefined ? cur.consumers : b.consumers,
    });
    this.homey.settings.set(SETTINGS_KEY, cfg);
    this.status = {};
    this._reschedule();
    if (cfg.enabled) this.readOnce().catch((err) => this.app.error('Zählerstände:', err && err.message));
    return cfg;
  }

  _device() {
    try {
      return this.homey.drivers.getDriver('innostrom').getDevices()[0] || null;
    } catch (err) {
      return null;
    }
  }

  start() {
    this._stopped = false;
    this._reschedule();
    // Nach dem Start gleich einmal lesen, damit die Übersicht nicht bis zur nächsten Viertelstunde leer bleibt
    if (this.getConfig().enabled) {
      this._initialTimer = this.homey.setTimeout(() => {
        this.readOnce().catch((err) => this.app.error('Zählerstände:', err && err.message));
      }, 20 * 1000);
    }
  }

  stop() {
    this._stopped = true;
    if (this._timer) this.homey.clearTimeout(this._timer);
    if (this._initialTimer) this.homey.clearTimeout(this._initialTimer);
    this._timer = null;
    this._initialTimer = null;
  }

  _reschedule() {
    if (this._timer) this.homey.clearTimeout(this._timer);
    this._timer = null;
    if (this._stopped || !this.getConfig().enabled) return;
    const now = Date.now();
    const stepMs = this.getConfig().intervalMin * 60 * 1000;
    const delay = (Math.floor(now / stepMs) + 1) * stepMs - now + OFFSET_MS;
    this._timer = this.homey.setTimeout(async () => {
      try {
        await this.readOnce();
      } catch (err) {
        this.app.error('Zählerstände:', err && err.message);
      }
      this._reschedule();
    }, delay);
  }

  /** Alle gewählten Zähler lesen und melden. Gibt den Status je Zähler zurück. */
  async readOnce(nowMs = Date.now()) {
    const cfg = this.getConfig();
    const dev = this._device();
    const jobs = [];
    for (const k of KINDS) {
      const s = cfg.sources[k];
      if (s.deviceId && s.capability) jobs.push({ key: k, ...s, report: (kwh) => dev.actionReportCounter(k, kwh, 'auto') });
    }
    cfg.consumers.forEach((c, i) => {
      jobs.push({
        key: `consumer:${c.name}`, deviceId: c.deviceId, capability: c.capability, report: (kwh) => dev.actionReportConsumer(c.name, kwh, 'auto'), idx: i,
      });
    });
    if (!dev) {
      for (const j of jobs) this.status[j.key] = { at: nowMs, error: 'Kein Innostrom-Gerät gekoppelt' };
      return this.status;
    }
    for (const j of jobs) {
      try {
        const kwh = await this.inputs.readNumber(j.deviceId, j.capability);
        if (kwh === null) throw new Error('Kein Wert lesbar');
        await j.report(kwh);
        this.status[j.key] = { at: nowMs, kwh };
      } catch (err) {
        this.status[j.key] = { at: nowMs, error: err && err.message ? err.message : String(err) };
      }
    }
    return this.status;
  }

  getStatus() {
    const { ems } = this.app;
    const dev = this._device();
    let seen = {};
    try {
      seen = dev && typeof dev.getReportSeen === 'function' ? dev.getReportSeen() : {};
    } catch (err) {
      seen = {};
    }
    return {
      config: this.getConfig(), status: this.status, seen, consumersManagedByEms: !!(ems && typeof ems.hasDevice === 'function' && ems.hasDevice()),
    };
  }

  async listDevices() {
    return this.inputs.listDevices();
  }
}

module.exports = {
  MeterReader, normalizeMeters, KINDS, MAX_CONSUMERS, INTERVALS,
};
