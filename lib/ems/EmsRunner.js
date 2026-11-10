'use strict';

const { decideBattery } = require('./planner/battery');
const { currentSlot } = require('./planner/slots');
const { evaluateCharger, makeChargerState, CONSTANTS: CC } = require('./planner/charger');
const { evaluateConsumer, makeConsumerState } = require('./planner/consumer');
const { forecastGate } = require('./planner/forecastGate');

const PRICE_REFRESH_MS = 10 * 60 * 1000;
const PV_REFRESH_MS = 15 * 60 * 1000;
const SNAPSHOT_MAX_AGE_MS = 5000;
const MAX_CONSUMER_EVENTS = 100;
const IDLE_MS = 5 * 60 * 1000;

/**
 * Ein Durchlauf des EMS: Eingänge lesen, entscheiden, protokollieren und (nur wo `live` gesetzt
 * ist) die Befehle über die Ausgänge senden. Alle Abhängigkeiten werden übergeben (Tests mit Attrappen).
 *
 *   Batterie    nur Schattenmodus (Andis EMS steuert die Batterie weiter)
 *   Wallbox     Schattenmodus oder live (`charger.live`)
 *   Verbraucher Schattenmodus oder live (je Verbraucher `live`)
 */
class EmsRunner {
  constructor({
    getConfig, prices, pv, inputs, actuators = null, shadowLog, chargerLog = null, store = null,
    tz = 'Europe/Zurich', log = () => {},
  }) {
    this.getConfig = getConfig;
    this.prices = prices;
    this.pv = pv;
    this.inputs = inputs;
    this.actuators = actuators;
    this.shadowLog = shadowLog;
    this.chargerLog = chargerLog;
    this.store = store;
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
    this._loadConsumerStates();
    this._snapshot = null;
  }

  _load(key, fallback) {
    try {
      const v = this.store ? this.store.get(key) : null;
      return v === undefined || v === null ? fallback : v;
    } catch (err) { return fallback; }
  }

  _save(key, value) {
    try { if (this.store) this.store.set(key, value); } catch (err) { /* nicht kritisch */ }
  }

  _loadConsumerStates() {
    const saved = this._load('consumerStates', {});
    for (const [id, s] of Object.entries(saved || {})) {
      this.consumerStates.set(id, { ...makeConsumerState(), isOn: s.isOn === true, startedAt: s.startedAt ?? null, stoppedAt: s.stoppedAt ?? null });
    }
  }

  _saveConsumerStates() {
    const out = {};
    for (const [id, s] of this.consumerStates) out[id] = { isOn: s.isOn, startedAt: s.startedAt, stoppedAt: s.stoppedAt };
    this._save('consumerStates', out);
  }

  // ------------------------------------------------------------ Batterie (Schattenmodus)

  async tick(nowMs = Date.now()) {
    const cfg = this.getConfig();
    const b = cfg.battery;

    if (!this.prices.fetchedAt || nowMs - this.prices.fetchedAt > PRICE_REFRESH_MS) await this.prices.refresh(nowMs);
    if (!this.pv.fetchedAt || nowMs - this.pv.fetchedAt > PV_REFRESH_MS) await this.pv.refresh(nowMs);

    const bat = await this.inputs.battery(b);
    const andi = await this.inputs.andiBatteryPlan(b.deviceId);

    const slots = this.prices.getSlots(nowMs);
    const solarKwh = this.pv.forecastKwh(nowMs, b.lookaheadHours || 24);
    const capacityKwh = bat.capacityKwh && bat.capacityKwh > 0 ? bat.capacityKwh : b.capacityKwh;

    const mine = decideBattery({
      cfg: { ...b, capacityKwh }, soc: bat.soc, slots, solarKwh, prev: this.prev, nowMs,
    });

    const cur = currentSlot(slots, nowMs);
    this.prev = { mode: mine.mode, slotStart: cur ? cur.start : null };
    this.shadowLog.record({ nowMs, soc: bat.soc, price: cur ? cur.price : null, mine, andi });

    this.lastTickAt = nowMs;
    this.errors = [bat.error, this.prices.error, this.pv.error].filter(Boolean);
    this.current = {
      at: nowMs, soc: bat.soc, capacityKwh, price: cur ? cur.price : null, mine, andi,
      priceSlots: slots.length, priceFetchedAt: this.prices.fetchedAt, pvFactor: this.pv.factor, errors: this.errors,
    };
    return this.current;
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
      mode: cfg.forecastGate.mode, kwh: cfg.forecastGate.kwh, soc: i.batterySoc, capacityKwh,
      remainingKwh: remaining, stale: remaining === null, hasBattery: true, wasBlocked: this.gateBlocked,
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
    if (!this.pv.fetchedAt || nowMs - this.pv.fetchedAt > PV_REFRESH_MS) await this.pv.refresh(nowMs);
    const i = await this._readSnapshot(cfg, nowMs);
    const gate = this._gate(cfg, i, nowMs);

    let chargerBusy = false;
    if (cfg.charger.enabled) chargerBusy = await this._runCharger(cfg, i, gate, nowMs);
    const consumersActive = await this._runConsumers(cfg, i, gate, nowMs);

    if (chargerBusy) return 15 * 1000;
    return consumersActive ? 30 * 1000 : IDLE_MS;
  }

  async _runCharger(cfg, i, gate, nowMs) {
    const c = cfg.charger;
    const live = c.live === true && !!this.actuators;
    const stepUp = cfg.evStepUpSoc;
    const charger = {
      id: c.id, connected: i.chargerConnected, powerW: i.chargerPowerW ?? 0, rawPowerW: i.chargerPowerW,
      maxAmps: c.maxAmps, minAmps: c.minAmps, phases: c.phases, phaseSwitch: c.phaseSwitch,
      stepHoldMs: c.stepHoldS * 1000, stepDownHoldMs: c.stepDownHoldS * 1000,
      batFullTopUp: stepUp > 0, batFullOnPct: stepUp || CC.BAT_FULL_ON_PCT,
      batFullOffPct: Math.max(0, (stepUp || CC.BAT_FULL_ON_PCT) - CC.BAT_FULL_GAP_PCT),
    };
    // Im Trockenlauf darf Andis Schalter "Sofortladen" mitzählen (Vergleich); live zählt nur der eigene.
    const chargeNow = c.chargeNow === true || (!live && i.chargeNow === true);
    const env = {
      gridW: i.gridW, pvW: i.pvW, houseW: i.houseW,
      battery: { soc: i.batterySoc, powerW: i.batteryW }, hasBattery: true,
      share: cfg.share, chargeNow, forecastGateBlocks: gate.blocked,
      gridImportLimitKw: cfg.gridImportLimitKw, gridCommittedW: Math.max(0, i.gridW || 0),
      chargerPhases: i.chargerPhases,
    };

    let res;
    let executed = [];
    let warning = null;
    const notChosen = !cfg.devices.meter.id || !c.id;
    if (notChosen || i.gridW === null || !i.chargerRead) {
      const text = notChosen ? 'Geräte noch nicht gewählt (Einstellungen)' : (i.gridW === null ? 'Netzzähler nicht lesbar' : 'Wallbox nicht lesbar');
      res = { mode: 'error', text, allocatedW: 0, commands: [] };
    } else {
      // Erster Lauf nach dem Start (oder nach dem Umschalten auf live): nur den Ist-Zustand übernehmen.
      const observeOnly = !live || !this.chargerWarm;
      res = evaluateCharger({ charger, st: this.chargerSt, env, now: nowMs, shadow: observeOnly });
      if (live) {
        // Beobachtungslauf: Befehle verwerfen UND den Zustand zurücksetzen, sonst glaubt der Planer,
        // er hätte sie gesendet (und würde sie im nächsten Lauf nicht mehr senden).
        if (observeOnly) { this.chargerSt = makeChargerState(); res.commands = []; }
        this.chargerWarm = true;
        if (!observeOnly) executed = await this._execCharger(c.id, res.commands);
        if (i.andi && ['solar_ev', 'instant_ev', 'price_ev'].includes(i.andi.mode)) {
          warning = 'Andis EMS steuert die Wallbox ebenfalls - dort die Wallbox ausschalten';
        }
      } else {
        this.chargerWarm = false;
      }
    }

    this.chargerCommands = res.commands;
    this.chargerCurrent = {
      at: nowMs, live, mine: { mode: res.mode, reason: res.text }, andi: i.andi, commands: res.commands, executed, warning,
      connected: i.chargerConnected, state: i.chargerState, chargerPowerW: i.chargerPowerW,
      gridW: i.gridW, pvW: i.pvW, houseW: i.houseW, batterySoc: i.batterySoc, batteryW: i.batteryW,
      budgetW: res.budgetW ?? null, gate, targetAmps: this.chargerSt.currentAmps,
    };
    if (this.chargerLog) {
      this.chargerLog.record({
        nowMs, soc: i.batterySoc, price: null, mine: { mode: res.mode, reason: res.text }, andi: i.andi,
      });
    }
    return !!(i.chargerConnected || chargeNow);
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

  async _runConsumers(cfg, i, gate, nowMs) {
    const list = cfg.consumers.filter((c) => c.enabled);
    const result = [];
    if (!list.length) { this.consumerCurrent = []; return false; }
    const actual = await this.inputs.consumerStates(list.map((c) => c.id));
    let changed = false;
    for (const c of list) {
      let st = this.consumerStates.get(c.id);
      if (!st) { st = makeConsumerState(); this.consumerStates.set(c.id, st); }
      const a = actual.get(c.id) || { actualOn: null, powerW: null, available: false };
      const live = c.live === true && !!this.actuators;
      // Schalter gewechselt (Trockenlauf <-> live): der simulierte Zustand passt nicht mehr zum Gerät.
      if (st.liveSeen !== undefined && st.liveSeen !== live) {
        st = makeConsumerState();
        this.consumerStates.set(c.id, st);
      }
      st.liveSeen = live;
      if (!a.available) {
        result.push({ id: c.id, name: c.name, mode: c.mode, wantOn: st.isOn, isOn: st.isOn, live, reason: 'Gerät nicht erreichbar', actualOn: null });
        continue;
      }
      const before = st.isOn;
      const r = evaluateConsumer({
        cfg: c, st,
        env: {
          soc: i.batterySoc, gridW: i.gridW, batteryW: i.batteryW, pvW: i.pvW, share: cfg.share,
          forecastGateBlocks: gate.blocked,
          // Trockenlauf: das Gerät wird nicht geschaltet, also zählt sein Ist-Zustand nicht (sonst Scheinwechsel).
          actualOn: live ? a.actualOn : null, powerW: live ? a.powerW : null,
        },
        now: nowMs,
      });
      const executed = [];
      for (const cmd of r.commands) {
        changed = true;
        try {
          const out = await this.actuators.consumer(c.id, cmd.type === 'on', { live });
          executed.push({ ...out, ok: true });
        } catch (err) {
          executed.push({ cmd: cmd.type, ok: false, error: err && err.message });
          this.log(`[EMS] ${c.name}: Befehl ${cmd.type} fehlgeschlagen: ${err && err.message}`);
        }
        this._noteConsumerEvent({ ts: nowMs, id: c.id, name: c.name, cmd: cmd.type, live, reason: r.reason, soc: i.batterySoc });
      }
      if (before !== st.isOn) changed = true;
      result.push({ id: c.id, name: c.name, mode: c.mode, wantOn: r.wantOn, isOn: st.isOn, live, reason: r.reason, actualOn: a.actualOn, executed });
    }
    this.consumerCurrent = result;
    if (changed) this._saveConsumerStates();
    return true;
  }

  _noteConsumerEvent(e) {
    this.consumerEvents.push(e);
    if (this.consumerEvents.length > MAX_CONSUMER_EVENTS) this.consumerEvents.splice(0, this.consumerEvents.length - MAX_CONSUMER_EVENTS);
    this._save('consumerEvents', this.consumerEvents);
    this.log(`[EMS] ${e.name}: ${e.cmd === 'on' ? 'ein' : 'aus'}${e.live ? '' : ' (Trockenlauf)'} - ${e.reason}`);
  }
}

module.exports = { EmsRunner };
