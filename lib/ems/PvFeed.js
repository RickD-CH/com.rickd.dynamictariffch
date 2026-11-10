'use strict';

/**
 * PV-Prognose. Phase 1 liest sie aus dem EMS von Andi (GET /ems/pv-forecast der App
 * com.huawei.fusionsolar): Solcast, Korrekturfaktor schon angewendet, Slots { end, kw, h }.
 * Eine eigene Quelle (Forecast.Solar / Solcast direkt) folgt später.
 */

const ANDI_APP = 'com.huawei.fusionsolar';
const STALE_MS = 6 * 3600 * 1000;

/** Erwartete Energie (kWh) aus Slots, deren Ende in (fromMs, toMs] liegt. */
function sumKwh(slots, fromMs, toMs) {
  if (!Array.isArray(slots)) return 0;
  let kwh = 0;
  for (const s of slots) if (s.end > fromMs && s.end <= toMs) kwh += s.kw * s.h;
  return kwh;
}

class PvFeed {
  constructor(homey, log = () => {}, client = null) {
    this.homey = homey;
    this.log = log;
    this.client = client;
    this.slots = [];
    this.factor = null;
    this.fetchedAt = null;
    this.stale = true;
    this.error = null;
  }

  _client() {
    return this.client || this.homey.api.getApiApp(ANDI_APP);
  }

  async refresh(nowMs = Date.now()) {
    try {
      const r = await this._client().get('/ems/pv-forecast');
      if (r && Array.isArray(r.slots)) {
        this.slots = r.slots.filter((s) => Number.isFinite(s.end) && Number.isFinite(s.kw) && Number.isFinite(s.h));
        this.factor = Number.isFinite(r.factor) ? r.factor : null;
        this.stale = r.stale === true;
        this.fetchedAt = nowMs;
        this.error = r.error || null;
      }
    } catch (err) {
      this.error = `PV-Prognose nicht erreichbar: ${err && err.message}`;
      this.log(`[PvFeed] ${this.error}`);
    }
  }

  isStale(nowMs = Date.now()) {
    return this.stale || !this.fetchedAt || nowMs - this.fetchedAt > STALE_MS || !this.slots.length;
  }

  /** Erwartete kWh von jetzt bis lokaler Mitternacht (null, wenn die Prognose veraltet ist). */
  remainingTodayKwh(nowMs, tz) {
    if (this.isStale(nowMs)) return null;
    const { addLocalDays, startOfLocalDay } = require('../time');
    const end = addLocalDays(startOfLocalDay(new Date(nowMs), tz), 1, tz).getTime();
    return sumKwh(this.slots, nowMs, end);
  }

  /** kWh in der Vorschau oder null, wenn die Prognose veraltet ist (Tor bleibt dann offen). */
  forecastKwh(nowMs, hours = 24) {
    if (this.isStale(nowMs)) return null;
    return sumKwh(this.slots, nowMs, nowMs + hours * 3600 * 1000);
  }
}

module.exports = { PvFeed, sumKwh, ANDI_APP };
