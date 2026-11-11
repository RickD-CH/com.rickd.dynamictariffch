'use strict';

// Batteriesteuerung für andere Batterien: eigene Zuordnung der Karten je Modus (Vorlage 'custom').

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizeCustom, buildCommands } = require('../lib/ems/planner/batteryControl');
const { EmsRunner } = require('../lib/ems/EmsRunner');
const { ShadowLog } = require('../lib/ems/ShadowLog');
const { PriceFeed } = require('../lib/ems/PriceFeed');
const { PvFeed } = require('../lib/ems/PvFeed');
const { Actuators } = require('../lib/ems/Actuators');
const { normalizeConfig } = require('../lib/ems/Config');
const { fromLocal } = require('../lib/time');

const Q = 15 * 60 * 1000;
const day0 = fromLocal(2026, 11, 10, 0, 0).getTime();
const at = (h, m = 0) => day0 + (h * 60 + m) * 60 * 1000;

const CUSTOM = {
  charge: [{ card: 'grid_charge', args: { watts: '{power}', soc: '{target_soc}' } }],
  hold: [{ card: 'set_mode', args: { mode: 'backup' } }],
  normal: [{ card: 'set_mode', args: { mode: 'self' } }, { card: 'discharge_limit', args: { watts: '{normal_discharge}' }, skipWhenCarCharging: true }],
};

test('normalizeCustom: je Modus bis 4 Karten, nur einfache Argumente, «nicht während das Auto lädt» nur bei Normal', () => {
  const n = normalizeCustom({
    charge: [{ card: 'a', args: { x: 1, bad: { y: 1 }, 'bö se': 2 }, skipWhenCarCharging: true }, { card: '' }, null, { card: 'b' }, { card: 'c' }, { card: 'd' }, { card: 'e' }],
    hold: 'kaputt',
    normal: [{ card: 'n', args: { on: true, t: 'x'.repeat(100) }, skipWhenCarCharging: true }],
  });
  assert.deepEqual(n.charge.map((s) => s.card), ['a', 'b', 'c', 'd']);
  assert.deepEqual(n.charge[0].args, { x: 1 });
  assert.equal(n.charge[0].skipWhenCarCharging, false);
  assert.deepEqual(n.hold, []);
  assert.equal(n.normal[0].skipWhenCarCharging, true);
  assert.equal(n.normal[0].args.t.length, 60);
  assert.deepEqual(normalizeCustom(undefined), { charge: [], hold: [], normal: [] });
});

test('buildCommands: eigene Zuordnung mit Platzhaltern; Entlade-Freigabe nicht, solange das Auto lädt', () => {
  const v = { power: 4000, target_soc: 85, normal_discharge: 5000 };
  assert.deepEqual(buildCommands('custom', 'charge', v, { custom: CUSTOM }), [{ card: 'grid_charge', args: { watts: 4000, soc: 85 }, skipped: false }]);
  assert.deepEqual(buildCommands('custom', 'hold', v, { custom: CUSTOM }), [{ card: 'set_mode', args: { mode: 'backup' }, skipped: false }]);
  const n = buildCommands('custom', 'normal', v, { custom: CUSTOM, carCharging: true });
  assert.deepEqual(n.map((c) => [c.card, c.skipped]), [['set_mode', false], ['discharge_limit', true]]);
  assert.deepEqual(buildCommands('custom', 'charge', v, {}), [], 'ohne Zuordnung nichts');
  assert.equal(normalizeConfig({ battery: { control: { custom: CUSTOM } } }).battery.control.custom.normal.length, 2, 'Config behält die Zuordnung');
});

test('Runner: live mit eigener Zuordnung sendet die gewählten Karten an das Batterie-Gerät', async () => {
  const slots = [];
  for (let i = 0; i < 192; i++) {
    const h = (i % 96) / 4;
    slots.push({ start: new Date(day0 + i * Q), end: new Date(day0 + (i + 1) * Q), integrated: h < 5 ? 0.10 : (h >= 17 && h < 21 ? 0.40 : 0.25) });
  }
  const mem = () => {
    const m = new Map(); return { get: (k) => m.get(k), set: (k, v) => m.set(k, JSON.parse(JSON.stringify(v))) };
  };
  const config = normalizeConfig({
    enabled: true,
    silent: false,
    devices: { meter: { id: 'm' } },
    battery: {
      deviceId: 'bat',
      capacityKwh: 10,
      targetSoc: 90,
      chargePowerKw: 5,
      reserveHours: 6,
      control: {
        enabled: true, live: true, preset: 'custom', custom: CUSTOM,
      },
    },
  });
  const sent = [];
  const actuators = new Actuators({}, () => {});
  actuators._runCard = async (id, args) => {
    sent.push([id, args]);
  };
  const runner = new EmsRunner({
    getConfig: () => config,
    prices: new PriceFeed(() => ({ priceStore: { range: (a, b) => slots.filter((s) => s.start >= a && s.start < b), value: (s) => s.integrated } })),
    pv: new PvFeed(null, () => {}, { get: async () => ({ slots: [], stale: true }) }),
    inputs: { battery: async () => ({ soc: 20, capacityKwh: 10 }), compareBatteryPlan: async () => null },
    actuators,
    shadowLog: new ShadowLog(mem()),
    store: mem(),
  });
  runner.chargerCurrent = { chargerPowerW: 0 };
  await runner.tick(at(3));
  await runner.tick(at(3, 5));
  assert.deepEqual(sent, [['homey:device:bat:grid_charge', { watts: 5000, soc: 90 }]]);
});

// ---------------------------------------------------------------- Oberfläche

async function ui(cardsResponse, control) {
  const emsJs = fs.readFileSync(path.join(__dirname, '../settings/ems.js'), 'utf8');
  const els = new Map();
  const handlers = {};
  const el = (id) => {
    if (!els.has(id)) {
      els.set(id, {
        id,
        innerHTML: '',
        textContent: '',
        value: '',
        checked: false,
        hidden: false,
        classList: { contains: () => true, toggle() {} },
        addEventListener: (t, f) => {
          handlers[`${id}:${t}`] = f;
        },
      });
    }
    return els.get(id);
  };
  const ctx = {
    document: { getElementById: el }, window: {}, setInterval: () => 0, console, Object, Promise, Date, Number, isFinite, String, JSON, Math,
  };
  vm.createContext(ctx);
  vm.runInContext(emsJs, ctx);
  const config = normalizeConfig({ enabled: true, devices: { meter: { id: 'em' } }, battery: { deviceId: 'bat', control } });
  const res = {
    'GET /ems/shadow': {
      enabled: true, deviceExists: true, shadow: true, config, pv: {}, current: null, charger: { current: null },
    },
    'GET /ems/consumers': { current: [], events: [] },
    'GET /ems/devices': { devices: [] },
    'GET /ems/flows': { flows: [] },
    'GET /meters': null,
    'GET /ems/battery-cards': cardsResponse,
  };
  await ctx.window.EmsUi.init((m, p) => Promise.resolve(res[`${m} ${p}`]), 'de');
  const click = (attr, value) => handlers['ems-view-devices:click']({ target: { getAttribute: (n) => (n === attr ? value : null), parentNode: null } });
  const change = (attr, target) => handlers['ems-view-devices:change']({ target: { getAttribute: (n) => (n === attr ? '1' : null), parentNode: null, ...target } });
  click('data-ems-open', 'src-bat');
  await new Promise((r) => setTimeout(r, 15));
  return {
    ctx, el, els, click, change, html: () => els.get('ems-view-devices').innerHTML,
  };
}

const OTHER_CARDS = {
  deviceId: 'bat',
  preset: null,
  cards: [
    { id: 'grid_charge', title: 'Netzladen mit [[watts]] W', args: [{ name: 'watts', type: 'number', title: 'Leistung' }] },
    {
      id: 'set_mode',
      title: 'Modus setzen',
      args: [{
        name: 'mode', type: 'dropdown', title: 'Modus', values: [{ id: 'self', title: 'Eigenverbrauch' }, { id: 'backup', title: 'Reserve' }],
      }],
    },
  ],
};

test('Anzeige: andere Batterie ohne Vorlage - eigene Zuordnung, Karte wählen, Argumente eingeben, Speichern übernimmt sie', async () => {
  const u = await ui(OTHER_CARDS, { enabled: true });
  assert.match(u.html(), /keine fertige Vorlage/);
  assert.match(u.html(), /LADEN/);
  assert.match(u.html(), /keine Karte \(es wird nichts gesendet\)/);
  u.el('ems-bc-on').checked = true;
  u.click('data-ems-bcc', 'add:charge');
  assert.match(u.html(), /id="ems-bcc-charge-0-card"/);
  u.el('ems-bcc-charge-0-card').value = 'grid_charge';
  u.change('data-ems-bccard', { value: 'grid_charge' });
  assert.match(u.html(), /id="ems-bcc-charge-0-a-watts"/, 'Argumente der gewählten Karte');
  assert.match(u.html(), /Netzladen mit … W/);
  u.el('ems-bcc-charge-0-a-watts').value = '{power}';
  u.click('data-ems-bcc', 'add:hold');
  u.el('ems-bcc-hold-0-card').value = 'set_mode';
  u.change('data-ems-bccard', { value: 'set_mode' });
  assert.match(u.html(), /<option value="backup">Reserve<\/option>/);
  u.el('ems-bcc-hold-0-a-mode').value = 'backup';
  u.el('ems-bcc-charge-0-a-watts').value = '{power}';
  const body = u.ctx.window.EmsUi._collect().ems.battery;
  assert.equal(body.control.preset, 'custom');
  assert.deepEqual(JSON.parse(JSON.stringify(body.control.custom.charge)), [{ card: 'grid_charge', args: { watts: '{power}' }, skipWhenCarCharging: false }]);
  assert.deepEqual(JSON.parse(JSON.stringify(body.control.custom.hold)), [{ card: 'set_mode', args: { mode: 'backup' }, skipWhenCarCharging: false }]);
  u.click('data-ems-bcc', 'del:hold:0');
  assert.deepEqual(JSON.parse(JSON.stringify(u.ctx.window.EmsUi._collect().ems.battery.control.custom.hold)), []);
});

test('Anzeige: erkannte Vorlage bleibt Standard, eigene Zuordnung ist wählbar; Gerät ohne Karten kann nicht gesteuert werden', async () => {
  const luna = {
    deviceId: 'bat',
    preset: 'luna2000',
    cards: ['luna2000_start_force_charge', 'luna2000_stop_force_charge_discharge', 'luna2000_set_max_discharge_power', 'luna2000_set_working_mode'].map((id) => ({ id, title: id, args: [] })),
  };
  const u = await ui(luna, { enabled: true, preset: 'luna2000' });
  assert.match(u.html(), /Vorlage für dieses Gerät erkannt/);
  assert.match(u.html(), /<option value="luna2000" selected>erkannte Vorlage/);
  u.el('ems-bc-on').checked = true;
  u.change('data-ems-bcpreset', { value: 'custom' });
  assert.match(u.html(), /<option value="custom" selected>eigene Zuordnung/);
  assert.equal(u.ctx.window.EmsUi._collect().ems.battery.control.preset, 'custom');
  const none = await ui({ deviceId: 'bat', preset: null, cards: [] }, { enabled: true });
  assert.match(none.html(), /bietet keine Aktionskarten/);
});
