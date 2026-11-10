'use strict';

/**
 * 15-Minuten-Preise für das EMS direkt aus dem Preisspeicher des eigenen Geräts (PriceStore).
 * Kein App-zu-App-Aufruf: die Preise sind in dieser App. Einheit für das EMS: Rp./kWh
 * (nur die Rangfolge zählt), gelesen aus dem Preisfeld, das am Gerät eingestellt ist.
 */

const QUARTER_MS = 15 * 60 * 1000;
const BEHIND_MS = 60 * 60 * 1000;
const AHEAD_MS = 49 * 60 * 60 * 1000;

class PriceFeed {
  /**
   * @param {() => object|null} getDevice  liefert das Innostrom-Gerät (mit .priceStore) oder null
   * @param {function} [log]
   */
  constructor(getDevice, log = () => {}) {
    this.getDevice = getDevice;
    this.log = log;
    this.slots = [];
    this.fetchedAt = null;
    this.error = null;
  }

  async refresh(nowMs = Date.now()) {
    const dev = this.getDevice();
    if (!dev || !dev.priceStore) {
      this.error = 'Kein Preis-Gerät gekoppelt';
      return this.slots;
    }
    const store = dev.priceStore;
    const slots = store.range(new Date(nowMs - BEHIND_MS), new Date(nowMs + AHEAD_MS))
      .map((s) => {
        const v = store.value(s);
        if (v === null) return null;
        const start = s.start.getTime();
        return {
          start,
          end: s.end ? s.end.getTime() : start + QUARTER_MS,
          price: Math.round(v * 100 * 100) / 100, // CHF/kWh -> Rp./kWh
        };
      })
      .filter(Boolean);
    this.slots = slots;
    this.fetchedAt = nowMs;
    this.error = slots.length ? null : 'Noch keine Preise im Speicher';
    return slots;
  }

  /** Veraltet: keine Preise oder kein Slot deckt die Zukunft ab. Dann entscheidet das EMS "normal". */
  isStale(nowMs = Date.now()) {
    if (!this.slots.length) return true;
    return this.slots[this.slots.length - 1].end <= nowMs;
  }

  getSlots(nowMs = Date.now()) {
    return this.isStale(nowMs) ? [] : this.slots;
  }
}

module.exports = { PriceFeed, QUARTER_MS };
