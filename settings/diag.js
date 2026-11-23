/* Diagnose zum Kopieren (Reiter «Heute», unter «Status»). Wird von index.html gestartet: window.DiagUi.init(api, lang).
 * Der Text entsteht in der App (anonymisiert) und wird NICHT automatisch gesendet: man liest ihn und fügt ihn selbst ein. */
(function () {
  'use strict';

  var TEXT = {
    de: {
      title: 'Fehler melden: Diagnose kopieren',
      why: 'Erzeugt einen Text mit App-Version, einer Zusammenfassung deiner Einrichtung und den letzten Meldungen der App. Geräte-, Flow- und Verbrauchernamen sind durch Nummern ersetzt, Zugangsdaten, IDs und Nummern sind entfernt. Es wird nichts automatisch gesendet: lies den Text durch und füge ihn selbst in eine Nachricht oder ein GitHub-Issue ein.',
      make: 'Diagnose erstellen', again: 'Neu erstellen', copy: 'Kopieren', copied: 'Kopiert.', selected: 'Text markiert, mit Strg+C (Mac: Cmd+C) kopieren.',
      issue: 'GitHub-Issue öffnen', loading: 'Wird erstellt …', failed: 'Die Diagnose konnte nicht erstellt werden.',
    },
    en: {
      title: 'Report a problem: copy diagnostics',
      why: 'Creates a text with the app version, a summary of your setup and the latest messages of the app. Device, flow and consumer names are replaced by numbers; credentials, IDs and numbers are removed. Nothing is sent automatically: read the text and paste it yourself into a message or a GitHub issue.',
      make: 'Create diagnostics', again: 'Create again', copy: 'Copy', copied: 'Copied.', selected: 'Text selected, copy with Ctrl+C (Mac: Cmd+C).',
      issue: 'Open GitHub issue', loading: 'Creating …', failed: 'The diagnostics could not be created.',
    },
  };
  var ISSUES = 'https://github.com/RickD-CH/com.rickd.dynamictariffch/issues/new';

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var api = null;
  var S = TEXT.en;

  function show(text, msg) {
    var root = $('diag-root');
    if (!root) return;
    root.innerHTML = '<p class="sub" style="margin-bottom:8px">' + esc(S.why) + '</p>'
      + '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px">'
      + '<button class="btn primary" id="diag-make">' + esc(text ? S.again : S.make) + '</button>'
      + (text ? '<button class="btn" id="diag-copy">' + esc(S.copy) + '</button>' : '')
      + '<a class="btn" href="' + ISSUES + '" target="_blank" rel="noopener">' + esc(S.issue) + '</a>'
      + '<span class="sub" id="diag-msg">' + esc(msg || '') + '</span></div>'
      + (text ? '<textarea id="diag-text" readonly rows="14" style="width:100%;box-sizing:border-box;font:12px/1.4 monospace"></textarea>' : '');
    if (text) $('diag-text').value = text;
    $('diag-make').addEventListener('click', make);
    var cp = $('diag-copy');
    if (cp) cp.addEventListener('click', copy);
  }

  function make() {
    var b = $('diag-make');
    if (b) b.disabled = true;
    var m = $('diag-msg');
    if (m) m.textContent = S.loading;
    api('GET', '/diagnostics').then(function (r) {
      show((r && r.text) || '', '');
    }).catch(function () {
      show('', S.failed);
    });
  }

  function copy() {
    var ta = $('diag-text');
    if (!ta) return;
    var done = function (ok) { var m = $('diag-msg'); if (m) m.textContent = ok ? S.copied : S.selected; };
    ta.focus();
    ta.select();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ta.value).then(function () { done(true); }).catch(function () { done(document.execCommand && document.execCommand('copy')); });
        return;
      }
    } catch (e) { /* weiter */ }
    var ok = false;
    try { ok = document.execCommand && document.execCommand('copy'); } catch (e2) { ok = false; }
    done(ok);
  }

  window.DiagUi = {
    init: function (apiFn, lang) {
      api = apiFn;
      S = TEXT[lang] || TEXT.en;
      var h = $('h2-diag');
      if (h) h.textContent = S.title;
      show('', '');
    },
  };
}());
