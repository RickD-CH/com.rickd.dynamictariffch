'use strict';

const { planWidget } = require('../../lib/WidgetData');

module.exports = {

  async getPlan({ homey }) {
    const ems = homey.app && homey.app.ems;
    if (!ems || !ems.hasDevice()) return { ems: false };
    const { runner } = ems;
    // Nur was das Widget braucht (getShadow rechnet auch die Auswertungen, das ist hier nicht nötig)
    const shadow = {
      deviceExists: true,
      config: ems.getConfig(),
      current: runner ? runner.current : null,
      charger: runner ? { current: runner.chargerCurrent } : null,
    };
    return planWidget({ plan: ems.getPlan(), shadow, tz: homey.clock.getTimezone() });
  },

};
