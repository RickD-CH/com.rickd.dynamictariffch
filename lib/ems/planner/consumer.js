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
 * Auftrag (env.job = { wantOn, reason }): in der geplanten Viertelstunde EIN, siehe lib/ems/planner/jobs.js.
 *
 * Feuchte-Notlauf (optional, z. B. Luftentfeuchter): steigt die Luftfeuchtigkeit auf onAbove (Standard 65 %),
 * läuft das Gerät unabhängig von Batterie und Überschuss, bis die Feuchte unter offBelow (Standard 61 %)
 * fällt oder runMin (Standard 60 min) um sind. Er geht vor Mindest-Pause, Schutz-SoC und Prognose-Sperre.
 * Nach Ablauf der Zeit startet er erst wieder, wenn die Feuchte zwischendurch unter onAbove gefallen ist.
 * Ohne lesbaren Sensor löst er nicht aus; ein laufender Notlauf endet spätestens nach runMin.
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
  humidity: Object.freeze({ enabled: false, sensorId: '', capability: 'measure_humidity', onAbove: 65, offBelow: 61, runMin: 60 }),
});

function makeConsumerState() {
  return {
    isOn: false, startedAt: null, stoppedAt: null, externalOn: false,
    okSince: null, badSince: null,
    forceUntil: null, forceArmed: true,
  };
}

const isNum = (v) => v !== null && v !== undefined && Number.isFinite(v);

/**
 * Feuchte-Notlauf fortschreiben. Gibt { active, reason, ended } zurück.
 * Verändert nur st.forceUntil / st.forceArmed.
 */
function updateForce(st, hum, h, now) {
  const known = isNum(h);
  if (st.forceArmed === undefined) st.forceArmed = true;
  if (known && h < hum.onAbove) st.forceArmed = true;
  if (st.forceUntil) {
    if (now >= st.forceUntil) {
      st.forceUntil = null; st.forceArmed = false;
      return { active: false, ended: 'Notlauf beendet (Zeit abgelaufen)' };
    }
    if (known && h < hum.offBelow) {
      st.forceUntil = null;
      return { active: false, ended: `Notlauf beendet (Feuchte ${Math.round(h)}% < ${hum.offBelow}%)` };
    }
    const left = Math.max(1, Math.ceil((st.forceUntil - now) / MIN));
    return { active: true, reason: `Feuchte-Notlauf (noch ${left} min${known ? `, Feuchte ${Math.round(h)}%` : ''})` };
  }
  if (st.forceArmed && known && h >= hum.onAbove) {
    st.forceUntil = now + hum.runMin * MIN;
    st.forceArmed = false;
    return { active: true, reason: `Feuchte-Notlauf gestartet (Feuchte ${Math.round(h)}% >= ${hum.onAbove}%)` };
  }
  return { active: false };
}

/**
 * @param {object} p
 * @param {object} p.cfg   Einstellungen (siehe DEFAULTS)
 * @param {object} p.st    Zustand aus makeConsumerState()
 * @param {object} p.env   { soc, gridW, batteryW, share, forecastGateBlocks, actualOn, powerW, hasBattery }
 *                          hasBattery === false: es gibt keine Batterie (Modus 'surplus' läuft dann nur nach Überschuss)
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
  const noBattery = env.hasBattery === false;

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

  // Feuchte-Notlauf: geht vor allem anderen (ausser dem Ausschalter, der ausserhalb dieser Funktion liegt)
  let endedNote = null;
  if (c.humidity && c.humidity.enabled) {
    const f = updateForce(st, c.humidity, env.humidity, now);
    if (f.active) {
      if (!wasOn) { st.isOn = true; st.startedAt = now; st.okSince = null; st.badSince = null; cmds.push({ type: 'on' }); }
      return result(true, f.reason);
    }
    if (f.ended) {
      endedNote = f.ended;
      // Der Notlauf war ein eigener Lauf: die Mindestlaufzeit des normalen Betriebs gilt danach als erfüllt.
      if (wasOn) st.startedAt = now - c.minRunMin * MIN;
    }
  } else {
    st.forceUntil = null;
  }
  // Auftrag (geplante günstige Viertelstunde): läuft in diesem Slot, unabhängig von Batterie und Überschuss.
  // Ausserhalb der Slots gilt die normale Regel. Die Mindestlaufzeit gilt als erfüllt, damit das Gerät nach dem
  // Auftrag nicht unnötig weiterläuft.
  if (env.job && env.job.wantOn) {
    if (!wasOn) { st.isOn = true; cmds.push({ type: 'on' }); }
    st.startedAt = now - c.minRunMin * MIN; st.okSince = null; st.badSince = null;
    return result(true, env.job.reason || 'Auftrag');
  }
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
  if ((c.mode === 'full' || c.mode === 'soc') && noBattery) {
    want = false; reason = 'Keine Hausbatterie gewählt - Modus nach Batterie nicht möglich';
  } else if (c.mode === 'full' || c.mode === 'soc') {
    const on = c.mode === 'full' ? c.fullSoc : c.socOn;
    const off = on - c.hysteresis;
    if (!socKnown) { want = wasOn; reason = 'SoC unbekannt - Zustand bleibt'; }
    else if (wasOn) { want = soc >= off; reason = want ? `SoC ${Math.round(soc)}% >= ${off}%` : `SoC ${Math.round(soc)}% < ${off}%`; }
    else { want = soc >= on; reason = want ? `SoC ${Math.round(soc)}% >= ${on}%` : `SoC ${Math.round(soc)}% < ${on}%`; }
  } else { // 'surplus'
    const share = env.share;
    const hardStop = share && Number(share.socHigh) > Number(share.socLow) ? Number(share.socLow) : Number(share && share.minSoc) || 0;
    if (!noBattery && hardStop > 0 && (!socKnown || soc < hardStop)) {
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
  return result(want, endedNote ? `${endedNote}; ${reason}` : reason);
}

module.exports = { evaluateConsumer, makeConsumerState, DEFAULTS };
