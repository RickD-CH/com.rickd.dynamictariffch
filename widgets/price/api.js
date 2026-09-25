'use strict';

// Shows the first paired innostrom device - fine for the common single-metering-point
// case. A device picker (like Flow cards' device arg) would be needed to support more.
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
      next: device.getCapabilityValue('measure_price_next'),
      min: device.getCapabilityValue('measure_price_min_today'),
      max: device.getCapabilityValue('measure_price_max_today'),
      avg: device.getCapabilityValue('measure_price_avg_today'),
      rank: device.getCapabilityValue('price_rank_today'),
      level: device.getCapabilityValue('price_level'),
      noTomorrow: device.getCapabilityValue('alarm_no_tomorrow'),
    };
  },

  async refresh({ homey }) {
    const device = firstDevice(homey);
    if (!device) throw new Error('No device paired');
    await device.actionRefresh();
    return true;
  },

};
