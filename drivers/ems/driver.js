'use strict';

const Homey = require('homey');

const NAMES = {
  de: 'Energiemanagement', en: 'Energy management', fr: "Gestion de l'énergie", it: "Gestione dell'energia",
};

/**
 * Treiber "Energiemanagement": genau ein Gerät pro Homey. Es ist die Anzeige (Modus, Status, Überschuss)
 * und der Ein/Aus-Schalter des EMS-Moduls. Ohne dieses Gerät laufen weder Timer noch Zugriffe des EMS.
 */
const NEEDS_PRICE_DEVICE = {
  de: 'Zuerst das Preis-Gerät «Innostrom dynamischer Tarif» hinzufügen. Das Energiemanagement braucht seine 15-Minuten-Preise.',
  en: 'Add the "Innostrom dynamic tariff" price device first. Energy management needs its 15-minute prices.',
  fr: 'Ajoutez d\'abord l\'appareil de prix « Tarif dynamique Innostrom ». La gestion de l\'énergie a besoin de ses prix par quart d\'heure.',
  it: 'Aggiungi prima il dispositivo dei prezzi «Tariffa dinamica Innostrom». La gestione dell\'energia ha bisogno dei suoi prezzi ogni quarto d\'ora.',
};

class EmsDriver extends Homey.Driver {
  async onPairListDevices() {
    let lang = 'en';
    try {
      lang = this.homey.i18n.getLanguage();
    } catch (err) { /* Standard */ }
    // Voraussetzung: das Preis-Gerät (Innostrom) ist gekoppelt.
    let priceDevices = [];
    try {
      priceDevices = this.homey.drivers.getDriver('innostrom').getDevices();
    } catch (err) { /* Treiber fehlt: gilt als nicht gekoppelt */ }
    if (!priceDevices.length) throw new Error(NEEDS_PRICE_DEVICE[lang] || NEEDS_PRICE_DEVICE.en);
    if (this.getDevices().length) return []; // schon eingerichtet
    return [{ name: NAMES[lang] || NAMES.en, data: { id: 'ems' } }];
  }
}

module.exports = EmsDriver;
