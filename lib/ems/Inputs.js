'use strict';

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
const DEVICE_CACHE_MS = 4000; // so lange gilt eine Geräteabfrage für weitere Lesungen im selben Takt

class Inputs {
  constructor(homey, log = () => {}) {
    this.homey = homey;
    this.log = log;
    this._apiPromise = null;
    this._devCache = new Map();
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
    const dev = await this._device(deviceId);
    if (!dev) throw new Error('Gerät nicht lesbar');
    const obj = dev.caps[capability];
    return obj ? num(obj.value) : null;
  }

  /** SoC (%) und Kapazität (kWh) der Batterie. */
  async battery(bcfg) {
    const out = { soc: null, capacityKwh: null, error: null };
    if (!bcfg.deviceId) {
      out.error = 'Batterie noch nicht gewählt'; return out;
    }
    const dev = await this._device(bcfg.deviceId);
    if (!dev) {
      out.error = 'Batterie nicht lesbar';
      return out;
    }
    const caps = dev.caps;
    out.soc = caps[bcfg.socCapability] ? num(caps[bcfg.socCapability].value) : null;
    out.capacityKwh = caps[bcfg.capacityCapability] ? num(caps[bcfg.capacityCapability].value) : null;
    return out;
  }

  /** Ein Gerät lesen -> { caps: capabilitiesObj, available } oder null. */
  async _device(id) {
    if (!id) return null;
    // Kurzer Zwischenspeicher: Ein Takt liest dasselbe Gerät oft mehrmals (z. B. die Wärmepumpe für SG-Ready und Warmwasser-Programm).
    // Jede Abfrage holt das ganze Gerät samt allen Capabilities, darum eine einzige Abfrage je Gerät und Takt (laufende Abfrage wird geteilt).
    const now = Date.now();
    const hit = this._devCache.get(id);
    if (hit && now - hit.at < DEVICE_CACHE_MS) return hit.p;
    const p = (async () => {
      try {
        const api = await this._api();
        const d = await api.devices.getDevice({ id });
        return { caps: d.capabilitiesObj || {}, available: d.available !== false };
      } catch (err) {
        this._devCache.delete(id);
        this.log(`[Inputs] Gerät ${id} nicht lesbar: ${err && err.message}`);
        return null;
      }
    })();
    this._devCache.set(id, { at: now, p });
    if (this._devCache.size > 64) {
      for (const [k, v] of this._devCache) if (now - v.at >= DEVICE_CACHE_MS) this._devCache.delete(k);
    }
    return p;
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

  /** Rohwert einer beliebigen Capability lesen (z. B. eine boolesche Ferienmodus-Capability), oder null. */
  async readValue(deviceId, capability) {
    const dev = await this._device(deviceId);
    if (!dev || !dev.available) return null;
    const o = dev.caps[capability];
    return o && o.value !== undefined ? o.value : null;
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
        // aktuelle Werte als Hilfe in den Einstellungen (nur Zahlen, Ja/Nein und kurze Texte) samt Einheit
        values: Object.fromEntries(d.capabilities.map((c) => {
          const o = d.capabilitiesObj && d.capabilitiesObj[c];
          const v = o ? o.value : undefined;
          const ok = (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean';
          return [c, ok ? v : (typeof v === 'string' ? v.slice(0, 40) : null)];
        })),
        units: Object.fromEntries(d.capabilities.map((c) => {
          const o = d.capabilitiesObj && d.capabilitiesObj[c];
          return [c, o && typeof o.units === 'string' ? o.units : (o && o.units && (o.units.de || o.units.en)) || ''];
        })),
        available: d.available !== false,
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
   * Fehlende Werte sind null.
   */
  async chargerInputs(cfg) {
    const val = (dev, cap) => {
      const o = dev && dev.caps[cap];
      return o ? num(o.value) : null;
    };
    const fuse = cfg.fuse && cfg.fuse.enabled ? cfg.fuse : null;
    const fuseOwn = fuse && fuse.meterId && fuse.meterId !== cfg.devices.meter.id;
    const [meter, house, inverter, battery, charger, car, fuseMeter] = await Promise.all([
      this._device(cfg.devices.meter.id),
      cfg.devices.house.id === cfg.devices.meter.id ? Promise.resolve(null) : this._device(cfg.devices.house.id),
      this._device(cfg.devices.inverter.id),
      this._device(cfg.battery.deviceId),
      this._device(cfg.charger.id),
      cfg.car && cfg.car.deviceId ? this._device(cfg.car.deviceId) : Promise.resolve(null),
      fuseOwn ? this._device(fuse.meterId) : Promise.resolve(null),
    ]);
    const phaseDev = fuseOwn ? fuseMeter : meter;
    const houseDev = cfg.devices.house.id === cfg.devices.meter.id ? meter : house;
    const state = charger && charger.caps[cfg.charger.stateCapability] ? charger.caps[cfg.charger.stateCapability].value : null;
    const DISCONNECTED = new Set(['standby', 'plugged_out', 'unplugged', 'available', 'idle', null, undefined, false]);
    const phaseRaw = charger && charger.caps[cfg.charger.phaseCapability] ? String(charger.caps[cfg.charger.phaseCapability].value) : null;
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
      // Hausanschluss-Schutz: Ströme der drei Phasen (A), null ohne Schutz
      phaseA: fuse ? fuse.caps.map((c) => val(phaseDev, c)) : null,
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

  /** Alle Geräte (id -> Name, Capabilities) und alle Flow-IDs, um gelöschte Verweise der Konfiguration zu finden. */
  async refWorld() {
    const api = await this._api();
    const all = await api.devices.getDevices();
    const devices = new Map();
    for (const d of Object.values(all || {})) {
      if (d && d.id) devices.set(d.id, { name: String(d.name || ''), caps: Array.isArray(d.capabilities) ? d.capabilities : [] });
    }
    const { standard, advanced } = await this.rawFlows();
    const flowIds = new Set([...Object.values(standard || {}), ...Object.values(advanced || {})].filter((f) => f && f.id).map((f) => f.id));
    return { devices, flowIds };
  }

  /** Rohe Flow-Listen (Standard und erweitert) zum Prüfen, welche Befehle der App ein Flow aufgreift. */
  async rawFlows() {
    const api = await this._api();
    const standard = await api.flow.getFlows();
    let advanced = {};
    try {
      advanced = await api.flow.getAdvancedFlows();
    } catch (err) {
      this.log(`[Inputs] erweiterte Flows nicht lesbar: ${err && err.message}`);
    }
    return { standard, advanced };
  }

}

module.exports = { Inputs };
