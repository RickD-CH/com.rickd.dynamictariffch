'use strict';

const { fuseWidget } = require('../../lib/WidgetData');

module.exports = {

  async getFuse({ homey }) {
    const ems = homey.app && homey.app.ems;
    if (!ems || !ems.hasDevice()) return { ems: false };
    const { runner } = ems;
    const shadow = { deviceExists: true, config: ems.getConfig(), fuse: runner ? runner.fuseCurrent : null };
    return fuseWidget({ shadow, peak: runner ? runner.fusePeak : null, tz: homey.clock.getTimezone() });
  },

};
