'use strict';

const { COMPARE_APP } = require('./PvFeed');
const { localParts, addLocalDays } = require('../time');

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

/** Ladestand in Prozent: Werte mit Bereich 0 bis 1 (z. B. 0.4) werden auf 0 bis 100 umgerechnet. */
function socPercent(dev, cap) {
  const o = dev && cap ? dev.caps[cap] : null;
  const v = o ? num(o.value) : null;
  if (v === null) return null;
  return Number.isFinite(o.max) && o.max <= 1 ? Math.round(v * 1000) / 10 : v;
}

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
    if (!bcfg.deviceId) {
      out.error = 'Batterie noch nicht gewählt'; return out;
    }
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

  /**
   * Läuft ein Gerät der Abschalt-Liste? Ein bei onoff, Thermostat nicht «off» oder mehr als 50 W.
   * @returns {Promise<Map<string,{available:boolean,on:boolean}>>}
   */
  async shedStates(ids) {
    const out = new Map();
    await Promise.all((ids || []).map(async (id) => {
      const dev = await this._device(id);
      if (!dev) {
        out.set(id, { available: false, on: false }); return;
      }
      const c = dev.caps;
      const p = c.measure_power ? num(c.measure_power.value) : null;
      const on = (c.onoff && c.onoff.value === true)
        || (c.thermostat_mode && typeof c.thermostat_mode.value === 'string' && c.thermostat_mode.value !== 'off')
        || (p !== null && p > 50);
      out.set(id, { available: dev.available, on: !!on });
    }));
    return out;
  }

  /**
   * Werte eines Geräts in Echtzeit beobachten (Hausanschluss-Schutz). `onValue(cap, value)` bei jeder Änderung.
   * @returns {Promise<function>} zum Abmelden
   */
  async watch(deviceId, caps, onValue) {
    const api = await this._api();
    const dev = await api.devices.getDevice({ id: deviceId });
    const inst = [];
    for (const cap of caps) {
      if (!dev.capabilitiesObj || !dev.capabilitiesObj[cap]) continue;
      inst.push(dev.makeCapabilityInstance(cap, (v) => onValue(cap, v)));
    }
    return () => {
      for (const x of inst) {
        try {
          x.destroy();
        } catch (err) { /* schon weg */ }
      }
    };
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
        id: d.id,
        name: d.name,
        cls: d.class || null,
        zone: d.zoneName || null,
        caps: d.capabilities,
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
      const raw = {};
      if (dev) {
        for (const [k, v] of Object.entries(dev.caps)) {
          const n = num(v && v.value); if (n !== null) values[k] = n;
          if (v && v.value !== undefined) raw[k] = v.value; // auch Text-Capabilities (z. B. Fernbedienung, Türzustand)
        }
      }
      out.set(id, {
        actualOn: typeof on === 'boolean' ? on : null, powerW: p, available: !!dev && dev.available, values, raw,
      });
    }));
    return out;
  }

  /**
   * Alle Messwerte für die Wallbox-Entscheidung. Netz: + = Bezug. Batterie: + = lädt.
   * Fehlende Werte sind null; ein anderes EMS wird nur zum Vergleich gelesen.
   */
  async chargerInputs(cfg) {
    const val = (dev, cap) => {
      const o = dev && dev.caps[cap];
      return o ? num(o.value) : null;
    };
    const fuse = cfg.fuse && cfg.fuse.enabled ? cfg.fuse : null;
    const fuseOwn = fuse && fuse.meterId && fuse.meterId !== cfg.devices.meter.id;
    const [meter, house, inverter, battery, charger, other, car, fuseMeter] = await Promise.all([
      this._device(cfg.devices.meter.id),
      cfg.devices.house.id === cfg.devices.meter.id ? Promise.resolve(null) : this._device(cfg.devices.house.id),
      this._device(cfg.devices.inverter.id),
      this._device(cfg.battery.deviceId),
      this._device(cfg.charger.id),
      cfg.compare ? this._device(cfg.devices.compareEms) : Promise.resolve(null),
      cfg.car && cfg.car.deviceId ? this._device(cfg.car.deviceId) : Promise.resolve(null),
      fuseOwn ? this._device(fuse.meterId) : Promise.resolve(null),
    ]);
    const phaseDev = fuseOwn ? fuseMeter : meter;
    const houseDev = cfg.devices.house.id === cfg.devices.meter.id ? meter : house;
    const state = charger && charger.caps[cfg.charger.stateCapability] ? charger.caps[cfg.charger.stateCapability].value : null;
    const DISCONNECTED = new Set(['standby', 'plugged_out', 'unplugged', 'available', 'idle', null, undefined, false]);
    const phaseRaw = charger && charger.caps[cfg.charger.phaseCapability] ? String(charger.caps[cfg.charger.phaseCapability].value) : null;
    const otherMode = other && other.caps.ems_mode ? other.caps.ems_mode.value : null;
    return {
      gridW: val(meter, cfg.devices.meter.capability),
      houseW: val(houseDev, cfg.devices.house.capability),
      pvW: val(inverter, cfg.devices.inverter.capability),
      batterySoc: val(battery, cfg.battery.socCapability),
      batteryW: val(battery, 'measure_power'),
      batteryCapacityKwh: val(battery, cfg.battery.capacityCapability),
      carSoc: socPercent(car, cfg.car && cfg.car.socCapability),
      chargerRead: !!charger,
      chargerConnected: charger ? !DISCONNECTED.has(state) : false,
      chargerState: state,
      chargerPowerW: val(charger, cfg.charger.powerCapability),
      chargerPhases: phaseRaw === '1' ? 1 : (phaseRaw === '2' ? 3 : null),
      chargeNow: other && other.caps.charge_now ? other.caps.charge_now.value === true : false,
      // Hausanschluss-Schutz: Ströme der drei Phasen (A), null ohne Schutz
      phaseA: fuse ? fuse.caps.map((c) => val(phaseDev, c)) : null,
      other: otherMode ? { mode: otherMode, reason: other.caps.ems_status_text ? other.caps.ems_status_text.value : '' } : null,
    };
  }

  /**
   * Solarprognose als Tageswerte (kWh heute/morgen) lesen.
   *   'homey'  Energie-Prognose von Homey (Flow-Tags homey:manager:energy:solarForecast{Today,Tomorrow}Kwh)
   *   'device' zwei Werte eines gewählten Geräts (pv.device.today / .tomorrow)
   *   'auto'   Homey, sonst das gewählte Gerät
   * Bei Homey zusätzlich der Verlauf in Viertelstunden aus dem Energie-Tagesbericht (solarForecastMeasurePower), für heute
   * und für morgen, sobald Homey den Bericht angelegt hat.
   * @returns {Promise<{todayKwh:number|null, tomorrowKwh:number|null, source:'homey'|'device', todayCurve?:object[]|null, tomorrowCurve?:object[]|null}|null>}
   */
  async solarForecast(pv, mode = 'auto', { nowMs = Date.now(), tz = 'Europe/Zurich' } = {}) {
    const dayKey = (d) => {
      const p = localParts(addLocalDays(new Date(nowMs), d, tz), tz);
      return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
    };
    /** Verlauf eines Tages: [{ start, w }] oder null (kein Bericht, keine Prognose). */
    const curve = async (api, d) => {
      try {
        if (!api.energy || typeof api.energy.getReportDay !== 'function') return null;
        const r = await api.energy.getReportDay({ date: dayKey(d) });
        const arr = r && r.electricity && Array.isArray(r.electricity.solarForecastMeasurePower) ? r.electricity.solarForecastMeasurePower : null;
        if (!arr || arr.length < 24) return null;
        const pts = arr.map((x) => ({ start: Date.parse(x.t), w: num(x.v) })).filter((x) => Number.isFinite(x.start) && x.w !== null);
        return pts.length >= 24 && pts.some((x) => x.w > 0) ? pts : null;
      } catch (err) {
        return null; // Bericht für morgen gibt es erst, wenn Homey die Prognose hat
      }
    };
    const fromHomey = async () => {
      try {
        const api = await this._api();
        const read = async (id) => {
          try {
            const r = await api.flowtoken.getFlowTokenValue({ id });
            return num(r && typeof r === 'object' && 'value' in r ? r.value : r);
          } catch (err) {
            return null;
          }
        };
        const todayKwh = await read('homey:manager:energy:solarForecastTodayKwh');
        const tomorrowKwh = await read('homey:manager:energy:solarForecastTomorrowKwh');
        const todayCurve = await curve(api, 0);
        const tomorrowCurve = await curve(api, 1);
        if (todayKwh === null && tomorrowKwh === null && !todayCurve && !tomorrowCurve) return null;
        return {
          todayKwh, tomorrowKwh, source: 'homey', todayCurve, tomorrowCurve,
        };
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
    const homey = await fromHomey();
    return homey || fromDevice();
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
      try {
        take(await api.flow.getAdvancedFlows(), true);
      } catch (err) {
        this.log(`[Inputs] erweiterte Flows nicht lesbar: ${err && err.message}`);
      }
    } catch (err) {
      this.log(`[Inputs] Flows nicht lesbar: ${err && err.message}`);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  /** Aktionskarten eines Geräts (Kurz-ID, Titel, Argumente) - für die Erkennung der Batterie-Vorlage. */
  async deviceActions(deviceId) {
    if (!deviceId) return [];
    try {
      const api = await this._api();
      const all = await api.flow.getFlowCardActions();
      const owner = `homey:device:${deviceId}`;
      return Object.values(all || {}).filter((a) => a && a.ownerUri === owner).map((a) => ({
        id: String(a.id).slice(owner.length + 1),
        title: typeof a.titleFormatted === 'string' && a.titleFormatted ? a.titleFormatted : (typeof a.title === 'string' ? a.title : ''),
        args: (a.args || []).filter((x) => x.type !== 'device').map((x) => ({
          name: x.name,
          type: x.type,
          title: typeof x.title === 'string' ? x.title : (x.title && (x.title.de || x.title.en)) || x.name,
          values: x.type === 'dropdown' && Array.isArray(x.values)
            ? x.values.map((v) => ({ id: String(v.id), title: typeof v.title === 'string' ? v.title : (v.title && (v.title.de || v.title.en)) || String(v.id) }))
            : undefined,
        })),
      }));
    } catch (err) {
      this.log(`[Inputs] Karten von ${deviceId} nicht lesbar: ${err && err.message}`);
      return [];
    }
  }

  /** Was das Vergleichs-EMS für die Batterie plant (nur zum Vergleich): { mode, reason } oder null. */
  async compareBatteryPlan(batteryDeviceId) {
    try {
      const r = await this.homey.api.getApiApp(COMPARE_APP).get('/ems/battery-price-plans');
      const plans = r && Array.isArray(r.plans) ? r.plans : [];
      const p = plans.find((x) => x.id === batteryDeviceId) || plans[0];
      return p ? { mode: p.mode, reason: p.reason } : null;
    } catch (err) {
      this.log(`[Inputs] Plan des Vergleichs-EMS nicht lesbar: ${err && err.message}`);
      return null;
    }
  }
}

module.exports = { Inputs };
