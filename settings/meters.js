/* Zählerstände automatisch lesen: Auswahl per Dropdown statt Flow.
 * Wird von index.html nach onHomeyReady gestartet: window.MetersUi.init(apiCall, lang)
 * und zeichnet in das Element #meters-auto. */
(function () {
  'use strict';

  var STR = {
    de: {
      title: 'Automatisch lesen (empfohlen)',
      hint: 'Wähle pro Zähler das Gerät und den kumulierten kWh-Wert (der immer weiter hochzählt, nicht die Leistung in W und nicht "heute"). Die App liest die Werte alle 15 Minuten selbst, ein Flow ist nicht nötig.',
      enable: 'Zählerstände automatisch lesen',
      import: 'Netzbezug', export: 'Einspeisung', battery_charge: 'Batterie-Ladung', battery_discharge: 'Batterie-Entladung',
      device: 'Gerät', value: 'Wert', pick: '- Gerät wählen -', none: '- nicht verwendet -', pickFirst: '- zuerst Gerät wählen -',
      consumers: 'Verbraucher (optional)', consumerHint: 'Zum Beispiel Auto oder Wärmepumpe: zeigt, zu welchem Preis sie liefen.',
      name: 'Name', add: 'Verbraucher hinzufügen', remove: 'Entfernen', save: 'Speichern und jetzt lesen', saved: 'Gespeichert',
      error: 'Fehler', last: 'zuletzt', ago: 'vor', min: 'min', sec: 's', kwh: 'kWh', never: 'noch nicht gelesen',
      flowNote: 'Alternativ kannst du die Werte weiter per Flow melden (siehe unten). Beides zusammen ist unproblematisch.',
    },
    en: {
      title: 'Read automatically (recommended)',
      hint: 'Choose the device and the cumulative kWh value for each meter (the one that keeps counting up, not the power in W and not "today"). The app reads the values itself every 15 minutes, no Flow needed.',
      enable: 'Read meter readings automatically',
      import: 'Grid import', export: 'Grid export', battery_charge: 'Battery charge', battery_discharge: 'Battery discharge',
      device: 'Device', value: 'Value', pick: '- choose device -', none: '- not used -', pickFirst: '- choose a device first -',
      consumers: 'Consumers (optional)', consumerHint: 'For example car or heat pump: shows at what price they ran.',
      name: 'Name', add: 'Add consumer', remove: 'Remove', save: 'Save and read now', saved: 'Saved',
      error: 'Error', last: 'last', ago: 'ago', min: 'min', sec: 's', kwh: 'kWh', never: 'not read yet',
      flowNote: 'Alternatively you can keep reporting the values with a Flow (see below). Both together is fine.',
    },
  };

  // Welche Capability passt zu welchem Zähler (Stichworte in Id und Name, Reihenfolge = Vorzug)
  var HINTS = {
    import: { yes: /import|consum|bezug|purchase|buy|from.?grid/i, no: /export|feed|einspeis|produc|charge|lade/i },
    export: { yes: /export|feed|einspeis|to.?grid|sell/i, no: /import|bezug/i },
    battery_charge: { yes: /charg|lade/i, no: /discharg|entlad/i },
    battery_discharge: { yes: /discharg|entlad/i, no: null },
  };
  var KINDS = ['import', 'export', 'battery_charge', 'battery_discharge'];
  var CAP_RE = /^meter_power/;

  var api = null, S = STR.en, LANG = 'en';
  var state = { cfg: null, status: {}, devices: [] };

  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function val(id, fb) { var e = $(id); return e && e.value !== undefined && e.value !== '' ? e.value : fb; }

  function findDevice(id) {
    for (var i = 0; i < state.devices.length; i++) if (state.devices[i].id === id) return state.devices[i];
    return null;
  }
  function meterCaps(d) { return (d && d.caps ? d.caps : []).filter(function (c) { return CAP_RE.test(c); }); }
  function capLabel(d, c) {
    var t = d && d.capTitles && d.capTitles[c];
    return t ? t + ' (' + c + ')' : c;
  }

  /** Beste Capability für einen Zähler: passt das Stichwort in Id oder Titel, sonst die erste. */
  function pickCap(d, kind, current) {
    var caps = meterCaps(d);
    if (!caps.length) return '';
    var h = HINTS[kind];
    if (h) {
      for (var i = 0; i < caps.length; i++) {
        var text = caps[i] + ' ' + ((d.capTitles && d.capTitles[caps[i]]) || '');
        if (h.yes.test(text) && !(h.no && h.no.test(text))) return caps[i];
      }
    }
    if (current && caps.indexOf(current) >= 0) return current;
    return caps[0];
  }

  function deviceOptions(current) {
    return '<option value="">' + esc(S.none) + '</option>' + state.devices.filter(function (d) {
      return d.id === current || meterCaps(d).length;
    }).map(function (d) {
      return '<option value="' + esc(d.id) + '"' + (d.id === current ? ' selected' : '') + '>' + esc(d.name) + '</option>';
    }).join('');
  }
  function capOptions(devId, current) {
    var d = findDevice(devId);
    if (!d) return '<option value="">' + esc(S.pickFirst) + '</option>';
    var caps = meterCaps(d);
    if (current && caps.indexOf(current) < 0) caps.push(current);
    return caps.map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === current ? ' selected' : '') + '>' + esc(capLabel(d, c)) + '</option>';
    }).join('');
  }

  function ago(ms) {
    var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    return s < 90 ? S.ago + ' ' + s + ' ' + S.sec : S.ago + ' ' + Math.round(s / 60) + ' ' + S.min;
  }
  function statusText(key) {
    var st = state.status[key];
    if (!st) return '<span class="sub">' + esc(S.never) + '</span>';
    if (st.error) return '<span class="warn">' + esc(S.error + ': ' + st.error) + '</span>';
    return '<span class="sub">' + esc(S.last + ' ' + Number(st.kwh).toFixed(2) + ' ' + S.kwh + ', ' + ago(st.at)) + '</span>';
  }

  function row(label, idPrefix, devId, cap, statusKey, nameField) {
    return '<div class="mt-row"><div class="mt-l">' + (nameField || '<b>' + esc(label) + '</b>') + '</div>'
      + '<label class="mt-f"><span>' + esc(S.device) + '</span><select id="' + idPrefix + '-dev" data-mt-dev="' + idPrefix + '">' + deviceOptions(devId) + '</select></label>'
      + '<label class="mt-f"><span>' + esc(S.value) + '</span><select id="' + idPrefix + '-cap">' + capOptions(devId, cap) + '</select></label>'
      + '<div class="mt-s">' + (statusKey ? statusText(statusKey) : '') + '</div></div>';
  }

  function consumerRow(c, i) {
    var nameField = '<input id="mt-c' + i + '-name" type="text" value="' + esc(c.name) + '" placeholder="' + esc(S.name) + '">';
    return row('', 'mt-c' + i, c.deviceId, c.capability, c.name ? 'consumer:' + c.name : null, nameField)
      + '<div class="mt-rm"><button class="btn" data-mt-remove="' + i + '">' + esc(S.remove) + '</button></div>';
  }

  function render() {
    var host = $('meters-auto');
    if (!host || !state.cfg) return;
    var c = state.cfg;
    var rows = KINDS.map(function (k) { return row(S[k], 'mt-' + k, c.sources[k].deviceId, c.sources[k].capability, k); }).join('');
    var cons = (state.consumers || []).map(consumerRow).join('');
    host.innerHTML = '<style>'
      + '.mt-row{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin:8px 0;padding-bottom:8px;border-bottom:1px solid var(--st-border)}'
      + '.mt-l{flex:0 0 130px;font-size:13px}.mt-l input{width:120px;font:inherit;padding:4px 6px;border:1px solid var(--st-border);border-radius:6px;background:var(--st-bg);color:var(--st-text)}'
      + '.mt-f{display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--st-muted);flex:1 1 180px}'
      + '.mt-f select{font:inherit;padding:4px 6px;border:1px solid var(--st-border);border-radius:6px;background:var(--st-bg);color:var(--st-text);width:100%}'
      + '.mt-s{flex:1 1 100%;font-size:12px}.mt-rm{margin:-4px 0 6px}'
      + '</style>'
      + '<h3>' + esc(S.title) + '</h3><p class="sub">' + esc(S.hint) + '</p>'
      + '<label class="mt-c"><input id="mt-enabled" type="checkbox"' + (c.enabled ? ' checked' : '') + '> <span>' + esc(S.enable) + '</span></label>'
      + rows
      + '<h3>' + esc(S.consumers) + '</h3><p class="sub">' + esc(S.consumerHint) + '</p>' + cons
      + '<p><button class="btn" data-mt-add="1">' + esc(S.add) + '</button></p>'
      + '<p><button class="btn" data-mt-save="1">' + esc(S.save) + '</button> <span class="sub" id="mt-msg">' + esc(state.msg || '') + '</span></p>'
      + '<p class="sub">' + esc(S.flowNote) + '</p>';
  }

  // ---------------------------------------------------------------- Formular -> Konfiguration

  function collect() {
    var sources = {};
    KINDS.forEach(function (k) {
      var p = 'mt-' + k;
      sources[k] = { deviceId: val(p + '-dev', state.cfg.sources[k].deviceId), capability: val(p + '-cap', state.cfg.sources[k].capability) };
    });
    var enabledEl = $('mt-enabled');
    var consumers = (state.consumers || []).map(function (c, i) {
      var p = 'mt-c' + i;
      return { name: val(p + '-name', c.name), deviceId: val(p + '-dev', c.deviceId), capability: val(p + '-cap', c.capability) };
    });
    return { enabled: !!(enabledEl && enabledEl.checked), sources: sources, consumers: consumers };
  }

  function syncToState() {
    var f = collect();
    state.cfg.enabled = f.enabled;
    state.cfg.sources = f.sources;
    state.consumers = f.consumers;
  }

  function onDevChange(t) {
    var id = t.getAttribute('data-mt-dev'); // z. B. mt-import oder mt-c0
    syncToState();
    var dev = findDevice(val(id + '-dev', ''));
    var m = /^mt-(import|export|battery_charge|battery_discharge)$/.exec(id);
    if (m) {
      var src = state.cfg.sources[m[1]];
      src.capability = dev ? pickCap(dev, m[1], '') : '';
    } else {
      var ci = /^mt-c(\d+)$/.exec(id);
      if (ci) {
        var cons = state.consumers[Number(ci[1])];
        if (cons) cons.capability = dev ? pickCap(dev, 'consumer', '') : '';
      }
    }
    render();
  }

  function setMsg(text) {
    state.msg = text;
    var el = $('mt-msg');
    if (el) el.textContent = text;
  }

  function onClick(ev) {
    var t = ev.target;
    if (!t || !t.getAttribute) return;
    if (t.getAttribute('data-mt-add')) {
      syncToState();
      if (state.consumers.length < 8) state.consumers.push({ name: '', deviceId: '', capability: '' });
      render();
    } else if (t.getAttribute('data-mt-remove') !== null && t.getAttribute('data-mt-remove') !== undefined) {
      syncToState();
      state.consumers.splice(Number(t.getAttribute('data-mt-remove')), 1);
      render();
    } else if (t.getAttribute('data-mt-save')) {
      var body = collect();
      body.consumers = body.consumers.filter(function (c) { return c.name && c.deviceId && c.capability; });
      setMsg('...');
      api('PUT', '/meters', body).then(function (r) {
        state.cfg = r.config; state.consumers = r.config.consumers.slice(); state.status = r.status || {};
        setMsg(S.saved);
        render();
        // Der erste Lesevorgang läuft im Hintergrund; Status kurz danach holen.
        setTimeout(refreshStatus, 3000);
      }).catch(function (e) { setMsg(S.error + ': ' + (e && e.message || e)); });
    }
  }

  function onChange(ev) {
    var t = ev.target;
    if (t && t.getAttribute && t.getAttribute('data-mt-dev') !== null && t.getAttribute('data-mt-dev') !== undefined) onDevChange(t);
  }

  function refreshStatus() {
    return api('GET', '/meters').then(function (r) {
      state.status = r.status || {};
      var host = $('meters-auto');
      if (host && state.cfg) {
        syncToState(); // ungespeicherte Eingaben behalten
        render();
      }
    }).catch(function () {});
  }

  function init(apiCall, lang) {
    api = apiCall;
    LANG = lang === 'de' ? 'de' : 'en';
    S = STR[LANG];
    var host = $('meters-auto');
    if (host) {
      host.addEventListener('click', onClick);
      host.addEventListener('change', onChange);
    }
    return Promise.all([
      api('GET', '/meters'),
      api('GET', '/meters/devices').then(function (r) { return r.devices || []; }).catch(function () { return []; }),
    ]).then(function (r) {
      state.cfg = r[0].config; state.status = r[0].status || {}; state.devices = r[1];
      state.consumers = (state.cfg.consumers || []).map(function (c) { return Object.assign({}, c); });
      render();
    }).catch(function (e) {
      if (host) host.innerHTML = '<p class="warn">' + esc(S.error + ': ' + (e && e.message || e)) + '</p>';
    });
  }

  window.MetersUi = { init: init, _collect: collect, _state: state, _pickCap: pickCap };
})();
