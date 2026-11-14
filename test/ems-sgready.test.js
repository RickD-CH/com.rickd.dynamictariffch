'use strict';

// SG-Ready-Steuerung (Wärmepumpe/Boiler): zwei Relais, drei Zustände (0:0/0:1/1:1), siehe lib/ems/planner/sgready.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSgReady, decideSgReady, makeSgReadyState, relaysFor, parseSgReadyState,
} = require('../lib/ems/planner/sgready');
const { fromLocal } = require('../lib/time');
const {
  cheapestOfDay, cheapestPreview, priceDays, normalizeDhw,
} = require('../lib/ems/planner/dhw');

const TZ = 'Europe/Zurich';
const at = (h, m = 0) => fromLocal(2026, 11, 13, h, m).getTime();
const MIN = 60000;

function base(over) {
  const o = over || {};
  return {
    st: makeSgReadyState(),
    pvW: 0,
    exportW: 0,
    soc: null,
    hasBattery: false,
    priceNow: null,
    tempWW: null,
    modeBlocked: false,
    nowMs: at(12),
    tz: TZ,
    ...o,
    cfg: normalizeSgReady(o.cfg),
  };
}

test('normalizeSgReady: Grenzen und Standardwerte, ungültige Fensterzeit und Basis fallen zurück', () => {
  const p = normalizeSgReady({
    minSoc: 150, socHysteresis: -5, windowTo: 'kaputt', basis: 'unsinn',
  });
  assert.equal(p.minSoc, 100);
  assert.equal(p.socHysteresis, 0);
  assert.equal(p.windowTo, '17:00');
  assert.equal(p.basis, 'pv');
  assert.equal(normalizeSgReady({}).enabled, false);
  assert.equal(normalizeSgReady({}).allowForced, false);
});

test('relaysFor: Empfehlungs-Relais bei boost und forced an, Zwangs-Relais nur bei forced', () => {
  assert.deepEqual(relaysFor('off'), { recommend: false, force: false });
  assert.deepEqual(relaysFor('boost'), { recommend: true, force: false });
  assert.deepEqual(relaysFor('forced'), { recommend: true, force: true });
});

test('Globale Abbruchbedingung: Zieltemperatur erreicht beendet sofort, auch mitten in der Mindestlaufzeit, und startet den Cooldown', () => {
  const x = base({ pvW: 2000, nowMs: at(10) });
  decideSgReady(x); // off -> okSince
  x.nowMs = at(10) + 10 * MIN;
  const started = decideSgReady(x);
  assert.equal(started.state, 'boost');
  x.nowMs += 5 * MIN;
  x.tempWW = 56;
  const r = decideSgReady(x);
  assert.equal(r.state, 'off');
  assert.match(r.reason, /Zieltemperatur/);
  assert.equal(x.st.cooldownUntil, x.nowMs + x.cfg.cooldownMin * MIN);
});

test('Globale Abbruchbedingung: Betriebsart nicht freigegeben beendet sofort einen laufenden Betrieb und startet den Cooldown', () => {
  const x = base({
    cfg: { minSolarW: 1500, startDelayMin: 0 }, pvW: 1600, nowMs: at(10),
  });
  assert.equal(decideSgReady(x).state, 'boost');
  x.nowMs += 5 * MIN;
  x.modeBlocked = true;
  const r = decideSgReady(x);
  assert.equal(r.state, 'off');
  assert.match(r.reason, /Betriebsart/);
  assert.ok(x.st.cooldownUntil);
});

test('Betriebsart (im Voraus nicht freigegeben): verhindert den Start, solange sie nicht freigegeben ist', () => {
  const x = base({ pvW: 2000, modeBlocked: true });
  const r1 = decideSgReady(x);
  assert.equal(r1.state, 'off');
  assert.match(r1.reason, /Betriebsart/);
});

test('Start (Trigger A, PV/Akku): erst nach startDelayMin am Stück, vor windowTo', () => {
  const x = base({
    cfg: { minSolarW: 1500, startDelayMin: 10 }, pvW: 1600, nowMs: at(10),
  });
  let r = decideSgReady(x);
  assert.equal(r.state, 'off', 'Bedingung gerade erst erfüllt');
  x.nowMs = at(10) + 9 * MIN;
  r = decideSgReady(x);
  assert.equal(r.state, 'off', 'noch nicht 10 Minuten');
  x.nowMs = at(10) + 10 * MIN;
  r = decideSgReady(x);
  assert.equal(r.state, 'boost');
  assert.match(r.reason, /PV-Überschuss/);
  assert.equal(r.deadlineMs, x.st.boostStartedAt + x.cfg.minRunMin * MIN);
});

test('Start (Trigger A): ohne Hausakku spielt der SoC keine Rolle, mit Akku muss er über minSoc liegen', () => {
  const noBattery = base({
    cfg: { minSolarW: 1500, startDelayMin: 0 }, pvW: 1600, hasBattery: false, soc: 10, nowMs: at(10),
  });
  assert.equal(decideSgReady(noBattery).state, 'boost', 'kein Akku konfiguriert - SoC wird ignoriert');
  const lowSoc = base({
    cfg: { minSolarW: 1500, minSoc: 98, startDelayMin: 0 }, pvW: 1600, hasBattery: true, soc: 80, nowMs: at(10),
  });
  assert.equal(decideSgReady(lowSoc).state, 'off', 'Akku vorhanden, aber noch nicht voll genug');
  const fullSoc = base({
    cfg: { minSolarW: 1500, minSoc: 98, startDelayMin: 0 }, pvW: 1600, hasBattery: true, soc: 98, nowMs: at(10),
  });
  assert.equal(decideSgReady(fullSoc).state, 'boost');
});

test('Start (Trigger A): nach windowTo kein neuer Start mehr, auch mit PV und vollem Akku', () => {
  const x = base({
    cfg: { minSolarW: 1500, windowTo: '17:00', startDelayMin: 0 }, pvW: 3000, nowMs: at(18),
  });
  const r = decideSgReady(x);
  assert.equal(r.state, 'off');
  assert.match(r.reason, /wartet/);
});

test('Start (Trigger B, Preis): unabhängig von windowTo - startet auch nach 17:00', () => {
  const x = base({
    cfg: {
      usePrice: true, maxPriceRp: 15, windowTo: '17:00', startDelayMin: 0,
    },
    priceNow: 12,
    tempWW: 40,
    nowMs: at(22),
  });
  const r = decideSgReady(x);
  assert.equal(r.state, 'boost');
  assert.match(r.reason, /günstig/);
});

test('Mindest-Temperatur (Preis): nur starten, wenn das Warmwasser unter priceBelowTemp liegt, unbekannte Temperatur blockiert', () => {
  const cfg = {
    usePrice: true, maxPriceRp: 15, priceBelowTemp: 50, startDelayMin: 0, priceSkipPv: false,
  };
  assert.equal(decideSgReady(base({
    cfg, priceNow: 10, tempWW: 49, nowMs: at(22),
  })).state, 'boost');
  const warm = decideSgReady(base({
    cfg, priceNow: 10, tempWW: 52, nowMs: at(22),
  }));
  assert.equal(warm.state, 'off');
  assert.match(warm.reason, /noch warm genug/);
  assert.equal(decideSgReady(base({
    cfg, priceNow: 10, tempWW: null, nowMs: at(22),
  })).state, 'off', 'ohne Messwert kein Start, der Geld kostet');
  assert.equal(decideSgReady(base({
    cfg: { ...cfg, priceBelowTemp: 0 }, priceNow: 10, tempWW: 55, nowMs: at(22),
  })).state, 'boost', '0 = keine Prüfung');
});

test('Mindest-Temperatur (Sonne, optional): nur wenn pvBelowTemp > 0, unbekannte Temperatur blockiert die gratis Sonne nicht', () => {
  const cfg = { minSolarW: 1500, startDelayMin: 0, pvBelowTemp: 0 };
  assert.equal(decideSgReady(base({
    cfg, pvW: 2000, tempWW: 55, nowMs: at(10),
  })).state, 'boost', '0 = keine Prüfung');
  const on = { ...cfg, pvBelowTemp: 52 };
  assert.equal(decideSgReady(base({
    cfg: on, pvW: 2000, tempWW: 55, nowMs: at(10),
  })).state, 'off');
  assert.equal(decideSgReady(base({
    cfg: on, pvW: 2000, tempWW: 50, nowMs: at(10),
  })).state, 'boost');
  assert.equal(decideSgReady(base({
    cfg: on, pvW: 2000, tempWW: null, nowMs: at(10),
  })).state, 'boost');
});

test('PV-Prognose: Preis-Start lohnt sich nicht, wenn die Sonne heute noch genug liefert - nach windowTo oder ohne Prognose schon', () => {
  const cfg = {
    usePrice: true, maxPriceRp: 15, priceBelowTemp: 0, startDelayMin: 0, priceSkipPv: true, priceSkipPvKwh: 6, windowTo: '17:00',
  };
  const sunny = decideSgReady(base({
    cfg, priceNow: 10, pvForecastKwh: 12, nowMs: at(11),
  }));
  assert.equal(sunny.state, 'off');
  assert.match(sunny.reason, /Sonne reicht/);
  assert.equal(decideSgReady(base({
    cfg, priceNow: 10, pvForecastKwh: 3, nowMs: at(11),
  })).state, 'boost', 'wenig Sonne erwartet');
  assert.equal(decideSgReady(base({
    cfg, priceNow: 10, pvForecastKwh: null, nowMs: at(11),
  })).state, 'boost', 'Prognose unbekannt');
  assert.equal(decideSgReady(base({
    cfg, priceNow: 10, pvForecastKwh: 12, nowMs: at(18),
  })).state, 'boost', 'Sonnen-Start nicht mehr offen');
  assert.equal(decideSgReady(base({
    cfg: { ...cfg, priceSkipPv: false }, priceNow: 10, pvForecastKwh: 12, nowMs: at(11),
  })).state, 'boost', 'Option aus');
});

test('Halten per Preis: steigende Warmwasser-Temperatur (über priceBelowTemp) beendet den Lauf nicht', () => {
  const x = base({
    cfg: {
      usePrice: true, maxPriceRp: 15, priceBelowTemp: 50, minRunMin: 0, stopDelayMin: 0, startDelayMin: 0, priceSkipPv: false,
    },
    priceNow: 10,
    tempWW: 45,
    nowMs: at(22),
  });
  assert.equal(decideSgReady(x).state, 'boost');
  x.tempWW = 54; // über der Start-Schwelle, aber unter dem Ziel (56)
  x.nowMs += 30 * MIN;
  assert.equal(decideSgReady(x).state, 'boost');
});

test('Start: Preis zu teuer und PV/Akku ungenügend -> kein Start', () => {
  const x = base({
    cfg: {
      usePrice: true, maxPriceRp: 15, minSolarW: 1500, startDelayMin: 0,
    },
    priceNow: 20,
    pvW: 200,
    nowMs: at(10),
  });
  assert.equal(decideSgReady(x).state, 'off');
});

test('Sonderfall: Akku-SoC springt frisch über die Schwelle bei bereits ausreichender Solarleistung -> sofortiger Start ohne Einschaltverzögerung', () => {
  const x = base({
    cfg: {
      minSolarW: 1500, minSoc: 98, startDelayMin: 10,
    },
    pvW: 1600,
    hasBattery: true,
    soc: 90,
    nowMs: at(10),
  });
  // Solarleistung steht schon lange an (SoC allein fehlt) - kein Start, aber okSince läuft nicht an, weil
  // triggerA insgesamt falsch ist (SoC fehlt).
  assert.equal(decideSgReady(x).state, 'off');
  x.nowMs += 5 * MIN;
  x.soc = 98; // SoC springt frisch über die Schwelle
  const r = decideSgReady(x);
  assert.equal(r.state, 'boost', 'kein Warten nötig - der PV-Teil stand schon an');
});

test('Ohne SoC-Sprung (schon vorher über der Schwelle): normale Einschaltverzögerung gilt', () => {
  const x = base({
    cfg: {
      minSolarW: 1500, minSoc: 98, startDelayMin: 10,
    },
    pvW: 1600,
    hasBattery: true,
    soc: 99,
    nowMs: at(10),
  });
  assert.equal(decideSgReady(x).state, 'off', 'beide Bedingungen neu, Verzögerung muss trotzdem ablaufen');
  x.nowMs += 5 * MIN;
  assert.equal(decideSgReady(x).state, 'off');
  x.nowMs = at(10) + 10 * MIN;
  assert.equal(decideSgReady(x).state, 'boost');
});

test('Während der Mindestlaufzeit fest verriegelt: Wolken oder sinkender SoC brechen nicht ab', () => {
  const x = base({
    cfg: {
      minSolarW: 1500, minRunMin: 90, startDelayMin: 0,
    },
    pvW: 1600,
    nowMs: at(10),
  });
  decideSgReady(x);
  x.nowMs = at(10) + 30 * MIN;
  x.pvW = 0; // Wolke
  const r = decideSgReady(x);
  assert.equal(r.state, 'boost', 'Mindestlaufzeit (90 Min.) noch nicht um');
  assert.match(r.reason, /Mindestlaufzeit/);
});

test('Halten nach der Mindestlaufzeit: SoC-Hysterese lässt ein leichtes Absinken zu', () => {
  const x = base({
    cfg: {
      minSolarW: 1500, minSoc: 98, socHysteresis: 10, minRunMin: 90, stopDelayMin: 8, startDelayMin: 0,
    },
    pvW: 1600,
    hasBattery: true,
    soc: 98,
    nowMs: at(10),
  });
  decideSgReady(x);
  x.nowMs = at(10) + 91 * MIN;
  x.soc = 90; // unter minSoc, aber über minSoc - socHysteresis (88)
  const r = decideSgReady(x);
  assert.equal(r.state, 'boost', 'hält dank Hysterese weiter');
});

test('Beenden nach der Mindestlaufzeit: Bedingungen fehlen für stopDelayMin -> zurück zu off, Cooldown startet', () => {
  const x = base({
    cfg: {
      minSolarW: 1500, minRunMin: 90, stopDelayMin: 8, cooldownMin: 30, startDelayMin: 0,
    },
    pvW: 1600,
    nowMs: at(10),
  });
  decideSgReady(x);
  x.nowMs = at(10) + 91 * MIN;
  x.pvW = 0;
  let r = decideSgReady(x);
  assert.equal(r.state, 'boost', 'Ausschaltverzögerung läuft noch');
  x.nowMs += 7 * MIN;
  r = decideSgReady(x);
  assert.equal(r.state, 'boost', 'noch nicht 8 Minuten ohne Bedingung');
  x.nowMs += 2 * MIN;
  r = decideSgReady(x);
  assert.equal(r.state, 'off');
  assert.equal(r.deadlineMs, x.st.cooldownUntil);
  // Cooldown blockiert einen sofortigen Neustart, auch mit PV.
  x.pvW = 3000;
  x.nowMs += 1000;
  r = decideSgReady(x);
  assert.equal(r.state, 'off');
  assert.match(r.reason, /Abkühlpause/);
  x.nowMs = x.st.cooldownUntil + 1000;
  r = decideSgReady(x);
  assert.equal(r.state, 'boost', 'Cooldown um, PV reicht - startet wieder (startDelayMin hier 0)');
});

test('Eskalation zu "forced" (1:1): nur wenn erlaubt, erst nach startDelayMin über forcedMinW', () => {
  const x = base({
    cfg: {
      minSolarW: 1500, allowForced: true, forcedMinW: 4500, startDelayMin: 10, minRunMin: 0,
    },
    pvW: 1600,
    nowMs: at(10),
  });
  decideSgReady(x);
  x.nowMs = at(10) + 10 * MIN; // startDelayMin abgelaufen -> off -> boost
  let r = decideSgReady(x);
  assert.equal(r.state, 'boost');
  x.pvW = 5000; // jetzt auch über forcedMinW - forcedOkSince wird in diesem Lauf erst gesetzt
  x.nowMs += 1000;
  r = decideSgReady(x);
  assert.equal(r.state, 'boost', 'noch nicht 10 Minuten über forcedMinW');
  x.nowMs += 10 * MIN;
  r = decideSgReady(x);
  assert.equal(r.state, 'forced');
});

test('allowForced = aus (Standard): eskaliert nie, auch bei sehr viel PV', () => {
  const x = base({
    cfg: {
      minSolarW: 1500, forcedMinW: 4500, startDelayMin: 0, minRunMin: 0,
    },
    pvW: 6000,
    nowMs: at(10),
  });
  decideSgReady(x);
  x.nowMs += 20 * MIN;
  const r = decideSgReady(x);
  assert.equal(r.state, 'boost');
});

test('Rückfall von "forced" zu "boost": nach stopDelayMin unter forcedMinW, Mindestlaufzeit läuft nahtlos weiter', () => {
  const x = base({
    cfg: {
      minSolarW: 1500, allowForced: true, forcedMinW: 4500, startDelayMin: 0, stopDelayMin: 8, minRunMin: 90,
    },
    pvW: 5000,
    nowMs: at(10),
  });
  decideSgReady(x); // boost
  x.nowMs += 1000;
  let r = decideSgReady(x);
  assert.equal(r.state, 'forced');
  const startedAt = x.st.boostStartedAt;
  x.nowMs += 5 * MIN;
  x.pvW = 1600; // unter forcedMinW, aber weiterhin genug für boost
  r = decideSgReady(x);
  assert.equal(r.state, 'forced', 'Ausschaltverzögerung für die Eskalation läuft noch');
  x.nowMs += 8 * MIN;
  r = decideSgReady(x);
  assert.equal(r.state, 'boost');
  assert.equal(x.st.boostStartedAt, startedAt, 'die ursprüngliche Mindestlaufzeit bleibt bestehen');
});

// ---------------------------------------------------------------- Runner (Relais schalten, nur bei Wechsel)

const { normalizeConfig } = require('../lib/ems/Config');
const { EmsRunner } = require('../lib/ems/EmsRunner');
const { ShadowLog } = require('../lib/ems/ShadowLog');
const { PriceFeed } = require('../lib/ems/PriceFeed');
const { PvFeed } = require('../lib/ems/PvFeed');

function makeRunner(sgOver = {}, tempRef = { v: 40 }, dhwOver = undefined) {
  const config = normalizeConfig({
    enabled: true,
    silent: false,
    devices: { meter: { id: 'm' } },
    charger: { enabled: false },
    sgready: {
      enabled: true,
      live: true,
      startDelayMin: 0,
      minRunMin: 0,
      sensorId: 'ww',
      recommendRelay: { deviceId: 'rel2', capability: 'onoff' },
      forceRelay: { deviceId: 'rel1', capability: 'onoff' },
      ...sgOver,
    },
    dhw: dhwOver,
  });
  const calls = [];
  const runner = new EmsRunner({
    getConfig: () => config,
    prices: new PriceFeed(() => null),
    pv: new PvFeed(null, () => {}, { get: async () => ({ slots: [], stale: true }) }),
    inputs: {
      chargerInputs: async () => ({
        gridW: -2500, houseW: 300, pvW: 3000, batterySoc: null, batteryW: 0, chargerRead: false, chargerConnected: false, chargerPowerW: 0, other: null,
      }),
      consumerStates: async () => new Map(),
      readNumber: async () => tempRef.v,
      readValue: async () => null,
    },
    actuators: {
      charger: async () => ({}),
      program: async (deviceId, capability, value, { live }) => {
        calls.push([deviceId, capability, value, live]);
        return { cmd: 'program', live };
      },
    },
    shadowLog: new ShadowLog({ get() {}, set() {} }),
    store: null,
  });
  return { runner, calls, tempRef };
}

test('Config: sgready wird normalisiert und ist standardmässig aus', () => {
  assert.equal(normalizeConfig({}).sgready.enabled, false);
  assert.equal(normalizeConfig({ sgready: { enabled: true, minRunMin: 5000 } }).sgready.minRunMin, 480);
});

test('Runner: schaltet das Empfehlungs-Relais nur beim Wechsel, Zieltemperatur schaltet wieder aus', async () => {
  const { runner, calls, tempRef } = makeRunner();
  await runner.tickCharger(at(10));
  assert.deepEqual(calls, [['rel2', 'onoff', true, true]], 'Start: nur Empfehlungs-Relais, Zwang ist nicht erlaubt');
  assert.equal(runner.sgReadyCurrent.state, 'boost');
  await runner.tickCharger(at(10) + 30000);
  assert.equal(calls.length, 1, 'keine Wiederholung ohne Wechsel');
  tempRef.v = 57;
  await runner.tickCharger(at(10) + 60000);
  assert.deepEqual(calls[1], ['rel2', 'onoff', false, true]);
  assert.equal(runner.sgReadyCurrent.state, 'off');
});

test('Runner: ausgeschaltet oder Silent-Modus schaltet nichts (simuliert nur)', async () => {
  const off = makeRunner({ enabled: false });
  await off.runner.tickCharger(at(10));
  assert.equal(off.calls.length, 0);
  assert.equal(off.runner.sgReadyCurrent, null);
  const dry = makeRunner({ live: false });
  await dry.runner.tickCharger(at(10));
  assert.deepEqual(dry.calls, [['rel2', 'onoff', true, false]], 'nicht live: Befehl nur simuliert (live=false)');
});

test('Runner: Betriebsart - nur auf dem freigegebenen Wert wird gesteuert, sonst (auch unlesbar) nicht', async () => {
  const ok = makeRunner({ modeId: 'wp', modeCapability: 'mode', modeOkValue: 'Automatik' });
  ok.runner.inputs.readValue = async () => 'Automatik';
  await ok.runner.tickCharger(at(10));
  assert.equal(ok.runner.sgReadyCurrent.state, 'boost');
  const other = makeRunner({ modeId: 'wp', modeCapability: 'mode', modeOkValue: 'Automatik' });
  other.runner.inputs.readValue = async () => 'Komfort';
  await other.runner.tickCharger(at(10));
  assert.equal(other.runner.sgReadyCurrent.state, 'off');
  assert.match(other.runner.sgReadyCurrent.reason, /Betriebsart/);
  assert.equal(other.calls.length, 1, 'Relais wird beim ersten Lauf auf Normalbetrieb gesetzt (aus)');
  assert.equal(other.calls[0][2], false);
});

test('Runner: Ausgabe über Flows - je Zustand ein Flow, nur beim Wechsel, ohne Flow passiert nichts', async () => {
  const fired = [];
  const flows = {
    output: 'flows',
    flowNormal: { id: 'fn', advanced: false, name: 'Normal' },
    flowBoost: { id: 'fb', advanced: true, name: 'Empfehlung' },
  };
  const { runner, calls, tempRef } = makeRunner(flows);
  runner.actuators.consumer = async (id, on, { live, flow }) => {
    fired.push([flow.id, live]);
    return { cmd: 'on', live };
  };
  await runner.tickCharger(at(10));
  assert.deepEqual(fired, [['fb', true]], 'Start: Empfehlungs-Flow');
  await runner.tickCharger(at(10) + 30000);
  assert.equal(fired.length, 1, 'keine Wiederholung');
  tempRef.v = 57;
  await runner.tickCharger(at(10) + 60000);
  assert.deepEqual(fired[1], ['fn', true], 'Zieltemperatur: Normalbetrieb-Flow');
  assert.equal(calls.length, 0, 'im Flow-Modus werden keine Relais geschrieben');
});

test('Standardwerte: Mindest-Temperatur 45 °C für Preis- und Sonnen-Start', () => {
  const d = normalizeSgReady({});
  assert.equal(d.priceBelowTemp, 45);
  assert.equal(d.pvBelowTemp, 45);
  assert.equal(d.priceAction, 'sgready');
});

test('Preis-Start als Warmwasser-Programm (dhw): SG-Ready bleibt aus, Sonne hat Vorrang und übernimmt als boost', () => {
  const cfg = {
    usePrice: true, maxPriceRp: 15, priceAction: 'dhw', startDelayMin: 0, minRunMin: 0, stopDelayMin: 0, priceSkipPv: false, minSolarW: 1500,
  };
  const x = base({
    cfg, priceNow: 10, tempWW: 40, nowMs: at(22),
  });
  const r = decideSgReady(x);
  assert.equal(r.state, 'dhw');
  assert.match(r.reason, /Warmwasser-Programm/);
  assert.deepEqual(relaysFor('dhw'), { recommend: false, force: false });
  // Sonne kommt dazu (vor windowTo): SG-Ready übernimmt
  const y = base({
    cfg, priceNow: 10, tempWW: 40, nowMs: at(10),
  });
  decideSgReady(y);
  assert.equal(y.st.state, 'dhw');
  y.pvW = 3000;
  y.nowMs += 60000;
  assert.equal(decideSgReady(y).state, 'boost');
  // Sonne hat beim Start Vorrang vor dem Preis
  const z = base({
    cfg, priceNow: 10, pvW: 3000, tempWW: 40, nowMs: at(10),
  });
  assert.equal(decideSgReady(z).state, 'boost');
});

test('Warmwasser-Programm hält nur per Preis und endet, wenn der Preis steigt', () => {
  const x = base({
    cfg: {
      usePrice: true, maxPriceRp: 15, priceAction: 'dhw', startDelayMin: 0, minRunMin: 0, stopDelayMin: 0, cooldownMin: 30, priceSkipPv: false, minSolarW: 1500,
    },
    priceNow: 10,
    tempWW: 40,
    nowMs: at(22),
  });
  assert.equal(decideSgReady(x).state, 'dhw');
  x.nowMs += 15 * MIN;
  assert.equal(decideSgReady(x).state, 'dhw');
  x.priceNow = 30;
  x.nowMs += 15 * MIN;
  const end = decideSgReady(x);
  assert.equal(end.state, 'off');
  assert.ok(x.st.cooldownUntil);
});

test('Runner: Betriebsart-Vergleich ignoriert Gross-/Kleinschreibung und Leerzeichen (AUTOMATIK = Automatik)', async () => {
  const r = makeRunner({ modeId: 'wp', modeCapability: 'mode', modeOkValue: 'Automatik' });
  r.runner.inputs.readValue = async () => ' AUTOMATIK ';
  await r.runner.tickCharger(at(10));
  assert.equal(r.runner.sgReadyCurrent.modeBlocked, false);
});

test('parseSgReadyState: Nummern 1 bis 4, Text mit führender Nummer, Stichworte, sonst unbekannt', () => {
  assert.equal(parseSgReadyState('2 NORMAL').state, 'off');
  assert.equal(parseSgReadyState('3 EMPFEHLUNG').state, 'boost');
  assert.equal(parseSgReadyState('4 ANLAUFBEFEHL').state, 'forced');
  assert.equal(parseSgReadyState('1 EVU SPERRE').state, 'lock');
  assert.equal(parseSgReadyState(3).state, 'boost');
  assert.equal(parseSgReadyState('Normalbetrieb').state, 'off');
  assert.equal(parseSgReadyState('Einschaltempfehlung').state, 'boost');
  assert.equal(parseSgReadyState('12 irgendwas').state, null);
  assert.equal(parseSgReadyState(null).state, null);
  assert.equal(parseSgReadyState('2 NORMAL').raw, '2 NORMAL');
});

test('Runner: Zustand von der Wärmepumpe übernehmen - gemeldet wird angezeigt, Abweichung erst nach der Einschwingzeit, nur live', async () => {
  const { runner } = makeRunner({ feedbackId: 'wp', feedbackCapability: 'sg' });
  let reported = '2 NORMAL';
  runner.inputs.readValue = async (id) => (id === 'wp' ? reported : null);
  await runner.tickCharger(at(10)); // wir wollen boost, die WP meldet noch normal
  assert.equal(runner.sgReadyCurrent.state, 'boost');
  assert.equal(runner.sgReadyCurrent.reported, '2 NORMAL');
  assert.equal(runner.sgReadyCurrent.mismatch, false, 'Einschwingzeit: noch keine Warnung');
  await runner.tickCharger(at(10) + 6 * 60000);
  assert.equal(runner.sgReadyCurrent.mismatch, true, 'nach 6 Minuten meldet sie immer noch Normal');
  reported = '3 EMPFEHLUNG';
  await runner.tickCharger(at(10) + 7 * 60000);
  assert.equal(runner.sgReadyCurrent.mismatch, false, 'passt jetzt');
  reported = '1 EVU SPERRE';
  await runner.tickCharger(at(10) + 8 * 60000);
  assert.equal(runner.sgReadyCurrent.mismatch, true, 'EVU-Sperre warnt sofort');
});

test('Runner: Rückmeldung ohne live warnt nie (es wird ja nichts geschaltet)', async () => {
  const { runner } = makeRunner({ feedbackId: 'wp', feedbackCapability: 'sg', live: false });
  runner.inputs.readValue = async () => '2 NORMAL';
  await runner.tickCharger(at(10));
  await runner.tickCharger(at(10) + 10 * 60000);
  assert.equal(runner.sgReadyCurrent.reported, '2 NORMAL');
  assert.equal(runner.sgReadyCurrent.mismatch, false);
});

const dhwBase = {
  enabled: true, live: true, cheapHours: 2, belowTemp: 45, skipPv: false, startDelayMin: 0, minRunMin: 0, stopDelayMin: 0, sensorId: 'ww',
};
const dayPrices = (fromMs, toMs) => Array.from({ length: 96 }, (_, k) => {
  const t = at(0) + k * 900000;
  return { start: t, end: t + 900000, price: t >= fromMs && t < toMs ? 10 : 30 };
});
const cheapAt22 = () => dayPrices(at(22), at(0) + 86400000); // die günstigsten 2 Stunden: 22:00 bis 24:00

test('Warmwasser-Programm (eigenes Modul) per Flow: ein beim Start, zurück auf Normal beim Ende, SG-Ready bleibt unberührt', async () => {
  const fired = [];
  const { runner, calls, tempRef } = makeRunner({ enabled: false }, { v: 40 }, {
    ...dhwBase, flowOn: { id: 'on', advanced: false, name: 'WW an' }, flowOff: { id: 'off', advanced: true, name: 'WW aus' },
  });
  runner.prices = { getSlots: cheapAt22 };
  runner.actuators.consumer = async (id, on, { live, flow }) => {
    fired.push([flow.id, live]);
    return { cmd: 'on', live };
  };
  await runner.tickCharger(at(22));
  assert.deepEqual(fired, [['on', true]]);
  assert.equal(runner.dhwCurrent.on, true);
  await runner.tickCharger(at(22) + 30000);
  assert.equal(fired.length, 1, 'keine Wiederholung');
  tempRef.v = 57;
  await runner.tickCharger(at(22) + 60000);
  assert.deepEqual(fired[1], ['off', true]);
  assert.equal(runner.dhwCurrent.on, false);
  assert.equal(calls.length, 0, 'SG-Ready-Relais werden nicht angefasst');
  assert.equal(runner.sgReadyCurrent, null, 'SG-Ready ist aus');
});

test('Warmwasser-Programm per App-Capability (true/false oder Text), «aus» nie ohne vorheriges «ein»', async () => {
  const sets = [];
  const { runner, tempRef } = makeRunner({ enabled: false }, { v: 57 }, {
    ...dhwBase,
    output: 'capability',
    device: {
      deviceId: 'wp', capability: 'dhw_mode', onValue: 'Warmwasser', offValue: 'Automatik',
    },
  });
  runner.prices = { getSlots: cheapAt22 };
  runner.actuators.program = async (deviceId, capability, value, { live }) => {
    sets.push([deviceId, capability, value, live]);
    return { cmd: 'program', live };
  };
  await runner.tickCharger(at(21)); // Ziel schon erreicht: kein «aus» ohne vorheriges «ein»
  assert.equal(sets.length, 0);
  tempRef.v = 40;
  await runner.tickCharger(at(22));
  assert.deepEqual(sets, [['wp', 'dhw_mode', 'Warmwasser', true]]);
  tempRef.v = 57;
  await runner.tickCharger(at(22) + 60000);
  assert.deepEqual(sets[1], ['wp', 'dhw_mode', 'Automatik', true]);
});

test('Warmwasser-Programm und SG-Ready schliessen sich gegenseitig aus: wer läuft, behält den Lauf; nicht live nur simuliert', async () => {
  const fired = [];
  const { runner } = makeRunner({ minSolarW: 1500, startDelayMin: 0, minRunMin: 0 }, { v: 40 }, {
    ...dhwBase, flowOn: { id: 'on', advanced: false, name: 'WW an' }, flowOff: { id: 'off', advanced: false, name: 'WW aus' },
  });
  runner.prices = { getSlots: () => dayPrices(at(10), at(12)) };
  runner.actuators.consumer = async (id, on, { live, flow }) => {
    fired.push([flow.id, live]);
    return { cmd: 'on', live };
  };
  let pv = 0;
  runner.inputs.chargerInputs = async () => ({
    gridW: 0, houseW: 300, pvW: pv, batterySoc: null, batteryW: 0, chargerRead: false, chargerConnected: false, chargerPowerW: 0, other: null,
  });
  await runner.tickCharger(at(10)); // keine Sonne, günstiger Preis
  assert.equal(runner.dhwCurrent.on, true);
  pv = 3000; // Sonne kommt dazu: SG-Ready startet NICHT, solange das Warmwasser-Programm läuft
  await runner.tickCharger(at(10) + 60000);
  assert.equal(runner.sgReadyCurrent.state, 'off');
  assert.match(runner.sgReadyCurrent.reason, /Warmwasser-Programm läuft/);
  assert.equal(runner.dhwCurrent.on, true);
  assert.deepEqual(fired.map((f) => f[0]), ['on']);

  const dry = makeRunner({ enabled: false }, { v: 40 }, { ...dhwBase, live: false, flowOn: { id: 'on', advanced: false, name: 'x' } });
  dry.runner.prices = { getSlots: cheapAt22 };
  const seen = [];
  dry.runner.actuators.consumer = async (id, on, { live }) => {
    seen.push(live);
    return { cmd: 'on', live };
  };
  await dry.runner.tickCharger(at(22));
  assert.deepEqual(seen, [false], 'nicht live: Flow nur simuliert');
});

test('priceCheap ersetzt den Preisvergleich: günstige Stunde startet, auch wenn der Preis hoch wäre; false blockiert; null fällt auf den Preis zurück', () => {
  const cfg = {
    usePrice: true, maxPriceRp: 15, priceBelowTemp: 0, startDelayMin: 0, priceSkipPv: false,
  };
  assert.equal(decideSgReady(base({
    cfg, priceNow: 40, priceCheap: true, nowMs: at(22),
  })).state, 'boost');
  assert.equal(decideSgReady(base({
    cfg, priceNow: 5, priceCheap: false, nowMs: at(22),
  })).state, 'off');
  assert.equal(decideSgReady(base({
    cfg, priceNow: 5, priceCheap: null, nowMs: at(22),
  })).state, 'boost');
});

test('cheapestOfDay: die günstigsten N Stunden des lokalen Tages, zusammenhängende Viertelstunden werden zu Zeiträumen', () => {
  const slots = [];
  for (let k = 0; k < 96; k += 1) {
    const t = at(0) + k * 900000;
    // 03:00-04:00 für 5, 14:00-14:30 für 6, sonst 30
    const price = (t >= at(3) && t < at(4)) ? 5 : ((t >= at(14) && t < at(14, 30)) ? 6 : 30);
    slots.push({ start: t, end: t + 900000, price });
  }
  const c = cheapestOfDay(slots, at(12), TZ, 1.5);
  assert.equal(c.count, 6);
  assert.deepEqual(c.ranges, [{ startMs: at(3), endMs: at(4) }, { startMs: at(14), endMs: at(14, 30) }]);
  assert.equal(Math.round(c.avgRp * 100) / 100, Math.round(((4 * 5 + 2 * 6) / 6) * 100) / 100);
  assert.equal(cheapestOfDay(slots, at(12), TZ, 1.5, 1), null, 'morgen noch keine Preise');
  assert.equal(cheapestOfDay(slots.slice(0, 3), at(12), TZ, 2), null, 'zu wenige Preise');
  const pre = cheapestPreview(slots, at(3, 20), TZ, 1);
  assert.equal(pre.nowCheap, true);
  assert.equal(pre.tomorrow, null);
  assert.equal(cheapestPreview(slots, at(12), TZ, 1).nowCheap, false);
  assert.equal(priceDays(slots, at(12), TZ).today.length, 96);
  assert.equal(priceDays(slots, at(12), TZ).tomorrow.length, 0);
});

test('Runner: das Warmwasser-Programm startet nur in den günstigsten Stunden und nicht ohne Tagespreise', async () => {
  const fired = [];
  const { runner } = makeRunner({ enabled: false }, { v: 40 }, { ...dhwBase, flowOn: { id: 'on', advanced: false, name: 'x' } });
  runner.actuators.consumer = async (id, on, { flow }) => {
    fired.push(flow.id);
    return { cmd: 'on' };
  };
  runner.prices = { getSlots: () => dayPrices(at(2), at(4)) };
  await runner.tickCharger(at(12)); // teure Zeit
  assert.equal(fired.length, 0);
  assert.equal(runner.dhwCurrent.window.today.ranges.length, 1);
  assert.match(runner.dhwCurrent.reason, /günstigsten Stunden/);
  await runner.tickCharger(at(2) + 60000); // günstigste Zeit
  assert.deepEqual(fired, ['on']);
  runner.prices = { getSlots: () => [] };
  await runner.tickCharger(at(12) + 3600000);
  assert.equal(runner.dhwCurrent.window.today, null, 'ohne Preise: kein Start');
});

test('Runner: «günstigste Stunden des Tages» rechnet mit dem ganzen Tag (auch Vergangenes), sonst gehörte abends jede Viertelstunde dazu', async () => {
  const fired = [];
  const { runner } = makeRunner({ enabled: false }, { v: 40 }, { ...dhwBase, flowOn: { id: 'on', advanced: false, name: 'x' } });
  runner.actuators.consumer = async (id, on, { flow }) => {
    fired.push(flow.id);
    return { cmd: 'on' };
  };
  const full = dayPrices(at(2), at(4)); // günstig war es nachts
  runner.prices = { getSlots: (now) => full.filter((s) => s.end > now), range: () => full };
  await runner.tickCharger(at(22)); // abends: nur noch teure Preise kommen, aber der Tag war nachts günstiger
  assert.equal(fired.length, 0);
  assert.equal(runner.dhwCurrent.window.nowCheap, false);
});

test('Zieltemperatur aus der Wärmepumpe: targetOverride ersetzt das feste Ziel, Höchstdauer beendet einen Lauf', () => {
  const cfg = {
    minSolarW: 1500, startDelayMin: 0, minRunMin: 0, targetTemp: 56, pvBelowTemp: 0,
  };
  const x = base({
    cfg, pvW: 2000, tempWW: 40, nowMs: at(10),
  });
  assert.equal(decideSgReady(x).state, 'boost');
  x.tempWW = 47.2;
  x.nowMs += 20 * MIN;
  assert.equal(decideSgReady(x).state, 'boost', 'ohne Override noch unter dem festen Ziel 56');
  x.targetOverride = 47; // WW-Soll 48 minus 1 K
  x.nowMs += 1000;
  const r = decideSgReady(x);
  assert.equal(r.state, 'off');
  assert.match(r.reason, /Zieltemperatur erreicht/);
  const y = base({
    cfg: {
      minSolarW: 1500, startDelayMin: 0, minRunMin: 0, maxRunMin: 60, pvBelowTemp: 0,
    },
    pvW: 2000,
    tempWW: 40,
    nowMs: at(10),
  });
  assert.equal(decideSgReady(y).state, 'boost');
  y.nowMs += 59 * MIN;
  assert.equal(decideSgReady(y).state, 'boost');
  y.nowMs += 2 * MIN;
  const e = decideSgReady(y);
  assert.equal(e.state, 'off');
  assert.match(e.reason, /Höchstdauer erreicht \(60 min\)/);
  assert.ok(y.st.cooldownUntil, 'danach Abkühlpause');
});

test('Standardwerte Warmwasser-Programm: Ziel 50 °C (Verdichter-Grenze), Höchstdauer 180 min, Ziel fest', () => {
  const d = normalizeDhw({});
  assert.equal(d.targetTemp, 50);
  assert.equal(d.maxRunMin, 180);
  assert.equal(d.targetSource, 'manual');
  assert.equal(d.targetTol, 1);
  assert.equal(normalizeDhw({
    targetSource: 'device', targetId: 'wp', targetCapability: 'soll', maxRunMin: 0,
  }).maxRunMin, 0);
  assert.equal(normalizeSgReady({}).maxRunMin, 0, 'SG-Ready ohne Höchstdauer');
});

test('Runner: Ziel aus der Wärmepumpe (WW-Soll minus Toleranz) für SG-Ready und Warmwasser-Programm, nicht lesbar -> festes Ziel', async () => {
  let soll = 48;
  const sg = makeRunner({
    targetSource: 'device', targetId: 'wp', targetCapability: 'soll', targetTol: 1, pvBelowTemp: 0,
  }, { v: 40 });
  const baseRead = sg.runner.inputs.readNumber;
  sg.runner.inputs.readNumber = async (id, cap) => (id === 'wp' ? soll : baseRead(id, cap));
  await sg.runner.tickCharger(at(10));
  assert.equal(sg.runner.sgReadyCurrent.state, 'boost');
  assert.equal(sg.runner.sgReadyCurrent.target, 47);
  assert.equal(sg.runner.sgReadyCurrent.soll, 48);
  sg.tempRef.v = 47.1;
  await sg.runner.tickCharger(at(10) + 60000);
  assert.equal(sg.runner.sgReadyCurrent.state, 'off', 'Ende schon bei 47 statt bei einem nie erreichten festen Ziel');
  soll = null; // nicht lesbar
  const fb = makeRunner({
    targetSource: 'device', targetId: 'wp', targetCapability: 'soll', targetTemp: 52, pvBelowTemp: 0,
  }, { v: 40 });
  fb.runner.inputs.readNumber = async (id) => (id === 'wp' ? null : 40);
  await fb.runner.tickCharger(at(10));
  assert.equal(fb.runner.sgReadyCurrent.target, 52, 'Ersatz-Ziel');

  const dhw = makeRunner({ enabled: false }, { v: 40 }, {
    ...dhwBase, targetSource: 'device', targetId: 'wp', targetCapability: 'soll', flowOn: { id: 'on', advanced: false, name: 'x' }, flowOff: { id: 'off', advanced: false, name: 'y' },
  });
  const fired = [];
  dhw.runner.prices = { getSlots: cheapAt22 };
  dhw.runner.actuators.consumer = async (id, on, { flow }) => {
    fired.push(flow.id);
    return { cmd: 'on' };
  };
  dhw.runner.inputs.readNumber = async (id) => (id === 'wp' ? 48 : dhw.tempRef.v);
  await dhw.runner.tickCharger(at(22));
  assert.deepEqual(fired, ['on']);
  assert.equal(dhw.runner.dhwCurrent.target, 47);
  dhw.tempRef.v = 47.5;
  await dhw.runner.tickCharger(at(22) + 60000);
  assert.deepEqual(fired, ['on', 'off']);
});

test('Warmwasser-Programm: Betriebsart-Prüfung bricht das eigene Umschalten nicht ab (Programm-Wert während des Laufs erlaubt)', async () => {
  const fired = [];
  let mode = 'AUTOMATIK';
  const { runner } = makeRunner({ enabled: false }, { v: 40 }, {
    ...dhwBase, modeId: 'wp', modeCapability: 'mode', modeOkValue: 'Automatik', modeProgramValue: 'Warmwasser', flowOn: { id: 'on', advanced: false, name: 'x' }, flowOff: { id: 'off', advanced: false, name: 'y' },
  });
  runner.prices = { getSlots: cheapAt22 };
  runner.inputs.readValue = async () => mode;
  runner.actuators.consumer = async (id, on, { flow }) => {
    fired.push(flow.id);
    return { cmd: 'on' };
  };
  await runner.tickCharger(at(22));
  assert.deepEqual(fired, ['on']);
  mode = 'WARMWASSER'; // das Umschalten haben wir selbst gemacht
  await runner.tickCharger(at(22) + 60000);
  assert.equal(runner.dhwCurrent.on, true, 'läuft weiter');
  assert.equal(runner.dhwCurrent.modeBlocked, false);
  mode = 'KOMFORT'; // jemand anderes stellt etwas anderes ein
  await runner.tickCharger(at(22) + 120000);
  assert.equal(runner.dhwCurrent.on, false);
  assert.match(runner.dhwCurrent.reason, /Betriebsart/);
});

test('Pause (Widget-Schalter): beendet ein laufendes Warmwasser-Programm sofort, sperrt neue Starts und bleibt gespeichert', async () => {
  const fired = [];
  const { runner } = makeRunner({ enabled: false }, { v: 40 }, {
    ...dhwBase, flowOn: { id: 'on', advanced: false, name: 'x' }, flowOff: { id: 'off', advanced: false, name: 'y' },
  });
  runner.prices = { getSlots: cheapAt22 };
  runner.actuators.consumer = async (id, on, { flow }) => {
    fired.push(flow.id);
    return { cmd: 'on' };
  };
  await runner.tickCharger(at(22));
  assert.deepEqual(fired, ['on']);
  runner.setPaused('dhw', true);
  await runner.tickCharger(at(22) + 60000);
  assert.deepEqual(fired, ['on', 'off'], 'Pause beendet den Lauf (zurück auf Normal)');
  assert.equal(runner.dhwCurrent.on, false);
  assert.equal(runner.dhwCurrent.paused, true);
  await runner.tickCharger(at(22) + 3600000);
  assert.deepEqual(fired, ['on', 'off'], 'kein neuer Start während der Pause');
  assert.throws(() => runner.setPaused('x', true));
  runner.setPaused('dhw', false);
  assert.equal(runner.paused.dhw, false);
});

test('Hysterese der Wärmepumpe (optional, von Hand): Ziel = WW-Soll + Hysterese - Toleranz, Standard 0', async () => {
  assert.equal(normalizeDhw({}).targetHyst, 0);
  assert.equal(normalizeSgReady({}).targetHyst, 0);
  assert.equal(normalizeDhw({ targetHyst: 2 }).targetHyst, 2);
  const sg = makeRunner({
    targetSource: 'device', targetId: 'wp', targetCapability: 'soll', targetTol: 1, targetHyst: 2, pvBelowTemp: 0,
  }, { v: 40 });
  const baseRead = sg.runner.inputs.readNumber;
  sg.runner.inputs.readNumber = async (id, cap) => (id === 'wp' ? 48 : baseRead(id, cap));
  await sg.runner.tickCharger(at(10));
  assert.equal(sg.runner.sgReadyCurrent.target, 49, '48 + 2 - 1');
  const none = makeRunner({
    targetSource: 'device', targetId: 'wp', targetCapability: 'soll', targetTol: 1, pvBelowTemp: 0,
  }, { v: 40 });
  none.runner.inputs.readNumber = async (id) => (id === 'wp' ? 48 : 40);
  await none.runner.tickCharger(at(10));
  assert.equal(none.runner.sgReadyCurrent.target, 47, 'ohne Hysterese wie bisher');
});

test('Start von Hand: sofort, ohne Sonne/Preis/Verzögerung und mitten in der Abkühlpause; hält bis Ziel oder Höchstdauer (180 min, auch ohne Einstellung); Pause und «Ziel erreicht» weisen ab', () => {
  const cfg = {
    minSolarW: 1500, startDelayMin: 10, minRunMin: 0, targetTemp: 58, pvBelowTemp: 0, cooldownMin: 30,
  };
  const x = base({ cfg, pvW: 0, tempWW: 50, nowMs: at(20) });
  assert.equal(decideSgReady(x).state, 'off', 'ohne Sonne passiert nichts');
  x.st.cooldownUntil = x.nowMs + 20 * MIN;
  const r = decideSgReady({ ...x, manualStart: true, manualKind: 'boost' });
  assert.equal(r.state, 'boost');
  assert.match(r.reason, /von Hand/);
  assert.equal(x.st.manual, true);
  x.nowMs += 60 * MIN;
  assert.equal(decideSgReady(x).state, 'boost', 'hält ohne Sonne (kein Ausschalten wegen weggefallener Bedingung)');
  x.nowMs += 121 * MIN;
  const e = decideSgReady(x);
  assert.equal(e.state, 'off');
  assert.match(e.reason, /Höchstdauer erreicht \(180 min\)/);
  assert.equal(x.st.manual, false);
  // Ziel schon erreicht -> keine Hektik
  const done = base({ cfg, pvW: 0, tempWW: 59, nowMs: at(20) });
  const d = decideSgReady({ ...done, manualStart: true });
  assert.equal(d.state, 'off');
  assert.match(d.reason, /Zieltemperatur erreicht/);
  // Pause sperrt
  const blk = base({ cfg, pvW: 0, tempWW: 50, nowMs: at(20) });
  const b = decideSgReady({ ...blk, manualStart: true, externalBlock: 'Pausiert (Schalter im Widget)' });
  assert.equal(b.state, 'off');
  assert.match(b.reason, /Pausiert/);
  // Warmwasser-Programm
  const w = base({ cfg: { ...cfg, priceAction: 'dhw' }, pvW: 0, tempWW: 40, nowMs: at(20) });
  assert.equal(decideSgReady({ ...w, manualStart: true, manualKind: 'dhw' }).state, 'dhw');
});

test('Runner: Start von Hand wird einmal verbraucht; Controller meldet Start und Grund; ausgeschaltetes Modul wird abgewiesen', async () => {
  const dhw = makeRunner({ enabled: false }, { v: 40 }, {
    ...dhwBase, flowOn: { id: 'on', advanced: false, name: 'x' }, flowOff: { id: 'off', advanced: false, name: 'y' },
  });
  const fired = [];
  dhw.runner.prices = { getSlots: () => [] };
  dhw.runner.actuators.consumer = async (id, on, { flow }) => {
    fired.push(flow.id);
    return { cmd: 'on' };
  };
  await dhw.runner.tickCharger(at(12));
  assert.deepEqual(fired, [], 'ohne günstige Stunde kein Start');
  dhw.runner.requestManualStart('dhw');
  await dhw.runner.tickCharger(at(12) + 60000);
  assert.deepEqual(fired, ['on'], 'von Hand gestartet');
  assert.equal(dhw.runner._manual.dhw, false, 'Anforderung verbraucht');
  assert.throws(() => dhw.runner.requestManualStart('x'));
});

test('Gegenseitiger Ausschluss, umgekehrt und von Hand: läuft SG-Ready, startet das Warmwasser-Programm nicht; Start von Hand des anderen wird abgewiesen', async () => {
  const fired = [];
  const { runner } = makeRunner({ minSolarW: 1500, startDelayMin: 0, minRunMin: 0 }, { v: 40 }, {
    ...dhwBase, flowOn: { id: 'on', advanced: false, name: 'WW an' }, flowOff: { id: 'off', advanced: false, name: 'WW aus' },
  });
  runner.prices = { getSlots: () => dayPrices(at(10), at(12)) };
  runner.actuators.consumer = async (id, on, { live, flow }) => {
    fired.push(flow.id);
    return { cmd: 'on', live };
  };
  runner.inputs.chargerInputs = async () => ({
    gridW: 0, houseW: 300, pvW: 3000, batterySoc: null, batteryW: 0, chargerRead: false, chargerConnected: false, chargerPowerW: 0, other: null,
  });
  await runner.tickCharger(at(10)); // Sonne UND günstiger Preis im selben Takt: SG-Ready (läuft zuerst) gewinnt
  assert.equal(runner.sgReadyCurrent.state, 'boost');
  assert.equal(runner.dhwCurrent.on, false);
  assert.match(runner.dhwCurrent.reason, /SG-Ready läuft/);
  assert.deepEqual(fired, [], 'das Warmwasser-Programm wurde nie gestartet');
  runner.requestManualStart('dhw');
  await runner.tickCharger(at(10) + 60000);
  assert.equal(runner.dhwCurrent.on, false, 'Start von Hand wird abgewiesen');
  assert.deepEqual(fired, []);

  // umgekehrt: Warmwasser-Programm läuft, SG-Ready lässt sich von Hand nicht starten
  const b = makeRunner({ minSolarW: 1500, startDelayMin: 0, minRunMin: 0 }, { v: 40 }, {
    ...dhwBase, flowOn: { id: 'on', advanced: false, name: 'x' }, flowOff: { id: 'off', advanced: false, name: 'y' },
  });
  b.runner.prices = { getSlots: cheapAt22 };
  b.runner.actuators.consumer = async () => ({ cmd: 'on' });
  b.runner.inputs.chargerInputs = async () => ({
    gridW: 0, houseW: 300, pvW: 0, batterySoc: null, batteryW: 0, chargerRead: false, chargerConnected: false, chargerPowerW: 0, other: null,
  });
  await b.runner.tickCharger(at(22));
  assert.equal(b.runner.dhwCurrent.on, true);
  b.runner.requestManualStart('sgready');
  await b.runner.tickCharger(at(22) + 60000);
  assert.equal(b.runner.sgReadyCurrent.state, 'off');
  assert.match(b.runner.sgReadyCurrent.reason, /Warmwasser-Programm läuft/);
  assert.equal(b.runner.dhwCurrent.on, true, 'läuft ungestört weiter');
});

test('Modul ausgeschaltet während eines Laufs: SG-Ready geht sauber zurück auf Normal (Relais aus), das Warmwasser-Programm startet seinen «aus»-Flow', async () => {
  const sg = makeRunner();
  await sg.runner.tickCharger(at(10));
  assert.equal(sg.runner.sgReadyCurrent.state, 'boost');
  assert.deepEqual(sg.calls, [['rel2', 'onoff', true, true]]);
  sg.runner.getConfig().sgready.enabled = false;
  await sg.runner.tickCharger(at(10) + 30000);
  assert.deepEqual(sg.calls[1], ['rel2', 'onoff', false, true], 'Relais wieder aus');
  assert.equal(sg.runner.sgReadyState.state, 'off');
  await sg.runner.tickCharger(at(10) + 60000);
  assert.equal(sg.calls.length, 2, 'danach nichts mehr');

  const fired = [];
  const d = makeRunner({ enabled: false }, { v: 40 }, {
    ...dhwBase, flowOn: { id: 'on', advanced: false, name: 'x' }, flowOff: { id: 'off', advanced: false, name: 'y' },
  });
  d.runner.prices = { getSlots: cheapAt22 };
  d.runner.actuators.consumer = async (id, on, { flow }) => {
    fired.push(flow.id);
    return { cmd: 'on' };
  };
  await d.runner.tickCharger(at(22));
  assert.deepEqual(fired, ['on']);
  d.runner.getConfig().dhw.enabled = false;
  await d.runner.tickCharger(at(22) + 60000);
  assert.deepEqual(fired, ['on', 'off'], 'ausgeschaltet während des Programms: zurück auf Normal');
  await d.runner.tickCharger(at(22) + 120000);
  assert.deepEqual(fired, ['on', 'off'], 'nur einmal');
});

test('Warmwasser-Programm: der vom eigenen Flow erhöhte WW-Soll verändert das Ziel nicht (Basis-Soll vor dem Programm), nach dem Ende kurz nicht übernehmen', async () => {
  let soll = 48;
  const { runner, tempRef } = makeRunner({ enabled: false }, { v: 40 }, {
    ...dhwBase, targetSource: 'device', targetId: 'wp', targetCapability: 'soll', targetTol: 1, targetHyst: 4, flowOn: { id: 'on', advanced: false, name: 'x' }, flowOff: { id: 'off', advanced: false, name: 'y' },
  });
  runner.prices = { getSlots: cheapAt22 };
  runner.actuators.consumer = async () => ({ cmd: 'on' });
  runner.inputs.readNumber = async (id) => (id === 'wp' ? soll : tempRef.v);
  await runner.tickCharger(at(22));
  assert.equal(runner.dhwCurrent.on, true);
  assert.equal(runner.dhwCurrent.target, 51, '48 + 4 - 1');
  soll = 52; // der Flow hat den Soll erhöht
  await runner.tickCharger(at(22) + 60000);
  assert.equal(runner.dhwCurrent.target, 51, 'unverändert: Basis zählt');
  tempRef.v = 51.5;
  await runner.tickCharger(at(22) + 120000);
  assert.equal(runner.dhwCurrent.on, false, 'Ende bei 51');
  await runner.tickCharger(at(22) + 180000); // der erhöhte Wert wird noch gemeldet, darf nicht zur Basis werden
  assert.equal(runner.dhwCurrent.target, 55, 'ohne Schutz wäre es 52 + 4 - 1');
});

test('Externer SG-Ready-Lauf (z. B. der bisherige Flow schaltet das Relais): Rückmeldung «3 EMPFEHLUNG» sperrt das Warmwasser-Programm und beendet ein laufendes', async () => {
  let reported = '2 NORMAL';
  const fired = [];
  const { runner } = makeRunner({ feedbackId: 'wp', feedbackCapability: 'sg', minSolarW: 99999 }, { v: 40 }, {
    ...dhwBase, flowOn: { id: 'on', advanced: false, name: 'x' }, flowOff: { id: 'off', advanced: false, name: 'y' },
  });
  runner.prices = { getSlots: cheapAt22 };
  runner.inputs.readValue = async (id, cap) => (cap === 'sg' ? reported : null);
  runner.actuators.consumer = async (id, on, { flow }) => {
    fired.push(flow.id);
    return { cmd: 'on' };
  };
  runner.inputs.chargerInputs = async () => ({
    gridW: 0, houseW: 300, pvW: 0, batterySoc: null, batteryW: 0, chargerRead: false, chargerConnected: false, chargerPowerW: 0, other: null,
  });
  await runner.tickCharger(at(22));
  assert.equal(runner.sgReadyCurrent.reportedState, 'off');
  assert.equal(runner.dhwCurrent.on, true, 'Normalbetrieb: Programm startet');
  reported = '3 EMPFEHLUNG'; // der bisherige Flow hat das Relais eingeschaltet
  await runner.tickCharger(at(22) + 60000);
  assert.equal(runner.sgReadyCurrent.state, 'off', 'wir selbst haben nichts gestartet');
  assert.equal(runner.sgReadyCurrent.reportedState, 'boost');
  assert.equal(runner.dhwCurrent.on, false, 'läuft nicht neben dem SG-Ready-Lauf');
  assert.deepEqual(fired, ['on', 'off']);
  await runner.tickCharger(at(22) + 3600000);
  assert.equal(runner.dhwCurrent.on, false, 'startet auch später nicht, solange es gemeldet wird');
});

test('Runner: wirksame Rampe mit Prognose-Bonus (Rest-Prognose, Batterie bis voll, Hausverbrauch bis Sonnenende), ohne Profil defensiv unverändert', () => {
  const { runner } = makeRunner();
  const share = {
    socLow: 50, socHigh: 80, pctLow: 0, pctHigh: 100, forecastBonus: 20,
  };
  const cfg = { share, battery: { deviceId: 'b', capacityKwh: 10 } };
  runner.pv = { remainingTodayKwh: () => 20, forecastKwh: (n, h) => Math.min(20, h * 5) };
  runner.loadProfile = { averageKw: () => 1 }; // 4 h Sonne x 1 kW = 4 kWh Haus
  const r = runner._computeShare(cfg, { batterySoc: 40, batteryCapacityKwh: 0 }, at(10));
  assert.equal(runner.shareShift, 20, '20 - 6 (Batterie) - 4 (Haus) = 10 kWh = ganze Kapazität');
  assert.deepEqual([r.socLow, r.socHigh], [30, 60]);
  runner.loadProfile = { averageKw: () => null }; // noch nichts gelernt
  const n = runner._computeShare(cfg, { batterySoc: 40, batteryCapacityKwh: 0 }, at(10));
  assert.equal(runner.shareShift, 0);
  assert.equal(n, share);
  assert.equal(runner._computeShare({ ...cfg, share: { ...share, forecastBonus: 0 } }, { batterySoc: 40 }, at(10)).socLow, 50);
});

test('Runner: shareInfo für die Anzeige (Anteil jetzt, Batteriestand, wirksame Rampe, Verschiebung)', () => {
  const { runner } = makeRunner();
  const cfg = { share: { socLow: 50, socHigh: 80, pctLow: 0, pctHigh: 100, forecastBonus: 0 }, battery: { deviceId: 'b', capacityKwh: 10 } };
  runner._computeShare(cfg, { batterySoc: 65 }, at(10));
  assert.deepEqual(
    (({ pct, soc, lo, hi, shift }) => ({ pct, soc, lo, hi, shift }))(runner.shareInfo),
    { pct: 50, soc: 65, lo: 50, hi: 80, shift: 0 },
    'Mitte der Rampe: 50 %',
  );
  runner._computeShare(cfg, { batterySoc: 30 }, at(10));
  assert.equal(runner.shareInfo.pct, 0, 'unter der Rampe: 0 %');
  runner._computeShare(cfg, { batterySoc: null }, at(10));
  assert.equal(runner.shareInfo.pct, null, 'Batteriestand unbekannt');
});

test('Speichern nur bei Änderung: derselbe Zustand wird nicht jeden Takt erneut geschrieben (Flash schonen)', async () => {
  const { runner } = makeRunner();
  const writes = [];
  runner.store = { get: () => null, set: (k) => writes.push(k) };
  await runner.tickCharger(at(10));
  await runner.tickCharger(at(10) + 30000);
  await runner.tickCharger(at(10) + 60000);
  const sg = writes.filter((k) => k === 'sgReadyState').length;
  assert.ok(sg >= 1 && sg <= 2, `SG-Ready-Zustand höchstens bei Änderungen geschrieben, nicht dreimal (war ${sg}x)`);
  const dhwBefore = writes.filter((k) => k === 'dhwState').length;
  await runner.tickCharger(at(10) + 90000);
  assert.equal(writes.filter((k) => k === 'dhwState').length, dhwBefore, 'unveränderter Zustand wird nicht erneut geschrieben');
});

test('Korrekturfaktor automatisch: trägt die Empfehlung einmal pro Tag selbst ein, nur ab genug Tagen, nur bei spürbarer Abweichung, nur wenn eingeschaltet', async () => {
  const { PvAccuracy } = require('../lib/ems/PvAccuracy'); // eslint-disable-line global-require
  const acc = new PvAccuracy(null, 'Europe/Zurich');
  const mk = (k) => ({
    act: 16, gap: 0, last: 1, first: 1, firstH: 6, fc: 20, f: 1, fcAt: 1, k,
  });
  for (let d = 1; d <= 7; d++) acc.days[`2026-11-0${d}`] = mk(d); // 7 vollständige Tage, Verhältnis 0.8
  const { runner } = makeRunner();
  runner.pvAccuracy = acc;
  const set = [];
  runner.onAutoFactor = (f, rec) => set.push([f, rec.days]);
  const cfg = runner.getConfig();
  cfg.pv.factor = 1;
  cfg.pv.factorAuto = false;
  await runner.tickCharger(at(10));
  assert.deepEqual(set, [], 'ausgeschaltet: nichts');
  cfg.pv.factorAuto = true;
  await runner.tickCharger(at(10) + 60000);
  assert.deepEqual(set, [[0.8, 7]], 'eingeschaltet: Empfehlung eingetragen');
  await runner.tickCharger(at(10) + 120000);
  assert.equal(set.length, 1, 'am selben Tag nicht nochmals');
  cfg.pv.factor = 0.8;
  await runner.tickCharger(at(10) + 24 * 3600000);
  assert.equal(set.length, 1, 'am nächsten Tag: schon gleich (Abweichung unter 0.03), nichts zu tun');
  // zu wenig Tage: nichts
  const few = new PvAccuracy(null, 'Europe/Zurich');
  for (let d = 1; d <= 6; d++) few.days[`2026-11-0${d}`] = mk(d);
  const r2 = makeRunner();
  r2.runner.pvAccuracy = few;
  const set2 = [];
  r2.runner.onAutoFactor = (f) => set2.push(f);
  r2.runner.getConfig().pv.factorAuto = true;
  r2.runner.getConfig().pv.factor = 1;
  await r2.runner.tickCharger(at(10));
  assert.deepEqual(set2, [], 'unter 7 Tagen keine Empfehlung');
});

test('Korrekturfaktor automatisch: kommen die Tage erst später (z. B. durch einen Import), wird beim nächsten Lauf angewendet, nicht erst morgen', async () => {
  const { PvAccuracy } = require('../lib/ems/PvAccuracy'); // eslint-disable-line global-require
  const acc = new PvAccuracy(null, 'Europe/Zurich');
  const { runner } = makeRunner();
  runner.pvAccuracy = acc;
  const set = [];
  runner.onAutoFactor = (f) => set.push(f);
  const cfg = runner.getConfig();
  cfg.pv.factor = 1;
  cfg.pv.factorAuto = true;
  await runner.tickCharger(at(10));
  assert.deepEqual(set, [], 'noch keine Daten');
  acc.importDays(Array.from({ length: 8 }, (_, k) => ({ day: `2026-10-0${k + 1}`, forecastKwh: 10, actualKwh: 6 })));
  await runner.tickCharger(at(10) + 60000);
  assert.deepEqual(set, [0.6], 'sofort angewendet, sobald die Empfehlung da ist');
});
