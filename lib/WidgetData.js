'use strict';

const { localParts, localDateKey, addLocalDays } = require('./time');
const { hourly } = require('./ems/planner/gridOutlook');

const QUARTER_MS = 15 * 60 * 1000;

function hm(ms, tz) {
  const p = localParts(new Date(ms), tz);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

const round1 = (v) => Math.round(v * 10) / 10;

/**
 * Gelöschte Geräte, Capabilities und Flows (siehe ems/refCheck.js) in der Form fürs Widget. null = alles in Ordnung (oder noch nicht geprüft).
 */
function refsView(rc) {
  const list = rc && Array.isArray(rc.issues) ? rc.issues : [];
  if (!list.length) return null;
  return {
    critical: list.filter((i) => i.critical).length,
    issues: list.map((i) => ({
      area: i.area, field: i.field, problem: i.problem, name: i.name || '', caps: i.caps || null, critical: !!i.critical,
    })),
  };
}

/**
 * Daten für das Widget «Plan»: die nächsten 24 Stunden ab der laufenden Viertelstunde mit Preis, Solarprognose,
 * geplantem Batteriemodus und Ladezeiten der Wallbox, dazu der Zustand jetzt.
 * @param {object} p { plan (EmsController.getPlan), shadow (EmsController.getShadow), tz, nowMs, hours }
 */
function planWidget({
  plan, shadow, tz, nowMs = Date.now(), hours = 24, refCheck = null,
}) {
  const sh = shadow || {};
  if (!sh.deviceExists) return { ems: false };
  const cfg = sh.config || {};
  const out = {
    ems: true,
    enabled: cfg.enabled === true,
    silent: cfg.silent !== false,
    hasBattery: !!(cfg.battery && cfg.battery.deviceId),
    hasCharger: !!(cfg.charger && cfg.charger.enabled && cfg.charger.id),
    slots: [],
    ticks: [],
    refs: refsView(refCheck),
  };
  const nowQ = Math.floor(nowMs / QUARTER_MS) * QUARTER_MS;
  const end = nowQ + hours * 3600 * 1000;
  for (const day of (plan && plan.days) || []) {
    const bat = (day.rows || []).find((r) => r.kind === 'battery');
    const chg = (day.rows || []).find((r) => r.kind === 'charger');
    day.slots.forEach((s, i) => {
      if (s.t < nowQ || s.t >= end) return;
      const b = bat ? bat.cells[i] : null;
      const c = chg ? chg.cells[i] : null;
      const carOn = !!(c && (c.state === 'solar_ev' || c.state === 'instant_ev'));
      out.slots.push({
        t: s.t,
        time: hm(s.t, tz),
        price: s.price,
        level: s.level,
        pvKw: s.pvKw,
        bat: b ? b.state : null,
        car: carOn,
      });
    });
  }
  out.slots.sort((a, b) => a.t - b.t);
  // die laufende Viertelstunde (vorderster Balken), damit das Widget «jetzt» markieren kann
  out.nowIdx = out.slots.length && out.slots[0].t === nowQ ? 0 : -1;
  const todayKey = localDateKey(new Date(nowMs), tz);
  out.slots.forEach((s, i) => {
    const lp = localParts(new Date(s.t), tz);
    if (lp.minute === 0 && lp.hour % 3 === 0) out.ticks.push({ i, label: String(lp.hour) });
    s.tomorrow = localDateKey(new Date(s.t), tz) !== todayKey;
  });

  const prices = out.slots.map((s) => s.price).filter((v) => typeof v === 'number');
  out.min = prices.length ? Math.min(...prices) : null;
  out.max = prices.length ? Math.max(...prices) : null;
  const pv = out.slots.map((s) => s.pvKw).filter((v) => typeof v === 'number');
  out.pvMaxKw = pv.length ? round1(Math.max(...pv)) : null;
  out.pvKwh = pv.length ? round1(pv.reduce((a, b) => a + b * 0.25, 0)) : null;

  // Zustand jetzt
  const cur = sh.current || {};
  const mine = cur.mine || null;
  out.battery = out.hasBattery && mine ? {
    mode: mine.mode || null,
    reason: mine.reason || '',
    soc: Number.isFinite(cur.soc) ? Math.round(cur.soc) : null,
  } : null;
  const ch = sh.charger && sh.charger.current && sh.charger.current.mine ? sh.charger.current.mine : null;
  const firstCar = out.slots.findIndex((s) => s.car);
  let carWindow = null;
  if (firstCar >= 0) {
    let j = firstCar;
    while (j + 1 < out.slots.length && out.slots[j + 1].car) j += 1;
    carWindow = { from: out.slots[firstCar].time, to: hm(out.slots[j].t + QUARTER_MS, tz), now: firstCar === 0 };
  }
  // angesteckt? (false = der Plan zeigt Ladezeiten, geladen wird aber erst, wenn das Auto da ist; null = unbekannt)
  const cc = sh.charger && sh.charger.current ? sh.charger.current.connected : undefined;
  out.charger = out.hasCharger ? {
    mode: ch ? ch.mode : null, reason: ch ? ch.reason || '' : '', window: carWindow, connected: typeof cc === 'boolean' ? cc : null,
  } : null;
  const first = out.slots[0] ? out.slots[0].price : null;
  out.price = typeof cur.price === 'number' ? cur.price : first;
  return out;
}

/** Tagesspitze der höchsten Phase fortschreiben (neuer Tag beginnt bei null). */
function stepFusePeak(peak, cur, tz) {
  if (!cur || !Number.isFinite(cur.maxA) || !Number.isFinite(cur.at)) return peak || null;
  const day = localDateKey(new Date(cur.at), tz);
  const base = peak && peak.day === day ? peak : null;
  // erst ab 0.5 A mehr eine neue Spitze (wenige Schreibvorgänge, wenn der Strom langsam steigt)
  if (base && base.a + 0.5 > Math.abs(cur.maxA)) return base;
  return {
    day, a: round1(Math.abs(cur.maxA)), phase: Number.isInteger(cur.phase) ? cur.phase : null, at: cur.at,
  };
}

/**
 * Daten für das Widget «Hausanschluss»: höchste Phase, Grenze, die drei Phasen mit kW, Drosselung, Abgeschaltetes
 * und die Tagesspitze.
 */
/** Ausblick Hausanschluss fürs Widget und die Einstellungen: Urteil, Spitze und Beteiligte, plus Stundenwerte für die Grafik. */
function outlookView(o, tz) {
  if (!o || o.status === 'unknown' || !o.peak) return null;
  return {
    status: o.status,
    limitKw: o.limitKw,
    peak: {
      kw: o.peak.gridKw, pct: o.peak.pct, time: hm(o.peak.t, tz), parts: o.peak.parts, baseKw: o.peak.baseKw, pvKw: o.peak.pvKw,
    },
    hours: hourly(o).map((h) => ({ time: hm(h.t, tz), kw: h.gridKw, pct: h.pct, parts: h.parts.map((p) => p.name) })),
  };
}

function fuseWidget({
  shadow, peak, tz, nowMs = Date.now(), outlook = null,
}) {
  const sh = shadow || {};
  if (!sh.deviceExists) return { ems: false };
  const cfg = sh.config || {};
  const f = cfg.fuse || {};
  const cur = sh.fuse || null;
  const out = {
    ems: true, enabled: f.enabled === true, silent: cfg.silent !== false,
  };
  if (!out.enabled) return out;
  const kw = (a) => round1((Math.abs(a) * 230) / 1000);
  const phases = (cur && Array.isArray(cur.phasesA) ? cur.phasesA : []).map((v) => (Number.isFinite(v) ? {
    a: round1(Math.abs(v)), kw: kw(v),
  } : null));
  out.limitA = cur && Number.isFinite(cur.limitA) ? cur.limitA : null;
  out.maxA = cur && Number.isFinite(cur.maxA) ? round1(Math.abs(cur.maxA)) : null;
  out.phases = phases;
  out.totalKw = phases.some((p) => p) ? round1(phases.reduce((a, p) => a + (p ? p.kw : 0), 0)) : null;
  out.over = !!(cur && cur.over);
  out.live = !!(cur && cur.live);
  const maxAmps = cfg.charger && Number.isFinite(cfg.charger.maxAmps) ? cfg.charger.maxAmps : null;
  out.capAmps = cur && Number.isFinite(cur.capAmps) && cfg.charger && cfg.charger.id && (maxAmps === null || cur.capAmps < maxAmps) ? cur.capAmps : null;
  out.shed = cur && Array.isArray(cur.shed) ? cur.shed : [];
  out.error = cur ? cur.error || null : 'wait';
  out.ageS = cur && Number.isFinite(cur.at) ? Math.max(0, Math.round((nowMs - cur.at) / 1000)) : null;
  const today = localDateKey(new Date(nowMs), tz);
  out.peak = peak && peak.day === today ? { a: peak.a, phase: peak.phase, time: hm(peak.at, tz) } : null;
  out.outlook = outlookView(outlook, tz);
  return out;
}

/**
 * Daten für das Widget «Verbraucher»: E-Auto/Wallbox oben (reicher Status), darunter alle aktivierten
 * Verbraucher mit Status und - nur beim Typ «Programm starten» - den Angaben fürs manuelle Starten.
 * @param {object} p { shadow (EmsController.getShadow), consumerCurrent (runner.consumerCurrent), tz }
 */
function consumersWidget({
  shadow, consumerCurrent, tz = 'Europe/Zurich', nowMs = Date.now(), refCheck = null,
}) {
  const sh = shadow || {};
  if (!sh.deviceExists) return { ems: false };
  const cfg = sh.config || {};
  const out = {
    ems: true, silent: cfg.silent !== false, car: null, sgready: null, dhw: null, consumers: [], refs: refsView(refCheck),
  };
  // Block erscheint, sobald das Modul eingerichtet ist (auch ausgeschaltet, damit es im Widget eingeschaltet werden kann)
  const sg = cfg.sgready;
  const sgSetUp = !!sg && (sg.enabled || !!(sg.recommendRelay && sg.recommendRelay.deviceId) || !!(sg.flowNormal && sg.flowNormal.id) || !!(sg.flowBoost && sg.flowBoost.id));
  if (sgSetUp) {
    const cur = sg.enabled ? (sh.sgready || null) : null;
    out.sgready = {
      enabled: sg.enabled === true,
      state: cur ? cur.state : null,
      reason: cur ? cur.reason : '',
      tempWW: cur && Number.isFinite(cur.tempWW) ? Math.round(cur.tempWW * 10) / 10 : null,
      targetTemp: cur && Number.isFinite(cur.target) ? Math.round(cur.target * 10) / 10 : sg.targetTemp,
      untilHm: cur && Number.isFinite(cur.deadlineMs) ? hm(cur.deadlineMs, tz) : null,
      live: sg.live === true && cfg.silent !== true,
      reported: cur && cur.reported ? String(cur.reported) : null,
      // Die Wärmepumpe meldet Empfehlung/Zwang, obwohl wir nichts geschaltet haben (z. B. der bisherige Flow)
      external: !!(cur && (cur.reportedState === 'boost' || cur.reportedState === 'forced') && cur.state === 'off'),
      mismatch: !!(cur && cur.mismatch),
      paused: !!(cur && cur.paused),
      canStart: sg.enabled === true && sg.live === true && cfg.silent !== true && !(cur && cur.paused) && !!cur && cur.state === 'off' && !(sh.dhw && sh.dhw.on === true),
    };
  }
  const dh = cfg.dhw;
  const dhSetUp = !!dh && (dh.enabled || !!(dh.flowOn && dh.flowOn.id) || !!(dh.device && dh.device.deviceId));
  if (dhSetUp) {
    const cur = dh.enabled ? (sh.dhw || null) : null;
    out.dhw = {
      enabled: dh.enabled === true,
      known: !!cur,
      delayUntilHm: cur && cur.delay && cur.delay.active && Number.isFinite(cur.delay.releaseAt) ? hm(cur.delay.releaseAt, tz) : null,
      targetTemp: cur && Number.isFinite(cur.target) ? Math.round(cur.target * 10) / 10 : dh.targetTemp,
      on: !!(cur && cur.on),
      reason: cur ? cur.reason : '',
      tempWW: cur && Number.isFinite(cur.tempWW) ? Math.round(cur.tempWW * 10) / 10 : null,
      untilHm: cur && Number.isFinite(cur.deadlineMs) ? hm(cur.deadlineMs, tz) : null,
      live: dh.live === true && cfg.silent !== true,
      paused: !!(cur && cur.paused),
      // Soll nach dem Programm nicht zurück (Gerät meldet noch den Programm-Soll): Warnung im Widget
      setpointWarn: cur && cur.setpointCheck && ['retry', 'failed'].includes(cur.setpointCheck.state) ? { expected: cur.setpointCheck.expected, actual: cur.setpointCheck.actual, state: cur.setpointCheck.state } : null,
      heating: cur && typeof cur.heating === 'boolean' ? cur.heating : null,
      canStart: dh.enabled === true && dh.live === true && cfg.silent !== true && !(cur && cur.paused) && !!cur && cur.on !== true && !(cur && cur.heating === true) && !(sh.sgready && sh.sgready.state && sh.sgready.state !== 'off'),
    };
  }
  if (cfg.charger && cfg.charger.id) {
    const car = sh.car || {};
    const ch = (sh.charger && sh.charger.current && sh.charger.current.mine) || {};
    const chCur = (sh.charger && sh.charger.current) || {};
    const starts = Array.isArray(car.starts) ? car.starts : [];
    out.car = {
      soc: Number.isFinite(car.soc) ? Math.round(car.soc) : null,
      connected: car.connected === true,
      targetSoc: car.departure && !car.byEnergy ? car.departure.soc : null, // ohne Ladestand gilt die Energie (needKwh), nicht der Ziel-Ladestand
      departureDate: car.departure ? car.departure.date : null,
      departureTime: car.departure ? car.departure.time : null,
      sharePct: sh.shareInfo && Number.isFinite(sh.shareInfo.pct) ? sh.shareInfo.pct : null,
      state: car.state || null,
      reason: car.reason || ch.reason || '',
      mode: ch.mode || null,
      needKwh: Number.isFinite(car.needKwh) ? car.needKwh : null,
      window: starts.length ? { from: hm(starts[0], tz), to: hm(starts[starts.length - 1] + QUARTER_MS, tz) } : null,
      chargeNow: cfg.charger.chargeNow === true,
      live: cfg.charger.live === true && cfg.silent !== true,
      pvW: Number.isFinite(chCur.pvW) ? Math.round(chCur.pvW) : null,
      gridW: Number.isFinite(chCur.gridW) ? Math.round(chCur.gridW) : null,
      // Schnellschalter im Widget (nur mit eingerichtetem Auto): «Nur Solar» = Netz nachladen aus, «Morgen nicht laden» = Eintrag für morgen mit Laden aus
      controls: cfg.car && (cfg.car.deviceId || cfg.car.fallbackKwh > 0) ? (() => {
        const sc = cfg.car.schedule || {};
        const tomorrow = localDateKey(addLocalDays(new Date(nowMs), 1, tz), tz);
        return { solarOnly: sc.gridCharge === false, tomorrowOff: !!(sc.override && sc.override.date === tomorrow && sc.override.on === false) };
      })() : null,
    };
  }
  for (const c of (cfg.consumers || [])) {
    if (!c.enabled) continue;
    const cur = (consumerCurrent || []).find((x) => x.id === c.id) || {};
    const isProgram = c.mode === 'program';
    let icon = 'plug';
    if (c.type === 'dehumidifier') icon = 'dehumidifier'; else if (isProgram) icon = 'dishwasher';
    out.consumers.push({
      id: c.id,
      name: c.name,
      icon: c.icon || icon,
      isProgram,
      reason: cur.reason || '',
      blocked: cur.blocked || null,
      // Fernbedienung und Tür des Geräts: { value, ok } (ok null = unbekannt), nur bei Programm-Verbrauchern mit gewählter Capability
      remote: isProgram && cur.remote ? cur.remote : null,
      door: isProgram && cur.door ? cur.door : null,
      startedAt: Number.isFinite(cur.startedAt) ? cur.startedAt : null,
      startedAtHm: Number.isFinite(cur.startedAt) ? hm(cur.startedAt, tz) : null,
      // «zuletzt gestartet» bleibt über Mitternacht erhalten (Abkühlpause): «heute» nur, wenn es wirklich heute war
      startedToday: Number.isFinite(cur.startedAt) && localDateKey(new Date(cur.startedAt), tz) === localDateKey(new Date(nowMs), tz),
      deadlineHm: Number.isFinite(cur.deadlineMs) ? hm(cur.deadlineMs, tz) : null,
      durationH: isProgram ? c.program.durationH : null,
      armed: isProgram ? !!cur.armed : null,
      // Wartezeit: gewählte beim Einschalten (läuft gerade) bzw. Standard des Geräts (Vorauswahl im Widget)
      maxWaitH: isProgram ? (Number.isFinite(cur.armWaitH) ? cur.armWaitH : c.program.maxWaitH) : null,
      live: c.live === true && cfg.silent !== true,
    });
  }
  return out;
}

module.exports = {
  planWidget, fuseWidget, stepFusePeak, consumersWidget, outlookView, refsView,
};
