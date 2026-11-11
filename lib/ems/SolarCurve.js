'use strict';

const { localParts } = require('../time');

const Q = 15 * 60 * 1000;
const RAD = Math.PI / 180;

/**
 * Sonnenaufgang und -untergang (UTC, ms) für einen Kalendertag und Ort (NOAA-Näherung, auf etwa 2 Minuten genau).
 * @returns {{sunrise:number, sunset:number}|null}  null = Polarnacht
 */
function sunTimes(year, month, day, lat, lon) {
  const day0 = Date.UTC(year, month - 1, day);
  const n = Math.floor((day0 - Date.UTC(year, 0, 0)) / 86400000);
  const g = ((2 * Math.PI) / 365) * (n - 1);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const cosHa = Math.cos(90.833 * RAD) / (Math.cos(lat * RAD) * Math.cos(decl)) - Math.tan(lat * RAD) * Math.tan(decl);
  if (cosHa > 1) return null;
  const ha = Math.acos(Math.max(-1, cosHa)) / RAD;
  return { sunrise: day0 + (720 - 4 * (lon + ha) - eqtime) * 60000, sunset: day0 + (720 - 4 * (lon - ha) - eqtime) * 60000 };
}

/**
 * Tageskurve aus einem Tageswert: Glockenform zwischen Sonnenaufgang und -untergang (sin^1.6), so skaliert, dass die
 * Summe genau `totalKwh` ergibt. Das ist eine Näherung (keine Wolken-Verläufe), taugt aber, um die Prognose eines
 * Tageswerts (Homey, Forecast.Solar-Gerät) auf Viertelstunden zu verteilen.
 *
 * @param {{totalKwh:number, dayStartMs:number, dayEndMs:number, lat:number, lon:number, tz:string}} p
 * @returns {{end:number, kw:number, h:number}[]}  Viertelstunden-Slots im PvFeed-Format
 */
function dailyCurve({
  totalKwh, dayStartMs, dayEndMs, lat, lon, tz,
}) {
  if (!Number.isFinite(totalKwh) || totalKwh < 0) return [];
  const lp = localParts(new Date(dayStartMs + 6 * 3600000), tz);
  const sun = sunTimes(lp.year, lp.month, lp.day, lat, lon);
  if (!sun || !(sun.sunset > sun.sunrise)) return [];
  const slots = [];
  let sum = 0;
  for (let t = Math.floor(dayStartMs / Q) * Q; t < dayEndMs; t += Q) {
    const c = t + Q / 2;
    if (c <= sun.sunrise || c >= sun.sunset) continue;
    const w = Math.sin((Math.PI * (c - sun.sunrise)) / (sun.sunset - sun.sunrise)) ** 1.6;
    slots.push({ end: t + Q, w });
    sum += w;
  }
  if (!(sum > 0)) return [];
  return slots.map((s) => ({ end: s.end, kw: (totalKwh * s.w) / (sum * 0.25), h: 0.25 }));
}

module.exports = { sunTimes, dailyCurve };
