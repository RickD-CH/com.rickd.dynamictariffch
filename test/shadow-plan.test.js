'use strict';

// Batterie-Potenzial (Kosten) mit Spalte «Fahrplan (Modell)» aus der Franken-Auswertung des Energiemanagements.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { addPlan } = require('../lib/ShadowPlan');

const shadow = {
  params: {},
  days: [
    {
      key: '2026-11-12', noBattery: 900, actual: 677, pvOnly: 840, withGrid: 662, gridChargeValue: 178, efficiency: 92,
    },
    {
      key: '2026-11-13', noBattery: 1000, actual: 800, pvOnly: 850, withGrid: 600, gridChargeValue: 250, efficiency: 50,
    },
  ],
  total: {
    noBattery: 1900, actual: 1477, withGrid: 1262, efficiency: 66,
  },
};

test('addPlan: Fahrplan-Kosten je Tag (CHF -> Rp.), eigene Effizienz, Summe nur über Tage mit Fahrplan', () => {
  const r = addPlan(shadow, { '2026-11-13': { mine: 6.5, other: 8 } });
  assert.equal(r.days[0].plan, null, '12.11. ohne Fahrplan-Wert');
  assert.equal(r.days[0].planEfficiency, null);
  assert.equal(r.days[1].plan, 650);
  assert.equal(r.days[1].planEfficiency, 88, '(1000 - 650) / (1000 - 600)');
  assert.equal(r.total.planDays, 1);
  assert.equal(r.total.plan, 650);
  assert.equal(r.total.planEfficiency, 88);
  assert.equal(r.total.efficiency, 66, 'bestehende Werte bleiben');
  const none = addPlan(shadow, null);
  assert.equal(none.total.planDays, 0);
  assert.equal(none.total.plan, null);
});

test('Anzeige Kosten: Spalte «Fahrplan» nur mit Fahrplan-Werten, mit Effizienz und Hinweis zum Rauschen', () => {
  const html = fs.readFileSync(path.join(__dirname, '../settings/index.html'), 'utf8');
  const start = html.indexOf('    function renderShadow(data) {');
  const end = html.indexOf('\n    }\n', start) + 6;
  const fnSrc = html.slice(start, end);
  const els = {};
  const $ = (id) => { if (!els[id]) els[id] = { innerHTML: '', value: '' }; return els[id]; };
  const T = {
    noDevice: 'x', shadowNone: 'keine', shadowSum: 'Summe', shadowUnused: 'Ungenutzt', shadowValue: 'Wert', shadowEff: 'Effizienz gesamt:', shadowEffNote: 'n', shadowNote: 'n2',
    shadowCols: {
      day: 'Tag', actual: 'Real', plan: 'Fahrplan', pv: 'Nur PV', grid: 'Mit Netz', val: 'Wert Netzl.', eff: 'Effizienz',
    },
    shadowPlanEff: 'Fahrplan erreicht:', shadowPlanNote: 'Rauschen-Hinweis',
  };
  const chf = (rp) => (rp / 100).toFixed(2);
  const escapeHtml = (s) => String(s);
  // eslint-disable-next-line no-new-func
  const render = new Function('$', 'T', 'chf', 'escapeHtml', 'batFilled', `${fnSrc}; return renderShadow;`)($, T, chf, escapeHtml, true);
  render({ paired: true, params: {}, ...addPlan(shadow, { '2026-11-13': { mine: 6.5 } }) });
  const out = els['shadow-root'].innerHTML;
  assert.match(out, /<th>Real<\/th><th>Fahrplan<\/th><th>Nur PV<\/th>/);
  assert.match(out, /<td>13\.11\.<\/td><td>8\.00<\/td><td>6\.50 <span class="legend" style="font-size:10px">88%<\/span><\/td>/);
  assert.match(out, /<td>12\.11\.<\/td><td>6\.77<\/td><td>–<\/td>/);
  assert.match(out, /Fahrplan erreicht: <b>88 %<\/b>/);
  assert.match(out, /Rauschen-Hinweis/);
  render({ paired: true, params: {}, ...addPlan(shadow, null) });
  assert.doesNotMatch(els['shadow-root'].innerHTML, /Fahrplan/, 'ohne Energiemanagement keine Spalte');
});
