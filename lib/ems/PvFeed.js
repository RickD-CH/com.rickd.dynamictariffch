'use strict';

const { addLocalDays, startOfLocalDay } = require('../time');
const { dailyCurve } = require('./SolarCurve');

/**
 * PV-Prognose für das EMS.
 *
 * Quelle 1 (bevorzugt): von aussen eingeliefert, per Flow-Aktion "PV-Prognose setzen". So kann jeder
 * seine eigene Prognose verwenden (Forecast.Solar, Solcast, eigene Korrektur, Lernflow ...). Die Daten
 * werden gespeichert und überleben einen Neustart. Ein Korrekturfaktor wird beim Lesen angewendet.
 *
 * Quelle 2 (Übergang, nur wenn eine Vergleichsquelle gewählt ist): die Prognose des EMS der Huawei-
 * FusionSolar-App (GET /ems/pv-forecast, Faktor schon angewendet).
 *
 * Intern sind Slots { end, kw, h }: mittlere Leistung kw über h Stunden, Ende in ms.
 */

const COMPARE_APP = 'com.huawei.fusionsolar';
const FALLBACK_STALE_MS = 6 * 3600 * 1000;
const EXTERNAL_STALE_MS = 12 * 3600 * 1000;
const STORE_KEY = 'pvExternal';
const MAX_SLOTS = 400;
const HOUR_MS = 3600 * 1000;

/** Erwartete Energie (kWh) aus Slots, deren Ende in (fromMs, toMs] liegt. */
function sumKwh(slots, fromMs, toMs) {
  if (!Array.isArray(slots)) return 0;
  let kwh = 0;
  for (const s of slots) if (s.end > fromMs && s.end <= toMs) kwh += s.kw * s.h;
  return kwh;
}

const toMs = (v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/**
 * Eingelieferte Prognose prüfen und in Slots umrechnen.
 * Erlaubt: JSON-Text oder Array von { start | end, [end], [hours], kwh | kw }.
 *   - start (ISO oder ms) und kwh/kw sind Pflicht, ausser end ist gegeben (dann start = end - hours).
 *   - Dauer: end - start, sonst "hours", sonst 1 Stunde.
 *   - kwh = Energie im Slot, kw = mittlere Leistung im Slot.
 * @returns {{ slots: object[], skipped: number }}  wirft bei unbrauchbarer Eingabe
 */
function parseExternal(input) {
  let arr = input;
  if (typeof input === 'string') {
    try {
      arr = JSON.parse(input);
    } catch (err) {
      throw new Error('Keine gültige JSON-Liste');
    }
  }
  if (!Array.isArray(arr) || !arr.length) throw new Error('Die Prognose muss eine nicht leere Liste sein');
  if (arr.length > MAX_SLOTS) throw new Error(`Zu viele Einträge (maximal ${MAX_SLOTS})`);
  const slots = [];
  let skipped = 0;
  for (const e of arr) {
    if (!e || typeof e !== 'object') {
      skipped += 1; continue;
    }
    let start = toMs(e.start);
    let end = toMs(e.end);
    const hoursGiven = Number(e.hours);
    let h = Number.isFinite(hoursGiven) && hoursGiven > 0 ? hoursGiven : null;
    if (start !== null && end !== null && end > start) h = (end - start) / HOUR_MS;
    if (h === null) h = 1;
    if (end === null && start !== null) end = start + h * HOUR_MS;
    if (start === null && end !== null) start = end - h * HOUR_MS;
    if (start === null || end === null || !(h > 0) || h > 24) {
      skipped += 1; continue;
    }
    let kw = null;
    if (Number.isFinite(Number(e.kwh)) && e.kwh !== null && e.kwh !== '') kw = Number(e.kwh) / h;
    else if (Number.isFinite(Number(e.kw)) && e.kw !== null && e.kw !== '') kw = Number(e.kw);
    if (kw === null || kw < 0 || kw > 1000) {
      skipped += 1; continue;
    }
    slots.push({ end, kw, h });
  }
  if (!slots.length) throw new Error('Kein Eintrag brauchbar (start, kwh oder kw fehlt)');
  slots.sort((a, b) => a.end - b.end);
  return { slots, skipped };
}

class PvFeed {
  /**
   * @param {object} homey  Homey-App-Instanz (für homey.api.getApiApp, nur beim Übergangs-Weg)
   * @param {function} log
   * @param {object} [client]  nur für Tests: { get(path) -> Promise }
   * @param {{get:function,set:function}} [store]  Speicher für die eingelieferte Prognose
   */
  constructor(homey, log = () => {}, client = null, store = null) {
    this.homey = homey;
    this.log = log;
    this.client = client;
    this.store = store;
    this.slots = [];
    this.source = null; // 'external' | 'fallback' | null
    this.factor = null; // Faktor, der auf die Slots angewendet wurde (nur bei external)
    this.fetchedAt = null;
    this.stale = true;
    this.error = null;
    this.external = this._loadExternal();
    this.userFactor = 1;
    this.useFallback = false;
    this.daily = null; // { todayKwh, tomorrowKwh, at, source } der letzten Tageswert-Quelle
  }

  _loadExternal() {
    try {
      const v = this.store ? this.store.get(STORE_KEY) : null;
      if (v && Array.isArray(v.slots) && Number.isFinite(v.at)) return v;
    } catch (err) { /* leer starten */ }
    return null;
  }

  _client() {
    return this.client || this.homey.api.getApiApp(COMPARE_APP);
  }

  /** Eingelieferte Prognose speichern. Gibt { count, skipped } zurück. */
  setExternal(input, nowMs = Date.now()) {
    const { slots, skipped } = parseExternal(input);
    this.external = { slots, at: nowMs };
    try {
      if (this.store) this.store.set(STORE_KEY, this.external);
    } catch (err) { /* nicht kritisch */ }
    this._adopt(nowMs);
    return { count: slots.length, skipped };
  }

  /** Einstellungen aus der Konfiguration übernehmen. */
  configure({ factor = 1, useFallback = false } = {}) {
    this.userFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
    this.useFallback = useFallback === true;
  }

  /** Ort für Sonnenaufgang/-untergang (Homey-Einstellung), sonst Mittelland. */
  _geo() {
    try {
      const g = this.homey && this.homey.geolocation;
      const lat = g && Number(g.getLatitude());
      const lon = g && Number(g.getLongitude());
      if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) return { lat, lon };
    } catch (err) { /* Standard */ }
    return { lat: 47.0, lon: 8.0 };
  }

  /**
   * Tageswerte (heute und/oder morgen in kWh) als Prognose übernehmen: sie werden mit dem Korrekturfaktor multipliziert
   * und als Glockenkurve zwischen Sonnenaufgang und -untergang auf Viertelstunden verteilt.
   * @returns {boolean} false, wenn kein brauchbarer Wert da war
   */
  setDaily({ todayKwh = null, tomorrowKwh = null, source = 'homey' }, nowMs, tz) {
    const geo = this._geo();
    const day0 = startOfLocalDay(new Date(nowMs), tz).getTime();
    const day1 = addLocalDays(new Date(nowMs), 1, tz).getTime();
    const day2 = addLocalDays(new Date(nowMs), 2, tz).getTime();
    let slots = [];
    const f = this.userFactor;
    if (Number.isFinite(todayKwh) && todayKwh >= 0) {
      slots = slots.concat(dailyCurve({
        totalKwh: todayKwh * f, dayStartMs: day0, dayEndMs: day1, ...geo, tz,
      }));
    }
    if (Number.isFinite(tomorrowKwh) && tomorrowKwh >= 0) {
      slots = slots.concat(dailyCurve({
        totalKwh: tomorrowKwh * f, dayStartMs: day1, dayEndMs: day2, ...geo, tz,
      }));
    }
    if (!slots.length) return false;
    this.slots = slots;
    this.source = source;
    this.factor = f;
    this.fetchedAt = nowMs;
    this.stale = false;
    this.error = null;
    this.daily = {
      todayKwh: Number.isFinite(todayKwh) ? todayKwh : null, tomorrowKwh: Number.isFinite(tomorrowKwh) ? tomorrowKwh : null, at: nowMs, source,
    };
    return true;
  }

  externalFresh(nowMs) {
    return this._externalFresh(nowMs);
  }

  _externalFresh(nowMs) {
    return !!(this.external && this.external.slots.length && nowMs - this.external.at <= EXTERNAL_STALE_MS);
  }

  /** Eingelieferte Prognose als aktive Quelle setzen (Faktor angewendet). */
  _adopt(nowMs) {
    this.slots = this.external.slots.map((s) => ({ ...s, kw: s.kw * this.userFactor }));
    this.factor = this.userFactor;
    this.source = 'external';
    this.fetchedAt = this.external.at;
    this.stale = false;
    this.error = null;
    this._adoptedFactor = this.userFactor;
    this._adoptedAt = nowMs;
  }

  async refresh(nowMs = Date.now()) {
    if (this._externalFresh(nowMs)) {
      // Faktor kann sich seit dem letzten Mal geändert haben
      if (this.source !== 'external' || this._adoptedFactor !== this.userFactor || this.fetchedAt !== this.external.at) this._adopt(nowMs);
      return;
    }
    if (!this.useFallback) {
      this.source = null;
      this.slots = [];
      this.stale = true;
      this.error = this.external ? 'Eingelieferte PV-Prognose ist veraltet' : null;
      return;
    }
    try {
      const r = await this._client().get('/ems/pv-forecast');
      if (r && Array.isArray(r.slots)) {
        this.slots = r.slots.filter((s) => Number.isFinite(s.end) && Number.isFinite(s.kw) && Number.isFinite(s.h));
        this.factor = Number.isFinite(r.factor) ? r.factor : null;
        this.stale = r.stale === true;
        this.fetchedAt = nowMs;
        this.source = 'fallback';
        this.error = r.error || null;
      }
    } catch (err) {
      this.error = `PV-Prognose nicht erreichbar: ${err && err.message}`;
      this.log(`[PvFeed] ${this.error}`);
    }
  }

  isStale(nowMs = Date.now()) {
    if (!this.slots.length || !this.fetchedAt || this.stale) return true;
    const limit = this.source === 'external' ? EXTERNAL_STALE_MS : FALLBACK_STALE_MS;
    return nowMs - this.fetchedAt > limit;
  }

  /** Erwartete kWh von jetzt bis lokaler Mitternacht (null, wenn die Prognose veraltet ist). */
  remainingTodayKwh(nowMs, tz) {
    if (this.isStale(nowMs)) return null;
    const end = addLocalDays(startOfLocalDay(new Date(nowMs), tz), 1, tz).getTime();
    return sumKwh(this.slots, nowMs, end);
  }

  /** Erwartete kWh für den ganzen morgigen Tag (null, wenn veraltet). */
  tomorrowKwh(nowMs, tz) {
    if (this.isStale(nowMs)) return null;
    const from = addLocalDays(startOfLocalDay(new Date(nowMs), tz), 1, tz).getTime();
    const to = addLocalDays(startOfLocalDay(new Date(nowMs), tz), 2, tz).getTime();
    return sumKwh(this.slots, from, to);
  }

  /** Erwartete Leistung (kW) im Slot, der jetzt läuft (null, wenn veraltet). */
  nowKw(nowMs) {
    if (this.isStale(nowMs)) return null;
    const s = this.slots.find((x) => x.end > nowMs);
    if (!s) return 0;
    return nowMs >= s.end - s.h * HOUR_MS ? s.kw : 0;
  }

  /** kWh in der Vorschau oder null, wenn die Prognose veraltet ist (Tor bleibt dann offen). */
  forecastKwh(nowMs, hours = 24) {
    if (this.isStale(nowMs)) return null;
    return sumKwh(this.slots, nowMs, nowMs + hours * HOUR_MS);
  }

  /** Zustand für die Einstellungsseite. */
  info(nowMs = Date.now()) {
    return {
      source: this.source,
      factor: this.userFactor,
      fetchedAt: this.fetchedAt,
      stale: this.isStale(nowMs),
      slots: this.slots.length,
      externalAt: this.external ? this.external.at : null,
      daily: this.daily,
    };
  }
}

module.exports = {
  PvFeed, sumKwh, parseExternal, COMPARE_APP,
};
