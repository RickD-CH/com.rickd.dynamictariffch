'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildPlan } = require('../lib/ems/PlanView');
const { planWidget, fuseWidget, stepFusePeak } = require('../lib/WidgetData');
const { startOfLocalDay, addLocalDays } = require('../lib/time');

const TZ = 'Europe/Zurich';
const Q = 15 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 10, 20, 7); // 21:07 Zürich
const day0 = startOfLocalDay(new Date(NOW), TZ).getTime();
const day2 = addLocalDays(new Date(NOW), 2, TZ).getTime();

function prices(from, to) {
  const out = [];
  for (let t = from; t < to; t += Q) {
    const h = ((t - from) / 3600000) % 24;
    out.push({ start: t, end: t + Q, price: h >= 2 && h < 5 ? 8 : 25 });
  }
  return out;
}

function makePlan() {
  const slots = prices(day0, day2);
  const nowQ = NOW - (NOW % Q);
  const charge = slots.filter((s) => s.start > nowQ && ((s.start - day0) / 3600000) % 24 >= 2 && ((s.start - day0) / 3600000) % 24 < 4);
  return buildPlan({
    nowMs: NOW,
    tz: TZ,
    priceSlots: slots,
    batteryPlan: {
      mode: 'hold', reason: 'Ladung aufsparen', chargeSlots: charge, reserveSlots: [],
    },
    reserveHours: 2,
    hasBattery: true,
    chargerEnabled: true,
    jobs: [{ id: 'car', starts: charge.slice(0, 4).map((s) => s.start) }],
  });
}

const cfg = {
  enabled: true, silent: true, battery: { deviceId: 'bat' }, charger: { enabled: true, id: 'wb', maxAmps: 16 }, fuse: { enabled: true },
};

test('Widget «Energieplan»: 24 h ab jetzt über Mitternacht, Batteriemodus und Ladefenster, Testmodus', () => {
  const d = planWidget({
    plan: makePlan(),
    shadow: {
      deviceExists: true, config: cfg, current: { soc: 63.6, price: 25, mine: { mode: 'hold', reason: 'Ladung aufsparen' } }, charger: { current: { mine: { mode: 'idle', reason: 'nicht angesteckt' } } },
    },
    tz: TZ,
    nowMs: NOW,
  });
  assert.equal(d.ems, true);
  assert.equal(d.silent, true);
  assert.equal(d.slots.length, 96);
  assert.equal(d.slots[0].time, '21:00');
  assert.equal(d.slots[0].tomorrow, false);
  assert.equal(d.slots[12].time, '00:00');
  assert.equal(d.slots[12].tomorrow, true);
  assert.equal(d.slots[0].bat, 'hold');
  assert.equal(d.slots.find((s) => s.time === '02:00').bat, 'charge');
  assert.deepEqual(d.battery, { mode: 'hold', reason: 'Ladung aufsparen', soc: 64 });
  assert.deepEqual(d.charger.window, { from: '02:00', to: '03:00', now: false });
  assert.equal(d.min, 8);
  assert.equal(d.max, 25);
  assert.ok(d.ticks.some((t) => t.label === '0'));
});

test('Widget «Energieplan»: ohne EMS-Gerät nur ein Hinweis, ohne Batterie und Wallbox keine Zeilen', () => {
  assert.deepEqual(planWidget({ plan: null, shadow: { deviceExists: false }, tz: TZ }), { ems: false });
  const d = planWidget({
    plan: makePlan(), shadow: { deviceExists: true, config: { enabled: true, battery: {}, charger: {} } }, tz: TZ, nowMs: NOW,
  });
  assert.equal(d.battery, null);
  assert.equal(d.charger, null);
  assert.equal(d.hasBattery, false);
});

test('Widget «Hausanschluss»: höchste Phase, kW je Phase, Drosselung, Abgeschaltetes, Tagesspitze', () => {
  const cur = {
    at: NOW, live: false, limitA: 35, phasesA: [12.34, -3, null], maxA: 12.34, phase: 1, over: false, capAmps: 10, shed: ['Sauna'], error: null,
  };
  let peak = stepFusePeak(null, cur, TZ);
  assert.equal(peak.a, 12.3);
  assert.equal(stepFusePeak(peak, { ...cur, maxA: 12.6 }, TZ), peak, 'unter 0.5 A mehr: keine neue Spitze');
  peak = stepFusePeak(peak, {
    ...cur, maxA: 20, phase: 2, at: NOW + 60000,
  }, TZ);
  assert.equal(peak.a, 20);
  const next = stepFusePeak(peak, { ...cur, maxA: 5, at: NOW + 24 * 3600 * 1000 }, TZ);
  assert.equal(next.a, 5, 'neuer Tag beginnt von vorn');

  const d = fuseWidget({
    shadow: { deviceExists: true, config: cfg, fuse: cur }, peak, tz: TZ, nowMs: NOW + 120000,
  });
  assert.equal(d.maxA, 12.3);
  assert.equal(d.limitA, 35);
  assert.deepEqual(d.phases[0], { a: 12.3, kw: 2.8 });
  assert.deepEqual(d.phases[1], { a: 3, kw: 0.7 });
  assert.equal(d.phases[2], null);
  assert.equal(d.totalKw, 3.5);
  assert.equal(d.capAmps, 10);
  assert.deepEqual(d.shed, ['Sauna']);
  assert.equal(d.live, false);
  assert.deepEqual(d.peak, { a: 20, phase: 2, time: '21:08' });
  assert.equal(d.ageS, 120);
});

test('Widget «Hausanschluss»: Schutz aus, noch keine Messung, Drosselung nur unter dem Maximum', () => {
  assert.deepEqual(fuseWidget({ shadow: { deviceExists: true, config: { ...cfg, fuse: { enabled: false } } }, tz: TZ }), { ems: true, enabled: false, silent: true });
  const wait = fuseWidget({ shadow: { deviceExists: true, config: cfg, fuse: null }, tz: TZ, nowMs: NOW });
  assert.equal(wait.maxA, null);
  assert.equal(wait.error, 'wait');
  const full = fuseWidget({
    shadow: {
      deviceExists: true,
      config: cfg,
      fuse: {
        at: NOW, limitA: 35, phasesA: [5, 5, 5], maxA: 5, capAmps: 16,
      },
    },
    tz: TZ,
    nowMs: NOW,
  });
  assert.equal(full.capAmps, null);
});

test('Widgets: neutrale Namen, Texte in Deutsch und Englisch, jedes Widget hat Vorschaubilder', () => {
  const root = path.join(__dirname, '..');
  for (const w of fs.readdirSync(path.join(root, 'widgets'))) {
    const j = JSON.parse(fs.readFileSync(path.join(root, 'widgets', w, 'widget.compose.json'), 'utf8'));
    for (const lang of ['en', 'de', 'fr', 'it']) assert.ok(j.name[lang] && !/innostrom/i.test(j.name[lang]), `${w} ${lang}`);
    for (const img of ['preview-light.png', 'preview-dark.png']) assert.ok(fs.existsSync(path.join(root, 'widgets', w, img)), `${w}/${img}`);
  }
  for (const lang of ['de', 'en']) {
    const loc = JSON.parse(fs.readFileSync(path.join(root, 'locales', `${lang}.json`), 'utf8'));
    for (const [sec, w] of [['planWidget', 'plan'], ['fuseWidget', 'fuse']]) {
      const html = fs.readFileSync(path.join(root, 'widgets', w, 'public', 'index.html'), 'utf8');
      const keys = [...html.matchAll(new RegExp(`__\\('${sec}\\.([a-zA-Z.]+)'\\)`, 'g'))].map((m) => m[1]);
      assert.ok(keys.length > 5);
      for (const k of keys) assert.ok(k.split('.').reduce((o, p) => (o ? o[p] : undefined), loc[sec]) !== undefined, `${lang} ${sec}.${k}`);
    }
  }
});
