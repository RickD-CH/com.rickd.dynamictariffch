'use strict';

const { normalizeConfig, applyToggle } = require('./Config');
const { priceDays } = require('./planner/dhw');
const { PriceFeed } = require('./PriceFeed');
const { PvFeed } = require('./PvFeed');
const { Inputs } = require('./Inputs');
const { ShadowLog } = require('./ShadowLog');
const { EmsRunner } = require('./EmsRunner');
const { Actuators } = require('./Actuators');
const { buildDeviceState } = require('./DeviceState');
const { PlanLog } = require('./PlanLog');
const { buildPlan } = require('./PlanView');
const {
  planJob, stepJob, nextDeadline, REPEATS,
} = require('./planner/jobs');
const { JobStore } = require('./JobStore');
const { limitA } = require('./planner/fuse');
const { localParts, addLocalDays } = require('../time');
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
    return normalizeConfig(this.homey.settings.get(`${SETTINGS_PREFIX}config`));
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
      backupReserve: cfg.battery.backupReserve.active,
      priceRp: this.runner && this.runner.current ? this.runner.current.price : null,
      forecast: this._forecast(),
    });
    Promise.resolve(this.emsDevice.publish(state))
      .catch((err) => this.app.error('EMS-Gerät:', err && err.message));
    this._fireEvents();
  }

  /** Neue Probleme und «Ziel erreicht» als Flow-Auslöser (je Ereignis einmal). */
  _fireEvents() {
    if (!this.emsDevice || !this.runner) return;
    const r = this.runner;
    const now = [];
    const ch = r.chargerCurrent && r.chargerCurrent.mine;
    // «Geräte noch nicht gewählt» ist Einrichtung, kein Fehler; Zusätze (« - nach 60 s ...») ergeben kein neues Problem
    if (ch && ch.mode === 'error' && !/nicht gewählt/.test(ch.reason || '')) now.push(['charger', String(ch.reason || '').split(' - ')[0]]);
    if (r.batteryControl && r.batteryControl.error) now.push(['battery', r.batteryControl.error]);
    for (const e of (r.current && r.current.errors) || []) now.push(['data', e]);
    const keys = new Set(now.map(([a, m]) => `${a}|${m}`));
    for (const [a, m] of now) {
      if (!this._errorKeys || !this._errorKeys.has(`${a}|${m}`)) {
        try {
          this.emsDevice.fireError(a, m);
        } catch (err) {
          this.app.error('EMS-Fehler-Auslöser:', err && err.message);
        }
      }
    }
    this._errorKeys = keys;
    const car = r.carCurrent;
    const reached = !!(car && car.state === 'reached');
    if (reached && this._carReached === false && car.departure) {
      try {
        this.emsDevice.fireCarTargetReached(car.soc, car.departure.soc);
      } catch (err) {
        this.app.error('EMS-Auto-Auslöser:', err && err.message);
      }
    }
    this._carReached = car ? reached : this._carReached;
    // SG-Ready und Warmwasser-Programm: nur echte Wechsel (nicht der erste beobachtete Zustand und nicht beim Ein-/Ausschalten des Moduls)
    const sgState = r.sgReadyCurrent ? ({ off: 'normal', boost: 'boost', forced: 'forced' })[r.sgReadyCurrent.state] || null : null;
    if (sgState && this._sgLast && sgState !== this._sgLast && typeof this.emsDevice.fireSgReady === 'function') {
      try {
        this.emsDevice.fireSgReady(sgState, r.sgReadyCurrent.reason);
      } catch (err) {
        this.app.error('EMS-SG-Ready-Auslöser:', err && err.message);
      }
    }
    this._sgLast = sgState;
    const dhwOn = r.dhwCurrent ? r.dhwCurrent.on === true : null;
    if (dhwOn !== null && this._dhwLast !== null && this._dhwLast !== undefined && dhwOn !== this._dhwLast && typeof this.emsDevice.fireDhw === 'function') {
      try {
        this.emsDevice.fireDhw(dhwOn, r.dhwCurrent.reason);
      } catch (err) {
        this.app.error('EMS-Warmwasser-Auslöser:', err && err.message);
      }
    }
    this._dhwLast = dhwOn;
    const fe = r.fuseEvents || [];
    const lastTs = this._fuseSeenTs === undefined ? (fe.length ? fe[fe.length - 1].ts : 0) : this._fuseSeenTs;
    for (const e of fe) {
      if (e.ts <= lastTs || !['over', 'shed', 'throttle'].includes(e.action)) continue;
      const text = e.action === 'over' ? 'Grenze überschritten' : (e.action === 'shed' ? `${e.name} ausgeschaltet` : `Wallbox auf ${e.capAmps} A gedrosselt`);
      try {
        if (typeof this.emsDevice.fireFuse === 'function') this.emsDevice.fireFuse(e.maxA, e.phase, text, e.live);
      } catch (err) {
        this.app.error('EMS-Hausanschluss-Auslöser:', err && err.message);
      }
    }
    this._fuseSeenTs = fe.length ? fe[fe.length - 1].ts : lastTs;
  }

  /**
   * EMS-Protokolle und Auswertungen löschen (Go-live): Vergleich (Batterie und Wallbox), Franken-Auswertung, Protokoll
   * (Verbraucher, Batterie, Hausanschluss) und Plan-Verlauf. Gelernter Hausverbrauch, Einstellungen und Aufträge bleiben.
   */
  resetData() {
    if (this.shadowLog) this.shadowLog.reset();
    if (this.chargerLog) this.chargerLog.reset();
    if (this.planLog) this.planLog.reset();
    const r = this.runner;
    if (r) {
      if (r.ledger) r.ledger.reset();
      r.consumerEvents = []; r.batteryEvents = []; r.fuseEvents = [];
      r._save('consumerEvents', []); r._save('batteryEvents', []); r._save('fuseEvents', []);
    }
    this.app.log('EMS: Protokolle und Auswertungen gelöscht');
    return { ok: true };
  }

  /** Silent-Modus per Flow. */
  setSilent(on) {
    return this.putConfig({ silent: on === true });
  }

  /** Ziel des E-Autos für heute oder morgen (übersteuert die Wochenvorlage) oder wieder die Vorlage. */
  setCarTarget({
    day = 'tomorrow', soc = 80, time = '06:00', charge = true,
  } = {}) {
    const cfg = this.getConfig();
    if (!cfg.car.deviceId) throw new Error('Kein E-Auto eingerichtet');
    const tz = this.homey.clock.getTimezone();
    const lp = localParts(addLocalDays(new Date(), day === 'today' ? 0 : 1, tz), tz);
    const date = `${lp.year}-${String(lp.month).padStart(2, '0')}-${String(lp.day).padStart(2, '0')}`;
    const schedule = {
      ...cfg.car.schedule,
      override: {
        date, on: charge !== false, time: String(time || '06:00'), soc: Number(soc) || 80,
      },
    };
    return this.putConfig({ car: { ...cfg.car, schedule } });
  }

  clearCarTarget() {
    const cfg = this.getConfig();
    return this.putConfig({ car: { ...cfg.car, schedule: { ...cfg.car.schedule, override: null } } });
  }

  /** PV-Prognose für die Kachel (null-Werte, wenn keine frische Prognose da ist). */
  _forecast() {
    if (!this.runner || !this.runner.pv) return null;
    const now = Date.now();
    const tz = this.homey.clock.getTimezone();
    const { pv } = this.runner;
    return { todayKwh: pv.remainingTodayKwh(now, tz), tomorrowKwh: pv.tomorrowKwh(now, tz), nowKw: pv.nowKw(now) };
  }

  /** PV-Prognose von aussen einliefern (Flow-Aktion). */
  setPvForecast(input) {
    if (!this.runner) throw new Error('EMS nicht gestartet');
    this.runner.pv.configure({ factor: this.getConfig().pv.factor, useFallback: !!(this.getConfig().compare && this.getConfig().devices.compareEms) });
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
    if (this.runner) this.runner.pv.configure({ factor: this.getConfig().pv.factor, useFallback: !!(this.getConfig().compare && this.getConfig().devices.compareEms) });
    return this.getConfig().pv.factor;
  }

  _onConsumerEvent(e) {
    if (!this.emsDevice) return;
    try {
      this.emsDevice.fireConsumerSwitched(e);
    } catch (err) {
      this.app.error('EMS-Auslöser:', err && err.message);
    }
  }

  // ------------------------------------------------------------ Konfiguration

  putConfig(body) {
    const stored = this.homey.settings.get(`${SETTINGS_PREFIX}config`) || {};
    if (body && body.enabled === false && stored.enabled === true && this.runner && typeof this.runner.releaseBattery === 'function') {
      this.runner.releaseBattery(normalizeConfig(stored)).catch((err) => this.app.error('EMS: Batterie-Freigabe:', err && err.message));
    }
    const merged = { ...stored, ...(body || {}) };
    for (const k of ['battery', 'charger', 'devices', 'share', 'forecastGate', 'pv', 'car', 'fuse', 'sgready', 'dhw']) {
      merged[k] = { ...(stored[k] || {}), ...((body || {})[k] || {}) };
    }
    if (body && body.battery && body.battery.control) merged.battery.control = { ...((stored.battery || {}).control || {}), ...body.battery.control };
    if (body && body.battery && body.battery.backupReserve) merged.battery.backupReserve = { ...((stored.battery || {}).backupReserve || {}), ...body.battery.backupReserve };
    if (body && Array.isArray(body.consumers)) merged.consumers = body.consumers;
    const cfg = normalizeConfig(merged);
    this.homey.settings.set(`${SETTINGS_PREFIX}config`, cfg);
    this._reschedule();
    this._publish();
    return cfg;
  }

  /** EMS ein/aus (Schalter am Gerät oder in den Einstellungen). */
  setEnabled(on) {
    // Beim Ausschalten gibt putConfig die Batterie frei, falls die App sie zuletzt auf Laden oder Halten gestellt hat.
    return this.putConfig({ enabled: on === true });
  }

  /** Karten des Batterie-Geräts und erkannte Vorlage (für die Einrichtung). */
  async batteryCards() {
    const { detectPreset } = require('./planner/batteryControl'); // eslint-disable-line global-require
    const id = this.getConfig().battery.deviceId;
    const inputs = new Inputs(this.homey, (m) => this.app.log(m));
    const cards = await inputs.deviceActions(id);
    return { deviceId: id, preset: detectPreset(cards.map((c) => c.id)), cards };
  }

  /** Steuerung eines Bereichs ein/aus (Schalter in den Einstellungen). */
  setLive(target, on) {
    const stored = this.homey.settings.get(`${SETTINGS_PREFIX}config`) || {};
    const cfg = applyToggle(stored, target, on);
    if (!cfg) throw new Error(`Unbekanntes Ziel: ${target}`);
    this.homey.settings.set(`${SETTINGS_PREFIX}config`, cfg);
    this.app.log(`EMS: ${target} -> ${on ? 'Befehle senden' : 'nur Trockenlauf'}`);
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

  /**
   * «Programm starten»-Verbraucher (z. B. Geschirrspüler) sofort auslösen (Widget/Flow). Überspringt PV-/Preis-
   * Logik und die Einmal-pro-Tag-Grenze, respektiert aber weiterhin Fernbedienung/Tür/Status am Gerät.
   */
  async startProgramNow(consumerId) {
    if (!this.runner) throw new Error('EMS nicht gestartet');
    const cfg = this.getConfig();
    const c = cfg.consumers.find((x) => x.id === consumerId && x.mode === 'program' && x.enabled);
    if (!c) throw new Error('Verbraucher nicht gefunden oder kein Programm-Typ');
    await this.runner.forceProgramStart(consumerId);
    await this.runner.tickCharger();
    this._publish();
    return true;
  }

  /**
   * Automatik für einen «Programm starten»-Verbraucher bewusst ein- oder ausschalten (Widget/Flow). Siehe
   * decideProgram/planner/program.js: Fernbedienung an heisst nur «bereit», nicht «darf automatisch starten» -
   * das muss hier zusätzlich und bewusst eingeschaltet werden, jeden Tag neu.
   */
  async setProgramArmed(consumerId, on) {
    if (!this.runner) throw new Error('EMS nicht gestartet');
    const cfg = this.getConfig();
    const c = cfg.consumers.find((x) => x.id === consumerId && x.mode === 'program' && x.enabled);
    if (!c) throw new Error('Verbraucher nicht gefunden oder kein Programm-Typ');
    this.runner.setProgramArmed(consumerId, on === true);
    await this.runner.tickCharger();
    this._publish();
    return true;
  }

  /** SG-Ready bzw. Warmwasser-Programm pausieren (Widget): ein laufender Lauf endet sofort, neue Starts sind gesperrt. */
  async setModulePaused(which, paused) {
    if (!this.runner) throw new Error('EMS nicht gestartet');
    // Einschalten im Widget: ein noch ausgeschaltetes (aber eingerichtetes) Modul wird dabei aktiviert
    if (paused !== true) this.putConfig({ [which]: { enabled: true } });
    this.runner.setPaused(which, paused === true);
    await this.runner.tickCharger();
    this._publish();
    return true;
  }

  /**
   * Notstrom-Reserve ein/aus (Schalter am Gerät oder Flow, nie automatisch): hält mindestens die eingestellte
   * Reserve, lädt dafür notfalls sofort aus dem Netz nach, egal zu welchem Preis. Überstimmt die übrige
   * Batterie-Planung, solange sie an ist. Der eingestellte Prozentsatz bleibt unabhängig davon erhalten.
   */
  async setBackupReserve(on) {
    this.putConfig({ battery: { backupReserve: { active: on === true } } });
    if (this.runner && this.isActive()) {
      this.runner.tick().then(() => this._publish())
        .catch((err) => this.app.error('EMS-Notstrom-Reserve:', err && err.message));
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
    this.jobStore = new JobStore(store);
    this.runner = new EmsRunner({
      planLog: this.planLog,
      jobs: this.jobStore,
      getConfig: () => this.getConfig(),
      prices: new PriceFeed(() => this._device(), (m) => this.app.log(m)),
      pv: new PvFeed(this.homey, (m) => this.app.log(m), null, store),
      inputs: new Inputs(this.homey, (m) => this.app.log(m)),
      actuators: new Actuators(this.homey, (m) => this.app.log(m)),
      store,
      shadowLog: this.shadowLog,
      chargerLog: this.chargerLog,
      onConsumerEvent: (e) => this._onConsumerEvent(e),
      // Einspeisepreis (Rp./kWh) der Viertelstunde, wie im Kostenvergleich
      feedInAt: (ms) => {
        try {
          const dev = this._device();
          if (!dev || typeof dev._costPricesAt !== 'function') return 0;
          const q = Math.floor(ms / 900000) * 900000;
          const r = dev._costPricesAt(new Date(q));
          return r && Number.isFinite(r.feedIn) ? r.feedIn : 0;
        } catch (err) {
          return 0;
        }
      },
      onChargeNowOff: (reason = 'Auto abgesteckt') => {
        this.app.log(`EMS: ${reason} - Sofortladen aus`);
        this.putConfig({ charger: { chargeNow: false } });
      },
      tz,
      log: (m) => this.app.log(m),
    });
    // Ein Gerät kann schon initialisiert sein, bevor das EMS bereit war.
    if (!this.emsDevice) {
      try {
        this.emsDevice = this.homey.drivers.getDriver('ems').getDevices()[0] || null;
      } catch (err) { /* noch kein Treiber */ }
    }
    this.app.log(`EMS-Modul bereit (${this.hasDevice() ? (this.getConfig().enabled ? 'aktiv, Schattenmodus' : 'Gerät da, ausgeschaltet') : 'kein Gerät, inaktiv'})`);
    this._reschedule();
    this._publish();
  }

  stop() {
    this._stopped = true;
    this._clearTimers();
    this._stopFuseWatch();
    if (this.planLog) this.planLog.flush();
    if (this.shadowLog) this.shadowLog.flush();
    if (this.chargerLog) this.chargerLog.flush();
    if (this.runner && this.runner.loadProfile) this.runner.loadProfile.flush();
    if (this.runner && this.runner.ledger) this.runner.ledger.flush();
  }

  /** Plan-Sicht: Preise, PV-Prognose, Batterie-Plan und Verlauf von Wallbox und Verbrauchern (heute, morgen wenn Preise da sind). */
  getPlan(previewJobs = []) {
    const cfg = this.getConfig();
    const nowMs = Date.now();
    const tz = this.homey.clock.getTimezone();
    if (!this.runner) return { nowMs, days: [], active: false };
    const from = nowMs - 26 * 3600 * 1000;
    const to = nowMs + 50 * 3600 * 1000;
    const hasBattery = !!cfg.battery.deviceId;
    const mine = this.runner.current && this.runner.current.mine ? this.runner.current.mine : null;
    const { pv } = this.runner;
    const plan = buildPlan({
      nowMs,
      tz,
      priceSlots: this.runner.prices.range(from, to),
      pvSlots: pv && !pv.isStale(nowMs) ? pv.slots : null,
      batteryPlan: hasBattery ? mine : null,
      reserveHours: cfg.battery.reserveHours !== undefined ? cfg.battery.reserveHours : BATTERY_DEFAULTS.reserveHours,
      log: this.planLog ? this.planLog.since(from) : [],
      chargerEnabled: !!(cfg.charger.enabled && cfg.charger.id),
      consumers: cfg.consumers.filter((c) => c.enabled && c.id).map((c) => ({ id: c.id, name: c.name })),
      hasBattery,
      jobs: [...this._carRow(), ...this._activeJobRows(nowMs), ...previewJobs.map((j) => ({ ...j, preview: true }))],
    });
    return {
      ...plan,
      active: this.isActive(),
      dryRun: {
        silent: cfg.silent === true, charger: cfg.silent === true || cfg.charger.live !== true, battery: cfg.silent === true || cfg.battery.control.live !== true, consumers: cfg.consumers.filter((c) => cfg.silent === true || c.live !== true).map((c) => c.id),
      },
    };
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
    this._startFuseWatch();
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

  /** Wallbox-Lauf: Wartezeit kommt aus dem Lauf selbst (automatisch 15 s mit Auto, 30 s mit Verbrauchern, sonst 5 min; oder fest laut Einstellung). */
  _scheduleCharger(delayMs) {
    if (this._stopped) return;
    this._chargerTimer = this.homey.setTimeout(async () => {
      this._chargerTimer = null;
      let next = 5 * 60 * 1000;
      this._chargerRunning = true;
      try {
        next = await this.runner.tickCharger();
        this._publish();
      } catch (err) {
        this.app.error('EMS-Wallbox-Lauf fehlgeschlagen:', err && err.message);
      }
      this._chargerRunning = false;
      if (this._kickPending) {
        this._kickPending = false; next = 0; this.runner._snapshot = null;
      }
      if (this.isActive() && !this._chargerTimer) this._scheduleCharger(next);
    }, delayMs);
  }

  /** Hausanschluss: sofort neu rechnen (Echtzeit-Meldung einer hohen Phase), höchstens alle 3 s. */
  _fuseKick() {
    if (this._stopped || !this.runner || !this.isActive()) return;
    const now = Date.now();
    if (this._lastKick && now - this._lastKick < 3000) return;
    this._lastKick = now;
    if (this._chargerRunning) {
      this._kickPending = true; return;
    }
    if (this._chargerTimer) this.homey.clearTimeout(this._chargerTimer);
    this._chargerTimer = null;
    this.runner._snapshot = null;
    this._scheduleCharger(0);
  }

  /** Phasenströme des Zählers in Echtzeit beobachten: nähert sich eine Phase der Grenze, wird sofort gerechnet. */
  _startFuseWatch() {
    this._stopFuseWatch();
    const cfg = this.getConfig();
    const f = cfg.fuse;
    if (!this.runner || !this.isActive() || !f.enabled || typeof this.runner.inputs.watch !== 'function') return;
    const meterId = f.meterId || cfg.devices.meter.id;
    if (!meterId) return;
    const limit = limitA(f);
    const gen = (this._fuseGen || 0) + 1;
    this._fuseGen = gen;
    this._fuseWatch = {
      active: false, since: Date.now(), count: 0, lastAt: null, error: null,
    };
    this.runner.inputs.watch(meterId, f.caps, (cap, v) => {
      this._fuseWatch.count += 1;
      this._fuseWatch.lastAt = Date.now();
      if (Number(v) > limit - 1) this._fuseKick();
    }).then((off) => {
      if (this._fuseGen !== gen) off();
      else {
        this._fuseUnwatch = off; this._fuseWatch.active = true;
      }
    }).catch((err) => {
      this._fuseWatch.error = err && err.message ? err.message : String(err);
      this.app.error('EMS: Hausanschluss-Beobachtung:', this._fuseWatch.error);
    });
  }

  _stopFuseWatch() {
    this._fuseGen = (this._fuseGen || 0) + 1;
    if (this._fuseUnwatch) {
      try {
        this._fuseUnwatch();
      } catch (err) { /* schon weg */ }
    }
    this._fuseUnwatch = null;
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
    const base = {
      enabled: cfg.enabled, deviceExists: this.hasDevice(), priceDevice: !!this._device(), shadow: true, config: cfg,
    };
    if (!this.runner) return base;
    return {
      ...base,
      current: this.runner.current,
      pv: this.runner.pv.info(),
      lastTickAt: this.runner.lastTickAt,
      ...this.shadowLog.summary(),
      charger: { current: this.runner.chargerCurrent, ...this.chargerLog.summary() },
      batteryControl: this.runner.batteryControl,
      car: this.runner.carCurrent || null,
      fuse: this.runner.fuseCurrent ? { ...this.runner.fuseCurrent, watch: this._fuseWatch || null } : null,
      sgready: this.runner.sgReadyCurrent || null,
      dhw: this.runner.dhwCurrent || null,
      dhwPrices: priceDays(this.runner.dayPrices(Date.now()), Date.now(), this.runner.tz),
      load: this.runner.loadProfile ? this.runner.loadProfile.info() : null,
      ledger: this.runner.ledger ? this.runner.ledger.summary() : null,
    };
  }

  /**
   * Auftrag aus der Eingabe berechnen: Frist (nächstes Mal HH:MM), Dauer, Auswahl der Viertelstunden.
   * Eingabe: { id, kind: 'charger'|'consumer', time: 'HH:MM', amount (kWh Wallbox, Stunden Verbraucher), powerKw?, maxPrice?, contiguous? }
   * @returns {{ error?: 'amount'|'time'|'device', result?: object, job?: object, name: string|null, id: string, kind: string }}
   */
  _resolveJob(j, cfg, nowMs, tz, slots) {
    const chargerKw = Math.max(1.4, Math.round(cfg.charger.maxAmps * cfg.charger.phases * 0.23 * 10) / 10);
    const amount = Number(j.amount);
    const kind = j.kind === 'charger' ? 'charger' : 'consumer';
    const base = { id: String(j.id || kind), kind, name: null };
    if (kind === 'consumer') {
      const c = cfg.consumers.find((x) => x.id === j.id && x.enabled);
      if (!c) return { ...base, error: 'device' };
      base.name = c.name;
    } else if (!cfg.charger.id) {
      return { ...base, id: 'charger', error: 'device' };
    } else {
      base.id = 'charger';
    }
    // Wallbox: Ziel-Ladestand statt kWh (braucht den Ladestand und die Batteriegrösse des Autos)
    let amountKwh = amount;
    let soc = null;
    const target = Number(j.targetSoc);
    if (kind === 'charger' && Number.isFinite(target) && target > 0) {
      const cur = this.runner && this.runner.chargerCurrent ? this.runner.chargerCurrent.carSoc : null;
      if (!cfg.car.deviceId || cur === null || cur === undefined) return { ...base, error: 'carsoc' };
      if (!(cfg.car.capacityKwh > 0)) return { ...base, error: 'carcap' };
      soc = cur;
      amountKwh = Math.max(0, ((Math.min(100, target) - cur) / 100) * cfg.car.capacityKwh);
      if (amountKwh === 0) {
        return {
          ...base, error: 'reached', carSoc: cur, targetSoc: target,
        };
      }
    }
    if (!Number.isFinite(amountKwh) || amountKwh <= 0) return { ...base, error: 'amount' };
    const repeat = Object.prototype.hasOwnProperty.call(REPEATS, j.repeat) ? j.repeat : 'once';
    // Ein Ziel-Ladestand gilt für einen Ladevorgang; jede Woche gleich = Wochenvorlage des E-Autos
    if (repeat !== 'once' && soc !== null) return { ...base, error: 'repeatsoc' };
    const deadline = nextDeadline({
      time: j.time, repeat, afterMs: nowMs, tz,
    });
    if (!deadline) return { ...base, error: 'time' };
    // Wiederkehrend: höchstens in den 24 Stunden vor der Frist
    const notBefore = repeat === 'once' ? null : Math.max(nowMs, deadline - 24 * 3600 * 1000);
    const powerKw = Number(j.powerKw) > 0 ? Number(j.powerKw) : (kind === 'charger' ? chargerKw : null);
    const hours = kind === 'charger' ? amountKwh / powerKw : amount;
    const maxPrice = j.maxPrice === '' || j.maxPrice === null || j.maxPrice === undefined || !Number.isFinite(Number(j.maxPrice)) ? null : Number(j.maxPrice);
    const contiguous = kind === 'consumer' ? j.contiguous !== false : false;
    const result = planJob({
      slots, nowMs: notBefore || nowMs, deadlineMs: deadline, hours, maxPrice, contiguous,
    });
    const energyKwh = kind === 'charger' ? amountKwh : (powerKw ? powerKw * amount : null);
    const costChf = result.avg !== null && energyKwh !== null ? Math.round((result.starts.length / Math.max(1, result.need)) * energyKwh * result.avg) / 100 : null;
    const job = {
      id: base.id,
      kind,
      time: String(j.time),
      amount: Math.round(amountKwh * 10) / 10,
      targetSoc: soc !== null ? target : null,
      startSoc: soc,
      powerKw: Number(j.powerKw) > 0 ? Number(j.powerKw) : null,
      maxPrice,
      contiguous,
      deadline,
      repeat,
      from: notBefore,
      need: result.need,
      ran: [],
      runningQ: null,
      createdAt: nowMs,
    };
    return {
      ...base, carSoc: soc, targetSoc: soc !== null ? target : null, amountKwh: Math.round(amountKwh * 10) / 10, deadline, powerKw, hours: Math.round(hours * 100) / 100, maxPrice, energyKwh, costChf, ...result, job,
    };
  }

  _priceSlots(nowMs) {
    return this.runner.prices.range(nowMs - 3600 * 1000, nowMs + 50 * 3600 * 1000);
  }

  /** Vorschau: was würde der Planer für diese Aufträge wählen? Nichts wird gespeichert oder geschaltet. */
  previewPlan(body) {
    const cfg = this.getConfig();
    const nowMs = Date.now();
    const tz = this.homey.clock.getTimezone();
    if (!this.runner) throw new Error('EMS nicht gestartet');
    const list = Array.isArray(body && body.jobs) ? body.jobs.slice(0, 4) : [];
    const slots = this._priceSlots(nowMs);
    const results = list.map((j) => {
      const r = this._resolveJob(j, cfg, nowMs, tz, slots);
      const { job, ...rest } = r;
      return rest;
    });
    const rows = results.filter((x) => !x.error).map((x) => ({ id: x.id, name: x.name, starts: x.starts }));
    return { ...this.getPlan(rows), jobResults: results };
  }

  /** Auftrag speichern (ersetzt den Auftrag desselben Ziels). Gespeichert wird auch, wenn jetzt noch nicht alles planbar ist (Preise fehlen). */
  saveJob(body) {
    const cfg = this.getConfig();
    const nowMs = Date.now();
    const tz = this.homey.clock.getTimezone();
    if (!this.runner || !this.jobStore) throw new Error('EMS nicht gestartet');
    const r = this._resolveJob(body || {}, cfg, nowMs, tz, this._priceSlots(nowMs));
    if (r.error) {
      throw new Error({
        amount: 'Menge fehlt', time: 'Uhrzeit ungültig', repeatsoc: 'Ziel-Ladestand nur einmalig (jede Woche: Wochenvorlage des E-Autos)', device: 'Gerät nicht gewählt', carsoc: 'Ladestand des E-Autos unbekannt', carcap: 'Batteriegrösse des E-Autos fehlt', reached: 'Ziel-Ladestand ist schon erreicht',
      }[r.error]);
    }
    if (r.reason === 'deadline_passed') throw new Error('Frist ist schon vorbei');
    this.jobStore.put(r.job);
    this.app.log(`EMS: Auftrag ${r.id} gespeichert (${r.need} Viertelstunden bis ${r.time || body.time})`);
    return this.listJobs();
  }

  deleteJob(id) {
    if (!this.jobStore) throw new Error('EMS nicht gestartet');
    this.jobStore.remove(String(id));
    return this.listJobs();
  }

  /** Aktive Aufträge mit Stand für die Einstellungen. */
  listJobs() {
    if (!this.runner || !this.jobStore) return { jobs: [] };
    const cfg = this.getConfig();
    const nowMs = Date.now();
    const slots = this._priceSlots(nowMs);
    const jobs = this.jobStore.list().map((job) => {
      const r = stepJob({ job, slots, nowMs });
      const c = job.kind === 'consumer' ? cfg.consumers.find((x) => x.id === job.id) : null;
      return {
        id: job.id,
        kind: job.kind,
        name: c ? c.name : null,
        time: job.time,
        amount: job.amount,
        targetSoc: job.targetSoc === undefined ? null : job.targetSoc,
        powerKw: job.powerKw,
        maxPrice: job.maxPrice,
        contiguous: job.contiguous,
        repeat: job.repeat || 'once',
        deadline: job.deadline,
        need: job.need,
        done: r.ran.length,
        status: r.status,
        runningNow: r.wantOn && r.runningQ === Math.floor(nowMs / 900000) * 900000,
        wantOn: r.wantOn,
        from: r.starts.length ? r.starts[0] : null,
        to: r.starts.length ? r.starts[r.starts.length - 1] + 900000 : null,
        feasible: r.plan ? r.plan.feasible : true,
        reason: r.plan ? r.plan.reason : 'ok',
        planned: r.starts.length,
      };
    });
    return { jobs };
  }

  /** Geplante Ladezeiten des Autos als Zeile im Plan. */
  _carRow() {
    const c = this.runner && this.runner.carCurrent;
    if (!c || !c.starts || !c.starts.length) return [];
    return [{
      id: 'car', name: 'E-Auto', starts: c.starts, ran: [], preview: false,
    }];
  }

  _activeJobRows(nowMs) {
    if (!this.jobStore || !this.runner) return [];
    const cfg = this.getConfig();
    const slots = this._priceSlots(nowMs);
    return this.jobStore.list().map((job) => {
      const r = stepJob({ job, slots, nowMs });
      const c = job.kind === 'consumer' ? cfg.consumers.find((x) => x.id === job.id) : null;
      return {
        id: job.id, name: c ? c.name : null, starts: r.starts, ran: r.ran, preview: false,
      };
    });
  }

  /** Flows, die als Schaltziel für Verbraucher gewählt werden können. */
  async listFlows() {
    const inputs = new Inputs(this.homey, (m) => this.app.log(m));
    return inputs.listFlows();
  }

  /** Alle Geräte mit ihren Capabilities für die Auswahl in den Einstellungen. */
  async listDevices() {
    const inputs = new Inputs(this.homey, (m) => this.app.log(m));
    return inputs.listDevices();
  }
}

module.exports = { EmsController };
