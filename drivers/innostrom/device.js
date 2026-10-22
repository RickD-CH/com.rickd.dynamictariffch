'use strict';

const Homey = require('homey');
const { InnostromClient, InnostromError } = require('../../lib/InnostromClient');
const { PriceStore } = require('../../lib/PriceStore');
const {
  CostTracker, normalizeRefs, refForDay, refImportPrice,
} = require('../../lib/CostTracker');
const { analyzeDay } = require('../../lib/ShadowBattery');
const { buildDayTable } = require('../../lib/PriceTable');
const { normalizeHourlyOutput, formatHourlyPrice } = require('../../lib/HourlyOutput');
const CostBackup = require('../../lib/CostBackup');
const {
  SLOT_MS, localParts, localDateKey, startOfLocalDay, addLocalDays, floorToSlot, windowAround, fromLocal, parseHHMM,
} = require('../../lib/time');

// Backoff steps for a failed daily fetch (network/server errors) - see SPEC "Fehler".
const BACKOFF_MINUTES = [1, 2, 5, 10, 15];
// Stop escalating after this many consecutive failures and wait for the next regularly
// scheduled attempt instead - a permanently broken API must not turn into an unbounded
// 15-minutely request stream. Matches EWHGOF/SwisspowerDynPreis's BACKOFF_MAX_TRIES.
const BACKOFF_MAX_TRIES = 6;
// If tomorrow's prices still aren't complete, keep polling every 15 min until this local
// cut-off, then give up for the day (alarm_no_tomorrow / fallback price takes over).
const DAILY_RETRY_CUTOFF = { hour: 23, minute: 45 };
const DAILY_FETCH_TIME = { hour: 16, minute: 5 };
const NO_TOMORROW_ALARM_TIME = { hour: 18, minute: 30 };
// A day counts as "published" once this share of it has prices, not only at exactly
// 100%: a supplier that permanently drops a single slot must not be hunted forever and
// must not raise a false alarm_no_tomorrow. Same idea and value as
// EWHGOF/SwisspowerDynPreis's TOMORROW_COVERAGE_RATIO.
const TOMORROW_COVERAGE_RATIO = 0.95;

function formatHHMM(date, tz) {
  const p = localParts(date, tz);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

function formatDateTime(date, tz) {
  const p = localParts(date, tz);
  return `${String(p.day).padStart(2, '0')}.${String(p.month).padStart(2, '0')}. ${formatHHMM(date, tz)}`;
}

// Next occurrence of toHHMM strictly after `now` - today if that time is still ahead,
// otherwise tomorrow. Unlike windowAround this has no "from" side to wrap around.
function resolveUntil(now, toHHMM, tz) {
  const t = parseHHMM(toHHMM);
  const bp = localParts(now, tz);
  const today = fromLocal(bp.year, bp.month, bp.day, t.hour, t.minute, tz);
  return today > now ? today : addLocalDays(today, 1, tz);
}

function isAtOrAfterLocal(now, tz, { hour, minute }) {
  const p = localParts(now, tz);
  return p.hour > hour || (p.hour === hour && p.minute >= minute);
}

class InnostromDevice extends Homey.Device {

  async onInit() {
    await this._migrateCapabilities();

    this.tz = this.homey.clock.getTimezone() || 'Europe/Zurich';
    this._applySettings(this.getSettings());

    this.priceStore = PriceStore.fromJSON(this.getStoreValue('slots') || [], { field: this._priceField, tz: this.tz });

    this.costTracker = CostTracker.fromJSON(this.getStoreValue('cost'), { tz: this.tz });
    this._costTimer = null;
    this._backupTimer = null;
    this._restoring = false;

    this._onAppSetting = (key) => {
      if (this._restoring) return;
      if (key === 'feed_in_mode' || key === 'ref_periods') {
        // Stored per-day prices include the feed-in price: recompute them with the new setting.
        this.costTracker.dayPrices = {};
        const now = new Date();
        this.costTracker.ensureDayPrices(localDateKey(now, this.tz), now, (st) => this._costPricesAt(st));
        this._markCostDirty();
        return;
      }
      if (key !== 'vat_percent') return;
      this._vatPercent = this._readVat(this.getSettings());
      this._updateCapabilities(new Date()).catch((err) => this.error('MWST-Update fehlgeschlagen:', err));
    };
    this.homey.settings.on('set', this._onAppSetting);

    this._tickTimer = null;
    this._dailyTimer = null;
    this._retryTimer = null;
    this._backoffIndex = 0;
    this._previousDisplayPrice = null;
    this._tomorrowWasFull = this.priceStore.hasFullDay(addLocalDays(new Date(), 1, this.tz), { ratio: TOMORROW_COVERAGE_RATIO });
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

    this._scheduleBackup();
    this._initialFetch().catch((err) => this.error('Initialabruf fehlgeschlagen:', err));
  }

  /**
   * A driver's `capabilities` list in driver.compose.json only applies to newly paired
   * devices - it does not retroactively reach devices paired before a capability was
   * added (e.g. button/last_update, added after this device already existed). Adds
   * whatever the manifest declares that this specific device instance is still missing.
   */
  async _migrateCapabilities() {
    // The tile's refresh button was dropped: the Flow card "Reload prices now" remains, and the
    // settings page reloads missing prices by itself.
    if (this.hasCapability('button')) {
      await this.removeCapability('button').catch((err) => this.error('Capability button konnte nicht entfernt werden:', err));
    }
    const declared = (this.driver.manifest && this.driver.manifest.capabilities) || [];
    for (const capabilityId of declared) {
      if (!this.hasCapability(capabilityId)) {
        await this.addCapability(capabilityId).catch((err) => this.error(`Capability ${capabilityId} konnte nicht nachgerüstet werden:`, err));
      }
    }
  }

  async onUninit() {
    this.homey.settings.removeListener('set', this._onAppSetting);
    this._clearTimers();
    await this._flushCost();
  }

  async onDeleted() {
    this.homey.settings.removeListener('set', this._onAppSetting);
    this._clearTimers();
    // Last chance to keep the cost data: the app-level backup survives removing the device.
    await this.writeBackup().catch((err) => this.error('Sicherung beim Löschen fehlgeschlagen:', err));
  }

  _clearTimers() {
    if (this._tickTimer) this.homey.clearTimeout(this._tickTimer);
    if (this._dailyTimer) this.homey.clearTimeout(this._dailyTimer);
    if (this._retryTimer) this.homey.clearTimeout(this._retryTimer);
    if (this._backupTimer) this.homey.clearTimeout(this._backupTimer);
    this._backupTimer = null;
    this._tickTimer = null;
    this._dailyTimer = null;
    this._retryTimer = null;
  }

  _applySettings(settings) {
    this._environment = settings.environment === 'test' ? 'test' : 'production';
    this._priceField = ['integrated', 'electricity', 'grid'].includes(settings.price_field) ? settings.price_field : 'integrated';
    this._vatPercent = this._readVat(settings);
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

  // VAT is an app-wide setting (settings page). Devices paired before that still have the
  // old per-device value, which is used until the app-wide one is set.
  _readVat(deviceSettings) {
    const appValue = this.homey.settings.get('vat_percent');
    const v = Number(appValue !== null && appValue !== undefined ? appValue : deviceSettings.vat_percent);
    return Number.isFinite(v) && v >= 0 ? v : 8.1;
  }

  /** Reference tariff periods from the app settings (settings page), normalized. */
  _refPeriods() {
    return normalizeRefs(this.homey.settings.get('ref_periods') || []);
  }

  /** Reference import price (Rp./kWh) for one slot, null if none is configured for that day. */
  _refPriceAt(start, refs) {
    const ref = refForDay(refs, localDateKey(start, this.tz));
    return ref && ref.price > 0 ? refImportPrice(start, ref, this.tz) : null;
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

  /**
   * Called by driver.js's onRepair after it calls setSettings() with the new token -
   * setSettings() does not itself trigger onSettings() (Homey SDK docs), so this is the
   * explicit equivalent of the credentialsChanged branch above for that path.
   */
  async onCredentialsUpdated() {
    this._applySettings(this.getSettings());
    if (this.priceStore) this.priceStore.field = this._priceField;
    this._backoffIndex = 0;
    await this._initialFetch();
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
      const outcome = await this._handleFetchError(err, () => this._runDailyFetch());
      // AUTH already means "no retry of any kind until Settings change" (see SPEC), so the
      // daily job must stay dead too. Any other give-up still needs tomorrow's attempt armed,
      // otherwise a permanently failing fetch would silently kill the recurring job for good.
      if (outcome === 'gave-up') this._scheduleDailyFetch();
      return;
    }

    if (this.priceStore.hasFullDay(tomorrow, { ratio: TOMORROW_COVERAGE_RATIO })) {
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
    await this._setCapabilitySafe('last_update', formatDateTime(new Date(), this.tz));
  }

  /** @returns {Promise<'auth'|'retrying'|'gave-up'>} */
  async _handleFetchError(err, retryFn) {
    if (err instanceof InnostromError && err.code === 'AUTH') {
      await this.setUnavailable(this.homey.__('device.unavailableAuth'));
      return 'auth';
    }
    if (err instanceof InnostromError && err.retryable && this._backoffIndex < BACKOFF_MAX_TRIES) {
      const minutes = BACKOFF_MINUTES[Math.min(this._backoffIndex, BACKOFF_MINUTES.length - 1)];
      this._backoffIndex += 1;
      this._retryTimer = this.homey.setTimeout(() => retryFn(), minutes * 60 * 1000);
      this.error(`Abruf fehlgeschlagen (${err.code}), neuer Versuch in ${minutes} Min.:`, err.message);
      return 'retrying';
    }
    this.error('Abruf fehlgeschlagen, gebe auf bis zum nächsten geplanten Versuch:', err);
    return 'gave-up';
  }

  async actionRefresh() {
    await this._initialFetch();
    return true;
  }

  /**
   * Called when the settings page asks for the summary: if there is no price for right now
   * (fresh install, failed fetch), reload in the background. Throttled to every 5 minutes.
   */
  ensureFresh() {
    const now = Date.now();
    if (this.priceStore.at(new Date(now))) return;
    if (this._lastAutoFetch && now - this._lastAutoFetch < 5 * 60 * 1000) return;
    this._lastAutoFetch = now;
    this._initialFetch().catch((err) => this.error('Automatischer Abruf fehlgeschlagen:', err));
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

    const tomorrowFull = this.priceStore.hasFullDay(tomorrow, { ratio: TOMORROW_COVERAGE_RATIO });
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

  // Same idea as actionFindCheapestBlock, but for Flows that run at an arbitrary moment
  // (e.g. "EV plugged in") rather than a fixed daily window: the "from" side is always
  // now, only "to" is given, so a 6h block search at 22:00 doesn't wrap into a "window"
  // that's mostly already in the past.
  async actionFindCheapestBlockFromNow(args) {
    const now = new Date();
    const durationSlots = Math.round(Number(args.hours) * 4);
    const until = resolveUntil(now, args.to, this.tz);
    const block = this.priceStore.cheapestBlock(floorToSlot(now), until, durationSlots);
    if (!block) throw new Error(this.homey.__('device.errorNoCheapestBlock'));
    return {
      start: formatHHMM(block.start, this.tz),
      end: formatHHMM(block.end, this.tz),
      avg: this._toDisplay(block.avg),
      minutesUntilStart: Math.round((block.start.getTime() - now.getTime()) / 60000),
    };
  }

  // Same idea again, but for Flows where a clock time doesn't make sense - "sometime in
  // the next N hours" (e.g. EV plugged in, charge for 2h within the next 6h) rather than
  // "until 06:00".
  async actionFindCheapestBlockWithin(args) {
    const now = new Date();
    const durationSlots = Math.round(Number(args.hours) * 4);
    const until = new Date(now.getTime() + Number(args.horizon) * 60 * 60 * 1000);
    const block = this.priceStore.cheapestBlock(floorToSlot(now), until, durationSlots);
    if (!block) throw new Error(this.homey.__('device.errorNoCheapestBlock'));
    return {
      start: formatHHMM(block.start, this.tz),
      end: formatHHMM(block.end, this.tz),
      avg: this._toDisplay(block.avg),
      minutesUntilStart: Math.round((block.start.getTime() - now.getTime()) / 60000),
    };
  }

  // 24 hourly values (index 0 = 00:00-01:00 local ... 23 = 23:00-24:00), averaged from
  // our 15-min slots, in the unit / VAT mode / precision chosen in the app settings (default:
  // Rp./kWh incl. VAT like measure_price_total). For feeding
  // third-party EMS apps (e.g. FusionSolar's ems_set_price_forecast) that expect one
  // value per hour rather than per quarter-hour - JSON-encoded since Homey Flow tokens
  // have no array type, matching how Power by the Hour's own "Prices" token works.
  _hourlyPricesArray(day) {
    const dayStart = startOfLocalDay(day, this.tz);
    const dayEnd = addLocalDays(dayStart, 1, this.tz);
    const buckets = Array.from({ length: 24 }, () => []);
    for (const slot of this.priceStore.range(dayStart, dayEnd)) {
      if (typeof slot.integrated !== 'number' || !Number.isFinite(slot.integrated)) continue;
      buckets[localParts(slot.start, this.tz).hour].push(slot.integrated);
    }
    const out = normalizeHourlyOutput(this.homey.settings.get('hourly_output'));
    return buckets.map((values) => {
      let chf = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
      if (chf === null && Number.isFinite(this._fallbackPrice)) chf = this._fallbackPrice;
      return formatHourlyPrice(chf, this._vatPercent, out);
    });
  }

  async actionGetPricesToday() {
    const prices = this._hourlyPricesArray(new Date());
    if (prices.some((v) => v === null)) throw new Error(this.homey.__('device.errorPricesIncomplete'));
    return { prices: JSON.stringify(prices) };
  }

  async actionGetPricesTomorrow() {
    const prices = this._hourlyPricesArray(addLocalDays(new Date(), 1, this.tz));
    if (prices.some((v) => v === null)) throw new Error(this.homey.__('device.errorPricesIncomplete'));
    return { prices: JSON.stringify(prices) };
  }

  // ---------------------------------------------------------------------
  // Cost tracking (counter readings pushed in by the user's Flows)
  // ---------------------------------------------------------------------

  /** Dynamic import price + feed-in price (Rp./kWh) of one slot, for cost attribution. */
  _costPricesAt(start) {
    const slot = this.priceStore.slots.get(start.getTime());
    const hasTotal = slot && typeof slot.integrated === 'number' && Number.isFinite(slot.integrated);
    const dyn = hasTotal ? this._toDisplay(slot.integrated) : this._toDisplay(null);
    const feedIn = slot ? this._feedInRp(start, slot) : null;
    const stats = slot ? this.priceStore.dayStats(start) : null;
    const dayAvg = stats ? this._toDisplay(stats.avg) : null;
    return { dyn, feedIn, dayAvg };
  }

  /**
   * Feed-in price (Rp./kWh) used for export on the dynamic side of the comparison. AEW describes
   * the dynamic tariff for consumption only, so by default export is valued like the reference
   * tariff (no difference); "api" uses the feed_in component the API delivers.
   */
  _feedInRp(start, slot) {
    if (this.homey.settings.get('feed_in_mode') === 'api') {
      const has = typeof slot.feedIn === 'number' && Number.isFinite(slot.feedIn);
      return has ? Math.round(slot.feedIn * 10000) / 100 : 0;
    }
    const ref = refForDay(this._refPeriods(), localDateKey(start, this.tz));
    return ref && ref.price > 0 ? ref.feedIn : 0;
  }

  actionReportCounter(kind, kwh) {
    const result = this.costTracker.report(kind, kwh, new Date(), (s) => this._costPricesAt(s), this._refPeriods());
    if (result.status === 'invalid') throw new Error(this.homey.__('device.errorInvalidCounter'));
    this._markCostDirty();
    return true;
  }

  actionReportConsumer(name, kwh) {
    const result = this.costTracker.reportConsumer(name, kwh, new Date(), (s) => this._costPricesAt(s), this._refPeriods());
    if (result.status === 'invalid') throw new Error(this.homey.__('device.errorInvalidCounter'));
    if (result.status === 'limit') throw new Error(this.homey.__('device.errorConsumerLimit'));
    this._markCostDirty();
    return true;
  }

  _markCostDirty() {
    if (this._costTimer) return;
    this._costTimer = this.homey.setTimeout(() => {
      this._costTimer = null;
      this._flushCost().catch((err) => this.error('Kosten speichern fehlgeschlagen:', err));
    }, 5 * 60 * 1000);
  }

  async _flushCost() {
    if (this._costTimer) {
      this.homey.clearTimeout(this._costTimer);
      this._costTimer = null;
    }
    await this.setStoreValue('cost', this.costTracker.toJSON());
  }

  /** Selective clean-up from the settings page. */
  async deleteCostData({
    from, to, consumer, baselines,
  } = {}) {
    const dayKey = /^\d{4}-\d{2}-\d{2}$/;
    const result = {};
    if (from || to) {
      const lo = from || '0000-01-01';
      const hi = to || '9999-12-31';
      if (!dayKey.test(lo) || !dayKey.test(hi) || lo > hi) throw new Error('Invalid range');
      result.days = this.costTracker.deleteDays(lo, hi);
    }
    if (consumer) result.consumer = this.costTracker.deleteConsumer(String(consumer));
    if (baselines) {
      this.costTracker.resetBaselines();
      result.baselines = true;
    }
    await this._flushCost();
    return result;
  }

  /** Hourly price table for today and tomorrow (price list widget and overview table). */
  getPriceTable() {
    const now = new Date();
    const todayStart = startOfLocalDay(now, this.tz);
    const days = [0, 1].map((offset) => {
      const from = addLocalDays(todayStart, offset, this.tz);
      const to = addLocalDays(from, 1, this.tz);
      const table = buildDayTable({
        slots: this.priceStore.range(from, to),
        nowMs: now.getTime(),
        tz: this.tz,
        thresholds: this._levelThresholds,
        toDisplay: (raw) => this._toDisplay(raw),
      });
      const p = localParts(from, this.tz);
      return {
        key: offset === 0 ? 'today' : 'tomorrow',
        date: `${String(p.day).padStart(2, '0')}.${String(p.month).padStart(2, '0')}.`,
        ...table,
      };
    });
    return { days, lastUpdate: this.getCapabilityValue('last_update') };
  }

  /** Cheapest contiguous block of `hours` ahead in the known data, for the price widget. */
  getCheapBlockInfo(hours = 2) {
    const now = new Date();
    const end = this.priceStore.coveredUntil(now);
    if (!end) return null;
    const block = this.priceStore.cheapestBlock(floorToSlot(now), end, Math.round(hours * 4));
    if (!block) return null;
    return {
      hours,
      start: formatHHMM(block.start, this.tz),
      end: formatHHMM(block.end, this.tz),
      avg: this._toDisplay(block.avg),
      tomorrow: localDateKey(block.start, this.tz) !== localDateKey(now, this.tz),
      minutesUntilStart: Math.max(0, Math.round((block.start.getTime() - now.getTime()) / 60000)),
    };
  }

  /** Battery parameters for the shadow analysis (app settings, with defaults for a LUNA2000-class battery). */
  _batteryParams() {
    const p = this.homey.settings.get('battery_params') || {};
    const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
    const pct = (v, d, lo, hi) => {
      const n = v === null || v === undefined || v === '' ? NaN : Number(v);
      return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
    };
    const minSocPct = pct(p.minSocPct, 5, 0, 50);
    const maxSocPct = pct(p.maxSocPct, 90, 50, 100);
    return {
      capacityKwh: num(p.capacityKwh, 13.8),
      powerKw: num(p.powerKw, 5),
      roundTrip: Math.min(1, num(p.roundTrip, 0.9)),
      minSocPct,
      maxSocPct,
      minFrac: minSocPct / 100,
      maxFrac: maxSocPct / 100,
    };
  }

  /**
   * Shadow battery analysis: for every full day since tracking started, what the battery
   * actually did against what an optimal plan would have done (PV surplus only, and with
   * grid charging). Costs in Rp. Nothing is controlled.
   */
  getShadow() {
    const params = this._batteryParams();
    const todayKey = localDateKey(new Date(), this.tz);
    const keys = this.costTracker.shadowDayKeys(todayKey).slice(-14);
    const days = keys.map((k) => analyzeDay(this.costTracker.shadowInputs(k), params));
    const total = days.reduce((a, d) => ({
      noBattery: a.noBattery + d.noBattery,
      actual: a.actual + d.actual,
      pvOnly: a.pvOnly + d.pvOnly,
      withGrid: a.withGrid + d.withGrid,
      gridChargeValue: a.gridChargeValue + d.gridChargeValue,
      unused: a.unused + d.unused,
      batteryGain: a.batteryGain + d.batteryGain,
    }), {
      noBattery: 0, actual: 0, pvOnly: 0, withGrid: 0, gridChargeValue: 0, unused: 0, batteryGain: 0,
    });
    return { params, days, total };
  }

  // ---------------------------------------------------------------------
  // Backup of the cost data (app-level copy + manual text export/import)
  // ---------------------------------------------------------------------

  _backupKey() {
    return `cost_backup_${this.getData().id}`;
  }

  _readBackups() {
    const v = this.homey.settings.get(this._backupKey());
    return v && Array.isArray(v.items) ? v.items : [];
  }

  _hasCostData() {
    return Object.keys(this.costTracker.days).length > 0 || Object.keys(this.costTracker.consumers).length > 0;
  }

  _meteringHint() {
    const id = String(this.getData().id || '');
    return id ? `…${id.slice(-4)}` : null;
  }

  _settingsSnapshot() {
    const out = {};
    for (const k of ['ref_periods', 'vat_percent', 'battery_params', 'feed_in_mode', 'hourly_output']) {
      const v = this.homey.settings.get(k);
      if (v !== null && v !== undefined) out[k] = v;
    }
    return out;
  }

  _costText({ withSettings = true } = {}) {
    return CostBackup.pack({
      cost: this.costTracker.toJSON(),
      settings: withSettings ? this._settingsSnapshot() : {},
      appVersion: this.homey.manifest.version,
      metering: this._meteringHint(),
    });
  }

  /** Keeps the two most recent daily backups in the app settings (survive removing the device). */
  async writeBackup() {
    if (!this._hasCostData()) return null;
    const dayKey = localDateKey(new Date(), this.tz);
    const meta = {
      createdAt: Date.now(),
      day: dayKey,
      days: Object.keys(this.costTracker.days).length,
      consumers: Object.keys(this.costTracker.consumers).length,
      text: this._costText(),
    };
    let items = this._readBackups();
    if (items[0] && items[0].day === dayKey) items[0] = meta;
    else items.unshift(meta);
    items = items.slice(0, 2);
    this.homey.settings.set(this._backupKey(), { items });
    return { createdAt: meta.createdAt, days: meta.days, consumers: meta.consumers };
  }

  /** First backup shortly after start when none is fresh, then every night at 03:30 local. */
  _scheduleBackup(initial = true) {
    if (this._backupTimer) this.homey.clearTimeout(this._backupTimer);
    const items = this._readBackups();
    const stale = !items.length || Date.now() - items[0].createdAt > 20 * 3600 * 1000;
    let delay;
    if (initial && stale) {
      delay = 90 * 1000;
    } else {
      const now = new Date();
      const p = localParts(now, this.tz);
      let target = fromLocal(p.year, p.month, p.day, 3, 30, this.tz);
      if (target <= now) target = addLocalDays(target, 1, this.tz);
      delay = target.getTime() - now.getTime();
    }
    this._backupTimer = this.homey.setTimeout(() => {
      this.writeBackup()
        .catch((err) => this.error('Sicherung fehlgeschlagen:', err))
        .then(() => this._scheduleBackup(false))
        .catch((err) => this.error('Sicherung neu planen fehlgeschlagen:', err));
    }, delay);
  }

  getBackupStatus() {
    const items = this._readBackups().map((i) => ({
      createdAt: i.createdAt, day: i.day, days: i.days, consumers: i.consumers,
    }));
    const deviceHasData = this._hasCostData();
    return {
      items,
      deviceHasData,
      restorable: items.length > 0 && !deviceHasData,
      metering: this._meteringHint(),
      appVersion: this.homey.manifest.version,
    };
  }

  /** Backup text for the manual export (cost data and app settings, never the token). */
  exportBackup() {
    const text = this._costText();
    return { text, summary: CostBackup.summarize(CostBackup.unpack(text)) };
  }

  inspectBackup(text) {
    try {
      return CostBackup.summarize(CostBackup.unpack(text));
    } catch (err) {
      if (err instanceof CostBackup.BackupError) throw new Error('Invalid backup');
      throw err;
    }
  }

  async restoreBackup({
    source, index, text, mode, includeSettings,
  } = {}) {
    if (mode !== 'replace' && mode !== 'merge') throw new Error('Invalid mode');
    let raw = text;
    if (source === 'app') {
      const item = this._readBackups()[Number(index) || 0];
      if (!item) throw new Error('No backup');
      raw = item.text;
    }
    let backup;
    try {
      backup = CostBackup.unpack(raw);
    } catch (err) {
      if (err instanceof CostBackup.BackupError) throw new Error('Invalid backup');
      throw err;
    }
    const incoming = CostBackup.withoutBaselines(backup.cost);
    const next = mode === 'merge' ? CostBackup.mergeCost(this.costTracker.toJSON(), incoming) : incoming;
    // Keep a copy of what is about to be replaced.
    if (this._hasCostData()) await this.writeBackup();

    this.costTracker = CostTracker.fromJSON(next, { tz: this.tz });
    await this._flushCost();

    const applied = [];
    if (includeSettings) {
      this._restoring = true;
      try {
        for (const [k, v] of Object.entries(backup.settings)) {
          this.homey.settings.set(k, v);
          applied.push(k);
        }
      } finally {
        this._restoring = false;
      }
      this._vatPercent = this._readVat(this.getSettings());
      await this._updateCapabilities(new Date());
    }
    return { summary: CostBackup.summarize({ ...backup, cost: next }), settings: applied };
  }

  async resetCost() {
    this.costTracker.reset();
    await this._flushCost();
    return true;
  }

  /** Summaries for the cost widget / settings tab. Money values in Rp. */
  getCostOverview() {
    const now = new Date();
    const ref = this._refPeriods();
    const today = localDateKey(now, this.tz);
    const monthStart = `${today.slice(0, 7)}-01`;
    const weekStart = localDateKey(addLocalDays(now, -6, this.tz), this.tz);
    const dayFrom = localDateKey(addLocalDays(now, -29, this.tz), this.tz);
    const t = this.costTracker;
    return {
      refPeriods: this.homey.settings.get('ref_periods') || [],
      today: t.summary(today, today, ref),
      week: t.summary(weekStart, today, ref),
      month: t.summary(monthStart, today, ref),
      total: t.summary('0000-01-01', '9999-12-31', ref),
      consumers: t.consumerSummary(monthStart, today, ref),
      consumersTotal: t.consumerSummary('0000-01-01', '9999-12-31', ref),
      days: t.daily(dayFrom, today, ref),
      reports: t.lastReports(),
      chart: this.getCostChart(0),
      chartYesterday: this.getCostChart(1),
    };
  }

  /**
   * Quarter-hours of one day (0 = today, 1 = yesterday): dynamic and reference prices and the
   * kWh imported / exported, for the cost curves.
   */
  getCostChart(dayOffset = 0) {
    const now = new Date();
    const from = startOfLocalDay(addLocalDays(now, -dayOffset, this.tz), this.tz);
    const to = addLocalDays(from, 1, this.tz);
    const dayKey = localDateKey(from, this.tz);
    const refs = this._refPeriods();
    const ref = refForDay(refs, dayKey);
    const kwh = new Map(this.costTracker.slotsOf(dayKey).map((x) => [x[0], { imp: x[1], exp: x[2] }]));
    const nowSlot = floorToSlot(now).getTime();
    let rows = this.priceStore.range(from, to).map((s) => ({
      start: s.start, price: this._toDisplay(s.integrated), feedIn: this._feedInRp(s.start, s),
    }));
    // The price store only keeps yesterday and later; older days come from the stored day prices.
    if (rows.length < 4) rows = this.costTracker.dayPriceRows(dayKey);
    return rows.map((s) => {
      const k = kwh.get(s.start.getTime()) || { imp: 0, exp: 0 };
      return {
        time: formatHHMM(s.start, this.tz),
        price: s.price,
        feedIn: s.feedIn,
        ref: this._refPriceAt(s.start, refs),
        refFeedIn: ref && ref.price > 0 ? ref.feedIn : null,
        kwh: k.imp,
        exp: k.exp,
        isNow: s.start.getTime() === nowSlot,
        isPast: s.start.getTime() < nowSlot,
      };
    });
  }

  // ---------------------------------------------------------------------
  // Widget
  // ---------------------------------------------------------------------

  /** Today's + tomorrow's (if known) slots as display prices, for the price-curve widget. */
  getChartSlots() {
    const now = new Date();
    const from = startOfLocalDay(now, this.tz);
    const to = addLocalDays(from, 2, this.tz);
    const nowSlotStart = floorToSlot(now).getTime();

    const refs = this._refPeriods();
    const kwh = new Map(this.costTracker.slotsOf(localDateKey(now, this.tz)).map((x) => [x[0], x[1]]));
    return this.priceStore.range(from, to).map((s) => ({
      time: formatHHMM(s.start, this.tz),
      value: this._toDisplay(s.integrated),
      kwh: kwh.get(s.start.getTime()) || 0,
      ref: this._refPriceAt(s.start, refs),
      isNow: s.start.getTime() === nowSlotStart,
      isPast: s.start.getTime() < nowSlotStart,
    }));
  }

}

module.exports = InnostromDevice;
