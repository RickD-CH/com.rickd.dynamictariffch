'use strict';

// First paired innostrom device, same simplification as the other widgets.
function firstDevice(homey) {
  const devices = homey.drivers.getDriver('innostrom').getDevices();
  return devices[0] || null;
}

module.exports = {

  async getPrices({ homey }) {
    const device = firstDevice(homey);
    if (!device) return { paired: false };
    return { paired: true, name: device.getName(), ...device.getPriceTable() };
  },

};
