'use strict';

/**
 * Output format of the hourly price cards ("Get today's / tomorrow's hourly prices").
 * Lets the user hand the JSON straight to an energy management system that expects another
 * unit (CHF/kWh) or no VAT, without converting it in a script first.
 */

const UNITS = ['rp', 'chf'];
const VAT_MODES = ['incl', 'excl'];
const MAX_DECIMALS = 6;

/** Sanitised settings; decimals null means "automatic" (2 for Rp., 4 for CHF). */
function normalizeHourlyOutput(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const unit = UNITS.includes(o.unit) ? o.unit : 'rp';
  const vat = VAT_MODES.includes(o.vat) ? o.vat : 'incl';
  let decimals = null;
  if (o.decimals !== null && o.decimals !== undefined && o.decimals !== '') {
    const d = Number(o.decimals);
    if (Number.isInteger(d) && d >= 0 && d <= MAX_DECIMALS) decimals = d;
  }
  return { unit, vat, decimals };
}

/** Validates user input; throws on bad values instead of silently replacing them. */
function parseHourlyOutput(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  if (!UNITS.includes(o.unit)) throw new Error('Invalid unit');
  if (!VAT_MODES.includes(o.vat)) throw new Error('Invalid VAT mode');
  if (o.decimals !== null && o.decimals !== undefined && o.decimals !== '') {
    const d = Number(o.decimals);
    if (!Number.isInteger(d) || d < 0 || d > MAX_DECIMALS) throw new Error('Invalid decimals');
  }
  return normalizeHourlyOutput(o);
}

/**
 * @param {number|null} chfExclVat  price in CHF/kWh excluding VAT
 * @param {number} vatPercent
 * @param {{unit:string, vat:string, decimals:number|null}} out normalised settings
 * @returns {number|null}
 */
function formatHourlyPrice(chfExclVat, vatPercent, out) {
  if (typeof chfExclVat !== 'number' || !Number.isFinite(chfExclVat)) return null;
  const o = normalizeHourlyOutput(out);
  let v = chfExclVat;
  if (o.vat === 'incl') v *= 1 + vatPercent / 100;
  if (o.unit === 'rp') v *= 100;
  let { decimals } = o;
  if (decimals === null) decimals = o.unit === 'rp' ? 2 : 4;
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

module.exports = { normalizeHourlyOutput, parseHourlyOutput, formatHourlyPrice };
