/* Energiemanagement-Reiter der Einstellungen. Wird von index.html nach onHomeyReady gestartet:
 *   window.EmsUi.init(apiCall, lang)
 * apiCall(method, path, body) -> Promise. Alle Texte hier, damit index.html klein bleibt. */
(function () {
  'use strict';

  var STR = {
    de: {
      tab: 'EMS', subMain: 'Betrieb',
      intro: 'Steuert die Wallbox und einzelne Verbraucher nach Batterie und Überschuss. Solange "Befehle senden" aus ist, wird nur gerechnet und protokolliert (Trockenlauf).',
      enable: 'Energiemanagement aktivieren',
      type: 'Typ', typeGeneric: 'Allgemeiner Verbraucher', typeDehum: 'Luftentfeuchter', humTitle: 'Feuchte-Notlauf', humEnable: 'Notlauf bei hoher Luftfeuchtigkeit', humSensor: 'Feuchte-Sensor', humOn: 'Notlauf ein ab (%)', humOff: 'Notlauf aus unter (%)', humRun: 'Höchstdauer (min)', humHint: 'Läuft unabhängig von Batterie und Überschuss, bis die Feuchte unter den Aus-Wert fällt oder die Höchstdauer um ist. Danach startet er erst wieder, wenn die Feuchte zwischendurch unter den Ein-Wert gefallen ist.',
      cmpOff: 'Das Energiemanagement ist ausgeschaltet, es kommen keine neuen Vergleichsdaten. Gezeigt werden die bisherigen. Zum Weitervergleichen im Reiter «Betrieb» aktivieren (Testbetrieb, es wird nichts gesteuert).',
      cmpSource: 'Vergleichsquelle', cmpTab: 'Vergleich', cmpIntro: 'Was dieses Energiemanagement tun würde, verglichen mit dem, was das EMS von Andi tut. Gleich = beide wählen im selben Lauf denselben Modus.',
      cmpBattery: 'Batterie', cmpCharger: 'Wallbox', overall: 'Gesamt gleich', perDay: 'Pro Tag', changes: 'Letzte Wechsel', time: 'Zeit', price: 'Preis', reason: 'Grund', runs: 'Läufe', compared: 'Vergleiche', mine: 'Dieses EMS', theirs: 'Andis EMS', none: 'Noch keine Daten.',
      noDevice: 'Das Energiemanagement ist noch nicht eingerichtet. Füge in Homey unter «Geräte» → «+» → «Dynamischer Stromtarif CH» das Gerät «Energiemanagement» hinzu.',
      pvTitle: 'PV-Prognose', pvFactor: 'Korrekturfaktor', pvHint: 'Deine eigene PV-Prognose lieferst du per Flow-Aktion «PV-Prognose setzen» ein. Der Faktor wird auf jeden Wert angewendet (zum Beispiel 0.75, wenn sie meist 25 % zu hoch liegt).', pvNone: 'Noch keine Prognose eingeliefert.', pvSlots: 'Einträge', pvAgo: 'zuletzt eingeliefert vor', pvStale: 'veraltet', pvMin: 'min', pvH: 'h',
      devicesSec: 'Geräte für das Energiemanagement', devicesMissing: 'Noch nicht alle Geräte gewählt. Das geht im Setup unter «Geräte für das Energiemanagement».', chosen: 'gewählt', pickFirst: '- zuerst Gerät wählen -', nowSec: 'Jetzt (Vergleich)', devicesHint: 'Welche Geräte das Energiemanagement lesen und steuern soll. Die Auswahl bleibt nur auf deinem Homey.',
      meter: 'Netzzähler (+ = Bezug)', house: 'Hausverbrauch', inverter: 'PV-Wechselrichter', battery2: 'Batterie', charger2: 'Wallbox', andiEmsDev: 'EMS von Andi (optional, nur Vergleich)', capab: 'Wert (Capability)', notChosen: 'noch nicht gewählt',
      control: 'Steuerung', controlHint: 'Pro Bereich: ein = die App schaltet das Gerät wirklich, aus = sie rechnet nur mit (Trockenlauf). Beim Ausschalten bleibt das Gerät, wie es gerade ist.', on: 'ein', offTag: 'aus', toggleFailed: 'Schalter konnte nicht gesetzt werden',
      status: 'Jetzt',
      planner: 'Planer würde', andi: 'Andis EMS', battery: 'Batterie', grid: 'Netz', gate: 'Prognose-Sperre', open: 'offen', closed: 'zu',
      wallbox: 'Wallbox', live: 'Befehle senden (live)', liveWarn: 'Steuert schon ein anderes Energiemanagement diese Wallbox, dort zuerst ausschalten. Sonst steuern zwei Systeme dieselbe Wallbox.',
      chargeNow: 'Sofortladen (volle Leistung)', maxAmps: 'Maximalstrom (A)', stepHold: 'Haltezeit vor Erhöhung (s)',
      consumers: 'Verbraucher', add: 'Verbraucher hinzufügen', remove: 'Entfernen', device: 'Gerät', pick: '- Gerät wählen -', name: 'Name',
      mode: 'Einschalten', modeFull: 'Bei voller Batterie', modeSoc: 'Ab Batterie-SoC', modeSurplus: 'Bei Überschuss',
      fullSoc: 'Voll ab SoC (%)', socOn: 'Ein ab SoC (%)', hysteresis: 'Aus unter (Prozentpunkte darunter)',
      minSurplus: 'Mindest-Überschuss (W)', startSustain: 'Überschuss muss anhalten (s)', stopGrace: 'Karenz vor dem Ausschalten (s)',
      minRun: 'Mindestlaufzeit (min)', minOff: 'Mindest-Pause (min)', protect: 'Schutz-SoC: darunter sofort aus (%)', useGate: 'Prognose-Sperre beachten',
      noConsumers: 'Noch kein Verbraucher.', events: 'Letzte Schaltvorgänge', dryRun: 'Trockenlauf', liveTag: 'live',
      batterySec: 'Batterie-Planer (nur Vergleich mit Andis EMS)', targetSoc: 'Ziel-SoC (%)', reserve: 'Reserve (Stunden)', solarLimit: 'Solar-Schwelle (kWh)',
      save: 'Speichern', run: 'Jetzt rechnen', saved: 'Gespeichert', error: 'Fehler', off: 'Energiemanagement ist ausgeschaltet.',
      agree: 'Übereinstimmung mit Andis EMS', day: 'Tag', same: 'gleich',
    },
    en: {
      tab: 'EMS', subMain: 'Operation',
      intro: 'Controls the EV charger and single consumers by battery state and surplus. While "Send commands" is off, it only calculates and logs (dry run).',
      enable: 'Enable energy management',
      type: 'Type', typeGeneric: 'Generic consumer', typeDehum: 'Dehumidifier', humTitle: 'Humidity emergency run', humEnable: 'Emergency run at high humidity', humSensor: 'Humidity sensor', humOn: 'Emergency run on from (%)', humOff: 'Emergency run off below (%)', humRun: 'Maximum duration (min)', humHint: 'Runs regardless of battery and surplus until humidity drops below the off value or the maximum duration is over. It only starts again after humidity has dropped below the on value in between.',
      cmpOff: 'Energy management is switched off, so no new comparison data arrives. The previous data is shown. To keep comparing, enable it in the "Operation" view (test mode, nothing is controlled).',
      cmpSource: 'Comparison source', cmpTab: 'Compare', cmpIntro: "What this energy management would do, compared with what Andi's EMS does. Same = both choose the same mode in the same run.",
      cmpBattery: 'Battery', cmpCharger: 'EV charger', overall: 'Overall same', perDay: 'Per day', changes: 'Recent changes', time: 'Time', price: 'Price', reason: 'Reason', runs: 'Runs', compared: 'Comparisons', mine: 'This EMS', theirs: "Andi's EMS", none: 'No data yet.',
      noDevice: 'Energy management is not set up yet. In Homey go to Devices → "+" → "Swiss Dynamic Electricity Tariff" and add the "Energy management" device.',
      pvTitle: 'Solar forecast', pvFactor: 'Correction factor', pvHint: 'You feed your own solar forecast with the Flow action "Set the solar forecast". The factor is applied to every value (for example 0.75 if it is usually 25 % too high).', pvNone: 'No forecast fed yet.', pvSlots: 'entries', pvAgo: 'last fed', pvStale: 'outdated', pvMin: 'min', pvH: 'h',
      devicesSec: 'Devices for energy management', devicesMissing: 'Not all devices chosen yet. You can do that in Setup under "Devices for energy management".', chosen: 'chosen', pickFirst: '- choose a device first -', nowSec: 'Now (comparison)', devicesHint: 'Which devices the energy management reads and controls. The choice stays on your Homey only.',
      meter: 'Grid meter (+ = import)', house: 'House consumption', inverter: 'PV inverter', battery2: 'Battery', charger2: 'EV charger', andiEmsDev: "Andi's EMS (optional, comparison only)", capab: 'Value (capability)', notChosen: 'not chosen yet',
      control: 'Control', controlHint: 'Per area: on = the app really switches the device, off = it only calculates along (dry run). Switching off leaves the device as it is.', on: 'on', offTag: 'off', toggleFailed: 'Could not set the switch',
      status: 'Now',
      planner: 'Planner would', andi: "Andi's EMS", battery: 'Battery', grid: 'Grid', gate: 'Forecast gate', open: 'open', closed: 'closed',
      wallbox: 'EV charger', live: 'Send commands (live)', liveWarn: 'If another energy management already controls this charger, switch it off there first. Otherwise two systems control the same charger.',
      chargeNow: 'Charge now (full power)', maxAmps: 'Maximum current (A)', stepHold: 'Hold time before increase (s)',
      consumers: 'Consumers', add: 'Add consumer', remove: 'Remove', device: 'Device', pick: '- choose device -', name: 'Name',
      mode: 'Switch on', modeFull: 'When battery is full', modeSoc: 'From battery SoC', modeSurplus: 'On surplus',
      fullSoc: 'Full from SoC (%)', socOn: 'On from SoC (%)', hysteresis: 'Off below (points under that)',
      minSurplus: 'Minimum surplus (W)', startSustain: 'Surplus must last (s)', stopGrace: 'Grace before switching off (s)',
      minRun: 'Minimum run time (min)', minOff: 'Minimum pause (min)', protect: 'Protect SoC: off immediately below (%)', useGate: 'Respect forecast gate',
      noConsumers: 'No consumer yet.', events: 'Recent switching', dryRun: 'dry run', liveTag: 'live',
      batterySec: "Battery planner (comparison with Andi's EMS only)", targetSoc: 'Target SoC (%)', reserve: 'Reserve (hours)', solarLimit: 'Solar threshold (kWh)',
      save: 'Save', run: 'Calculate now', saved: 'Saved', error: 'Error', off: 'Energy management is switched off.',
      agree: "Agreement with Andi's EMS", day: 'Day', same: 'same',
    },
  };

  var api = null;
  var S = STR.en;
  var LANG = 'en';
  var state = { cfg: null, shadow: null, devices: [], consumers: [], events: [], timer: null, msg: '' };

  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function time(ms) {
    if (!ms) return '-';
    try {
      return new Date(ms).toLocaleString(LANG === 'de' ? 'de-CH' : 'en-GB', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return String(ms); }
  }
  function num(id, fallback) {
    var el = $(id);
    var v = el && el.value !== '' && el.value !== null && el.value !== undefined ? Number(el.value) : NaN;
    return isFinite(v) ? v : fallback;
  }
  function chk(id) { var el = $(id); return !!(el && el.checked); }
  function val(id, fallback) { var el = $(id); return el && el.value !== '' && el.value !== undefined ? el.value : fallback; }

  function modeLabel(m) { return { charge: LANG === 'de' ? 'laden' : 'charge', hold: LANG === 'de' ? 'halten' : 'hold', normal: 'normal' }[m] || m || '-'; }

  // ---------------------------------------------------------------- Formular -> Konfiguration

  function collectConsumers() {
    return state.consumers.map(function (c, i) {
      var p = 'ems-c' + i + '-';
      return {
        id: val(p + 'id', c.id), name: val(p + 'name', c.name), enabled: true, live: c.live === true,
        mode: val(p + 'mode', c.mode),
        fullSoc: num(p + 'fullSoc', c.fullSoc), socOn: num(p + 'socOn', c.socOn), hysteresis: num(p + 'hysteresis', c.hysteresis),
        minSurplusW: num(p + 'minSurplusW', c.minSurplusW), startSustainS: num(p + 'startSustainS', c.startSustainS),
        stopGraceS: num(p + 'stopGraceS', c.stopGraceS), minRunMin: num(p + 'minRunMin', c.minRunMin),
        minOffMin: num(p + 'minOffMin', c.minOffMin), protectSoc: num(p + 'protectSoc', c.protectSoc),
        useForecastGate: chk(p + 'useGate'),
        type: val(p + 'type', c.type || 'generic'),
        humidity: {
          enabled: chk(p + 'humEnable'),
          sensorId: val(p + 'humSensor', (c.humidity && c.humidity.sensorId) || ''),
          capability: (c.humidity && c.humidity.capability) || 'measure_humidity',
          onAbove: num(p + 'humOn', c.humidity ? c.humidity.onAbove : 65),
          offBelow: num(p + 'humOff', c.humidity ? c.humidity.offBelow : 61),
          runMin: num(p + 'humRun', c.humidity ? c.humidity.runMin : 60),
        },
      };
    });
  }

  function collect() {
    var cfg = state.cfg;
    return {
      enabled: chk('ems-enabled'),
      devices: {
        meter: { id: val('ems-d-meter', cfg.devices.meter.id), capability: val('ems-d-meter-cap', cfg.devices.meter.capability) },
        house: { id: val('ems-d-house', cfg.devices.house.id), capability: val('ems-d-house-cap', cfg.devices.house.capability) },
        inverter: { id: val('ems-d-inv', cfg.devices.inverter.id), capability: val('ems-d-inv-cap', cfg.devices.inverter.capability) },
        andiEms: val('ems-d-andi', cfg.devices.andiEms),
      },
      charger: { id: val('ems-d-chg', cfg.charger.id), chargeNow: chk('ems-chargenow'), maxAmps: num('ems-maxamps', cfg.charger.maxAmps), stepHoldS: num('ems-stephold', cfg.charger.stepHoldS) },
      pv: { factor: num('ems-pv-factor', cfg.pv ? cfg.pv.factor : 1) },
      consumers: collectConsumers(),
      battery: { deviceId: val('ems-d-bat', cfg.battery.deviceId), socCapability: val('ems-d-bat-cap', cfg.battery.socCapability), targetSoc: num('ems-b-target', cfg.battery.targetSoc), reserveHours: num('ems-b-reserve', cfg.battery.reserveHours), solarLimitKwh: num('ems-b-solar', cfg.battery.solarLimitKwh) },
    };
  }

  // ---------------------------------------------------------------- Darstellung

  function field(label, id, value, type, extra) {
    return '<label class="ems-f"><span>' + esc(label) + '</span><input id="' + id + '" type="' + (type || 'number') + '" value="' + esc(value) + '"' + (extra || '') + '></label>';
  }
  function check(label, id, on) {
    return '<label class="ems-c"><input class="sw" id="' + id + '" type="checkbox"' + (on ? ' checked' : '') + '> <span>' + esc(label) + '</span></label>';
  }

  function consumerRow(c, i) {
    var p = 'ems-c' + i + '-';
    var opts = deviceOptions(c.id, hasCap(/^onoff$/));
    var modes = [['full', S.modeFull], ['soc', S.modeSoc], ['surplus', S.modeSurplus]].map(function (m) {
      return '<option value="' + m[0] + '"' + (m[0] === c.mode ? ' selected' : '') + '>' + esc(m[1]) + '</option>';
    }).join('');
    var params = '';
    if (c.mode === 'full') params += field(S.fullSoc, p + 'fullSoc', c.fullSoc) + field(S.hysteresis, p + 'hysteresis', c.hysteresis);
    if (c.mode === 'soc') params += field(S.socOn, p + 'socOn', c.socOn) + field(S.hysteresis, p + 'hysteresis', c.hysteresis);
    if (c.mode === 'surplus') {
      params += field(S.minSurplus, p + 'minSurplusW', c.minSurplusW) + field(S.startSustain, p + 'startSustainS', c.startSustainS)
        + field(S.stopGrace, p + 'stopGraceS', c.stopGraceS);
    }
    var typeOpts = [['generic', S.typeGeneric], ['dehumidifier', S.typeDehum]].map(function (t) {
      return '<option value="' + t[0] + '"' + (t[0] === (c.type || 'generic') ? ' selected' : '') + '>' + esc(t[1]) + '</option>';
    }).join('');
    var h = c.humidity || { enabled: false, sensorId: '', onAbove: 65, offBelow: 61, runMin: 60 };
    var humBlock = (c.type === 'dehumidifier')
      ? '<div class="ems-box"><h3>' + esc(S.humTitle) + '</h3>'
        + '<div class="ems-row">' + check(S.humEnable, p + 'humEnable', h.enabled) + '</div>'
        + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.humSensor) + '</span><select id="' + p + 'humSensor">' + deviceOptions(h.sensorId, hasCap(/^measure_humidity$/)) + '</select></label>'
        + field(S.humOn, p + 'humOn', h.onAbove) + field(S.humOff, p + 'humOff', h.offBelow) + field(S.humRun, p + 'humRun', h.runMin) + '</div>'
        + '<p class="sub">' + esc(S.humHint) + '</p></div>'
      : '';
    return '<div class="ems-box">'
      + '<div class="ems-row"><label class="ems-f"><span>' + esc(S.type) + '</span><select id="' + p + 'type" data-ems-mode="' + i + '">' + typeOpts + '</select></label></div>'
      + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.device) + '</span><select id="' + p + 'id">' + opts + '</select></label>'
      + field(S.name, p + 'name', c.name, 'text') + '</div>'
      + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.mode) + '</span><select id="' + p + 'mode" data-ems-mode="' + i + '">' + modes + '</select></label></div>'
      + '<div class="ems-row">' + params + '</div>'
      + '<div class="ems-row">' + field(S.minRun, p + 'minRunMin', c.minRunMin) + field(S.minOff, p + 'minOffMin', c.minOffMin) + field(S.protect, p + 'protectSoc', c.protectSoc) + '</div>'
      + '<div class="ems-row">' + check(S.useGate, p + 'useGate', c.useForecastGate)
      + '<button class="btn" data-ems-remove="' + i + '">' + esc(S.remove) + '</button></div>'
      + humBlock
      + '</div>';
  }

  function statusHtml() {
    var sh = state.shadow;
    if (!sh || !sh.enabled) return '<p class="sub">' + esc(S.off) + '</p>';
    var cards = [];
    var ch = sh.charger && sh.charger.current;
    if (ch) {
      var g = ch.gate || {};
      cards.push('<div class="ems-card"><div class="ems-k">' + esc(S.wallbox) + ' ' + esc(ch.live ? S.liveTag : S.dryRun) + '</div><div class="ems-v">' + esc(ch.mine.mode) + '</div><div class="ems-s">' + esc(ch.mine.reason) + '</div></div>');
      cards.push('<div class="ems-card"><div class="ems-k">' + esc(S.grid) + '</div><div class="ems-v">' + esc(ch.gridW === null || ch.gridW === undefined ? '-' : Math.round(ch.gridW) + ' W') + '</div><div class="ems-s">PV ' + esc(ch.pvW === null ? '-' : Math.round(ch.pvW)) + ' W</div></div>');
      cards.push('<div class="ems-card"><div class="ems-k">' + esc(S.gate) + '</div><div class="ems-v">' + esc(g.blocked ? S.closed : S.open) + '</div><div class="ems-s">' + esc(g.remainingKwh !== null && g.remainingKwh !== undefined ? g.remainingKwh + ' / ' + g.thresholdKwh + ' kWh' : (g.reason || '')) + '</div></div>');
    }
    var cur = sh.current;
    if (cur) {
      cards.push('<div class="ems-card"><div class="ems-k">' + esc(S.battery) + '</div><div class="ems-v">' + esc(cur.soc === null ? '-' : Math.round(cur.soc) + ' %') + '</div><div class="ems-s">' + esc(modeLabel(cur.mine.mode)) + '</div></div>');
    }
    var warn = ch && ch.warning ? '<p class="warn">' + esc(ch.warning) + '</p>' : '';
    var errs = cur && cur.errors && cur.errors.length ? '<p class="warn">' + esc(cur.errors.join(' | ')) + '</p>' : '';
    var consumers = (state.consumersState || []).map(function (c) {
      return '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.isOn ? 'ein' : 'aus') + '</td><td>' + esc(c.live ? S.liveTag : S.dryRun) + '</td><td>' + esc(c.reason) + '</td></tr>';
    }).join('');
    var ev = (state.events || []).slice(0, 12).map(function (e) {
      return '<tr><td>' + esc(time(e.ts)) + '</td><td>' + esc(e.name) + '</td><td>' + esc(e.cmd === 'on' ? 'ein' : 'aus') + '</td><td>' + esc(e.live ? S.liveTag : S.dryRun) + '</td><td>' + esc(e.reason) + '</td></tr>';
    }).join('');
    return '<div class="ems-cards">' + cards.join('') + '</div>' + warn + errs
      + (consumers ? '<table class="ems-t">' + consumers + '</table>' : '')
      + (ev ? '<h3>' + esc(S.events) + '</h3><table class="ems-t">' + ev + '</table>' : '');
  }

  function deviceOptions(current, filter) {
    return '<option value="">' + esc(S.pick) + '</option>' + state.devices.filter(function (d) {
      return d.id === current || !filter || filter(d);
    }).map(function (d) {
      return '<option value="' + esc(d.id) + '"' + (d.id === current ? ' selected' : '') + '>' + esc(d.name) + '</option>';
    }).join('');
  }
  function hasCap(re) { return function (d) { return (d.caps || []).some(function (c) { return re.test(c); }); }; }
  function findDevice(id) {
    for (var k = 0; k < state.devices.length; k++) if (state.devices[k].id === id) return state.devices[k];
    return null;
  }
  /** Auswahl der Capability aus dem gewählten Gerät; nur passende, der aktuelle Wert bleibt immer wählbar. */
  function capOptions(devId, re, current) {
    var d = findDevice(devId);
    if (!d) return '<option value="">' + esc(S.pickFirst) + '</option>' + (current ? '<option value="' + esc(current) + '" selected>' + esc(current) + '</option>' : '');
    var caps = (d.caps || []).filter(function (c) { return re.test(c) || c === current; });
    if (current && caps.indexOf(current) < 0) caps.push(current);
    return caps.map(function (c) {
      var t = d.capTitles && d.capTitles[c];
      return '<option value="' + esc(c) + '"' + (c === current ? ' selected' : '') + '>' + esc(t ? t + ' (' + c + ')' : c) + '</option>';
    }).join('');
  }
  /** Beste Capability für ein neu gewähltes Gerät: bevorzugte, sonst bisherige, sonst die erste passende. */
  function pickCap(devId, re, current, prefer) {
    var d = findDevice(devId);
    if (!d) return current;
    var caps = (d.caps || []).filter(function (c) { return re.test(c); });
    if (prefer && caps.indexOf(prefer) >= 0) return prefer;
    if (caps.indexOf(current) >= 0) return current;
    return caps[0] || current;
  }
  var CAP_RE = { meter: /^measure_power/, house: /^measure_power/, inv: /^measure_power/, bat: /^measure_battery/ };
  function devRow(label, idField, cur, filter, capField, capVal, capRe) {
    return '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(label) + '</span><select id="' + idField + '"' + (capField ? ' data-ems-dev="' + idField + '"' : '') + '>' + deviceOptions(cur, filter) + '</select></label>'
      + (capField ? '<label class="ems-f ems-wide"><span>' + esc(S.capab) + '</span><select id="' + capField + '">' + capOptions(cur, capRe, capVal) + '</select></label>' : '') + '</div>';
  }
  function chosenCount() {
    var c = state.cfg;
    return [c.devices.meter.id, c.devices.house.id, c.devices.inverter.id, c.battery.deviceId, c.charger.id].filter(Boolean).length;
  }

  function devicesHtml() {
    var c = state.cfg;
    var chosen = [c.devices.meter.id, c.devices.house.id, c.devices.inverter.id, c.battery.deviceId, c.charger.id].filter(Boolean).length;
    return '<p class="sub">' + esc(S.devicesHint) + '</p>'
      + devRow(S.meter, 'ems-d-meter', c.devices.meter.id, hasCap(/^measure_power/), 'ems-d-meter-cap', c.devices.meter.capability, CAP_RE.meter)
      + devRow(S.house, 'ems-d-house', c.devices.house.id, hasCap(/^measure_power/), 'ems-d-house-cap', c.devices.house.capability, CAP_RE.house)
      + devRow(S.inverter, 'ems-d-inv', c.devices.inverter.id, hasCap(/^measure_power/), 'ems-d-inv-cap', c.devices.inverter.capability, CAP_RE.inv)
      + devRow(S.battery2, 'ems-d-bat', c.battery.deviceId, hasCap(/^measure_battery/), 'ems-d-bat-cap', c.battery.socCapability, CAP_RE.bat)
      + devRow(S.charger2, 'ems-d-chg', c.charger.id, hasCap(/^(evcharger_charging|target_power)/), null, null)
      + '<p><button class="btn primary" data-ems-save="1">' + esc(S.save) + '</button> <span class="sub" id="ems-msg-dev">' + esc(state.msg) + '</span></p>';
  }

  function toggleRow(target, label, on) {
    return '<label class="ems-c ems-tg"><input class="sw" type="checkbox" data-ems-toggle="' + esc(target) + '"' + (on ? ' checked' : '') + '> <span>' + esc(label) + '</span> <span class="ems-s">' + esc(on ? S.on : S.offTag) + '</span></label>';
  }

  function pvHtml() {
    var sh = state.shadow || {};
    var pv = sh.pv || {};
    var info = S.pvNone;
    if (pv.externalAt) {
      var min = Math.max(0, Math.round((Date.now() - pv.externalAt) / 60000));
      info = S.pvAgo + ' ' + (min < 120 ? min + ' ' + S.pvMin : Math.round(min / 60) + ' ' + S.pvH) + ' (' + pv.slots + ' ' + S.pvSlots + ')' + (pv.stale ? ' - ' + S.pvStale : '');
    }
    var factor = state.cfg.pv ? state.cfg.pv.factor : 1;
    return '<div class="card"><h2>' + esc(S.pvTitle) + '</h2><p class="sub">' + esc(S.pvHint) + '</p>'
      + '<div class="ems-row">' + field(S.pvFactor, 'ems-pv-factor', factor, 'number', ' step="0.01" min="0.1" max="3"') + '</div>'
      + '<p class="sub" id="ems-pv-info">' + esc(info) + '</p></div>';
  }

  function controlHtml() {
    var c = state.cfg;
    var rows = [toggleRow('charger', S.wallbox, c.charger.live)].concat((c.consumers || []).map(function (x) {
      return toggleRow(x.id, x.name, x.live);
    }));
    return '<div class="card"><h2>' + esc(S.control) + '</h2><p class="sub">' + esc(S.controlHint) + '</p>' + rows.join('') + '<p class="warn" id="ems-toggle-err" hidden></p></div>';
  }

  function counts(o) {
    var keys = Object.keys(o || {});
    return keys.length ? keys.map(function (k) { return modeLabel(k) + ' ' + o[k]; }).join(' / ') : '-';
  }

  /** Vergleichstabelle für einen Bereich (Batterie oder Wallbox). */
  function cmpSection(title, data) {
    if (!data) return '<div class="card"><h2>' + esc(title) + '</h2><p class="sub">' + esc(S.none) + '</p></div>';
    var pct = data.overallAgreePct === null || data.overallAgreePct === undefined ? '-' : data.overallAgreePct + ' %';
    var days = (data.days || []).slice().reverse().map(function (d) {
      return '<tr><td>' + esc(d.day) + '</td><td>' + esc(d.agreePct === null || d.agreePct === undefined ? '-' : d.agreePct + ' %') + '</td><td>' + esc(d.compared) + '/' + esc(d.ticks) + '</td><td>' + esc(counts(d.mine)) + '</td><td>' + esc(counts(d.andi)) + '</td></tr>';
    }).join('');
    var ev = (data.events || []).slice(0, 25).map(function (e) {
      return '<tr><td>' + esc(time(e.ts)) + '</td><td>' + esc(e.soc === null || e.soc === undefined ? '-' : e.soc + ' %') + '</td><td>' + esc(e.price === null || e.price === undefined ? '-' : e.price) + '</td><td>' + esc(modeLabel(e.mine)) + '</td><td>' + esc(modeLabel(e.andi)) + '</td><td>' + esc(e.reason) + '</td></tr>';
    }).join('');
    return '<div class="card"><h2>' + esc(title) + '</h2><p class="sub">' + esc(S.overall) + ': <b>' + esc(pct) + '</b></p>'
      + (days ? '<h3>' + esc(S.perDay) + '</h3><table class="ems-t"><tr><th>' + esc(S.day) + '</th><th>' + esc(S.same) + '</th><th>' + esc(S.compared) + '/' + esc(S.runs) + '</th><th>' + esc(S.mine) + '</th><th>' + esc(S.theirs) + '</th></tr>' + days + '</table>' : '<p class="sub">' + esc(S.none) + '</p>')
      + (ev ? '<h3>' + esc(S.changes) + '</h3><table class="ems-t"><tr><th>' + esc(S.time) + '</th><th>SoC</th><th>' + esc(S.price) + '</th><th>' + esc(S.mine) + '</th><th>' + esc(S.theirs) + '</th><th>' + esc(S.reason) + '</th></tr>' + ev + '</table>' : '')
      + '</div>';
  }

  /** "Jetzt": Entscheid dieses EMS neben dem von Andis EMS (Batterie und Wallbox). */
  function compareNowHtml() {
    var sh = state.shadow;
    var cards = [];
    var ch = sh.charger && sh.charger.current;
    var cur = sh.current;
    if (ch) {
      cards.push('<div class="ems-card"><div class="ems-k">' + esc(S.cmpCharger) + ' - ' + esc(S.mine) + '</div><div class="ems-v">' + esc(ch.mine.mode) + '</div><div class="ems-s">' + esc(ch.mine.reason) + '</div></div>');
      cards.push('<div class="ems-card"><div class="ems-k">' + esc(S.cmpCharger) + ' - ' + esc(S.theirs) + '</div><div class="ems-v">' + esc(ch.andi ? ch.andi.mode : '-') + '</div><div class="ems-s">' + esc(ch.andi ? ch.andi.reason : '') + '</div></div>');
    }
    if (cur) {
      cards.push('<div class="ems-card"><div class="ems-k">' + esc(S.cmpBattery) + ' - ' + esc(S.mine) + '</div><div class="ems-v">' + esc(modeLabel(cur.mine.mode)) + '</div><div class="ems-s">' + esc(cur.soc === null ? '' : Math.round(cur.soc) + ' %') + '</div></div>');
      cards.push('<div class="ems-card"><div class="ems-k">' + esc(S.cmpBattery) + ' - ' + esc(S.theirs) + '</div><div class="ems-v">' + esc(modeLabel(cur.andi && cur.andi.mode)) + '</div><div class="ems-s">' + esc(cur.andi ? cur.andi.reason : '') + '</div></div>');
    }
    return cards.length ? '<div class="card"><h2>' + esc(S.nowSec) + '</h2><div class="ems-cards">' + cards.join('') + '</div></div>' : '';
  }

  /** Einstellungen, die nur der Vergleich braucht: Vergleichsquelle und Batterie-Planer. Wird einmal gezeichnet. */
  function compareSettingsHtml() {
    var c = state.cfg;
    return '<div class="card"><h2>' + esc(S.cmpSource) + '</h2>'
      + devRow(S.andiEmsDev, 'ems-d-andi', c.devices.andiEms, hasCap(/^ems_mode$/), null, null)
      + '</div>'
      + '<details class="card sec"><summary><h2>' + esc(S.batterySec) + '</h2></summary><div class="ems-row">'
      + field(S.targetSoc, 'ems-b-target', c.battery.targetSoc) + field(S.reserve, 'ems-b-reserve', c.battery.reserveHours) + field(S.solarLimit, 'ems-b-solar', c.battery.solarLimitKwh)
      + '</div></details>'
      + '<p><button class="btn" data-ems-save="1">' + esc(S.save) + '</button> <span class="sub" id="ems-msg-cmp">' + esc(state.msg) + '</span></p>';
  }

  function renderCompare() {
    var panel = $('ems-view-cmp');
    if (!panel) return;
    if (!state.cmpBuilt && state.cfg) {
      panel.innerHTML = '<div id="ems-cmp-data"></div><div id="ems-cmp-settings">' + compareSettingsHtml() + '</div>';
      state.cmpBuilt = true;
    }
    var host = $('ems-cmp-data');
    if (!host) return;
    var sh = state.shadow;
    if (!sh) { host.innerHTML = '<div class="card"><p class="sub">' + esc(S.none) + '</p></div>'; return; }
    // Auch bei ausgeschaltetem EMS die bisherigen Vergleichsdaten zeigen, mit Hinweis.
    host.innerHTML = '<style>.ems-t{border-collapse:collapse;width:100%;font-size:12px;margin:6px 0}.ems-t td,.ems-t th{padding:3px 6px;border-bottom:1px solid var(--st-border);vertical-align:top;text-align:left}</style>'
      + '<div class="card"><p class="sub">' + esc(S.cmpIntro) + '</p></div>'
      + (sh.enabled ? '' : '<div class="card"><p class="warn">' + esc(S.cmpOff) + '</p></div>')
      + compareNowHtml()
      + '<style>.ems-cards{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.ems-card{flex:1 1 140px;border:1px solid var(--st-border);border-radius:8px;padding:8px 10px;background:var(--st-card-bg)}.ems-k{font-size:12px;color:var(--st-muted)}.ems-v{font-size:18px;font-weight:600}.ems-s{font-size:12px;color:var(--st-muted)}</style>'
      + cmpSection(S.cmpBattery, { overallAgreePct: sh.overallAgreePct, days: sh.days, events: sh.events })
      + cmpSection(S.cmpCharger, sh.charger ? { overallAgreePct: sh.charger.overallAgreePct, days: sh.charger.days, events: sh.charger.events } : null);
  }

  /** Geräte-Auswahl liegt im Setup-Reiter (eigener Container in index.html). */
  /** Ohne das Gerät "Energiemanagement" läuft das EMS nicht: nur ein Hinweis, wie man es hinzufügt. */
  function noDevice() {
    return !!(state.shadow && state.shadow.deviceExists === false);
  }

  function renderDevices() {
    var host = $('ems-view-devices');
    if (!host || !state.cfg) return;
    if (noDevice()) {
      host.innerHTML = '<p class="warn">' + esc(S.noDevice) + '</p>';
      var h0 = $('h2-emsdev');
      if (h0) h0.innerHTML = '<span class="st-open"></span>' + esc(S.devicesSec);
      return;
    }
    host.innerHTML = devicesHtml();
    var head = $('h2-emsdev');
    if (head) {
      var done = chosenCount() >= 5;
      head.innerHTML = (done ? '<span class="st-check">✓</span>' : '<span class="st-open"></span>') + esc(S.devicesSec) + ' <span class="ems-s">' + chosenCount() + '/5 ' + esc(S.chosen) + '</span>';
    }
  }

  function render() {
    state.renderedNoDevice = noDevice();
    renderDevices();
    var panel = $('ems-view-main');
    if (!panel || !state.cfg) return;
    if (noDevice()) {
      panel.innerHTML = '<div class="card"><p class="warn">' + esc(S.noDevice) + '</p></div>';
      return;
    }
    var c = state.cfg;
    var list = state.consumers.length ? state.consumers.map(consumerRow).join('') : '<p class="sub">' + esc(S.noConsumers) + '</p>';
    panel.innerHTML = '<style>'
      + '.ems-cards{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.ems-card{flex:1 1 140px;border:1px solid var(--st-border);border-radius:8px;padding:8px 10px;background:var(--st-card-bg)}'
      + '.ems-k{font-size:12px;color:var(--st-muted)}.ems-v{font-size:18px;font-weight:600}.ems-s{font-size:12px;color:var(--st-muted)}'
      + '.ems-row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin:6px 0}.ems-f{display:flex;flex-direction:column;font-size:12px;color:var(--st-muted);gap:2px}'
      + '.ems-f input,.ems-f select{font:inherit;padding:4px 6px;border:1px solid var(--st-border);border-radius:6px;background:var(--st-bg);color:var(--st-text);min-width:90px}.ems-wide{flex:1 1 220px}.ems-wide select{width:100%}'
      + '.ems-c{display:flex;align-items:center;gap:6px;font-size:13px}.ems-box{border:1px solid var(--st-border);border-radius:8px;padding:8px 10px;margin:8px 0}'
      + '.ems-t{border-collapse:collapse;width:100%;font-size:12px;margin:6px 0}.ems-t td{padding:3px 6px;border-bottom:1px solid var(--st-border);vertical-align:top}'
      + '</style>'
      + '<div class="card"><p class="sub">' + esc(S.intro) + '</p>' + check(S.enable, 'ems-enabled', c.enabled) + '</div>'
      + (chosenCount() < 5 ? '<div class="card"><p class="warn">' + esc(S.devicesMissing) + '</p></div>' : '')
      + controlHtml()
      + pvHtml()
      + '<div class="card"><h2>' + esc(S.status) + '</h2><div id="ems-status">' + statusHtml() + '</div></div>'
      + '<div class="card"><h2>' + esc(S.wallbox) + '</h2>'
      + '<div class="ems-row">' + check(S.chargeNow, 'ems-chargenow', c.charger.chargeNow) + '</div>'
      + '<p class="sub">' + esc(S.liveWarn) + '</p>'
      + '<div class="ems-row">' + field(S.maxAmps, 'ems-maxamps', c.charger.maxAmps) + field(S.stepHold, 'ems-stephold', c.charger.stepHoldS) + '</div></div>'
      + '<div class="card"><h2>' + esc(S.consumers) + '</h2>' + list + '<button class="btn" data-ems-add="1">' + esc(S.add) + '</button></div>'
      + '<p><button class="btn" data-ems-save="1">' + esc(S.save) + '</button> <button class="btn" data-ems-run="1">' + esc(S.run) + '</button> <span class="sub" id="ems-msg">' + esc(state.msg) + '</span></p>';
  }

  // ---------------------------------------------------------------- Laden und Speichern

  function load() {
    return Promise.all([
      api('GET', '/ems/shadow'),
      api('GET', '/ems/consumers').catch(function () { return { current: [], events: [] }; }),
    ]).then(function (r) {
      state.shadow = r[0];
      if (!state.cfg) state.cfg = JSON.parse(JSON.stringify(r[0].config)); // eigene Kopie: Formularänderungen dürfen die Serverantwort nicht verändern
      state.serverCfg = r[0].config;
      if (!state.loadedConsumers) { state.consumers = (state.cfg.consumers || []).map(function (c) { return Object.assign({}, c); }); state.loadedConsumers = true; }
      state.consumersState = r[1].current;
      state.events = r[1].events;
      return state;
    });
  }

  function refreshStatusOnly() {
    return load().then(function () {
      if (noDevice() !== state.renderedNoDevice) render(); // Gerät wurde hinzugefügt oder entfernt
      var el = $('ems-status');
      if (el) el.innerHTML = statusHtml();
      renderCompare();
    }).catch(function () {});
  }

  function setMsg(text) {
    state.msg = text;
    var el = $('ems-msg');
    if (el) el.textContent = text;
    var el2 = $('ems-msg-cmp');
    if (el2) el2.textContent = text;
    var el3 = $('ems-msg-dev');
    if (el3) el3.textContent = text;
  }

  function onClick(ev) {
    var t = ev.target;
    if (!t || !t.getAttribute) return;
    if (t.getAttribute('data-ems-add')) {
      state.consumers = collectConsumers().concat([{ id: '', name: S.consumers, mode: 'full', fullSoc: 98, socOn: 80, hysteresis: 5, minSurplusW: 300, startSustainS: 60, stopGraceS: 120, minRunMin: 30, minOffMin: 10, protectSoc: 20, useForecastGate: true, live: false, type: 'generic', humidity: { enabled: false, sensorId: '', capability: 'measure_humidity', onAbove: 65, offBelow: 61, runMin: 60 } }]);
      render();
    } else if (t.getAttribute('data-ems-remove') !== null && t.getAttribute('data-ems-remove') !== undefined) {
      var idx = Number(t.getAttribute('data-ems-remove'));
      var cur = collectConsumers();
      cur.splice(idx, 1);
      state.consumers = cur;
      render();
    } else if (t.getAttribute('data-ems-save')) {
      var body = collect();
      body.consumers = body.consumers.filter(function (c) { return c.id; });
      setMsg('...');
      api('PUT', '/ems/config', body).then(function (cfg) {
        state.cfg = cfg;
        state.consumers = cfg.consumers.map(function (c) { return Object.assign({}, c); });
        setMsg(S.saved);
        render();
        return refreshStatusOnly();
      }).catch(function (e) { setMsg(S.error + ': ' + (e && e.message || e)); });
    } else if (t.getAttribute('data-ems-run')) {
      setMsg('...');
      api('POST', '/ems/run').then(function (sh) { state.shadow = sh; setMsg(''); return refreshStatusOnly(); })
        .catch(function (e) { setMsg(S.error + ': ' + (e && e.message || e)); });
    }
  }

  function syncFormToState() {
    var f = collect();
    state.cfg.enabled = f.enabled;
    state.cfg.devices = f.devices;
    state.cfg.charger = Object.assign({}, state.cfg.charger, f.charger);
    state.cfg.battery = Object.assign({}, state.cfg.battery, f.battery);
    state.consumers = f.consumers;
  }

  function onDeviceChange(t) {
    var id = t.getAttribute('data-ems-dev');
    var map = { 'ems-d-meter': ['meter', 'meter'], 'ems-d-house': ['house', 'house'], 'ems-d-inv': ['inv', 'inverter'], 'ems-d-bat': ['bat', 'battery'] };
    syncFormToState();
    var m = map[id];
    if (m) {
      var re = CAP_RE[m[0]];
      if (m[1] === 'battery') state.cfg.battery.socCapability = pickCap(state.cfg.battery.deviceId, re, state.cfg.battery.socCapability, 'measure_battery');
      else {
        var dv = state.cfg.devices[m[1]];
        dv.capability = pickCap(dv.id, re, dv.capability, m[1] === 'house' ? 'measure_power.load' : 'measure_power');
      }
    }
    render();
  }

  function onToggle(t) {
    var target = t.getAttribute('data-ems-toggle');
    var on = !!t.checked;
    var errEl = $('ems-toggle-err');
    if (errEl) errEl.hidden = true;
    api('PUT', '/ems/toggle', { target: target, live: on }).then(function (cfg) {
      state.cfg.charger.live = cfg.charger.live;
      (state.cfg.consumers || []).forEach(function (x) { (cfg.consumers || []).forEach(function (n) { if (n.id === x.id) x.live = n.live; }); });
      (cfg.consumers || []).forEach(function (n) {
        state.consumers.forEach(function (c) { if (c.id === n.id) c.live = n.live; });
      });
      var card = t.parentNode && t.parentNode.querySelector ? t.parentNode.querySelector('.ems-s') : null;
      if (card) card.textContent = on ? S.on : S.offTag;
      return refreshStatusOnly();
    }).catch(function (e) {
      t.checked = !on;
      if (errEl) { errEl.textContent = S.toggleFailed + ': ' + (e && e.message || e); errEl.hidden = false; }
    });
  }

  /** Umschalter Betrieb / Vergleich innerhalb des EMS-Reiters. */
  function onSubClick(ev) {
    var t = ev.target;
    var which = t && t.getAttribute ? t.getAttribute('data-ems-sub') : null;
    if (!which) return;
    var main = $('ems-view-main');
    var cmp = $('ems-view-cmp');
    if (main) main.hidden = which !== 'main';
    if (cmp) cmp.hidden = which !== 'cmp';
    var b1 = $('ems-sub-main');
    var b2 = $('ems-sub-cmp');
    [[b1, which === 'main'], [b2, which === 'cmp']].forEach(function (p) {
      if (p[0] && p[0].classList && p[0].classList.toggle) p[0].classList.toggle('active', p[1]);
    });
  }

  function onChange(ev) {
    var t = ev.target;
    if (t && t.getAttribute && t.getAttribute('data-ems-toggle') !== null && t.getAttribute('data-ems-toggle') !== undefined) {
      onToggle(t);
      return;
    }
    if (t && t.getAttribute && t.getAttribute('data-ems-dev') !== null && t.getAttribute('data-ems-dev') !== undefined) {
      onDeviceChange(t);
      return;
    }
    if (t && t.getAttribute && t.getAttribute('data-ems-mode') !== null && t.getAttribute('data-ems-mode') !== undefined) {
      var cur = collectConsumers();
      state.consumers = cur;
      render();
    }
  }

  function init(apiCall, lang) {
    api = apiCall;
    LANG = lang === 'de' ? 'de' : 'en';
    S = STR[LANG];
    var btn = $('t-ems');
    if (btn) btn.textContent = S.tab;
    var subMain = $('ems-sub-main');
    if (subMain) subMain.textContent = S.subMain;
    var subCmp = $('ems-sub-cmp');
    if (subCmp) subCmp.textContent = S.cmpTab;
    var sub = $('ems-sub');
    if (sub) sub.addEventListener('click', onSubClick);
    var panel = $('ems-view-main');
    if (panel) {
      panel.addEventListener('click', onClick);
      panel.addEventListener('change', onChange);
    }
    var devHost = $('ems-view-devices');
    if (devHost) {
      devHost.addEventListener('click', onClick);
      devHost.addEventListener('change', onChange);
    }
    return Promise.all([load(), api('GET', '/ems/devices').then(function (r) { state.devices = r.devices || []; }).catch(function () { state.devices = []; })])
      .then(function () { render(); renderCompare(); })
      .catch(function (e) { if (panel) panel.innerHTML = '<p class="warn">' + esc(S.error + ': ' + (e && e.message || e)) + '</p>'; });
  }

  // Der Statusteil aktualisiert sich nur, solange der Reiter offen ist.
  function startTimer() {
    if (state.timer) return;
    state.timer = setInterval(function () {
      var panel = $('panel-ems');
      if (panel && panel.classList && panel.classList.contains('active')) refreshStatusOnly();
    }, 20000);
  }

  window.EmsUi = { init: function (a, l) { startTimer(); return init(a, l); }, _collect: collect, _state: state, _render: render };
})();
