'use strict';

const { sanitizeRefPeriods } = require('./lib/CostTracker');

// Shows the first paired innostrom device - same simplification as the widget's api.js.
function firstDevice(homey) {
  const devices = homey.drivers.getDriver('innostrom').getDevices();
  return devices[0] || null;
}

module.exports = {

  async getCost({ homey }) {
    const device = firstDevice(homey);
    if (!device) return { paired: false };
    return { paired: true, name: device.getName(), ...device.getCostOverview() };
  },

  async getCostChart({ homey, params }) {
    const device = firstDevice(homey);
    if (!device) return { paired: false };
    const offset = Number(params && params.offset);
    if (!Number.isInteger(offset) || offset < 0 || offset > 13) throw new Error('Invalid day offset');
    return { paired: true, offset, slots: device.getCostChart(offset) };
  },

  async getPrices({ homey }) {
    const device = firstDevice(homey);
    if (!device) return { paired: false };
    return { paired: true, name: device.getName(), ...device.getPriceTable() };
  },

  async getShadow({ homey }) {
    const device = firstDevice(homey);
    if (!device) return { paired: false };
    return { paired: true, ...device.getShadow() };
  },

  async putCostConfig({ homey, body }) {
    const periods = sanitizeRefPeriods(body && body.periods);
    homey.settings.set('ref_periods', periods);
    return { refPeriods: periods };
  },

  async deleteCostData({ homey, body }) {
    const device = firstDevice(homey);
    if (!device) throw new Error('No device paired');
    return device.deleteCostData(body || {});
  },

  async resetCost({ homey }) {
    const device = firstDevice(homey);
    if (!device) throw new Error('No device paired');
    return device.resetCost();
  },

  async getAppConfig({ homey }) {
    const raw = homey.settings.get('vat_percent');
    const v = Number(raw);
    return {
      vatPercent: raw !== null && raw !== undefined && Number.isFinite(v) && v >= 0 ? v : null,
      battery: homey.settings.get('battery_params') || null,
      feedInMode: homey.settings.get('feed_in_mode') === 'api' ? 'api' : 'reference',
    };
  },

  async putAppConfig({ homey, body }) {
    const out = {};
    if (body && body.vatPercent !== undefined) {
      const v = Number(body.vatPercent);
      if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error('Invalid VAT');
      homey.settings.set('vat_percent', Math.round(v * 100) / 100);
      out.vatPercent = homey.settings.get('vat_percent');
    }
    if (body && body.feedInMode !== undefined) {
      if (!['reference', 'api'].includes(body.feedInMode)) throw new Error('Invalid mode');
      homey.settings.set('feed_in_mode', body.feedInMode);
      out.feedInMode = body.feedInMode;
    }
    if (body && body.battery) {
      const cap = Number(body.battery.capacityKwh);
      const pow = Number(body.battery.powerKw);
      const eff = Number(body.battery.roundTrip);
      if (!(cap > 0 && cap <= 100) || !(pow > 0 && pow <= 50) || !(eff > 0.5 && eff <= 1)) throw new Error('Invalid battery');
      homey.settings.set('battery_params', {
        capacityKwh: Math.round(cap * 10) / 10,
        powerKw: Math.round(pow * 10) / 10,
        roundTrip: Math.round(eff * 1000) / 1000,
      });
      out.battery = homey.settings.get('battery_params');
    }
    return out;
  },

  async getSummary({ homey }) {
    const device = firstDevice(homey);
    if (!device) return { paired: false };

    return {
      paired: true,
      name: device.getName(),
      total: device.getCapabilityValue('measure_price_total'),
      energy: device.getCapabilityValue('measure_price_energy'),
      grid: device.getCapabilityValue('measure_price_grid'),
      next: device.getCapabilityValue('measure_price_next'),
      min: device.getCapabilityValue('measure_price_min_today'),
      max: device.getCapabilityValue('measure_price_max_today'),
      avg: device.getCapabilityValue('measure_price_avg_today'),
      rank: device.getCapabilityValue('price_rank_today'),
      level: device.getCapabilityValue('price_level'),
      noTomorrow: device.getCapabilityValue('alarm_no_tomorrow'),
      lastUpdate: device.getCapabilityValue('last_update'),
      // Deliberately not the token: never send it anywhere it doesn't have to go, even
      // to the app's own settings page (see CLAUDE.md - "Token ist geheim").
      settings: {
        environment: device.getSetting('environment'),
        price_field: device.getSetting('price_field'),
        vat_percent: device.getSetting('vat_percent'),
        fallback_price: device.getSetting('fallback_price'),
      },
      slots: device.getChartSlots(),
      cheapBlock: device.getCheapBlockInfo(2),
    };
  },

};
