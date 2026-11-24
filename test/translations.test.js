'use strict';

// Alle vier Sprachen (Deutsch, Englisch, Französisch, Italienisch) sind vollständig: App-Texte, Flow-Karten, Changelog, Widgets und Einstellungsseiten.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizeConfig } = require('../lib/ems/Config');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const LANGS = ['de', 'en', 'fr', 'it'];

const flat = (o, p = '', out = {}) => {
  for (const [k, v] of Object.entries(o || {})) {
    const q = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object') flat(v, q, out); else out[q] = v;
  }
  return out;
};
const placeholders = (s) => (String(s).match(/\{\{?\w+\}?\}|\{\w+\}|\[\[\w+\]\]|\[\w+\]/g) || []).sort().join(',');

/** Tabelle «var NAME = { … }» aus einer Quelldatei lesen (die Datei selbst wird nicht ausgeführt). */
function table(file, name) {
  const src = read(file);
  const m = new RegExp(`(?:var|const|let)\\s+${name}\\s*=\\s*\\{`).exec(src);
  assert.ok(m, `${name} in ${file}`);
  const i = src.indexOf('{', m.index + m[0].length - 1);
  let depth = 0;
  let j = i;
  let inStr = null;
  for (; j < src.length; j += 1) {
    const c = src[j];
    if (inStr) { if (c === '\\') { j += 1; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '\'' || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '{') depth += 1;
    if (c === '}') { depth -= 1; if (depth === 0) break; }
  }
  return vm.runInNewContext(`(${src.slice(i, j + 1)})`, {}, { timeout: 2000 });
}

function sameKeys(label, tables, ref = 'en') {
  const base = flat(tables[ref]);
  for (const lang of LANGS) {
    if (lang === ref || !tables[lang]) continue;
    const t = flat(tables[lang]);
    const missing = Object.keys(base).filter((k) => !(k in t));
    const extra = Object.keys(t).filter((k) => !(k in base));
    assert.deepEqual(missing, [], `${label}: in «${lang}» fehlen Texte`);
    assert.deepEqual(extra, [], `${label}: «${lang}» hat Texte, die es in «${ref}» nicht gibt`);
    for (const k of Object.keys(base)) {
      if (typeof base[k] !== 'string') continue;
      assert.ok(String(t[k]).trim(), `${label} ${lang}.${k}: leer`);
      assert.equal(placeholders(t[k]), placeholders(base[k]), `${label} ${lang}.${k}: Platzhalter stimmen nicht`);
    }
  }
}

test('Texte der App (locales): jede Sprache hat dieselben Schlüssel und Platzhalter', () => {
  const t = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(read(`locales/${l}.json`))]));
  sameKeys('locales', t);
  sameKeys('locales (de)', { en: t.en, de: t.de });
});

test('Flow-Karten, Capabilities, Treiber und Changelog: überall Deutsch, Englisch, Französisch und Italienisch', () => {
  const files = [];
  const skip = new Set(['node_modules', '.git', '.homeybuild', 'test', 'docs', 'locales', '.claude']);
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json') && e.name !== 'package-lock.json' && p !== path.join(root, 'app.json')) files.push(p);
    }
  };
  walk(root);
  const gaps = [];
  const visit = (o, f, p) => {
    if (!o || typeof o !== 'object') return;
    if (typeof o.en === 'string') {
      if (o.en === '' && /(^|\.)units$/.test(p)) return; // leere Einheit (z. B. Rang): es gibt nichts zu übersetzen
      for (const l of ['de', 'fr', 'it']) if (typeof o[l] !== 'string' || !o[l].trim()) gaps.push(`${path.relative(root, f)} ${p} fehlt «${l}»`);
      const ref = placeholders(o.en) + (o.en.match(/!\{\{/g) || []).length;
      for (const l of ['fr', 'it']) if (typeof o[l] === 'string' && placeholders(o[l]) + (o[l].match(/!\{\{/g) || []).length !== ref) gaps.push(`${path.relative(root, f)} ${p} «${l}»: Tags oder Alternativen stimmen nicht`);
      return;
    }
    for (const [k, v] of Object.entries(o)) visit(v, f, p ? `${p}.${k}` : k);
  };
  for (const f of files) {
    try { visit(JSON.parse(fs.readFileSync(f, 'utf8')), f, ''); } catch (e) { /* keine JSON-Datei dieser Art */ }
  }
  assert.deepEqual(gaps.slice(0, 20), [], `${gaps.length} Lücken`);
});

test('Einstellungsseiten: EMS, Zähler und Diagnose haben alle vier Sprachen mit denselben Schlüsseln', () => {
  sameKeys('settings/ems.js', table('settings/ems.js', 'STR'));
  sameKeys('settings/meters.js', table('settings/meters.js', 'STR'));
  sameKeys('settings/diag.js', table('settings/diag.js', 'TEXT'));
  const nav = table('settings/setupnav.js', 'TEXT');
  for (const l of LANGS) assert.deepEqual(Object.keys(nav[l]).sort(), Object.keys(nav.en).sort(), `setupnav ${l}`);
});

test('Hauptseite der Einstellungen: T_FR und T_IT kennen jeden Text von T_EN; die Kurztexte (NEWSTR) auch', () => {
  const t = { de: table('settings/index.html', 'T_DE'), en: table('settings/index.html', 'T_EN'), fr: table('settings/index.html', 'T_FR'), it: table('settings/index.html', 'T_IT') };
  const en = flat(t.en);
  for (const l of ['fr', 'it']) {
    const have = flat(t[l]);
    assert.deepEqual(Object.keys(en).filter((k) => !(k in have)), [], `T_${l.toUpperCase()}: fehlende Texte`);
  }
  const n = table('settings/index.html', 'NEWSTR');
  assert.deepEqual(Object.keys(n).sort(), ['de', 'en', 'fr', 'it']);
  for (const l of LANGS) assert.deepEqual(Object.keys(n[l]).sort(), Object.keys(n.en).sort(), `NEWSTR ${l}`);
});

test('Die Verbraucher-Symbole haben in allen Sprachen einen Namen und die Widgets nutzen nur vorhandene Schlüssel', () => {
  const widgetKeys = new Set();
  for (const f of ['widgets/plan/public/index.html', 'widgets/consumers/public/index.html', 'widgets/fuse/public/index.html', 'widgets/cost/public/index.html', 'widgets/price/public/index.html', 'widgets/prices/public/index.html']) {
    if (!fs.existsSync(path.join(root, f))) continue;
    for (const m of read(f).matchAll(/Homey\.__\('([\w.]+)'\)/g)) widgetKeys.add(m[1]);
  }
  assert.ok(widgetKeys.size > 50);
  for (const l of LANGS) {
    const have = flat(JSON.parse(read(`locales/${l}.json`)));
    const missing = [...widgetKeys].filter((k) => !(k in have) && !Object.keys(have).some((h) => h.startsWith(`${k}.`)));
    assert.deepEqual(missing, [], `Widget-Schlüssel ohne Text in «${l}»`);
  }
});

// ---------------------------------------------------------------- Die Seite wirklich in FR und IT zeichnen

async function openSetup(lang) {
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) {
      els.set(id, {
        id, innerHTML: '', textContent: '', value: '', checked: false, hidden: false, classList: { contains: () => true, toggle() {} }, addEventListener() {},
      });
    }
    return els.get(id);
  };
  const ctx = {
    document: { getElementById: el }, window: {}, setInterval: () => 0, console, Object, Promise, Date, Number, isFinite, String, JSON, Math,
  };
  vm.createContext(ctx);
  vm.runInContext(read('settings/ems.js'), ctx);
  const cfg = normalizeConfig({
    enabled: true, devices: { meter: { id: 'em' } }, battery: { deviceId: 'bat' }, car: { deviceId: 'car' }, consumers: [{ id: 'sock', name: 'eBike', mode: 'surplus' }],
  });
  const res = {
    'GET /ems/shadow': {
      enabled: true, deviceExists: true, shadow: true, config: cfg, pv: {}, current: null, charger: { current: null },
    },
    'GET /ems/consumers': { current: [], events: [] },
    'GET /ems/devices': { devices: [{ id: 'em', name: 'Zähler', caps: ['measure_power'] }, { id: 'bat', name: 'Batterie', caps: ['measure_battery'] }] },
    'GET /ems/flows': { flows: [] },
    'GET /meters': null,
    'GET /ems/plan': null,
    'GET /ems/jobs': { jobs: [] },
    'GET /ems/command-flows': { ok: true, status: {} },
    'GET /ems/ref-check?fresh=1': { ok: true, issues: [{ key: 'car.deviceId', area: 'car', field: 'device', kind: 'device', problem: 'device', name: '', id: 'car', critical: false, fixable: true, removes: 'ref' }] },
  };
  await ctx.window.EmsUi.init((m, p) => Promise.resolve(res[`${m} ${p}`]), lang);
  return { setup: els.get('ems-view-devices').innerHTML, main: els.get('ems-view-main').innerHTML };
}

test('Einstellungen auf Französisch und Italienisch: Texte erscheinen, keine deutschen oder englischen Reste in den Kernsätzen', async () => {
  const fr = await openSetup('fr');
  assert.match(fr.setup, /Appareils ou Flows supprimés/);
  assert.match(fr.setup, /Supprimer la référence/);
  assert.match(fr.setup, /SOURCES DE DONNÉES/);
  assert.ok(!fr.setup.includes('DATA SOURCES') && !fr.setup.includes('DATENQUELLEN'));
  const it = await openSetup('it');
  assert.match(it.setup, /Dispositivi o Flow eliminati/);
  assert.match(it.setup, /Rimuovi il riferimento/);
  assert.match(it.setup, /FONTI DI DATI/);
  assert.ok(!it.setup.includes('DATA SOURCES'));
  // unbekannte Sprache fällt auf Englisch zurück
  const xx = await openSetup('xx');
  assert.match(xx.setup, /DATA SOURCES/);
});
