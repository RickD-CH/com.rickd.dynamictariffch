'use strict';

/**
 * Verbraucher (z. B. Luftentfeuchter): ein/aus nach Batteriezustand oder Überschuss,
 * mit Mindestlaufzeit und Mindest-Pause. Reine, zustandsbehaftete Funktion: gibt Befehle zurück.
 *
 * Drei Startbedingungen (`mode`):
 *   'full'    Bei voller Batterie:  ein ab SoC >= fullSoc (Standard 98 %), aus unter fullSoc - hysteresis.
 *   'soc'     Ab gewähltem SoC:     ein ab SoC >= socOn, aus unter socOn - hysteresis.
 *   'surplus' Wie bei Andi:         ein, wenn der Export-Überschuss (Netz-Export minus Batterie-Entladung,
 *                                   begrenzt durch die Überschuss-Rampe) mindestens minSurplusW beträgt,
 *                                   startSustainS lang ohne Unterbruch. Aus, wenn er nach der Mindestlaufzeit
 *                                   stopGraceS lang fehlt. Unter dem Hartstopp-SoC läuft nichts.
 * Für alle gilt: Mindestlaufzeit (minRunMin) nach dem Start, Mindest-Pause (minOffMin) nach dem Stopp,
 * optional die Prognose-Sperre (hält nur NEUE Starts zurück), und ein Schutz-SoC (protectSoc), unter dem
 * es sofort ausgeht, auch während der Mindestlaufzeit.
 *
 * Logik des Modus 'surplus' nach Andi Wirz' FusionSolar-EMS (lib/ems/simpleDevices.js, MIT-Lizenz).
 */

const { surplusShare, rampAllowanceW } = require('./charger');

const MIN = 60_000;

const DEFAULTS = Object.freeze({
  enabled: true,
  mode: 'full', // 'full' | 'soc' | 'surplus'
  fullSoc: 98,
  socOn: 80,
  hysteresis: 5, // Prozentpunkte unter der Einschaltschwelle, ab denen es ausgeht
  minSurplusW: 300,
  startSustainS: 60,
  stopGraceS: 120,
  minRunMin: 30,
  minOffMin: 10,
  protectSoc: 20,
  useForecastGate: true,
});

function makeConsumerState() {
  return {
    isOn: false, startedAt: null, stoppedAt: null, externalOn: false,
    okSince: null, badSince: null,
  };
}

/**
 * @param {object} p
 * @param {object} p.cfg   Einstellungen (siehe DEFAULTS)
 * @param {object} p.st    Zustand aus makeConsumerState()
 * @param {object} p.env   { soc, gridW, batteryW, share, forecastGateBlocks, actualOn, powerW, warm }
 *                          actualOn: Ist-Zustand des Geräts (true/false/null = unbekannt)
 * @param {number} p.now
 * @returns {{ wantOn:boolean, reason:string, commands:object[] }}
 */
function evaluateConsumer({ cfg, st, env, now }) {
  const c = { ...DEFAULTS, ...(cfg || {}) };
  const cmds = [];
  const result = (wantOn, reason) => ({ wantOn, reason, commands: cmds });
  if (!c.enabled) return result(false, 'ausgeschaltet');

  const soc = env.soc;
  const socKnown = soc !== null && soc !== undefined && Number.isFinite(soc);

  // Fremdsteuerung: Gerät läuft, ohne dass wir es gestartet haben -> in Ruhe lassen (wie Andi).
  if (env.actualOn !== null && env.actualOn !== undefined) {
    if (st.isOn && env.actualOn === false) {
      // von aussen ausgeschaltet: übernehmen, Pause beginnt
      st.isOn = false; st.startedAt = null; st.stoppedAt = now; st.okSince = null; st.badSince = null;
    } else if (!st.isOn && env.actualOn === true) {
      st.externalOn = true;
      return result(true, 'von Hand eingeschaltet - wird nicht gesteuert');
    } else if (st.externalOn && env.actualOn === false) {
      st.externalOn = false;
      st.stoppedAt = now;
    }
  }

  const wasOn = st.isOn;
  const runMs = wasOn && st.startedAt !== null ? now - st.startedAt : 0;
  const pastMinRun = wasOn && runMs >= c.minRunMin * MIN;
  const offFor = st.stoppedAt === null ? Infinity : now - st.stoppedAt;
  const pauseOk = offFor >= c.minOffMin * MIN;

  // Schutz-SoC: sofort aus, unabhängig von der Mindestlaufzeit
  if (socKnown && soc < c.protectSoc) {
    if (wasOn) { st.isOn = false; st.startedAt = null; st.stoppedAt = now; cmds.push({ type: 'off' }); }
    st.okSince = null; st.badSince = null;
    return result(false, `Schutz: SoC ${Math.round(soc)}% < ${c.protectSoc}%`);
  }

  let want; // gewünschter Zustand ohne Mindestlaufzeit
  let reason;
  if (c.mode === 'full' || c.mode === 'soc') {
    const on = c.mode === 'full' ? c.fullSoc : c.socOn;
    const off = on - c.hysteresis;
    if (!socKnown) { want = wasOn; reason = 'SoC unbekannt - Zustand bleibt'; }
    else if (wasOn) { want = soc >= off; reason = want ? `SoC ${Math.round(soc)}% >= ${off}%` : `SoC ${Math.round(soc)}% < ${off}%`; }
    else { want = soc >= on; reason = want ? `SoC ${Math.round(soc)}% >= ${on}%` : `SoC ${Math.round(soc)}% < ${on}%`; }
  } else { // 'surplus'
    const share = env.share;
    const hardStop = share && Number(share.socHigh) > Number(share.socLow) ? Number(share.socLow) : Number(share && share.minSoc) || 0;
    if (hardStop > 0 && (!socKnown || soc < hardStop)) {
      want = false; reason = `Hartstopp: SoC unter ${hardStop}%`;
      st.okSince = null; st.badSince = null;
    } else {
      const dischargeW = env.batteryW !== null && env.batteryW !== undefined ? Math.max(0, -env.batteryW) : 0;
      const exportW = (env.gridW !== null && env.gridW !== undefined ? -env.gridW : 0) - dischargeW;
      const ownW = wasOn && Number.isFinite(env.powerW) ? env.powerW : 0;
      const allowance = rampAllowanceW(share, soc, env.pvW);
      const raw = exportW + ownW;
      const effective = allowance === null ? raw : Math.min(raw, Math.max(0, allowance));
      const surplusOk = effective >= c.minSurplusW;
      if (!wasOn) {
        if (surplusOk) { if (!st.okSince) st.okSince = now; } else st.okSince = null;
        st.badSince = null;
        want = surplusOk && st.okSince !== null && (now - st.okSince) >= c.startSustainS * 1000;
        reason = surplusOk
          ? (want ? `Überschuss ${Math.round(effective)} W` : `Überschuss ${Math.round(effective)} W, wartet auf ${c.startSustainS} s`)
          : `Überschuss ${Math.round(effective)} W < ${c.minSurplusW} W`;
      } else {
        st.okSince = null;
        if (surplusOk) st.badSince = null; else if (!st.badSince) st.badSince = now;
        want = surplusOk || (st.badSince !== null && (now - st.badSince) < c.stopGraceS * 1000);
        reason = surplusOk ? `Überschuss ${Math.round(effective)} W` : `Überschuss fehlt (Karenz ${c.stopGraceS} s)`;
      }
    }
  }

  // Neue Starts: Prognose-Sperre und Mindest-Pause
  if (!wasOn && want) {
    if (c.useForecastGate && env.forecastGateBlocks) { want = false; reason = 'Prognose-Sperre - Start zurückgehalten'; }
    else if (!pauseOk) { want = false; reason = `Pause (${Math.ceil((c.minOffMin * MIN - offFor) / MIN)} min)`; }
  }

  // Mindestlaufzeit: ein laufendes Gerät bleibt an
  if (wasOn && !want && !pastMinRun) {
    want = true;
    reason = `Mindestlaufzeit (${Math.ceil((c.minRunMin * MIN - runMs) / MIN)} min)`;
  }

  if (want && !wasOn) {
    st.isOn = true; st.startedAt = now; st.okSince = null; st.badSince = null;
    cmds.push({ type: 'on' });
  } else if (!want && wasOn) {
    st.isOn = false; st.startedAt = null; st.stoppedAt = now; st.okSince = null; st.badSince = null;
    cmds.push({ type: 'off' });
  }
  return result(want, reason);
}

module.exports = { evaluateConsumer, makeConsumerState, DEFAULTS };
