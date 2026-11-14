'use strict';

// Diagnose zum Kopieren: Log-Speicher, Anonymisierung, Bericht. Es darf nichts Persönliches und kein Geheimnis im Text landen.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  RingLog, makeRedactor, buildReport, MAX_LINES, MAX_LINE_CHARS,
} = require('../lib/Diagnostics');

test('RingLog: behält nur die letzten Zeilen, kürzt lange Zeilen, nimmt auch Fehler und Objekte', () => {
  const log = new RingLog(3);
  for (let i = 0; i < 5; i += 1) log.add('log', [`zeile ${i}`], 1000 + i);
  assert.deepEqual(log.recent().map((l) => l.text), ['zeile 2', 'zeile 3', 'zeile 4']);
  log.add('error', ['x'.repeat(MAX_LINE_CHARS + 50)]);
  assert.equal(log.recent(1)[0].text.length, MAX_LINE_CHARS);
  log.add('error', [new Error('kaputt'), { a: 1 }]);
  assert.match(log.recent(1)[0].text, /^Error: kaputt \(at diagnostics\.test\.js:\d+:\d+/, 'Stacktrace nur mit Dateiname und Zeile');
  assert.equal(/[A-Z]:\|\/Users\//.test(log.recent(1)[0].text), false, 'keine lokalen Pfade');
  assert.match(log.recent(1)[0].text, /\{"a":1\}/);
  assert.equal(new RingLog().max, MAX_LINES);
});

test('RingLog.attach: log und error schreiben mit und rufen das Original weiter auf; doppeltes Anhängen ändert nichts', () => {
  const calls = [];
  const obj = { log: (...a) => calls.push(['log', a]), error: (...a) => calls.push(['error', a]) };
  const ring = new RingLog();
  ring.attach(obj);
  ring.attach(obj);
  obj.log('hallo', 1);
  obj.error('fehler');
  assert.deepEqual(calls, [['log', ['hallo', 1]], ['error', ['fehler']]]);
  assert.deepEqual(ring.recent().map((l) => [l.level, l.text]), [['log', 'hallo 1'], ['error', 'fehler']]);
  assert.equal(ring.attach(null), false, 'null und Objekte ohne log/error werden ignoriert');
  assert.equal(ring.attach({}), false);
});

test('attach/attachConsole: schreibgeschützte oder kaputte Objekte werfen nie (die App darf deswegen nicht abstürzen)', () => {
  const ring = new RingLog();
  const frozen = Object.freeze({ log: () => {}, error: () => {} });
  assert.doesNotThrow(() => ring.attach(frozen));
  assert.equal(ring.attach(frozen), false);
  const getterOnly = {};
  Object.defineProperty(getterOnly, 'log', { get() { return () => {}; } });
  Object.defineProperty(getterOnly, 'error', { get() { return () => {}; } });
  assert.doesNotThrow(() => ring.attach(getterOnly));
  assert.equal(ring.attachConsole(Object.freeze({ log() {}, error() {} })), false);
  assert.equal(ring.attachConsole(null), false);
});

test('attachConsole: schreibt console.log/info/warn/error mit und gibt die Meldung weiter; ein zweites Mal ändert nichts', () => {
  const seen = [];
  const con = { log: (...a) => seen.push(['log', a]), info: (...a) => seen.push(['info', a]), warn: (...a) => seen.push(['warn', a]), error: (...a) => seen.push(['error', a]) };
  const ring = new RingLog();
  assert.equal(ring.attachConsole(con), true);
  assert.equal(ring.attachConsole(con), false);
  con.log('a'); con.info('b'); con.warn('c'); con.error('d');
  assert.deepEqual(seen.map((x) => x[0]), ['log', 'info', 'warn', 'error']);
  assert.deepEqual(ring.recent().map((l) => [l.level, l.text]), [['log', 'a'], ['log', 'b'], ['log', 'c'], ['error', 'd']]);
});

test('makeRedactor: Namen, Token, Bearer, IDs, IP, E-Mail, lange Zahlen und Schlüssel verschwinden; kurze Namen werden nicht ersetzt', () => {
  const redact = makeRedactor({
    names: [{ name: 'Geschirrspüler', label: 'Verbraucher 1' }, { name: 'Wärmepumpe Keller', label: 'Gerät 2' }, { name: 'ab', label: 'Gerät 9' }],
    secrets: ['SuperGeheimesToken123', 'CH1000012345678'],
  });
  const t = redact('geschirrspüler startet über Wärmepumpe Keller; Token SuperGeheimesToken123, Punkt CH1000012345678, '
    + 'Authorization: Bearer abcDEF.ghi, id 9df9c71b-e008-47a1-86ab-f8d2d8ed7ad2, Box 192.168.0.177, mail a.b@example.com, '
    + 'Nummer 1234567890123, Schlüssel QWERTZUIOPASDFGHJKLYXCVBNM12 und ab bleibt');
  assert.match(t, /Verbraucher 1 startet über Gerät 2/, 'ohne Rücksicht auf Gross-/Kleinschreibung');
  for (const bad of ['SuperGeheimesToken123', 'CH1000012345678', 'abcDEF', '9df9c71b', '192.168.0.177', 'a.b@example.com', '1234567890123', 'QWERTZUIOPASDFGHJKLYXCVBNM12']) {
    assert.equal(t.includes(bad), false, `${bad} darf nicht im Text stehen`);
  }
  assert.match(t, /<geheim>/);
  assert.match(t, /Bearer <token>/);
  assert.match(t, /<id>/);
  assert.match(t, /<ip>/);
  assert.match(t, /<mail>/);
  assert.match(t, /und ab bleibt/, 'zu kurze Namen (unter 3 Zeichen) werden nicht ersetzt');
});

test('makeRedactor: längere Namen zuerst (kein Rest eines Teilnamens), Sonderzeichen im Namen sind harmlos', () => {
  const redact = makeRedactor({ names: [{ name: 'Pumpe', label: 'Gerät 1' }, { name: 'Pumpe (Keller) +', label: 'Gerät 2' }] });
  assert.equal(redact('Pumpe (Keller) + läuft, Pumpe auch'), 'Gerät 2 läuft, Gerät 1 auch');
  assert.equal(redact(null), '');
});

test('buildReport: Zusammenfassung ohne Namen und Zugangsdaten, mit den letzten Meldungen (anonymisiert)', () => {
  const redact = makeRedactor({
    names: [{ name: 'Mein Geschirrspüler', label: 'Verbraucher 1' }, { name: 'WP WW-Soll: verzögern', label: 'Flow 1' }],
    secrets: ['tok-abcdefghijklmnop', 'CH9999988887777'],
  });
  const text = buildReport({
    info: {
      appVersion: '0.3.0', homeyVersion: '12.4.0', platform: 'local', language: 'de', tz: 'Europe/Zurich', now: Date.UTC(2026, 10, 14, 11, 0, 0),
    },
    config: {
      enabled: true,
      silent: true,
      devices: { meter: { id: 'abc' }, house: { id: '' }, pv: { id: 'p' } },
      battery: { deviceId: 'b', control: { enabled: true, live: false } },
      charger: { id: 'c', live: false },
      dhw: { enabled: true, live: false, output: 'card', delay: { enabled: false } },
      sgready: { enabled: true, live: false, output: 'flows' },
      fuse: { enabled: false },
      consumers: [
        { name: 'Mein Geschirrspüler', mode: 'program', enabled: true, live: false, program: { durationH: 3, maxWaitH: 4 } },
        { name: 'eBike', mode: 'surplus', enabled: true, live: true },
      ],
    },
    priceDevices: [{ settings: { token: 'tok-abcdefghijklmnop', environment: 'prod', vat: 8.1, apiCode: 'CH9999988887777' } }],
    logs: [
      { ts: Date.UTC(2026, 10, 14, 10, 59, 0), level: 'log', text: '[EMS] Mein Geschirrspüler: Start' },
      { ts: Date.UTC(2026, 10, 14, 10, 59, 30), level: 'error', text: 'Aktion WP WW-Soll: verzögern fehlgeschlagen, Token tok-abcdefghijklmnop' },
    ],
    redact,
  });
  assert.match(text, /# Diagnose Dynamischer Stromtarif CH/);
  assert.match(text, /App-Version: 0\.3\.0 \| Homey: local 12\.4\.0/);
  assert.match(text, /EMS ein: ja \| Testmodus \(Silent\): ja/);
  assert.match(text, /Warmwasser-Programm: ein ja, live nein, Ausgabe card, Verzögern nein/);
  assert.match(text, /Verbraucher 2: Typ surplus, ein ja, live ja/);
  assert.match(text, /Verbraucher 1: Typ program, ein ja, live nein, Programmdauer 3 h, Wartezeit 4 h/);
  assert.match(text, /environment=prod, vat=8\.1/, 'harmlose Einstellungen stehen drin');
  assert.match(text, /\[FEHLER\] Aktion Flow 1 fehlgeschlagen, Token <geheim>/);
  assert.match(text, /\[log\] \[EMS\] Verbraucher 1: Start/);
  for (const bad of ['Mein Geschirrspüler', 'WP WW-Soll', 'tok-abcdefghijklmnop', 'CH9999988887777', 'apiCode', 'token=']) {
    assert.equal(text.includes(bad), false, `${bad} darf nicht im Bericht stehen`);
  }
});

test('buildReport: ohne Konfiguration und ohne Meldungen bricht nichts', () => {
  const text = buildReport({});
  assert.match(text, /Gekoppelte Geräte: 0/);
  assert.match(text, /Letzte Meldungen \(0\)/);
  assert.match(text, /\(keine\)/);
});

test('buildReport: Hinweise der Laufzeit fallen weg, gleiche Zeilen werden zusammengefasst, im Testmodus steht, dass nichts gesendet wird', () => {
  const text = buildReport({
    config: { silent: true },
    logs: [
      { ts: 1, level: 'log', text: 'Device.zoneName is deprecated.' },
      { ts: 2, level: 'log', text: 'gleich' },
      { ts: 3, level: 'log', text: 'gleich' },
      { ts: 4, level: 'log', text: 'gleich' },
      { ts: 5, level: 'error', text: 'gleich' },
    ],
  });
  assert.equal(/zoneName/.test(text), false);
  assert.match(text, /\[log\] gleich \(3×\)/);
  assert.match(text, /\[FEHLER\] gleich(\n|$)/);
  assert.match(text, /jetzt ist der Testmodus an: es wird nichts gesendet/);
  assert.equal(/jetzt ist der Testmodus an/.test(buildReport({ config: { silent: false } })), false);
});
