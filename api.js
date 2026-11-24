'use strict';

const { sanitizeRefPeriods } = require('./lib/CostTracker');
const { addPlan } = require('./lib/ShadowPlan');
const { normalizeHourlyOutput, parseHourlyOutput } = require('./lib/HourlyOutput');
const { normalizeHours, GRID_KINDS } = require('./lib/StatusRules');
const { diagLog, makeRedactor, buildReport } = require('./lib/Diagnostics');

/** All four grid kinds as booleans (missing = on). */
const monitorKinds = (v) => Object.fromEntries(GRID_KINDS.map((k) => [k, !(v && typeof v === 'object' && v[k] === false)]));

const pick = (o, path) => path.split('.').reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o);

// Shows the first paired innostrom device - same simplification as the widget's api.js.
function firstDevice(homey) {
  const devices = homey.drivers.getDriver('innostrom').getDevices();
  return devices[0] || null;
}

module.exports = {

  // --- Zählerstände automatisch lesen ---
  async getMeters({ homey }) {
    return homey.app.meters.getStatus();
  },

  async putMeters({ homey, body }) {
    homey.app.meters.putConfig(body);
    return homey.app.meters.getStatus();
  },

  async postMetersRun({ homey }) {
    await homey.app.meters.readOnce();
    return homey.app.meters.getStatus();
  },

  async getMetersDevices({ homey }) {
    return { devices: await homey.app.meters.listDevices() };
  },

  // --- Diagnose zum Kopieren (anonymisiert, wird nicht automatisch gesendet) ---
  async getDiagnostics({ homey }) {
    const names = [];
    const add = (name, label) => { if (typeof name === 'string' && name.trim()) names.push({ name, label }); };
    let config = {};
    try { config = homey.app.ems.getConfig() || {}; } catch (err) { config = {}; }
    (config.consumers || []).forEach((c, i) => {
      add(c.name, `Verbraucher ${i + 1}`);
      add(c.flowOn && c.flowOn.name, `Flow v${i + 1}a`);
      add(c.flowOff && c.flowOff.name, `Flow v${i + 1}b`);
    });
    const flowNames = [pick(config, 'dhw.flowOn'), pick(config, 'dhw.flowOff'), pick(config, 'dhw.delay.flowDelay'),
      pick(config, 'sgready.flowBoost'), pick(config, 'sgready.flowNormal'), pick(config, 'sgready.flowForced')]
      .map((f) => f && f.name).filter(Boolean);
    flowNames.forEach((n, i) => add(n, `Flow ${i + 1}`));
    try {
      const devs = await homey.app.ems.listDevices();
      devs.forEach((d, i) => add(d.name, `Gerät ${i + 1}`));
    } catch (err) { /* ohne Geräteliste: nur die übrigen Namen */ }
    const secrets = [];
    const priceDevices = [];
    try {
      for (const d of homey.drivers.getDriver('innostrom').getDevices()) {
        const settings = d.getSettings() || {};
        if (settings.token) secrets.push(String(settings.token), String(settings.token).slice(-4));
        const code = d.getData() && d.getData().id;
        if (code) secrets.push(String(code));
        add(d.getName(), 'Preis-Gerät');
        priceDevices.push({ settings });
      }
    } catch (err) { /* ohne Preis-Gerät */ }
    // Die letzten vier Zeichen allein sind zu kurz zum Ersetzen und kein Geheimnis; nur das ganze Token wird ersetzt
    const redact = makeRedactor({ names, secrets: secrets.filter((s) => s.length > 4) });
    const text = buildReport({
      info: {
        appVersion: homey.manifest && homey.manifest.version,
        homeyVersion: homey.version,
        platform: homey.platform,
        language: homey.i18n && homey.i18n.getLanguage ? homey.i18n.getLanguage() : null,
        tz: homey.clock && homey.clock.getTimezone ? homey.clock.getTimezone() : 'Europe/Zurich',
        now: Date.now(),
      },
      config,
      priceDevices,
      logs: diagLog.recent(120),
      redact,
    });
    return { text, lines: text.split('\n').length };
  },

  // --- EMS (Energiemanagement) ---
  async getEmsShadow({ homey }) {
    return homey.app.ems.getShadow();
  },

  async getEmsPlan({ homey }) {
    return homey.app.ems.getPlan();
  },

  async getEmsJobs({ homey }) {
    return homey.app.ems.listJobs();
  },

  async postEmsJob({ homey, body }) {
    return homey.app.ems.saveJob(body);
  },

  async deleteEmsJob({ homey, params }) {
    return homey.app.ems.deleteJob(params && params.id);
  },

  async postEmsPlanPreview({ homey, body }) {
    return homey.app.ems.previewPlan(body);
  },

  async postEmsCommandTest({ homey, body }) {
    return homey.app.ems.testCommand(body && body.id);
  },

  async postEmsResetLedger({ homey }) {
    return homey.app.ems.resetLedger();
  },

  async postEmsResetData({ homey }) {
    return homey.app.ems.resetData();
  },

  async postEmsRun({ homey }) {
    await homey.app.ems.runNow();
    return homey.app.ems.getShadow();
  },

  async getEmsConfig({ homey }) {
    return homey.app.ems.getConfig();
  },

  async putEmsConfig({ homey, body }) {
    return homey.app.ems.putConfig(body);
  },

  async putEmsToggle({ homey, body }) {
    return homey.app.ems.setLive(body && body.target, body && body.live === true);
  },

  async getEmsDevices({ homey }) {
    return { devices: await homey.app.ems.listDevices() };
  },

  async getEmsFlows({ homey }) {
    return { flows: await homey.app.ems.listFlows() };
  },

  async getEmsRefCheck({ homey, query }) {
    const ems = homey.app.ems;
    return query && query.fresh === "1" ? ems.checkRefs() : ems.refCheckResult();
  },

  async postEmsRefClear({ homey, body }) {
    return homey.app.ems.clearRef(body && body.key);
  },

  async getEmsRefCheck({ homey, query }) {
    const ems = homey.app.ems;
    return query && query.fresh === '1' ? ems.checkRefs() : ems.refCheckResult();
  },

  async postEmsRefClear({ homey, body }) {
    return homey.app.ems.clearRef(body && body.key);
  },

  async getEmsCommandFlows({ homey }) {
    return homey.app.ems.commandFlowStatus();
  },

  async getEmsConsumers({ homey }) {
    const r = homey.app.ems.runner;
    return {
      current: r ? r.consumerCurrent : [], events: r ? r.consumerEvents.slice(-60).reverse() : [], batteryEvents: r && r.batteryEvents ? r.batteryEvents.slice(-50).reverse() : [], fuseEvents: r && r.fuseEvents ? r.fuseEvents.slice(-50).reverse() : [],
    };
  },

  async putEmsPvHistory({ homey, body }) {
    return homey.app.ems.importPvHistory(body && body.days);
  },

  async getEmsDeviceCards({ homey, query }) {
    return homey.app.ems.deviceCards(query && query.id);
  },

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

  async testDigest({ homey }) {
    const device = firstDevice(homey);
    if (!device) throw new Error('No device paired');
    return device.testDigest();
  },

  async testReportsMissing({ homey }) {
    const device = firstDevice(homey);
    if (!device) throw new Error('No device paired');
    return device.testReportsMissing();
  },

  async getStatus({ homey }) {
    const device = firstDevice(homey);
    if (!device) return { paired: false };
    return { paired: true, ...device.getStatus() };
  },

  async getBackupStatus({ homey }) {
    const device = firstDevice(homey);
    if (!device) return { paired: false };
    return { paired: true, ...device.getBackupStatus() };
  },

  async saveBackup({ homey }) {
    const device = firstDevice(homey);
    if (!device) throw new Error('No device paired');
    const done = await device.writeBackup();
    return { saved: Boolean(done), ...(done || {}) };
  },

  async exportBackup({ homey }) {
    const device = firstDevice(homey);
    if (!device) throw new Error('No device paired');
    return device.exportBackup();
  },

  async inspectBackup({ homey, body }) {
    const device = firstDevice(homey);
    if (!device) throw new Error('No device paired');
    return device.inspectBackup(body && body.text);
  },

  async restoreBackup({ homey, body }) {
    const device = firstDevice(homey);
    if (!device) throw new Error('No device paired');
    return device.restoreBackup(body || {});
  },

  async getPrices({ homey }) {
    const device = firstDevice(homey);
    if (!device) return { paired: false };
    return { paired: true, name: device.getName(), ...device.getPriceTable() };
  },

  async getShadow({ homey }) {
    const device = firstDevice(homey);
    if (!device) return { paired: false };
    // Mit Energiemanagement: Spalte «Fahrplan (Modell)» aus der Franken-Auswertung
    const { ems } = homey.app;
    const ledger = ems && ems.runner && ems.runner.ledger ? ems.runner.ledger.days : null;
    return { paired: true, ...addPlan(device.getShadow(), ems && ems.hasDevice && ems.hasDevice() ? ledger : null) };
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
      hourlyOutput: normalizeHourlyOutput(homey.settings.get('hourly_output')),
      monitorHours: normalizeHours(homey.settings.get('monitor_hours')),
      monitorNotify: homey.settings.get('monitor_notify') !== false,
      monitorKinds: monitorKinds(homey.settings.get('monitor_kinds')),
      monitorConsumers: Array.isArray(homey.settings.get('monitor_consumers')) ? homey.settings.get('monitor_consumers') : [],
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
    if (body && body.monitorHours !== undefined) {
      const h = Number(body.monitorHours);
      if (!Number.isFinite(h) || h < 0 || h > 48) throw new Error('Invalid monitoring threshold');
      homey.settings.set('monitor_hours', normalizeHours(h));
      out.monitorHours = homey.settings.get('monitor_hours');
    }
    if (body && body.monitorKinds !== undefined) {
      if (!body.monitorKinds || typeof body.monitorKinds !== 'object' || Array.isArray(body.monitorKinds)) throw new Error('Invalid monitored meters');
      homey.settings.set('monitor_kinds', monitorKinds(body.monitorKinds));
      out.monitorKinds = homey.settings.get('monitor_kinds');
    }
    if (body && body.monitorConsumers !== undefined) {
      const list = body.monitorConsumers;
      if (!Array.isArray(list) || list.length > 6 || !list.every((n) => typeof n === 'string' && n.length > 0 && n.length <= 30)) throw new Error('Invalid monitored consumers');
      homey.settings.set('monitor_consumers', list);
      out.monitorConsumers = list;
    }
    if (body && body.monitorNotify !== undefined) {
      homey.settings.set('monitor_notify', Boolean(body.monitorNotify));
      out.monitorNotify = Boolean(body.monitorNotify);
    }
    if (body && body.hourlyOutput !== undefined) {
      homey.settings.set('hourly_output', parseHourlyOutput(body.hourlyOutput));
      out.hourlyOutput = homey.settings.get('hourly_output');
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
      const old = homey.settings.get('battery_params') || {};
      const limit = (given, kept, dflt) => {
        if (given !== undefined) return Number(given);
        return kept !== undefined ? kept : dflt;
      };
      const minSoc = limit(body.battery.minSocPct, old.minSocPct, 5);
      const maxSoc = limit(body.battery.maxSocPct, old.maxSocPct, 90);
      if (!(cap > 0 && cap <= 100) || !(pow > 0 && pow <= 50) || !(eff > 0.5 && eff <= 1)) throw new Error('Invalid battery');
      if (!(minSoc >= 0 && minSoc <= 50) || !(maxSoc >= 50 && maxSoc <= 100)) throw new Error('Invalid charge limits');
      homey.settings.set('battery_params', {
        capacityKwh: Math.round(cap * 10) / 10,
        powerKw: Math.round(pow * 10) / 10,
        roundTrip: Math.round(eff * 1000) / 1000,
        minSocPct: Math.round(minSoc),
        maxSocPct: Math.round(maxSoc),
      });
      out.battery = homey.settings.get('battery_params');
    }
    return out;
  },

  async getSummary({ homey }) {
    const device = firstDevice(homey);
    if (!device) return { paired: false };
    device.ensureFresh();

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
