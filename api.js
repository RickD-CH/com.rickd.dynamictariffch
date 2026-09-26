'use strict';

// Shows the first paired innostrom device - same simplification as the widget's api.js.
function firstDevice(homey) {
  const devices = homey.drivers.getDriver('innostrom').getDevices();
  return devices[0] || null;
}

module.exports = {

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
    };
  },

};
