// Live-Abfrage der Innostrom API (heute + morgen) und kurze Auswertung.
//   node scripts/probe-api.mjs            → Testumgebung mit öffentlichen Zugangsdaten
//   node scripts/probe-api.mjs --prod     → Produktiv, braucht INNOSTROM_TOKEN und INNOSTROM_METERING_CODE
//   node scripts/probe-api.mjs --raw      → zusätzlich die Rohantwort des ersten Slots ausgeben
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { InnostromClient, TEST_CREDENTIALS } = require('../lib/InnostromClient.js');
const { PriceStore } = require('../lib/PriceStore.js');
const time = require('../lib/time.js');

const prod = process.argv.includes('--prod');
const creds = prod
  ? { meteringCode: process.env.INNOSTROM_METERING_CODE, token: process.env.INNOSTROM_TOKEN }
  : TEST_CREDENTIALS;
if (!creds.meteringCode || !creds.token) {
  console.error('Für --prod bitte INNOSTROM_METERING_CODE und INNOSTROM_TOKEN setzen.');
  process.exit(1);
}

const client = new InnostromClient({ ...creds, environment: prod ? 'production' : 'test' });
const now = new Date();
const from = time.startOfLocalDay(now);
const to = time.addLocalDays(now, 2);

try {
  const { slots, publishedAt } = await client.getPrices({ from, to, tariffType: 'all' });
  const store = new PriceStore();
  store.upsert(slots);
  const rp = (v) => (v == null ? '–' : (v * 100).toFixed(3) + ' Rp.');
  const cur = store.at(now);

  console.log(`Umgebung:        ${prod ? 'PRODUKTIV' : 'TEST'} (${client.baseUrl})`);
  console.log(`Publiziert:      ${publishedAt ? time.toLocalIso(publishedAt) : '–'}`);
  console.log(`Slots erhalten:  ${slots.length}`);
  console.log(`Heute komplett:  ${store.hasFullDay(now)}`);
  console.log(`Morgen komplett: ${store.hasFullDay(time.addLocalDays(now, 1))}`);
  if (cur) {
    console.log(`Jetzt (${time.toLocalIso(cur.start).slice(11, 16)}): gesamt ${rp(cur.integrated)} | Energie ${rp(cur.electricity)} | Netz ${rp(cur.grid)} | DSO ${rp(cur.dso)} | Rücklieferung ${rp(cur.feedIn)}`);
    console.log(`Rang heute:      ${store.rankToday(now)} | Niveau: ${store.level(now)}`);
  }
  const st = store.dayStats(now);
  if (st) console.log(`Heute:           min ${rp(st.min)} / Ø ${rp(st.avg)} / max ${rp(st.max)}`);
  const block = store.cheapestBlock(time.floorToSlot(now), to, 8);
  if (block) console.log(`Günstigste 2h ab jetzt: ${time.toLocalIso(block.start)} → Ø ${rp(block.avg)}`);
  if (process.argv.includes('--raw') && slots[0]) console.log(JSON.stringify(slots[0], null, 2));
} catch (e) {
  console.error(`Fehler [${e.code || e.name}]: ${e.message}`);
  process.exit(2);
}
