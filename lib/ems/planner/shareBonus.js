'use strict';

/**
 * Prognose-Bonus für die Hausbatterie-Rampe: Ist laut Solarprognose heute noch deutlich mehr Sonne zu erwarten, als die Batterie bis voll
 * und das Haus bis zum Sonnenuntergang brauchen, wird die Rampe um bis zu `bonus` Prozentpunkte nach unten verschoben (das Auto bzw. die
 * Geräte bekommen früher einen Teil des Solarstroms). Defensiv: ohne frische Prognose, Kapazität, Ladestand oder Hausverbrauchsprofil
 * (oder bei bonus 0) bleibt die Rampe unverändert.
 *
 *   überschuss = Rest-Prognose - (Batterie bis voll) - (Hausverbrauch bis zum Ende der Sonne)
 *   faktor     = überschuss / Batteriekapazität, begrenzt auf 0 bis 1
 *   verschiebung = gerundet(bonus x faktor)
 */

/**
 * @param {{share:object, bonus?:number, soc:number|null, capacityKwh:number, remainingKwh:number|null, houseKwh:number|null}} p
 * @returns {{share:object, shift:number, surplusKwh:number|null}}
 */
function applyShareBonus(p) {
  const share = p.share || {};
  const bonus = Math.min(40, Math.max(0, Number(p.bonus) || 0));
  const none = { share, shift: 0, surplusKwh: null };
  if (!(bonus > 0)) return none;
  if (!(p.capacityKwh > 0) || p.soc === null || p.soc === undefined) return none;
  if (p.remainingKwh === null || p.remainingKwh === undefined || p.houseKwh === null || p.houseKwh === undefined) return none;
  const needKwh = Math.max(0, ((100 - p.soc) / 100) * p.capacityKwh);
  const surplusKwh = p.remainingKwh - needKwh - p.houseKwh;
  const factor = Math.min(1, Math.max(0, surplusKwh / p.capacityKwh));
  const shift = Math.round(bonus * factor);
  const out = { shift, surplusKwh: Math.round(surplusKwh * 10) / 10 };
  if (shift <= 0) return { share, ...out };
  const lo = Math.max(0, (Number(share.socLow) || 0) - shift);
  const hi = Math.max(lo + 1, (Number(share.socHigh) || 0) - shift);
  return { share: { ...share, socLow: lo, socHigh: hi }, ...out };
}

module.exports = { applyShareBonus };
