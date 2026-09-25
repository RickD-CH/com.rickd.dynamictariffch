'use strict';

const { toLocalIso, SLOT_MS } = require('./time');

/**
 * Client für die Innostrom API v2 (Swisspower), wie sie u. a. die AEW Energie AG nutzt.
 * Doku: https://portal.dynamische-stromtarife.ch/docs/apiv2
 * Spec: docs/innostrom-swagger.json, beobachtetes Verhalten: docs/innostrom-api.md
 */

const ENVIRONMENTS = {
  production: 'https://portal.dynamische-stromtarife.ch/api',
  test: 'https://portal-test.dynamische-stromtarife.ch/api',
};

/** Öffentliche Test-Zugangsdaten (stehen so in der Test-Doku). Liefern konstante Preise. */
const TEST_CREDENTIALS = {
  meteringCode: 'CH1018601234500000000000000011642',
  token: '19d6ca0bb9bf4d8b6525440eead80da6',
};

const TARIFF_TYPES = ['electricity', 'grid', 'dso', 'integrated', 'feed_in', 'all'];
const COMPONENTS = ['electricity', 'grid', 'dso', 'integrated', 'feed_in'];

class InnostromError extends Error {
  /**
   * @param {string} message
   * @param {'AUTH'|'BAD_REQUEST'|'SERVER'|'NETWORK'|'TIMEOUT'|'INVALID_RESPONSE'} code
   * @param {number} [httpStatus]
   */
  constructor(message, code, httpStatus) {
    super(message);
    this.name = 'InnostromError';
    this.code = code;
    this.httpStatus = httpStatus;
  }

  /** Lohnt sich ein erneuter Versuch später? */
  get retryable() {
    return ['SERVER', 'NETWORK', 'TIMEOUT', 'INVALID_RESPONSE'].includes(this.code);
  }
}

/**
 * Summe aller `work`-Komponenten in CHF/kWh. Andere Komponenten (power / fix_price,
 * Einheiten CHF_kW, CHF_kW_max_d) sind kein Arbeitspreis und werden ignoriert.
 * Liefert null, wenn das Feld fehlt (z. B. anderer tariff_type angefragt).
 */
function workPrice(prices) {
  if (!Array.isArray(prices)) return null;
  const work = prices.filter((p) => p && p.component === 'work' && p.unit === 'CHF_kWh');
  if (work.length === 0) return null;
  return work.reduce((sum, p) => sum + Number(p.value), 0);
}

/**
 * Normalisierter Slot:
 * { start: Date, end: Date, electricity, grid, dso, integrated, feedIn }  (Zahlen in CHF/kWh oder null)
 */
function normalizeSlot(raw) {
  const start = new Date(raw.start_timestamp);
  const end = new Date(raw.end_timestamp);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new InnostromError(`Ungültiger Zeitstempel im Slot: ${JSON.stringify(raw)}`, 'INVALID_RESPONSE');
  }
  return {
    start,
    end,
    electricity: workPrice(raw.electricity),
    grid: workPrice(raw.grid),
    dso: workPrice(raw.dso),
    integrated: workPrice(raw.integrated),
    feedIn: workPrice(raw.feed_in),
  };
}

class InnostromClient {
  /**
   * @param {object} opts
   * @param {string} opts.meteringCode  Messpunktnummer (CH…, 33 Zeichen)
   * @param {string} opts.token         Bearer-Token vom Netzbetreiber
   * @param {'production'|'test'} [opts.environment='production']
   * @param {string} [opts.baseUrl]     überschreibt environment
   * @param {typeof fetch} [opts.fetch] für Tests
   * @param {number} [opts.timeoutMs=20000]
   * @param {string} [opts.tz='Europe/Zurich'] Zeitzone für die Anfrage-Zeitstempel
   */
  constructor({
    meteringCode, token, environment = 'production', baseUrl, fetch: fetchImpl, timeoutMs = 20000, tz = 'Europe/Zurich',
  }) {
    if (!meteringCode) throw new Error('meteringCode fehlt');
    if (!token) throw new Error('token fehlt');
    this.meteringCode = String(meteringCode).trim();
    this.token = String(token).trim().replace(/^Bearer\s+/i, '');
    this.baseUrl = (baseUrl || ENVIRONMENTS[environment] || ENVIRONMENTS.production).replace(/\/$/, '');
    this.fetch = fetchImpl || globalThis.fetch;
    this.timeoutMs = timeoutMs;
    this.tz = tz;
  }

  /** Baut die Anfrage-URL. Exportiert für Tests. */
  buildUrl({ start, endInclusive, tariffType }) {
    const qs = new URLSearchParams({
      metering_code: this.meteringCode,
      tariff_type: tariffType,
      start_timestamp: toLocalIso(start, this.tz),
      end_timestamp: toLocalIso(endInclusive, this.tz),
    });
    return `${this.baseUrl}/v2/metering_code?${qs.toString()}`;
  }

  /**
   * Preise im Intervall [from, to) holen.
   *
   * ACHTUNG API-Verhalten (beobachtet): Es werden Slots geliefert, deren START im Intervall
   * [start_timestamp, end_timestamp] liegt – das Ende ist INKLUSIV und angebrochene Slots
   * werden NICHT mitgeliefert. Deshalb: `from` auf Slotbeginn abrunden, als Ende `to - 1s`
   * senden und zusätzlich clientseitig filtern.
   *
   * @param {object} opts
   * @param {Date} opts.from
   * @param {Date} opts.to   exklusiv
   * @param {string} [opts.tariffType='all']
   * @returns {Promise<{ publishedAt: Date|null, slots: ReturnType<normalizeSlot>[] }>}
   */
  async getPrices({ from, to, tariffType = 'all' }) {
    if (!TARIFF_TYPES.includes(tariffType)) throw new Error(`Unbekannter tariff_type: ${tariffType}`);
    if (!(from instanceof Date) || !(to instanceof Date) || !(to > from)) throw new Error('from/to ungültig');

    const start = new Date(Math.floor(from.getTime() / SLOT_MS) * SLOT_MS);
    const endInclusive = new Date(to.getTime() - 1000);
    const url = this.buildUrl({ start, endInclusive, tariffType });

    const body = await this._request(url);

    if (!body || body.status !== 'ok' || !Array.isArray(body.prices)) {
      throw new InnostromError(`Unerwartete Antwort: ${JSON.stringify(body).slice(0, 200)}`, 'INVALID_RESPONSE');
    }

    const seen = new Set();
    const slots = body.prices
      .map(normalizeSlot)
      .filter((s) => s.start >= start && s.start < to)
      .filter((s) => (seen.has(s.start.getTime()) ? false : seen.add(s.start.getTime())))
      .sort((a, b) => a.start - b.start);

    const publishedAt = body.publication_timestamp ? new Date(body.publication_timestamp) : null;
    return { publishedAt, slots };
  }

  /** Prüft Zugangsdaten (kleine Abfrage der aktuellen Stunde). Wirft InnostromError bei Fehler. */
  async testConnection(now = new Date()) {
    const from = new Date(Math.floor(now.getTime() / SLOT_MS) * SLOT_MS);
    const { slots } = await this.getPrices({ from, to: new Date(from.getTime() + 4 * SLOT_MS), tariffType: 'integrated' });
    return { ok: true, slotCount: slots.length };
  }

  async _request(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res;
    try {
      res = await this.fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') throw new InnostromError(`Zeitüberschreitung nach ${this.timeoutMs} ms`, 'TIMEOUT');
      throw new InnostromError(`Netzwerkfehler: ${err && err.message}`, 'NETWORK');
    } finally {
      clearTimeout(timer);
    }

    let body = null;
    const text = await res.text();
    try {
      body = text ? JSON.parse(text) : null;
    } catch { /* kein JSON */ }

    if (res.ok) return body;

    const msg = (body && body.message) || `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) {
      // 403 kommt sowohl bei falschem Token als auch bei falscher Messpunktnummer.
      throw new InnostromError(`Zugangsdaten ungültig: ${msg}`, 'AUTH', res.status);
    }
    if (res.status >= 400 && res.status < 500) throw new InnostromError(msg, 'BAD_REQUEST', res.status);
    throw new InnostromError(msg, 'SERVER', res.status);
  }
}

module.exports = {
  InnostromClient,
  InnostromError,
  ENVIRONMENTS,
  TEST_CREDENTIALS,
  TARIFF_TYPES,
  COMPONENTS,
  normalizeSlot,
  workPrice,
};
