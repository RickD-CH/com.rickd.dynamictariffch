'use strict';

// First paired innostrom device, same simplification as the price widget.
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

};
