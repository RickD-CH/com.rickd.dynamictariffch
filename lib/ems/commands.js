'use strict';

/**
 * Befehle des Energiemanagements an Geräte. Reine Funktionen, keine Homey-Aufrufe.
 *
 * Homey erlaubt einer App nicht, Aktionskarten anderer Geräte auszuführen oder Flows zu starten (HTTP 403
 * «Missing Scopes»). Darum gibt die App Befehle über EINEN Auslöser aus («Das Energiemanagement gibt einen Befehl»)
 * und der Nutzer hängt daran einen Flow, der die Karte seines Geräts ausführt (egal welche Marke).
 *
 * Jeder Befehl hat eine feste ID (die der Flow als Argument speichert) und Werte (Tokens): power (W), target_soc (%),
 * discharge (W), amps (A), phases.
 */

const SG_STATES = ['normal', 'boost', 'forced'];

const TITLES = Object.freeze({
  'battery.charge': ['Batterie: aus dem Netz laden', 'Battery: charge from the grid'],
  'battery.hold': ['Batterie: halten (nicht entladen)', 'Battery: hold (do not discharge)'],
  'battery.normal': ['Batterie: Normalbetrieb', 'Battery: normal operation'],
  'charger.start': ['Wallbox: Laden starten', 'EV charger: start charging'],
  'charger.set': ['Wallbox: Ladeleistung setzen', 'EV charger: set charging power'],
  'charger.stop': ['Wallbox: Laden stoppen', 'EV charger: stop charging'],
  'sgready.normal': ['SG-Ready: Normalbetrieb', 'SG Ready: normal operation'],
  'sgready.boost': ['SG-Ready: Empfehlung (Boost)', 'SG Ready: recommendation (boost)'],
  'sgready.forced': ['SG-Ready: Zwangsladung', 'SG Ready: forced charging'],
  'dhw.program': ['Warmwasser: Programm ein', 'Hot water: program on'],
  'dhw.normal': ['Warmwasser: zurück auf Normal', 'Hot water: back to normal'],
  'dhw.delay': ['Warmwasser: verzögern', 'Hot water: delay'],
});

/** Gruppen für die Anzeige der Rezepte in den Einstellungen. */
const GROUPS = Object.freeze({
  battery: ['Batterie', 'Battery'],
  charger: ['Wallbox', 'EV charger'],
  consumer: ['Verbraucher', 'Consumers'],
  sgready: ['SG-Ready', 'SG Ready'],
  dhw: ['Warmwasser', 'Hot water'],
  shed: ['Hausanschluss-Schutz', 'House connection protection'],
});

const lang = (l) => (l === 'de' ? 0 : 1);

/** Titel eines Befehls (Name nur für Verbraucher und Schutz). */
function commandTitle(id, name, l = 'de') {
  const i = lang(l);
  if (TITLES[id]) return TITLES[id][i];
  const m = /^consumer\.(.+)\.(on|off)$/.exec(id);
  if (m) return `${name || m[1]}: ${m[2] === 'on' ? (i === 0 ? 'einschalten' : 'switch on') : (i === 0 ? 'ausschalten' : 'switch off')}`;
  const s = /^shed\.(.+)$/.exec(id);
  if (s) return `${i === 0 ? 'Schutz' : 'Protection'}: ${name || s[1]} ${i === 0 ? 'ausschalten' : 'switch off'}`;
  return id;
}

/** Gruppe eines Befehls (Schlüssel in GROUPS). */
function commandGroup(id) {
  return String(id).split('.')[0];
}

function groupTitle(group, l = 'de') {
  return (GROUPS[group] || [group, group])[lang(l)];
}

/**
 * Alle Befehle, die diese Konfiguration auslösen kann.
 * Batterie und Wallbox immer; Verbraucher mit Flow-Steuerung; SG-Ready und Warmwasser mit Ausgabe über Flows bzw. Auslöser;
 * Hausanschluss-Schutz für Geräte mit eigenem Aus-Flow.
 * @returns {{ id:string, group:string, title:string }[]}
 */
function listCommands(cfg, l = 'de') {
  const c = cfg || {};
  const ids = [];
  ids.push('battery.charge', 'battery.hold', 'battery.normal');
  ids.push('charger.start', 'charger.set', 'charger.stop');
  for (const x of c.consumers || []) {
    if (x && x.enabled && x.controlKind === 'flow') ids.push({ id: `consumer.${x.id}.on`, name: x.name }, { id: `consumer.${x.id}.off`, name: x.name });
  }
  const sg = c.sgready;
  if (sg && sg.enabled && sg.output === 'flows') SG_STATES.forEach((s) => ids.push(`sgready.${s}`));
  const d = c.dhw;
  if (d && d.enabled && d.output === 'flows') ids.push('dhw.program', 'dhw.normal', 'dhw.delay');
  const f = c.fuse;
  if (f && f.enabled) {
    for (const e of f.shed || []) {
      if (!e) continue;
      if (e.kind === 'flow' && e.flow && e.flow.id) ids.push({ id: `shed.${e.flow.id}`, name: e.name || e.flow.name });
      else if (e.offFlow && e.offFlow.id) ids.push({ id: `shed.${e.kind === 'charger' ? 'charger' : e.id}`, name: e.name || (e.kind === 'charger' ? 'Wallbox' : e.id) });
    }
  }
  return ids.map((x) => {
    const id = typeof x === 'string' ? x : x.id;
    const name = typeof x === 'string' ? '' : x.name;
    return { id, group: commandGroup(id), title: commandTitle(id, name, l) };
  });
}

/** Werte (Tokens) eines Befehls auffüllen: alle Zahlen vorhanden (0, wenn nicht gebraucht). */
function commandTokens(id, values = {}, name = '', l = 'de') {
  const n = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : 0);
  return {
    id,
    title: commandTitle(id, name, l),
    power: n(values.power),
    target_soc: n(values.target_soc),
    discharge: n(values.discharge),
    amps: n(values.amps),
    phases: n(values.phases),
  };
}

module.exports = {
  commandTitle, commandGroup, groupTitle, listCommands, commandTokens, SG_STATES, TITLES, GROUPS,
};
