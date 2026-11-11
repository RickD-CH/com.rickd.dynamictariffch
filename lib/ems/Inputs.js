'use strict';

const { ANDI_APP } = require('./PvFeed');

// homey-api wird erst beim ersten Gebrauch geladen (ca. 26 MB): wer nur Preise bezieht, braucht es nie.
let HomeyAPI = null;
const loadHomeyApi = () => {
  // eslint-disable-next-line global-require
  if (!HomeyAPI) ({ HomeyAPI } = require('homey-api'));
  return HomeyAPI;
};

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
      this._apiPromise = loadHomeyApi().createAppAPI({ homey: this.homey }).catch((err) => {
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
    const [meter, house, inverter, battery, charger, andi, car] = await Promise.all([
      this._device(cfg.devices.meter.id),
      cfg.devices.house.id === cfg.devices.meter.id ? Promise.resolve(null) : this._device(cfg.devices.house.id),
      this._device(cfg.devices.inverter.id),
      this._device(cfg.battery.deviceId),
      this._device(cfg.charger.id),
      cfg.compare ? this._device(cfg.devices.andiEms) : Promise.resolve(null),
      cfg.car && cfg.car.deviceId ? this._device(cfg.car.deviceId) : Promise.resolve(null),
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
      carSoc: val(car, cfg.car && cfg.car.socCapability),
      chargerRead: !!charger,
      chargerConnected: charger ? !DISCONNECTED.has(state) : false,
      chargerState: state,
      chargerPowerW: val(charger, cfg.charger.powerCapability),
      chargerPhases: phaseRaw === '1' ? 1 : (phaseRaw === '2' ? 3 : null),
      chargeNow: andi && andi.caps.charge_now ? andi.caps.charge_now.value === true : false,
      andi: andiMode ? { mode: andiMode, reason: andi.caps.ems_status_text ? andi.caps.ems_status_text.value : '' } : null,
    };
  }

  /**
   * Solarprognose als Tageswerte (kWh heute/morgen) lesen.
   *   'homey'  Energie-Prognose von Homey (Flow-Tags homey:manager:energy:solarForecast{Today,Tomorrow}Kwh)
   *   'device' zwei Werte eines gewählten Geräts (pv.device.today / .tomorrow)
   *   'auto'   Homey, sonst das gewählte Gerät
   * @returns {Promise<{todayKwh:number|null, tomorrowKwh:number|null, source:'homey'|'device'}|null>}
   */
  async solarForecast(pv, mode = 'auto') {
    const fromHomey = async () => {
      try {
        const api = await this._api();
        const read = async (id) => {
          try {
            const r = await api.flowtoken.getFlowTokenValue({ id });
            return num(r && typeof r === 'object' && 'value' in r ? r.value : r);
          } catch (err) { return null; }
        };
        const todayKwh = await read('homey:manager:energy:solarForecastTodayKwh');
        const tomorrowKwh = await read('homey:manager:energy:solarForecastTomorrowKwh');
        return todayKwh === null && tomorrowKwh === null ? null : { todayKwh, tomorrowKwh, source: 'homey' };
      } catch (err) {
        this.log(`[Inputs] Homey-Solarprognose nicht lesbar: ${err && err.message}`);
        return null;
      }
    };
    const fromDevice = async () => {
      const d = pv && pv.device;
      if (!d || !d.id) return null;
      const dev = await this._device(d.id);
      if (!dev) return null;
      const val = (cap) => (cap && dev.caps[cap] ? num(dev.caps[cap].value) : null);
      const todayKwh = val(d.today);
      const tomorrowKwh = val(d.tomorrow);
      return todayKwh === null && tomorrowKwh === null ? null : { todayKwh, tomorrowKwh, source: 'device' };
    };
    if (mode === 'device') return fromDevice();
    if (mode === 'homey') return fromHomey();
    return (await fromHomey()) || (await fromDevice());
  }

  /**
   * Flows, die sich per Programm starten lassen (Start-Trigger «Dieser Flow wird gestartet»), Standard- und erweiterte Flows.
   * @returns {Promise<{id:string,name:string,advanced:boolean}[]>}
   */
  async listFlows() {
    const out = [];
    try {
      const api = await this._api();
      const take = (obj, advanced) => {
        for (const f of Object.values(obj || {})) {
          if (f && f.id && f.triggerable === true && f.enabled !== false && f.broken !== true) out.push({ id: f.id, name: String(f.name || f.id), advanced });
        }
      };
      take(await api.flow.getFlows(), false);
      try { take(await api.flow.getAdvancedFlows(), true); } catch (err) { this.log(`[Inputs] erweiterte Flows nicht lesbar: ${err && err.message}`); }
    } catch (err) {
      this.log(`[Inputs] Flows nicht lesbar: ${err && err.message}`);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
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
