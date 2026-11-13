'use strict';

const { efficiency } = require('./ShadowBattery');

/**
 * Batterie-Potenzial um den Fahrplan des Energiemanagements ergänzen: pro Tag die Kosten, die der Fahrplan im Modell
 * gehabt hätte (Franken-Auswertung, CHF -> Rp.), und wie viel des möglichen Nutzens er erreicht hätte.
 * Tage ohne Fahrplan-Wert bleiben ohne (plan = null). Die Summe zählt nur Tage mit Fahrplan-Wert.
 * @param {{days:object[], total:object}} shadow  Ergebnis von device.getShadow() (Rp.)
 * @param {{[day:string]: {mine:number|null}}|null} ledgerDays  Franken-Auswertung je Tag (CHF)
 */
function addPlan(shadow, ledgerDays) {
  if (!shadow || !Array.isArray(shadow.days)) return shadow;
  const byDay = ledgerDays || {};
  const days = shadow.days.map((d) => {
    const l = byDay[d.key];
    const plan = l && Number.isFinite(l.mine) ? Math.round(l.mine * 100) : null;
    return { ...d, plan, planEfficiency: plan === null ? null : efficiency(d.noBattery, plan, d.withGrid).percent };
  });
  const withPlan = days.filter((d) => d.plan !== null);
  const sum = (k) => withPlan.reduce((a, d) => a + d[k], 0);
  const total = {
    ...shadow.total, plan: null, planEfficiency: null, planDays: withPlan.length,
  };
  if (withPlan.length) {
    total.plan = sum('plan');
    total.planEfficiency = efficiency(sum('noBattery'), total.plan, sum('withGrid')).percent;
  }
  return { ...shadow, days, total };
}

module.exports = { addPlan };
