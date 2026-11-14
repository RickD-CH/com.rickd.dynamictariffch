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
