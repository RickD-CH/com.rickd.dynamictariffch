/* Umschalter im Setup-Reiter: "Preis-App" | "Energiemanagement".
 * Wird von index.html gestartet: window.SetupNav.init(lang). Die Ansichten stehen in index.html
 * (#setup-view-price, #setup-view-ems), die Buttons in #setup-sub. */
(function () {
  'use strict';

  var TEXT = {
    de: ['Preis-App', 'Energiemanagement', 'Hier wählst du die Geräte für das Energiemanagement. Betrieb und Steuerung findest du im Reiter «EMS».'],
    en: ['Price app', 'Energy management', 'Choose the devices for energy management here. Operation and control are in the "EMS" tab.'],
    fr: ['App tarifs', "Gestion de l'énergie", "Choisissez ici les appareils pour la gestion de l'énergie. Le fonctionnement et la commande se trouvent dans l'onglet « EMS »."],
    it: ['App prezzi', "Gestione dell'energia", 'Scegli qui i dispositivi per la gestione dell\'energia. Funzionamento e controllo si trovano nella scheda «EMS».'],
  };

  function $(id) { return document.getElementById(id); }

  function show(which) {
    var price = $('setup-view-price');
    var ems = $('setup-view-ems');
    if (price) price.hidden = which !== 'price';
    if (ems) ems.hidden = which !== 'ems';
    [['setup-sub-price', which === 'price'], ['setup-sub-ems', which === 'ems']].forEach(function (p) {
      var b = $(p[0]);
      if (b && b.classList && b.classList.toggle) b.classList.toggle('active', p[1]);
    });
  }

  function init(lang) {
    var t = TEXT[lang] || TEXT.en;
    var bp = $('setup-sub-price');
    var be = $('setup-sub-ems');
    var hint = $('p-setup-ems');
    if (bp) bp.textContent = t[0];
    if (be) be.textContent = t[1];
    if (hint) hint.textContent = t[2];
    var bar = $('setup-sub');
    if (bar) {
      bar.addEventListener('click', function (ev) {
        var which = ev.target && ev.target.getAttribute ? ev.target.getAttribute('data-setup-sub') : null;
        if (which === 'price' || which === 'ems') show(which);
      });
    }
  }

  window.SetupNav = { init: init, _show: show };
})();
