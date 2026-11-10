'use strict';

const KEY = 'jobs';
const MAX_JOBS = 8;

/**
 * Gespeicherte Aufträge (ein Auftrag je Ziel: 'charger' oder die Geräte-ID eines Verbrauchers).
 * Auftrag: { id, kind, time, amount, powerKw, maxPrice, contiguous, deadline, need, ran:[], runningQ, createdAt }
 * `store` = { get(key), set(key, value) }.
 */
class JobStore {
  constructor(store) {
    this.store = store;
    this.jobs = [];
    try {
      const v = store ? store.get(KEY) : null;
      if (Array.isArray(v)) this.jobs = v.filter((j) => j && j.id && Number.isFinite(j.deadline) && Number.isFinite(j.need));
    } catch (err) { /* leer starten */ }
  }

  _save() {
    try { if (this.store) this.store.set(KEY, this.jobs); } catch (err) { /* nicht kritisch */ }
  }

  list() { return this.jobs; }

  get(id) { return this.jobs.find((j) => j.id === id) || null; }

  /** Speichert (ersetzt einen Auftrag desselben Ziels). */
  put(job) {
    const i = this.jobs.findIndex((j) => j.id === job.id);
    if (i >= 0) this.jobs[i] = job; else this.jobs.push(job);
    if (this.jobs.length > MAX_JOBS) this.jobs.splice(0, this.jobs.length - MAX_JOBS);
    this._save();
    return job;
  }

  update(job) { return this.put(job); }

  remove(id) {
    const n = this.jobs.length;
    this.jobs = this.jobs.filter((j) => j.id !== id);
    if (this.jobs.length !== n) this._save();
    return this.jobs.length !== n;
  }
}

module.exports = { JobStore, MAX_JOBS };
