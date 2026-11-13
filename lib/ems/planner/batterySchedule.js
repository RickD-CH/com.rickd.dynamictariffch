'use strict';

/**
 * Batterie-Fahrplan: welche Viertelstunden die Batterie entlädt und wann sie aus dem Netz lädt.
 * Reine Funktion, keine Homey-Aufrufe.
 *
 * Idee: Die Ladung soll in die teuersten Viertelstunden gehen, bis zum nächsten Nachladen. Statt einer festen Anzahl
 * Spitzenstunden wird der ganze Zeitraum (bis 36 Stunden) gerechnet:
 *   - Bedarf je Viertelstunde = Hausverbrauch minus PV; was die Sonne mehr liefert, lädt die Batterie gratis.
 *   - Teure Viertelstunden der Reihe nach (teuerste zuerst): zuerst mit vorhandener Ladung oder Solarstrom decken;
 *     reicht das nicht, in der günstigsten Viertelstunde davor aus dem Netz laden, sofern
 *     Ladepreis / Wirkungsgrad (plus verdrängter Solarstrom) unter dem Preis der teuren Viertelstunde liegt.
 *   - Der Ladestand bleibt zwischen Untergrenze und voll, Lade- und Entladeleistung je Viertelstunde sind begrenzt.
 *   - Am Schluss wird überflüssiges Netzladen wieder gestrichen.
 * So ergibt sich «Abend nutzen, nachts günstig nachladen, Morgen decken, Sonne füllt» von selbst.
 */

const Q = 15 * 60 * 1000;
const EPS = 1e-6;

/**
 * @param {object} p
 * @param {{start:number,end:number,price:number}[]} p.slots  Preise (Rp./kWh), aufsteigend
 * @param {number} p.nowMs
 * @param {number} p.soc                 Ladestand in Prozent
 * @param {object} p.c                   { capacityKwh, targetSoc, floorSoc, chargePowerKw, efficiency, bridgeLoadKw }
 * @param {function|null} p.pvKwAt       erwartete PV-Leistung (kW) je Viertelstunde, oder null (= keine Sonne angenommen)
 * @param {function|null} p.loadKwAt     gelernter Hausverbrauch (kW), oder null (= c.bridgeLoadKw)
 * @param {number} [p.feedInRp]          Wert von eingespeistem Strom (Rp./kWh), für verdrängten Solarstrom
 * @param {number} [p.horizonH]          wie weit voraus (Stunden)
 * @returns {{ slots:object[], charge:number[], discharge:number[], energy:number[], index:number }}
 */
function planSchedule({
  slots, nowMs, soc, c, pvKwAt = null, loadKwAt = null, feedInRp = 0, horizonH = 36,
}) {
  const nowQ = Math.floor(nowMs / Q) * Q;
  const S = (slots || []).filter((s) => Number.isFinite(s.price) && s.end > nowMs && s.start < nowQ + horizonH * 3600000)
    .sort((a, b) => a.start - b.start);
  const n = S.length;
  const cap = Math.max(0, Number(c.capacityKwh) || 0);
  const lo = (Math.max(0, Number(c.floorSoc) || 0) / 100) * cap;
  const gridMax = (Math.min(100, Number(c.targetSoc) || 100) / 100) * cap;
  const eff = Math.min(1, Math.max(0.5, Number(c.efficiency) || 0.9));
  const effIn = Math.sqrt(eff);
  const effOut = Math.sqrt(eff);
  const slotMax = Math.max(0, Number(c.chargePowerKw) || 0) * 0.25;
  const spread = Number.isFinite(Number(c.minSpreadRp)) ? Number(c.minSpreadRp) : 3; // Netzladen erst ab dieser Ersparnis je kWh
  const load = (t) => {
    const v = typeof loadKwAt === 'function' ? loadKwAt(t) : null;
    return Number.isFinite(v) && v > 0 ? v : Number(c.bridgeLoadKw) || 1;
  };
  const pv = (t) => {
    const v = typeof pvKwAt === 'function' ? pvKwAt(t) : 0;
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  // Anteil der laufenden Viertelstunde, der noch kommt
  const part = S.map((s) => (s.start < nowMs ? Math.max(0, (s.end - nowMs) / Q) : 1));
  const need = S.map((s, i) => Math.max(0, load(s.start) - pv(s.start)) * 0.25 * part[i]);
  const surplus = S.map((s, i) => Math.max(0, pv(s.start) - load(s.start)) * 0.25 * part[i]);
  const e0 = Math.min(cap, Math.max(0, (Number(soc) / 100) * cap));
  const chg = new Array(n).fill(0);
  const dis = new Array(n).fill(0);

  /** Ladestand nach jeder Viertelstunde; ok = nie unter der Untergrenze (ausser schon zu Beginn), nie über voll durch Netzladen. */
  const run = () => {
    const energy = new Array(n);
    let e = e0;
    let ok = true;
    let bad = -1;
    let clipped = 0;
    for (let i = 0; i < n; i++) {
      e += chg[i] * effIn;
      if (chg[i] > EPS && e > Math.max(gridMax, e0) + EPS) {
        ok = false; if (bad < 0) bad = i;
      }
      const room = cap - e;
      const fill = Math.min(room, surplus[i] * effIn);
      e += Math.max(0, fill);
      clipped += Math.max(0, surplus[i] * effIn - Math.max(0, fill));
      e -= dis[i] / effOut;
      if (dis[i] > EPS && e < lo - EPS) {
        ok = false; if (bad < 0) bad = i;
      }
      energy[i] = e;
    }
    return {
      ok, energy, clipped, bad,
    };
  };

  if (n && cap > 0 && slotMax > 0) {
    const order = S.map((s, i) => i).filter((i) => need[i] > EPS).sort((a, b) => (S[b].price - S[a].price) || (a - b));
    for (const j of order) {
      const want = Math.min(need[j], slotMax * part[j]);
      dis[j] = want;
      if (run().ok) continue;
      // Energie fehlt: günstiges Netzladen vor j, solange es sich lohnt
      let guard = 0;
      let ok = false;
      while (!ok && guard < n) {
        guard += 1;
        const now0 = run();
        const base = now0.clipped;
        // Laden vor dem Zeitpunkt, an dem die Ladung zuerst ausgeht (nicht nur vor j)
        const until = now0.bad >= 0 ? now0.bad : j;
        let best = -1;
        let bestCost = Infinity;
        for (let i = 0; i < until; i++) {
          if (chg[i] >= slotMax * part[i] - EPS) continue;
          const add = slotMax * part[i] - chg[i];
          chg[i] += add;
          const r = run();
          chg[i] -= add;
          // Kosten je gelieferter kWh: Ladepreis über beide Wirkungsgrade, plus verdrängter Solarstrom
          const lostSolar = Math.max(0, r.clipped - base);
          const cost = S[i].price / eff + (add > EPS ? (lostSolar * feedInRp) / (add * eff) : 0);
          if (cost + spread < S[j].price && cost < bestCost) {
            bestCost = cost; best = i;
          }
        }
        if (best < 0) break;
        chg[best] = slotMax * part[best];
        ok = run().ok;
      }
      if (!ok) {
        // Nicht ganz deckbar: so viel wie möglich (halbieren bis es passt)
        let a = 0;
        let b = want;
        for (let k = 0; k < 12; k++) {
          dis[j] = (a + b) / 2;
          if (run().ok) a = dis[j]; else b = dis[j];
        }
        dis[j] = a;
      }
    }
    // Überflüssiges Netzladen streichen (teuerste Ladeviertelstunden zuerst), in kleinen Schritten
    const charging = S.map((s, i) => i).filter((i) => chg[i] > EPS).sort((a, b) => S[b].price - S[a].price);
    for (const i of charging) {
      const step = slotMax / 8;
      while (chg[i] > EPS) {
        const before = chg[i];
        chg[i] = Math.max(0, chg[i] - step);
        if (!run().ok) {
          chg[i] = before; break;
        }
      }
    }
  }
  const r = run();
  const index = S.findIndex((s) => s.start <= nowMs && nowMs < s.end);
  return {
    slots: S, charge: chg, discharge: dis, energy: r.energy, need, surplus, index, e0, cap,
  };
}

module.exports = { planSchedule };
