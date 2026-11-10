'use strict';

const { Inputs } = require('./ems/Inputs');
const { MAX_CONSUMERS } = require('./CostTracker'); // dieselbe Grenze wie die Kostenrechnung (6)

/**
 * Liest die kumulierten kWh-Zähler (Netzbezug, Einspeisung, Batterie, Verbraucher) selbst aus den
 * gewählten Geräten und meldet sie dem Innostrom-Gerät, so wie es sonst ein Flow mit den Karten
 * "Zählerstand melden" tut. Braucht die Berechtigung homey:manager:api.
 *
 * Standardmässig aus. Die alten Flow-Karten funktionieren unverändert weiter.
 * Gelesen wird alle 15 Minuten kurz nach der Viertelstunde (kein setInterval) und einmal sofort beim Speichern.
 */

const KINDS = ['import', 'export', 'battery_charge', 'battery_discharge'];
const SETTINGS_KEY = 'meters.config';
const QUARTER_MS = 15 * 60 * 1000;
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
    .map((c) => ({ name: str(c && c.name).trim().slice(0, 60), deviceId: str(c && c.deviceId), capability: str(c && c.capability) }))
    .filter((c) => c.name && c.deviceId && c.capability)
    .slice(0, MAX_CONSUMERS);
  return { enabled: s.enabled === true, sources, consumers };
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

  putConfig(body) {
    const cfg = normalizeMeters(body);
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
  }

  stop() {
    this._stopped = true;
    if (this._timer) this.homey.clearTimeout(this._timer);
    this._timer = null;
  }

  _reschedule() {
    if (this._timer) this.homey.clearTimeout(this._timer);
    this._timer = null;
    if (this._stopped || !this.getConfig().enabled) return;
    const now = Date.now();
    const delay = (Math.floor(now / QUARTER_MS) + 1) * QUARTER_MS - now + OFFSET_MS;
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
      if (s.deviceId && s.capability) jobs.push({ key: k, ...s, report: (kwh) => dev.actionReportCounter(k, kwh) });
    }
    cfg.consumers.forEach((c, i) => {
      jobs.push({ key: `consumer:${c.name}`, deviceId: c.deviceId, capability: c.capability, report: (kwh) => dev.actionReportConsumer(c.name, kwh), idx: i });
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
    return { config: this.getConfig(), status: this.status };
  }

  async listDevices() {
    return this.inputs.listDevices();
  }
}

module.exports = { MeterReader, normalizeMeters, KINDS, MAX_CONSUMERS };
