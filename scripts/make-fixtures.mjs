// Erzeugt die synthetischen Fixtures in test/fixtures/.
// Keine Abhängigkeiten. Aufruf: node scripts/make-fixtures.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures');
const TZ = 'Europe/Zurich';

/** Formatiert ein Date als RFC3339 mit der Zürcher Offset-Angabe, z. B. 2027-01-14T00:00:00+01:00 */
export function toZurichIso(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'longOffset',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  const off = parts.timeZoneName === 'GMT' ? '+00:00' : parts.timeZoneName.replace('GMT', '');
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${off}`;
}

/** Alle 15-Minuten-Slots eines lokalen Kalendertags (berücksichtigt Zeitumstellung). */
function slotsOfLocalDay(y, m, d) {
  // Start: lokale Mitternacht. Wir suchen die UTC-Zeit, die lokal 00:00 ist.
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0) - 2 * 3600e3;
  let start = guess;
  while (!toZurichIso(new Date(start)).includes('T00:00:00')) start += 15 * 60e3;
  let end = start + 20 * 3600e3;
  while (!toZurichIso(new Date(end)).includes('T00:00:00')) end += 15 * 60e3;
  const out = [];
  for (let t = start; t < end; t += 15 * 60e3) out.push([new Date(t), new Date(t + 15 * 60e3)]);
  return out;
}

const price = (value) => [{ value: Math.round(value * 1e5) / 1e5, unit: 'CHF_kWh', component: 'work' }];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const bump = (h, center, width) => Math.exp(-(((h - center) / width) ** 2));

/** Realistischer Winter-Werktag innerhalb der AEW-Grenzen 2027 (CHF/kWh, exkl. MWST). */
function aewLikeSlot(localHour) {
  const h = localHour;
  // Energie (Spot-Form): Morgen- und Abendspitze, Mittagsdelle (PV), Nachttal
  const e = 0.0519 + (0.1556 - 0.0519) * clamp(
    0.35 + 0.45 * bump(h, 8, 1.6) + 0.55 * bump(h, 18.5, 2) - 0.25 * bump(h, 13, 2) - 0.2 * bump(h, 3.5, 2), 0, 1);
  // Netz (Netzlast): Tag hoch, Nacht tief, Abendspitze
  const g = 0.01 + (0.256 - 0.01) * clamp(
    0.15 + 0.35 * bump(h, 11, 3.5) + 0.6 * bump(h, 18, 1.8) - 0.1 * bump(h, 3, 2), 0, 1);
  const abgaben = 0.07; // PLATZHALTER für nicht-dynamische Abgaben (SDL, Netzzuschlag, Gemeinde …)
  return {
    electricity: price(e),
    grid: price(g),
    dso: price(g + abgaben),
    integrated: price(e + g + abgaben),
    feed_in: price(0.06),
  };
}

function buildDay(y, m, d, publication, fn) {
  return {
    status: 'ok',
    publication_timestamp: publication,
    prices: slotsOfLocalDay(y, m, d).map(([s, e]) => {
      const iso = toZurichIso(s);
      const localHour = Number(iso.slice(11, 13)) + Number(iso.slice(14, 16)) / 60;
      return { start_timestamp: iso, end_timestamp: toZurichIso(e), ...fn(localHour) };
    }),
  };
}

const constant = () => ({
  electricity: price(0.1), grid: price(0.1), dso: price(0.1), integrated: price(0.2), feed_in: price(0),
});

const files = {
  'test-env-all-day.json': buildDay(2026, 9, 25, '2026-09-24T14:00:56.058+02:00', constant),
  'synthetic-aew-day.json': buildDay(2027, 1, 14, '2027-01-13T16:02:11.000+01:00', aewLikeSlot),
  'synthetic-dst-spring.json': buildDay(2026, 3, 29, '2026-03-28T16:00:00.000+01:00', aewLikeSlot),
  'synthetic-dst-autumn.json': buildDay(2026, 10, 25, '2026-10-24T16:00:00.000+02:00', aewLikeSlot),
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(OUT, name), JSON.stringify(body, null, 1) + '\n');
    console.log(name, body.prices.length, 'slots');
  }
}
