'use strict';

const { consumersWidget } = require('../../lib/WidgetData');

module.exports = {

  async getConsumers({ homey }) {
    const ems = homey.app && homey.app.ems;
    if (!ems || !ems.hasDevice()) return { ems: false };
    return consumersWidget({
      shadow: ems.getShadow(), consumerCurrent: ems.runner ? ems.runner.consumerCurrent : [], tz: homey.clock.getTimezone(),
    });
  },

  async postStart({ homey, body }) {
    const ems = homey.app && homey.app.ems;
    if (!ems || !ems.hasDevice()) throw new Error('Energiemanagement nicht bereit');
    await ems.startProgramNow(body && body.id);
    return { ok: true };
  },

  async postPause({ homey, body }) {
    const ems = homey.app && homey.app.ems;
    if (!ems || !ems.hasDevice()) throw new Error('Energiemanagement nicht bereit');
    await ems.setModulePaused(body && body.module, body && body.paused === true);
    return { ok: true };
  },

  async postArm({ homey, body }) {
    const ems = homey.app && homey.app.ems;
    if (!ems || !ems.hasDevice()) throw new Error('Energiemanagement nicht bereit');
    await ems.setProgramArmed(body && body.id, body && body.on === true);
    return { ok: true };
  },

};
