'use strict';

const { HomeyAPI } = require('homey-api');
const { ANDI_APP } = require('./PvFeed');

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Lesende Eingänge über die lokale Homey-API (Berechtigung homey:manager:api).
 * Phase 1 liest nur. Jede Quelle fällt einzeln aus (null), der Rest läuft weiter.
 */
class Inputs {
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

  async _capability(deviceId, capability) {
    const api = await this._api();
    const device = await api.devices.getDevice({ id: deviceId });
    const obj = device.capabilitiesObj && device.capabilitiesObj[capability];
    return obj ? num(obj.value) : null;
  }

  /** SoC (%) und Kapazität (kWh) der Batterie. */
  async battery(bcfg) {
    const out = { soc: null, capacityKwh: null, error: null };
    if (!bcfg.deviceId) { out.error = 'Batterie noch nicht gewählt'; return out; }
    try {
      const api = await this._api();
      const device = await api.devices.getDevice({ id: bcfg.deviceId });
      const caps = device.capabilitiesObj || {};
      out.soc = caps[bcfg.socCapability] ? num(caps[bcfg.socCapability].value) : null;
      out.capacityKwh = caps[bcfg.capacityCapability] ? num(caps[bcfg.capacityCapability].value) : null;
    } catch (err) {
      out.error = `Batterie nicht lesbar: ${err && err.message}`;
      this.log(`[Inputs] ${out.error}`);
    }
    return out;
  }

  /** Ein Gerät lesen -> { caps: capabilitiesObj, available } oder null. */
  async _device(id) {
    if (!id) return null;
    try {
      const api = await this._api();
      const d = await api.devices.getDevice({ id });
      return { caps: d.capabilitiesObj || {}, available: d.available !== false };
    } catch (err) {
      this.log(`[Inputs] Gerät ${id} nicht lesbar: ${err && err.message}`);
      return null;
    }
  }

  /** Einen Zahlenwert eines Geräts lesen, oder null (Gerät/Wert fehlt, nicht erreichbar). */
  async readNumber(deviceId, capability) {
    const dev = await this._device(deviceId);
    if (!dev || !dev.available) return null;
    const o = dev.caps[capability];
    return o ? num(o.value) : null;
  }

  /** Alle Geräte mit ihren Capabilities (für die Auswahl in den Einstellungen). */
  async listDevices() {
    const api = await this._api();
    const all = await api.devices.getDevices();
    return Object.values(all || {})
      .filter((d) => Array.isArray(d.capabilities))
      .map((d) => ({
        id: d.id, name: d.name, cls: d.class || null, zone: d.zoneName || null, caps: d.capabilities,
        capTitles: Object.fromEntries(d.capabilities.map((c) => {
          const t = d.capabilitiesObj && d.capabilitiesObj[c] ? d.capabilitiesObj[c].title : null;
          return [c, typeof t === 'string' ? t : (t && (t.de || t.en)) || null];
        })),
      }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'de'));
  }

  /** Ist-Zustand der Verbraucher: Map id -> { actualOn, powerW, available } */
  async consumerStates(ids) {
    const out = new Map();
    await Promise.all(ids.map(async (id) => {
      const dev = await this._device(id);
      const on = dev && dev.caps.onoff ? dev.caps.onoff.value : null;
      const p = dev && dev.caps.measure_power ? num(dev.caps.measure_power.value) : null;
      const values = {};
      if (dev) for (const [k, v] of Object.entries(dev.caps)) { const n = num(v && v.value); if (n !== null) values[k] = n; }
      out.set(id, { actualOn: typeof on === 'boolean' ? on : null, powerW: p, available: !!dev && dev.available, values });
    }));
    return out;
  }

  /**
   * Alle Messwerte für die Wallbox-Entscheidung. Netz: + = Bezug. Batterie: + = lädt.
   * Fehlende Werte sind null; Andis EMS wird nur zum Vergleich gelesen.
   */
  async chargerInputs(cfg) {
    const val = (dev, cap) => {
      const o = dev && dev.caps[cap];
      return o ? num(o.value) : null;
    };
    const [meter, house, inverter, battery, charger, andi] = await Promise.all([
      this._device(cfg.devices.meter.id),
      cfg.devices.house.id === cfg.devices.meter.id ? Promise.resolve(null) : this._device(cfg.devices.house.id),
      this._device(cfg.devices.inverter.id),
      this._device(cfg.battery.deviceId),
      this._device(cfg.charger.id),
      this._device(cfg.devices.andiEms),
    ]);
    const houseDev = cfg.devices.house.id === cfg.devices.meter.id ? meter : house;
    const state = charger && charger.caps[cfg.charger.stateCapability] ? charger.caps[cfg.charger.stateCapability].value : null;
    const DISCONNECTED = new Set(['standby', 'plugged_out', 'unplugged', 'available', 'idle', null, undefined, false]);
    const phaseRaw = charger && charger.caps[cfg.charger.phaseCapability] ? String(charger.caps[cfg.charger.phaseCapability].value) : null;
    const andiMode = andi && andi.caps.ems_mode ? andi.caps.ems_mode.value : null;
    return {
      gridW: val(meter, cfg.devices.meter.capability),
      houseW: val(houseDev, cfg.devices.house.capability),
      pvW: val(inverter, cfg.devices.inverter.capability),
      batterySoc: val(battery, cfg.battery.socCapability),
      batteryW: val(battery, 'measure_power'),
      batteryCapacityKwh: val(battery, cfg.battery.capacityCapability),
      chargerRead: !!charger,
      chargerConnected: charger ? !DISCONNECTED.has(state) : false,
      chargerState: state,
      chargerPowerW: val(charger, cfg.charger.powerCapability),
      chargerPhases: phaseRaw === '1' ? 1 : (phaseRaw === '2' ? 3 : null),
      chargeNow: andi && andi.caps.charge_now ? andi.caps.charge_now.value === true : false,
      andi: andiMode ? { mode: andiMode, reason: andi.caps.ems_status_text ? andi.caps.ems_status_text.value : '' } : null,
    };
  }

  /** Was Andis EMS für die Batterie plant (nur zum Vergleich): { mode, reason } oder null. */
  async andiBatteryPlan(batteryDeviceId) {
    try {
      const r = await this.homey.api.getApiApp(ANDI_APP).get('/ems/battery-price-plans');
      const plans = r && Array.isArray(r.plans) ? r.plans : [];
      const p = plans.find((x) => x.id === batteryDeviceId) || plans[0];
      return p ? { mode: p.mode, reason: p.reason } : null;
    } catch (err) {
      this.log(`[Inputs] Andis Plan nicht lesbar: ${err && err.message}`);
      return null;
    }
  }
}

module.exports = { Inputs };
