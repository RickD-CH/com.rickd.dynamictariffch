'use strict';

/**
 * Welche Flows des Benutzers hören auf welchen Befehl der App? (reine Funktionen, keine Homey-Aufrufe)
 *
 * Gesucht wird der Auslöser «Das Energiemanagement gibt einen Befehl» (Karte `ems_command`) mit dem Argument
 * `command.id`, in Standard-Flows (`trigger`) und in erweiterten Flows (Karten vom Typ `trigger`).
 *
 * Zustand je Befehl:
 *  - ok       mindestens ein eingeschalteter, intakter Flow mit mindestens einer Aktion
 *  - empty    Auslöser vorhanden, aber ohne Aktion dahinter
 *  - broken   nur defekte Flows (Homey markiert sie als broken)
 *  - off      nur ausgeschaltete Flows
 *  - missing  kein Flow
 */

const CARD_ID = 'homey:app:com.rickd.dynamictariffch:ems_command';

const isOurTrigger = (card) => !!card && card.id === CARD_ID;

/** Alle (Befehl, Flow)-Treffer aus den rohen Flow-Listen von Homey. */
function collectHits(standard, advanced) {
  const hits = [];
  for (const f of Object.values(standard || {})) {
    if (!f || !isOurTrigger(f.trigger)) continue;
    const cmd = f.trigger.args && f.trigger.args.command && f.trigger.args.command.id;
    if (!cmd) continue;
    hits.push({
      command: String(cmd), id: f.id, name: String(f.name || f.id), advanced: false, enabled: f.enabled !== false, broken: f.broken === true, hasAction: Array.isArray(f.actions) && f.actions.length > 0,
    });
  }
  for (const f of Object.values(advanced || {})) {
    if (!f || !f.cards) continue;
    for (const c of Object.values(f.cards)) {
      if (!c || c.type !== 'trigger' || !isOurTrigger(c)) continue;
      const cmd = c.args && c.args.command && c.args.command.id;
      if (!cmd) continue;
      hits.push({
        command: String(cmd), id: f.id, name: String(f.name || f.id), advanced: true, enabled: f.enabled !== false, broken: f.broken === true, hasAction: Array.isArray(c.outputSuccess) && c.outputSuccess.length > 0,
      });
    }
  }
  return hits;
}

/** Zustand eines Befehls aus seinen Treffern. */
function stateOf(hits) {
  if (!hits || !hits.length) return 'missing';
  const live = hits.filter((h) => h.enabled && !h.broken);
  if (live.some((h) => h.hasAction)) return 'ok';
  if (live.length) return 'empty';
  if (hits.some((h) => h.enabled && h.broken)) return 'broken';
  return 'off';
}

/**
 * Status aller gefragten Befehle.
 * @param {string[]} commandIds
 * @returns {Object<string,{state:string, flows:{id:string,name:string,advanced:boolean}[]}>}
 */
function commandFlowStatus(commandIds, standard, advanced) {
  const hits = collectHits(standard, advanced);
  const out = {};
  for (const id of commandIds) {
    const mine = hits.filter((h) => h.command === id);
    const seen = new Set();
    const flows = [];
    for (const h of mine) {
      if (seen.has(h.id)) continue;
      seen.add(h.id);
      flows.push({ id: h.id, name: h.name, advanced: h.advanced });
    }
    out[id] = { state: stateOf(mine), flows };
  }
  return out;
}

/**
 * Status für einen Auslöser der App ohne Befehls-Argument (zum Beispiel `ems_dhw_setpoint`): wartet ein Flow darauf?
 * @param {string} cardKey Kartenname ohne Präfix, z. B. 'ems_dhw_setpoint'
 */
function triggerFlowStatus(cardKey, standard, advanced) {
  const cardId = `homey:app:com.rickd.dynamictariffch:${cardKey}`;
  const hits = [];
  for (const f of Object.values(standard || {})) {
    if (!f || !f.trigger || f.trigger.id !== cardId) continue;
    hits.push({
      id: f.id, name: String(f.name || f.id), advanced: false, enabled: f.enabled !== false, broken: f.broken === true, hasAction: Array.isArray(f.actions) && f.actions.length > 0,
    });
  }
  for (const f of Object.values(advanced || {})) {
    if (!f || !f.cards) continue;
    for (const c of Object.values(f.cards)) {
      if (!c || c.type !== 'trigger' || c.id !== cardId) continue;
      hits.push({
        id: f.id, name: String(f.name || f.id), advanced: true, enabled: f.enabled !== false, broken: f.broken === true, hasAction: Array.isArray(c.outputSuccess) && c.outputSuccess.length > 0,
      });
    }
  }
  const seen = new Set();
  const flows = hits.filter((h) => !seen.has(h.id) && seen.add(h.id)).map((h) => ({ id: h.id, name: h.name, advanced: h.advanced }));
  return { state: stateOf(hits), flows };
}

module.exports = { collectHits, stateOf, commandFlowStatus, triggerFlowStatus };
