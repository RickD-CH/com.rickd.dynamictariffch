'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeConfig } = require('../lib/ems/Config');
const {
  collectRefs, findIssues, refIssues, clearRef,
} = require('../lib/ems/refCheck');

const dev = (name, caps) => ({ name, caps });
const world = (obj) => new Map(Object.entries(obj));

function baseCfg(extra = {}) {
  return normalizeConfig({
    enabled: true,
    devices: { meter: { id: 'meter', capability: 'measure_power' }, house: { id: 'meter', capability: 'measure_power.load' }, inverter: { id: 'inv', capability: 'measure_power' } },
    battery: { deviceId: 'bat', socCapability: 'measure_battery' },
    charger: { id: 'wb', stateCapability: 'evcharger_charging_state', powerCapability: 'measure_power' },
    ...extra,
  });
}

const GOOD = world({
  meter: dev('Zähler', ['measure_power', 'measure_power.load']),
  inv: dev('Inverter', ['measure_power']),
  bat: dev('Batterie', ['measure_battery']),
  wb: dev('Wallbox', ['evcharger_charging_state', 'measure_power']),
});

test('alles vorhanden: keine Probleme', () => {
  assert.deepEqual(refIssues(baseCfg(), GOOD, new Set()), []);
});

test('nichts gewählt: keine Verweise, keine Probleme', () => {
  const cfg = normalizeConfig({});
  assert.deepEqual(collectRefs(cfg), []);
  assert.deepEqual(refIssues(cfg, new Map(), new Set()), []);
});

test('gelöschtes E-Auto wird gefunden, ist nicht kritisch und lässt sich entfernen', () => {
  const cfg = baseCfg({ car: { deviceId: 'car', socCapability: 'measure_battery', capacityKwh: 52 } });
  const issues = refIssues(cfg, GOOD, new Set());
  assert.equal(issues.length, 1);
  assert.equal(issues[0].area, 'car');
  assert.equal(issues[0].problem, 'device');
  assert.equal(issues[0].critical, false);
  assert.equal(issues[0].fixable, true);
  const fixed = clearRef(cfg, issues[0].key);
  assert.equal(fixed.car.deviceId, '');
  assert.equal(fixed.car.capacityKwh, 52, 'die Batteriegrösse bleibt');
  assert.deepEqual(refIssues(normalizeConfig(fixed), GOOD, new Set()), []);
});

test('fehlender Zähler, Batterie und Wallbox sind kritisch', () => {
  const issues = refIssues(baseCfg(), world({ inv: GOOD.get('inv') }), new Set());
  const crit = issues.filter((i) => i.critical).map((i) => i.area).sort();
  assert.deepEqual(crit, ['battery', 'charger', 'grid']);
  assert.ok(issues.some((i) => i.area === 'house' && !i.critical), 'das Haus-Gerät ist derselbe Zähler und fehlt ebenfalls, aber nicht kritisch');
});

test('Gerät da, aber Capability fehlt', () => {
  const g = new Map(GOOD);
  g.set('bat', dev('Batterie', ['onoff']));
  const issues = refIssues(baseCfg(), g, new Set());
  assert.equal(issues.length, 1);
  assert.equal(issues[0].problem, 'capability');
  assert.deepEqual(issues[0].caps, ['measure_battery']);
  assert.equal(issues[0].name, 'Batterie');
  assert.equal(issues[0].critical, true);
});

test('Wallbox: Phasen-Capability zählt nur mit Phasenumschaltung', () => {
  const noSwitch = baseCfg({ charger: { id: 'wb', phaseSwitch: false, phaseCapability: 'goe_phase' } });
  assert.deepEqual(refIssues(noSwitch, GOOD, new Set()), []);
  const sw = baseCfg({ charger: { id: 'wb', phaseSwitch: true, phaseCapability: 'goe_phase' } });
  const issues = refIssues(sw, GOOD, new Set());
  assert.deepEqual(issues.map((i) => i.caps), [['goe_phase']]);
});

test('Verbraucher: gelöschtes Gerät, Name wird mitgegeben, «entfernen» löscht den Verbraucher', () => {
  const cfg = baseCfg({ consumers: [{ id: 'sock', name: 'eBike', mode: 'surplus' }, { id: 'ok', name: 'Boiler', mode: 'surplus' }] });
  const g = new Map(GOOD);
  g.set('ok', dev('Boiler', ['onoff']));
  const issues = refIssues(cfg, g, new Set());
  assert.equal(issues.length, 1);
  assert.equal(issues[0].area, 'consumer');
  assert.equal(issues[0].name, 'eBike');
  const fixed = clearRef(cfg, issues[0].key);
  assert.deepEqual(fixed.consumers.map((c) => c.id), ['ok']);
});

test('Verbraucher aus: wird nicht geprüft', () => {
  const cfg = baseCfg({ consumers: [{ id: 'gone', name: 'Alt', enabled: false }] });
  assert.deepEqual(refIssues(cfg, GOOD, new Set()), []);
});

test('Flow-Verbraucher: gelöschter Flow wird gefunden; Verbraucher mit «flow:»-ID ist kein Gerät', () => {
  const cfg = baseCfg({
    consumers: [{
      id: 'flow:abc', name: 'Entfeuchter', controlKind: 'flow', flowOn: { id: 'f1', advanced: true, name: 'ein' }, flowOff: { id: 'f2', advanced: true, name: 'aus' },
    }],
  });
  const issues = refIssues(cfg, GOOD, new Set(['f1']));
  assert.deepEqual(issues.map((i) => [i.area, i.field, i.problem, i.name]), [['consumer', 'flowOff', 'flow', 'Entfeuchter']]);
});

test('Akku- und Feuchte-Sensor des Verbrauchers nur, wenn eingeschaltet; Entfernen löscht nur den Sensor', () => {
  const cfg = baseCfg({
    consumers: [{ id: 'bike', name: 'eBike', mode: 'surplus', accu: { enabled: true, sensorId: 'accu', capability: 'measure_battery' } }],
  });
  const g = new Map(GOOD);
  g.set('bike', dev('eBike', ['onoff']));
  const issues = refIssues(cfg, g, new Set());
  assert.deepEqual(issues.map((i) => [i.field, i.problem]), [['accu', 'device']]);
  const fixed = clearRef(cfg, issues[0].key);
  assert.equal(fixed.consumers[0].accu.sensorId, '');
  assert.equal(fixed.consumers[0].id, 'bike');
});

test('Programm-Verbraucher: Status- und Start-Capability werden geprüft, wenn das Programm an ist', () => {
  const prog = { enabled: true, stateCapability: 'measure_applianceState', startCapability: 'dishwasher_execute_command' };
  const cfg = baseCfg({ consumers: [{ id: 'gs', name: 'Geschirrspüler', mode: 'program', program: prog }] });
  const g = new Map(GOOD);
  g.set('gs', dev('Geschirrspüler', ['onoff', 'measure_applianceState']));
  const issues = refIssues(cfg, g, new Set());
  assert.equal(issues.length, 1);
  assert.equal(issues[0].problem, 'capability');
  assert.ok(issues[0].caps.includes('dishwasher_execute_command'));
  // Programm aus: keine Prüfung der Programm-Capabilities
  const off = baseCfg({ consumers: [{ id: 'gs', name: 'Geschirrspüler', mode: 'program', program: { ...prog, enabled: false } }] });
  assert.deepEqual(refIssues(off, g, new Set()), []);
});

test('Hausanschluss-Schutz: Abschaltgerät und Flow', () => {
  const cfg = baseCfg({
    fuse: {
      enabled: true, shed: [{ kind: 'charger' }, { kind: 'device', id: 'sauna', name: 'Sauna' }, { kind: 'device', id: 'ok', name: 'Boiler', offFlow: { id: 'gone', advanced: false, name: 'x' } }],
    },
  });
  const g = new Map(GOOD);
  g.set('ok', dev('Boiler', ['onoff']));
  const issues = refIssues(cfg, g, new Set());
  assert.deepEqual(issues.map((i) => [i.area, i.field, i.problem]).sort(), [['fuse', 'shed', 'device'], ['fuse', 'shedFlow', 'flow']]);
  const f1 = clearRef(cfg, issues.find((i) => i.field === 'shed').key);
  assert.deepEqual(f1.fuse.shed.map((e) => e.kind + (e.id || '')), ['charger', 'deviceok']);
  const f2 = clearRef(cfg, issues.find((i) => i.field === 'shedFlow').key);
  assert.equal(f2.fuse.shed.find((e) => e.id === 'ok').offFlow, null);
});

test('SG-Ready: Fühler, Betriebsart, Rückmeldung, Relais; nur wenn eingeschaltet', () => {
  const sg = {
    enabled: true, output: 'relays', sensorId: 's', tempCapability: 'measure_temperature', modeId: 'm', modeCapability: 'mode.text', feedbackId: 'f', feedbackCapability: 'fb.text', recommendRelay: { deviceId: 'r', capability: 'onoff' },
  };
  const g = new Map(GOOD);
  g.set('s', dev('WP', ['measure_temperature', 'mode.text', 'fb.text']));
  g.set('m', g.get('s'));
  g.set('f', g.get('s'));
  assert.equal(refIssues(baseCfg({ sgready: sg }), g, new Set()).length, 1, 'nur das Relais fehlt');
  assert.equal(refIssues(baseCfg({ sgready: { ...sg, enabled: false } }), g, new Set()).length, 0);
});

test('SG-Ready über Flows: gelöschter Flow ist ein Problem, Relais zählen dann nicht', () => {
  const sg = { enabled: true, output: 'flows', flowNormal: { id: 'fn', advanced: false, name: 'Normal' }, recommendRelay: { deviceId: 'gone', capability: 'onoff' } };
  const issues = refIssues(baseCfg({ sgready: sg }), GOOD, new Set());
  assert.deepEqual(issues.map((i) => [i.area, i.field, i.problem]), [['sgready', 'flowNormal', 'flow']]);
  const fixed = clearRef(baseCfg({ sgready: sg }), issues[0].key);
  assert.equal(fixed.sgready.flowNormal.id, '');
});

test('Warmwasser: Fühler und Statusfeld; bei Ausgabe «trigger» zählen die alten Flows nicht', () => {
  const dhw = {
    enabled: true, output: 'trigger', sensorId: 'wp', tempCapability: 'measure_temperature', heatingId: 'wp', heatingCapability: 'heat.bool', flowOn: { id: 'old', advanced: true, name: 'alt' },
  };
  const g = new Map(GOOD);
  g.set('wp', dev('WP', ['measure_temperature']));
  const issues = refIssues(baseCfg({ dhw }), g, new Set());
  assert.deepEqual(issues.map((i) => [i.area, i.field, i.problem]), [['dhw', 'heating', 'capability']]);
});

test('Warmwasser mit Ausgabe «flows»: Flows werden geprüft', () => {
  const dhw = { enabled: true, output: 'flows', flowOn: { id: 'a', advanced: true, name: 'ein' }, flowOff: { id: 'b', advanced: true, name: 'aus' } };
  const issues = refIssues(baseCfg({ dhw }), GOOD, new Set(['a']));
  assert.deepEqual(issues.map((i) => i.field), ['flowOff']);
});

test('PV-Prognose-Gerät nur bei Quelle «Gerät»', () => {
  const pv = { source: 'device', device: { id: 'fc', today: 'a', tomorrow: 'b' } };
  assert.equal(refIssues(baseCfg({ pv }), GOOD, new Set())[0].area, 'forecast');
  assert.deepEqual(refIssues(baseCfg({ pv: { ...pv, source: 'homey' } }), GOOD, new Set()), []);
});

test('Wallbox ausgeschaltet: wird nicht geprüft', () => {
  const cfg = baseCfg({ charger: { enabled: false, id: 'gone' } });
  assert.deepEqual(refIssues(cfg, GOOD, new Set()), []);
});

test('clearRef: unbekannter Schlüssel und nicht entfernbare Verweise -> null', () => {
  const cfg = baseCfg();
  assert.equal(clearRef(cfg, 'gibt.es.nicht'), null);
  const sg = baseCfg({ sgready: { enabled: true, output: 'flows', flowNormal: { id: 'x', advanced: false, name: '' } } });
  assert.notEqual(clearRef(sg, 'sgready.flowNormal'), null);
});

test('clearRef verändert die übergebene Konfiguration nicht', () => {
  const cfg = baseCfg({ car: { deviceId: 'car' } });
  const copy = JSON.stringify(cfg);
  clearRef(cfg, 'car.deviceId');
  assert.equal(JSON.stringify(cfg), copy);
});

test('findIssues: ein Gerät, das nur offline ist, ist kein Problem (es ist in der Liste)', () => {
  const refs = collectRefs(baseCfg());
  assert.deepEqual(findIssues(refs, GOOD, new Set()), []);
});
