// Aufruf: node scripts/make-ems-icon.js  (schreibt drivers/ems/assets/icon.svg)
// Isometrisches Linien-Icon aus einem 3D-Modell erzeugen (Homey-Stil: fein, einfarbig, currentColor).
// Betrachter von +x/+y/+z; gezeichnet werden nur Flächen, die zum Betrachter zeigen (konvexer Körper).
const fs = require('fs');

const C30 = Math.cos(Math.PI / 6);
const S30 = 0.5;
const proj = ([x, y, z]) => [(x - y) * C30, (x + y) * S30 - z];

// ---------------------------------------------------------------- Modell
const L = 40; // Länge (x)
const D = 30; // Tiefe (y)
const H = 24; // Wandhöhe
const R = 19; // Firsthöhe über der Wand (steil genug, dass die hintere Dachfläche verdeckt ist)

const lines = []; // { pts:[[x,y,z],...], closed, w }
const poly = (pts, w = 'main', closed = true) => lines.push({ pts, closed, w });

// Wände und Dach (sichtbare Flächen)
poly([[0, D, 0], [L, D, 0], [L, D, H], [0, D, H]]); // Front (+y)
poly([[L, 0, 0], [L, D, 0], [L, D, H], [L, D / 2, H + R], [L, 0, H]]); // Giebel (+x)
poly([[0, D, H], [L, D, H], [L, D / 2, H + R], [0, D / 2, H + R]]); // Dachfläche vorne

// Front: Tür und Fenster (Ebene y = D, Koordinaten x/z)
const front = (x, z) => [x, D, z];
poly([front(6, 0), front(6, 14), front(14, 14), front(14, 0)], 'detail', false);
poly([front(21, 8), front(34, 8), front(34, 17), front(21, 17)], 'detail');
poly([front(27.5, 8), front(27.5, 17)], 'fine', false);
poly([front(21, 12.5), front(34, 12.5)], 'fine', false);

// Dach: Solarpanel 3 x 2 (Ebene der vorderen Dachfläche, t = 0 Traufe bis 1 First)
const roof = (x, t) => [x, D - (D / 2) * t, H + R * t];
const x0 = 5; const x1 = 35; const t0 = 0.16; const t1 = 0.84;
poly([roof(x0, t0), roof(x1, t0), roof(x1, t1), roof(x0, t1)], 'detail');
for (const x of [15, 25]) poly([roof(x, t0), roof(x, t1)], 'fine', false);
poly([roof(x0, 0.5), roof(x1, 0.5)], 'fine', false);

// Giebel: Blitz (Ebene x = L; für den Betrachter ist «rechts» = kleineres y)
const gable = (u, v) => [L, D / 2 - u, v];
const bolt = [[13, 2], [4, 14], [11, 14], [10, 22], [20, 10], [13, 10]].map(([gx, gy]) => gable((gx - 12) * 0.72, 17 - (gy - 12) * 0.72));
poly(bolt, 'bolt');

// ---------------------------------------------------------------- Projektion und Einpassen in 100 x 100
const PAD = 9;
const all = lines.flatMap((l) => l.pts.map(proj));
const minX = Math.min(...all.map((p) => p[0])); const maxX = Math.max(...all.map((p) => p[0]));
const minY = Math.min(...all.map((p) => p[1])); const maxY = Math.max(...all.map((p) => p[1]));
const s = Math.min((100 - 2 * PAD) / (maxX - minX), (100 - 2 * PAD) / (maxY - minY));
const ox = (100 - (maxX - minX) * s) / 2 - minX * s;
const oy = (100 - (maxY - minY) * s) / 2 - minY * s;
const f = (n) => Math.round(n * 100) / 100;
const pt = (p3) => { const [a, b] = proj(p3); return `${f(a * s + ox)} ${f(b * s + oy)}`; };

const W = { main: 2.6, detail: 2, fine: 1.4, bolt: 1.8 };
const paths = lines.map((l) => {
  const d = `M${l.pts.map(pt).join(' L')}${l.closed ? 'Z' : ''}`;
  const fill = l.w === 'bolt' ? ' fill="currentColor"' : '';
  return `  <path d="${d}" stroke-width="${W[l.w]}"${fill}/>`;
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
  <!-- Energiemanagement: Haus isometrisch mit Solarpanel, Tür, Fenster und Blitz am Giebel (aus 3D-Modell projiziert) -->
${paths.join('\n')}
</svg>
`;
fs.writeFileSync(process.argv[2] || require('path').join(__dirname, '../drivers/ems/assets/icon.svg'), svg);
console.log('ok', f(s));
