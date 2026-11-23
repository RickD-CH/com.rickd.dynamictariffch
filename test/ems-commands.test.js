'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { listCommands, commandTokens, commandTitle } = require('../lib/ems/commands');
const { normalizeConfig } = require('../lib/ems/Config');

const ids = (cfg, l) => listCommands(cfg, l).map((c) => c.id);

test('Befehle: Batterie und Wallbox gibt es immer, der Rest nur wenn er per Befehl läuft', () => {
  assert.deepEqual(ids(normalizeConfig({})), ['battery.charge', 'battery.hold', 'battery.normal', 'charger.start', 'charger.set', 'charger.stop']);
  const cfg = normalizeConfig({
    consumers: [
      { id: 'flow:a', name: 'Entfeuchter', enabled: true, controlKind: 'flow' },
      { id: 'dev1', name: 'eBike', enabled: true, controlKind: 'device' },
      { id: 'flow:off', name: 'Aus', enabled: false, controlKind: 'flow' },
    ],
    sgready: { enabled: true, output: 'flows' },
    dhw: { enabled: true, output: 'flows' },
    fuse: { enabled: true, shed: [{ kind: 'device', id: 'sauna', name: 'Sauna', offFlow: { id: 'x' } }, { kind: 'device', id: 'lamp', name: 'Lampe' }, { kind: 'flow', flow: { id: 'f7', name: 'Heizung aus' }, name: 'Heizung' }] },
  });
  const all = ids(cfg);
  assert.ok(all.includes('consumer.flow:a.on') && all.includes('consumer.flow:a.off'));
  assert.ok(!all.some((x) => x.startsWith('consumer.dev1')), 'Gerät mit onoff: kein Befehl nötig');
  assert.ok(!all.some((x) => x.startsWith('consumer.flow:off')), 'ausgeschalteter Verbraucher: kein Befehl');
  assert.deepEqual(all.filter((x) => x.startsWith('sgready.')), ['sgready.normal', 'sgready.boost', 'sgready.forced']);
  assert.deepEqual(all.filter((x) => x.startsWith('dhw.')), ['dhw.program', 'dhw.normal', 'dhw.delay']);
  assert.deepEqual(all.filter((x) => x.startsWith('shed.')), ['shed.sauna', 'shed.f7'], 'nur Geräte mit eigenem Aus-Befehl und Flow-Einträge');
  // SG-Ready mit Relais: keine Befehle
  assert.ok(!ids(normalizeConfig({ sgready: { enabled: true, output: 'relays' } })).some((x) => x.startsWith('sgready.')));
});

test('Befehle: Titel in Deutsch und Englisch, Name nur bei Verbrauchern und Schutz', () => {
  assert.equal(commandTitle('battery.charge', '', 'de'), 'Batterie: aus dem Netz laden');
  assert.equal(commandTitle('battery.charge', '', 'en'), 'Battery: charge from the grid');
  assert.equal(commandTitle('consumer.flow:a.on', 'Entfeuchter', 'de'), 'Entfeuchter: einschalten');
  assert.equal(commandTitle('consumer.flow:a.off', 'Dehumidifier', 'en'), 'Dehumidifier: switch off');
  assert.equal(commandTitle('shed.sauna', 'Sauna', 'de'), 'Schutz: Sauna ausschalten');
  assert.equal(commandTitle('unbekannt.x', '', 'de'), 'unbekannt.x');
  const l = listCommands(normalizeConfig({}), 'en');
  assert.ok(l.every((c) => c.title && c.group), 'jeder Befehl hat Titel und Gruppe');
});

test('Befehle: Tokens - alle Zahlen vorhanden (0, wenn nicht gebraucht), gerundet, mit Titel', () => {
  const t = commandTokens('battery.charge', { power: 5000, target_soc: 88.4 });
  assert.deepEqual(t, {
    id: 'battery.charge', title: 'Batterie: aus dem Netz laden', power: 5000, target_soc: 88.4, discharge: 0, amps: 0, phases: 0,
  });
  const n = commandTokens('charger.stop', {});
  assert.deepEqual([n.power, n.target_soc, n.discharge, n.amps, n.phases], [0, 0, 0, 0, 0]);
  assert.equal(commandTokens('x', { power: 'abc' }).power, 0, 'ungültige Werte werden 0');
});

test('Controller.testCommand: gibt den Befehl einmal live aus (auch im Testmodus), mit vorsichtigen Werten; unbekannte werden abgelehnt', async () => {
  const { EmsController } = require('../lib/ems/EmsController'); // eslint-disable-line global-require
  const sent = [];
  const cfg = normalizeConfig({ silent: true, battery: { control: { enabled: true, normalDischargeW: 6500 } } });
  const fake = {
    getConfig: () => cfg,
    _lang: () => 'de',
    app: { log: () => {} },
    runner: {
      current: { soc: 61.6 },
      actuators: { command: async (id, values, o) => { sent.push([id, values, o.live]); return { values }; } },
    },
  };
  const t = (id) => EmsController.prototype.testCommand.call(fake, id);
  assert.deepEqual((await t('battery.charge')).values, { power: 1000, target_soc: 62 }, 'Ziel = aktueller Stand: lädt nichts');
  await t('battery.normal');
  await t('charger.set');
  await t('battery.hold');
  assert.deepEqual(sent.map((x) => x[0]), ['battery.charge', 'battery.normal', 'charger.set', 'battery.hold']);
  assert.equal(sent[1][1].discharge, 6500);
  assert.deepEqual(sent[2][1], { power: 1380, amps: 6, phases: 1 });
  assert.ok(sent.every((x) => x[2] === true), 'live, obwohl Silent an');
  await assert.rejects(() => t('quatsch'), /Unbekannter Befehl/);
  fake.runner = null;
  await assert.rejects(() => t('battery.hold'), /nicht gestartet/);
});

test('Config: die frühere Warmwasser-Ausgabe «Aktionskarte» läuft jetzt als Auslöser mit Wert', () => {
  assert.equal(normalizeConfig({ dhw: { output: 'card' } }).dhw.output, 'trigger');
  assert.equal(normalizeConfig({ dhw: { output: 'trigger' } }).dhw.output, 'trigger');
  assert.equal(normalizeConfig({ dhw: { output: 'flows' } }).dhw.output, 'flows');
  assert.equal(normalizeConfig({ dhw: { output: 'quatsch' } }).dhw.output, 'flows');
});
