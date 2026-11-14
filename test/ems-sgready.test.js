'use strict';

// SG-Ready-Steuerung (Wärmepumpe/Boiler): zwei Relais, drei Zustände (0:0/0:1/1:1), siehe lib/ems/planner/sgready.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSgReady, decideSgReady, makeSgReadyState, relaysFor, parseSgReadyState,
} = require('../lib/ems/planner/sgready');
const { fromLocal } = require('../lib/time');

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

function makeRunner(sgOver = {}, tempRef = { v: 40 }) {
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

test('Runner: Warmwasser-Programm per Flow - ein beim Start, zurück auf Normal beim Ende, SG-Ready-Relais bleiben aus', async () => {
  const fired = [];
  const { runner, calls, tempRef } = makeRunner({
    usePrice: true,
    maxPriceRp: 100,
    priceAction: 'dhw',
    priceSkipPv: false,
    priceBelowTemp: 45,
    pvBelowTemp: 0,
    minSolarW: 99999,
    dhwFlowOn: { id: 'on', advanced: false, name: 'WW an' },
    dhwFlowOff: { id: 'off', advanced: true, name: 'WW aus' },
  });
  runner.prices = { getSlots: () => [{ start: Math.floor(at(22) / 900000) * 900000, end: at(22) + 900000, price: 10 }] };
  runner.actuators.consumer = async (id, on, { live, flow }) => {
    fired.push([flow.id, live]);
    return { cmd: 'on', live };
  };
  await runner.tickCharger(at(22));
  assert.deepEqual(fired, [['on', true]]);
  assert.equal(runner.sgReadyCurrent.state, 'dhw');
  assert.ok(calls.every((c) => c[2] === false), 'SG-Ready-Relais nie auf an');
  await runner.tickCharger(at(22) + 30000);
  assert.equal(fired.length, 1, 'keine Wiederholung');
  tempRef.v = 57;
  await runner.tickCharger(at(22) + 60000);
  assert.deepEqual(fired[1], ['off', true]);
});

test('Runner: Warmwasser-Programm per App-Capability (Werte true/false oder Text), «aus» nie ohne vorheriges «ein»', async () => {
  const sets = [];
  const { runner, tempRef } = makeRunner({
    usePrice: true,
    maxPriceRp: 100,
    priceAction: 'dhw',
    dhwOutput: 'capability',
    priceSkipPv: false,
    minSolarW: 99999,
    pvBelowTemp: 0,
    dhwDevice: {
      deviceId: 'wp', capability: 'dhw_mode', onValue: 'Warmwasser', offValue: 'Automatik',
    },
  });
  runner.prices = { getSlots: () => [{ start: Math.floor(at(22) / 900000) * 900000, end: at(22) + 900000, price: 10 }] };
  runner.actuators.program = async (deviceId, capability, value, { live }) => {
    sets.push([deviceId, capability, value, live]);
    return { cmd: 'program', live };
  };
  tempRef.v = 57; // Ziel schon erreicht: Normalbetrieb, aber kein «aus» ohne vorheriges «ein»
  await runner.tickCharger(at(21));
  assert.equal(sets.filter((s) => s[1] === 'dhw_mode').length, 0);
  tempRef.v = 40;
  await runner.tickCharger(at(22));
  assert.deepEqual(sets.filter((s) => s[1] === 'dhw_mode'), [['wp', 'dhw_mode', 'Warmwasser', true]]);
  tempRef.v = 57;
  await runner.tickCharger(at(22) + 60000);
  assert.deepEqual(sets.filter((s) => s[1] === 'dhw_mode')[1], ['wp', 'dhw_mode', 'Automatik', true]);
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
