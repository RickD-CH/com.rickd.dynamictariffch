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
      consumers: 'Verbraucher (optional)', consumerHint: 'Zum Beispiel Auto oder Wärmepumpe: zeigt, zu welchem Preis sie liefen. Höchstens 12.',
      name: 'Name', add: 'Verbraucher hinzufügen', remove: 'Entfernen', save: 'Speichern und jetzt lesen', saved: 'Gespeichert',
      error: 'Fehler', last: 'zuletzt', ago: 'vor', min: 'min', sec: 's', kwh: 'kWh', never: 'noch nicht gelesen',
      flowNote: 'Alternativ kannst du die Werte weiter per Flow melden (unten unter «Alternativ: Werte per Flow melden»). Beides zusammen ist unproblematisch.',
      managedHint: 'Deine Verbraucher mit ihren Zählern verwaltest du unter Einrichten → EMS → Verbraucher.',
      feedTitle: 'Wie wird jeder Zähler gespeist?', feedSource: 'Zähler', feedHow: 'Gespeist über', feedLast: 'Letzte Meldung',
      feedAuto: 'Auswahl', feedFlow: 'Flow', feedBoth: 'Auswahl und Flow', feedNone: 'nicht gespeist', feedAutoOff: 'Auswahl vorbereitet, automatisches Lesen ist aus',
      feedRun: 'Jetzt lesen und aktualisieren', feedRunning: 'liest ...', feedRunDone: 'Gelesen', interval: 'Lesen alle', every5: 'alle 5 Minuten', every10: 'alle 10 Minuten', every15: 'alle 15 Minuten', every30: 'alle 30 Minuten', every60: 'jede Stunde',
      intervalHint: 'Kürzer = aktuellere Kostenwerte, aber mehr Abfragen an Homey. 15 Minuten genügt, die Preise ändern sich nur alle 15 Minuten.',
      feedFlowAgo: 'Flow zuletzt', feedAutoAgo: 'Auswahl zuletzt', feedNoReport: 'noch keine Meldung',
      feedHint: 'Pro Zähler siehst du, ob die Werte aus der Auswahl (die App liest das Gerät selbst) oder aus einem Flow kommen. Meldet beides, gilt der jüngste Wert.',
    },
    en: {
      title: 'Read automatically (recommended)',
      hint: 'Choose the device and the cumulative kWh value for each meter (the one that keeps counting up, not the power in W and not "today"). The app reads the values itself every 15 minutes, no Flow needed.',
      enable: 'Read meter readings automatically',
      import: 'Grid import', export: 'Grid export', battery_charge: 'Battery charge', battery_discharge: 'Battery discharge',
      device: 'Device', value: 'Value', pick: '- choose device -', none: '- not used -', pickFirst: '- choose a device first -',
      consumers: 'Consumers (optional)', consumerHint: 'For example car or heat pump: shows at what price they ran. At most 12.',
      name: 'Name', add: 'Add consumer', remove: 'Remove', save: 'Save and read now', saved: 'Saved',
      error: 'Error', last: 'last', ago: 'ago', min: 'min', sec: 's', kwh: 'kWh', never: 'not read yet',
      flowNote: 'Alternatively you can keep reporting the values with a Flow (below under «Alternative: report values with a Flow»). Both together is fine.',
      managedHint: 'You manage your consumers and their meters under Setup → EMS → Consumers.',
      feedTitle: 'How is each meter fed?', feedSource: 'Meter', feedHow: 'Fed by', feedLast: 'Last report',
      feedAuto: 'Selection', feedFlow: 'Flow', feedBoth: 'Selection and Flow', feedNone: 'not fed', feedAutoOff: 'Selection prepared, automatic reading is off',
      feedRun: 'Read now and refresh', feedRunning: 'reading ...', feedRunDone: 'Read', interval: 'Read every', every5: 'every 5 minutes', every10: 'every 10 minutes', every15: 'every 15 minutes', every30: 'every 30 minutes', every60: 'every hour',
      intervalHint: 'Shorter = fresher cost values but more requests to Homey. 15 minutes is enough, prices only change every 15 minutes.',
      feedFlowAgo: 'Flow last', feedAutoAgo: 'Selection last', feedNoReport: 'no report yet',
      feedHint: 'For each meter you see whether the values come from the selection (the app reads the device itself) or from a Flow. If both report, the latest value counts.',
    },
    fr: {
      title: 'Lecture automatique (recommandé)',
      hint: 'Choisissez pour chaque compteur l’appareil et la valeur cumulée en kWh (celle qui ne cesse de monter, pas la puissance en W ni « aujourd’hui »). L’app lit elle-même les valeurs toutes les 15 minutes, aucun Flow n’est nécessaire.',
      enable: 'Lire automatiquement les relevés de compteurs',
      import: 'Soutirage réseau',
      export: 'Injection réseau',
      battery_charge: 'Charge de la batterie',
      battery_discharge: 'Décharge de la batterie',
      device: 'Appareil',
      value: 'Valeur',
      pick: '- choisir un appareil -',
      none: '- non utilisé -',
      pickFirst: '- choisir d’abord un appareil -',
      consumers: 'Consommateurs (facultatif)',
      consumerHint: 'Par exemple voiture ou pompe à chaleur : montre à quel prix ils ont fonctionné. Au maximum 12.',
      name: 'Nom',
      add: 'Ajouter un consommateur',
      remove: 'Supprimer',
      save: 'Enregistrer et lire maintenant',
      saved: 'Enregistré',
      error: 'Erreur',
      last: 'dernier',
      ago: 'il y a',
      min: 'min',
      sec: 's',
      kwh: 'kWh',
      never: 'pas encore lu',
      flowNote: 'Vous pouvez aussi continuer à transmettre les valeurs avec un Flow (plus bas sous « Alternative : transmettre les valeurs avec un Flow »). Les deux ensemble, c’est possible.',
      managedHint: 'Vous gérez vos consommateurs et leurs compteurs sous Setup → EMS → Consommateurs.',
      feedTitle: 'Comment chaque compteur est-il alimenté ?',
      feedSource: 'Compteur',
      feedHow: 'Alimenté par',
      feedLast: 'Dernier relevé',
      feedAuto: 'Sélection',
      feedFlow: 'Flow',
      feedBoth: 'Sélection et Flow',
      feedNone: 'non alimenté',
      feedAutoOff: 'Sélection préparée, la lecture automatique est désactivée',
      feedRun: 'Lire maintenant et actualiser',
      feedRunning: 'lecture ...',
      feedRunDone: 'Lu',
      interval: 'Lire toutes les',
      every5: 'toutes les 5 minutes',
      every10: 'toutes les 10 minutes',
      every15: 'toutes les 15 minutes',
      every30: 'toutes les 30 minutes',
      every60: 'toutes les heures',
      intervalHint: 'Plus court = valeurs de coûts plus récentes mais plus de requêtes vers Homey. 15 minutes suffisent, les prix ne changent que toutes les 15 minutes.',
      feedFlowAgo: 'Flow dernier',
      feedAutoAgo: 'Sélection dernière',
      feedNoReport: 'pas encore de relevé',
      feedHint: 'Pour chaque compteur, vous voyez si les valeurs viennent de la sélection (l’app lit elle-même l’appareil) ou d’un Flow. Si les deux transmettent, la valeur la plus récente compte.',
    },
    it: {
      title: 'Lettura automatica (consigliata)',
      hint: 'Scegli per ogni contatore il dispositivo e il valore cumulato in kWh (quello che continua a salire, non la potenza in W né «oggi»). L’app legge da sola i valori ogni 15 minuti, non serve alcun Flow.',
      enable: 'Leggi automaticamente le letture dei contatori',
      import: 'Prelievo dalla rete',
      export: 'Immissione in rete',
      battery_charge: 'Carica della batteria',
      battery_discharge: 'Scarica della batteria',
      device: 'Dispositivo',
      value: 'Valore',
      pick: '- scegli un dispositivo -',
      none: '- non utilizzato -',
      pickFirst: '- scegli prima un dispositivo -',
      consumers: 'Consumatori (facoltativo)',
      consumerHint: 'Ad esempio auto o pompa di calore: mostra a quale prezzo hanno funzionato. Al massimo 12.',
      name: 'Nome',
      add: 'Aggiungi un consumatore',
      remove: 'Rimuovi',
      save: 'Salva e leggi ora',
      saved: 'Salvato',
      error: 'Errore',
      last: 'ultimo',
      ago: 'fa',
      min: 'min',
      sec: 's',
      kwh: 'kWh',
      never: 'non ancora letto',
      flowNote: 'In alternativa puoi continuare a comunicare i valori con un Flow (più sotto in «Alternativa: comunicare i valori con un Flow»). Anche entrambi insieme va bene.',
      managedHint: 'Gestisci i tuoi consumatori e i loro contatori sotto Setup → EMS → Consumatori.',
      feedTitle: 'Come viene alimentato ogni contatore?',
      feedSource: 'Contatore',
      feedHow: 'Alimentato da',
      feedLast: 'Ultima lettura',
      feedAuto: 'Selezione',
      feedFlow: 'Flow',
      feedBoth: 'Selezione e Flow',
      feedNone: 'non alimentato',
      feedAutoOff: 'Selezione preparata, la lettura automatica è disattivata',
      feedRun: 'Leggi ora e aggiorna',
      feedRunning: 'lettura ...',
      feedRunDone: 'Letto',
      interval: 'Leggi ogni',
      every5: 'ogni 5 minuti',
      every10: 'ogni 10 minuti',
      every15: 'ogni 15 minuti',
      every30: 'ogni 30 minuti',
      every60: 'ogni ora',
      intervalHint: 'Più breve = valori dei costi più aggiornati ma più richieste a Homey. 15 minuti bastano, i prezzi cambiano solo ogni 15 minuti.',
      feedFlowAgo: 'Flow ultimo',
      feedAutoAgo: 'Selezione ultima',
      feedNoReport: 'ancora nessuna lettura',
      feedHint: 'Per ogni contatore vedi se i valori provengono dalla selezione (l’app legge da sola il dispositivo) o da un Flow. Se entrambi comunicano, conta il valore più recente.',
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
  var MAX_CONSUMERS = 12; // gleiche Grenze wie die Kostenrechnung (lib/CostTracker.js)

  var api = null, S = STR.en, LANG = 'en';
  var state = { cfg: null, status: {}, seen: {}, devices: [] };

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

  /** Eine Zeile der Übersicht: Zähler, Weg der Speisung, letzte Meldung. */
  function feedRow(label, key, devId, cap) {
    var c = state.cfg;
    var seen = (state.seen && state.seen[key]) || {};
    var chosen = !!(devId && cap);
    var dev = findDevice(devId);
    var how; var cls = 'mt-ok';
    var autoRecent = !!seen.auto;
    var flowRecent = !!seen.flow;
    if (chosen && c.enabled && flowRecent) how = S.feedBoth;
    else if (chosen && c.enabled) how = S.feedAuto;
    else if (flowRecent) how = S.feedFlow;
    else if (chosen) { how = S.feedAutoOff; cls = 'mt-warn'; }
    else { how = S.feedNone; cls = 'mt-warn'; }
    var detail = chosen ? (dev ? dev.name : devId) + ' - ' + capLabel(dev, cap) : '';
    var last = [];
    if (seen.auto) last.push(S.feedAutoAgo + ' ' + ago(seen.auto));
    if (seen.flow) last.push(S.feedFlowAgo + ' ' + ago(seen.flow));
    return '<div class="mt-feed"><div class="mt-feed-top"><b class="mt-feed-n">' + esc(label) + '</b><span class="mt-feed-h ' + cls + '">' + esc(how) + '</span>'
      + '<span class="mt-feed-l">' + esc(last.length ? last.join(' · ') : S.feedNoReport) + '</span></div>'
      + (detail ? '<div class="mt-feed-d">' + esc(detail) + '</div>' : '') + '</div>';
  }

  function feedTable() {
    var c = state.cfg;
    var rows = KINDS.map(function (k) { return feedRow(S[k], k, c.sources[k].deviceId, c.sources[k].capability); });
    (c.consumers || []).forEach(function (x) { if (x.name) rows.push(feedRow(x.name, 'consumer:' + x.name, x.deviceId, x.capability)); });
    return '<h3>' + esc(S.feedTitle) + '</h3><p class="sub">' + esc(S.feedHint) + '</p><div class="mt-feeds">' + rows.join('') + '</div>'
      + '<p><button class="btn" data-mt-run="1">' + esc(S.feedRun) + '</button> <span class="sub" id="mt-feed-msg">' + esc(state.feedMsg || '') + '</span></p>';
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

  function intervalRow() {
    var cur = Number(state.cfg.intervalMin) || 15;
    var opts = [[5, S.every5], [10, S.every10], [15, S.every15], [30, S.every30], [60, S.every60]].map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === cur ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('');
    return '<div class="mt-row"><label class="mt-f"><span>' + esc(S.interval) + '</span><select id="mt-interval">' + opts + '</select></label></div><p class="sub">' + esc(S.intervalHint) + '</p>';
  }

  function render() {
    var host = $('meters-auto');
    if (!host || !state.cfg) return;
    var c = state.cfg;
    var rows = KINDS.map(function (k) { return row(S[k], 'mt-' + k, c.sources[k].deviceId, c.sources[k].capability, k); }).join('');
    var cons = state.managed ? '' : (state.consumers || []).map(consumerRow).join('');
    host.innerHTML = '<style>'
      + '.mt-row{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin:8px 0;padding-bottom:8px;border-bottom:1px solid var(--st-border)}'
      + '.mt-l{flex:1 1 100%;font-size:13px}.mt-l input{width:120px;font:inherit;padding:4px 6px;border:1px solid var(--st-border);border-radius:6px;background:var(--st-bg);color:var(--st-text)}'
      + '.mt-f{display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--st-muted);flex:1 1 180px}'
      + '.mt-f select{font:inherit;padding:4px 6px;border:1px solid var(--st-border);border-radius:6px;background:var(--st-bg);color:var(--st-text);width:100%}'
      + '.mt-s{flex:1 1 100%;font-size:12px}.mt-rm{margin:-4px 0 6px}'
      + '.mt-feed{padding:6px 0;border-bottom:1px solid var(--st-border);font-size:13px}.mt-feed:last-child{border-bottom:none}'
      + '.mt-feed-top{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.mt-feed-n{font-weight:600}.mt-feed-h{font-size:12px;font-weight:600}.mt-feed-h.mt-ok{color:var(--st-cheap)}.mt-feed-h.mt-warn{color:#b9770e}'
      + '.mt-feed-l{margin-left:auto;font-size:11px;color:var(--st-muted)}.mt-feed-d{font-size:11px;color:var(--st-muted);overflow-wrap:anywhere;word-break:break-word;margin-top:1px}'
      + '</style>'
      + feedTable()
      + '<h3>' + esc(S.title) + '</h3><p class="sub">' + esc(S.hint) + '</p>'
      + '<label class="mt-c"><span class="swt"><input class="sw" id="mt-enabled" type="checkbox"' + (c.enabled ? ' checked' : '') + '><i></i></span> <span>' + esc(S.enable) + '</span></label>'
      + intervalRow()
      + rows
      + (state.managed
        ? '<h3>' + esc(S.consumers) + '</h3><p class="sub">' + esc(S.managedHint) + '</p>'
        : '<h3>' + esc(S.consumers) + '</h3><p class="sub">' + esc(S.consumerHint) + '</p>' + cons + '<p><button class="btn" data-mt-add="1">' + esc(S.add) + '</button></p>')
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
    var out = { enabled: !!(enabledEl && enabledEl.checked), intervalMin: Number(val('mt-interval', state.cfg.intervalMin || 15)) || 15, sources: sources };
    if (!state.managed) out.consumers = consumers; // sonst verwaltet das Energiemanagement sie
    return out;
  }

  function syncToState() {
    var f = collect();
    state.cfg.enabled = f.enabled;
    state.cfg.intervalMin = f.intervalMin;
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
      if (state.consumers.length < MAX_CONSUMERS) state.consumers.push({ name: '', deviceId: '', capability: '' });
      render();
    } else if (t.getAttribute('data-mt-remove') !== null && t.getAttribute('data-mt-remove') !== undefined) {
      syncToState();
      state.consumers.splice(Number(t.getAttribute('data-mt-remove')), 1);
      render();
    } else if (t.getAttribute('data-mt-run')) {
      state.feedMsg = S.feedRunning;
      var msg = $('mt-feed-msg');
      if (msg) msg.textContent = state.feedMsg;
      api('POST', '/meters/run').then(function (r) {
        state.status = r.status || {}; state.seen = r.seen || {};
        state.feedMsg = S.feedRunDone;
        syncToState();
        render();
      }).catch(function (e) {
        state.feedMsg = S.error + ': ' + (e && e.message || e);
        var m2 = $('mt-feed-msg');
        if (m2) m2.textContent = state.feedMsg;
      });
    } else if (t.getAttribute('data-mt-save')) {
      var body = collect();
      if (body.consumers) body.consumers = body.consumers.filter(function (c) { return c.name && c.deviceId && c.capability; });
      setMsg('...');
      api('PUT', '/meters', body).then(function (r) {
        state.cfg = r.config; state.consumers = r.config.consumers.slice(); state.status = r.status || {}; state.seen = r.seen || {};
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
      state.status = r.status || {}; state.seen = r.seen || {};
      var host = $('meters-auto');
      if (host && state.cfg) {
        syncToState(); // ungespeicherte Eingaben behalten
        render();
      }
    }).catch(function () {});
  }

  function init(apiCall, lang) {
    api = apiCall;
    LANG = ['de', 'fr', 'it'].indexOf(lang) >= 0 ? lang : 'en';
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
      state.cfg = r[0].config; state.status = r[0].status || {}; state.seen = r[0].seen || {}; state.devices = r[1]; state.managed = r[0].consumersManagedByEms === true;
      state.consumers = (state.cfg.consumers || []).map(function (c) { return Object.assign({}, c); });
      render();
    }).catch(function (e) {
      if (host) host.innerHTML = '<p class="warn">' + esc(S.error + ': ' + (e && e.message || e)) + '</p>';
    });
  }

  window.MetersUi = { init: init, _collect: collect, _state: state, _pickCap: pickCap };
})();
