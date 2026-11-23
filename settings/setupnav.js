/* Umschalter im Reiter "Einrichten": "Allgemein" | "Preis-App" | "EMS".
 * Wird von index.html gestartet: window.SetupNav.init(lang). Die Ansichten stehen in index.html
 * (#setup-view-general, #setup-view-price, #setup-view-ems), die Knöpfe in #setup-sub. */
(function () {
  'use strict';

  var TEXT = {
    de: { general: 'Allgemein', price: 'Preis-App', ems: 'EMS', hint: 'Hier richtest du das Energiemanagement ein: Datenquellen, Verbraucher, Berechnung. Betrieb und Schalter findest du unter «Heute», den Plan unter «Ausblick».' },
    en: { general: 'General', price: 'Price app', ems: 'EMS', hint: 'Set up energy management here: data sources, consumers, calculation. Operation and switches are under "Today", the plan under "Outlook".' },
    fr: { general: 'Général', price: 'App tarifs', ems: 'EMS', hint: "Configurez ici la gestion de l'énergie : sources de données, consommateurs, calcul. Le fonctionnement et les commutateurs se trouvent sous « Aujourd'hui », le plan sous « Aperçu »." },
    it: { general: 'Generale', price: 'App prezzi', ems: 'EMS', hint: "Configura qui la gestione dell'energia: fonti di dati, consumatori, calcolo. Funzionamento e interruttori si trovano sotto «Oggi», il piano sotto «Previsione»." },
  };
  var VIEWS = ['general', 'price', 'ems'];
  var userChose = false;

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
        if (VIEWS.indexOf(which) >= 0) { userChose = true; show(which); }
      });
    }
  }

  /** Mit Energiemanagement-Gerät öffnet «Einrichten» auf EMS, solange noch nichts selbst gewählt wurde. */
  function preferEms() { if (!userChose) show('ems'); }

  window.SetupNav = { init: init, preferEms: preferEms, _show: show };
})();
