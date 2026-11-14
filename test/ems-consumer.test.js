'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateConsumer, makeConsumerState } = require('../lib/ems/planner/consumer');

const MIN = 60_000;
const t0 = 1_800_000_000_000;
const share = { socLow: 50, socHigh: 80, pctLow: 0, pctHigh: 100, minSoc: 0 };
const env = (o = {}) => ({
  soc: 99, gridW: 0, batteryW: 0, pvW: 6000, share, forecastGateBlocks: false, actualOn: null, powerW: null, ...o,
});
const run = (cfg, st, e, now) => evaluateConsumer({ cfg, st, env: e, now });

test('Modus "voll": ein ab 98 %, nicht darunter', () => {
  const st = makeConsumerState();
  assert.deepEqual(run({ mode: 'full' }, st, env({ soc: 97 }), t0).commands, []);
  const r = run({ mode: 'full' }, st, env({ soc: 98 }), t0);
  assert.deepEqual(r.commands, [{ type: 'on' }]);
  assert.equal(st.isOn, true);
});

test('Modus "voll": Mindestlaufzeit hält das Gerät trotz SoC-Abfall, danach aus', () => {
  const cfg = { mode: 'full', minRunMin: 30 };
  const st = makeConsumerState();
  run(cfg, st, env({ soc: 100 }), t0);
  const early = run(cfg, st, env({ soc: 90 }), t0 + 10 * MIN);
  assert.equal(early.wantOn, true);
  assert.match(early.reason, /Mindestlaufzeit/);
  const late = run(cfg, st, env({ soc: 90 }), t0 + 31 * MIN);
  assert.deepEqual(late.commands, [{ type: 'off' }]);
});

test('Hysterese: bei 95 % (unter 98, über 93) läuft es weiter, aber startet nicht', () => {
  const cfg = { mode: 'full', minRunMin: 0, minOffMin: 0 };
  const st = makeConsumerState();
  assert.equal(run(cfg, st, env({ soc: 95 }), t0).wantOn, false);
  run(cfg, st, env({ soc: 100 }), t0 + MIN);
  assert.equal(run(cfg, st, env({ soc: 95 }), t0 + 2 * MIN).wantOn, true);
  assert.equal(run(cfg, st, env({ soc: 92 }), t0 + 3 * MIN).wantOn, false);
});

test('Modus "soc": eigene Schwelle', () => {
  const cfg = { mode: 'soc', socOn: 70, hysteresis: 10, minOffMin: 0 };
  const st = makeConsumerState();
  assert.equal(run(cfg, st, env({ soc: 69 }), t0).wantOn, false);
  assert.equal(run(cfg, st, env({ soc: 70 }), t0 + MIN).wantOn, true);
});

test('Mindest-Pause nach dem Stopp verhindert sofortiges Neustarten', () => {
  const cfg = { mode: 'full', minRunMin: 0, minOffMin: 10 };
  const st = makeConsumerState();
  run(cfg, st, env({ soc: 100 }), t0);
  run(cfg, st, env({ soc: 80 }), t0 + MIN); // aus
  const again = run(cfg, st, env({ soc: 100 }), t0 + 3 * MIN);
  assert.equal(again.wantOn, false);
  assert.match(again.reason, /Pause/);
  assert.equal(run(cfg, st, env({ soc: 100 }), t0 + 12 * MIN).wantOn, true);
});

test('Schutz-SoC schaltet sofort aus, auch in der Mindestlaufzeit', () => {
  const cfg = { mode: 'soc', socOn: 30, hysteresis: 5, protectSoc: 20, minRunMin: 60, minOffMin: 0 };
  const st = makeConsumerState();
  run(cfg, st, env({ soc: 40 }), t0);
  const r = run(cfg, st, env({ soc: 19 }), t0 + MIN);
  assert.deepEqual(r.commands, [{ type: 'off' }]);
});

test('Prognose-Sperre hält nur neue Starts zurück', () => {
  const cfg = { mode: 'full', minRunMin: 0, minOffMin: 0 };
  const st = makeConsumerState();
  const blocked = run(cfg, st, env({ soc: 100, forecastGateBlocks: true }), t0);
  assert.equal(blocked.wantOn, false);
  assert.match(blocked.reason, /Prognose-Sperre/);
  run(cfg, st, env({ soc: 100 }), t0 + MIN); // startet
  assert.equal(run(cfg, st, env({ soc: 100, forecastGateBlocks: true }), t0 + 2 * MIN).wantOn, true);
});

test('Modus "surplus": Start erst nach der Anlaufzeit mit anhaltendem Export', () => {
  const cfg = { mode: 'surplus', minSurplusW: 300, startSustainS: 60, minOffMin: 0 };
  const st = makeConsumerState();
  const e = env({ soc: 90, gridW: -800, pvW: 4000 });
  assert.equal(run(cfg, st, e, t0).wantOn, false);
  assert.equal(run(cfg, st, e, t0 + 30_000).wantOn, false);
  const go = run(cfg, st, e, t0 + 61_000);
  assert.deepEqual(go.commands, [{ type: 'on' }]);
});

test('Modus "surplus": Batterie-Entladung zählt nicht als Überschuss', () => {
  const cfg = { mode: 'surplus', minSurplusW: 300, startSustainS: 0, minOffMin: 0 };
  const st = makeConsumerState();
  const r = run(cfg, st, env({ soc: 90, gridW: -400, batteryW: -1500, pvW: 4000 }), t0);
  assert.equal(r.wantOn, false);
});

test('Modus "surplus": unter dem Hartstopp-SoC (50 %) läuft nichts', () => {
  const cfg = { mode: 'surplus', startSustainS: 0, minOffMin: 0 };
  const st = makeConsumerState();
  const r = run(cfg, st, env({ soc: 45, gridW: -3000, pvW: 6000 }), t0);
  assert.equal(r.wantOn, false);
  assert.match(r.reason, /Hartstopp/);
});

test('Modus "surplus": Karenz vor dem Stopp nach der Mindestlaufzeit', () => {
  const cfg = { mode: 'surplus', minSurplusW: 300, startSustainS: 0, stopGraceS: 120, minRunMin: 5, minOffMin: 0 };
  const st = makeConsumerState();
  run(cfg, st, env({ soc: 95, gridW: -800, pvW: 4000 }), t0);
  const bad = env({ soc: 95, gridW: 200, pvW: 4000, powerW: 100 });
  assert.equal(run(cfg, st, bad, t0 + 6 * MIN).wantOn, true); // Karenz beginnt
  assert.equal(run(cfg, st, bad, t0 + 7 * MIN).wantOn, true);
  assert.deepEqual(run(cfg, st, bad, t0 + 9 * MIN).commands, [{ type: 'off' }]);
});

test('von Hand eingeschaltet: wird nicht gesteuert', () => {
  const cfg = { mode: 'full', minOffMin: 0 };
  const st = makeConsumerState();
  const r = run(cfg, st, env({ soc: 50, actualOn: true }), t0);
  assert.deepEqual(r.commands, []);
  assert.equal(st.externalOn, true);
});

test('von aussen ausgeschaltet: Zustand wird übernommen, Pause beginnt', () => {
  const cfg = { mode: 'full', minRunMin: 0, minOffMin: 10 };
  const st = makeConsumerState();
  run(cfg, st, env({ soc: 100 }), t0);
  assert.equal(st.isOn, true);
  const r = run(cfg, st, env({ soc: 100, actualOn: false }), t0 + MIN);
  assert.equal(st.isOn, false);
  assert.equal(r.wantOn, false);
});

// ---------------------------------------------------------------- Feuchte-Notlauf
const hum = { enabled: true, sensorId: 's1', capability: 'measure_humidity', onAbove: 65, offBelow: 61, runMin: 60 };
const hcfg = (o = {}) => ({ mode: 'full', minRunMin: 30, minOffMin: 30, humidity: hum, ...o });
const he = (h, o = {}) => env({ soc: 50, humidity: h, ...o });

test('Notlauf: ab 65 % ein, unabhängig von SoC, Pause und Prognose-Sperre', () => {
  const st = makeConsumerState();
  st.stoppedAt = t0 - MIN; // Pause läuft noch
  const r = run(hcfg(), st, he(66, { forecastGateBlocks: true }), t0);
  assert.deepEqual(r.commands, [{ type: 'on' }]);
  assert.match(r.reason, /Feuchte-Notlauf gestartet/);
});

test('Notlauf: unter 65 % passiert nichts, Sensor ohne Wert löst nicht aus', () => {
  const st = makeConsumerState();
  assert.deepEqual(run(hcfg(), st, he(64), t0).commands, []);
  assert.deepEqual(run(hcfg(), st, he(null), t0 + MIN).commands, []);
  assert.deepEqual(run(hcfg({ humidity: { ...hum, enabled: false } }), makeConsumerState(), he(80), t0).commands, []);
});

test('Notlauf: endet, wenn die Feuchte unter 61 % fällt, und das Gerät geht sofort aus', () => {
  const st = makeConsumerState();
  run(hcfg(), st, he(66), t0);
  const mid = run(hcfg(), st, he(63), t0 + 10 * MIN);
  assert.equal(mid.wantOn, true);
  assert.match(mid.reason, /noch 50 min/);
  const end = run(hcfg(), st, he(60), t0 + 20 * MIN);
  assert.deepEqual(end.commands, [{ type: 'off' }]);
  assert.match(end.reason, /Notlauf beendet \(Feuchte 60% < 61%\)/);
});

test('Notlauf: endet nach der Höchstdauer und startet nicht neu, solange die Feuchte oben bleibt', () => {
  const st = makeConsumerState();
  run(hcfg(), st, he(70), t0);
  const timeout = run(hcfg(), st, he(70), t0 + 61 * MIN);
  assert.deepEqual(timeout.commands, [{ type: 'off' }]);
  assert.match(timeout.reason, /Zeit abgelaufen/);
  // weiter 70 %: kein neuer Notlauf
  assert.deepEqual(run(hcfg(), st, he(70), t0 + 62 * MIN).commands, []);
  assert.deepEqual(run(hcfg(), st, he(70), t0 + 200 * MIN).commands, []);
  // zwischendurch unter 65 %, dann wieder darüber -> neuer Notlauf
  run(hcfg(), st, he(60), t0 + 210 * MIN);
  const again = run(hcfg(), st, he(66), t0 + 220 * MIN);
  assert.deepEqual(again.commands, [{ type: 'on' }]);
});

test('Notlauf: eigene Werte (Ein 70 %, Dauer 20 min)', () => {
  const st = makeConsumerState();
  const cfg = hcfg({ humidity: { ...hum, onAbove: 70, offBelow: 66, runMin: 20 } });
  assert.deepEqual(run(cfg, st, he(69), t0).commands, []);
  assert.deepEqual(run(cfg, st, he(71), t0 + MIN).commands, [{ type: 'on' }]);
  assert.deepEqual(run(cfg, st, he(71), t0 + 22 * MIN).commands, [{ type: 'off' }]);
});

test('Notlauf: von Hand eingeschaltetes Gerät wird nicht angefasst', () => {
  const st = makeConsumerState();
  const r = run(hcfg(), st, he(80, { actualOn: true }), t0);
  assert.deepEqual(r.commands, []);
  assert.equal(st.externalOn, true);
});

test('Notlauf: Schutz-SoC gilt nicht für den Notlauf', () => {
  const st = makeConsumerState();
  const r = run(hcfg({ protectSoc: 60 }), st, he(66, { soc: 10 }), t0);
  assert.deepEqual(r.commands, [{ type: 'on' }]);
});

test('Ohne Batterie (hasBattery=false): Überschuss-Modus ohne Hartstopp, Batterie-Modi nicht möglich', () => {
  const surplus = { mode: 'surplus', minSurplusW: 300, startSustainS: 0, minOffMin: 0 };
  const st = makeConsumerState();
  const r = run(surplus, st, env({ soc: null, hasBattery: false, gridW: -800, pvW: 3000 }), t0);
  assert.deepEqual(r.commands, [{ type: 'on' }]);
  // mit Batterie, aber unbekanntem SoC: weiter Hartstopp (Schutz)
  const st2 = makeConsumerState();
  const r2 = run(surplus, st2, env({ soc: null, hasBattery: true, gridW: -800, pvW: 3000 }), t0);
  assert.deepEqual(r2.commands, []);
  for (const mode of ['full', 'soc']) {
    const s = makeConsumerState();
    const x = run({ mode, minOffMin: 0 }, s, env({ soc: null, hasBattery: false }), t0);
    assert.equal(x.wantOn, false);
    assert.match(x.reason, /Keine Hausbatterie/);
  }
});

test('Priorität: holdStart hält einen Start zurück (die Wartezeit läuft weiter), danach startet er sofort; holdStop hält einen Verbraucher an, bis der niedriger priorisierte aus ist', () => {
  const cfg = { mode: 'surplus', minSurplusW: 300, startSustainS: 60, stopGraceS: 60, minRunMin: 0, minOffMin: 0 };
  const e = (o = {}) => env({ gridW: -1500, ...o });
  // Start: Wartezeit abgelaufen, aber ein anderer Verbraucher ist gerade gestartet
  const st = makeConsumerState();
  run(cfg, st, e(), t0);
  const held = run(cfg, st, e({ holdStart: true }), t0 + 90_000);
  assert.deepEqual(held.commands, [], 'kein Start, solange gehalten');
  assert.match(held.reason, /wartet: ein anderer Verbraucher ist gerade gestartet/);
  assert.equal(st.isOn, false);
  assert.ok(st.okSince, 'die Wartezeit läuft weiter');
  const go = run(cfg, st, e(), t0 + 100_000);
  assert.deepEqual(go.commands, [{ type: 'on' }], 'ohne Halten startet er sofort');
  // Stopp: Überschuss fehlt, Karenz abgelaufen
  const lack = (o = {}) => env({ gridW: 500, ...o });
  run(cfg, st, lack(), t0 + 200_000);
  const stay = run(cfg, st, lack({ holdStop: true }), t0 + 270_000);
  assert.equal(stay.wantOn, true, 'bleibt an, solange ein niedriger priorisierter noch läuft');
  assert.deepEqual(stay.commands, []);
  assert.match(stay.reason, /niedriger priorisierter Verbraucher geht zuerst aus/);
  const off = run(cfg, st, lack(), t0 + 280_000);
  assert.deepEqual(off.commands, [{ type: 'off' }], 'ohne Halten geht er aus');
  // Nicht betroffen: Schutz-SoC geht immer vor
  const prot = makeConsumerState();
  run({ ...cfg, protectSoc: 20 }, prot, e(), t0);
  prot.isOn = true; prot.startedAt = t0 - 1_000_000;
  const p = run({ ...cfg, protectSoc: 20 }, prot, e({ soc: 10, holdStop: true }), t0 + 5000);
  assert.deepEqual(p.commands, [{ type: 'off' }], 'Schutz-SoC wird nie gehalten');
});

// ---------------------------------------------------------------- Feuchte-Notlauf: im günstigsten Block starten

const waitCfg = (o = {}) => hcfg({ humidity: { ...hum, waitForCheap: true, criticalAbove: 75, ...o } });
const blockAt = (min) => ({ start: t0 + min * MIN, end: t0 + (min + 60) * MIN, avg: 11.2, label: '14:00-15:00 (Ø 11.2 Rp.)' });

test('Feuchte-Notlauf mit Option: wartet auf den günstigsten Block (Grund nennt ihn), das Gerät bleibt aus', () => {
  const st = makeConsumerState();
  const r = run(waitCfg(), st, he(68, { humidityBlock: blockAt(180) }), t0);
  assert.equal(r.wantOn, false);
  assert.match(r.reason, /Feuchte 68% \(ab 65%\): Notlauf wartet auf den günstigsten Block 14:00-15:00/);
  assert.equal(st.forceUntil || null, null, 'noch kein Notlauf');
  assert.equal(r.commands.length, 0);
});

test('Feuchte-Notlauf mit Option: zu Beginn des Blocks startet er und läuft wie bisher (bis Feuchte unter «aus» oder Zeit um)', () => {
  const st = makeConsumerState();
  run(waitCfg(), st, he(68, { humidityBlock: blockAt(180) }), t0);
  const start = run(waitCfg(), st, he(68, { humidityBlock: { ...blockAt(0), start: t0 + 180 * MIN } }), t0 + 180 * MIN);
  assert.equal(start.wantOn, true);
  assert.match(start.reason, /Feuchte-Notlauf gestartet \(Feuchte 68% >= 65%\)/);
  assert.equal(start.commands[0].type, 'on');
  const ended = run(waitCfg(), st, he(60, { humidityBlock: null }), t0 + 200 * MIN);
  assert.match(ended.reason, /Notlauf beendet \(Feuchte 60% < 61%\)/);
});

test('Feuchte-Notlauf mit Option: ab der kritischen Feuchte sofort, ohne Preise sofort, ohne Option sofort', () => {
  const crit = run(waitCfg(), makeConsumerState(), he(76, { humidityBlock: blockAt(180) }), t0);
  assert.equal(crit.wantOn, true);
  assert.match(crit.reason, /kritisch 75%: sofort/);
  const noPrices = run(waitCfg(), makeConsumerState(), he(68, { humidityBlock: null }), t0);
  assert.equal(noPrices.wantOn, true, 'ohne Preise nicht warten');
  const off = run(hcfg(), makeConsumerState(), he(68, { humidityBlock: blockAt(180) }), t0);
  assert.equal(off.wantOn, true, 'ohne die Option wie bisher sofort');
});

test('Feuchte-Notlauf mit Option: fällt die Feuchte während des Wartens unter die Schwelle, gibt es keinen Notlauf; steigt sie wieder, wird erneut gewartet', () => {
  const st = makeConsumerState();
  assert.equal(run(waitCfg(), st, he(68, { humidityBlock: blockAt(180) }), t0).wantOn, false);
  assert.equal(run(waitCfg(), st, he(60, { humidityBlock: null }), t0 + 30 * MIN).wantOn, false);
  const again = run(waitCfg(), st, he(67, { humidityBlock: blockAt(150) }), t0 + 60 * MIN);
  assert.match(again.reason, /wartet auf den günstigsten Block/);
});
