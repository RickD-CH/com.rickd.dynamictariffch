'use strict';

// Vorschaubilder (1024 x 1024, transparent) für die Widgets «Energieplan» und «Hausanschluss» im Stil der
// bestehenden Vorschauen: schematische Karte mit Platzhalter-Balken. Rendert mit Microsoft Edge (headless).
// Aufruf: node scripts/make-widget-previews.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
if (!EDGE) throw new Error('Microsoft Edge nicht gefunden');

const THEMES = {
  light: {
    card: '#ffffff', ink: '#2b2c30', soft: '#b7bbc2', panel: '#eff0f3', shadow: 'rgba(0,0,0,.16)',
  },
  dark: {
    card: '#26272b', ink: '#eceef1', soft: '#6c7079', panel: '#36373c', shadow: 'rgba(0,0,0,.45)',
  },
};
const GREEN = '#2e9d50';
const ORANGE = '#e3a32f';
const RED = '#d9443a';
const PURPLE = '#6a5fd6';
const GRAY = '#a3a8b0';

const pill = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}"/>`;

function priceColor(r) {
  const a = [46, 157, 80]; const b = [217, 68, 58];
  return `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * r)).join(',')})`;
}

function planSvg(t) {
  const prices = [0.9, 0.85, 0.75, 0.68, 0.6, 0.55, 0.45, 0.35, 0.25, 0.2, 0.18, 0.2, 0.15, 0.25, 0.35, 0.42, 0.5, 0.62, 0.75, 0.88, 0.95, 1, 0.97, 0.9, 0.78, 0.65, 0.55, 0.48, 0.42, 0.4, 0.35, 0.3];
  const n = prices.length;
  const x0 = 160; const w = 704; const bw = w / n;
  const bars = prices.map((p, i) => {
    const h = 24 + p * 100;
    return `<rect x="${(x0 + i * bw + 2).toFixed(1)}" y="${(560 - h).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${priceColor(p)}"/>`;
  }).join('');
  const pv = [0, 0, 0, 0, 0.1, 0.35, 0.65, 0.85, 1, 0.95, 0.8, 0.55, 0.3, 0.1, 0, 0];
  const pts = pv.map((v, i) => `${(x0 + (i + 0.5) * (w / 16)).toFixed(1)},${(620 - v * 46).toFixed(1)}`);
  const area = `<polygon points="${x0},620 ${pts.join(' ')} ${x0 + w},620" fill="${ORANGE}" fill-opacity=".3" stroke="${ORANGE}" stroke-width="3"/>`;
  const bat = prices.map((p, i) => {
    const m = i >= 8 && i <= 12 ? GREEN : (p > 0.7 ? GRAY : ORANGE);
    return `<rect x="${(x0 + i * bw + 2).toFixed(1)}" y="636" width="${(bw - 4).toFixed(1)}" height="14" rx="3" fill="${m}"/>`;
  }).join('');
  const car = prices.map((p, i) => `<rect x="${(x0 + i * bw + 2).toFixed(1)}" y="660" width="${(bw - 4).toFixed(1)}" height="14" rx="3" fill="${i >= 9 && i <= 12 ? PURPLE : t.panel}"/>`).join('');
  return pill(160, 256, 220, 64, t.ink) + pill(704, 262, 160, 50, ORANGE)
    + `<rect x="160" y="346" width="26" height="26" rx="7" fill="${ORANGE}"/>` + pill(204, 348, 260, 22, t.ink) + pill(484, 350, 200, 18, t.soft)
    + `<rect x="160" y="392" width="26" height="26" rx="7" fill="${PURPLE}"/>` + pill(204, 394, 150, 22, t.ink) + pill(374, 396, 260, 18, t.soft)
    + bars + area + bat + car
    + pill(160, 704, 90, 16, t.soft) + pill(270, 704, 90, 16, t.soft) + pill(380, 704, 90, 16, t.soft) + pill(490, 704, 120, 16, t.soft);
}

function fuseSvg(t) {
  const col = (x, pct, c) => pill(x, 452, 54, 22, t.soft) + pill(x + 66, 448, 120, 30, t.ink)
    + pill(x, 496, 216, 14, t.panel) + pill(x, 496, Math.max(14, 216 * pct), 14, c) + pill(x, 528, 100, 18, t.soft);
  return pill(160, 286, 230, 74, t.ink) + pill(410, 312, 110, 26, t.soft) + pill(724, 298, 140, 44, t.ink)
    + pill(160, 386, 704, 20, t.panel) + pill(160, 386, 704 * 0.62, 20, ORANGE)
    + col(160, 0.42, GREEN) + col(404, 0.62, ORANGE) + col(648, 0.3, GREEN)
    + pill(160, 592, 330, 22, t.soft) + pill(704, 580, 160, 46, ORANGE) + pill(530, 580, 154, 46, RED);
}

function page(svgInner, t, cardY, cardH) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs><filter id="s" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="${t.shadow}"/></filter></defs>
<rect x="112" y="${cardY}" width="800" height="${cardH}" rx="56" fill="${t.card}" filter="url(#s)"/>
${svgInner}
</svg></body></html>`;
}

const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wprev-'));
const jobs = [
  ['plan', planSvg, 222, 540],
  ['fuse', fuseSvg, 242, 440],
];
for (const [w, fn, y, h] of jobs) {
  for (const [name, t] of Object.entries(THEMES)) {
    const html = path.join(tmp, `${w}-${name}.html`);
    fs.writeFileSync(html, page(fn(t), t, y, h));
    const out = path.join(root, 'widgets', w, `preview-${name}.png`);
    execFileSync(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
      '--window-size=1024,1024', `--screenshot=${out}`, `file:///${html.replace(/\\/g, '/')}`], { stdio: 'ignore' });
    console.log('ok', path.relative(root, out));
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
