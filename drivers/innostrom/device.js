'use strict';

const Homey = require('homey');
const { InnostromClient, InnostromError } = require('../../lib/InnostromClient');
const { PriceStore } = require('../../lib/PriceStore');
const {
  SLOT_MS, localParts, startOfLocalDay, addLocalDays, floorToSlot, windowAround, fromLocal,
} = require('../../lib/time');

// Backoff steps for a failed daily fetch (network/server errors) - see SPEC "Fehler".
const BACKOFF_MINUTES = [1, 2, 5, 10, 15];
// If tomorrow's prices still aren't complete, keep polling every 15 min until this local
// cut-off, then give up for the day (alarm_no_tomorrow / fallback price takes over).
const DAILY_RETRY_CUTOFF = { hour: 23, minute: 45 };
const DAILY_FETCH_TIME = { hour: 16, minute: 5 };
const NO_TOMORROW_ALARM_TIME = { hour: 18, minute: 30 };

function formatHHMM(date, tz) {
  const p = localParts(date, tz);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

function isAtOrAfterLocal(now, tz, { hour, minute }) {
  const p = localParts(now, tz);
  return p.hour > hour || (p.hour === hour && p.minute >= minute);
}

class InnostromDevice extends Homey.Device {

  async onInit() {
    this.tz = this.homey.clock.getTimezone() || 'Europe/Zurich';
    this._applySettings(this.getSettings());

    this.priceStore = PriceStore.fromJSON(this.getStoreValue('slots') || [], { field: this._priceField, tz: this.tz });

    this._tickTimer = null;
    this._dailyTimer = null;
    this._retryTimer = null;
    this._backoffIndex = 0;
    this._previousDisplayPrice = null;
    this._tomorrowWasFull = this.priceStore.hasFullDay(addLocalDays(new Date(), 1, this.tz));
    this._noTomorrowAlarmDate = null;

    this._triggerPriceChanged = this.homey.flow.getDeviceTriggerCard('price_changed');
    this._triggerTomorrowAvailable = this.homey.flow.getDeviceTriggerCard('tomorrow_available');
    this._triggerPriceBelow = this.homey.flow.getDeviceTriggerCard('price_below');
    this._triggerPriceAbove = this.homey.flow.getDeviceTriggerCard('price_above');
    this._triggerCheapestBlockStarts = this.homey.flow.getDeviceTriggerCard('cheapest_block_starts');
    this._triggerNoPricesForTomorrow = this.homey.flow.getDeviceTriggerCard('no_prices_for_tomorrow');

    await this._updateCapabilities(new Date());
    this._scheduleTick();
    this._scheduleDailyFetch();

    this._initialFetch().catch((err) => this.error('Initialabruf fehlgeschlagen:', err));
  }

  async onUninit() {
    this._clearTimers();
  }

  async onDeleted() {
    this._clearTimers();
  }

  _clearTimers() {
    if (this._tickTimer) this.homey.clearTimeout(this._tickTimer);
    if (this._dailyTimer) this.homey.clearTimeout(this._dailyTimer);
    if (this._retryTimer) this.homey.clearTimeout(this._retryTimer);
    this._tickTimer = null;
    this._dailyTimer = null;
    this._retryTimer = null;
  }

  _applySettings(settings) {
    this._environment = settings.environment === 'test' ? 'test' : 'production';
    this._priceField = ['integrated', 'electricity', 'grid'].includes(settings.price_field) ? settings.price_field : 'integrated';
    this._vatPercent = Number.isFinite(Number(settings.vat_percent)) ? Number(settings.vat_percent) : 8.1;
    this._fallbackPrice = Number(settings.fallback_price) > 0 ? Number(settings.fallback_price) : null;
    this._levelThresholds = {
      veryCheap: (Number(settings.level_very_cheap_percent) || 75) / 100,
      cheap: (Number(settings.level_cheap_percent) || 90) / 100,
      expensive: (Number(settings.level_expensive_percent) || 110) / 100,
      veryExpensive: (Number(settings.level_very_expensive_percent) || 125) / 100,
    };

    this.client = new InnostromClient({
      meteringCode: this.getData().id,
      token: settings.token,
      environment: this._environment,
      tz: this.tz,
    });
  }

  async onSettings({ newSettings, changedKeys }) {
    const credentialsChanged = ['token', 'environment'].some((k) => changedKeys.includes(k));
    this._applySettings(newSettings);
    if (this.priceStore) this.priceStore.field = this._priceField;

    if (credentialsChanged) {
      this._backoffIndex = 0;
      this._initialFetch().catch((err) => this.error('Neuabruf nach Settings-Änderung fehlgeschlagen:', err));
    } else {
      await this._updateCapabilities(new Date());
    }
  }

  // ---------------------------------------------------------------------
  // Fetching
  // ---------------------------------------------------------------------

  async _initialFetch() {
    const from = startOfLocalDay(new Date(), this.tz);
    const to = addLocalDays(from, 2, this.tz);
    try {
      await this._fetchRange(from, to);
      await this.setAvailable();
      this._backoffIndex = 0;
    } catch (err) {
      await this._handleFetchError(err, () => this._initialFetch());
      return;
    }
    await this._updateCapabilities(new Date());
  }

  async _runDailyFetch() {
    const tomorrow = addLocalDays(new Date(), 1, this.tz);
    const from = startOfLocalDay(tomorrow, this.tz);
    const to = addLocalDays(from, 1, this.tz);

    try {
      await this._fetchRange(from, to);
      await this.setAvailable();
      this._backoffIndex = 0;
    } catch (err) {
      await this._handleFetchError(err, () => this._runDailyFetch());
      return;
    }

    if (this.priceStore.hasFullDay(tomorrow)) {
      if (!this._tomorrowWasFull) {
        this._tomorrowWasFull = true;
        await this._fireTomorrowAvailable(tomorrow);
      }
      this._scheduleDailyFetch();
    } else if (!isAtOrAfterLocal(new Date(), this.tz, DAILY_RETRY_CUTOFF)) {
      this._retryTimer = this.homey.setTimeout(() => this._runDailyFetch(), 15 * 60 * 1000);
    } else {
      this._scheduleDailyFetch();
    }

    await this._updateCapabilities(new Date());
  }

  /** Fetches [from, to), stores the slots and persists. Throws InnostromError on failure. */
  async _fetchRange(from, to) {
    const { slots } = await this.client.getPrices({ from, to, tariffType: 'all' });
    this.priceStore.upsert(slots);
    this.priceStore.prune(startOfLocalDay(addLocalDays(new Date(), -1, this.tz), this.tz));
    await this.setStoreValue('slots', this.priceStore.toJSON());
  }

  async _handleFetchError(err, retryFn) {
    if (err instanceof InnostromError && err.code === 'AUTH') {
      await this.setUnavailable(this.homey.__('device.unavailableAuth'));
      return;
    }
    if (err instanceof InnostromError && err.retryable) {
      const minutes = BACKOFF_MINUTES[Math.min(this._backoffIndex, BACKOFF_MINUTES.length - 1)];
      this._backoffIndex += 1;
      this._retryTimer = this.homey.setTimeout(() => retryFn(), minutes * 60 * 1000);
      this.error(`Abruf fehlgeschlagen (${err.code}), neuer Versuch in ${minutes} Min.:`, err.message);
      return;
    }
    this.error('Abruf fehlgeschlagen:', err);
  }

  async actionRefresh() {
    await this._initialFetch();
    return true;
  }

  // ---------------------------------------------------------------------
  // Scheduling
  // ---------------------------------------------------------------------

  _scheduleTick() {
    if (this._tickTimer) this.homey.clearTimeout(this._tickTimer);
    const now = Date.now();
    const nextSlot = Math.ceil((now + 1) / SLOT_MS) * SLOT_MS;
    const ms = nextSlot - now + 2000;
    this._tickTimer = this.homey.setTimeout(() => {
      this._onTick().catch((err) => this.error('Tick fehlgeschlagen:', err));
      this._scheduleTick();
    }, ms);
  }

  _scheduleDailyFetch() {
    if (this._dailyTimer) this.homey.clearTimeout(this._dailyTimer);
    if (this._retryTimer) {
      this.homey.clearTimeout(this._retryTimer); this._retryTimer = null;
    }

    const now = new Date();
    const p = localParts(now, this.tz);
    let target = fromLocal(p.year, p.month, p.day, DAILY_FETCH_TIME.hour, DAILY_FETCH_TIME.minute, this.tz);
    if (target <= now) target = addLocalDays(target, 1, this.tz);

    this._dailyTimer = this.homey.setTimeout(() => {
      this._runDailyFetch().catch((err) => this.error('Täglicher Abruf fehlgeschlagen:', err));
    }, target.getTime() - now.getTime());
  }

  async _onTick() {
    const now = new Date();
    await this._updateCapabilities(now);
    await this._checkCheapestBlockStarts(now);
  }

  // ---------------------------------------------------------------------
  // Capabilities / triggers
  // ---------------------------------------------------------------------

  _toDisplay(chfPerKwh) {
    let v = chfPerKwh;
    if (v === null || v === undefined) {
      if (this._fallbackPrice === null || Number.isNaN(this._fallbackPrice)) return null;
      v = this._fallbackPrice;
    }
    const rappen = v * (1 + this._vatPercent / 100) * 100;
    return Math.round(rappen * 100) / 100;
  }

  async _updateCapabilities(now) {
    const cur = this.priceStore.at(now);
    const next = this.priceStore.next(now);
    const tomorrow = addLocalDays(now, 1, this.tz);

    const total = this._toDisplay(cur ? cur.integrated : null);
    await this._setCapabilitySafe('measure_price_total', total);
    await this._setCapabilitySafe('measure_price_energy', this._toDisplay(cur ? cur.electricity : null));
    await this._setCapabilitySafe('measure_price_grid', this._toDisplay(cur ? cur.dso : null));
    await this._setCapabilitySafe('measure_price_next', this._toDisplay(next ? next.integrated : null));

    const stats = this.priceStore.dayStats(now);
    await this._setCapabilitySafe('measure_price_min_today', stats ? this._toDisplay(stats.min) : null);
    await this._setCapabilitySafe('measure_price_max_today', stats ? this._toDisplay(stats.max) : null);
    await this._setCapabilitySafe('measure_price_avg_today', stats ? this._toDisplay(stats.avg) : null);

    await this._setCapabilitySafe('price_rank_today', this.priceStore.rankToday(now));

    const level = this.priceStore.level(now, this._levelThresholds);
    await this._setCapabilitySafe('price_level', level);

    const tomorrowFull = this.priceStore.hasFullDay(tomorrow);
    const shouldAlarm = !tomorrowFull && isAtOrAfterLocal(now, this.tz, NO_TOMORROW_ALARM_TIME);
    await this._setCapabilitySafe('alarm_no_tomorrow', shouldAlarm);

    const today = localParts(now, this.tz);
    const todayKey = `${today.year}-${today.month}-${today.day}`;
    if (shouldAlarm && this._noTomorrowAlarmDate !== todayKey) {
      this._noTomorrowAlarmDate = todayKey;
      this._triggerNoPricesForTomorrow.trigger(this, {}, {}).catch((err) => this.error('Trigger no_prices_for_tomorrow fehlgeschlagen:', err));
    }
    if (!shouldAlarm) this._noTomorrowAlarmDate = null;

    const rank = this.getCapabilityValue('price_rank_today');
    if (total !== this._previousDisplayPrice) {
      this._triggerPriceChanged.trigger(this, { price: total ?? 0, level: level || 'normal', rank: rank ?? 0 }, {})
        .catch((err) => this.error('Trigger price_changed fehlgeschlagen:', err));

      const state = { price: total, previousPrice: this._previousDisplayPrice };
      this._triggerPriceBelow.trigger(this, { price: total ?? 0 }, state).catch((err) => this.error('Trigger price_below fehlgeschlagen:', err));
      this._triggerPriceAbove.trigger(this, { price: total ?? 0 }, state).catch((err) => this.error('Trigger price_above fehlgeschlagen:', err));
      this._previousDisplayPrice = total;
    }
  }

  async _setCapabilitySafe(id, value) {
    if (!this.hasCapability(id)) return;
    try {
      await this.setCapabilityValue(id, value === undefined ? null : value);
    } catch (err) {
      this.error(`Capability ${id} konnte nicht gesetzt werden:`, err);
    }
  }

  async _fireTomorrowAvailable(tomorrow) {
    const from = startOfLocalDay(tomorrow, this.tz);
    const to = addLocalDays(from, 1, this.tz);
    const stats = this.priceStore.stats(from, to);
    if (!stats) return;
    const cheapest = this.priceStore.cheapestSlots(from, to, 1)[0];
    await this._triggerTomorrowAvailable.trigger(this, {
      min: this._toDisplay(stats.min),
      max: this._toDisplay(stats.max),
      avg: this._toDisplay(stats.avg),
      cheapest_start: cheapest ? formatHHMM(cheapest.start, this.tz) : '',
    }, {}).catch((err) => this.error('Trigger tomorrow_available fehlgeschlagen:', err));
  }

  async _checkCheapestBlockStarts(now) {
    let argSets;
    try {
      argSets = await this._triggerCheapestBlockStarts.getArgumentValues(this);
    } catch (err) {
      return; // no Flows use this card for this device yet
    }
    const seen = new Set();
    const slotStart = floorToSlot(now).getTime();
    for (const args of argSets) {
      const key = `${args.hours}|${args.from}|${args.to}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const durationSlots = Math.round(Number(args.hours) * 4);
      if (!(durationSlots > 0)) continue;
      let window;
      try {
        window = windowAround(now, args.from, args.to, this.tz);
      } catch (err) {
        continue;
      }
      const block = this.priceStore.cheapestBlock(window.from, window.to, durationSlots);
      if (!block || block.start.getTime() !== slotStart) continue;

      await this._triggerCheapestBlockStarts.trigger(this, {
        avg: this._toDisplay(block.avg),
        end: formatHHMM(block.end, this.tz),
      }, { hours: Number(args.hours), from: args.from, to: args.to })
        .catch((err) => this.error('Trigger cheapest_block_starts fehlgeschlagen:', err));
    }
  }

  // ---------------------------------------------------------------------
  // Conditions / actions (called from app.js run listeners)
  // ---------------------------------------------------------------------

  conditionIsAmongCheapest(args) {
    return this._amongCondition(args, this.homey.__('device.logAmongCheapestIncomplete'), (store, from, to, count) => store.isAmongCheapest(new Date(), from, to, count));
  }

  conditionIsAmongMostExpensive(args) {
    return this._amongCondition(args, this.homey.__('device.logAmongMostExpensiveIncomplete'), (store, from, to, count) => store.isAmongMostExpensive(new Date(), from, to, count));
  }

  _amongCondition(args, incompleteLogMessage, fn) {
    const count = Math.round(Number(args.hours) * 4);
    const result = fn(this.priceStore, args.from, args.to, count);
    if (result === null) {
      this.log(incompleteLogMessage);
      return false;
    }
    return result;
  }

  conditionIsInCheapestBlock(args) {
    const now = new Date();
    const durationSlots = Math.round(Number(args.hours) * 4);
    const window = windowAround(now, args.from, args.to, this.tz);
    const expected = Math.round((window.to - window.from) / SLOT_MS);
    const have = this.priceStore.range(window.from, window.to).filter((s) => this.priceStore.value(s) !== null).length;
    if (have < expected) {
      this.log(this.homey.__('device.logInCheapestBlockIncomplete'));
      return false;
    }
    const block = this.priceStore.cheapestBlock(window.from, window.to, durationSlots);
    if (!block) return false;
    return floorToSlot(now).getTime() >= block.start.getTime() && floorToSlot(now).getTime() < block.end.getTime();
  }

  conditionPriceBelow(args) {
    const cur = this.priceStore.at(new Date());
    const price = this._toDisplay(this.priceStore.value(cur));
    return price !== null && price < Number(args.price);
  }

  conditionLevelIs(args) {
    const level = this.priceStore.level(new Date(), this._levelThresholds);
    return level === args.level;
  }

  async actionFindCheapestBlock(args) {
    const now = new Date();
    const durationSlots = Math.round(Number(args.hours) * 4);
    const window = windowAround(now, args.from, args.to, this.tz);
    const block = this.priceStore.cheapestBlock(window.from, window.to, durationSlots);
    if (!block) throw new Error(this.homey.__('device.errorNoCheapestBlock'));
    return {
      start: formatHHMM(block.start, this.tz),
      end: formatHHMM(block.end, this.tz),
      avg: this._toDisplay(block.avg),
    };
  }

}

module.exports = InnostromDevice;
