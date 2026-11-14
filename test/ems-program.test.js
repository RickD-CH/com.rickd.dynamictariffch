'use strict';

// Verbraucher-Typ «Programm starten»: ein Start-Befehl statt Dauerschalten (Geschirrspüler, Waschmaschine).

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProgram, decideProgram, windowOf } = require('../lib/ems/planner/program');
const { fromLocal } = require('../lib/time');

const TZ = 'Europe/Zurich';
const at = (h, m = 0) => fromLocal(2026, 11, 13, h, m).getTime();
const Q = 15 * 60 * 1000;

function slots(from, to, priceAt) {
  const out = [];
  for (let t = from; t < to; t += Q) out.push({ start: t, end: t + Q, price: priceAt(t) });
  return out;
}

test('normalizeProgram: Grenzen und Standardwerte, ungültige Fensterzeit fällt zurück', () => {
  const p = normalizeProgram({
    maxWaitH: 99, durationH: 0, minSurplusW: -5, windowFrom: 'kaputt',
  });
  assert.equal(p.maxWaitH, 12);
  assert.equal(p.durationH, 0.5);
  assert.equal(p.minSurplusW, 0);
  assert.equal(p.windowFrom, '', 'ungültig: leer (sofort ab dem Einschalten)');
  assert.equal(normalizeProgram({ windowFrom: '18:30' }).windowFrom, '18:30');
  assert.equal(normalizeProgram({}).enabled, false);
});

test('Fernbedienung nicht aktiv: nie starten, auch nicht bei PV-Überschuss oder Fristende', () => {
  const p = normalizeProgram({ remoteCapability: 'measure_remoteControl', remoteOkValue: 'Enabled' });
  const st = {};
  const r = decideProgram({
    cfg: p, st, remoteValue: 'Disabled', doorValue: null, exportW: 5000, slots: [], nowMs: at(19), tz: TZ,
  });
  assert.equal(r.start, false);
  assert.match(r.reason, /Fernbedienung/);
  assert.ok(!st.programStartedAt);
});

test('Tür offen (wenn ein Türsensor gewählt ist): nicht starten', () => {
  const p = normalizeProgram({ doorCapability: 'measure_doorState', doorOkValue: 'Closed' });
  const r = decideProgram({
    cfg: p, st: {}, remoteValue: null, doorValue: 'Open', exportW: 5000, slots: [], nowMs: at(19), tz: TZ,
  });
  assert.equal(r.start, false);
  assert.match(r.reason, /Tür offen/);
});

test('PV-Überschuss: erst nach startSustainS am Stück, auch ausserhalb des Zeitfensters', () => {
  const p = normalizeProgram({ minSurplusW: 2000, startSustainS: 300, windowFrom: '18:00' });
  const st = { programArmed: true };
  let r = decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 2200, slots: [], nowMs: at(11), tz: TZ,
  });
  assert.equal(r.start, false, 'gerade erst genug - noch nicht 5 Minuten');
  r = decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 2200, slots: [], nowMs: at(11) + 301000, tz: TZ,
  });
  assert.equal(r.start, true);
  assert.match(r.reason, /PV-Überschuss/);
});

test('Überschuss fällt zwischenzeitlich weg: Uhr beginnt neu', () => {
  const p = normalizeProgram({ minSurplusW: 2000, startSustainS: 300 });
  const st = { programArmed: true };
  decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 2200, slots: [], nowMs: at(11), tz: TZ,
  });
  decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 100, slots: [], nowMs: at(11) + 120000, tz: TZ,
  });
  const r = decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 2200, slots: [], nowMs: at(11) + 301000, tz: TZ,
  });
  assert.equal(r.start, false, 'okSince wurde zurückgesetzt, erst wieder 5 Minuten nötig');
});

test('Vor dem Zeitfenster: warten, auch ohne PV und ohne Preise', () => {
  const p = normalizeProgram({ windowFrom: '18:00', maxWaitH: 4 });
  const r = decideProgram({
    cfg: p, st: { programArmed: true }, remoteValue: null, doorValue: null, exportW: 0, slots: [], nowMs: at(12), tz: TZ,
  });
  assert.equal(r.start, false);
  assert.match(r.reason, /Zeitfenster ab 18:00/);
});

test('Im Zeitfenster: startet am Anfang des günstigsten Blocks der Programmdauer (nicht in der einzelnen billigsten Viertelstunde)', () => {
  const p = normalizeProgram({ windowFrom: '18:00', maxWaitH: 4, durationH: 1 });
  const all = slots(at(18), at(23), (t) => (t >= at(20, 30) && t < at(21, 30) ? 8 : 25));
  let r = decideProgram({
    cfg: p, st: { programArmed: true }, remoteValue: null, doorValue: null, exportW: 0, slots: all, nowMs: at(18), tz: TZ,
  });
  assert.equal(r.start, false, 'der günstigste Block beginnt erst um 20:30');
  assert.equal(r.plannedStartMs, at(20, 30));
  assert.match(r.reason, /20:30-21:30, Ø 8\.0 Rp\./);
  const st2 = { programArmed: true };
  r = decideProgram({
    cfg: p, st: st2, remoteValue: null, doorValue: null, exportW: 0, slots: all, nowMs: at(20, 30), tz: TZ,
  });
  assert.equal(r.start, true);
  assert.match(r.reason, /günstigster 1-h-Block/);
  assert.equal(st2.programStartedAt, at(20, 30));
});

test('Block statt Einzel-Slot: eine einzelne billige Viertelstunde mitten in teuren Stunden gewinnt nicht gegen einen durchgehend günstigen 3-h-Block', () => {
  const p = normalizeProgram({ windowFrom: '18:00', maxWaitH: 4, durationH: 3 });
  // 19:00 eine Viertelstunde für 1 Rp., sonst 30; ab 21:00 für 3 Stunden durchgehend 10 Rp. (der Block darf über das Fensterende 22:00 hinausreichen)
  const all = slots(at(18), at(18) + 8 * 3600000, (t) => (t === at(19) ? 1 : (t >= at(21) && t < at(21) + 3 * 3600000 ? 10 : 30)));
  const early = decideProgram({
    cfg: p, st: { programArmed: true }, remoteValue: null, doorValue: null, exportW: 0, slots: all, nowMs: at(19), tz: TZ,
  });
  assert.equal(early.start, false, 'um 19:00 nicht starten, obwohl die Viertelstunde dort am billigsten ist');
  assert.equal(early.plannedStartMs, at(21));
  const st = { programArmed: true };
  const on = decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 0, slots: all, nowMs: at(21), tz: TZ,
  });
  assert.equal(on.start, true);
  assert.match(on.reason, /21:00-00:00, Ø 10\.0 Rp\./);
});

test('Block: unvollständige Preise (Block nicht bis zum Ende bekannt) zählen nicht; ohne vollständigen Block wird gewartet, die Frist bleibt das Sicherheitsnetz', () => {
  const p = normalizeProgram({ windowFrom: '18:00', maxWaitH: 4, durationH: 3 });
  const short = slots(at(18), at(20), () => 10); // nur 2 h Preise, ein 3-h-Block passt nirgends
  const r = decideProgram({
    cfg: p, st: { programArmed: true }, remoteValue: null, doorValue: null, exportW: 0, slots: short, nowMs: at(18), tz: TZ,
  });
  assert.equal(r.start, false);
  assert.match(r.reason, /Preise für das Zeitfenster/);
  const net = decideProgram({
    cfg: p, st: { programArmed: true }, remoteValue: null, doorValue: null, exportW: 0, slots: short, nowMs: at(22), tz: TZ,
  });
  assert.equal(net.start, true, 'Frist: Sicherheitsnetz');
});

test('Block: bei gleichem Preis der früheste; der Start liegt im Zeitfenster, auch wenn es danach noch günstiger wird', () => {
  const { cheapestBlock } = require('../lib/ems/planner/program');
  const flat = slots(at(18), at(24), () => 20);
  assert.equal(cheapestBlock(flat, at(18), at(20) - Q, 1).start, at(18), 'Gleichstand: der früheste');
  const cheapLate = slots(at(18), at(24), (t) => (t >= at(21) ? 1 : 20));
  assert.equal(cheapestBlock(cheapLate, at(18), at(20) - Q, 1).start, at(18), 'ab 21:00 günstiger, aber der Start muss vor 20:00 liegen');
});

test('Frist erreicht (Fensterende): startet als Sicherheitsnetz, egal zu welchem Preis', () => {
  const p = normalizeProgram({ windowFrom: '18:00', maxWaitH: 4 });
  const all = slots(at(18), at(23), () => 45); // überall teuer
  const r = decideProgram({
    cfg: p, st: { programArmed: true }, remoteValue: null, doorValue: null, exportW: 0, slots: all, nowMs: at(22), tz: TZ,
  });
  assert.equal(r.start, true);
  assert.match(r.reason, /maximale Wartezeit/);
});

test('Nach dem Start: Abkühlpause für die übliche Dauer (durationH), kein Takten bei neuem PV-Überschuss', () => {
  const p = normalizeProgram({ minSurplusW: 2000, startSustainS: 0, durationH: 2 });
  const st = { programArmed: true };
  const first = decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 3000, slots: [], nowMs: at(11), tz: TZ,
  });
  assert.equal(first.start, true);
  const second = decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 3000, slots: [], nowMs: at(11) + 60000, tz: TZ,
  });
  assert.equal(second.start, false);
  assert.equal(second.blocked, 'cooldown');
  assert.match(second.reason, /kürzlich gestartet.*13:00/);
});

test('Kein Tages-Limit: nach Ablauf der Abkühlpause (durationH) darf das Gerät am selben Tag erneut automatisch starten', () => {
  const p = normalizeProgram({ minSurplusW: 2000, startSustainS: 0, durationH: 2 });
  const st = { programArmed: true };
  decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 3000, slots: [], nowMs: at(11), tz: TZ,
  });
  const stillCooling = decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 3000, slots: [], nowMs: at(11) + 3600000, tz: TZ,
  });
  assert.equal(stillCooling.blocked, 'cooldown', 'nach 1 von 2 Stunden noch in der Abkühlpause');
  const again = decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 3000, slots: [], nowMs: at(11) + 2 * 3600000 + 1000, tz: TZ,
  });
  assert.equal(again.start, false, 'die Automatik gilt für einen Lauf und ist nach dem Start aus');
  st.programArmed = true; st.armedAt = at(13);
  const rearmed = decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 3000, slots: [], nowMs: at(11) + 2 * 3600000 + 2000, tz: TZ,
  });
  assert.equal(rearmed.start, true, 'nach 2 Stunden (durationH) und erneutem Einschalten ist ein weiterer Lauf am selben Tag möglich');
});

test('Automatik gilt über Mitternacht: abends eingeschaltet, startet sie im günstigsten Block um 04:00 (Wartezeit 8 h, vom Einschalten an gerechnet)', () => {
  const p = normalizeProgram({ maxWaitH: 4, durationH: 1, minSurplusW: 2000, startSustainS: 0 });
  const st = { programArmed: true, armedAt: at(22), armWaitH: 8 };
  const day1 = (h, m = 0) => at(22) + ((h * 60 + m) - 22 * 60) * 60000; // h in [22, 30): 30 = 06:00 am nächsten Tag
  const all = slots(at(22), at(22) + 9 * 3600000, (t) => (t >= day1(28) && t < day1(29) ? 5 : 20)); // 04:00-05:00 günstig
  const evening = decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 0, slots: all, nowMs: at(23), tz: TZ,
  });
  assert.equal(evening.start, false);
  assert.equal(evening.plannedStartMs, day1(28));
  assert.equal(evening.deadlineMs, at(22) + 8 * 3600000, 'Start spätestens um 06:00');
  assert.equal(st.programArmed, true);
  const morning = decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 0, slots: all, nowMs: day1(28), tz: TZ,
  });
  assert.equal(morning.start, true, 'nach Mitternacht bleibt die Automatik an und startet im günstigen Block');
  assert.match(morning.reason, /günstigster 1-h-Block/);
  assert.equal(st.programArmed, false, 'der Lauf beendet die Automatik');
});

test('Das Fenster beginnt beim Einschalten (mittags startet es nicht erst um 18:00); «frühestens ab» schiebt den Beginn nach hinten', () => {
  const noon = normalizeProgram({ maxWaitH: 4 });
  assert.deepEqual(windowOf(noon, at(12, 30), TZ, { armedAt: at(12, 30) }), { fromMs: at(12, 30), toMs: at(16, 30) });
  const evening = normalizeProgram({ windowFrom: '18:00', maxWaitH: 4 });
  assert.deepEqual(windowOf(evening, at(12), TZ, { armedAt: at(12) }), { fromMs: at(18), toMs: at(22) }, 'frühestens ab 18:00');
  assert.deepEqual(windowOf(evening, at(20), TZ, { armedAt: at(20) }), { fromMs: at(20), toMs: at(20) + 4 * 3600000 }, 'schon nach 18:00: sofort');
  assert.equal(windowOf(noon, at(12), TZ, { armedAt: at(12), armWaitH: 8 }).toMs, at(20), 'die im Widget gewählte Wartezeit gilt');
});

test('Jeder automatische Start beendet die Automatik (Überschuss, günstiger Block, Frist) und der manuelle ebenfalls; für den nächsten Lauf wieder einschalten', () => {
  const base = (over) => normalizeProgram({ maxWaitH: 4, durationH: 1, minSurplusW: 2000, startSustainS: 0, ...over });
  const run = (p, st, o) => decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 0, slots: [], nowMs: at(12), tz: TZ, ...o,
  });
  const a = { programArmed: true, armedAt: at(12) };
  assert.equal(run(base(), a, { exportW: 3000 }).start, true);
  assert.equal(a.programArmed, false, 'Überschuss-Start');
  const b = { programArmed: true, armedAt: at(12) };
  assert.equal(run(base(), b, { slots: slots(at(12), at(18), (t) => (t === at(12) ? 3 : 20)), nowMs: at(12) }).start, true);
  assert.equal(b.programArmed, false, 'Block-Start');
  const c = { programArmed: true, armedAt: at(12) };
  assert.equal(run(base(), c, { slots: slots(at(12), at(18), () => 30), nowMs: at(16) }).start, true);
  assert.equal(c.programArmed, false, 'Frist');
  const d = { programArmed: true, armedAt: at(12) };
  assert.equal(run(base(), d, { forceNow: true }).start, true);
  assert.equal(d.programArmed, false, 'manueller Start');
  // zweiter Lauf am selben Tag: einschalten, Abkühlpause (1 h) abwarten, wieder Überschuss
  d.programArmed = true; d.armedAt = at(14);
  assert.equal(run(base(), d, { exportW: 3000, nowMs: at(14) }).start, true, 'zweiter Lauf am selben Tag');
});

test('Automatik verfällt, wenn die Wartezeit samt Nachfrist (1 h) ohne Start vorbei ist; vorher bleibt sie auch bei nicht bereiter Maschine an', () => {
  const p = normalizeProgram({
    maxWaitH: 2, stateCapability: 'measure_applianceState', stateIdleValue: 'Idle',
  });
  const st = { programArmed: true, armedAt: at(12) };
  const run = (nowMs) => decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, stateValue: 'Running', exportW: 0, slots: [], nowMs, tz: TZ,
  });
  assert.equal(run(at(14, 30)).blocked, 'state');
  assert.equal(st.programArmed, true, 'noch in der Nachfrist');
  const expired = run(at(15, 1));
  assert.equal(expired.disarmed, true);
  assert.match(expired.reason, /Automatik abgelaufen/);
  assert.equal(st.programArmed, false);
  assert.equal(st.armedAt, null);
});

test('Automatik aus (Standard): PV-Überschuss und Zeitfenster allein starten nichts, nur Fernbedienung reicht nicht', () => {
  const p = normalizeProgram({
    remoteCapability: 'measure_remoteControl', remoteOkValue: 'Enabled', minSurplusW: 100, startSustainS: 0, windowFrom: '00:00', maxWaitH: 1,
  });
  const st = {};
  const r = decideProgram({
    cfg: p, st, remoteValue: 'Enabled', doorValue: null, exportW: 5000, slots: [], nowMs: at(0, 30), tz: TZ,
  });
  assert.equal(r.start, false);
  assert.equal(r.blocked, 'armed');
  assert.match(r.reason, /Automatik ausgeschaltet/);
  assert.ok(!st.programStartedAt, 'wird nicht als "gestartet" gezählt');
});

// ---------------------------------------------------------------- Runner (Geräte lesen und schalten)

const { normalizeConfig } = require('../lib/ems/Config');
const { EmsRunner } = require('../lib/ems/EmsRunner');
const { ShadowLog } = require('../lib/ems/ShadowLog');
const { PriceFeed } = require('../lib/ems/PriceFeed');
const { PvFeed } = require('../lib/ems/PvFeed');
const { makeConsumerState } = require('../lib/ems/planner/consumer');

function makeRunner({
  remote = 'Enabled', door = 'Closed', gridW = -2500, batteryW = 0, state = undefined, stateIdleValue = undefined, armed = true, available = true,
} = {}) {
  const config = normalizeConfig({
    enabled: true,
    silent: false,
    devices: { meter: { id: 'm' } },
    charger: { enabled: false },
    consumers: [{
      id: 'gwa',
      name: 'Geschirrspüler',
      mode: 'program',
      live: true,
      program: {
        enabled: true,
        minSurplusW: 2000,
        startSustainS: 0,
        windowFrom: '18:00',
        maxWaitH: 4,
        remoteCapability: 'measure_remoteControl',
        remoteOkValue: 'Enabled',
        doorCapability: 'measure_doorState',
        doorOkValue: 'Closed',
        stateCapability: stateIdleValue !== undefined ? 'measure_applianceState' : '',
        stateIdleValue: stateIdleValue || '',
      },
    }],
  });
  const started = [];
  const runner = new EmsRunner({
    getConfig: () => config,
    prices: new PriceFeed(() => null),
    pv: new PvFeed(null, () => {}, { get: async () => ({ slots: [], stale: true }) }),
    inputs: {
      chargerInputs: async () => ({
        gridW, houseW: 300, pvW: 3000, batterySoc: null, batteryW, chargerRead: false, chargerConnected: false, chargerPowerW: 0, other: null,
      }),
      consumerStates: async (ids) => new Map(ids.map((id) => [id, {
        actualOn: false, powerW: 0, available, values: {}, raw: { measure_remoteControl: remote, measure_doorState: door, measure_applianceState: state },
      }])),
    },
    actuators: {
      charger: async () => ({}),
      program: async (deviceId, capability, value, { live }) => {
        started.push({
          deviceId, capability, value, live,
        }); return {
          cmd: 'program', capability, value, live,
        };
      },
    },
    shadowLog: new ShadowLog({ get() {}, set() {} }),
    store: null,
  });
  if (armed) runner.consumerStates.set('gwa', Object.assign(makeConsumerState(), { programArmed: true }));
  return { runner, started, config };
}

test('Runner: Fernbedienung aus - liest den echten Zustand, startet nicht, auch mit Überschuss', async () => {
  const { runner, started } = makeRunner({ remote: 'Disabled' });
  await runner.tickCharger(at(19));
  assert.equal(started.length, 0);
  assert.match(runner.consumerCurrent[0].reason, /Fernbedienung nicht aktiv \(Disabled\)/);
});

test('Runner: Fernbedienung an, Tür zu, genug Überschuss - startet live über die Enum-Capability', async () => {
  const { runner, started } = makeRunner({ remote: 'Enabled', door: 'Closed', gridW: -2500 });
  await runner.tickCharger(at(19));
  assert.equal(started.length, 1);
  assert.deepEqual(started[0], {
    deviceId: 'gwa', capability: 'dishwasher_execute_command', value: 'START', live: true,
  });
  assert.equal(runner.consumerCurrent[0].isOn, true);
  // Zweiter Lauf am selben Tag: nicht nochmals
  await runner.tickCharger(at(19) + 60000);
  assert.equal(started.length, 1, 'kein zweiter Start am selben Tag');
});

test('Runner: Gerät "nicht erreichbar" (z. B. Cloud-Gerät gerade offline) blockiert die Automatik nicht', async () => {
  // Ein Geschirrspüler via Hersteller-App/Cloud meldet sich oft als "nicht verfügbar", solange er nicht aktiv
  // sendet - das ist normal, kein Fehler. Die Automatik (Ein-/Ausschalten) und der Status müssen trotzdem
  // funktionieren, sonst "hängt" das Widget scheinbar (Automatik-Schalter springt zurück, siehe Bugreport).
  const { runner, started } = makeRunner({ available: false, armed: false });
  await runner.tickCharger(at(19));
  assert.equal(started.length, 0);
  assert.notEqual(runner.consumerCurrent[0].reason, 'Gerät nicht erreichbar');
  assert.equal(runner.consumerCurrent[0].blocked, 'armed');
  assert.equal(runner.consumerCurrent[0].armed, false);
  runner.setProgramArmed('gwa', true);
  await runner.tickCharger(at(19) + 60000);
  assert.equal(runner.consumerCurrent[0].armed, false, 'Automatik war schaltbar (sonst gäbe es keinen Start), der Lauf hat sie beendet');
  assert.equal(started.length, 1, 'Fernbedienung/Tür kommen aus den letzten bekannten Werten, Start funktioniert trotzdem');
});

test('Runner: Tür offen - nicht starten', async () => {
  const { runner, started } = makeRunner({ door: 'Open' });
  await runner.tickCharger(at(19));
  assert.equal(started.length, 0);
  assert.match(runner.consumerCurrent[0].reason, /Tür offen \(Open\)/);
});

// ---------------------------------------------------------------- Status-Capability (frei wählbar je Gerät)

test('Status-Capability: blockiert nur, solange das Gerät wirklich läuft - keine Sperre für den Rest des Tages', () => {
  const p = normalizeProgram({
    stateCapability: 'measure_applianceState', stateIdleValue: 'Idle', minSurplusW: 100, startSustainS: 0, durationH: 1,
  });
  const st = { programArmed: true };
  const first = decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, stateValue: 'Idle', exportW: 5000, slots: [], nowMs: at(10), tz: TZ,
  });
  assert.equal(first.start, true);
  // Direkt danach meldet das Gerät "läuft" - die Status-Capability blockiert das unabhängig von der Abkühlpause.
  const running = decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, stateValue: 'Running', exportW: 5000, slots: [], nowMs: at(10) + 60000, tz: TZ,
  });
  assert.equal(running.start, false);
  assert.equal(running.blocked, 'state');
  assert.match(running.reason, /nicht bereit.*Running/);
  // Nach Ablauf der üblichen Dauer (1h) und wieder "Idle": ein ganz normaler, neuer Start ist möglich - der
  // Geschirrspüler darf am selben Tag mehrfach laufen, es gibt keine Tages-Sperre mehr.
  const again = decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, stateValue: 'Idle', exportW: 5000, slots: [], nowMs: at(10) + 3600000 + 1000, tz: TZ,
  });
  assert.equal(again.start, false, 'ohne erneutes Einschalten der Automatik kein zweiter Start');
  st.programArmed = true; st.armedAt = at(11);
  const rearmed = decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, stateValue: 'Idle', exportW: 5000, slots: [], nowMs: at(10) + 3600000 + 2000, tz: TZ,
  });
  assert.equal(rearmed.start, true, 'mehrfacher Start am selben Tag ist erlaubt: Abkühlpause um und Automatik wieder eingeschaltet');
});

test('Status-Capability: "bereit" erlaubt den normalen Ablauf, ohne Capability wird der Ist-Zustand nicht geprüft', () => {
  const p = normalizeProgram({
    stateCapability: 'measure_applianceState', stateIdleValue: 'Idle', minSurplusW: 100, startSustainS: 0,
  });
  const ready = decideProgram({
    cfg: p, st: { programArmed: true }, remoteValue: null, doorValue: null, stateValue: 'Idle', exportW: 5000, slots: [], nowMs: at(19), tz: TZ,
  });
  assert.equal(ready.start, true);
  const noCap = normalizeProgram({ minSurplusW: 100, startSustainS: 0 });
  const r = decideProgram({
    cfg: noCap, st: { programArmed: true }, remoteValue: null, doorValue: null, stateValue: 'Running', exportW: 5000, slots: [], nowMs: at(19), tz: TZ,
  });
  assert.equal(r.start, true, 'ohne gewählte Capability spielt der Ist-Zustand keine Rolle');
});

test('Runner: liest die gewählte Status-Capability vom echten Gerät und sperrt, solange es läuft', async () => {
  const { runner, started } = makeRunner({ state: 'Running', stateIdleValue: 'Idle' });
  await runner.tickCharger(at(19));
  assert.equal(started.length, 0);
  assert.match(runner.consumerCurrent[0].reason, /nicht bereit \(Status: Running\)/);
});

test('Runner: Status "bereit" lässt den normalen Start zu', async () => {
  const { runner, started } = makeRunner({ state: 'Idle', stateIdleValue: 'Idle' });
  await runner.tickCharger(at(19));
  assert.equal(started.length, 1);
});

// ---------------------------------------------------------------- Manueller Start (Widget/Flow)

test('forceNow: startet sofort, auch ausserhalb des Zeitfensters und ohne PV, aber nicht ohne Fernbedienung', () => {
  const p = normalizeProgram({ remoteCapability: 'measure_remoteControl', remoteOkValue: 'Enabled' });
  const blocked = decideProgram({
    cfg: p, st: {}, remoteValue: 'Disabled', doorValue: null, exportW: 0, slots: [], nowMs: at(10), tz: TZ, forceNow: true,
  });
  assert.equal(blocked.start, false);
  assert.equal(blocked.blocked, 'remote');
  const st = {};
  const r = decideProgram({
    cfg: p, st, remoteValue: 'Enabled', doorValue: null, exportW: 0, slots: [], nowMs: at(10), tz: TZ, forceNow: true,
  });
  assert.equal(r.start, true);
  assert.match(r.reason, /Manuell gestartet/);
  assert.ok(st.programStartedAt);
});

test('forceNow: ignoriert die Abkühlpause - ein bewusster zweiter Klick zählt', () => {
  const p = normalizeProgram({ minSurplusW: 100, startSustainS: 0 });
  const st = { programArmed: true };
  decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 200, slots: [], nowMs: at(10), tz: TZ,
  });
  assert.ok(st.programStartedAt, 'automatisch schon gestartet');
  const r = decideProgram({
    cfg: p, st, remoteValue: null, doorValue: null, exportW: 0, slots: [], nowMs: at(10) + 60000, tz: TZ, forceNow: true,
  });
  assert.equal(r.start, true, 'manueller Start geht trotzdem durch');
});

test('Runner: setProgramArmed schaltet die Automatik gezielt ein und aus (Widget/Flow)', async () => {
  const { runner, started } = makeRunner({ armed: false });
  await runner.tickCharger(at(19));
  assert.equal(started.length, 0, 'Automatik aus: kein automatischer Start trotz Überschuss');
  assert.equal(runner.consumerCurrent[0].blocked, 'armed');
  assert.equal(runner.consumerCurrent[0].armed, false);
  runner.setProgramArmed('gwa', true);
  await runner.tickCharger(at(19) + 60000);
  assert.equal(started.length, 1, 'nach bewusstem Einschalten startet die Automatik normal');
  assert.equal(runner.consumerCurrent[0].armed, false, 'und ist danach wieder aus (gilt für einen Lauf)');
});

test('Runner: forceProgramStart löst einen manuellen Start aus, unabhängig von der Automatik', async () => {
  const { runner, started } = makeRunner({ armed: false });
  await runner.forceProgramStart('gwa');
  await runner.tickCharger(at(10));
  assert.equal(started.length, 1, 'manueller Start geht auch bei ausgeschalteter Automatik durch');
  assert.equal(runner.consumerCurrent[0].blocked, null);
});

test('deadlineMs/blocked: immer das heutige Fensterende, auch beim Warten oder bei einer Sperre', () => {
  const p = normalizeProgram({
    windowFrom: '18:00', maxWaitH: 4, doorCapability: 'measure_doorState', doorOkValue: 'Closed',
  });
  const { toMs } = windowOf(p, at(10), TZ);
  const waiting = decideProgram({
    cfg: p, st: { programArmed: true }, remoteValue: null, doorValue: 'Closed', exportW: 0, slots: [], nowMs: at(10), tz: TZ,
  });
  assert.equal(waiting.deadlineMs, toMs);
  assert.equal(waiting.blocked, null);
  const doorOpen = decideProgram({
    cfg: p, st: {}, remoteValue: null, doorValue: 'Open', exportW: 0, slots: [], nowMs: at(10), tz: TZ,
  });
  assert.equal(doorOpen.blocked, 'door');
  assert.equal(doorOpen.deadlineMs, toMs);
});

test('Runner: «läuft» (isOn) nur innerhalb der üblichen Programmdauer, danach nicht mehr für immer an', async () => {
  const { runner } = makeRunner({ remote: 'Enabled', door: 'Closed', gridW: -2500 });
  await runner.tickCharger(at(19));
  assert.equal(runner.consumerCurrent[0].isOn, true);
  runner.inputs.chargerInputs = async () => ({
    gridW: 0, houseW: 300, pvW: 0, batterySoc: null, batteryW: 0, chargerRead: false, chargerConnected: false, chargerPowerW: 0, other: null,
  });
  await runner.tickCharger(at(19) + 4 * 3600000);
  assert.equal(runner.consumerCurrent[0].isOn, false, 'nach 4 h (Standarddauer 3 h) ist das Programm vorbei');
});

test('Fernbedienung und Tür: Gross-/Kleinschreibung des Gerätewerts spielt keine Rolle, ein falscher Wert sperrt weiterhin', () => {
  const p = normalizeProgram({
    remoteCapability: 'measure_remoteControl', remoteOkValue: 'Enabled', doorCapability: 'measure_doorState', doorOkValue: 'Closed',
  });
  const run = (remoteValue, doorValue) => decideProgram({
    cfg: p, st: {}, remoteValue, doorValue, exportW: 5000, slots: [], nowMs: at(19), tz: TZ,
  });
  assert.notEqual(run('ENABLED', 'CLOSED').blocked, 'remote');
  assert.notEqual(run(' enabled ', 'closed').blocked, 'door');
  assert.equal(run('Disabled', 'Closed').blocked, 'remote');
  assert.equal(run('Enabled', 'Open').blocked, 'door');
});

test('Runner: setProgramArmed merkt Einschaltzeit und gewählte Wartezeit (1 bis 12 h), ohne Angabe gilt die Standard-Wartezeit; Ausschalten räumt auf', async () => {
  const { runner } = makeRunner({ armed: false, gridW: 0 });
  await runner.tickCharger(at(19));
  runner.setProgramArmed('gwa', true, 8);
  const st = runner.consumerStates.get('gwa');
  assert.equal(st.programArmed, true);
  assert.equal(st.armWaitH, 8);
  assert.ok(Number.isFinite(st.armedAt));
  await runner.tickCharger(Date.now());
  const row = runner.consumerCurrent[0];
  assert.equal(row.armed, true);
  assert.equal(row.armWaitH, 8);
  assert.equal(row.deadlineMs, st.armedAt + 8 * 3600000, 'Start spätestens 8 h nach dem Einschalten');
  runner.setProgramArmed('gwa', true, 99);
  assert.equal(st.armWaitH, 12, 'auf 12 h begrenzt');
  runner.setProgramArmed('gwa', true);
  assert.equal(st.armWaitH, null, 'ohne Angabe: Standard-Wartezeit des Geräts');
  runner.setProgramArmed('gwa', false);
  assert.equal(st.programArmed, false);
  assert.equal(st.armedAt, null);
});
