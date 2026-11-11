'use strict';

const { decideBattery } = require('./planner/battery');
const { currentSlot } = require('./planner/slots');
const {
  evaluateCharger, makeChargerState, shareBudgetW, failSafe, CONSTANTS: CC,
} = require('./planner/charger');
const { evaluateConsumer, makeConsumerState } = require('./planner/consumer');
const { forecastGate } = require('./planner/forecastGate');
const { stepJob } = require('./planner/jobs');
const {
  buildCommands, makeBatteryControlState, stepBatteryControl, markSent,
} = require('./planner/batteryControl');

const MAX_BATTERY_EVENTS = 50;
const { carPlan } = require('./planner/carSchedule');

const PRICE_REFRESH_MS = 10 * 60 * 1000;
const PV_REFRESH_MS = 15 * 60 * 1000;
const SNAPSHOT_MAX_AGE_MS = 5000;
const MAX_CONSUMER_EVENTS = 100;
const IDLE_MS = 5 * 60 * 1000;

/**
 * Ein Durchlauf des EMS: Eingänge lesen, entscheiden, protokollieren und (nur wo `live` gesetzt
 * ist) die Befehle über die Ausgänge senden. Alle Abhängigkeiten werden übergeben (Tests mit Attrappen).
 *
 *   Batterie    Plan; gesteuert nur mit Batteriesteuerung und live
 *   Wallbox     Schattenmodus oder live (`charger.live`)
 *   Verbraucher Schattenmodus oder live (je Verbraucher `live`)
 */
class EmsRunner {
  constructor({
    getConfig, prices, pv, inputs, actuators = null, shadowLog, chargerLog = null, planLog = null, jobs = null, store = null,
    onConsumerEvent = null, onChargeNowOff = null, tz = 'Europe/Zurich', log = () => {},
  }) {
    this.planLog = planLog;
    this.onChargeNowOff = onChargeNowOff;
    this._wasConnected = null;
    this.jobs = jobs;
    this.getConfig = getConfig;
    this.prices = prices;
    this.pv = pv;
    this.inputs = inputs;
    this.actuators = actuators;
    this.shadowLog = shadowLog;
    this.chargerLog = chargerLog;
    this.store = store;
    this.onConsumerEvent = onConsumerEvent;
    this.tz = tz;
    this.log = log;

    this.prev = null;
    this.current = null;
    this.lastTickAt = null;
    this.errors = [];

    this.chargerSt = makeChargerState();
    this.chargerWarm = false; // erster Lauf nach dem Start: nur beobachten, nichts senden
    this.gateBlocked = false;
    this.chargerCurrent = null;
    this.chargerCommands = [];

    this.consumerStates = new Map();
    this.consumerCurrent = [];
    this.consumerEvents = this._load('consumerEvents', []);
    this.batteryEvents = this._load('batteryEvents', []);
    this.batteryCtl = makeBatteryControlState();
    this.batteryControl = null;
    this._loadConsumerStates();
    this._snapshot = null;
  }

  _load(key, fallback) {
    try {
      const v = this.store ? this.store.get(key) : null;
      return v === undefined || v === null ? fallback : v;
    } catch (err) {
      return fallback;
    }
  }

  _save(key, value) {
    try {
      if (this.store) this.store.set(key, value);
    } catch (err) { /* nicht kritisch */ }
  }

  _loadConsumerStates() {
    const saved = this._load('consumerStates', {});
    for (const [id, s] of Object.entries(saved || {})) {
      this.consumerStates.set(id, {
        ...makeConsumerState(),
        isOn: s.isOn === true,
        startedAt: s.startedAt ?? null,
        stoppedAt: s.stoppedAt ?? null,
        forceUntil: s.forceUntil ?? null,
        forceArmed: s.forceArmed !== false,
      });
    }
  }

  _saveConsumerStates() {
    const out = {};
    for (const [id, s] of this.consumerStates) {
      out[id] = {
        isOn: s.isOn, startedAt: s.startedAt, stoppedAt: s.stoppedAt, forceUntil: s.forceUntil, forceArmed: s.forceArmed,
      };
    }
    this._save('consumerStates', out);
  }

  // ------------------------------------------------------------ Batterie (Schattenmodus)

  async tick(nowMs = Date.now()) {
    const cfg = this.getConfig();
    const b = cfg.battery;
    if (!b.deviceId) {
      this.current = null; this.lastTickAt = nowMs; return null;
    } // ohne Batterie gibt es nichts zu planen

    if (!this.prices.fetchedAt || nowMs - this.prices.fetchedAt > PRICE_REFRESH_MS) await this.prices.refresh(nowMs);
    await this._refreshPv(cfg, nowMs);

    const bat = await this.inputs.battery(b);
    const other = cfg.compare ? await this.inputs.compareBatteryPlan(b.deviceId) : null;

    const slots = this.prices.getSlots(nowMs);
    const solarKwh = this.pv.forecastKwh(nowMs, b.lookaheadHours || 24);
    const capacityKwh = bat.capacityKwh && bat.capacityKwh > 0 ? bat.capacityKwh : b.capacityKwh;

    const mine = decideBattery({
      cfg: { ...b, capacityKwh }, soc: bat.soc, slots, solarKwh, prev: this.prev, nowMs,
    });

    const cur = currentSlot(slots, nowMs);
    this.prev = { mode: mine.mode, slotStart: cur ? cur.start : null };
    this.shadowLog.record({
      nowMs, soc: bat.soc, price: cur ? cur.price : null, mine, other,
    });
    if (this.planLog) this.planLog.record({ nowMs, battery: mine.mode });
    await this._controlBattery(cfg, mine, nowMs);

    this.lastTickAt = nowMs;
    this.errors = [bat.error, this.prices.error, this.pv.error].filter(Boolean);
    this.current = {
      at: nowMs,
      soc: bat.soc,
      capacityKwh,
      price: cur ? cur.price : null,
      mine,
      other,
      priceSlots: slots.length,
      priceFetchedAt: this.prices.fetchedAt,
      pvFactor: this.pv.factor,
      errors: this.errors,
    };
    return this.current;
  }

  /**
   * PV-Prognose auffrischen. Quelle laut Einstellung:
   *   external  nur eingelieferte Prognose (Flow-Aktion)
   *   homey     Tageswerte von Homey, device = Tageswerte eines Geräts
   *   auto      eingelieferte Prognose, solange sie frisch ist, sonst Homey, sonst das gewählte Gerät
   * Tageswerte werden höchstens alle 15 Minuten gelesen und als Tageskurve verteilt.
   */
  async _refreshPv(cfg, nowMs) {
    this._configurePv(cfg);
    const pvCfg = cfg.pv || {};
    const mode = pvCfg.source || 'auto';
    const key = JSON.stringify([mode, pvCfg.device, pvCfg.factor]);
    const extFresh = typeof this.pv.externalFresh === 'function' && this.pv.externalFresh(nowMs);
    const wantsDaily = mode !== 'external' && !(mode === 'auto' && extFresh) && typeof this.inputs.solarForecast === 'function';
    if (wantsDaily) {
      const dailyActive = this.pv.source === 'homey' || this.pv.source === 'device';
      if (this._pvKey === key && dailyActive && this._pvReadAt && nowMs - this._pvReadAt <= PV_REFRESH_MS) return;
      this._pvKey = key;
      this._pvReadAt = nowMs;
      const d = await this.inputs.solarForecast(pvCfg, mode);
      if (d && typeof this.pv.setDaily === 'function' && this.pv.setDaily(d, nowMs, this.tz)) return;
    }
    if (!this.pv.fetchedAt || nowMs - this.pv.fetchedAt > PV_REFRESH_MS) await this.pv.refresh(nowMs);
  }

  /**
   * Batteriesteuerung: sendet bei einem Moduswechsel (und als Wiederholung) die Karten der gewählten Vorlage.
   * Live nur, wenn der Silent-Modus aus und der Schalter der Batterie auf live steht; sonst wird nur protokolliert.
   */
  async _controlBattery(cfg, mine, nowMs) {
    const b = cfg.battery;
    const ctl = b.control || {};
    if (!ctl.enabled || !ctl.preset || !b.deviceId || !this.actuators) {
      this.batteryControl = null; return;
    }
    const live = ctl.live === true && cfg.silent !== true;
    const carCharging = !!(this.chargerCurrent && (this.chargerCurrent.chargerPowerW || 0) > 500);
    const step = stepBatteryControl({
      st: this.batteryCtl, mode: mine.mode, nowMs, repeatMs: ctl.repeatMin * 60000, carCharging, live,
    });
    let executed = [];
    let error = null;
    if (step.send) {
      const target = Number.isFinite(mine.targetEff) ? mine.targetEff : b.targetSoc;
      const cmds = buildCommands(ctl.preset, mine.mode, { power: b.chargePowerKw * 1000, target_soc: target, normal_discharge: ctl.normalDischargeW }, { carCharging });
      try {
        executed = await this.actuators.battery(b.deviceId, cmds, { live });
        markSent(this.batteryCtl, mine.mode, nowMs, cmds);
      } catch (err) {
        error = err && err.message ? err.message : String(err);
        this.log(`[EMS] Batterie-Befehl fehlgeschlagen: ${error}`);
      }
      this._noteBatteryEvent({
        ts: nowMs, mode: mine.mode, live, reason: mine.reason, why: step.reason, cards: cmds.filter((c) => !c.skipped).map((c) => c.card), error,
      });
    }
    this.batteryControl = {
      live, mode: mine.mode, lastMode: this.batteryCtl.lastMode, lastSentAt: this.batteryCtl.lastSentAt, step: step.reason, executed, error,
    };
  }

  /** Batterie freigeben (EMS wird ausgeschaltet): Normal senden, wenn zuletzt Laden oder Halten gesendet wurde. */
  async releaseBattery(cfg, nowMs = Date.now()) {
    const b = cfg.battery;
    const ctl = b.control || {};
    if (!ctl.enabled || !ctl.preset || !b.deviceId || !this.actuators) return null;
    if (this.batteryCtl.lastMode !== 'charge' && this.batteryCtl.lastMode !== 'hold') return null;
    const live = ctl.live === true && cfg.silent !== true;
    const cmds = buildCommands(ctl.preset, 'normal', { normal_discharge: ctl.normalDischargeW }, { carCharging: false });
    const executed = await this.actuators.battery(b.deviceId, cmds, { live });
    markSent(this.batteryCtl, 'normal', nowMs, cmds);
    this._noteBatteryEvent({
      ts: nowMs, mode: 'normal', live, reason: 'Energiemanagement ausgeschaltet - Batterie freigegeben', why: 'Freigabe', cards: cmds.map((c) => c.card), error: null,
    });
    return executed;
  }

  _noteBatteryEvent(e) {
    this.batteryEvents.push(e);
    if (this.batteryEvents.length > MAX_BATTERY_EVENTS) this.batteryEvents.splice(0, this.batteryEvents.length - MAX_BATTERY_EVENTS);
    this._save('batteryEvents', this.batteryEvents);
    this.log(`[EMS] Batterie: ${e.mode}${e.live ? '' : ' (simuliert)'} - ${e.reason} [${e.cards.join(', ')}]${e.error ? ` FEHLER ${e.error}` : ''}`);
  }

  /** PV-Quelle einstellen: Faktor aus der Konfiguration, Übergangs-Quelle nur mit gewählter Vergleichsquelle. */
  _configurePv(cfg) {
    if (typeof this.pv.configure === 'function') this.pv.configure({ factor: cfg.pv ? cfg.pv.factor : 1, useFallback: !!(cfg.compare && cfg.devices.compareEms) });
  }

  // ------------------------------------------------------------ Messwerte (gemeinsam für Wallbox und Verbraucher)

  async _readSnapshot(cfg, nowMs) {
    if (this._snapshot && nowMs - this._snapshot.at < SNAPSHOT_MAX_AGE_MS) return this._snapshot.data;
    const data = await this.inputs.chargerInputs(cfg);
    this._snapshot = { at: nowMs, data };
    return data;
  }

  _gate(cfg, i, nowMs) {
    const capacityKwh = i.batteryCapacityKwh && i.batteryCapacityKwh > 0 ? i.batteryCapacityKwh : cfg.battery.capacityKwh;
    const remaining = this.pv.remainingTodayKwh(nowMs, this.tz);
    const gate = forecastGate({
      mode: cfg.forecastGate.mode,
      kwh: cfg.forecastGate.kwh,
      soc: i.batterySoc,
      capacityKwh,
      remainingKwh: remaining,
      stale: remaining === null,
      hasBattery: !!cfg.battery.deviceId,
      wasBlocked: this.gateBlocked,
    });
    this.gateBlocked = gate.blocked;
    return gate;
  }

  // ------------------------------------------------------------ Wallbox + Verbraucher

  /**
   * Schneller Lauf: Wallbox und Verbraucher. Gibt die Wartezeit bis zum nächsten Lauf zurück:
   * 15 s mit Auto an der Wallbox, 30 s mit aktiven Verbrauchern, sonst 5 Minuten.
   */
  async tickCharger(nowMs = Date.now()) {
    const cfg = this.getConfig();
    await this._refreshPv(cfg, nowMs);
    const i = await this._readSnapshot(cfg, nowMs);
    const gate = this._gate(cfg, i, nowMs);
    const jobStates = this._stepJobs(nowMs);
    this.carCurrent = this._carTarget(cfg, i, nowMs);

    let chargerBusy = false;
    if (cfg.charger.enabled) chargerBusy = await this._runCharger(cfg, i, gate, nowMs, jobStates.get('charger') || null, this.carCurrent);
    const consumersActive = await this._runConsumers(cfg, i, gate, nowMs, jobStates);
    if (this.planLog) {
      this.planLog.record({
        nowMs,
        pvW: i.pvW === null || i.pvW === undefined ? null : Number(i.pvW),
        charger: cfg.charger.enabled && this.chargerCurrent ? { mode: this.chargerCurrent.mine.mode, powerW: this.chargerCurrent.chargerPowerW } : null,
        consumers: this.consumerCurrent.filter((c) => c.reason !== 'Gerät nicht erreichbar').map((c) => ({ id: c.id, isOn: c.isOn })),
      });
    }

    const fixedS = Number(cfg.refreshS) || 0;
    if (fixedS > 0) return fixedS * 1000; // fester Rhythmus aus den Einstellungen
    if (chargerBusy) return 15 * 1000;
    return consumersActive ? 30 * 1000 : IDLE_MS;
  }

  /** Gespeicherte Aufträge fortschreiben (abgeschlossene Viertelstunden zählen, fertige und abgelaufene entfernen). */
  _stepJobs(nowMs) {
    const out = new Map();
    if (!this.jobs) return out;
    const slots = this.prices.range(nowMs - 3600 * 1000, nowMs + 50 * 3600 * 1000);
    for (const job of this.jobs.list().slice()) {
      const r = stepJob({ job, slots, nowMs });
      if (r.status !== 'active') {
        this.jobs.remove(job.id);
        this.log(`[EMS] Auftrag ${job.id}: ${r.status === 'done' ? 'erledigt' : `abgelaufen (${r.ran.length} von ${job.need} Viertelstunden gelaufen)`}`);
        continue;
      }
      if (r.ran.length !== (job.ran || []).length || r.runningQ !== (job.runningQ === undefined ? null : job.runningQ)) {
        this.jobs.update({ ...job, ran: r.ran, runningQ: r.runningQ });
      }
      out.set(job.id, r);
    }
    return out;
  }

  /** Der Auftrag lief in dieser Viertelstunde wirklich (zählt, sobald sie zu Ende ist). */
  _markJobRunning(id, nowMs) {
    const job = this.jobs && this.jobs.get(id);
    const nowQ = Math.floor(nowMs / 900000) * 900000;
    if (job && job.runningQ !== nowQ) this.jobs.update({ ...job, runningQ: nowQ });
  }

  /** Ziel-Ladestand des Autos zur nächsten Abfahrt (Kalender oder «Nächste Abfahrt»); null ohne Auto. */
  _carTarget(cfg, i, nowMs) {
    if (!cfg.car || !cfg.car.deviceId) return null;
    const powerKw = Math.max(1.4, (cfg.charger.maxAmps * cfg.charger.phases * 230) / 1000);
    const slots = this.prices.range(nowMs - 3600 * 1000, nowMs + 50 * 3600 * 1000);
    const r = carPlan({
      schedule: cfg.car.schedule, nowMs, tz: this.tz, soc: i.carSoc === undefined ? null : i.carSoc, capacityKwh: cfg.car.capacityKwh, powerKw, slots, pvKwAt: this._pvKwAt(nowMs),
    });
    return {
      ...r, soc: i.carSoc === undefined ? null : i.carSoc, connected: !!i.chargerConnected, plan: undefined,
    };
  }

  /** Erwartete PV-Leistung (kW) für eine Viertelstunde, oder null ohne frische Prognose. */
  _pvKwAt(nowMs) {
    const { pv } = this;
    if (!pv || typeof pv.isStale !== 'function' || pv.isStale(nowMs) || !Array.isArray(pv.slots) || !pv.slots.length) return null;
    const { slots } = pv;
    return (t) => {
      const s = slots.find((x) => t >= x.end - x.h * 3600000 && t < x.end);
      return s ? s.kw : 0;
    };
  }

  async _runCharger(cfg, i, gate, nowMs, job = null, car = null) {
    const c = cfg.charger;
    // Sofortladen ist für einen Ladevorgang gedacht: beim Abstecken wieder aus (abschaltbar)
    if (c.chargeNow === true && c.chargeNowAutoOff !== false && this._wasConnected === true && i.chargerRead && i.chargerConnected === false && this.onChargeNowOff) {
      try {
        this.onChargeNowOff();
      } catch (err) {
        this.log(`[EMS] Sofortladen aus: ${err && err.message}`);
      }
    }
    if (i.chargerRead) this._wasConnected = !!i.chargerConnected;
    const live = c.live === true && cfg.silent !== true && !!this.actuators;
    const stepUp = cfg.evStepUpSoc;
    const charger = {
      id: c.id,
      connected: i.chargerConnected,
      powerW: i.chargerPowerW ?? 0,
      rawPowerW: i.chargerPowerW,
      maxAmps: c.maxAmps,
      minAmps: c.minAmps,
      phases: c.phases,
      phaseSwitch: c.phaseSwitch,
      stepHoldMs: c.stepHoldS * 1000,
      stepDownHoldMs: c.stepDownHoldS * 1000,
      batFullTopUp: stepUp > 0,
      batFullOnPct: stepUp || CC.BAT_FULL_ON_PCT,
      batFullOffPct: Math.max(0, (stepUp || CC.BAT_FULL_ON_PCT) - CC.BAT_FULL_GAP_PCT),
    };
    // Im Trockenlauf darf der Sofortladen-Schalter des Vergleichs-EMS mitzählen; live zählt nur der eigene.
    const carWants = !!(car && car.wantOn && i.chargerConnected);
    const jobWants = !!(job && job.wantOn) || carWants;
    const chargeNow = c.chargeNow === true || jobWants || (!live && i.chargeNow === true);
    const env = {
      gridW: i.gridW,
      pvW: i.pvW,
      houseW: i.houseW,
      battery: { soc: i.batterySoc, powerW: i.batteryW },
      hasBattery: !!cfg.battery.deviceId,
      share: cfg.share,
      chargeNow,
      forecastGateBlocks: gate.blocked,
      gridImportLimitKw: cfg.gridImportLimitKw,
      gridCommittedW: Math.max(0, i.gridW || 0),
      chargerPhases: i.chargerPhases,
    };

    let res;
    let executed = [];
    let warning = null;
    const notChosen = !cfg.devices.meter.id || !c.id;
    if (notChosen || i.gridW === null || !i.chargerRead) {
      const text = notChosen ? 'Geräte noch nicht gewählt (Einstellungen)' : (i.gridW === null ? 'Netzzähler nicht lesbar' : 'Wallbox nicht lesbar');
      res = {
        mode: 'error', text, allocatedW: 0, commands: [],
      };
      // Fehlerfall live: nicht blind weiterladen. Nach 60 s auf Mindeststrom, nach 5 min Stopp (nur selbst gestartetes Laden).
      if (!notChosen && live && this.chargerWarm) {
        if (!this._blindSince) this._blindSince = nowMs;
        const fs = failSafe({
          st: this.chargerSt, blindMs: nowMs - this._blindSince, minAmps: c.minAmps, phases: c.phases, forced: chargeNow, now: nowMs,
        });
        if (fs.note) res.text = `${text} - ${fs.note}`;
        if (fs.commands.length) {
          res.commands = fs.commands;
          executed = await this._execCharger(c.id, fs.commands);
        }
      }
    } else {
      this._blindSince = null;
      // Erster Lauf nach dem Start (oder nach dem Umschalten auf live): nur den Ist-Zustand übernehmen.
      const observeOnly = !live || !this.chargerWarm;
      res = evaluateCharger({
        charger, st: this.chargerSt, env, now: nowMs, shadow: observeOnly,
      });
      if (live) {
        // Beobachtungslauf: Befehle verwerfen UND den Zustand zurücksetzen, sonst glaubt der Planer,
        // er hätte sie gesendet (und würde sie im nächsten Lauf nicht mehr senden).
        if (observeOnly) {
          this.chargerSt = makeChargerState(); res.commands = [];
        }
        this.chargerWarm = true;
        if (!observeOnly) executed = await this._execCharger(c.id, res.commands);
        if (i.other && ['solar_ev', 'instant_ev', 'price_ev'].includes(i.other.mode)) {
          warning = 'Ein anderes Energiemanagement steuert diese Wallbox ebenfalls - dort ausschalten';
        }
      } else {
        this.chargerWarm = false;
      }
    }

    if (jobWants && res.mode === 'instant_ev') {
      res.text = `${carWants ? car.reason : 'Auftrag: günstige Viertelstunde'}${res.text ? ` (${res.text})` : ''}`;
      if (job && job.wantOn && i.chargerConnected && (!live || (i.chargerPowerW || 0) > 100)) this._markJobRunning('charger', nowMs);
    }
    this.chargerCommands = res.commands;
    this.chargerCurrent = {
      at: nowMs,
      live,
      mine: { mode: res.mode, reason: res.text },
      other: i.other,
      commands: res.commands,
      executed,
      warning,
      connected: i.chargerConnected,
      state: i.chargerState,
      chargerPowerW: i.chargerPowerW,
      gridW: i.gridW,
      pvW: i.pvW,
      houseW: i.houseW,
      batterySoc: i.batterySoc,
      batteryW: i.batteryW,
      carSoc: i.carSoc === undefined ? null : i.carSoc,
      budgetW: res.budgetW ?? null,
      gate,
      targetAmps: this.chargerSt.currentAmps,
      releasedW: this._releasedW(cfg, i),
    };
    if (this.chargerLog) {
      this.chargerLog.record({
        nowMs, soc: i.batterySoc, price: null, mine: { mode: res.mode, reason: res.text }, other: i.other,
      });
    }
    return !!(i.chargerConnected || chargeNow);
  }

  /** Freigegebener Überschuss: gemessener Export plus der Anteil, den die Batterie-Rampe den Geräten überlässt. */
  _releasedW(cfg, i) {
    if (i.gridW === null || i.gridW === undefined) return null;
    const share = shareBudgetW(cfg.share, i.batterySoc, i.pvW, i.gridW, i.batteryW);
    const eff = i.gridW - (share !== null && share > 0 ? share : 0);
    return Math.max(0, Math.round(-eff));
  }

  async _execCharger(chargerId, commands) {
    const done = [];
    for (const cmd of commands) {
      try {
        const r = await this.actuators.charger(chargerId, cmd, { live: true });
        done.push({ ...r, ok: true });
        this.log(`[EMS] Wallbox: ${JSON.stringify(r)}`);
      } catch (err) {
        done.push({ cmd: cmd.type, ok: false, error: err && err.message });
        this.log(`[EMS] Wallbox-Befehl ${cmd.type} fehlgeschlagen: ${err && err.message}`);
      }
    }
    return done;
  }

  async _runConsumers(cfg, i, gate, nowMs, jobStates = new Map()) {
    const list = cfg.consumers.filter((c) => c.enabled);
    const result = [];
    if (!list.length) {
      this.consumerCurrent = []; return false;
    }
    const sensorIds = list.filter((c) => c.humidity && c.humidity.enabled).map((c) => c.humidity.sensorId);
    const deviceIds = list.filter((c) => c.controlKind !== 'flow').map((c) => c.id);
    const actual = await this.inputs.consumerStates([...new Set([...deviceIds, ...sensorIds])]);
    let changed = false;
    for (const c of list) {
      let st = this.consumerStates.get(c.id);
      if (!st) {
        st = makeConsumerState(); this.consumerStates.set(c.id, st);
      }
      // Flow-gesteuerte Verbraucher haben kein Gerät: Ist-Zustand unbekannt, gerechnet wird mit der angegebenen Leistung
      const viaFlow = c.controlKind === 'flow';
      const a = viaFlow
        ? {
          actualOn: null, powerW: st.isOn && c.assumedW > 0 ? c.assumedW : null, available: true, values: {},
        }
        : (actual.get(c.id) || { actualOn: null, powerW: null, available: false });
      const live = c.live === true && cfg.silent !== true && !!this.actuators;
      // Schalter gewechselt (Trockenlauf <-> live): der simulierte Zustand passt nicht mehr zum Gerät.
      if (st.liveSeen !== undefined && st.liveSeen !== live) {
        st = makeConsumerState();
        this.consumerStates.set(c.id, st);
      }
      st.liveSeen = live;
      if (!a.available) {
        result.push({
          id: c.id, name: c.name, mode: c.mode, wantOn: st.isOn, isOn: st.isOn, live, reason: 'Gerät nicht erreichbar', actualOn: null,
        });
        continue;
      }
      const before = st.isOn;
      const r = evaluateConsumer({
        cfg: c,
        st,
        env: {
          soc: i.batterySoc,
          gridW: i.gridW,
          batteryW: i.batteryW,
          pvW: i.pvW,
          share: cfg.share,
          hasBattery: !!cfg.battery.deviceId,
          forecastGateBlocks: gate.blocked,
          // Trockenlauf: das Gerät wird nicht geschaltet, also zählt sein Ist-Zustand nicht (sonst Scheinwechsel).
          actualOn: live ? a.actualOn : null,
          powerW: live ? a.powerW : null,
          humidity: this._humidity(c, actual),
          job: jobStates.get(c.id) && jobStates.get(c.id).wantOn ? { wantOn: true, reason: 'Auftrag: günstige Viertelstunde' } : null,
        },
        now: nowMs,
      });
      const executed = [];
      for (const cmd of r.commands) {
        changed = true;
        try {
          const out = await this.actuators.consumer(c.id, cmd.type === 'on', { live, flow: viaFlow ? (cmd.type === 'on' ? c.flowOn : c.flowOff) : null });
          executed.push({ ...out, ok: true });
        } catch (err) {
          executed.push({ cmd: cmd.type, ok: false, error: err && err.message });
          this.log(`[EMS] ${c.name}: Befehl ${cmd.type} fehlgeschlagen: ${err && err.message}`);
        }
        this._noteConsumerEvent({
          ts: nowMs, id: c.id, name: c.name, cmd: cmd.type, live, reason: r.reason, soc: i.batterySoc,
        });
      }
      if (jobStates.get(c.id) && jobStates.get(c.id).wantOn && st.isOn) this._markJobRunning(c.id, nowMs);
      if (before !== st.isOn) changed = true;
      if ((st.forceUntil || null) !== (st.savedForce || null)) {
        st.savedForce = st.forceUntil || null; changed = true;
      }
      result.push({
        id: c.id, name: c.name, mode: c.mode, wantOn: r.wantOn, isOn: st.isOn, live, reason: r.reason, actualOn: a.actualOn, executed,
      });
    }
    this.consumerCurrent = result;
    if (changed) this._saveConsumerStates();
    return true;
  }

  /** Aktuelle Luftfeuchte für den Notlauf eines Verbrauchers, oder null (kein Sensor / nicht lesbar). */
  _humidity(c, actual) {
    if (!c.humidity || !c.humidity.enabled) return null;
    const s = actual.get(c.humidity.sensorId);
    if (!s || !s.available) return null;
    const v = s.values ? s.values[c.humidity.capability] : undefined;
    return Number.isFinite(v) ? v : null;
  }

  _noteConsumerEvent(e) {
    this.consumerEvents.push(e);
    if (this.consumerEvents.length > MAX_CONSUMER_EVENTS) this.consumerEvents.splice(0, this.consumerEvents.length - MAX_CONSUMER_EVENTS);
    this._save('consumerEvents', this.consumerEvents);
    this.log(`[EMS] ${e.name}: ${e.cmd === 'on' ? 'ein' : 'aus'}${e.live ? '' : ' (Trockenlauf)'} - ${e.reason}`);
    if (this.onConsumerEvent) {
      try {
        this.onConsumerEvent(e);
      } catch (err) {
        this.log(`[EMS] Ereignis-Rückruf: ${err && err.message}`);
      }
    }
  }
}

module.exports = { EmsRunner };
