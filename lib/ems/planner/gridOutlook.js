'use strict';

/**
 * Ausblick Hausanschluss: wie viel Strom wird in den nächsten Stunden aus dem Netz erwartet, wenn alles Geplante
 * gleichzeitig läuft, und wie nah liegt das an der Grenze der Hausanschluss-Sicherung? Reine Funktion, keine Homey-Aufrufe.
 *
 * Je Viertelstunde: Netzbezug = max(0, gelernter Hausverbrauch + geplante Lasten - PV-Prognose).
 * Geplante Lasten sind nur, was wirklich einen Plan hat (Batterie-Fahrplan dieses EMS, E-Auto, Aufträge wie ein
 * Geschirrspüler-Lauf). Verbraucher, die nach Überschuss regeln, laufen von der Sonne und belasten den Anschluss nicht.
 *
 * Grenze = 3 Phasen x Grenzstrom x 230 V. Das setzt eine gleichmässige Verteilung auf die drei Phasen voraus; ein einphasiges
 * Gerät auf der falschen Phase kann die Grenze früher erreichen (siehe `phaseNote`, das Gesamtbild bleibt eine Schätzung).
 */

const Q = 15 * 60 * 1000;
const VOLT = 230;
const TIGHT_PCT = 80; // ab hier «knapp»
const OVER_PCT = 100; // ab hier «über der Grenze»

const r1 = (v) => Math.round(v * 10) / 10;

/**
 * @param {object} p
 * @param {number} p.nowMs
 * @param {number} p.limitA                 Grenzstrom je Phase (A), z. B. 36
 * @param {number} [p.phases]               Anzahl Phasen des Anschlusses (3)
 * @param {number} [p.horizonH]             wie weit voraus (24 Stunden)
 * @param {function} p.baseKwAt             gelernter Hausverbrauch (kW) zu einer Zeit, oder null
 * @param {function|null} p.pvKwAt          erwartete PV-Leistung (kW)
 * @param {{key:string,name:string,kwAt:function}[]} p.loads  geplante Lasten, je mit kW zu einer Zeit (0 = nicht geplant)
 * @returns {{ limitKw:number, limitA:number, peak:object|null, status:'ok'|'tight'|'over'|'unknown', slots:object[], phaseNote:boolean }}
 */
function buildOutlook({
  nowMs, limitA, phases = 3, horizonH = 24, baseKwAt = null, pvKwAt = null, loads = [],
}) {
  const limitKw = r1((Math.max(0, Number(limitA) || 0) * phases * VOLT) / 1000);
  const empty = {
    limitKw, limitA, peak: null, status: 'unknown', slots: [], phaseNote: true,
  };
  if (!(limitKw > 0) || typeof baseKwAt !== 'function') return empty;
  const nowQ = Math.floor(nowMs / Q) * Q;
  const slots = [];
  for (let t = nowQ; t < nowQ + horizonH * 3600000; t += Q) {
    const base = Math.max(0, Number(baseKwAt(t)) || 0);
    const pv = typeof pvKwAt === 'function' ? Math.max(0, Number(pvKwAt(t)) || 0) : 0;
    const parts = [];
    let planned = 0;
    for (const l of loads) {
      const kw = Math.max(0, Number(l.kwAt(t)) || 0);
      if (kw > 0) {
        parts.push({ key: l.key, name: l.name, kw: r1(kw) });
        planned += kw;
      }
    }
    const grid = Math.max(0, base + planned - pv);
    slots.push({
      t, baseKw: r1(base), pvKw: r1(pv), gridKw: r1(grid), parts, pct: Math.round((grid / limitKw) * 100),
    });
  }
  let peak = null;
  for (const s of slots) if (!peak || s.gridKw > peak.gridKw) peak = s;
  let status = 'ok';
  if (peak && peak.pct >= OVER_PCT) status = 'over';
  else if (peak && peak.pct >= TIGHT_PCT) status = 'tight';
  return {
    limitKw, limitA, peak: peak ? { ...peak } : null, status, slots, phaseNote: true,
  };
}

/** Stundenwerte (höchste Viertelstunde je Stunde, Stunden gelten auch lokal, da Zürich um ganze Stunden von UTC abweicht). */
function hourly(outlook) {
  const byHour = new Map();
  for (const s of outlook.slots) {
    const key = Math.floor(s.t / 3600000);
    const cur = byHour.get(key);
    if (!cur || s.gridKw > cur.gridKw) byHour.set(key, { ...s });
  }
  return [...byHour.values()].sort((a, b) => a.t - b.t);
}

module.exports = {
  buildOutlook, hourly, TIGHT_PCT, OVER_PCT,
};
