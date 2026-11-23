'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
test('Config: Überschuss-Rampe (share) wird auf 0 bis 100 begrenzt, Textzahlen werden gelesen, Standard bleibt', () => {
  const { normalizeConfig } = require('../lib/ems/Config'); // eslint-disable-line global-require
  assert.deepEqual(
    (({ socLow, socHigh, pctLow, pctHigh }) => [socLow, socHigh, pctLow, pctHigh])(normalizeConfig({}).share),
    [50, 80, 0, 100],
  );
  const s = normalizeConfig({ share: { socLow: '30', pctLow: 30, socHigh: 700, pctHigh: -5 } }).share;
  assert.deepEqual([s.socLow, s.pctLow, s.socHigh, s.pctHigh], [30, 30, 100, 0]);
});

test('Zähler: Symbol des Kostenzählers wird übernommen, Unbrauchbares wird leer', () => {
  const { normalizeMeters } = require('../lib/MeterReader'); // eslint-disable-line global-require
  const c = normalizeMeters({
    consumers: [
      {
        name: 'A', deviceId: 'd', capability: 'meter_power', icon: 'heatpump',
      },
      {
        name: 'B', deviceId: 'd', capability: 'meter_power', icon: '<script>',
      },
      { name: 'C', deviceId: 'd', capability: 'meter_power' },
    ],
  }).consumers;
  assert.deepEqual(c.map((x) => x.icon), ['heatpump', '', '']);
});

test('Symbole: jedes Verbraucher-Symbol hat eine Zeichnung in den Einstellungen und im Widget sowie einen deutschen und englischen Namen', () => {
  const fs = require('fs'); // eslint-disable-line global-require
  const path = require('path'); // eslint-disable-line global-require
  const cfg = fs.readFileSync(path.join(__dirname, '../lib/ems/Config.js'), 'utf8');
  const list = /const CONSUMER_ICONS = \[([^\]]*)\]/.exec(cfg)[1].split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean);
  const settings = fs.readFileSync(path.join(__dirname, '../settings/ems.js'), 'utf8');
  const widget = fs.readFileSync(path.join(__dirname, '../widgets/consumers/public/index.html'), 'utf8');
  const uiList = /var CONSUMER_ICONS = \[([^\]]*)\]/.exec(settings)[1].split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean);
  assert.deepEqual(uiList, list, 'Liste in den Einstellungen = Liste in der Konfiguration');
  assert.ok(list.length >= 19);
  for (const k of list) {
    assert.match(settings, new RegExp(`[\\s{,]${k}: 'M`), `Zeichnung ${k} in den Einstellungen`);
    assert.match(widget, new RegExp(`[\\s{,]${k}: 'M`), `Zeichnung ${k} im Widget`);
    assert.equal((settings.match(new RegExp(`iconNames: \\{[^}]*\\b${k}: '`, 'g')) || []).length, 2, `Name ${k} auf Deutsch und Englisch`);
  }
});

test('Feuchte-Notlauf: Option «im günstigsten Block» (Standard aus) und kritische Feuchte (nicht unter «ein», höchstens 100)', () => {
  const { normalizeConfig } = require('../lib/ems/Config');
  const mk = (h) => normalizeConfig({ consumers: [{ id: 'x', name: 'E', deviceId: 'x', mode: 'surplus', enabled: true, humidity: { enabled: true, sensorId: 's', ...h } }] }).consumers[0].humidity;
  const d = mk({});
  assert.equal(d.waitForCheap, false);
  assert.equal(d.criticalAbove, 75);
  const w = mk({ waitForCheap: true, onAbove: 70, criticalAbove: 50 });
  assert.equal(w.waitForCheap, true);
  assert.equal(w.criticalAbove, 70, 'nie unter «ein»');
  assert.equal(mk({ criticalAbove: 400 }).criticalAbove, 100);
  assert.equal(mk({ waitForCheap: 'ja' }).waitForCheap, false, 'nur echtes true zählt');
});
