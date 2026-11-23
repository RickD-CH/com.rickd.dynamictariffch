'use strict';

// Die App ist herstellerunabhängig: keine Namen, IDs oder Aufrufe anderer Apps und Geräte im ausgelieferten Code, in den Texten und in der Dokumentation.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const BANNED = [
  /huawei/i, /fusionsolar/i, /\bluna2?0?0?0?\b/i, /luna2000/i, /\bandi\b/i, /\bgo-e\b/i, /goe_/i, /dryfy/i, /stiebel/i, /solcast/i, /forecast\.solar/i,
  /\bshellys?\b/i, /\bemma\b/i, /home connect/i, /powerhour|power by the hour/i, /gruijter/i, /ewhgof|swisspowerdynpreis/i,
  /getApiApp/, /homey:app:(?!com\.rickd\.dynamictariffch)/, /com\.huawei/,
];

function files(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.homeybuild', '.claude', 'test', 'images', 'assets', 'fixtures'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else if (/\.(js|json|html|md|txt)$/.test(e.name) && !['package-lock.json', 'app.json'].includes(e.name)) out.push(p);
  }
  return out;
}

test('Keine Hersteller-, App- oder Gerätenamen und keine fremden App-IDs im Code, in den Texten und in der Dokumentation', () => {
  const hits = [];
  for (const f of files(root)) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    if (rel === 'docs/innostrom-swagger.json') continue; // offizielle Spezifikation der Preis-Schnittstelle
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((l, i) => {
      for (const re of BANNED) if (re.test(l)) hits.push(`${rel}:${i + 1} ${re}`);
    });
  }
  assert.deepEqual(hits, [], `Verbotene Verweise:\n${hits.join('\n')}`);
});

test('Das Manifest verlangt nur die eigene Berechtigung (homey:manager:api), keine Berechtigung für fremde Apps', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, '.homeycompose/app.json'), 'utf8'));
  assert.deepEqual(m.permissions, ['homey:manager:api']);
  const generated = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  assert.deepEqual(generated.permissions, ['homey:manager:api']);
});
