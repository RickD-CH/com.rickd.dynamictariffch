'use strict';

const Homey = require('homey');
const { EmsController } = require('./lib/ems/EmsController');
const { MeterReader } = require('./lib/MeterReader');
const { diagLog } = require('./lib/Diagnostics');

class DynamicTariffApp extends Homey.App {

  async onInit() {
    // Letzte Meldungen für den Diagnose-Bericht (nur im Arbeitsspeicher); darf die App nie am Starten hindern
    try { diagLog.attachConsole(); } catch (err) { /* ohne Diagnose-Log weiter */ }
    this.log('Dynamischer Stromtarif CH gestartet');
    this._registerFlowCards();
    this.ems = new EmsController(this);
    this.ems.start();
    this.meters = new MeterReader(this);
    this.meters.start();
  }

  async onUninit() {
    if (this.ems) this.ems.stop();
    if (this.meters) this.meters.stop();
  }

  _registerFlowCards() {
    // price_changed / tomorrow_available / no_prices_for_tomorrow have no args besides the
    // device picker, so no run listener is needed - every Flow using them always matches.

    this.homey.flow.getDeviceTriggerCard('price_below')
      .registerRunListener(async (args, state) => {
        if (state.previousPrice == null || state.price == null) return false;
        return state.previousPrice >= args.price && state.price < args.price;
      });

    this.homey.flow.getDeviceTriggerCard('price_above')
      .registerRunListener(async (args, state) => {
        if (state.previousPrice == null || state.price == null) return false;
        return state.previousPrice <= args.price && state.price > args.price;
      });

    // Tokens (avg/end) depend on this card's own hours/from/to, which trigger() can't vary
    // per Flow. device.js instead calls getArgumentValues() to fire once per distinct
    // argument combination with matching tokens - this listener just confirms the args
    // that reached this particular Flow are the ones that combination was fired for.
    this.homey.flow.getDeviceTriggerCard('cheapest_block_starts')
      .registerRunListener(async (args, state) => (
        Number(args.hours) === state.hours && args.from === state.from && args.to === state.to
      ));

    this.homey.flow.getConditionCard('is_among_cheapest')
      .registerRunListener(async (args) => args.device.conditionIsAmongCheapest(args));

    this.homey.flow.getConditionCard('is_among_most_expensive')
      .registerRunListener(async (args) => args.device.conditionIsAmongMostExpensive(args));

    this.homey.flow.getConditionCard('is_in_cheapest_block')
      .registerRunListener(async (args) => args.device.conditionIsInCheapestBlock(args));

    this.homey.flow.getConditionCard('price_is_below')
      .registerRunListener(async (args) => args.device.conditionPriceBelow(args));

    this.homey.flow.getConditionCard('reports_missing')
      .registerRunListener(async (args) => args.device.conditionReportsMissing());

    this.homey.flow.getConditionCard('level_is')
      .registerRunListener(async (args) => args.device.conditionLevelIs(args));

    this.homey.flow.getActionCard('refresh')
      .registerRunListener(async (args) => args.device.actionRefresh());

    this.homey.flow.getActionCard('find_cheapest_block')
      .registerRunListener(async (args) => args.device.actionFindCheapestBlock(args));

    this.homey.flow.getActionCard('find_cheapest_block_from_now')
      .registerRunListener(async (args) => args.device.actionFindCheapestBlockFromNow(args));

    this.homey.flow.getActionCard('find_cheapest_block_within')
      .registerRunListener(async (args) => args.device.actionFindCheapestBlockWithin(args));

    [
      ['report_grid_import', 'import'],
      ['report_grid_export', 'export'],
      ['report_battery_charge', 'battery_charge'],
      ['report_battery_discharge', 'battery_discharge'],
    ].forEach(([cardId, kind]) => {
      this.homey.flow.getActionCard(cardId)
        .registerRunListener(async (args) => args.device.actionReportCounter(kind, args.kwh));
    });

    this.homey.flow.getActionCard('report_consumer')
      .registerRunListener(async (args) => args.device.actionReportConsumer(args.name, args.kwh));

    this.homey.flow.getActionCard('get_prices_today')
      .registerRunListener(async (args) => args.device.actionGetPricesToday());

    // Energiemanagement (Gerät "Energiemanagement"): Bedingung auf den aktuellen Modus.
    // Sofortladen und Ein/Aus sind Capabilities des Geräts, ihre Flow-Karten erzeugt Homey selbst.
    this.homey.flow.getActionCard('ems_set_pv_forecast')
      .registerRunListener(async (args) => {
        this.ems.setPvForecast(args.data); return true;
      });
    this.homey.flow.getActionCard('ems_set_pv_factor')
      .registerRunListener(async (args) => {
        this.ems.setPvFactor(args.factor); return true;
      });

    this.homey.flow.getActionCard('ems_module_start')
      .registerRunListener(async (args) => {
        const r = await this.ems.startModuleNow(args.module);
        if (!r.started) throw new Error(`Nicht gestartet: ${r.reason}`);
        return true;
      });

    // Programm-Geräte (Geschirrspüler, Waschmaschine, Tumbler) und Module per Flow, wie im Widget
    const consumerItems = (onlyProgram) => async (query) => {
      const q = String(query || '').trim().toLowerCase();
      const list = (this.ems.getConfig().consumers || []).filter((c) => c.enabled && (!onlyProgram || c.mode === 'program'));
      return list.map((c) => ({ id: c.id, name: c.name })).filter((i) => !q || i.name.toLowerCase().includes(q));
    };
    for (const [kind, id, onlyProgram] of [['Action', 'ems_program_start', true], ['Action', 'ems_program_arm', true], ['Condition', 'ems_program_armed', true], ['Condition', 'ems_consumer_running', false]]) {
      this.homey.flow[`get${kind}Card`](id).registerArgumentAutocompleteListener('consumer', consumerItems(onlyProgram));
    }
    this.homey.flow.getActionCard('ems_program_start')
      .registerRunListener(async (args) => this.ems.startProgramNow(args.consumer && args.consumer.id));
    this.homey.flow.getActionCard('ems_program_arm')
      .registerRunListener(async (args) => {
        const w = Number(args.wait);
        return this.ems.setProgramArmed(args.consumer && args.consumer.id, args.mode === 'on', Number.isFinite(w) && w > 0 ? w : null);
      });
    this.homey.flow.getActionCard('ems_module_pause')
      .registerRunListener(async (args) => this.ems.setModulePaused(args.module, args.mode === 'pause', false));
    this.homey.flow.getConditionCard('ems_program_armed')
      .registerRunListener(async (args) => {
        const st = this.ems.runner && this.ems.runner.consumerStates.get(args.consumer && args.consumer.id);
        return !!(st && st.programArmed);
      });
    this.homey.flow.getConditionCard('ems_module_paused')
      .registerRunListener(async (args) => !!(this.ems.runner && this.ems.runner.paused && this.ems.runner.paused[args.module]));
    this.homey.flow.getConditionCard('ems_consumer_running')
      .registerRunListener(async (args) => {
        const cur = ((this.ems.runner && this.ems.runner.consumerCurrent) || []).find((c) => c.id === (args.consumer && args.consumer.id));
        return !!(cur && cur.isOn);
      });

    // Befehle an Geräte: ein Auslöser, den der Nutzer mit der Karte seines Geräts verbindet (Apps dürfen keine fremden Karten ausführen)
    const commandCard = this.homey.flow.getTriggerCard('ems_command');
    commandCard.registerRunListener(async (args, state) => !!(args && args.command && state && args.command.id === state.id));
    commandCard.registerArgumentAutocompleteListener('command', async (query) => this.ems.commandItems(query));

    this.homey.flow.getActionCard('ems_set_silent')
      .registerRunListener(async (args) => {
        this.ems.setSilent(args.mode === 'on'); return true;
      });
    this.homey.flow.getActionCard('ems_car_set_target')
      .registerRunListener(async (args) => {
        this.ems.setCarTarget({
          day: args.day, soc: args.soc, time: args.time, charge: args.charge !== 'no',
        }); return true;
      });
    this.homey.flow.getActionCard('ems_car_clear_target')
      .registerRunListener(async () => {
        this.ems.clearCarTarget(); return true;
      });
    this.homey.flow.getConditionCard('ems_silent_is_on')
      .registerRunListener(async () => this.ems.getConfig().silent === true);
    this.homey.flow.getActionCard('ems_charge_now_set')
      .registerRunListener(async (args) => this.ems.setChargeNow(args.mode === 'on'));
    this.homey.flow.getConditionCard('ems_charge_now_is_on')
      .registerRunListener(async () => this.ems.getConfig().charger.chargeNow === true);
    this.homey.flow.getActionCard('ems_backup_reserve_set')
      .registerRunListener(async (args) => this.ems.setBackupReserve(args.mode === 'on'));
    this.homey.flow.getConditionCard('ems_backup_reserve_is_on')
      .registerRunListener(async () => this.ems.getConfig().battery.backupReserve.active === true);

    this.homey.flow.getConditionCard('ems_sgready_is')
      .registerRunListener(async (args) => {
        const cur = this.ems.runner && this.ems.runner.sgReadyCurrent;
        return !!cur && ({ off: 'normal', boost: 'boost', forced: 'forced' })[cur.state] === args.state;
      });
    this.homey.flow.getConditionCard('ems_dhw_is_running')
      .registerRunListener(async () => !!(this.ems.runner && this.ems.runner.dhwCurrent && this.ems.runner.dhwCurrent.on));

    this.homey.flow.getConditionCard('ems_mode_is')
      .registerRunListener(async (args) => args.device.getCapabilityValue('ems_mode') === args.mode);

    this.homey.flow.getActionCard('get_prices_tomorrow')
      .registerRunListener(async (args) => args.device.actionGetPricesTomorrow());
  }

}

module.exports = DynamicTariffApp;
