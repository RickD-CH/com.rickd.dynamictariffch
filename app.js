'use strict';

const Homey = require('homey');

class DynamicTariffApp extends Homey.App {

  async onInit() {
    this.log('Dynamischer Stromtarif CH gestartet');
    this._registerFlowCards();
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

    this.homey.flow.getConditionCard('price_below')
      .registerRunListener(async (args) => args.device.conditionPriceBelow(args));

    this.homey.flow.getConditionCard('level_is')
      .registerRunListener(async (args) => args.device.conditionLevelIs(args));

    this.homey.flow.getActionCard('refresh')
      .registerRunListener(async (args) => args.device.actionRefresh());

    this.homey.flow.getActionCard('find_cheapest_block')
      .registerRunListener(async (args) => args.device.actionFindCheapestBlock(args));
  }

}

module.exports = DynamicTariffApp;
