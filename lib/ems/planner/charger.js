'use strict';

/**
 * Wallbox-Planer (go-e): Solar-Überschuss laden mit Ampere-Stufen, Phasenumschaltung,
 * Batterie-Schutz und "Akku voll"-Regel.
 *
 * Reine, zustandsbehaftete Funktion: gibt BEFEHLE zurück (start / set / stop), führt keine aus.
 * Algorithmen nach Andi Wirz' FusionSolar-EMS (lib/ems/chargerControl.js, lib/ems/battery.js,
 * lib/ems/constants.js, MIT-Lizenz), neu geschrieben ohne Homey-Abhängigkeit.
 *
 * Umfang (Konfiguration von Richard: ein go-e im Modus "solar_price", keine Autos, kein
 * Off-Peak, kein Niedertarif): Sofortladen (charge_now), Batterie-Hartstopp samt Überlauf-
 * Ausnahme, kein EV, Solar-Überschuss-Schleife, Prognose-Sperre, Akku-voll-Regel, Anlauf-Wache.
 * NICHT enthalten: Off-Peak, Niedertarif, preisoptimiertes Netzladen für Autos (ohne Auto
 * liefert Andis Logik dort ebenfalls "nicht laden"), Ladeziel pro Auto.
 *
 * Schattenmodus (`shadow: true`): Der Planer steuert nichts. Damit der Vergleich mit dem echten
 * Verhalten sinnvoll bleibt, übernimmt er den Ist-Zustand des Laders (Strom, Phasen) jeden Takt
 * aus der Messung, statt seinen eigenen Befehlen zu glauben. Die Anlauf-Wache entfällt dann.
 */

const AMPS_LADDER = Array.from({ length: 27 }, (_, i) => 6 + i); // 6..32 A
const C = Object.freeze({
  STEP_HOLD_MS: 30_000,
  IMPORT_HOLD_MS: 60_000,
  FLIP_COOLDOWN_MS: 5 * 60_000,
  PHASE_SWITCH_COOLDOWN_MS: 10 * 60_000,
  CHARGER_START_GRACE_MS: 90_000,
  CHARGER_START_GIVEUP_MS: 5 * 60_000,
  CHARGER_IGNORED_BACKOFF_MS: 5 * 60_000,
  CHARGER_IGNORED_BACKOFF_MAX_MS: 30 * 60_000,
  CHARGER_LIVE_W: 500,
  IMPORT_ACT_W: 200,
  EXPORT_GUARD_W: 200,
  UP_MARGIN_W: 250,
  MIN_3PH_W: 6 * 3 * 230,
  PHASE_UP_MARGIN_W: 3 * 230,
  MIN_CHARGE_W: 6 * 230,
  OVERFLOW_KEEP_W: (6 * 230) / 2,
  OVERFLOW_START_W: 6 * 230 + (6 * 230) / 2,
  BAT_FULL_ON_PCT: 97,
  BAT_FULL_GAP_PCT: 4,
  BAT_FULL_SETTLE_W: 100,
  BAT_FULL_SETTLE_MS: 15 * 60_000,
  VOLT: 230,
});

function makeChargerState() {
  return {
    currentAmps: null,
    currentPhases: null,
    pendingStepAmps: null,
    pendingStepSince: null,
    pendingDownSince: null,
    lastDownStepAt: null,
    lastPhaseSwitchAt: null,
    commandedSince: null,
    startRetried: false,
    startBlockedUntil: null,
    ignoredStreak: 0,
    batFull: false,
    batFullSettleUntil: null,
    importSince: null,
  };
}

// ---------------------------------------------------------------- Batterie-Hilfen

/** Anteil des Überschusses für Geräte (0..1), linear über den SoC; null = Rampe nicht konfiguriert. */
function surplusShare(share, soc) {
  const lo = Number(share && share.socLow) || 0;
  const hi = Number(share && share.socHigh) || 0;
  if (!(hi > lo) || soc === null || soc === undefined) return null;
  const pctLo = (Number(share.pctLow) || 0) / 100;
  const pctHi = (share.pctHigh === undefined ? 100 : Number(share.pctHigh)) / 100;
  if (soc < lo) return 0;
  const t = Math.min(1, Math.max(0, (soc - lo) / (hi - lo)));
  return Math.min(1, Math.max(0, pctLo + t * (pctHi - pctLo)));
}

/** Wie viel MEHR als der aktuelle Export die Geräte ziehen dürfen (W), oder null. */
function shareBudgetW(share, soc, pvW, gridW, batteryW = null) {
  const s = surplusShare(share, soc);
  if (s === null || pvW === null || gridW === null) return null;
  const exportW = Math.max(0, -gridW);
  const claimW = Math.max(0, Math.round(Math.max(0, pvW) * s - exportW));
  if (typeof batteryW !== 'number') return claimW;
  return Math.min(claimW, Math.max(0, Math.round(batteryW)));
}

/** Obergrenze für die Gesamtleistung aller Geräte (W) oder null ohne Rampe. */
function rampAllowanceW(share, soc, pvW) {
  const s = surplusShare(share, soc);
  if (s === null || pvW === null) return null;
  return Math.max(0, Math.round(Math.max(0, pvW) * s));
}

/** Hartstopp-Schwelle: ist die Rampe konfiguriert, ist ihr unterer Punkt die Schwelle. */
function batteryLow(share, soc, hasBattery) {
  const lo = Number(share && share.socLow) || 0;
  const rampOn = (Number(share && share.socHigh) || 0) > lo;
  const hardStop = rampOn ? lo : Number(share && share.minSoc) || 0;
  const socKnown = soc !== null && soc !== undefined;
  return hardStop > 0 && (socKnown ? soc < hardStop : hasBattery);
}

// ---------------------------------------------------------------- Phasen und Stufen

function bestPhases(budgetW, currentPhases = 1, fullBattery = false) {
  const shift = fullBattery ? 3 * C.VOLT : 0;
  if (currentPhases === 3) return budgetW >= C.MIN_3PH_W - shift ? 3 : 1;
  return budgetW >= (C.MIN_3PH_W + C.PHASE_UP_MARGIN_W - shift) ? 3 : 1;
}

/** Hauptsicherung: höchste Stufe, die noch unter die Netzbezugsgrenze passt. */
function gridClaimAmps(env, minAmps, desiredAmps, phases, currentDrawW = 0) {
  const limitKw = Number(env.gridImportLimitKw) || 0;
  if (limitKw <= 0) return desiredAmps;
  const baselineW = (env.gridCommittedW || 0) - Math.max(0, currentDrawW);
  const headroomW = limitKw * 1000 - baselineW;
  let granted = 0;
  for (const a of AMPS_LADDER) {
    if (a >= minAmps && a <= desiredAmps && a * phases * C.VOLT <= headroomW) granted = a;
  }
  env.gridCommittedW = baselineW + granted * phases * C.VOLT;
  return granted;
}

// ---------------------------------------------------------------- Befehle

function cmdStop(st, cmds, now) {
  cmds.push({ type: 'stop' });
  st.currentAmps = null; st.pendingStepAmps = null; st.pendingStepSince = null;
  st.pendingDownSince = null; st.currentPhases = null; st.commandedSince = null;
  st.startRetried = false; st.lastDownStepAt = now;
}

function cmdSet(st, cmds, amps, phases) {
  if (st.currentAmps === null) cmds.push({ type: 'start' });
  cmds.push({ type: 'set', amps, phases });
  st.currentAmps = amps;
  st.currentPhases = phases;
}

// ---------------------------------------------------------------- Akku-voll-Regel

function fullBatteryRule(charger, st, battery, gridW, sustainedImport, budgetW, now) {
  const soc = battery ? battery.soc : null;
  const batW = battery ? battery.powerW : null;
  const known = charger.batFullTopUp !== false
    && typeof soc === 'number' && Number.isFinite(soc)
    && typeof batW === 'number' && Number.isFinite(batW);
  const onPct = Number.isFinite(charger.batFullOnPct) ? charger.batFullOnPct : C.BAT_FULL_ON_PCT;
  const offPct = Number.isFinite(charger.batFullOffPct) ? charger.batFullOffPct : onPct - C.BAT_FULL_GAP_PCT;
  const settleMs = Math.max(C.BAT_FULL_SETTLE_MS, (charger.stepDownHoldMs || 0) + 5 * 60_000);
  const running = (st.currentAmps ?? 0) > 0;
  const was = st.batFull === true;
  const full = known && (was ? soc >= offPct : soc >= onPct);
  if (full !== was) {
    st.batFull = full;
    st.batFullSettleUntil = full ? null : now + settleMs;
  }
  if (!known) { st.batFullSettleUntil = null; return null; }
  if (sustainedImport || (gridW !== null && gridW >= C.IMPORT_ACT_W)) return null;
  const dischargeW = batW < 0 ? -batW : 0;
  const baseW = Math.max(0, budgetW - dischargeW);
  if (full) return { baseW, roundUp: true };
  if (st.batFullSettleUntil) {
    if (!running || now >= st.batFullSettleUntil || dischargeW < C.BAT_FULL_SETTLE_W) {
      st.batFullSettleUntil = null;
      return null;
    }
    return { baseW, roundUp: false };
  }
  return null;
}

// ---------------------------------------------------------------- Stufenregler

function stepCharger(charger, st, budgetW, now, gridW, forcedDown, rule, cmds, shadow) {
  const configPhases = charger.phases;
  let cur = st.currentAmps ?? 0;
  const measuredW = Object.prototype.hasOwnProperty.call(charger, 'rawPowerW') ? charger.rawPowerW : charger.powerW;
  const hasMeter = Number.isFinite(measuredW);
  const drawnW = hasMeter ? measuredW : 0;
  if (drawnW >= C.CHARGER_LIVE_W) {
    st.commandedSince = null; st.startRetried = false; st.startBlockedUntil = null; st.ignoredStreak = 0;
    if (cur === 0) {
      const ph = st.currentPhases ?? configPhases;
      cur = Math.max(charger.minAmps, Math.round(drawnW / (ph * C.VOLT)));
      st.currentAmps = cur; st.currentPhases = ph;
    }
  }

  // Anlauf-Wache (Lader ignoriert den Start). Im Schattenmodus entfällt sie: dort wird nichts gestartet.
  if (!shadow && cur > 0 && hasMeter && drawnW < C.CHARGER_LIVE_W) {
    if (st.commandedSince === null) st.commandedSince = now;
    const silentMs = now - st.commandedSince;
    const heldPhases = st.currentPhases ?? configPhases;
    const held = { amps: cur, phases: heldPhases, allocatedW: cur * heldPhases * C.VOLT };
    if (silentMs >= C.CHARGER_START_GIVEUP_MS) {
      st.ignoredStreak += 1;
      const backoffMs = Math.min(C.CHARGER_IGNORED_BACKOFF_MAX_MS,
        C.CHARGER_IGNORED_BACKOFF_MS * (2 ** (st.ignoredStreak - 1)));
      cmdStop(st, cmds, now);
      st.startBlockedUntil = now + backoffMs;
      return { amps: 0, phases: heldPhases, allocatedW: 0 };
    }
    if (silentMs >= C.CHARGER_START_GRACE_MS && !st.startRetried) {
      st.startRetried = true;
      st.currentAmps = null;
      cmdSet(st, cmds, held.amps, heldPhases);
      return held;
    }
    return held;
  }
  if (cur === 0 && st.startBlockedUntil && now < st.startBlockedUntil) {
    return { amps: 0, phases: configPhases, allocatedW: 0 };
  }

  // --- Phasen ---
  let phases = configPhases;
  if (charger.phaseSwitch) {
    const currentPhases = st.currentPhases ?? configPhases;
    const phaseW = rule ? rule.baseW : budgetW;
    const fullUp = !!(rule && rule.roundUp);
    const targetPhases = bestPhases(phaseW, currentPhases, fullUp);
    if (targetPhases !== currentPhases) {
      if (cur > 0) {
        const cooldownOver = !st.lastPhaseSwitchAt || (now - st.lastPhaseSwitchAt) >= C.PHASE_SWITCH_COOLDOWN_MS;
        const trapped = targetPhases === 1 && currentPhases === 3;
        if ((cooldownOver || trapped) && !forcedDown) {
          const maxA = targetPhases === 1 ? Math.min(charger.maxAmps, 16) : charger.maxAmps;
          const newLadder = AMPS_LADDER.filter((a) => a >= charger.minAmps && a <= maxA)
            .map((a) => ({ amps: a, watts: a * targetPhases * C.VOLT }));
          const newFitW = fullUp ? phaseW + targetPhases * C.VOLT : phaseW;
          const newTarget = [...newLadder].reverse()
            .find((r) => (fullUp ? r.watts < newFitW : r.watts <= newFitW)) ?? newLadder[0];
          if (newTarget) {
            st.currentPhases = targetPhases; st.lastPhaseSwitchAt = now;
            st.pendingStepAmps = null; st.pendingStepSince = null;
            cmdSet(st, cmds, newTarget.amps, targetPhases);
            return { amps: newTarget.amps, phases: targetPhases, allocatedW: newTarget.amps * targetPhases * C.VOLT };
          }
        }
        phases = currentPhases;
      } else {
        phases = targetPhases;
      }
    } else {
      phases = currentPhases;
    }
  }

  // --- Stufenleiter ---
  const maxA = (charger.phaseSwitch && phases === 1) ? Math.min(charger.maxAmps, 16) : charger.maxAmps;
  const ladder = AMPS_LADDER.filter((a) => a >= charger.minAmps && a <= maxA)
    .map((a) => ({ amps: a, watts: a * phases * C.VOLT }));
  const roundUp = !!(rule && rule.roundUp);
  const fitW = rule ? (roundUp ? rule.baseW + phases * C.VOLT : rule.baseW) : budgetW;
  const fits = (r) => (roundUp ? r.watts < fitW : r.watts <= fitW);
  let target = null;
  for (const r of ladder) if (fits(r)) target = r;

  if (!target) {
    if (cur > 0) {
      if (!forcedDown && gridW !== null && gridW <= -C.EXPORT_GUARD_W) {
        const minRung = ladder[0];
        if (minRung) {
          if (minRung.amps !== cur) cmdSet(st, cmds, minRung.amps, phases);
          return { amps: minRung.amps, phases, allocatedW: minRung.amps * phases * C.VOLT };
        }
      }
      cmdStop(st, cmds, now);
    }
    return { amps: 0, phases, allocatedW: 0 };
  }

  if (forcedDown && target.amps < cur) {
    st.pendingStepAmps = null; st.pendingStepSince = null; st.pendingDownSince = null;
    st.lastDownStepAt = now;
    cmdSet(st, cmds, target.amps, phases);
    return { amps: target.amps, phases, allocatedW: target.amps * phases * C.VOLT };
  }

  const hold = { amps: cur, phases, allocatedW: cur * phases * C.VOLT };

  if (target.amps > cur) {
    st.pendingDownSince = null;
    const okCooldown = cur > 0 || !st.lastDownStepAt || (now - st.lastDownStepAt) >= C.FLIP_COOLDOWN_MS;
    if (!okCooldown) return hold;
    let up = target;
    if (cur > 0) {
      up = [...ladder].reverse().find((r) => r.amps > cur
        && (roundUp ? fits(r) : (r.watts + C.UP_MARGIN_W) <= fitW)) ?? null;
      if (!up) { st.pendingStepAmps = null; st.pendingStepSince = null; return hold; }
    }
    if (st.pendingStepAmps !== up.amps) {
      st.pendingStepAmps = up.amps; st.pendingStepSince = now;
      return hold;
    }
    const stepHoldMs = charger.stepHoldMs || C.STEP_HOLD_MS;
    if ((now - st.pendingStepSince) < stepHoldMs) return hold;
    st.pendingStepAmps = null; st.pendingStepSince = null;
    cmdSet(st, cmds, up.amps, phases);
    return { amps: up.amps, phases, allocatedW: up.amps * phases * C.VOLT };
  }

  if (target.amps < cur) {
    if (gridW !== null && gridW <= -C.EXPORT_GUARD_W) {
      st.pendingStepAmps = null; st.pendingStepSince = null; st.pendingDownSince = null;
      return hold;
    }
    const downHoldMs = charger.stepDownHoldMs || 0;
    if (downHoldMs > 0) {
      if (!st.pendingDownSince) st.pendingDownSince = now;
      if ((now - st.pendingDownSince) < downHoldMs) {
        st.pendingStepAmps = null; st.pendingStepSince = null;
        return hold;
      }
    }
    st.pendingStepAmps = null; st.pendingStepSince = null; st.pendingDownSince = null;
    st.lastDownStepAt = now;
    cmdSet(st, cmds, target.amps, phases);
    return { amps: target.amps, phases, allocatedW: target.amps * phases * C.VOLT };
  }

  st.pendingStepAmps = null; st.pendingStepSince = null; st.pendingDownSince = null;
  return { amps: target.amps, phases, allocatedW: target.amps * phases * C.VOLT };
}

// ---------------------------------------------------------------- Entscheid pro Takt

/**
 * @param {object} p
 * @param {object} p.charger  { id, connected, powerW, rawPowerW, maxAmps, minAmps, phases, phaseSwitch,
 *                              stepHoldMs, stepDownHoldMs, batFullTopUp, batFullOnPct, batFullOffPct }
 * @param {object} p.st       Zustand aus makeChargerState() (wird verändert)
 * @param {object} p.env      { gridW, pvW, houseW, battery:{soc,powerW}, hasBattery, share:{socLow,socHigh,
 *                              pctLow,pctHigh,minSoc}, chargeNow, forecastGateBlocks, gridImportLimitKw }
 * @param {number} p.now      ms
 * @param {boolean} [p.shadow]
 * @returns {{ mode:string, text:string, allocatedW:number, commands:object[], budgetW:number|null }}
 */
function evaluateCharger({ charger, st, env, now, shadow = true }) {
  const cmds = [];
  const out = (mode, text, allocatedW = 0, budgetW = null) => ({ mode, text, allocatedW, commands: cmds, budgetW });
  const battery = env.battery || { soc: null, powerW: null };
  const socStr = battery.soc !== null && battery.soc !== undefined ? ` · Bat ${Math.round(battery.soc)}%` : '';
  let gridW = env.gridW;

  // Schattenmodus: Ist-Zustand aus der Messung übernehmen.
  if (shadow) {
    const drawn = Number.isFinite(charger.rawPowerW) ? charger.rawPowerW : 0;
    if (drawn >= C.CHARGER_LIVE_W) {
      const ph = env.chargerPhases || st.currentPhases || charger.phases;
      st.currentPhases = ph;
      st.currentAmps = Math.max(charger.minAmps, Math.round(drawn / (ph * C.VOLT)));
    } else {
      st.currentAmps = null;
    }
  }

  if (charger.enabled === false) return out('idle', 'vom EMS nicht gesteuert');

  // P0: Sofortladen
  if (env.chargeNow === true) {
    if (!charger.connected) return out('idle', `kein EV verbunden${socStr}`);
    const phases = charger.phaseSwitch ? 3 : charger.phases;
    const granted = gridClaimAmps(env, charger.minAmps, charger.maxAmps, phases, charger.powerW);
    if (granted <= 0) {
      if (st.currentAmps !== null) cmdStop(st, cmds, now);
      return out('instant_ev', 'Netzbezugsgrenze erreicht');
    }
    if (st.currentAmps !== granted || st.currentPhases !== phases) cmdSet(st, cmds, granted, phases);
    return out('instant_ev', `${granted}A/${phases}ph`, granted * phases * C.VOLT);
  }

  // P1: Batterie-Priorität
  const batLow = batteryLow(env.share, battery.soc, env.hasBattery);
  let overflow = false;
  if (batLow) {
    const batCharging = battery.powerW !== null && battery.powerW !== undefined && battery.powerW > 0;
    const exportSurplusW = gridW !== null ? -gridW : 0;
    const running = (st.currentAmps ?? 0) > 0;
    const threshold = running ? C.OVERFLOW_KEEP_W : C.OVERFLOW_START_W;
    const hasOverflow = batCharging && exportSurplusW >= threshold;
    if (!hasOverflow) {
      const measuredW = Object.prototype.hasOwnProperty.call(charger, 'rawPowerW') ? charger.rawPowerW : charger.powerW;
      const drawing = Number.isFinite(measuredW) && measuredW >= C.CHARGER_LIVE_W;
      if (st.currentAmps !== null || drawing) cmdStop(st, cmds, now);
      return out('battery_priority', `${Math.round(battery.soc)}% < ${env.share.socLow || env.share.minSoc}%`);
    }
    overflow = true;
  }

  // P2: kein EV
  if (!charger.connected) {
    st.importSince = null; st.startBlockedUntil = null; st.ignoredStreak = 0;
    if (st.currentAmps !== null) cmdStop(st, cmds, now);
    const surplus = gridW !== null ? Math.round(-gridW) : null;
    return out('idle', surplus !== null && surplus > 0
      ? `${surplus} W Überschuss${socStr}` : `kein Überschuss${socStr}`);
  }

  // Netzbezug-Wache (60 s)
  const importing = gridW !== null && gridW >= C.IMPORT_ACT_W;
  st.importSince = importing ? (st.importSince ?? now) : null;
  const sustainedImport = importing && (now - st.importSince) >= C.IMPORT_HOLD_MS;
  if (sustainedImport) st.importSince = null;

  // Budget
  const totalW = charger.powerW;
  const batDischarging = battery.powerW !== null && battery.powerW !== undefined && battery.powerW < 0;
  const batCharging = battery.powerW !== null && battery.powerW !== undefined && battery.powerW > 0;
  const batCorr = batDischarging && gridW !== null && gridW > 0 ? battery.powerW : 0;

  // Rampe: Anteil am Überschuss wird in den "virtuellen" Netzbezug eingerechnet
  const shareW = shareBudgetW(env.share, battery.soc, env.pvW, gridW, battery.powerW);
  let effGridW = gridW;
  if (shareW !== null && shareW > 0 && effGridW !== null) effGridW -= shareW;
  const allowanceW = rampAllowanceW(env.share, battery.soc, env.pvW);
  const socRampOn = surplusShare(env.share, battery.soc) !== null;

  let budgetW = totalW - (effGridW ?? 0) + batCorr;
  if (!socRampOn && !overflow && batCharging) budgetW += battery.powerW;
  if (!socRampOn && !overflow && env.pvW !== null && env.pvW !== undefined
      && env.houseW !== null && env.houseW !== undefined) {
    const pvBudgetW = Math.max(0, env.pvW - env.houseW);
    if (pvBudgetW > budgetW) budgetW = pvBudgetW;
  }
  if (allowanceW !== null) budgetW = Math.min(budgetW, Math.max(0, allowanceW));
  if (overflow) budgetW = Math.max(0, Math.min(budgetW, C.MIN_3PH_W - 1) - C.OVERFLOW_KEEP_W);

  const running = (st.currentAmps ?? 0) > 0;
  const gateBlocks = env.forecastGateBlocks === true && !running;
  const chargerBudgetW = gateBlocks ? 0 : budgetW;
  const rule = (overflow || gateBlocks) ? null
    : fullBatteryRule(charger, st, battery, gridW, sustainedImport, chargerBudgetW, now);

  const res = stepCharger(charger, st, chargerBudgetW, now, gridW, sustainedImport, rule, cmds, shadow);

  const batPw = battery.powerW !== null && battery.powerW !== undefined
    ? (battery.powerW >= 0 ? ` ↑${Math.round(battery.powerW)}W` : ` ↓${Math.round(Math.abs(battery.powerW))}W`) : '';
  if (res.allocatedW <= 0) {
    const text = overflow ? `Überschuss vorhanden · wartend${socStr}${batPw}`
      : gateBlocks ? `Prognose-Sperre · Batterie wird geschont${socStr}${batPw}`
        : `kein Überschuss${socStr}${batPw}`;
    return out(overflow ? 'battery_priority' : 'holding', text, 0, chargerBudgetW);
  }
  const prefix = overflow ? 'Überschuss · ' : (rule && rule.roundUp ? 'Akku voll · ' : '');
  return out('solar_ev', `${prefix}${res.amps}A/${res.phases}ph${socStr}${batPw}`, res.allocatedW, chargerBudgetW);
}

// ---------------------------------------------------------------- Fehlerfall (blind)

const FAILSAFE_MIN_MS = 60 * 1000; // so lange ohne Messwert: auf Mindeststrom
const FAILSAFE_STOP_MS = 5 * 60 * 1000; // so lange ohne Messwert: Laden stoppen

/**
 * Fehlerfall im Live-Betrieb: der Netzzähler (oder die Wallbox) ist nicht lesbar, das EMS regelt also blind.
 * Es greift nur ein, wenn es das Laden selbst gestartet hat (`st.currentAmps` gesetzt):
 *   ab 60 s ohne Messwert  auf Mindeststrom zurück
 *   ab 5 min ohne Messwert Laden stoppen (nicht bei ausdrücklich verlangtem Laden: `forced`, dann bleibt der Mindeststrom)
 * Reine Funktion mit Zustand: gibt die Befehle zurück und schreibt `st` fort.
 *
 * @param {{st:object, blindMs:number, minAmps:number, phases:number, forced:boolean, now:number}} p
 * @returns {{commands:object[], note:string}}
 */
function failSafe({ st, blindMs, minAmps, phases, forced = false, now }) {
  const cmds = [];
  if (st.currentAmps === null || st.currentAmps === undefined) return { commands: cmds, note: '' };
  if (blindMs >= FAILSAFE_STOP_MS && !forced) {
    cmdStop(st, cmds, now);
    return { commands: cmds, note: 'Laden gestoppt (5 min ohne Messwert)' };
  }
  if (blindMs >= FAILSAFE_MIN_MS) {
    if (st.currentAmps > minAmps) {
      cmds.push({ type: 'set', amps: minAmps, phases: st.currentPhases || phases });
      st.currentAmps = minAmps;
      st.pendingStepAmps = null; st.pendingStepSince = null; st.pendingDownSince = null;
    }
    return { commands: cmds, note: 'Mindeststrom (ohne Messwert)' };
  }
  return { commands: cmds, note: '' };
}

module.exports = {
  evaluateCharger, makeChargerState, stepCharger, fullBatteryRule, bestPhases, surplusShare,
  shareBudgetW, rampAllowanceW, batteryLow, gridClaimAmps, AMPS_LADDER, CONSTANTS: C,
  failSafe, FAILSAFE_MIN_MS, FAILSAFE_STOP_MS,
};
