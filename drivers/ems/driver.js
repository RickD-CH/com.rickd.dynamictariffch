'use strict';

const Homey = require('homey');

const NAMES = {
  de: 'Energiemanagement', en: 'Energy management', fr: "Gestion de l'énergie", it: "Gestione dell'energia",
};

/**
 * Treiber "Energiemanagement": genau ein Gerät pro Homey. Es ist die Anzeige (Modus, Status, Überschuss)
 * und der Ein/Aus-Schalter des EMS-Moduls. Ohne dieses Gerät laufen weder Timer noch Zugriffe des EMS.
 */
class EmsDriver extends Homey.Driver {
  async onPairListDevices() {
    if (this.getDevices().length) return []; // schon eingerichtet
    let lang = 'en';
    try { lang = this.homey.i18n.getLanguage(); } catch (err) { /* Standard */ }
    return [{ name: NAMES[lang] || NAMES.en, data: { id: 'ems' } }];
  }
}

module.exports = EmsDriver;
