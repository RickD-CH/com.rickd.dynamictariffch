'use strict';

/**
 * Prognose-Sperre: Auf einem schwachen Sonnentag werden neue Starts von Verbrauchern (hier:
 * Wallbox) zurückgehalten, damit die Hausbatterie für den Abend genug Ladung behält.
 *
 *   mode 'manual'   -> sperren, wenn die Rest-Prognose von heute < kwh
 *   mode 'adaptive' -> sperren, wenn sie die Batterie nicht mehr voll bekommt (Kapazität und SoC)
 * Ohne Batterie, Kapazität, SoC oder frische Prognose ist die Sperre inaktiv (nie blind sparen).
 * Hysterese: Schliessen mit dem nackten Defizit, Öffnen erst mit 1 kWh Reserve darüber.
 */

const HYSTERESIS_KWH = 1;

/**
 * @param {{mode:string, kwh?:number, soc:number|null, capacityKwh:number, remainingKwh:number|null,
 *          stale:boolean, hasBattery:boolean, wasBlocked:boolean}} p
 */
function forecastGate(p) {
  const inactive = (reason) => ({
    blocked: false, reason, remainingKwh: null, thresholdKwh: null,
  });
  const mode = p.mode || 'off';
  if (mode === 'off') return inactive('mode_off');
  if (!p.hasBattery) return inactive('no_battery');
  if (p.stale || p.remainingKwh === null || p.remainingKwh === undefined) return inactive('forecast_stale');

  let threshold;
  if (mode === 'adaptive') {
    if (!(p.capacityKwh > 0)) return inactive('no_capacity');
    if (p.soc === null || p.soc === undefined) return inactive('no_soc');
    threshold = Math.max(0, ((100 - p.soc) / 100) * p.capacityKwh);
  } else {
    threshold = Number(p.kwh) || 0;
    if (threshold <= 0) return inactive('no_threshold');
  }
  const reopenAt = threshold + HYSTERESIS_KWH;
  const blocked = p.remainingKwh < (p.wasBlocked ? reopenAt : threshold);
  return {
    blocked,
    reason: blocked ? (p.remainingKwh < threshold ? 'below' : 'hysteresis') : 'above',
    remainingKwh: Math.round(p.remainingKwh * 10) / 10,
    thresholdKwh: Math.round(threshold * 10) / 10,
  };
}

module.exports = { forecastGate, HYSTERESIS_KWH };
