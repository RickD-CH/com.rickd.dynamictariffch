'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateCharger, makeChargerState, bestPhases, surplusShare, shareBudgetW, rampAllowanceW, batteryLow,
} = require('../lib/ems/planner/charger');

const share = { socLow: 50, socHigh: 80, pctLow: 0, pctHigh: 100, minSoc: 0 };
const baseCharger = {
  id: 'c1', connected: true, powerW: 0, rawPowerW: 0, maxAmps: 16, minAmps: 6, phases: 3,
  phaseSwitch: true, stepHoldMs: 30_000, stepDownHoldMs: 30_000, batFullTopUp: true, batFullOnPct: 97, batFullOffPct: 93,
};
const env = (o = {}) => ({
  gridW: -6000, pvW: 8000, houseW: 1500, battery: { soc: 90, powerW: 0 }, hasBattery: true, share,
  chargeNow: false, forecastGateBlocks: false, gridImportLimitKw: 0, ...o,
});
let t0 = 1_800_000_000_000;
const run = (st, ch, e, now, shadow = false) => evaluateCharger({ charger: ch, st, env: e, now, shadow });

test('Rampe: Anteil linear zwischen 50 und 80 % SoC', () => {
  assert.equal(surplusShare(share, 40), 0);
  assert.equal(surplusShare(share, 50), 0);
  assert.equal(surplusShare(share, 65), 0.5);
  assert.equal(surplusShare(share, 90), 1);
  assert.equal(surplusShare({}, 90), null);
  assert.equal(rampAllowanceW(share, 65, 8000), 4000);
  // Batterie entlädt: die Rampe leiht nichts
  assert.equal(shareBudgetW(share, 90, 8000, -2000, -500), 0);
  assert.equal(shareBudgetW(share, 90, 8000, -2000, 1500), 1500);
});

test('Hartstopp unter dem unteren Rampenpunkt, unbekannter SoC hält ihn', () => {
  assert.equal(batteryLow(share, 49, true), true);
  assert.equal(batteryLow(share, 50, true), false);
  assert.equal(batteryLow(share, null, true), true);
  assert.equal(batteryLow(share, null, false), false);
});

test('Phasen: Hochschalten braucht Reserve, Runterschalten nur unter 4140 W', () => {
  assert.equal(bestPhases(4200, 1), 1);
  assert.equal(bestPhases(4830, 1), 3);
  assert.equal(bestPhases(4200, 3), 3);
  assert.equal(bestPhases(4100, 3), 1);
  // Akku voll: beide Kanten eine Dreiphasen-Stufe tiefer
  assert.equal(bestPhases(4150, 1, true), 3);
});

test('kein EV verbunden: idle, ohne Befehl', () => {
  const st = makeChargerState();
  const r = run(st, { ...baseCharger, connected: false }, env(), t0);
  assert.equal(r.mode, 'idle');
  assert.deepEqual(r.commands, []);
});

test('Start nur nach der Haltezeit und mit der höchsten passenden Stufe', () => {
  const st = makeChargerState();
  const e = env({ gridW: -5000, pvW: 6500, houseW: 1500 }); // 5000 W Überschuss -> 3 Phasen, 7 A
  const first = run(st, baseCharger, e, t0);
  assert.deepEqual(first.commands, []);
  assert.equal(st.pendingStepAmps !== null, true);
  const second = run(st, baseCharger, e, t0 + 31_000);
  const set = second.commands.find((c) => c.type === 'set');
  assert.ok(second.commands.some((c) => c.type === 'start'));
  assert.equal(set.phases, 3);
  assert.ok(set.amps >= 7 && set.amps <= 7, `Stufe ${set.amps}`);
  assert.equal(second.mode, 'solar_ev');
});

test('Prognose-Sperre verhindert einen Start, aber nicht den Weiterbetrieb', () => {
  const st = makeChargerState();
  const blocked = env({ forecastGateBlocks: true });
  const r = run(st, baseCharger, blocked, t0);
  assert.equal(r.mode, 'holding');
  assert.match(r.text, /Prognose-Sperre/);
  // läuft schon -> Sperre greift nicht
  const st2 = makeChargerState();
  st2.currentAmps = 10; st2.currentPhases = 3;
  const running = { ...baseCharger, powerW: 6900, rawPowerW: 6900 };
  const r2 = run(st2, running, blocked, t0);
  assert.notEqual(r2.mode, 'holding');
});

test('Batterie unter Hartstopp ohne Überlauf: Lader wird gestoppt', () => {
  const st = makeChargerState();
  st.currentAmps = 10; st.currentPhases = 3;
  const r = run(st, baseCharger, env({ battery: { soc: 40, powerW: -300 }, gridW: 200, pvW: 500 }), t0);
  assert.equal(r.mode, 'battery_priority');
  assert.ok(r.commands.some((c) => c.type === 'stop'));
});

test('Überlauf-Ausnahme: Batterie lädt und es wird exportiert -> Lader darf starten', () => {
  const st = makeChargerState();
  const e = env({ battery: { soc: 40, powerW: 3000 }, gridW: -3000, pvW: 8000, houseW: 2000 });
  const r = run(st, baseCharger, e, t0);
  assert.notEqual(r.text, '');
  assert.equal(r.commands.some((c) => c.type === 'stop'), false);
});

test('anhaltender Netzbezug zwingt nach 60 s eine Stufe runter', () => {
  const st = makeChargerState();
  st.currentAmps = 16; st.currentPhases = 3;
  const ch = { ...baseCharger, phaseSwitch: false, powerW: 11000, rawPowerW: 11000 };
  const e = env({ gridW: 1500, pvW: 9000, houseW: 6000, battery: { soc: 90, powerW: 0 } });
  const a = run(st, ch, e, t0);
  assert.equal(a.commands.length, 0);
  const b = run(st, ch, e, t0 + 61_000);
  const set = b.commands.find((c) => c.type === 'set');
  assert.ok(set && set.amps < 16, 'Stufe nach 60 s Netzbezug runter');
});

test('Akku voll: nächste Stufe über dem Überschuss erlaubt', () => {
  const st = makeChargerState();
  st.currentAmps = 10; st.currentPhases = 3;
  const ch = { ...baseCharger, powerW: 6900, rawPowerW: 6900 };
  // Überschuss ~ 7100 W: normal 10 A (6900) + Reserve; mit Akku voll darf 11 A (7590 < 7100+690)
  const e = env({ gridW: -200, pvW: 9000, houseW: 1800, battery: { soc: 99, powerW: 0 } });
  const a = run(st, ch, e, t0);
  const b = run(st, ch, e, t0 + 31_000);
  const set = [...a.commands, ...b.commands].find((c) => c.type === 'set');
  assert.ok(set && set.amps >= 11, `Akku voll Stufe ${set && set.amps}`);
  assert.match(b.text + a.text, /Akku voll/);
});

test('Sofortladen: volle Leistung, begrenzt durch die Netzbezugsgrenze', () => {
  const st = makeChargerState();
  const e = env({ chargeNow: true, gridImportLimitKw: 24, gridCommittedW: 18000 });
  const r = run(st, baseCharger, e, t0);
  assert.equal(r.mode, 'instant_ev');
  const set = r.commands.find((c) => c.type === 'set');
  assert.ok(set.amps >= 6 && set.amps < 16, `Begrenzt auf ${set.amps} A`);
  const free = run(makeChargerState(), baseCharger, env({ chargeNow: true }), t0);
  assert.equal(free.commands.find((c) => c.type === 'set').amps, 16);
});

test('Schattenmodus: Ist-Zustand wird aus der Messung übernommen, kein Anlauf-Abbruch', () => {
  const st = makeChargerState();
  // Planer würde laden, der echte Lader steht
  const e = env({ gridW: -5000, pvW: 6500, houseW: 1500 });
  for (let i = 0; i < 20; i += 1) run(st, baseCharger, e, t0 + i * 30_000, true);
  assert.equal(st.ignoredStreak, 0);
  assert.equal(st.startBlockedUntil, null);
  // Messung 6900 W bei 3 Phasen -> 10 A übernommen
  const ch = { ...baseCharger, powerW: 6900, rawPowerW: 6900 };
  run(st, ch, e, t0 + 700_000, true);
  assert.equal(st.currentAmps >= 6, true);
});

test('Wallbox-Befehle: Auslöser «Wallbox: Ladeleistung setzen / Laden starten / Laden stoppen» mit Leistung, Strom und Phasen', async () => {
  const { Actuators } = require('../lib/ems/Actuators'); // eslint-disable-line global-require
  const a = new Actuators({}, () => {});
  const calls = [];
  a._fire = async (id, tokens) => {
    calls.push([id, tokens]);
  };
  const r1 = await a.charger('wb', { type: 'set', amps: 10, phases: 3 }, { live: true });
  await a.charger('wb', { type: 'start' }, { live: true });
  const r3 = await a.charger('wb', { type: 'stop' }, { live: true });
  assert.deepEqual(calls.map((c) => c[0]), ['charger.set', 'charger.start', 'charger.stop']);
  assert.deepEqual([calls[0][1].power, calls[0][1].amps, calls[0][1].phases], [6900, 10, 3], 'Leistung = A x Phasen x 230 V');
  assert.equal(calls[0][1].title, 'Wallbox: Ladeleistung setzen');
  assert.equal(r1.watts, 6900);
  assert.equal(r3.watts, 0, 'Stopp = 0 W');
  calls.length = 0;
  const dry = await a.charger('x', { type: 'set', amps: 6, phases: 1 }, { live: false });
  assert.equal(calls.length, 0, 'Trockenlauf gibt nichts aus');
  assert.equal(dry.watts, 1380);
});

test('Config: Anschluss der Wallbox (Capabilities) mit Standardwerten; die früheren Karten-Felder gibt es nicht mehr', () => {
  const { normalizeConfig } = require('../lib/ems/Config'); // eslint-disable-line global-require
  const d = normalizeConfig({}).charger;
  assert.deepEqual(
    [d.stateCapability, d.powerCapability, d.phaseCapability],
    ['evcharger_charging_state', 'measure_power', ''],
  );
  assert.deepEqual([d.startCard, d.powerCard, d.powerArg], [undefined, undefined, undefined]);
  const c = normalizeConfig({ charger: { stateCapability: ' x_state ', phaseCapability: '' } }).charger;
  assert.equal(c.stateCapability, 'x_state');
  assert.equal(c.phaseCapability, '', 'Phasen-Capability darf leer sein');
});
