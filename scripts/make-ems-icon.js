// Aufruf: node scripts/make-ems-icon.js [ziel.svg]  (schreibt drivers/ems/assets/icon.svg)
// Isometrisches Haus-Icon aus einem 3D-Modell als GEFÜLLTE Flächen mit Aussparungen (keine Linien).
// Grund: Homey färbt Geräte-Icons einfarbig ein (hell/dunkel). Linien-Icons mit fill="none" werden dabei zur
// ausgefüllten Silhouette (im Dunkelmodus nur ein weisses Haus). Details müssen deshalb Löcher sein (fill-rule evenodd).
// Betrachter von +x/+y/+z; gezeichnet werden nur Flächen, die zum Betrachter zeigen (konvexer Körper).
const fs = require('fs');

const C30 = Math.cos(Math.PI / 6);
const S30 = 0.5;
const proj = ([x, y, z]) => [(x - y) * C30, (x + y) * S30 - z];

// ---------------------------------------------------------------- Modell
const L = 40; // Länge (x)
const D = 30; // Tiefe (y)
const H = 24; // Wandhöhe
const R = 19; // Firsthöhe über der Wand

const faces = []; // sichtbare Flächen als 3D-Polygone
faces.push([[0, D, 0], [L, D, 0], [L, D, H], [0, D, H]]); // Front (+y)
faces.push([[L, 0, 0], [L, D, 0], [L, D, H], [L, D / 2, H + R], [L, 0, H]]); // Giebel (+x)
faces.push([[0, D, H], [L, D, H], [L, D / 2, H + R], [0, D / 2, H + R]]); // Dachfläche vorne

const holes = []; // Aussparungen als 3D-Polygone
const front = (x, z) => [x, D, z];
// Tür (leicht vom Boden abgehoben, damit die Wand geschlossen bleibt)
holes.push([front(6, 3), front(6, 15), front(14, 15), front(14, 3)]);
// Fenster 2 x 2
const grid = (map, u0, u1, v0, v1, nu, nv, gapU, gapV = gapU) => {
  const cu = (u1 - u0 - gapU * (nu - 1)) / nu;
  const cv = (v1 - v0 - gapV * (nv - 1)) / nv;
  const out = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = u0 + i * (cu + gapU); const b = a + cu;
      const c = v0 + j * (cv + gapV); const d = c + cv;
      out.push([map(a, c), map(b, c), map(b, d), map(a, d)]);
    }
  }
  return out;
};
holes.push(...grid(front, 20.5, 34.5, 7, 18, 2, 2, 1.8));
// Solarpanel 3 x 2 auf der vorderen Dachfläche (t = 0 Traufe bis 1 First)
const roof = (x, t) => [x, D - (D / 2) * t, H + R * t];
holes.push(...grid(roof, 5, 35, 0.2, 0.82, 3, 2, 1.8, 0.075)); // Fuge in x-Einheiten bzw. in t (ca. 1.8 Einheiten entlang der Dachschräge)
// Blitz am Giebel (Ebene x = L; «rechts» für den Betrachter = kleineres y)
const gable = (u, v) => [L, D / 2 - u, v];
const bolt = [[13, 2], [4, 14], [11, 14], [10, 22], [20, 10], [13, 10]].map(([gx, gy]) => gable((gx - 12) * 0.72, 17 - (gy - 12) * 0.72));
holes.push(bolt);

// ---------------------------------------------------------------- Projektion und Einpassen in 100 x 100
const PAD = 8;
const all = faces.flatMap((p) => p.map(proj));
const minX = Math.min(...all.map((p) => p[0])); const maxX = Math.max(...all.map((p) => p[0]));
const minY = Math.min(...all.map((p) => p[1])); const maxY = Math.max(...all.map((p) => p[1]));
const s = Math.min((100 - 2 * PAD) / (maxX - minX), (100 - 2 * PAD) / (maxY - minY));
const ox = (100 - (maxX - minX) * s) / 2 - minX * s;
const oy = (100 - (maxY - minY) * s) / 2 - minY * s;
const to2 = (p3) => { const [a, b] = proj(p3); return [a * s + ox, b * s + oy]; };

// Konvexes Polygon nach innen verkleinern (Abstand d), damit zwischen den Flächen eine Fuge bleibt
function inset(pts, d) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const [x1, y1] = pts[i]; const [x2, y2] = pts[(i + 1) % n]; area += x1 * y2 - x2 * y1; }
  const sign = area > 0 ? 1 : -1;
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const dx = q[0] - p[0]; const dy = q[1] - p[1]; const len = Math.hypot(dx, dy);
    const nx = (-dy / len) * sign; const ny = (dx / len) * sign; // Innenseite
    return { p: [p[0] + nx * d, p[1] + ny * d], dir: [dx / len, dy / len] };
  });
  return lines.map((l, i) => {
    const m = lines[(i + n - 1) % n];
    const det = m.dir[0] * -l.dir[1] - m.dir[1] * -l.dir[0];
    const t = ((l.p[0] - m.p[0]) * -l.dir[1] - (l.p[1] - m.p[1]) * -l.dir[0]) / det;
    return [m.p[0] + m.dir[0] * t, m.p[1] + m.dir[1] * t];
  });
}

const f = (n) => Math.round(n * 100) / 100;
const path = (pts) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')}Z`;
const GAP = 1.5; // halbe Fuge zwischen den Flächen
const d = [
  ...faces.map((p) => path(inset(p.map(to2), GAP))),
  ...holes.map((p) => path(p.map(to2))),
].join(' ');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <!-- Energiemanagement: Haus isometrisch mit Solarpanel, Tür, Fenster und Blitz (aus 3D-Modell projiziert).
       Gefüllte Flächen mit Aussparungen statt Linien, damit das Icon beim Einfärben (hell/dunkel) lesbar bleibt. -->
  <path fill="#000" fill-rule="evenodd" d="${d}"/>
</svg>
`;
fs.writeFileSync(process.argv[2] || require('path').join(__dirname, '../drivers/ems/assets/icon.svg'), svg);
console.log('ok', f(s));
