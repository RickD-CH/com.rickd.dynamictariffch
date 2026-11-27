'use strict';

// Wichtige Meldungen in die Timeline: je Vorfall einmal, nicht beim ersten Lauf nach dem Start, abschaltbar
const test = require('node:test');
const assert = require('node:assert/strict');
const { EmsController } = require('../lib/ems/EmsController');
const de = require('../locales/de.json');

function fakeCtl(notify = true) {
  const sent = [];
  const ctl = Object.create(EmsController.prototype);
  ctl.homey = {
    __: (key, vars) => {
      const s = key.split('.').reduce((o, k) => o && o[k], de) || key;
      return s.replace(/\{\{(\w+)\}\}/g, (m, k) => String(vars[k]));
    },
    notifications: { createNotification: async (n) => { sent.push(n.excerpt); } },
    settings: { get: () => null, set: () => {} },
  };
  ctl.app = { error: () => {}, log: () => {} };
  ctl.getConfig = () => ({ notify });
  return { ctl, sent };
}

test('Timeline: Abschaltung durch den Hausanschluss-Schutz, Wärmepumpe folgt nicht - je Vorfall einmal, erster Lauf nur Stand', async () => {
  const { ctl, sent } = fakeCtl();
  const r = { fuseEvents: [{ ts: 1, action: 'shed', live: true, name: 'Alt', phase: 1, maxA: 41 }], sgReadyCurrent: { live: true, mismatch: false }, dhwCurrent: null };
  ctl._timelineEvents(r);
  assert.equal(sent.length, 0, 'alte Ereignisse nach dem Start nicht melden');
  r.fuseEvents.push({ ts: 2, action: 'shed', live: true, name: 'Sauna', phase: 2, maxA: 39.5 });
  r.fuseEvents.push({ ts: 3, action: 'shed', live: false, name: 'Simuliert', phase: 2, maxA: 39.5 });
  r.sgReadyCurrent = { live: true, mismatch: true, reported: '1 EVU-SPERRE' };
  r.dhwCurrent = { setpointCheck: { state: 'failed', actual: 44, expected: 50 } };
  ctl._timelineEvents(r);
  ctl._timelineEvents(r);
  await new Promise((res) => setImmediate(res));
  assert.equal(sent.length, 3, 'Sauna, SG-Ready und Warmwasser je einmal; die simulierte Abschaltung nicht');
  assert.match(sent[0], /Sauna ausgeschaltet \(Phase 2 bei 39\.5 A\)/);
  assert.match(sent[1], /meldet «1 EVU-SPERRE»/);
  assert.match(sent[2], /44 °C statt 50 °C/);
  r.dhwCurrent = null;
  ctl._timelineEvents(r);
  r.dhwCurrent = { setpointCheck: { state: 'failed', actual: 44, expected: 50 } };
  ctl._timelineEvents(r);
  await new Promise((res) => setImmediate(res));
  assert.equal(sent.length, 4, 'neuer Vorfall nach dem Ende des alten');
});

test('Timeline: ausgeschaltet schreibt nichts', async () => {
  const { ctl, sent } = fakeCtl(false);
  ctl._timeline('error', { message: 'Wallbox nicht lesbar' });
  await new Promise((res) => setImmediate(res));
  assert.equal(sent.length, 0);
  const on = fakeCtl(true);
  on.ctl._timeline('error', { message: 'Wallbox nicht lesbar' });
  await new Promise((res) => setImmediate(res));
  assert.deepEqual(on.sent, ['Energiemanagement: Wallbox nicht lesbar']);
});
