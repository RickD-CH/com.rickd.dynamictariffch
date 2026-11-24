'use strict';

// Prüfbare Regeln der Homey App Store Guidelines (https://apps.developer.homey.app/app-store/guidelines)

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = JSON.parse(read('.homeycompose/app.json'));
const LANGS = ['en', 'de', 'fr', 'it'];
const readmeFile = (l) => (l === 'en' ? 'README.txt' : `README.${l}.txt`);

test('1.1 App-Name: höchstens 4 Wörter, kein Homey/Athom, kein Protokollname', () => {
  for (const l of LANGS) {
    const name = app.name[l];
    assert.ok(name, `Name «${l}»`);
    const words = name.replace(/&/g, ' ').split(/\s+/).filter(Boolean);
    assert.ok(words.length <= 4, `Name «${l}» hat ${words.length} Wörter: ${name}`);
    assert.ok(!/homey|athom|zigbee|z-wave|433|infrared/i.test(name), `Name «${l}»`);
  }
});

test('1.2 Beschreibung: in jeder Sprache vorhanden, kein «Adds support», nicht gleich dem Namen oder Readme-Text', () => {
  for (const l of LANGS) {
    const d = app.description[l];
    assert.ok(d && d.length >= 20 && d.length <= 140, `Beschreibung «${l}»`);
    assert.ok(!/adds support|integrates .* with homey/i.test(d));
    assert.notEqual(d, app.name[l]);
    assert.ok(!read(readmeFile(l)).includes(d), `Beschreibung «${l}» steht wörtlich im Readme`);
  }
});

test('1.3 Readme: pro Sprache vorhanden (wo es eine Beschreibung gibt), 1-2 Absätze, ohne Markdown, URLs, Titel und Änderungsliste', () => {
  for (const l of LANGS) {
    const txt = read(readmeFile(l)).trim();
    const paras = txt.split(/\n\s*\n/);
    assert.ok(paras.length >= 1 && paras.length <= 2, `Readme «${l}»: ${paras.length} Absätze`);
    assert.ok(!/https?:\/\/|www\./i.test(txt), `Readme «${l}»: URL`);
    assert.ok(!/^\s*(#|[-*]\s|\d+\.\s)|\*\*|`|\]\(/m.test(txt), `Readme «${l}»: Markdown`);
    assert.ok(!/changelog|what's new|neu in version/i.test(txt), `Readme «${l}»: Changelog`);
    assert.ok(txt.length < 1200, `Readme «${l}»: zu lang (${txt.length})`);
  }
});

test('Store-Texte: die Readmes nennen das Energiemanagement; die Widgets werden nicht abgezählt', () => {
  for (const l of LANGS) {
    const txt = read(readmeFile(l));
    assert.match(txt, /energy management|Energiemanagement|gestion de l'énergie|gestione dell'energia/i, `Readme «${l}»`);
    assert.ok(!/\b(three|drei|trois|tre|six|sechs|sei)\b.{0,12}widget/i.test(txt), `Readme «${l}»: Widget-Anzahl veraltet`);
  }
  for (const l of LANGS) {
    assert.match(`${app.name[l]} ${app.description[l]} ${(app.tags[l] || []).join(' ')}`, /EMS|energy management|Energiemanagement|gestion de l'énergie|gestione dell'energia/i, `Name/Beschreibung/Tags «${l}»`);
  }
});

test('Tags: in jeder Sprache vorhanden', () => {
  for (const l of LANGS) assert.ok(Array.isArray(app.tags[l]) && app.tags[l].length >= 6, `Tags «${l}»`);
});

test('1.7 Pflichtfelder: brandColor, Bilder, Support, Quelle', () => {
  assert.match(app.brandColor, /^#[0-9a-f]{6}$/i);
  for (const k of ['small', 'large', 'xlarge']) assert.ok(fs.existsSync(path.join(root, app.images[k])), `Bild ${k}`);
  assert.ok(app.support && app.source && app.bugs && app.bugs.url);
});

test('1.9.1 Flow-Titel: keine Klammern, kein «Wenn/Und/Dann» am Anfang', () => {
  const bad = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json')) {
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        for (const [l, s] of Object.entries(j.title || {})) {
          if (/[()]/.test(s) || /^(when|and|then|wenn|und|dann|quand|et|alors|quando|e|allora)\s/i.test(s)) bad.push(`${e.name} ${l}: ${s}`);
        }
      }
    }
  };
  walk(path.join(root, '.homeycompose', 'flow'));
  assert.deepEqual(bad, []);
});

test('1.10 Widget-Vorschauen: je Widget hell und dunkel, 1024x1024, transparenter Hintergrund', () => {
  const dir = path.join(root, 'widgets');
  for (const w of fs.readdirSync(dir)) {
    for (const m of ['light', 'dark']) {
      const b = fs.readFileSync(path.join(dir, w, `preview-${m}.png`));
      assert.equal(b.readUInt32BE(16), 1024, `${w} ${m} Breite`);
      assert.equal(b.readUInt32BE(20), 1024, `${w} ${m} Höhe`);
      assert.equal(b[25], 6, `${w} ${m}: PNG mit Alphakanal`);
    }
  }
});

test('Manifest: keine doppelten Schlüssel in api', () => {
  const src = read('.homeycompose/app.json');
  const start = src.indexOf('"api"');
  const block = src.slice(start, src.indexOf('"support"'));
  const keys = [...block.matchAll(/^ {4}"(\w+)": \{/gm)].map((m) => m[1]);
  assert.ok(keys.length > 20);
  assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i), []);
});
