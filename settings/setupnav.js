/* Umschalter im Setup-Reiter: "Allgemein" | "Preis-App" | "EMS".
 * Wird von index.html gestartet: window.SetupNav.init(lang). Die Ansichten stehen in index.html
 * (#setup-view-general, #setup-view-price, #setup-view-ems), die Knöpfe in #setup-sub. */
(function () {
  'use strict';

  var TEXT = {
    de: { general: 'Allgemein', price: 'Preis-App', ems: 'EMS', hint: 'Hier wählst du die Datenquellen und Verbraucher für das Energiemanagement. Betrieb und Schalter findest du im Reiter «EMS».' },
    en: { general: 'General', price: 'Price app', ems: 'EMS', hint: 'Choose the data sources and consumers for energy management here. Operation and switches are in the "EMS" tab.' },
    fr: { general: 'Général', price: 'App tarifs', ems: 'EMS', hint: "Choisissez ici les sources de données et les consommateurs pour la gestion de l'énergie. Le fonctionnement et les commutateurs se trouvent dans l'onglet « EMS »." },
    it: { general: 'Generale', price: 'App prezzi', ems: 'EMS', hint: "Scegli qui le fonti di dati e i consumatori per la gestione dell'energia. Funzionamento e interruttori si trovano nella scheda «EMS»." },
  };
  var VIEWS = ['general', 'price', 'ems'];

  function $(id) { return document.getElementById(id); }

  function show(which) {
    VIEWS.forEach(function (v) {
      var view = $('setup-view-' + v);
      if (view) view.hidden = v !== which;
      var b = $('setup-sub-' + v);
      if (b && b.classList && b.classList.toggle) b.classList.toggle('active', v === which);
    });
  }

  function init(lang) {
    var t = TEXT[lang] || TEXT.en;
    VIEWS.forEach(function (v) {
      var b = $('setup-sub-' + v);
      if (b) b.textContent = t[v];
    });
    var hint = $('p-setup-ems');
    if (hint) hint.textContent = t.hint;
    var bar = $('setup-sub');
    if (bar) {
      bar.addEventListener('click', function (ev) {
        var which = ev.target && ev.target.getAttribute ? ev.target.getAttribute('data-setup-sub') : null;
        if (VIEWS.indexOf(which) >= 0) show(which);
      });
    }
  }

  window.SetupNav = { init: init, _show: show };
})();
