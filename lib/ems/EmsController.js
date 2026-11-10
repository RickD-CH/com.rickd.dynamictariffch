'use strict';

const { normalizeConfig, applyToggle } = require('./Config');
const { PriceFeed } = require('./PriceFeed');
const { PvFeed } = require('./PvFeed');
const { Inputs } = require('./Inputs');
const { ShadowLog } = require('./ShadowLog');
const { EmsRunner } = require('./EmsRunner');
const { Actuators } = require('./Actuators');
const { buildDeviceState } = require('./DeviceState');
const { PlanLog } = require('./PlanLog');
const { buildPlan } = require('./PlanView');
const { planJob } = require('./planner/jobs');
const { parseHHMM, fromLocal, localParts, addLocalDays } = require('../time');
const { DEFAULTS: BATTERY_DEFAULTS } = require('./planner/battery');

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
      priceRp: this.runner && this.runner.current ? this.runner.current.price : null,
      forecast: this._forecast(),
    });
    Promise.resolve(this.emsDevice.publish(state))
      .catch((err) => this.app.error('EMS-Gerät:', err && err.message));
  }

  /** PV-Prognose für die Kachel (null-Werte, wenn keine frische Prognose da ist). */
  _forecast() {
    if (!this.runner || !this.runner.pv) return null;
    const now = Date.now();
    const tz = this.homey.clock.getTimezone();
    const pv = this.runner.pv;
    return { todayKwh: pv.remainingTodayKwh(now, tz), tomorrowKwh: pv.tomorrowKwh(now, tz), nowKw: pv.nowKw(now) };
  }

  /** PV-Prognose von aussen einliefern (Flow-Aktion). */
  setPvForecast(input) {
    if (!this.runner) throw new Error('EMS nicht gestartet');
    this.runner.pv.configure({ factor: this.getConfig().pv.factor, useFallback: !!this.getConfig().devices.andiEms });
    const r = this.runner.pv.setExternal(input);
    this.app.log(`EMS: PV-Prognose eingeliefert (${r.count} Einträge${r.skipped ? `, ${r.skipped} übersprungen` : ''})`);
    this._publish();
    return r;
  }

  /** Korrekturfaktor auf die PV-Prognose (Flow-Aktion oder Einstellungen). */
  setPvFactor(factor) {
    const f = Number(factor);
    if (!Number.isFinite(f) || f <= 0) throw new Error('Faktor muss grösser als 0 sein');
    this.putConfig({ pv: { factor: f } });
    if (this.runner) this.runner.pv.configure({ factor: this.getConfig().pv.factor, useFallback: !!this.getConfig().devices.andiEms });
    return this.getConfig().pv.factor;
  }

  _onConsumerEvent(e) {
    if (!this.emsDevice) return;
    try { this.emsDevice.fireConsumerSwitched(e); } catch (err) { this.app.error('EMS-Auslöser:', err && err.message); }
  }

  // ------------------------------------------------------------ Konfiguration

  putConfig(body) {
    const stored = this.homey.settings.get(SETTINGS_PREFIX + 'config') || {};
    const merged = { ...stored, ...(body || {}) };
    for (const k of ['battery', 'charger', 'devices', 'share', 'forecastGate', 'pv']) {
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
    this.planLog = new PlanLog(store);
    this.runner = new EmsRunner({
      planLog: this.planLog,
      getConfig: () => this.getConfig(),
      prices: new PriceFeed(() => this._device(), (m) => this.app.log(m)),
      pv: new PvFeed(this.homey, (m) => this.app.log(m), null, store),
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
    if (this.planLog) this.planLog.flush();
  }

  /** Plan-Sicht: Preise, PV-Prognose, Batterie-Plan und Verlauf von Wallbox und Verbrauchern (heute, morgen wenn Preise da sind). */
  getPlan(jobs = []) {
    const cfg = this.getConfig();
    const nowMs = Date.now();
    const tz = this.homey.clock.getTimezone();
    if (!this.runner) return { nowMs, days: [], active: false };
    const from = nowMs - 26 * 3600 * 1000;
    const to = nowMs + 50 * 3600 * 1000;
    const hasBattery = !!cfg.battery.deviceId;
    const mine = this.runner.current && this.runner.current.mine ? this.runner.current.mine : null;
    const pv = this.runner.pv;
    const plan = buildPlan({
      nowMs, tz,
      priceSlots: this.runner.prices.range(from, to),
      pvSlots: pv && !pv.isStale(nowMs) ? pv.slots : null,
      batteryPlan: hasBattery ? mine : null,
      reserveHours: cfg.battery.reserveHours !== undefined ? cfg.battery.reserveHours : BATTERY_DEFAULTS.reserveHours,
      log: this.planLog ? this.planLog.since(from) : [],
      chargerEnabled: !!(cfg.charger.enabled && cfg.charger.id),
      consumers: cfg.consumers.filter((c) => c.enabled && c.id).map((c) => ({ id: c.id, name: c.name })),
      hasBattery, jobs,
    });
    return { ...plan, active: this.isActive(), dryRun: { charger: cfg.charger.live !== true, consumers: cfg.consumers.filter((c) => c.live !== true).map((c) => c.id) } };
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
    const base = { enabled: cfg.enabled, deviceExists: this.hasDevice(), priceDevice: !!this._device(), shadow: true, config: cfg };
    if (!this.runner) return base;
    return {
      ...base,
      current: this.runner.current,
      pv: this.runner.pv.info(),
      lastTickAt: this.runner.lastTickAt,
      ...this.shadowLog.summary(),
      charger: { current: this.runner.chargerCurrent, ...this.chargerLog.summary() },
    };
  }

  /**
   * Vorschau: was würde der Planer für diese Aufträge wählen? Nichts wird gespeichert oder geschaltet.
   * Auftrag: { id, kind: 'charger'|'consumer', time: 'HH:MM' (nächstes Mal), amount (kWh Wallbox, Stunden Verbraucher),
   *            powerKw?, maxPrice? (Rp./kWh), contiguous? }
   */
  previewPlan(body) {
    const cfg = this.getConfig();
    const nowMs = Date.now();
    const tz = this.homey.clock.getTimezone();
    if (!this.runner) throw new Error('EMS nicht gestartet');
    const list = Array.isArray(body && body.jobs) ? body.jobs.slice(0, 4) : [];
    const slots = this.runner.prices.range(nowMs - 3600 * 1000, nowMs + 50 * 3600 * 1000);
    const chargerKw = Math.max(1.4, Math.round(cfg.charger.maxAmps * cfg.charger.phases * 0.23 * 10) / 10);
    const results = [];
    for (const j of list) {
      const amount = Number(j.amount);
      const kind = j.kind === 'charger' ? 'charger' : 'consumer';
      const base = { id: String(j.id || kind), kind };
      let name = null;
      if (kind === 'consumer') {
        const c = cfg.consumers.find((x) => x.id === j.id);
        name = c ? c.name : (j.name || null);
      }
      if (!Number.isFinite(amount) || amount <= 0) { results.push({ ...base, name, error: 'amount' }); continue; }
      let deadline;
      try {
        const t = parseHHMM(j.time);
        const today = localParts(new Date(nowMs), tz);
        deadline = fromLocal(today.year, today.month, today.day, t.hour, t.minute, tz).getTime();
        if (deadline <= nowMs) {
          const next = localParts(addLocalDays(new Date(nowMs), 1, tz), tz);
          deadline = fromLocal(next.year, next.month, next.day, t.hour, t.minute, tz).getTime();
        }
      } catch (err) { results.push({ ...base, name, error: 'time' }); continue; }
      const powerKw = Number(j.powerKw) > 0 ? Number(j.powerKw) : (kind === 'charger' ? chargerKw : null);
      const hours = kind === 'charger' ? amount / powerKw : amount;
      const maxPrice = j.maxPrice === '' || j.maxPrice === null || j.maxPrice === undefined || !Number.isFinite(Number(j.maxPrice)) ? null : Number(j.maxPrice);
      const r = planJob({ slots, nowMs, deadlineMs: deadline, hours, maxPrice, contiguous: kind === 'consumer' ? j.contiguous !== false : false });
      const energyKwh = kind === 'charger' ? amount : (powerKw ? powerKw * amount : null);
      const costChf = r.avg !== null && energyKwh !== null ? Math.round(((r.starts.length / Math.max(1, r.need)) * energyKwh * r.avg) ) / 100 : null;
      results.push({ ...base, name, deadline, powerKw, hours: Math.round(hours * 100) / 100, maxPrice, energyKwh, costChf, ...r });
    }
    const jobs = results.filter((x) => !x.error).map((x) => ({ id: x.id, name: x.name, starts: x.starts }));
    return { ...this.getPlan(jobs), jobResults: results };
  }

  /** Alle Geräte mit ihren Capabilities für die Auswahl in den Einstellungen. */
  async listDevices() {
    const inputs = new Inputs(this.homey, (m) => this.app.log(m));
    return inputs.listDevices();
  }
}

module.exports = { EmsController };
