'use strict';

const { decideBattery } = require('./planner/battery');
const { currentSlot } = require('./planner/slots');
const {
  evaluateCharger, makeChargerState, shareBudgetW, surplusShare, failSafe, CONSTANTS: CC, applyFuseCap,
} = require('./planner/charger');
const { evaluateConsumer, makeConsumerState } = require('./planner/consumer');
const { decideProgram } = require('./planner/program');
const {
  decideSgReady, makeSgReadyState, relaysFor, parseSgReadyState,
} = require('./planner/sgready');
const { dhwToSgCfg, cheapestPreview } = require('./planner/dhw');
const {
  startOfLocalDay, addLocalDays, localParts, localDateKey,
} = require('../time');
const { forecastGate } = require('./planner/forecastGate');
const { applyShareBonus } = require('./planner/shareBonus');
const {
  decideDelay, makeDelayState,
} = require('./planner/dhwDelay');
const { stepJob, rollJob } = require('./planner/jobs');
const { LoadProfile } = require('./LoadProfile');
const { DecisionLedger } = require('./DecisionLedger');
const { stepFusePeak } = require('../WidgetData');
const {
  limitA, chargerCapAmps, makeFuseState, stepFuse,
} = require('./planner/fuse');
const {
  buildCommands, makeBatteryControlState, stepBatteryControl, markSent,
} = require('./planner/batteryControl');

const MAX_BATTERY_EVENTS = 50;
const START_SETTLE_MS = 90 * 1000; // nach einem Start darf kein weiterer Überschuss-Verbraucher starten, bis die Messung ihn zeigt
const HOLD_STOP_MAX_MS = 180 * 1000; // so lange darf ein höher priorisierter Verbraucher wegen eines noch laufenden niedrigeren weiterlaufen
const { carPlan } = require('./planner/carSchedule');

const PRICE_REFRESH_MS = 10 * 60 * 1000;
const PV_REFRESH_MS = 15 * 60 * 1000;
const SNAPSHOT_MAX_AGE_MS = 5000;
const MAX_CONSUMER_EVENTS = 100;
const IDLE_MS = 5 * 60 * 1000;
const SG_FEEDBACK_SETTLE_MS = 5 * 60 * 1000; // so lange darf die Wärmepumpe brauchen, bis sie den neuen SG-Ready-Zustand meldet
const DHW_BASE_HOLD_MS = 30 * 60000; // so lange nach dem Programm-Ende den gemeldeten WW-Soll nicht als Basis übernehmen

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
    getConfig, prices, pv, inputs, actuators = null, shadowLog, chargerLog = null, planLog = null, jobs = null, store = null, pvAccuracy = null, onAutoFactor = null,
    onConsumerEvent = null, onChargeNowOff = null, feedInAt = null, tz = 'Europe/Zurich', log = () => {},
  }) {
    this.planLog = planLog;
    this.pvAccuracy = pvAccuracy;
    this.onAutoFactor = onAutoFactor;
    this._autoFactorDay = null;
    this.onChargeNowOff = onChargeNowOff;
    this.feedInAt = feedInAt;
    this.fuseSt = makeFuseState();
    this.fuseCurrent = null;
    this.fuseBlocked = new Set();
    this.fuseCapAmps = null;
    this._fuseThrottling = false;
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
    // Frühere Versionen speicherten jede Wiederholung: nur echte Wechsel und Fehler behalten
    this.batteryEvents = this._load('batteryEvents', []).filter((e) => e && (e.why !== 'Wiederholung' || e.error));
    this.fuseEvents = this._load('fuseEvents', []);
    this.fusePeak = this._load('fusePeak', null);
    this.loadProfile = new LoadProfile(this.store, this.tz);
    this.ledger = new DecisionLedger(this.store, this.tz);
    this.batteryCtl = makeBatteryControlState();
    this.batteryControl = null;
    this._loadConsumerStates();
    this._snapshot = null;

    this.sgReadyState = this._load('sgReadyState', null) || makeSgReadyState();
    this.sgReadyCurrent = null;
    this._sgReadyRelay = { recommend: null, force: null }; // zuletzt gesendeter Wert je Relais, nicht gespeichert
    this._sgReadyFlowState = null; // zuletzt gestarteter Zustands-Flow
    this._sgReadyExpected = null;
    this._sgReadyExpectedSince = 0;
    this._sgReadyMismatchLogged = false;
    // Warmwasser-Programm (eigenes Modul): nach einem Neustart mitten im Programm weiss das «aus» beim Ende, dass es gesetzt wurde
    this.dhwState = this._load('dhwState', null) || makeSgReadyState();
    this.dhwCurrent = null;
    this.dhwDelay = this._load('dhwDelay', null) || makeDelayState(); // Warmwasser verzögern (der WW-Soll ist abgesenkt), übersteht einen Neustart
    this._dhwOn = this.dhwState.state === 'dhw' ? true : null;
    // Pausiert (Schalter im Widget): beendet einen laufenden Lauf und sperrt neue Starts; bleibt über Neustarts erhalten
    const pz = this._load('paused', null) || {};
    this.paused = { sgready: pz.sgready === true, dhw: pz.dhw === true };
    this._savedJson = new Map(); // zuletzt gespeicherter Inhalt je Schlüssel
    this._lastConsumerStartAt = 0; // letzter Start eines Verbrauchers (für die Priorität bei Überschuss)
    this._dhwSollBase = null; // WW-Soll vor dem Programm
    this._dhwBaseHoldUntil = 0;
    this._manual = { sgready: false, dhw: false }; // Start von Hand angefordert, wird im nächsten Lauf einmal verbraucht
  }

  /** Start von Hand (Widget-Knopf oder Flow) für SG-Ready oder das Warmwasser-Programm anfordern. */
  requestManualStart(which) {
    if (which !== 'sgready' && which !== 'dhw') throw new Error('Unbekanntes Modul');
    this._manual[which] = true;
  }

  _takeManual(which) {
    const v = this._manual[which] === true;
    this._manual[which] = false;
    return v;
  }

  /** SG-Ready oder Warmwasser-Programm pausieren bzw. wieder freigeben. */
  setPaused(which, on) {
    if (which !== 'sgready' && which !== 'dhw') throw new Error('Unbekanntes Modul');
    this.paused[which] = on === true;
    this._save('paused', { ...this.paused });
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
      if (!this.store) return;
      // Nur schreiben, wenn sich etwas geändert hat (Zustände werden jeden Takt «gespeichert», ändern sich aber selten): schont den Flash-Speicher
      const j = JSON.stringify(value);
      if (this._savedJson.get(key) === j) return;
      this.store.set(key, value);
      this._savedJson.set(key, j);
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
        programDay: s.programDay ?? null,
        programStartedAt: s.programStartedAt ?? null,
      });
    }
  }

  _saveConsumerStates() {
    const out = {};
    for (const [id, s] of this.consumerStates) {
      out[id] = {
        isOn: s.isOn, startedAt: s.startedAt, stoppedAt: s.stoppedAt, forceUntil: s.forceUntil, forceArmed: s.forceArmed, programDay: s.programDay, programStartedAt: s.programStartedAt,
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
      cfg: { ...b, capacityKwh },
      soc: bat.soc,
      slots,
      solarKwh,
      prev: this.prev,
      nowMs,
      pvKwAt: this._pvKwAt(nowMs),
      tz: this.tz,
      loadKwAt: b.bridgeLoadMode !== 'fixed' && this.loadProfile.dayCount() > 0 ? (t) => this.loadProfile.kwAt(t) : null,
      feedInRp: typeof this.feedInAt === 'function' ? (this.feedInAt(nowMs) || 0) : 0,
    });

    const cur = currentSlot(slots, nowMs);
    this.prev = { mode: mine.mode, slotStart: cur ? cur.start : null };
    // Franken-Auswertung (Modell): beide Entscheide mit echtem Verbrauch, Solarstrom und Preisen
    const chNow = this.chargerCurrent;
    if (cur && chNow && Number.isFinite(chNow.at) && nowMs - chNow.at < 10 * 60000) {
      this.ledger.step({
        nowMs,
        mine: mine.mode,
        other: other && other.mode ? other.mode : null,
        price: cur.price,
        feedIn: typeof this.feedInAt === 'function' ? this.feedInAt(nowMs) : 0,
        houseW: chNow.houseW,
        pvW: chNow.pvW,
        socPct: bat.soc,
        p: {
          capacityKwh, efficiency: 0.9, powerKw: b.chargePowerKw, floorSoc: b.floorSoc, targetSoc: Number.isFinite(mine.targetEff) ? mine.targetEff : b.targetSoc, targetOtherSoc: b.targetSoc,
        },
      });
    }
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
      const d = await this.inputs.solarForecast(pvCfg, mode, { nowMs, tz: this.tz });
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
      const cmds = buildCommands(ctl.preset, mine.mode, { power: b.chargePowerKw * 1000, target_soc: target, normal_discharge: ctl.normalDischargeW }, { carCharging, custom: ctl.custom });
      try {
        executed = await this.actuators.battery(b.deviceId, cmds, { live });
        markSent(this.batteryCtl, mine.mode, nowMs, cmds);
      } catch (err) {
        error = err && err.message ? err.message : String(err);
        this.log(`[EMS] Batterie-Befehl fehlgeschlagen: ${error}`);
      }
      if (step.reason !== 'Wiederholung' || error) {
        this._noteBatteryEvent({
          ts: nowMs, mode: mine.mode, live, reason: mine.reason, why: step.reason, cards: cmds.filter((c) => !c.skipped).map((c) => c.card), error,
        });
      }
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
    const cmds = buildCommands(ctl.preset, 'normal', { normal_discharge: ctl.normalDischargeW }, { carCharging: false, custom: ctl.custom });
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

  /**
   * Prognose-Genauigkeit mitschreiben (Tagesbilanz, siehe PvAccuracy). Ist «Korrekturfaktor automatisch» an, trägt die App den
   * empfohlenen Faktor einmal pro Tag (und beim Einschalten) selbst ein, sobald genug vollständige Tage da sind.
   */
  _recordPv(cfg, i, nowMs) {
    if (!this.pvAccuracy) return;
    try {
      this.pvAccuracy.record({
        nowMs, pvW: i.pvW, remainingKwh: this.pv.remainingTodayKwh(nowMs, this.tz), factor: this.pv.factor,
      });
      if (!(cfg.pv && cfg.pv.factorAuto) || typeof this.onAutoFactor !== 'function') return;
      const key = localDateKey(new Date(nowMs), this.tz);
      if (this._autoFactorDay === key) return;
      const rec = this.pvAccuracy.view(nowMs).recommend;
      // Erst als erledigt markieren, wenn es eine Empfehlung gibt: solange zu wenig Tage da sind (oder gerade Daten übernommen werden), wird jeden Lauf neu geprüft
      if (rec.factor === null) return;
      this._autoFactorDay = key;
      if (Math.abs(rec.factor - cfg.pv.factor) >= 0.03) this.onAutoFactor(rec.factor, rec);
    } catch (err) {
      this.log(`[EMS] PV-Genauigkeit: ${err && err.message}`);
    }
  }

  /**
   * Wirksame Hausbatterie-Rampe: die eingestellte, um den Prognose-Bonus nach unten verschoben, wenn die Sonne heute die Batterie
   * und das Haus sicher versorgt. Hausverbrauch bis zum Ende der Sonne aus dem gelernten Profil (ohne Profil kein Bonus).
   */
  _computeShare(cfg, i, nowMs) {
    const eff = this._effShare(cfg, i, nowMs);
    const f = surplusShare(eff, i.batterySoc);
    // Für die Anzeige: Anteil jetzt, Batteriestand, wirksame Rampe und Verschiebung durch den Prognose-Bonus
    this.shareInfo = {
      pct: f === null ? null : Math.round(f * 100),
      soc: Number.isFinite(i.batterySoc) ? Math.round(i.batterySoc) : null,
      lo: eff.socLow, hi: eff.socHigh, pctLow: eff.pctLow, pctHigh: eff.pctHigh,
      shift: this.shareShift || 0, surplusKwh: this.shareSurplusKwh === undefined ? null : this.shareSurplusKwh,
    };
    return eff;
  }

  _effShare(cfg, i, nowMs) {
    this.shareShift = 0;
    this.shareSurplusKwh = null;
    const bonus = cfg.share && cfg.share.forecastBonus;
    if (!(bonus > 0) || !cfg.battery.deviceId) return cfg.share;
    const capacityKwh = i.batteryCapacityKwh && i.batteryCapacityKwh > 0 ? i.batteryCapacityKwh : cfg.battery.capacityKwh;
    const remainingKwh = this.pv.remainingTodayKwh(nowMs, this.tz);
    let houseKwh = null;
    if (remainingKwh !== null && remainingKwh > 0 && this.loadProfile && typeof this.loadProfile.averageKw === 'function') {
      // Stunden bis die Sonne weg ist: kleinste Stundenzahl, in der fast die ganze Rest-Prognose liegt
      let endH = 1;
      while (endH < 12 && (this.pv.forecastKwh(nowMs, endH) || 0) < remainingKwh * 0.98) endH += 1;
      const lp = localParts(new Date(nowMs), this.tz);
      const from = lp.hour;
      const to = Math.min(24, from + endH + 1);
      const avg = this.loadProfile.averageKw(from, to);
      if (avg !== null && avg !== undefined) houseKwh = avg * endH;
    }
    const r = applyShareBonus({
      share: cfg.share, bonus, soc: i.batterySoc, capacityKwh, remainingKwh, houseKwh,
    });
    this.shareShift = r.shift;
    this.shareSurplusKwh = r.surplusKwh;
    return r.share;
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
    this._shareNow = this._computeShare(cfg, i, nowMs);
    this._recordPv(cfg, i, nowMs);
    if (i && i.houseW !== null && i.houseW !== undefined) this.loadProfile.record(nowMs, i.houseW);
    const gate = this._gate(cfg, i, nowMs);
    const jobStates = this._stepJobs(nowMs);
    this.carCurrent = this._carTarget(cfg, i, nowMs);

    await this._runSgReady(cfg, i, nowMs);
    await this._runDhw(cfg, i, nowMs);
    await this._runFuse(cfg, i, nowMs);
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
    if (this.fuseCurrent && this.fuseCurrent.over) return 5 * 1000; // Überlast: eng nachschauen
    if (chargerBusy) return 15 * 1000;
    // Hausanschluss-Schutz: höchstens alle 30 s (sofort, wenn die Echtzeit-Beobachtung eine Überlast meldet)
    return consumersActive || (cfg.fuse && cfg.fuse.enabled) ? 30 * 1000 : IDLE_MS;
  }

  _noteFuseEvent(e) {
    this.fuseEvents.push(e);
    if (this.fuseEvents.length > 50) this.fuseEvents.splice(0, this.fuseEvents.length - 50);
    this._save('fuseEvents', this.fuseEvents);
  }

  /**
   * Hausanschluss-Schutz: Wallbox-Obergrenze für diesen Lauf festlegen und bei anhaltender Überlast den nächsten
   * Eintrag der Abschalt-Liste ausschalten. Die Obergrenze gilt nur für die Wallbox-Steuerung des EMS; Geräte und
   * die Wallbox ohne EMS-Steuerung schaltet der Schutz nur, wenn er live ist (und der Silent-Modus aus).
   */
  /**
   * SG-Ready-Steuerung (z. B. Boiler/Wärmepumpe): zwei Relais statt eines einzelnen Ein/Aus, siehe
   * lib/ems/planner/sgready.js. Läuft unabhängig von Verbrauchern/Wallbox (eigenes Gerät, eigene Zustände).
   */
  async _runSgReady(cfg, i, nowMs) {
    const sg = cfg.sgready;
    if (!sg || !sg.enabled) {
      // Ausgeschaltet während eines Laufs (Boost/Zwang): sauber zurück auf Normalbetrieb, sonst bliebe das Relais bzw. der Zustand hängen
      if (sg && this.sgReadyState.state !== 'off') {
        this.sgReadyState.state = 'off'; this.sgReadyState.manual = false; this.sgReadyState.cooldownUntil = null;
        this._save('sgReadyState', this.sgReadyState);
        await this._sgOutput(sg, 'off', sg.live === true && cfg.silent !== true && !!this.actuators, []);
      }
      this.sgReadyCurrent = null; return;
    }
    const live = sg.live === true && cfg.silent !== true && !!this.actuators;
    const [tempWW, modeRaw, feedbackRaw, sollRaw] = await Promise.all([
      sg.sensorId ? this.inputs.readNumber(sg.sensorId, sg.tempCapability) : Promise.resolve(null),
      sg.modeId && sg.modeCapability ? this.inputs.readValue(sg.modeId, sg.modeCapability) : Promise.resolve(null),
      sg.feedbackId && sg.feedbackCapability ? this.inputs.readValue(sg.feedbackId, sg.feedbackCapability) : Promise.resolve(null),
      sg.targetSource === 'device' && sg.targetId && sg.targetCapability ? this.inputs.readNumber(sg.targetId, sg.targetCapability) : Promise.resolve(null),
    ]);
    // Ziel aus der Wärmepumpe (WW-Soll minus Toleranz); nicht lesbar -> das fest eingestellte Ziel
    const targetOverride = Number.isFinite(sollRaw) ? sollRaw + sg.targetHyst - sg.targetTol : null;
    // Betriebsart gewählt, aber nicht (lesbar) auf dem freigegebenen Wert -> nicht steuern (sicher statt raten)
    const modeBlocked = !!(sg.modeId && sg.modeCapability) && String(modeRaw).trim().toLowerCase() !== sg.modeOkValue.trim().toLowerCase();
    const exportW = Number.isFinite(i.gridW) ? Math.max(0, -i.gridW) : null;
    const nowQ = Math.floor(nowMs / 900000) * 900000;
    const curSlot = (this.prices.getSlots(nowMs) || []).find((s) => s.start === nowQ);
    const priceNow = curSlot && Number.isFinite(curSlot.price) ? curSlot.price : null;

    const pvForecastKwh = this.pv.remainingTodayKwh(nowMs, this.tz);
    // SG-Ready steuert nur Sonne/Akku; der Preis-Start läuft über das eigene Modul «Warmwasser-Programm» (_runDhw)
    const r = decideSgReady({
      cfg: { ...sg, usePrice: false, priceAction: 'sgready' },
      st: this.sgReadyState,
      pvW: i.pvW,
      exportW,
      soc: i.batterySoc,
      hasBattery: !!cfg.battery.deviceId,
      priceNow,
      tempWW,
      modeBlocked,
      pvForecastKwh,
      targetOverride,
      // Gegenseitig ausschliessend: läuft das Warmwasser-Programm, darf SG-Ready nicht starten (und umgekehrt, siehe _runDhw)
      externalBlock: this.paused.sgready ? 'Pausiert (Schalter im Widget)' : (this._dhwOn === true ? 'Warmwasser-Programm läuft' : null),
      manualStart: this._takeManual('sgready'),
      manualKind: 'boost',
      nowMs,
      tz: this.tz,
    });
    this._save('sgReadyState', this.sgReadyState);

    const sgState = r.state;
    const executed = [];
    await this._sgOutput(sg, sgState, live, executed);
    // Rückmeldung der Wärmepumpe: übernimmt den gemeldeten Zustand und warnt bei Abweichung (nur live, nach Einschwingzeit der ISG)
    if (this._sgReadyExpected !== sgState) {
      this._sgReadyExpected = sgState;
      this._sgReadyExpectedSince = nowMs;
    }
    const rep = parseSgReadyState(feedbackRaw);
    const settled = nowMs - this._sgReadyExpectedSince >= SG_FEEDBACK_SETTLE_MS;
    const mismatch = live && rep.state !== null && rep.state !== sgState && (settled || rep.state === 'lock');
    if (mismatch && !this._sgReadyMismatchLogged) this.log(`[EMS] SG-Ready: Wärmepumpe meldet «${rep.raw}», erwartet war ${sgState}`);
    this._sgReadyMismatchLogged = mismatch;
    this.sgReadyCurrent = {
      state: r.state, reason: r.reason, deadlineMs: r.deadlineMs, live, tempWW, target: targetOverride === null ? sg.targetTemp : targetOverride, soll: sollRaw, modeBlocked, executed, reported: rep.raw, reportedState: rep.state, mismatch, paused: this.paused.sgready,
    };
  }

  /** SG-Ready-Zustand an die Wärmepumpe ausgeben (Relais oder Flows), nur bei Änderung. */
  async _sgOutput(sg, sgState, live, executed) {
    const rel = relaysFor(sgState);
    const wantForce = sg.allowForced && rel.force;
    if (sg.output === 'flows') {
      // Je Zustand ein Flow (z. B. Modbus-Schreiben): nur beim Wechsel starten, ohne gewählten Flow passiert nichts
      if (this._sgReadyFlowState !== sgState) {
        const flow = { forced: sg.flowForced, boost: sg.flowBoost, off: sg.flowNormal }[sgState];
        try {
          if (flow && flow.id) executed.push(await this.actuators.consumer(null, true, { live, flow }));
          this._sgReadyFlowState = sgState;
        } catch (err) {
          this.log(`[EMS] SG-Ready Flow ${sgState}: ${err && err.message}`);
        }
      }
    } else if (sg.recommendRelay.deviceId && this._sgReadyRelay.recommend !== rel.recommend) {
      try {
        executed.push(await this.actuators.program(sg.recommendRelay.deviceId, sg.recommendRelay.capability, rel.recommend, { live }));
        this._sgReadyRelay.recommend = rel.recommend;
      } catch (err) {
        this.log(`[EMS] SG-Ready Empfehlungs-Relais: ${err && err.message}`);
      }
    }
    if (sg.output !== 'flows' && sg.allowForced && sg.forceRelay.deviceId && this._sgReadyRelay.force !== wantForce) {
      try {
        executed.push(await this.actuators.program(sg.forceRelay.deviceId, sg.forceRelay.capability, wantForce, { live }));
        this._sgReadyRelay.force = wantForce;
      } catch (err) {
        this.log(`[EMS] SG-Ready Zwangs-Relais: ${err && err.message}`);
      }
    }
  }

  /**
   * Warmwasser-Programm bei günstigem Preis (cfg.dhw), unabhängig von SG-Ready. Die beiden schliessen sich gegenseitig aus: wer läuft,
   * behält den Lauf, der andere startet nicht (SG-Ready sperrt in _runSgReady, hier sperrt laufendes SG-Ready das Programm). Ein/aus per Flow oder Capability, nur beim Wechsel; «aus» nur, wenn wir es selbst gestartet haben.
   */
  async _runDhw(cfg, i, nowMs) {
    const d = cfg.dhw;
    if (!d || !d.enabled) {
      // Ausgeschaltet während einer Verzögerung: Soll wieder freigeben
      if (d && this.dhwDelay.active) await this._endDelay(d, cfg, nowMs, true, []);
      // Ausgeschaltet während des Programms: zurück auf Normal (sonst bliebe z. B. der erhöhte WW-Soll bzw. die Betriebsart hängen)
      if (d && this._dhwOn === true) {
        await this._dhwApply(d, false, d.live === true && cfg.silent !== true && !!this.actuators, []);
        if (this._dhwOn !== true) {
          this.dhwState.state = 'off'; this.dhwState.manual = false; this.dhwState.cooldownUntil = null;
          this._save('dhwState', this.dhwState);
          this._dhwBaseHoldUntil = nowMs + DHW_BASE_HOLD_MS;
        }
      }
      this.dhwCurrent = null; return;
    }
    const live = d.live === true && cfg.silent !== true && !!this.actuators;
    const [tempWW, modeRaw, sollRaw] = await Promise.all([
      d.sensorId ? this.inputs.readNumber(d.sensorId, d.tempCapability) : Promise.resolve(null),
      d.modeId && d.modeCapability ? this.inputs.readValue(d.modeId, d.modeCapability) : Promise.resolve(null),
      d.targetSource === 'device' && d.targetId && d.targetCapability ? this.inputs.readNumber(d.targetId, d.targetCapability) : Promise.resolve(null),
    ]);
    // Ziel aus dem WW-Soll der Wärmepumpe: der Flow des Programms kann den Soll erhöhen (damit die Wärmepumpe früher heizt). Darum zählt der
    // Soll VOR dem Programm (Basis); nach dem Ende wird er kurz nicht übernommen, weil das Gerät den zurückgesetzten Wert erst später meldet.
    if (this._dhwOn !== true && !this.dhwDelay.active && Number.isFinite(sollRaw) && !(nowMs < this._dhwBaseHoldUntil)) this._dhwSollBase = sollRaw;
    const sollForTarget = this._dhwOn === true ? this._dhwSollBase : sollRaw;
    const targetOverride = Number.isFinite(sollForTarget) ? sollForTarget + d.targetHyst - d.targetTol : null;
    // Betriebsart: freigegeben ist der Normalwert; WÄHREND des Programms zusätzlich der Programm-Wert (das Umschalten machen wir ja selbst)
    const norm = (x) => String(x).trim().toLowerCase();
    const modeOk = norm(modeRaw) === norm(d.modeOkValue) || (this._dhwOn === true && !!d.modeProgramValue && norm(modeRaw) === norm(d.modeProgramValue));
    const modeBlocked = !!(d.modeId && d.modeCapability) && !modeOk;
    // Auslöser: gehört die aktuelle Viertelstunde zu den günstigsten N Stunden des Tages? Ohne Preise des Tages: unbekannt (kein Start)
    const cheap = cheapestPreview(this.dayPrices(nowMs), nowMs, this.tz, d.cheapHours);
    // SG-Ready läuft: eigener Lauf ODER die Wärmepumpe meldet Empfehlung/Zwang (z. B. durch den bisherigen Flow, der das Relais noch schaltet)
    const isBoost = (x) => x === 'boost' || x === 'forced';
    const sunActive = !!this.sgReadyCurrent && (isBoost(this.sgReadyCurrent.state) || isBoost(this.sgReadyCurrent.reportedState));
    // Preisoptimierung erst ab dem eingestellten Datum (vorher zahlt man keinen dynamischen Tarif)
    const priceOn = !d.priceFrom || localDateKey(new Date(nowMs), this.tz) >= d.priceFrom;
    // Warmwasser verzögern (PV zuerst): entscheidet vor dem Programm, damit ein Start des Programms die Verzögerung beenden kann
    const delayInfo = await this._runDelay({
      cfg, d, nowMs, live, tempWW, priceOn, sgActive: sunActive,
    });
    const r = decideSgReady({
      cfg: dhwToSgCfg(d),
      st: this.dhwState,
      pvW: null,
      exportW: null,
      soc: null,
      hasBattery: false,
      priceNow: null,
      priceCheap: priceOn ? cheap.nowCheap : false,
      tempWW,
      modeBlocked,
      externalBlock: this.paused.dhw ? 'Pausiert (Schalter im Widget)' : (sunActive ? 'SG-Ready läuft' : null),
      manualStart: this._takeManual('dhw'),
      manualKind: 'dhw',
      targetOverride,
      pvForecastKwh: this.pv.remainingTodayKwh(nowMs, this.tz),
      nowMs,
      tz: this.tz,
    });
    this._save('dhwState', this.dhwState);
    const on = r.state === 'dhw';
    const executed = [];
    if (!on && this._dhwOn === true) this._dhwBaseHoldUntil = nowMs + DHW_BASE_HOLD_MS;
    // «Zurück auf Normal» nur, wenn das Programm wirklich von uns gestartet wurde (nie beim ersten Lauf nach dem Start)
    if (this._dhwOn !== on && (on || this._dhwOn === true)) await this._dhwApply(d, on, live, executed);
    else if (!on && this._dhwOn === null) this._dhwOn = false;
    let reason = r.reason;
    if (!priceOn && !on && r.state === 'off' && /wartet/.test(reason)) reason = `Preisoptimierung erst ab ${d.priceFrom.split('-').reverse().join('.')}`;
    this.dhwCurrent = {
      on, reason, priceOn, delay: delayInfo, deadlineMs: r.deadlineMs, live, tempWW, target: targetOverride === null ? d.targetTemp : targetOverride, soll: sollRaw, modeBlocked, executed, window: cheap, paused: this.paused.dhw,
    };
  }

  /**
   * Warmwasser verzögern (Option): entscheidet, ob der WW-Soll per Flow abgesenkt bzw. wieder freigegeben wird (siehe dhwDelay.js).
   * Die Absenkung braucht den Flow «verzögern» (aussen) und den Flow «zurück auf Normal» (flowOff des Programms), beides ohne eigene Logik.
   * @returns {{ enabled:boolean, active:boolean, releaseAt:number|null, reason:string }}
   */
  async _runDelay({
    cfg, d, nowMs, live, tempWW, priceOn, sgActive,
  }) {
    const dc = d.delay;
    const info = (reason) => ({
      enabled: dc.enabled, active: this.dhwDelay.active, releaseAt: this.dhwDelay.active ? this.dhwDelay.releaseAt : null, reason,
    });
    if (!dc.enabled && !this.dhwDelay.active) return info('Verzögern ist aus');
    const del = decideDelay({
      cfg: dc,
      st: this.dhwDelay,
      nowMs,
      tz: this.tz,
      tempWW,
      sollBase: this._dhwSollBase,
      hyst: d.targetHyst,
      forecastKwh: this.pv.remainingTodayKwh(nowMs, this.tz),
      priceOn,
      paused: this.paused.dhw,
      sgActive,
      dhwRunning: this._dhwOn === true,
    });
    if (del.action === 'start') {
      // Ohne Karte bzw. die beiden Flows lässt sich weder absenken noch freigeben: dann gar nicht erst verzögern
      const viaCard = this._hasSetpointOut(d);
      if (!viaCard && (d.output !== 'flows' || !dc.flowDelay.id || !d.flowOff.id)) return info('Verzögern braucht die Aktionskarte oder die Flows «verzögern» und «zurück auf Normal»');
      try {
        if (viaCard) await this._writeSetpoint(d, 'delay', d.setpoint.delayC, live);
        else await this.actuators.consumer(null, true, { live, flow: dc.flowDelay });
      } catch (err) {
        this.log(`[EMS] Warmwasser verzögern: ${err && err.message}`);
        return info(`Fehler beim Absenken: ${err && err.message}`);
      }
      const day = localDateKey(new Date(nowMs), this.tz);
      this.dhwDelay = {
        active: true, since: nowMs, releaseAt: del.releaseAt, day, lastDay: day, why: del.reason,
      };
      this._dhwBaseHoldUntil = nowMs + DHW_BASE_HOLD_MS;
      this._save('dhwDelay', this.dhwDelay);
      this.log(`[EMS] Warmwasser verzögert${live ? '' : ' (simuliert)'}: ${del.reason}`);
      return info(del.reason);
    }
    if (del.action === 'release' || del.action === 'end') {
      await this._endDelay(d, cfg, nowMs, del.action === 'release', [], del.reason);
      return info(del.reason);
    }
    return info(del.reason);
  }

  /** Verzögerung beenden: mit Flow «zurück auf Normal» (Soll wieder freigeben) oder ohne (das Programm hat den Soll schon angehoben). */
  async _endDelay(d, cfg, nowMs, callFlow, executed, why = '') {
    const viaCard = this._hasSetpointOut(d);
    if (callFlow && (viaCard || (d.flowOff && d.flowOff.id))) {
      try {
        const live = d.live === true && cfg.silent !== true && !!this.actuators;
        if (viaCard) await this._writeSetpoint(d, 'normal', this._normalSetpoint(d.setpoint), live);
        else await this.actuators.consumer(null, true, { live, flow: d.flowOff });
      } catch (err) {
        // Freigabe fehlgeschlagen: Zustand bleibt aktiv, nächster Lauf versucht es erneut
        this.log(`[EMS] Warmwasser verzögern, Freigabe: ${err && err.message}`);
        return;
      }
    }
    this.dhwDelay = { ...this.dhwDelay, active: false, releaseAt: null };
    this._dhwBaseHoldUntil = nowMs + DHW_BASE_HOLD_MS;
    this._save('dhwDelay', this.dhwDelay);
    this.log(`[EMS] Warmwasser: Verzögerung beendet${why ? ` (${why})` : ''}`);
  }

  /**
   * Preise des ganzen lokalen Tages (auch die schon vergangenen) und von morgen - nötig für «die günstigsten N Stunden des Tages»:
   * mit nur den kommenden Preisen würde am Abend jede Viertelstunde dazugehören. Ohne Speicher-Zugriff (Tests): die aktuellen Preise.
   */
  dayPrices(nowMs) {
    const day0 = startOfLocalDay(new Date(nowMs), this.tz).getTime();
    const all = typeof this.prices.range === 'function' ? this.prices.range(day0, addLocalDays(new Date(day0), 2, this.tz).getTime()) : [];
    return all.length ? all : (this.prices.getSlots(nowMs) || []);
  }

  /** Schreibt die App den WW-Soll selbst (Aktionskarte vollständig eingestellt oder Auslöser mit Wert)? */
  _hasSetpointOut(d) {
    const sp = d.setpoint;
    return d.output === 'trigger' || (d.output === 'card' && !!(sp && sp.deviceId && sp.card));
  }

  /** Normaler WW-Soll (°C) für das Zurücksetzen: der vor Programm/Verzögerung gemerkte Soll, ersatzweise der eingestellte Normalwert. */
  _normalSetpoint(sp) {
    const b = this._dhwSollBase;
    return Number.isFinite(b) && b >= 10 && b < sp.programC ? b : sp.normalC;
  }

  /**
   * WW-Soll ausgeben (nur 10 bis 60 °C, sonst Fehler): direkt über die Aktionskarte oder als Auslöser «Warmwasser-Soll setzen» mit dem Wert,
   * den ein Flow dann an die Wärmepumpe schreibt. kind = 'program' | 'delay' | 'normal'.
   */
  async _writeSetpoint(d, kind, tempC, live) {
    if (!(tempC >= 10 && tempC <= 60)) throw new Error(`WW-Soll ${tempC} °C ausserhalb 10 bis 60 °C`);
    if (d.output === 'trigger') return this.actuators.trigger('ems_dhw_setpoint', { setpoint: tempC, kind }, { live });
    const sp = d.setpoint;
    const args = { ...sp.args, [sp.valueArg]: Math.round(tempC * sp.scale) };
    return this.actuators.card(`homey:device:${sp.deviceId}:${sp.card}`, args, { live });
  }

  /** Warmwasser-Programm der Wärmepumpe ein oder zurück auf Normal: per Flow, per Aktionskarte oder per Capability einer App. */
  async _dhwApply(sg, on, live, executed) {
    const coerce = (v) => (v === 'true' ? true : (v === 'false' ? false : v));
    try {
      if (sg.output === 'capability') {
        const d = sg.device;
        if (d.deviceId && d.capability) executed.push(await this.actuators.program(d.deviceId, d.capability, coerce(on ? d.onValue : d.offValue), { live }));
      } else if (sg.output === 'card' || sg.output === 'trigger') {
        if (this._hasSetpointOut(sg)) executed.push(await this._writeSetpoint(sg, on ? 'program' : 'normal', on ? sg.setpoint.programC : this._normalSetpoint(sg.setpoint), live));
      } else {
        const flow = on ? sg.flowOn : sg.flowOff;
        if (flow && flow.id) executed.push(await this.actuators.consumer(null, true, { live, flow }));
      }
      this._dhwOn = on;
    } catch (err) {
      this.log(`[EMS] Warmwasser-Programm ${on ? 'ein' : 'aus'}: ${err && err.message}`);
    }
  }

  async _runFuse(cfg, i, nowMs) {
    const f = cfg.fuse;
    if (!f || !f.enabled) {
      this.fuseCurrent = null; this.fuseBlocked = new Set(); this.fuseCapAmps = null; return;
    }
    const limit = limitA(f);
    const live = f.live === true && cfg.silent !== true && !!this.actuators;
    if (this.fuseSt.liveSeen !== undefined && this.fuseSt.liveSeen !== live) this.fuseSt = makeFuseState();
    this.fuseSt.liveSeen = live;
    const phasesA = Array.isArray(i.phaseA) ? i.phaseA : null;
    const devIds = f.shed.filter((e) => e.kind === 'device').map((e) => e.id);
    const states = devIds.length && this.inputs.shedStates ? await this.inputs.shedStates(devIds) : new Map();
    const chargerW = Number(i.chargerPowerW) || 0;
    const keyOf = (e) => (e.kind === 'device' ? `d:${e.id}` : (e.kind === 'flow' ? `f:${e.flow.id}` : 'charger'));
    const entries = f.shed.map((e) => ({
      ...e,
      key: keyOf(e),
      name: e.kind === 'charger' ? 'Wallbox' : (e.name || e.id || ''),
      active: e.kind === 'charger' ? !!cfg.charger.id && chargerW > 500 : (e.kind === 'device' ? !!(states.get(e.id) && states.get(e.id).on) : true),
    }));
    const wasOver = this.fuseSt.overSince !== null;
    const step = stepFuse({
      st: this.fuseSt, phasesA, limit, nowMs, holdMs: f.holdS * 1000, restoreMs: f.restoreMin * 60000, entries,
    });
    const ev = (action, extra = {}) => this._noteFuseEvent({
      ts: nowMs, action, maxA: step.max === null ? null : Math.round(step.max * 10) / 10, phase: step.phase, live, ...extra,
    });
    if (step.over && !wasOver) ev('over');
    const chargerByEms = cfg.charger.live === true && cfg.silent !== true;
    if (step.action === 'shed') {
      const e = step.entry;
      let result = null;
      try {
        if (e.kind === 'charger') {
          // Steuert das EMS die Wallbox, stoppt sie über die Obergrenze 0 A (unten); sonst direkt - per eigenem
          // Aus-Flow, falls einer hinterlegt ist (Sonderfall), sonst mit dem Stopp-Befehl der Wallbox.
          if (!chargerByEms) {
            result = e.offFlow
              ? await this.actuators.shed(null, { live, offFlow: e.offFlow })
              : (live ? await this.actuators.charger(cfg.charger.id, { type: 'stop' }, { live, cards: this._cards(cfg.charger) }) : null);
          }
        } else if (e.kind === 'device') {
          result = await this.actuators.shed(e.id, { live, offFlow: e.offFlow });
        } else {
          result = await this.actuators.consumer(null, false, { live, flow: e.flow });
        }
      } catch (err) {
        result = { error: err && err.message };
        this.log(`[EMS] Hausanschluss: ${e.name} ausschalten fehlgeschlagen: ${err && err.message}`);
      }
      this.log(`[EMS] Hausanschluss: Phase ${step.phase} ${step.max} A über ${limit} A - ${e.name} aus${live ? '' : ' (simuliert)'}`);
      ev('shed', { name: e.name, error: result && result.error ? result.error : null });
    } else if (step.action === 'release') {
      ev('release');
    }
    this.fuseBlocked = new Set(this.fuseSt.shed.map((k) => (k.startsWith('d:') ? k.slice(2) : k)));
    // Obergrenze der Wallbox: 0 nach dem Abschalten, sonst (Drosseln) der freie Strom der knappsten Phase
    let cap = null;
    if (this.fuseBlocked.has('charger')) cap = 0;
    else if (f.throttle && phasesA) {
      cap = chargerCapAmps({
        phasesA, limit, chargerW, chargerPhases: i.chargerPhases || cfg.charger.phases, maxAmps: cfg.charger.maxAmps,
      });
    }
    this.fuseCapAmps = cap;
    const throttling = cap !== null && cap < cfg.charger.maxAmps && chargerW > 500;
    if (throttling !== this._fuseThrottling) {
      ev(throttling ? 'throttle' : 'throttle_end', { capAmps: cap });
      this._fuseThrottling = throttling;
    }
    this.fuseCurrent = {
      at: nowMs,
      live,
      limitA: limit,
      phasesA,
      gridW: Number.isFinite(i.gridW) ? i.gridW : null, // Netzzähler: + Bezug, - Einspeisung
      maxA: step.max,
      phase: step.phase,
      over: step.over,
      capAmps: cap,
      shed: entries.filter((e) => this.fuseSt.shed.includes(e.key)).map((e) => e.name),
      error: phasesA && phasesA.some((v) => v !== null) ? null : 'Phasenströme nicht lesbar',
    };
    // Tagesspitze für das Widget «Hausanschluss»: gespeichert nur, wenn sie steigt oder ein neuer Tag beginnt
    const peak = stepFusePeak(this.fusePeak, this.fuseCurrent, this.tz);
    if (peak !== this.fusePeak) {
      this.fusePeak = peak;
      this._save('fusePeak', peak);
    }
  }

  /** Gespeicherte Aufträge fortschreiben (abgeschlossene Viertelstunden zählen, fertige und abgelaufene entfernen). */
  _stepJobs(nowMs) {
    const out = new Map();
    if (!this.jobs) return out;
    const slots = this.prices.range(nowMs - 3600 * 1000, nowMs + 50 * 3600 * 1000);
    for (const job of this.jobs.list().slice()) {
      const r = stepJob({ job, slots, nowMs });
      if (r.status !== 'active') {
        const next = rollJob(job, nowMs, this.tz);
        if (next) {
          this.jobs.update(next);
          this.log(`[EMS] Auftrag ${job.id}: ${r.status === 'done' ? 'erledigt' : 'abgelaufen'}, nächste Frist ${new Date(next.deadline).toISOString()}`);
          continue;
        }
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

  /** Das Gerät läuft in dieser Viertelstunde (z. B. wegen Überschuss): sie zählt sofort zur Laufzeit des Auftrags, der Rest wird nur noch für die fehlende Zeit eingeplant. */
  _countJobQuarter(id, nowMs) {
    const job = this.jobs && this.jobs.get(id);
    if (!job) return;
    const nowQ = Math.floor(nowMs / 900000) * 900000;
    const ran = job.ran || [];
    const notBefore = Number.isFinite(job.from) ? Math.floor(job.from / 900000) * 900000 : 0;
    if (ran.includes(nowQ) || nowQ < notBefore || nowQ >= job.deadline) return;
    this.jobs.update({ ...job, ran: [...ran, nowQ].sort((a, b) => a - b) });
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

  /**
   * Sofortladen mit Grenze: geladene Energie seit dem Einschalten mitzählen (Leistung x Zeit) und bei erreichtem Ladestand
   * oder erreichter Energie ausschalten. @returns {boolean} true = Grenze erreicht (in diesem Lauf nicht mehr sofort laden)
   */
  _chargeNowLimit(c, i, nowMs) {
    if (c.chargeNow !== true) {
      this._cn = null; this.chargeNowProgress = null; return false;
    }
    if (!this._cn) this._cn = { at: nowMs, last: nowMs, kwh: 0 };
    const dt = Math.min(120000, Math.max(0, nowMs - this._cn.last));
    this._cn.kwh += ((Number(i.chargerPowerW) || 0) * dt) / 3600000 / 1000;
    this._cn.last = nowMs;
    const lim = c.chargeNowLimit || { kind: 'none' };
    const soc = i.carSoc === undefined ? null : i.carSoc;
    this.chargeNowProgress = {
      since: this._cn.at, kwh: Math.round(this._cn.kwh * 10) / 10, soc, limit: lim,
    };
    let reason = null;
    if (lim.kind === 'soc' && soc !== null && soc >= lim.value) reason = `Ladestand ${lim.value} % erreicht`;
    if (lim.kind === 'kwh' && this._cn.kwh >= lim.value) reason = `${lim.value} kWh geladen`;
    if (!reason) return false;
    this._cn = null;
    if (this.onChargeNowOff) {
      try {
        this.onChargeNowOff(reason);
      } catch (err) {
        this.log(`[EMS] Sofortladen aus: ${err && err.message}`);
      }
    }
    return true;
  }

  async _runCharger(cfg, i, gate, nowMs, job = null, car = null) {
    let c = cfg.charger;
    // Sofortladen ist für einen Ladevorgang gedacht: beim Abstecken wieder aus (abschaltbar)
    if (c.chargeNow === true && c.chargeNowAutoOff !== false && this._wasConnected === true && i.chargerRead && i.chargerConnected === false && this.onChargeNowOff) {
      try {
        this.onChargeNowOff('Auto abgesteckt');
      } catch (err) {
        this.log(`[EMS] Sofortladen aus: ${err && err.message}`);
      }
      c = { ...c, chargeNow: false };
    }
    if (this._chargeNowLimit(c, i, nowMs)) c = { ...c, chargeNow: false };
    if (i.chargerRead) this._wasConnected = !!i.chargerConnected;
    const live = c.live === true && cfg.silent !== true && !!this.actuators;
    const stepUp = cfg.evStepUpSoc;
    const charger = {
      id: c.id,
      connected: i.chargerConnected,
      powerW: i.chargerPowerW ?? 0,
      rawPowerW: i.chargerPowerW,
      maxAmps: this.fuseCapAmps !== null && this.fuseCapAmps !== undefined ? Math.min(c.maxAmps, Math.max(c.minAmps, this.fuseCapAmps)) : c.maxAmps,
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
      share: this._shareNow || cfg.share,
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
          executed = await this._execCharger(c.id, fs.commands, this._cards(c));
        }
      }
    } else {
      this._blindSince = null;
      // Erster Lauf nach dem Start (oder nach dem Umschalten auf live): nur den Ist-Zustand übernehmen.
      const observeOnly = !live || !this.chargerWarm;
      res = evaluateCharger({
        charger, st: this.chargerSt, env, now: nowMs, shadow: observeOnly,
      });
      const capped = applyFuseCap({
        st: this.chargerSt, commands: res.commands, capAmps: this.fuseCapAmps, minAmps: c.minAmps, phases: c.phases, now: nowMs,
      });
      let fuseNote = capped.note;
      if (capped.note) res.commands = capped.commands;
      else if (this.fuseCapAmps !== null && this.fuseCapAmps !== undefined && this.fuseCapAmps < c.maxAmps
        && this.chargerSt.currentAmps !== null && this.chargerSt.currentAmps !== undefined && this.chargerSt.currentAmps >= Math.max(c.minAmps, this.fuseCapAmps)) {
        fuseNote = `Hausanschluss: auf ${this.chargerSt.currentAmps} A begrenzt`;
      }
      if (fuseNote) res.text = res.text ? `${res.text} - ${fuseNote}` : fuseNote;
      if (live) {
        // Beobachtungslauf: Befehle verwerfen UND den Zustand zurücksetzen, sonst glaubt der Planer,
        // er hätte sie gesendet (und würde sie im nächsten Lauf nicht mehr senden).
        if (observeOnly) {
          this.chargerSt = makeChargerState(); res.commands = [];
        }
        this.chargerWarm = true;
        if (!observeOnly) executed = await this._execCharger(c.id, res.commands, this._cards(c));
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
      fuseCapAmps: this.fuseCapAmps,
      chargeNow: this.chargeNowProgress || null,
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
    const share = shareBudgetW(this._shareNow || cfg.share, i.batterySoc, i.pvW, i.gridW, i.batteryW);
    const eff = i.gridW - (share !== null && share > 0 ? share : 0);
    return Math.max(0, Math.round(-eff));
  }

  /** Flow-Karten der Wallbox aus der Konfiguration (Standard go-e). */
  _cards(c) {
    return { startCard: c.startCard, powerCard: c.powerCard, powerArg: c.powerArg };
  }

  async _execCharger(chargerId, commands, cards = {}) {
    const done = [];
    for (const cmd of commands) {
      try {
        const r = await this.actuators.charger(chargerId, cmd, { live: true, cards });
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
    const sensorIds = [
      ...list.filter((c) => c.humidity && c.humidity.enabled).map((c) => c.humidity.sensorId),
      ...list.filter((c) => c.accu && c.accu.enabled).map((c) => c.accu.sensorId),
    ];
    const deviceIds = list.filter((c) => c.controlKind !== 'flow').map((c) => c.id);
    const actual = await this.inputs.consumerStates([...new Set([...deviceIds, ...sensorIds])]);
    let changed = false;
    // Zustand VOR diesem Lauf: ein niedrig priorisierter, noch laufender Verbraucher haelt einen hoeheren am Laufen, bis er selbst aus ist
    const onBefore = new Map(list.map((x) => [x.id, !!(this.consumerStates.get(x.id) && this.consumerStates.get(x.id).isOn)]));
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
      if (this.fuseBlocked && this.fuseBlocked.has(c.id)) {
        st.isOn = false;
        result.push({
          id: c.id, name: c.name, mode: c.mode, wantOn: false, isOn: false, live, reason: 'Hausanschluss: ausgeschaltet', actualOn: a.actualOn,
        });
        continue;
      }
      if (c.mode === 'program') {
        // Nicht wie unten per allgemeinem "nicht erreichbar" abbrechen: Cloud-Geräte (z. B. ein Geschirrspüler via
        // Hersteller-App) melden sich oft als "nicht verfügbar", solange sie nicht gerade aktiv senden - das ist
        // normal, kein Fehler. decideProgram behandelt fehlende Werte schon selbst (liest sie als "unbekannt").
        // Sonst würde auch die Automatik (st.programArmed) nie sichtbar/schaltbar sein, wenn das Gerät gerade
        // offline ist.
        const pr = await this._runProgram(c, st, a, live, viaFlow, i, nowMs);
        result.push(pr.row);
        if (pr.changed) changed = true;
        if (pr.changed && pr.row && pr.row.isOn) this._lastConsumerStartAt = nowMs;
        continue;
      }
      if (!a.available) {
        result.push({
          id: c.id, name: c.name, mode: c.mode, wantOn: st.isOn, isOn: st.isOn, live, reason: 'Gerät nicht erreichbar', actualOn: null,
        });
        continue;
      }
      const before = st.isOn;
      // Priorität bei Überschuss = Reihenfolge der Liste: oben startet zuerst und geht zuletzt aus
      const surplusMode = c.mode === 'surplus';
      const holdStart = surplusMode && nowMs - this._lastConsumerStartAt < START_SETTLE_MS;
      let holdStop = false;
      if (surplusMode && st.isOn) {
        const lowerOn = list.slice(list.indexOf(c) + 1).some((x) => x.mode === 'surplus' && x.enabled && onBefore.get(x.id));
        if (lowerOn) {
          if (!st.holdStopSince) st.holdStopSince = nowMs;
          holdStop = nowMs - st.holdStopSince < HOLD_STOP_MAX_MS;
        } else st.holdStopSince = null;
      } else st.holdStopSince = null;
      const r = evaluateConsumer({
        cfg: c,
        st,
        env: {
          soc: i.batterySoc,
          gridW: i.gridW,
          batteryW: i.batteryW,
          pvW: i.pvW,
          share: this._shareNow || cfg.share,
          hasBattery: !!cfg.battery.deviceId,
          forecastGateBlocks: gate.blocked,
          // Trockenlauf: das Gerät wird nicht geschaltet, also zählt sein Ist-Zustand nicht (sonst Scheinwechsel).
          holdStart,
          holdStop,
          actualOn: live ? a.actualOn : null,
          powerW: live ? a.powerW : null,
          humidity: this._humidity(c, actual),
          accu: this._accu(c, actual),
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
      else if (jobStates.get(c.id) && st.isOn) this._countJobQuarter(c.id, nowMs); // läuft aus anderem Grund (z. B. Überschuss): zählt zur Mindestlaufzeit
      if (before !== st.isOn) changed = true;
      if (!before && st.isOn) this._lastConsumerStartAt = nowMs;
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

  /**
   * Verbraucher-Typ «Programm starten» (mode === 'program'): ein Start-Befehl statt Dauerschalten, siehe
   * lib/ems/planner/program.js. Läuft ausserhalb von evaluateConsumer, weil es kein Ein/Aus kennt.
   */
  async _runProgram(c, st, a, live, viaFlow, i, nowMs) {
    const p = c.program;
    const remoteValue = p.remoteCapability && !viaFlow ? (a.raw ? a.raw[p.remoteCapability] : undefined) : undefined;
    const doorValue = p.doorCapability && !viaFlow ? (a.raw ? a.raw[p.doorCapability] : undefined) : undefined;
    const stateValue = p.stateCapability && !viaFlow ? (a.raw ? a.raw[p.stateCapability] : undefined) : undefined;
    const dischargeW = Number.isFinite(i.batteryW) ? Math.max(0, -i.batteryW) : 0;
    const chargingW = Number.isFinite(i.batteryW) ? Math.max(0, i.batteryW) : 0;
    const exportW = (Number.isFinite(i.gridW) ? -i.gridW : 0) - dischargeW + chargingW;
    const before = st.programStartedAt;
    const forceNow = !!(this._forceProgram && this._forceProgram.has(c.id));
    if (forceNow) this._forceProgram.delete(c.id);
    const r = decideProgram({
      cfg: p,
      st,
      remoteValue: remoteValue === undefined ? null : remoteValue,
      doorValue: doorValue === undefined ? null : doorValue,
      stateValue: stateValue === undefined ? null : stateValue,
      exportW,
      slots: this.prices.getSlots(nowMs),
      nowMs,
      tz: this.tz,
      forceNow,
    });
    const executed = [];
    if (r.disarmed && !r.start) this.log(`[EMS] ${c.name}: ${r.reason}`);
    if (r.start) {
      try {
        const out = viaFlow
          ? await this.actuators.consumer(c.id, true, { live, flow: c.flowOn })
          : await this.actuators.program(c.id, p.startCapability, p.startValue, { live });
        executed.push({ ...out, ok: true });
      } catch (err) {
        executed.push({ cmd: 'program', ok: false, error: err && err.message });
        this.log(`[EMS] ${c.name}: Programmstart fehlgeschlagen: ${err && err.message}`);
      }
      this._noteConsumerEvent({
        ts: nowMs, id: c.id, name: c.name, cmd: 'program', live, reason: r.reason, soc: i.batterySoc,
      });
    }
    return {
      changed: before !== st.programStartedAt,
      row: {
        id: c.id,
        name: c.name,
        mode: c.mode,
        wantOn: r.start,
        // «läuft» = innerhalb der üblichen Programmdauer seit dem Start, sonst bliebe das Gerät für immer "an" (Planansicht)
        isOn: !!st.programStartedAt && nowMs - st.programStartedAt < p.durationH * 3600000,
        live,
        reason: r.reason,
        actualOn: a.actualOn,
        executed,
        blocked: r.blocked,
        deadlineMs: r.deadlineMs,
        startedAt: st.programStartedAt,
        armed: !!st.programArmed,
        armWaitH: st.programArmed && Number.isFinite(st.armWaitH) ? st.armWaitH : null,
      },
    };
  }

  /**
   * Manueller Start eines «Programm starten»-Verbrauchers (Widget/Flow): überspringt PV-/Preis-Logik und die
   * Einmal-pro-Tag-Grenze, respektiert aber weiterhin Fernbedienung/Tür/Status. Löst sofort einen Lauf aus.
   */
  async forceProgramStart(consumerId) {
    if (!this._forceProgram) this._forceProgram = new Set();
    this._forceProgram.add(consumerId);
  }

  /**
   * Automatik für einen «Programm starten»-Verbraucher bewusst ein- oder ausschalten (Widget/Flow). Sie gilt für einen Lauf:
   * nach dem Start oder wenn die Wartezeit abgelaufen ist, geht sie von selbst aus (siehe decideProgram) - und nicht über einen
   * App-Neustart hinweg (absichtlich nicht persistiert, Ausfallsicherheit).
   */
  setProgramArmed(consumerId, on, waitH = null) {
    let st = this.consumerStates.get(consumerId);
    if (!st) {
      st = makeConsumerState();
      this.consumerStates.set(consumerId, st);
    }
    st.programArmed = !!on;
    // Einschaltzeit und gewählte Wartezeit (1 bis 12 h, sonst die Standard-Wartezeit des Geräts): das Fenster beginnt jetzt
    st.armedAt = on ? Date.now() : null;
    const w = Number(waitH);
    st.armWaitH = on && Number.isFinite(w) && w > 0 ? Math.min(12, Math.max(1, w)) : null;
  }

  /** Aktuelle Luftfeuchte für den Notlauf eines Verbrauchers, oder null (kein Sensor / nicht lesbar). */
  /** Ladestand des Akkus eines Verbrauchers (0 bis 1 wird zu Prozent), oder null. */
  _accu(c, actual) {
    if (!c.accu || !c.accu.enabled) return null;
    const s = actual.get(c.accu.sensorId);
    if (!s || !s.available) return null;
    const v = s.values ? s.values[c.accu.capability] : undefined;
    if (!Number.isFinite(v)) return null;
    return v > 0 && v <= 1 ? Math.round(v * 1000) / 10 : v;
  }

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
