'use strict';

/**
 * Verweise der Konfiguration prüfen (reine Funktionen, keine Homey-Aufrufe).
 *
 * Die Einstellungen speichern Geräte-IDs, Capability-Namen und Flow-IDs. Wird ein Gerät oder Flow in Homey gelöscht
 * (oder eine Capability entfernt), bleibt der Verweis stehen und die App läuft still ohne diese Quelle weiter.
 * Diese Prüfung findet solche «Leichen», damit Widget und Einstellungen sie anzeigen können.
 *
 * collectRefs(cfg)                    -> alle Verweise, die gerade benutzt werden (nur eingeschaltete Bereiche)
 * findIssues(refs, devices, flowIds)  -> Probleme: Gerät/Flow gelöscht, Capability fehlt
 * clearRef(cfg, key)                  -> Konfiguration ohne diesen Verweis (zum «Verweis entfernen»)
 *
 * Ein Gerät, das nur offline ist (available: false), ist KEIN Problem: es gibt es ja noch.
 */

/** Bereiche (area) und ihre Felder (field) tragen nur Schlüssel; die Texte stehen in den Oberflächen. */

const NO_FLOW = Object.freeze({ id: '', advanced: false, name: '' });

/** @returns {Array<object>} ref: { key, area, field, kind:'device'|'flow', id, caps:string[], name, critical, clear } */
function collectRefs(cfg) {
  const refs = [];
  if (!cfg || typeof cfg !== 'object') return refs;

  const dev = (area, field, id, caps, opts = {}) => {
    const v = typeof id === 'string' ? id : '';
    if (!v || v.startsWith('flow:')) return;
    refs.push({
      key: opts.key || `${area}.${field}`,
      area,
      field,
      kind: 'device',
      id: v,
      caps: [...new Set((caps || []).filter((c) => typeof c === 'string' && c))],
      name: opts.name || '',
      critical: opts.critical === true,
      clear: opts.clear || null,
    });
  };
  const flow = (area, field, f, opts = {}) => {
    const id = f && typeof f === 'object' && typeof f.id === 'string' ? f.id : '';
    if (!id) return;
    refs.push({
      key: opts.key || `${area}.${field}`,
      area,
      field,
      kind: 'flow',
      id,
      caps: [],
      name: String(opts.name || f.name || ''),
      critical: false,
      clear: opts.clear || null,
    });
  };
  const set = (...path) => ({ type: 'set', path, value: '' });
  const setFlow = (...path) => ({ type: 'set', path, value: NO_FLOW });

  // Zähler, Haus, Inverter
  const d = cfg.devices || {};
  for (const [field, critical] of [['meter', true], ['house', false], ['inverter', false]]) {
    const x = d[field] || {};
    dev(field === 'meter' ? 'grid' : (field === 'inverter' ? 'pv' : 'house'), 'device', x.id, [x.capability], { key: `devices.${field}`, critical, clear: set('devices', field, 'id') });
  }

  // Batterie
  const b = cfg.battery || {};
  if (b.enabled !== false) dev('battery', 'device', b.deviceId, [b.socCapability], { key: 'battery.deviceId', critical: true, clear: set('battery', 'deviceId') });

  // Wallbox
  const ch = cfg.charger || {};
  if (ch.enabled !== false) {
    dev('charger', 'device', ch.id, [ch.stateCapability, ch.powerCapability, ch.phaseSwitch ? ch.phaseCapability : ''], { key: 'charger.id', critical: true, clear: set('charger', 'id') });
  }

  // E-Auto (Ladestand)
  const car = cfg.car || {};
  dev('car', 'device', car.deviceId, [car.socCapability], { key: 'car.deviceId', clear: set('car', 'deviceId') });

  // PV-Prognose von einem Gerät
  const pv = cfg.pv || {};
  if (pv.source === 'device' && pv.device) dev('forecast', 'device', pv.device.id, [pv.device.today, pv.device.tomorrow], { key: 'pv.device', clear: set('pv', 'device', 'id') });

  // Verbraucher
  (Array.isArray(cfg.consumers) ? cfg.consumers : []).forEach((c) => {
    if (!c || c.enabled === false) return;
    const area = 'consumer';
    const name = String(c.name || '');
    const remove = { type: 'removeConsumer', id: c.id };
    if (c.controlKind === 'flow') {
      // Fehlt der Flow, ist der Verbraucher nicht mehr schaltbar: «entfernen» löscht den Verbraucher
      flow(area, 'flowOn', c.flowOn, { key: `consumer.${c.id}.flowOn`, name, clear: remove });
      flow(area, 'flowOff', c.flowOff, { key: `consumer.${c.id}.flowOff`, name, clear: remove });
    } else {
      const progCaps = c.mode === 'program' && c.program && c.program.enabled
        ? [c.program.stateCapability, c.program.startCapability, c.program.remoteCapability, c.program.doorCapability] : [];
      dev(area, 'device', c.id, progCaps, { key: `consumer.${c.id}`, name, clear: remove });
    }
    if (c.accu && c.accu.enabled) dev(area, 'accu', c.accu.sensorId, [c.accu.capability], { key: `consumer.${c.id}.accu`, name, clear: set('consumers', c.id, 'accu', 'sensorId') });
    if (c.humidity && c.humidity.enabled) dev(area, 'humidity', c.humidity.sensorId, [c.humidity.capability], { key: `consumer.${c.id}.humidity`, name, clear: set('consumers', c.id, 'humidity', 'sensorId') });
  });

  // Hausanschluss-Schutz
  const fu = cfg.fuse || {};
  if (fu.enabled) {
    dev('fuse', 'meter', fu.meterId, fu.caps, { key: 'fuse.meterId', clear: set('fuse', 'meterId') });
    (Array.isArray(fu.shed) ? fu.shed : []).forEach((e) => {
      if (!e) return;
      if (e.kind === 'device') dev('fuse', 'shed', e.id, [], { key: `fuse.shed.${e.id}`, name: e.name || '', clear: { type: 'removeShed', id: e.id } });
      if (e.offFlow && e.offFlow.id) flow('fuse', 'shedFlow', e.offFlow, { key: `fuse.shedflow.${e.offFlow.id}`, clear: { type: 'clearShedFlow', flowId: e.offFlow.id } });
    });
  }

  // SG-Ready
  const sg = cfg.sgready || {};
  if (sg.enabled) {
    dev('sgready', 'sensor', sg.sensorId, [sg.tempCapability], { key: 'sgready.sensorId', clear: set('sgready', 'sensorId') });
    dev('sgready', 'mode', sg.modeId, [sg.modeCapability], { key: 'sgready.modeId', clear: set('sgready', 'modeId') });
    dev('sgready', 'feedback', sg.feedbackId, [sg.feedbackCapability], { key: 'sgready.feedbackId', clear: set('sgready', 'feedbackId') });
    if (sg.output === 'flows') {
      flow('sgready', 'flowNormal', sg.flowNormal, { clear: setFlow('sgready', 'flowNormal') });
      flow('sgready', 'flowBoost', sg.flowBoost, { clear: setFlow('sgready', 'flowBoost') });
      flow('sgready', 'flowForced', sg.flowForced, { clear: setFlow('sgready', 'flowForced') });
    } else {
      const rr = sg.recommendRelay || {};
      dev('sgready', 'relay', rr.deviceId, [rr.capability], { key: 'sgready.recommendRelay', clear: set('sgready', 'recommendRelay', 'deviceId') });
      if (sg.allowForced) {
        const fr = sg.forceRelay || {};
        dev('sgready', 'forceRelay', fr.deviceId, [fr.capability], { key: 'sgready.forceRelay', clear: set('sgready', 'forceRelay', 'deviceId') });
      }
    }
  }

  // Warmwasser-Programm
  const dh = cfg.dhw || {};
  if (dh.enabled) {
    if (dh.targetSource === 'device') dev('dhw', 'target', dh.targetId, [dh.targetCapability], { key: 'dhw.targetId', clear: set('dhw', 'targetId') });
    dev('dhw', 'sensor', dh.sensorId, [dh.tempCapability], { key: 'dhw.sensorId', clear: set('dhw', 'sensorId') });
    dev('dhw', 'mode', dh.modeId, [dh.modeCapability], { key: 'dhw.modeId', clear: set('dhw', 'modeId') });
    dev('dhw', 'heating', dh.heatingId, [dh.heatingCapability], { key: 'dhw.heatingId', clear: set('dhw', 'heatingId') });
    if (dh.output === 'capability' && dh.device) dev('dhw', 'output', dh.device.deviceId, [dh.device.capability], { key: 'dhw.device', clear: set('dhw', 'device', 'deviceId') });
    if (dh.output === 'flows') {
      flow('dhw', 'flowOn', dh.flowOn, { clear: setFlow('dhw', 'flowOn') });
      flow('dhw', 'flowOff', dh.flowOff, { clear: setFlow('dhw', 'flowOff') });
      if (dh.delay && dh.delay.enabled) flow('dhw', 'flowDelay', dh.delay.flowDelay, { clear: setFlow('dhw', 'delay', 'flowDelay') });
    }
  }
  return refs;
}

/**
 * @param {Array<object>} refs   aus collectRefs
 * @param {Map<string,{name:string,caps:string[]}>} devices alle Geräte von Homey (id -> Name, Capabilities)
 * @param {Set<string>} flowIds  alle Flow-IDs von Homey (Standard und erweitert)
 * @returns {Array<{key,area,field,kind,problem:'device'|'flow'|'capability',name:string,id:string,caps?:string[],critical:boolean,fixable:boolean}>}
 */
function findIssues(refs, devices, flowIds) {
  const out = [];
  for (const r of refs) {
    const base = {
      key: r.key, area: r.area, field: r.field, kind: r.kind, id: r.id, critical: r.critical, fixable: !!r.clear, removes: r.clear && r.clear.type === 'removeConsumer' ? 'consumer' : 'ref',
    };
    if (r.kind === 'flow') {
      if (!flowIds.has(r.id)) out.push({ ...base, problem: 'flow', name: r.name });
      continue;
    }
    const d = devices.get(r.id);
    if (!d) {
      out.push({ ...base, problem: 'device', name: r.name });
      continue;
    }
    const have = new Set(d.caps || []);
    const lost = r.caps.filter((c) => !have.has(c));
    if (lost.length) out.push({ ...base, problem: 'capability', name: r.name || d.name || '', caps: lost });
  }
  return out;
}

function refIssues(cfg, devices, flowIds) {
  return findIssues(collectRefs(cfg), devices, flowIds);
}

/**
 * Konfiguration ohne den Verweis mit diesem Schlüssel (tiefe Kopie). null = unbekannter Schlüssel oder nicht entfernbar.
 */
function clearRef(cfg, key) {
  const ref = collectRefs(cfg).find((r) => r.key === key);
  if (!ref || !ref.clear) return null;
  const out = JSON.parse(JSON.stringify(cfg));
  const c = ref.clear;
  if (c.type === 'removeConsumer') {
    out.consumers = (out.consumers || []).filter((x) => x.id !== c.id);
    return out;
  }
  if (c.type === 'removeShed') {
    out.fuse.shed = (out.fuse.shed || []).filter((x) => !(x && x.kind === 'device' && x.id === c.id));
    return out;
  }
  if (c.type === 'clearShedFlow') {
    out.fuse.shed = (out.fuse.shed || []).map((x) => (x && x.offFlow && x.offFlow.id === c.flowId ? { ...x, offFlow: null } : x));
    return out;
  }
  if (c.type === 'set') {
    let node = out;
    const path = c.path.slice();
    // «consumers, <id>, …»: der Verbraucher wird über seine ID gefunden
    if (path[0] === 'consumers') {
      node = (out.consumers || []).find((x) => x.id === path[1]);
      if (!node) return null;
      path.splice(0, 2);
    }
    for (let i = 0; i < path.length - 1; i += 1) {
      if (!node[path[i]] || typeof node[path[i]] !== 'object') return null;
      node = node[path[i]];
    }
    node[path[path.length - 1]] = c.value && typeof c.value === 'object' ? { ...c.value } : c.value;
    return out;
  }
  return null;
}

module.exports = {
  collectRefs, findIssues, refIssues, clearRef,
};
