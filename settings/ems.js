/* Energiemanagement in den Einstellungen.
 *   window.EmsUi.init(apiCall, lang)
 * Drei Ansichten:
 *   #ems-view-main     Reiter "EMS": Betrieb (Statuskopf, Schalter je Gerät)
 *   #ems-view-devices  Setup > Energiemanagement: Datenquellen und Verbraucher
 *   #ems-view-cmp      Reiter "EMS" > Vergleich (nur Testphase)
 * apiCall(method, path, body) -> Promise. */
(function () {
  'use strict';

  var STR = {
    de: {
      tab: 'Ausblick', subMain: 'Betrieb', cmpTab: 'Vergleich',
      noDevice: 'Das Energiemanagement ist noch nicht eingerichtet. Füge in Homey unter «Geräte» → «+» → «Dynamischer Stromtarif CH» das Gerät «Energiemanagement» hinzu.',
      devicesSec: 'Energiemanagement einrichten', sources: 'DATENQUELLEN', consumers: 'VERBRAUCHER',
      stOff: 'Ausgeschaltet', stTest: 'Läuft, aber noch kein Gerät ist zum Steuern freigegeben', stLive: 'Läuft und steuert',
      stWarn: 'Läuft mit Warnung', switchHint: 'Schalter ein: das Energiemanagement steuert dieses Gerät. Aus: es lässt das Gerät in Ruhe. Solange der Silent-Modus an ist, wird nur simuliert.',
      pvLbl: 'PV', gridLbl: 'Netz', batLbl: 'Batterie',
      noConsumers: 'Noch kein Verbraucher eingetragen.',
      plan: 'PLAN', planToday: 'Heute', planTomorrow: 'Morgen', planPrice: 'Preis in Rp./kWh', planPv: 'Solar-Prognose', planNow: 'jetzt',
      planBlock: 'Günstigster Block (2 h)', planPvKwh: 'Solar erwartet', planPriceRange: 'Preis min bis max', planNoPrices: 'Für diesen Tag sind noch keine Preise da.',
      planBat: 'Batterie (Plan)', planBatAdvice: 'Empfehlung, wird nicht gesteuert', planBatLive: 'gesteuert', planWallbox: 'Wallbox (Verlauf)', planTest: 'simuliert', planPlanned: 'geplant',
      planCheap: 'günstig', planNormal: 'normal', planExp: 'teuer', planBatCharge: 'Netzladen', planBatHold: 'Halten (Entladung gesperrt)', planBatNormal: 'Normal', planOn: 'ein',
      planNote: 'Die Batterie zeigt den Plan des Planers (alle 15 Minuten neu gerechnet, nur zum Vergleich). Wallbox und Verbraucher regeln nach dem aktuellen Überschuss: hier siehst du, was sie getan haben. Im Silent-Modus ist es die Simulation.',
      planDayTitle: 'Plan-Tag',
      carCal: 'Wochenvorlage (Mo bis So)', carCalHint: 'Gilt jede Woche. Ein Eintrag für «Heute» oder «Morgen» oben übersteuert den Tag.', carCalSave: 'Vorlage speichern', carCalReset: 'Verwerfen', carSetupHint: 'Ziele, «Heute/Morgen» und die Wochenvorlage stellst du unter «Ausblick» ein.',
      carDays: { mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa', sun: 'So' }, carTime: 'Abfahrt', carSoc: 'Ziel %',
      carHoliday: 'Ferien: Vorlage pausiert', carHolidayUntil: 'bis und mit (leer = bis ausgeschaltet)', carGrid: 'Netz nachladen, wenn die Sonne bis zur Abfahrt nicht reicht', carGridHint: 'Ein: die App lädt in den günstigsten Viertelstunden bis zur Abfahrt. Aus: nur Solarstrom.',
      carCard: 'E-AUTO', carNext: 'Nächstes Ziel', carNone: 'kein Ziel geplant', carFromCal: 'Vorlage', carFromOverride: 'übersteuert',
      carSt: { none: 'Kein Ziel', no_soc: 'Ladestand unbekannt', no_capacity: 'Batteriegrösse fehlt (Einrichten → E-Auto)', reached: 'Ziel erreicht', solar_only: 'Nur Solarstrom', planned: 'Geplant', short: 'Reicht nicht ganz bis zur Abfahrt' },
      carNotConnected: 'nicht angesteckt', carOverride: 'Heute oder morgen anders (übersteuert die Vorlage)', carToday: 'Heute', carTomorrow: 'Morgen', carCharge: 'laden',
      carApply: 'Übernehmen', carClear: 'Vorlage gilt wieder', carSaved: 'Gespeichert',
      silent: 'Silent-Modus: nur simulieren', silentHint: 'Ein: es wird nichts geschaltet. Protokoll und Ausblick zeigen, was passieren würde. Aus: die Geräte mit eingeschaltetem Schalter werden wirklich gesteuert.',
      stSilent: 'Silent-Modus: es wird nur simuliert', silentTag: 'Silent',
      batCtl: 'Batterie steuern', batCtlOn: 'Batterie über das Energiemanagement steuern', batCtlFound: 'Vorlage für dieses Gerät erkannt: Laden, Halten und Normal über die Karten der Batterie.',
      batCtlNone: 'Für dieses Gerät gibt es keine fertige Vorlage. Ordne unten selbst zu, welche Karten der Batterie bei Laden, Halten und Normal laufen.', batCtlNoCards: 'Das Gerät bietet keine Aktionskarten. Die Batterie kann nicht gesteuert werden.',
      batCtlMap: 'Zuordnung', batCtlMapAuto: 'erkannte Vorlage', batCtlMapCustom: 'eigene Zuordnung', batCtlAddStep: 'Karte hinzufügen', batCtlPick: '- Karte wählen -', batCtlDel: 'Entfernen',
      batCtlPh: 'In Zahlenfeldern gehen auch Platzhalter: {power} = Ladeleistung (W), {target_soc} = Ziel-Ladestand (%), {normal_discharge} = normale Entladeleistung (W).', batCtlEmpty: 'keine Karte (es wird nichts gesendet)', batCtlLoading: 'Karten der Batterie werden geprüft ...',
      batCtlWarn: 'Nur ein System darf die Batterie steuern. Schalte die Batteriesteuerung im anderen Energiemanagement und eigene Batterie-Flows aus, bevor du live schaltest.',
      batCtlPower: 'Ladeleistung beim Netzladen (kW)', batCtlTarget: 'Ziel-Ladestand beim Netzladen (%)', batCtlNormal: 'Normale Entladeleistung (W)', batCtlRepeat: 'Befehl wiederholen alle (min)',
      batCtlSteps: 'So wird gesteuert', batModeCharge: 'Laden', batModeHold: 'Halten', batModeNormal: 'Normal', batCarSkip: 'nicht, solange das Auto lädt',
      batRow: 'Batterie', batRowNone: 'noch nichts gesendet', batSent: 'zuletzt',
      logTitle: 'PROTOKOLL', logNone: 'Noch keine Einträge.', logOnWord: 'ein', logOffWord: 'aus', logTestTag: 'simuliert',
      cmpSwitch: 'Vergleich aktiv', cmpSwitchHint: 'Nur für die Testphase. Eingeschaltet liest die App ein zweites Energiemanagement mit, um die Entscheide zu vergleichen. Ausgeschaltet greift sie auf keine andere App zu.',
      maxConsumers: 'Höchstens 8 gesteuerte Verbraucher. Entferne einen oder führe weitere als reine Kostenzähler (ohne Gerät zum Schalten).',
      srcCar: 'E-Auto', whyCar: 'Optional, empfohlen mit Wallbox. Mit dem Ladestand des Autos (aus der App deines Autos) kannst du Aufträge als «Ziel-Ladestand bis Uhrzeit» planen. Ohne läuft alles weiter, dann gibst du die Energie in kWh an.',
      carCap: 'Batteriegrösse des Autos (kWh)', carSocLbl: 'E-Auto', carNow: 'E-Auto jetzt', pvTargetSoc: 'Ziel-Ladestand (%, statt Energie)', pvNeedCarSoc: 'Der Ladestand des E-Autos ist unbekannt (Setup → E-Auto)', pvNeedCarCap: 'Batteriegrösse des E-Autos fehlt (Setup → E-Auto)',
      pvReachedAlready: 'Das Auto hat den Ziel-Ladestand schon erreicht', pvSocFrom: 'von', pvSocTo: 'auf', pvDayStrip: 'Vorschau im Tagesverlauf',
      ctrlKind: 'Schalten über', ctrlViaDevice: 'Gerät (ein/aus)', ctrlViaFlow: 'Homey-Flows (ein und aus)', flowOnLbl: 'Flow zum Einschalten', flowOffLbl: 'Flow zum Ausschalten', flowNone: '- Flow wählen -', flowAdv: '(erweitert)',
      flowHint: 'Der Flow braucht den Start-Trigger «Dieser Flow wird gestartet». Bei Flow-Steuerung kennt die App den Zustand des Verbrauchers nicht, sie rechnet mit dem, was sie selbst geschaltet hat.',
      flowsNone: 'Es wurden keine startbaren Flows gefunden.', assumedW: 'Leistung des Verbrauchers (W, für die Überschussrechnung)',
      pvReached: 'erreicht', pvReachedSoFar: 'bisher erreicht', pvForecastLeg: 'Prognose',
      planTable: 'AB JETZT: WANN PASSIERT WAS', planColTime: 'Zeit', planColWhat: 'Was passiert', planColPrice: 'Ø Rp.', planNothing: 'Es sind noch keine Preisdaten für die kommenden Stunden da.',
      planTablePrices: 'AB JETZT: PREISE', planColLevel: 'Preisniveau',
      planShortCharge: 'Laden', planShortHold: 'Halten', planShortSolar: 'Solar', planShortFull: 'voll', planTableHint: '= geplant, sonst läuft es schon so.',
      planChSolar: 'lädt (Solar)', planChFull: 'lädt (volle Leistung)', planTag: 'geplant', planLegWallbox: 'Wallbox lädt', planLegConsumer: 'Verbraucher ein', planLegJob: 'Auftrag / Vorschau',
      calcTitle: 'BERECHNUNG', calcRow: 'Rechenintervall', calcAuto: 'Automatisch', calcEvery: 'Alle', calcSecs: 's', calcOptAuto: 'Automatisch (15 s mit Auto, 30 s mit Verbrauchern, sonst 5 min)', calcOpt15: 'Alle 15 Sekunden', calcOpt30: 'Alle 30 Sekunden', calcOpt60: 'Jede Minute', calcOpt300: 'Alle 5 Minuten',
      calcLabel: 'Wallbox und Verbraucher rechnen', calcTick: 'Batterie-Plan alle (Minuten)', calcDevices: 'gelesene Geräte', calcCalls: 'Abfragen pro Stunde',
      calcAutoImpact: 'Je nach Lage: ruhig 5 min, mit Verbrauchern 30 s, mit Auto an der Wallbox 15 s.',
      calcImpact: 'Kürzer: reagiert schneller auf Wolken und Lastwechsel, belastet Homey aber stärker (sehr viele Abfragen können das Limit von Homey erreichen). Länger: ruhiger und schonender, die Anlage reagiert träger und etwas Überschuss geht ans Netz. Halte- und Karenzzeiten (in Sekunden) wirken nur im Takt des Laufs.',
      calcTickHint: 'Der Batterie-Plan (nur Vergleich) rechnet in diesem Takt, 1 bis 15 Minuten. Die Preise ändern sich nur alle 15 Minuten.',
      pvTitle: 'VORSCHAU: AUFTRAG PLANEN', pvIntro: 'Gib ein, was bis wann passieren soll. Die Vorschau zeigt, in welchen Viertelstunden es laufen würde. Es wird nichts gespeichert und nichts geschaltet.',
      pvDevice: 'Gerät', pvUntil: 'Fertig bis', pvKwh: 'Energie (kWh)', pvHours: 'Laufzeit (h)', pvPower: 'Leistung (kW, leer = automatisch)', pvMaxPrice: 'Höchstpreis (Rp./kWh, leer = egal)',
      pvBlock: 'am Stück laufen', pvRun: 'Vorschau', pvClear: 'Zurücksetzen', pvPreviewLbl: 'Vorschau', pvRunsFrom: 'Läuft von', pvTo: 'bis', pvIn: 'in', pvQuarters: 'Viertelstunden zwischen',
      pvAvg: 'Durchschnitt', pvCost: 'Kosten ca.', pvNeedAmount: 'Menge eingeben', pvBadTime: 'Uhrzeit ungültig', pvRepeat: 'Wiederholen', pvRep: { once: 'einmalig', daily: 'täglich', weekdays: 'Mo bis Fr', weekend: 'Sa und So' }, pvRepeatSoc: 'Ein Ziel-Ladestand gilt nur einmalig. Jede Woche gleich: Wochenvorlage unter «E-Auto».', pvRepeatHint: 'Wiederkehrend: geplant wird jeweils in den 24 Stunden vor der Frist.',
      pvR_prices_missing: 'Für diese Frist sind noch nicht alle Preise bekannt', pvR_too_expensive: 'Unter dem Höchstpreis gibt es nicht genug Viertelstunden', pvR_too_short: 'Bis dahin reicht die Zeit nicht',
      pvR_no_block: 'Es gibt keinen zusammenhängenden Block unter dem Höchstpreis', pvR_deadline_passed: 'Die Frist ist schon vorbei', pvHave: 'möglich', pvOf: 'von',
      pvSave: 'Übernehmen', pvJobs: 'AKTIVE AUFTRÄGE', pvJobWord: 'Auftrag', pvRemove: 'Entfernen', pvUntilShort: 'bis', pvRunningNow: 'läuft jetzt', pvPlannedAt: 'geplant', pvWaiting: 'wartet auf Preise',
      pvProgress: 'Viertelstunden gelaufen', pvJobNote: 'Aufträge werden bei jedem Lauf mit den aktuellen Preisen neu geplant. Im Silent-Modus wird nur simuliert.', pvSaveFailed: 'Konnte nicht gespeichert werden',
      pvSavedOk: 'Auftrag übernommen',
      setupReady: 'Bereit: alle Pflicht-Quellen sind gewählt', setupMissing: 'Es fehlt noch:',
      setupNoBat: 'Ohne Hausbatterie läuft das Energiemanagement trotzdem: Wallbox und Verbraucher laden nach Überschuss. Modi nach Batteriestand sind dann nicht möglich.',
      suggest: 'Automatisch vorschlagen', suggested: 'Vorschläge eingetragen:', nothingSuggested: 'Nichts Passendes gefunden',
      tagRequired: 'Pflicht', tagRecommended: 'Empfohlen', tagOptional: 'Optional', tagAuto: 'Automatisch',
      notChosen: 'nicht gewählt', device: 'Gerät', value: 'Wert', pick: '- Gerät wählen -', none: '- keines -', pickFirst: '- zuerst Gerät wählen -',
      fuseTitle: 'HAUSANSCHLUSS', fuseRow: 'Hausanschluss-Schutz', fuseOff: 'aus', fuseOn: 'Hausanschluss schützen',
      fuseWhy: 'Hält jede Phase unter der Grenze der Hausanschluss-Sicherung: zuerst wird die Wallbox gedrosselt, reicht das nicht, werden die Geräte unten der Reihe nach ausgeschaltet.',
      fuseAmps: 'Sicherung (A)', fuseReserve: 'Reserve (% der Sicherung)', fuseLimitLbl: 'Grenze', fusePerPhase: 'pro Phase', fuseMeter: 'Zähler mit Phasenströmen', fuseMeterGrid: 'wie Netzzähler', fusePhase: 'Phase',
      fuseThrottle: 'Wallbox drosseln, damit keine Phase über die Grenze geht', fuseThrottleHint: 'Die Wallbox bekommt höchstens den Strom, der auf der knappsten Phase noch frei ist. Gilt, wenn das Energiemanagement die Wallbox steuert.',
      fuseHold: 'Wartezeit vor dem Ausschalten (s)', fuseRestore: 'Freigabe nach (min unter der Grenze)', fuseShedTitle: 'BEI ÜBERLAST DER REIHE NACH AUSSCHALTEN', fuseShedNone: 'Keine Geräte gewählt.', fuseAdd: 'Hinzufügen', fuseAddPick: '- Gerät oder Flow wählen -',
      fuseUp: 'nach oben', fuseDel: 'Entfernen', fuseFlow: 'Flow', fuseLive: 'Schutz live (sonst nur simulieren)', fuseLiveHint: 'Live schaltet der Schutz die gewählten Geräte wirklich aus. Der Silent-Modus hat Vorrang. Vorher die entsprechenden Zweige in eigenen Flows ausschalten, damit nur ein System schaltet.',
      fuseNoRestore: 'Ausgeschaltete Geräte schaltet die App nicht wieder ein. Die Wallbox darf nach der Freigabe wieder laden.', fuseNoPhases: 'Der Zähler liefert keine Phasenströme. Bitte Zähler und Werte prüfen.',
      fuseNow: 'Hausanschluss', fuseOf: 'von', fuseThrottled: 'Wallbox auf', fuseShedNow: 'aus:', fuseEvOver: 'Grenze überschritten', fuseEvShed: 'ausgeschaltet', fuseEvThrottle: 'Wallbox gedrosselt auf', fuseEvThrottleEnd: 'Wallbox nicht mehr gedrosselt', fuseEvRelease: 'freigegeben',
      srcGrid: 'Netzzähler', srcPv: 'Solar-Wechselrichter', srcHouse: 'Hausverbrauch', srcBat: 'Hausbatterie', srcPrice: 'Strompreis', srcFc: 'Solarprognose',
      whyGrid: 'Der Netzzähler ist die Grundlage: Bezug positiv, Einspeisung negativ. Ohne ihn kann nichts geregelt werden.',
      whyPv: 'Verbessert die Berechnung des Überschusses (Erzeugung minus Verbrauch) und die Verteilung auf Batterie und Geräte.',
      whyHouse: 'Verbessert die Berechnung des Überschusses. Kann derselbe Zähler wie der Netzzähler sein, wenn er den Hausverbrauch liefert.',
      whyBat: 'Optional. Mit Batterie gibt es Schutz-Stufen, die Prognose-Sperre und Modi nach Batteriestand. Ohne läuft alles nach Überschuss.',
      whyPrice: 'Voraussetzung: das Preis-Gerät «Dynamischer Stromtarif CH» ist eingerichtet. Die 15-Minuten-Preise kommen automatisch von dort, hier ist nichts zu wählen.',
      priceMissing: 'Preis-Gerät fehlt - zuerst in Homey hinzufügen', noPriceDevice: 'Das Energiemanagement braucht das Preis-Gerät «Dynamischer Stromtarif CH». Füge es in Homey unter «Geräte» → «+» hinzu.',
      whyFc: 'Optional. Sie steuert die Prognose-Sperre und die Plan-Sicht. Homey liefert Tageswerte (heute, morgen), die App verteilt sie als Tageskurve. Genauer ist eine eigene Prognose in Stunden, die du per Flow-Aktion «PV-Prognose setzen» einlieferst.',
      fcSource: 'Quelle', fcSrcAuto: 'Automatisch (eingeliefert, sonst Homey)', fcSrcHomey: 'Homey (Energie-Prognose)', fcSrcDevice: 'Tageswerte eines Geräts', fcSrcExternal: 'Nur per Flow-Aktion einliefern',
      fcToday: 'Wert für heute (kWh)', fcTomorrow: 'Wert für morgen (kWh)', fcFrom: 'Quelle', fcNames: { homey: 'Homey', device: 'Gerät', external: 'Flow-Aktion', fallback: 'Vergleichsquelle' }, fcDays: 'heute', fcDay2: 'morgen',
      fcCurveHint: 'Aus einem Tageswert entsteht eine Kurve zwischen Sonnenaufgang und -untergang. Das ist eine Näherung ohne Wolkenverlauf.',
      autoPrice: 'aus dieser App', fcNone: 'nicht eingeliefert', fcAge: 'zuletzt vor', fcStale: 'veraltet', fcSlots: 'Einträge', min: 'min', h: 'h',
      factor: 'Korrekturfaktor', factorHint: 'Wird auf jeden Wert der Prognose angewendet, zum Beispiel 0.75, wenn sie meist 25 % zu hoch liegt.',
      wallbox: 'Wallbox', chargeNow: 'Sofort laden (volle Leistung)', addConsumer: 'Verbraucher hinzufügen', remove: 'Entfernen',
      name: 'Name', type: 'Typ', typeGeneric: 'Allgemeiner Verbraucher', typeDehum: 'Luftentfeuchter',
      ctrlDevice: 'Gerät zum Schalten', meterDevice: 'Zähler für die Kosten (kWh)', mode: 'Einschalten',
      modeFull: 'Bei voller Batterie', modeSoc: 'Ab Batterie-SoC', modeSurplus: 'Bei Überschuss', noCtrl: 'nur Kostenzähler',
      fullSoc: 'Voll ab SoC (%)', socOn: 'Ein ab SoC (%)', hysteresis: 'Aus unter (Prozentpunkte darunter)',
      minSurplus: 'Mindest-Überschuss (W)', startSustain: 'Überschuss muss anhalten (s)', stopGrace: 'Karenz vor dem Ausschalten (s)',
      advanced: 'Erweitert', minRun: 'Mindestlaufzeit (min)', minOff: 'Mindest-Pause (min)', protect: 'Schutz-SoC: darunter sofort aus (%)', useGate: 'Prognose-Sperre beachten',
      maxAmps: 'Maximalstrom (A)', stepHold: 'Haltezeit vor Erhöhung (s)', chargeNowAutoOff: '«Sofort laden» beim Abstecken ausschalten',
      humTitle: 'Feuchte-Notlauf', humEnable: 'Notlauf bei hoher Luftfeuchtigkeit', humSensor: 'Feuchte-Sensor', humOn: 'Notlauf ein ab (%)', humOff: 'Notlauf aus unter (%)', humRun: 'Höchstdauer (min)',
      humHint: 'Läuft unabhängig von Batterie und Überschuss, bis die Feuchte unter den Aus-Wert fällt oder die Höchstdauer um ist. Danach startet er erst wieder, wenn die Feuchte zwischendurch unter den Ein-Wert gefallen ist.',
      modeTest: 'nicht gesteuert', modeLiveTag: 'gesteuert', costLast: 'Zähler zuletzt', noBatMode: 'Ohne Hausbatterie ist nur «Bei Überschuss» möglich.',
      save: 'EMS-Einstellungen speichern', saved: 'Gespeichert', error: 'Fehler', toggleFailed: 'Schalter konnte nicht gesetzt werden',
      modeNames: { disabled: 'Aus', idle: 'Bereit', holding: 'Wartet auf Überschuss', solar_ev: 'Lädt mit Solarstrom', instant_ev: 'Lädt mit voller Leistung', battery_priority: 'Batterie hat Vorrang', error: 'Fehler' },
      otherEms: 'Steuert schon ein anderes Energiemanagement diese Wallbox, dort zuerst ausschalten. Sonst steuern zwei Systeme dieselbe Wallbox.',
      cmpIntro: 'Was dieses Energiemanagement tun würde, verglichen mit dem, was das andere Energiemanagement tut. Gleich = beide wählen im selben Lauf denselben Modus.',
      cmpOff: 'Das Energiemanagement ist ausgeschaltet, es kommen keine neuen Vergleichsdaten. Gezeigt werden die bisherigen. Zum Weitervergleichen im Reiter «Betrieb» einschalten (mit Silent-Modus wird nichts gesteuert).',
      cmpSource: 'Vergleichsquelle', cmpDev: 'Anderes Energiemanagement (optional, nur Vergleich)', batterySec: 'Batterie-Planer (nur Vergleich)',
      cmpBattery: 'Batterie', cmpCharger: 'Wallbox', overall: 'Gesamt gleich', perDay: 'Pro Tag', changes: 'Letzte Wechsel', time: 'Zeit', price: 'Preis', reason: 'Grund',
      runs: 'Läufe', compared: 'Vergleiche', mine: 'Dieses EMS', theirs: 'Anderes EMS', none2: 'Noch keine Daten.', day: 'Tag', same: 'gleich', nowSec: 'Jetzt (Vergleich)',
      targetSoc: 'Ziel-SoC (%)', reserve: 'Reserve (Stunden)', solarLimit: 'Solar-Schwelle (kWh)',
    },
    en: {
      tab: 'Outlook', subMain: 'Operation', cmpTab: 'Compare',
      noDevice: 'Energy management is not set up yet. In Homey go to Devices → "+" → "Swiss Dynamic Electricity Tariff" and add the "Energy management" device.',
      devicesSec: 'Set up energy management', sources: 'DATA SOURCES', consumers: 'CONSUMERS',
      stOff: 'Switched off', stTest: 'Running, but no device is released for control yet', stLive: 'Running and controlling',
      stWarn: 'Running with a warning', switchHint: 'Switch on: the energy management controls this device. Off: it leaves the device alone. While silent mode is on, everything is only simulated.',
      pvLbl: 'PV', gridLbl: 'Grid', batLbl: 'Battery',
      noConsumers: 'No consumer yet.',
      plan: 'PLAN', planToday: 'Today', planTomorrow: 'Tomorrow', planPrice: 'Price in Rp./kWh', planPv: 'Solar forecast', planNow: 'now',
      planBlock: 'Cheapest block (2 h)', planPvKwh: 'Solar expected', planPriceRange: 'Price min to max', planNoPrices: 'No prices for this day yet.',
      planBat: 'Battery (plan)', planBatAdvice: 'recommendation, not controlled', planBatLive: 'controlled', planWallbox: 'EV charger (history)', planTest: 'simulated', planPlanned: 'planned',
      planCheap: 'cheap', planNormal: 'normal', planExp: 'expensive', planBatCharge: 'Grid charging', planBatHold: 'Hold (discharge blocked)', planBatNormal: 'Normal', planOn: 'on',
      planNote: 'The battery shows the planner\'s plan (recalculated every 15 minutes, comparison only). EV charger and consumers follow the current surplus: here you see what they did. In test mode it is the simulation.',
      planDayTitle: 'Plan day',
      carCal: 'Weekly template (Mon to Sun)', carCalHint: 'Applies every week. An entry for "Today" or "Tomorrow" above overrides the day.', carCalSave: 'Save template', carCalReset: 'Discard', carSetupHint: 'Targets, "Today/Tomorrow" and the weekly template are set under "Outlook".',
      carDays: { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }, carTime: 'Departure', carSoc: 'Target %',
      carHoliday: 'Holiday: template paused', carHolidayUntil: 'until and including (empty = until switched off)', carGrid: 'Charge from the grid if the sun is not enough by departure', carGridHint: 'On: the app charges in the cheapest quarter-hours before departure. Off: solar only.',
      carCard: 'EV', carNext: 'Next target', carNone: 'no target planned', carFromCal: 'template', carFromOverride: 'override',
      carSt: { none: 'No target', no_soc: 'Charge level unknown', no_capacity: 'Battery size missing (Set up → EV)', reached: 'Target reached', solar_only: 'Solar only', planned: 'Planned', short: 'Not quite enough before departure' },
      carNotConnected: 'not plugged in', carOverride: 'Different today or tomorrow (overrides the template)', carToday: 'Today', carTomorrow: 'Tomorrow', carCharge: 'charge',
      carApply: 'Apply', carClear: 'Use the template again', carSaved: 'Saved',
      silent: 'Silent mode: simulate only', silentHint: 'On: nothing is switched. Log and outlook show what would happen. Off: devices with their switch on are really controlled.',
      stSilent: 'Silent mode: only simulating', silentTag: 'silent',
      batCtl: 'Control the battery', batCtlOn: 'Control the battery through energy management', batCtlFound: 'Template for this device found: charge, hold and normal via the battery\'s cards.',
      batCtlNone: 'There is no ready-made template for this device. Assign below which of the battery\'s cards run for Charge, Hold and Normal.', batCtlNoCards: 'The device has no action cards. The battery cannot be controlled.',
      batCtlMap: 'Mapping', batCtlMapAuto: 'detected template', batCtlMapCustom: 'own mapping', batCtlAddStep: 'Add card', batCtlPick: '- pick a card -', batCtlDel: 'Remove',
      batCtlPh: 'Number fields also accept placeholders: {power} = charge power (W), {target_soc} = target charge (%), {normal_discharge} = normal discharge power (W).', batCtlEmpty: 'no card (nothing is sent)', batCtlLoading: 'Checking the battery\'s cards ...',
      batCtlWarn: 'Only one system may control the battery. Switch off battery control in the other energy management and your own battery flows before going live.',
      batCtlPower: 'Charge power when charging from the grid (kW)', batCtlTarget: 'Target charge when charging from the grid (%)', batCtlNormal: 'Normal discharge power (W)', batCtlRepeat: 'Repeat command every (min)',
      batCtlSteps: 'How it is controlled', batModeCharge: 'Charge', batModeHold: 'Hold', batModeNormal: 'Normal', batCarSkip: 'not while the car is charging',
      batRow: 'Battery', batRowNone: 'nothing sent yet', batSent: 'last',
      logTitle: 'LOG', logNone: 'No entries yet.', logOnWord: 'on', logOffWord: 'off', logTestTag: 'simulated',
      cmpSwitch: 'Comparison active', cmpSwitchHint: 'For the test phase only. When on, the app also reads a second energy management to compare decisions. When off it does not access any other app.',
      maxConsumers: 'At most 8 controlled consumers. Remove one or keep further ones as cost meters only (without a device to switch).',
      srcCar: 'EV', whyCar: 'Optional, recommended with a charger. With the car\'s state of charge (from your car\'s app) you can plan jobs as "target charge by time". Without it everything keeps working, then you enter the energy in kWh.',
      carCap: 'Car battery size (kWh)', carSocLbl: 'EV', carNow: 'EV now', pvTargetSoc: 'Target charge (%, instead of energy)', pvNeedCarSoc: 'The EV charge level is unknown (Setup → EV)', pvNeedCarCap: 'Car battery size is missing (Setup → EV)',
      pvReachedAlready: 'The car has already reached the target charge', pvSocFrom: 'from', pvSocTo: 'to', pvDayStrip: 'Preview over the day',
      ctrlKind: 'Switch via', ctrlViaDevice: 'Device (on/off)', ctrlViaFlow: 'Homey flows (on and off)', flowOnLbl: 'Flow to switch on', flowOffLbl: 'Flow to switch off', flowNone: '- choose flow -', flowAdv: '(advanced)',
      flowHint: 'The flow needs the start trigger "This Flow is started". With flow control the app does not know the consumer\'s state, it works with what it switched itself.',
      flowsNone: 'No startable flows were found.', assumedW: 'Power of the consumer (W, for the surplus calculation)',
      pvReached: 'reached', pvReachedSoFar: 'reached so far', pvForecastLeg: 'Forecast',
      planTable: 'FROM NOW: WHAT HAPPENS WHEN', planColTime: 'Time', planColWhat: 'What happens', planColPrice: 'Avg Rp.', planNothing: 'There is no price data for the coming hours yet.',
      planTablePrices: 'FROM NOW: PRICES', planColLevel: 'Price level',
      planShortCharge: 'charge', planShortHold: 'hold', planShortSolar: 'solar', planShortFull: 'full', planTableHint: '= planned, otherwise it is already running like this.',
      planChSolar: 'charging (solar)', planChFull: 'charging (full power)', planTag: 'planned', planLegWallbox: 'EV charging', planLegConsumer: 'Consumer on', planLegJob: 'Job / preview',
      calcTitle: 'CALCULATION', calcRow: 'Calculation interval', calcAuto: 'Automatic', calcEvery: 'Every', calcSecs: 's', calcOptAuto: 'Automatic (15 s with a car, 30 s with consumers, else 5 min)', calcOpt15: 'Every 15 seconds', calcOpt30: 'Every 30 seconds', calcOpt60: 'Every minute', calcOpt300: 'Every 5 minutes',
      calcLabel: 'EV charger and consumers calculate', calcTick: 'Battery plan every (minutes)', calcDevices: 'devices read', calcCalls: 'requests per hour',
      calcAutoImpact: 'Depending on the situation: idle 5 min, with consumers 30 s, with a car at the charger 15 s.',
      calcImpact: 'Shorter: reacts faster to clouds and load changes but puts more load on Homey (very many requests can hit Homey\'s limit). Longer: calmer and gentler, but the system reacts more slowly and some surplus goes to the grid. Hold and grace times (in seconds) only act in the rhythm of the run.',
      calcTickHint: 'The battery plan (comparison only) calculates at this rhythm, 1 to 15 minutes. Prices only change every 15 minutes.',
      pvTitle: 'PREVIEW: PLAN A JOB', pvIntro: 'Enter what should happen by when. The preview shows in which quarter-hours it would run. Nothing is saved and nothing is switched.',
      pvDevice: 'Device', pvUntil: 'Done by', pvKwh: 'Energy (kWh)', pvHours: 'Run time (h)', pvPower: 'Power (kW, empty = automatic)', pvMaxPrice: 'Maximum price (Rp./kWh, empty = any)',
      pvBlock: 'run in one block', pvRun: 'Preview', pvClear: 'Reset', pvPreviewLbl: 'preview', pvRunsFrom: 'Runs from', pvTo: 'to', pvIn: 'in', pvQuarters: 'quarter-hours between',
      pvAvg: 'Average', pvCost: 'Cost approx.', pvNeedAmount: 'Enter an amount', pvBadTime: 'Invalid time', pvRepeat: 'Repeat', pvRep: { once: 'once', daily: 'daily', weekdays: 'Mon to Fri', weekend: 'Sat and Sun' }, pvRepeatSoc: 'A target charge applies once only. Same every week: weekly template under "EV".', pvRepeatHint: 'Recurring: planned within the 24 hours before the deadline.',
      pvR_prices_missing: 'Not all prices are known for this deadline yet', pvR_too_expensive: 'Not enough quarter-hours under the maximum price', pvR_too_short: 'There is not enough time until then',
      pvR_no_block: 'There is no continuous block under the maximum price', pvR_deadline_passed: 'The deadline has already passed', pvHave: 'possible', pvOf: 'of',
      pvSave: 'Apply', pvJobs: 'ACTIVE JOBS', pvJobWord: 'job', pvRemove: 'Remove', pvUntilShort: 'by', pvRunningNow: 'running now', pvPlannedAt: 'planned', pvWaiting: 'waiting for prices',
      pvProgress: 'quarter-hours run', pvJobNote: 'Jobs are re-planned on every run with the current prices. In silent mode they are only simulated.', pvSaveFailed: 'Could not be saved',
      pvSavedOk: 'Job applied',
      setupReady: 'Ready: all required sources are chosen', setupMissing: 'Still missing:',
      setupNoBat: 'Without a home battery energy management still works: the EV charger and consumers charge from surplus. Modes by battery level are then not possible.',
      suggest: 'Suggest automatically', suggested: 'Suggestions filled in:', nothingSuggested: 'Nothing suitable found',
      tagRequired: 'Required', tagRecommended: 'Recommended', tagOptional: 'Optional', tagAuto: 'Automatic',
      notChosen: 'not chosen', device: 'Device', value: 'Value', pick: '- choose device -', none: '- none -', pickFirst: '- choose a device first -',
      fuseTitle: 'HOUSE CONNECTION', fuseRow: 'Main fuse protection', fuseOff: 'off', fuseOn: 'Protect the main fuse',
      fuseWhy: 'Keeps every phase below the limit of the main fuse: first the EV charger is throttled; if that is not enough, the devices below are switched off one after the other.',
      fuseAmps: 'Main fuse (A)', fuseReserve: 'Reserve (% of the fuse)', fuseLimitLbl: 'Limit', fusePerPhase: 'per phase', fuseMeter: 'Meter with phase currents', fuseMeterGrid: 'same as grid meter', fusePhase: 'Phase',
      fuseThrottle: 'Throttle the EV charger so that no phase exceeds the limit', fuseThrottleHint: 'The charger gets at most the current still free on the tightest phase. Applies when the energy management controls the charger.',
      fuseHold: 'Wait before switching off (s)', fuseRestore: 'Release after (min below the limit)', fuseShedTitle: 'ON OVERLOAD SWITCH OFF IN THIS ORDER', fuseShedNone: 'No devices selected.', fuseAdd: 'Add', fuseAddPick: '- pick a device or flow -',
      fuseUp: 'up', fuseDel: 'Remove', fuseFlow: 'Flow', fuseLive: 'Protection live (otherwise simulate only)', fuseLiveHint: 'Live, the protection really switches the selected devices off. Silent mode takes precedence. Switch off the matching branches in your own flows first so that only one system switches.',
      fuseNoRestore: 'Devices that were switched off are not switched back on. The EV charger may charge again after the release.', fuseNoPhases: 'The meter does not deliver phase currents. Please check the meter and values.',
      fuseNow: 'House connection', fuseOf: 'of', fuseThrottled: 'EV charger at', fuseShedNow: 'off:', fuseEvOver: 'limit exceeded', fuseEvShed: 'switched off', fuseEvThrottle: 'EV charger throttled to', fuseEvThrottleEnd: 'EV charger no longer throttled', fuseEvRelease: 'released',
      srcGrid: 'Grid meter', srcPv: 'Solar inverter', srcHouse: 'House consumption', srcBat: 'Home battery', srcPrice: 'Electricity price', srcFc: 'Solar forecast',
      whyGrid: 'The grid meter is the basis: import positive, export negative. Nothing can be controlled without it.',
      whyPv: 'Improves the surplus calculation (generation minus consumption) and how it is split between battery and devices.',
      whyHouse: 'Improves the surplus calculation. Can be the same meter as the grid meter if it reports house consumption.',
      whyBat: 'Optional. With a battery there are protection levels, the forecast gate and modes by battery level. Without it everything runs by surplus.',
      whyPrice: 'Prerequisite: the "Swiss Dynamic Electricity Tariff" price device is set up. The 15-minute prices come from it automatically, nothing to choose here.',
      priceMissing: 'Price device missing - add it in Homey first', noPriceDevice: 'Energy management needs the "Swiss Dynamic Electricity Tariff" price device. Add it in Homey under Devices → "+".',
      whyFc: 'Optional. It drives the forecast gate and the plan view. Homey provides daily values (today, tomorrow) which the app spreads into a daily curve. More precise is your own hourly forecast fed with the Flow action "Set the solar forecast".',
      fcSource: 'Source', fcSrcAuto: 'Automatic (fed in, otherwise Homey)', fcSrcHomey: 'Homey (energy forecast)', fcSrcDevice: 'Daily values of a device', fcSrcExternal: 'Only fed in by Flow action',
      fcToday: 'Value for today (kWh)', fcTomorrow: 'Value for tomorrow (kWh)', fcFrom: 'Source', fcNames: { homey: 'Homey', device: 'device', external: 'Flow action', fallback: 'comparison source' }, fcDays: 'today', fcDay2: 'tomorrow',
      fcCurveHint: 'A daily value becomes a curve between sunrise and sunset. This is an approximation without cloud cover.',
      autoPrice: 'from this app', fcNone: 'not fed', fcAge: 'last', fcStale: 'outdated', fcSlots: 'entries', min: 'min', h: 'h',
      factor: 'Correction factor', factorHint: 'Applied to every forecast value, for example 0.75 if it is usually 25 % too high.',
      wallbox: 'EV charger', chargeNow: 'Charge now (full power)', addConsumer: 'Add consumer', remove: 'Remove',
      name: 'Name', type: 'Type', typeGeneric: 'Generic consumer', typeDehum: 'Dehumidifier',
      ctrlDevice: 'Device to switch', meterDevice: 'Meter for costs (kWh)', mode: 'Switch on',
      modeFull: 'When battery is full', modeSoc: 'From battery SoC', modeSurplus: 'On surplus', noCtrl: 'cost meter only',
      fullSoc: 'Full from SoC (%)', socOn: 'On from SoC (%)', hysteresis: 'Off below (points under that)',
      minSurplus: 'Minimum surplus (W)', startSustain: 'Surplus must last (s)', stopGrace: 'Grace before switching off (s)',
      advanced: 'Advanced', minRun: 'Minimum run time (min)', minOff: 'Minimum pause (min)', protect: 'Protect SoC: off immediately below (%)', useGate: 'Respect forecast gate',
      maxAmps: 'Maximum current (A)', stepHold: 'Hold time before increase (s)', chargeNowAutoOff: 'Switch off "Charge now" when unplugged',
      humTitle: 'Humidity emergency run', humEnable: 'Emergency run at high humidity', humSensor: 'Humidity sensor', humOn: 'Emergency run on from (%)', humOff: 'Emergency run off below (%)', humRun: 'Maximum duration (min)',
      humHint: 'Runs regardless of battery and surplus until humidity drops below the off value or the maximum duration is over. It only starts again after humidity has dropped below the on value in between.',
      modeTest: 'not controlled', modeLiveTag: 'controlled', costLast: 'Meter last', noBatMode: 'Without a home battery only "On surplus" is possible.',
      save: 'Save energy management settings', saved: 'Saved', error: 'Error', toggleFailed: 'Could not set the switch',
      modeNames: { disabled: 'Off', idle: 'Idle', holding: 'Waiting for surplus', solar_ev: 'Charging from solar', instant_ev: 'Charging at full power', battery_priority: 'Battery first', error: 'Error' },
      otherEms: 'If another energy management already controls this charger, switch it off there first. Otherwise two systems control the same charger.',
      cmpIntro: "What this energy management would do, compared with what the other energy management does. Same = both choose the same mode in the same run.",
      cmpOff: 'Energy management is switched off, so no new comparison data arrives. The previous data is shown. To keep comparing, switch it on in the "Operation" view (with silent mode nothing is controlled).',
      cmpSource: 'Comparison source', cmpDev: 'Other energy management (optional, comparison only)', batterySec: 'Battery planner (comparison only)',
      cmpBattery: 'Battery', cmpCharger: 'EV charger', overall: 'Overall same', perDay: 'Per day', changes: 'Recent changes', time: 'Time', price: 'Price', reason: 'Reason',
      runs: 'Runs', compared: 'Comparisons', mine: 'This EMS', theirs: 'Other EMS', none2: 'No data yet.', day: 'Day', same: 'same', nowSec: 'Now (comparison)',
      targetSoc: 'Target SoC (%)', reserve: 'Reserve (hours)', solarLimit: 'Solar threshold (kWh)',
    },
  };

  // Symbole (Linien, 24x24)
  var ICONS = {
    bolt: 'M13 3 4 14h7l-1 7 9-11h-7z',
    car: 'M5 17H3v-5l2-5h14l2 5v5h-2M9 17h6M3 12h18M7 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM17 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    solar: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5',
    home: 'M3 11 12 3l9 8M5 10v10h14V10',
    battery: 'M4 8h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM21 11v2M8 11v2',
    coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v10M9.5 9.5C9.5 8.5 10.5 8 12 8s2.5.5 2.5 1.5S13.5 11 12 11s-2.5.5-2.5 1.5S10.5 14 12 14s2.5-.5 2.5-1.5',
    forecast: 'M7 14a3 3 0 1 1 3-3M5 20V16M10 20V13M15 20V15M20 20V10',
    charger: 'M8 3v5M16 3v5M6 8h12v4a6 6 0 0 1-12 0zM12 18v3',
    drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
    plug: 'M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5',
    plus: 'M12 5v14M5 12h14',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
    chevron: 'M6 9l6 6 6-6',
    check: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12l3 3 5-6',
    warn: 'M12 3 2 20h20zM12 10v5M12 17.5v.5',
  };
  var COLORS = { grid: '#378add', pv: '#e08a1e', house: '#534ab7', bat: '#3b9d4a', price: '#8a6a4a', fc: '#2e9fd6', charger: '#7f77dd', generic: '#6b7280', dehumidifier: '#1d9e75' };

  var api = null;
  var S = STR.en;
  var LANG = 'en';
  var state = {
    cfg: null, shadow: null, meters: null, plan: null, flows: [], batteryCards: null, batteryEvents: [], planDay: 'today', preview: null, jobs: [], draft: { target: 'charger', time: '07:00', targetSoc: '', amount: '', powerKw: '', maxPrice: '', contiguous: true, repeat: 'once' }, devices: [], consumersState: [], events: [], rows: [], open: {},
    msg: '', built: false, renderedNoDevice: null, timer: null, cmpBuilt: false,
  };

  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function icon(name, size) {
    return '<svg viewBox="0 0 24 24" width="' + (size || 18) + '" height="' + (size || 18) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + ICONS[name] + '"/></svg>';
  }
  function num(id, fb) {
    var el = $(id);
    var v = el && el.value !== '' && el.value !== null && el.value !== undefined ? Number(el.value) : NaN;
    return isFinite(v) ? v : fb;
  }
  function val(id, fb) { var el = $(id); return el && el.value !== '' && el.value !== undefined ? el.value : fb; }
  function chk(id) { var el = $(id); return !!(el && el.checked); }
  /** Attribut am Element oder an einem seiner Eltern (Klick auf ein Kind einer Zeile). */
  function up(t, name) {
    while (t && t.getAttribute) {
      var v = t.getAttribute(name);
      if (v !== null && v !== undefined) return v;
      t = t.parentNode;
    }
    return null;
  }
  function time(ms) {
    if (!ms) return '-';
    try { return new Date(ms).toLocaleString(LANG === 'de' ? 'de-CH' : 'en-GB', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return String(ms); }
  }
  function modeLabel(m) { return (S.modeNames && S.modeNames[m]) || m || '-'; }
  function noDevice() { return !!(state.shadow && state.shadow.deviceExists === false); }
  function hasBattery() { return !!(state.cfg && state.cfg.battery && state.cfg.battery.deviceId); }

  // ---------------------------------------------------------------- Geräte und Capabilities

  function findDevice(id) {
    for (var k = 0; k < state.devices.length; k++) if (state.devices[k].id === id) return state.devices[k];
    return null;
  }
  function hasCap(re) { return function (d) { return (d.caps || []).some(function (c) { return re.test(c); }); }; }
  function deviceOptions(current, filter, noneLabel) {
    return '<option value="">' + esc(noneLabel || S.pick) + '</option>' + state.devices.filter(function (d) {
      return d.id === current || !filter || filter(d);
    }).map(function (d) {
      return '<option value="' + esc(d.id) + '"' + (d.id === current ? ' selected' : '') + '>' + esc(d.name) + '</option>';
    }).join('');
  }
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
  function pickCap(devId, re, current, prefer) {
    var d = findDevice(devId);
    if (!d) return current;
    var caps = (d.caps || []).filter(function (c) { return re.test(c); });
    if (prefer && caps.indexOf(prefer) >= 0) return prefer;
    if (caps.indexOf(current) >= 0) return current;
    return caps[0] || current;
  }
  function deviceName(id) { var d = findDevice(id); return d ? d.name : ''; }

  // ---------------------------------------------------------------- Datenquellen

  /** Reihenfolge = Wichtigkeit: Pflicht, Empfohlen, Optional, Automatisch. */
  var SOURCES = [
    { key: 'grid', tag: 'required', label: 'srcGrid', why: 'whyGrid', icon: 'bolt', color: COLORS.grid, filter: hasCap(/^measure_power/), re: /^measure_power/, prefer: 'measure_power' },
    { key: 'pv', tag: 'recommended', label: 'srcPv', why: 'whyPv', icon: 'solar', color: COLORS.pv, filter: hasCap(/^measure_power/), re: /^measure_power/, prefer: 'measure_power' },
    { key: 'house', tag: 'recommended', label: 'srcHouse', why: 'whyHouse', icon: 'home', color: COLORS.house, filter: hasCap(/^measure_power/), re: /^measure_power/, prefer: 'measure_power.load' },
    // Auto-Apps liefern den Ladestand unter verschiedenen Namen: alle Autos und Geräte mit Batteriewert, jeder Wert wählbar
    { key: 'car', tag: 'recommended', label: 'srcCar', why: 'whyCar', icon: 'car', color: '#7f77dd', filter: function (d) { return d.cls === 'car' || hasCap(/^measure_battery/)(d); }, re: /./, prefer: 'measure_battery' },
    { key: 'bat', tag: 'optional', label: 'srcBat', why: 'whyBat', icon: 'battery', color: COLORS.bat, filter: hasCap(/^measure_battery/), re: /^measure_battery/, prefer: 'measure_battery' },
    { key: 'fc', tag: 'optional', label: 'srcFc', why: 'whyFc', icon: 'forecast', color: COLORS.fc },
    { key: 'price', tag: 'auto', label: 'srcPrice', why: 'whyPrice', icon: 'coin', color: COLORS.price },
  ];

  function priceMissing() { return !!(state.shadow && state.shadow.priceDevice === false); }
  function srcTag(s) { return s.key === 'price' && priceMissing() ? 'required' : s.tag; }

  function srcDevice(key) {
    var c = state.cfg;
    if (key === 'grid') return { id: c.devices.meter.id, cap: c.devices.meter.capability };
    if (key === 'pv') return { id: c.devices.inverter.id, cap: c.devices.inverter.capability };
    if (key === 'house') return { id: c.devices.house.id, cap: c.devices.house.capability };
    if (key === 'bat') return { id: c.battery.deviceId, cap: c.battery.socCapability };
    if (key === 'car') return { id: c.car ? c.car.deviceId : '', cap: c.car ? c.car.socCapability : '' };
    return { id: '', cap: '' };
  }
  function setSrc(key, id, cap) {
    var c = state.cfg;
    if (key === 'grid') { c.devices.meter.id = id; c.devices.meter.capability = cap; }
    else if (key === 'pv') { c.devices.inverter.id = id; c.devices.inverter.capability = cap; }
    else if (key === 'house') { c.devices.house.id = id; c.devices.house.capability = cap; }
    else if (key === 'bat') { c.battery.deviceId = id; c.battery.socCapability = cap; }
    else if (key === 'car') { c.car = Object.assign({ capacityKwh: 0 }, c.car, { deviceId: id, socCapability: cap }); }
  }
  function forecastInfo() {
    var pv = (state.shadow && state.shadow.pv) || {};
    var at = pv.source === 'external' ? pv.externalAt : pv.fetchedAt;
    if (!pv.source || !at) return { text: S.fcNone, cls: 'warn' };
    var min = Math.max(0, Math.round((Date.now() - at) / 60000));
    var ago = min < 120 ? min + ' ' + S.min : Math.round(min / 60) + ' ' + S.h;
    var name = (S.fcNames && S.fcNames[pv.source]) || pv.source;
    var daily = pv.source !== 'external' && pv.daily ? ', ' + S.fcDays + ' ' + (pv.daily.todayKwh === null ? '-' : Math.round(pv.daily.todayKwh * 10) / 10) + ' / ' + S.fcDay2 + ' ' + (pv.daily.tomorrowKwh === null ? '-' : Math.round(pv.daily.tomorrowKwh * 10) / 10) + ' kWh' : '';
    var slots = pv.source === 'external' ? ' (' + pv.slots + ' ' + S.fcSlots + ')' : daily;
    return { text: S.fcFrom + ' ' + name + ', ' + S.fcAge + ' ' + ago + slots + (pv.stale ? ' - ' + S.fcStale : ''), cls: pv.stale ? 'warn' : 'ok' };
  }
  function srcSummary(s) {
    if (s.key === 'price') return priceMissing() ? { text: S.priceMissing, cls: 'bad' } : { text: S.autoPrice, cls: 'ok' };
    if (s.key === 'fc') return forecastInfo();
    var d = srcDevice(s.key);
    if (d.id) return { text: deviceName(d.id) || d.id, cls: 'ok' };
    return { text: S.notChosen, cls: s.tag === 'required' ? 'bad' : (s.tag === 'recommended' ? 'warn' : 'muted') };
  }
  function tagHtml(tag) {
    var t = { required: S.tagRequired, recommended: S.tagRecommended, optional: S.tagOptional, auto: S.tagAuto }[tag];
    return '<span class="ems-tag ems-tag-' + tag + '">' + esc(t) + '</span>';
  }

  function field(label, id, value, type, extra) {
    return '<label class="ems-f"><span>' + esc(label) + '</span><input id="' + id + '" type="' + (type || 'number') + '" value="' + esc(value) + '"' + (extra || '') + '></label>';
  }
  function check(label, id, on) {
    return '<label class="ems-c"><span class="swt"><input class="sw" id="' + id + '" type="checkbox"' + (on ? ' checked' : '') + '><i></i></span> <span>' + esc(label) + '</span></label>';
  }

  function batteryControlHtml() {
    var c = state.cfg;
    var bc = c.battery.control || {};
    var cards = state.batteryCards;
    var html = '<div class="ems-box"><b>' + esc(S.batCtl) + '</b><div class="ems-row">' + check(S.batCtlOn, 'ems-bc-on', bc.enabled) + '</div>';
    if (!cards) html += '<p class="ems-why">' + esc(S.batCtlLoading) + '</p>';
    else if (!cards.preset && !(cards.cards || []).length) html += '<p class="ems-why ems-warn">' + esc(S.batCtlNoCards) + '</p>';
    else if (!cards.preset || bc.preset === 'custom') {
      html += cards.preset ? mapSelectHtml(bc, cards) : '<p class="ems-why">' + esc(S.batCtlNone) + '</p>';
      if (bc.enabled) html += batteryValuesHtml(c, bc) + customMapHtml(bc, cards) + '<p class="ems-why ems-warn">' + esc(S.batCtlWarn) + '</p>';
    } else {
      html += '<p class="ems-why ems-ok">' + esc(S.batCtlFound) + '</p>' + mapSelectHtml(bc, cards);
      if (bc.enabled) {
        var title = function (id) { return cardTitle(cards, id); };
        var steps = { charge: ['luna2000_start_force_charge'], hold: ['luna2000_stop_force_charge_discharge', 'luna2000_set_max_discharge_power'], normal: ['luna2000_stop_force_charge_discharge', 'luna2000_set_working_mode', 'luna2000_set_max_discharge_power'] };
        html += batteryValuesHtml(c, bc)
          + '<p class="ems-why"><b>' + esc(S.batCtlSteps) + '</b><br>'
          + esc(S.batModeCharge) + ': ' + steps.charge.map(title).map(esc).join(', ') + '<br>'
          + esc(S.batModeHold) + ': ' + steps.hold.map(title).map(esc).join(', ') + '<br>'
          + esc(S.batModeNormal) + ': ' + steps.normal.map(title).map(esc).join(', ') + ' (' + esc(S.batCarSkip) + ')</p>'
          + '<p class="ems-why ems-warn">' + esc(S.batCtlWarn) + '</p>';
      }
    }
    return html + '</div>';
  }

  function cardTitle(cards, id) {
    var k = ((cards && cards.cards) || []).filter(function (x) { return x.id === id; })[0];
    return k && k.title ? k.title.replace(/\[\[[^\]]*\]\]/g, '…') : id;
  }
  function batteryValuesHtml(c, bc) {
    return '<div class="ems-row">' + field(S.batCtlPower, 'ems-bc-power', c.battery.chargePowerKw, 'number', ' step="0.5" min="0.5" max="10"') + field(S.batCtlTarget, 'ems-bc-target', c.battery.targetSoc, 'number', ' step="1" min="10" max="100"') + '</div>'
      + '<div class="ems-row">' + field(S.batCtlNormal, 'ems-bc-normal', bc.normalDischargeW, 'number', ' step="100" min="0"') + field(S.batCtlRepeat, 'ems-bc-repeat', bc.repeatMin, 'number', ' step="1" min="2" max="60"') + '</div>';
  }
  /** Erkannte Vorlage oder eigene Zuordnung (nur wenn eine Vorlage erkannt wurde). */
  function mapSelectHtml(bc, cards) {
    var cur = bc.preset === 'custom' ? 'custom' : cards.preset;
    return '<div class="ems-row"><label class="ems-f"><span>' + esc(S.batCtlMap) + '</span><select data-ems-bcpreset="1">'
      + '<option value="' + esc(cards.preset) + '"' + (cur !== 'custom' ? ' selected' : '') + '>' + esc(S.batCtlMapAuto) + '</option>'
      + '<option value="custom"' + (cur === 'custom' ? ' selected' : '') + '>' + esc(S.batCtlMapCustom) + '</option></select></label></div>';
  }
  var BAT_MODES = ['charge', 'hold', 'normal'];
  var MAX_BAT_STEPS = 4;
  function customMap(bc) {
    var m = bc.custom || {};
    var out = {};
    BAT_MODES.forEach(function (k) { out[k] = Array.isArray(m[k]) ? m[k] : []; });
    return out;
  }
  /** Je Modus bis 4 Karten der Batterie mit ihren Argumenten. */
  function customMapHtml(bc, cards) {
    var map = customMap(bc);
    var list = (cards.cards || []);
    return BAT_MODES.map(function (mode) {
      var steps = map[mode];
      var rows = steps.map(function (st, i) {
        var p = 'ems-bcc-' + mode + '-' + i;
        var def = list.filter(function (x) { return x.id === st.card; })[0];
        var opts = '<option value="">' + esc(S.batCtlPick) + '</option>' + list.map(function (k) { return '<option value="' + esc(k.id) + '"' + (k.id === st.card ? ' selected' : '') + '>' + esc(cardTitle(cards, k.id)) + '</option>'; }).join('');
        var args = def ? (def.args || []).map(function (a) {
          var v = st.args && st.args[a.name] !== undefined ? st.args[a.name] : '';
          var lbl = '<span>' + esc(a.title || a.name) + '</span>';
          if (a.type === 'dropdown' && a.values) {
            return '<label class="ems-f">' + lbl + '<select id="' + p + '-a-' + esc(a.name) + '">' + a.values.map(function (o) { return '<option value="' + esc(o.id) + '"' + (String(v) === o.id ? ' selected' : '') + '>' + esc(o.title) + '</option>'; }).join('') + '</select></label>';
          }
          if (a.type === 'checkbox') return '<label class="ems-c"><input type="checkbox" id="' + p + '-a-' + esc(a.name) + '"' + (v === true ? ' checked' : '') + '> ' + lbl + '</label>';
          return '<label class="ems-f">' + lbl + '<input type="text" id="' + p + '-a-' + esc(a.name) + '" value="' + esc(v) + '" style="width:130px"></label>';
        }).join('') : '';
        return '<div class="ems-box" style="margin:6px 0"><div class="ems-row"><label class="ems-f ems-wide"><span>' + (i + 1) + '.</span><select id="' + p + '-card" data-ems-bccard="1">' + opts + '</select></label>'
          + '<button class="btn" data-ems-bcc="del:' + mode + ':' + i + '">' + esc(S.batCtlDel) + '</button></div>'
          + (args ? '<div class="ems-row">' + args + '</div>' : '')
          + (mode === 'normal' ? '<label class="ems-c"><span class="swt"><input class="sw" type="checkbox" id="' + p + '-skip"' + (st.skipWhenCarCharging ? ' checked' : '') + '><i></i></span> <span>' + esc(S.batCarSkip) + '</span></label>' : '')
          + '</div>';
      }).join('');
      var name = mode === 'charge' ? S.batModeCharge : (mode === 'hold' ? S.batModeHold : S.batModeNormal);
      return '<p class="lbl" style="margin-top:10px">' + esc(name.toUpperCase()) + '</p>' + (rows || '<p class="ems-why">' + esc(S.batCtlEmpty) + '</p>')
        + (steps.length < MAX_BAT_STEPS ? '<button class="btn" data-ems-bcc="add:' + mode + '">' + esc(S.batCtlAddStep) + '</button>' : '');
    }).join('') + '<p class="ems-why">' + esc(S.batCtlPh) + '</p>';
  }
  /** Eingaben der eigenen Zuordnung übernehmen (Zahlenfelder als Zahl, Platzhalter als Text). */
  function syncCustomMap(bc) {
    if (!$('ems-bcc-marker') && !state.batteryCards) return;
    var cards = (state.batteryCards && state.batteryCards.cards) || [];
    var map = customMap(bc);
    BAT_MODES.forEach(function (mode) {
      map[mode] = map[mode].map(function (st, i) {
        var p = 'ems-bcc-' + mode + '-' + i;
        if (!$(p + '-card')) return st;
        var card = String($(p + '-card').value || '');
        var def = cards.filter(function (x) { return x.id === card; })[0];
        var args = {};
        if (card === st.card && def) {
          (def.args || []).forEach(function (a) {
            var id = p + '-a-' + a.name;
            if (!$(id)) return;
            if (a.type === 'checkbox') { args[a.name] = chk(id); return; }
            var v = String(val(id, '')).trim();
            if (v === '') return;
            if (a.type === 'number' && !/^\{\w+\}$/.test(v) && isFinite(Number(v))) args[a.name] = Number(v);
            else args[a.name] = v;
          });
        }
        return { card: card, args: args, skipWhenCarCharging: mode === 'normal' && chk(p + '-skip') };
      });
    });
    bc.custom = map;
  }

  function loadBatteryCards() {
    if (state.batteryCardsLoading || !state.cfg || !state.cfg.battery.deviceId) return;
    state.batteryCardsLoading = true;
    api('GET', '/ems/battery-cards').then(function (r) {
      state.batteryCards = r || { preset: null, cards: [] };
      state.batteryCardsLoading = false;
      var bcl = state.cfg.battery.control;
      // erkannte Vorlage übernehmen, ausser es ist bewusst eine eigene Zuordnung gewählt; ohne Vorlage: eigene Zuordnung
      if (bcl && state.batteryCards.preset && bcl.preset !== 'custom') bcl.preset = state.batteryCards.preset;
      else if (bcl && !state.batteryCards.preset && (state.batteryCards.cards || []).length) bcl.preset = 'custom';
      renderSetup();
    }).catch(function () { state.batteryCards = { preset: null, cards: [] }; state.batteryCardsLoading = false; renderSetup(); });
  }

  var CAR_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  function carSchedule() {
    var c = state.cfg.car || {};
    var sc = c.schedule || {};
    var days = {};
    CAR_DAYS.forEach(function (d) { var e = (sc.days && sc.days[d]) || {}; days[d] = { on: e.on === true, time: e.time || '06:00', soc: e.soc || 80 }; });
    return { days: days, holiday: sc.holiday === true, holidayUntil: sc.holidayUntil || '', gridCharge: sc.gridCharge !== false, override: sc.override || null };
  }
  /** Wochenvorlage mit Entwurf: Änderungen bleiben erhalten, bis gespeichert oder verworfen wird (auch beim Neuzeichnen). */
  function carTemplate() { return state.carCal || carSchedule(); }
  function carCalendarHtml() {
    var sc = carTemplate();
    var rows = CAR_DAYS.map(function (d) {
      var e = sc.days[d];
      return '<tr><td><span class="swt"><input class="sw" type="checkbox" data-ems-carcal="' + d + ':on"' + (e.on ? ' checked' : '') + '><i></i></span></td><td>' + esc(S.carDays[d]) + '</td>'
        + '<td><input type="time" data-ems-carcal="' + d + ':time" value="' + esc(e.time) + '"></td><td><input type="number" min="10" max="100" step="5" data-ems-carcal="' + d + ':soc" value="' + esc(e.soc) + '" style="width:64px"></td></tr>';
    }).join('');
    var dirty = !!state.carCal;
    return '<details class="ems-adv car-tpl"' + (state.carCalOpen || dirty ? ' open' : '') + '><summary data-ems-carcalopen="1">' + esc(S.carCal) + '</summary>'
      + '<p class="ems-why">' + esc(S.carCalHint) + '</p>'
      + '<table class="ems-t car-cal"><thead><tr><th></th><th></th><th>' + esc(S.carTime) + '</th><th>' + esc(S.carSoc) + '</th></tr></thead><tbody>' + rows + '</tbody></table>'
      + '<label class="ems-c"><span class="swt"><input class="sw" type="checkbox" data-ems-carcal="holiday"' + (sc.holiday ? ' checked' : '') + '><i></i></span> <span>' + esc(S.carHoliday) + '</span></label>'
      + (sc.holiday ? '<label class="ems-f" style="margin-left:44px"><span>' + esc(S.carHolidayUntil) + '</span><input type="date" data-ems-carcal="holidayUntil" value="' + esc(sc.holidayUntil || '') + '"></label>' : '')
      + '<label class="ems-c"><span class="swt"><input class="sw" type="checkbox" data-ems-carcal="grid"' + (sc.gridCharge ? ' checked' : '') + '><i></i></span> <span>' + esc(S.carGrid) + '</span></label><p class="ems-why">' + esc(S.carGridHint) + '</p>'
      + '<p style="margin:8px 0 0"><button class="btn primary" data-ems-car="savecal">' + esc(S.carCalSave) + '</button>' + (dirty ? ' <button class="btn" data-ems-car="resetcal">' + esc(S.carCalReset) + '</button>' : '') + '</p></details>';
  }

  function srcBody(s) {
    var why = '<p class="ems-why">' + esc(S[s.why]) + '</p>';
    if (s.key === 'price') return why;
    if (s.key === 'fc') {
      var info = forecastInfo();
      var pvc = state.cfg.pv || {};
      var factor = pvc.factor === undefined ? 1 : pvc.factor;
      var srcMode = pvc.source || 'auto';
      var dev = pvc.device || { id: '', today: '', tomorrow: '' };
      var so = function (v, label) { return '<option value="' + v + '"' + (srcMode === v ? ' selected' : '') + '>' + esc(label) + '</option>'; };
      var sourceRow = '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.fcSource) + '</span><select data-ems-pv="source">'
        + so('auto', S.fcSrcAuto) + so('homey', S.fcSrcHomey) + so('device', S.fcSrcDevice) + so('external', S.fcSrcExternal) + '</select></label></div>';
      var deviceRow = srcMode === 'device'
        ? '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.device) + '</span><select data-ems-pv="device">' + deviceOptions(dev.id, null, S.pick) + '</select></label>'
          + '<label class="ems-f ems-wide"><span>' + esc(S.fcToday) + '</span><select data-ems-pv="today">' + capOptions(dev.id, /./, dev.today) + '</select></label>'
          + '<label class="ems-f ems-wide"><span>' + esc(S.fcTomorrow) + '</span><select data-ems-pv="tomorrow">' + capOptions(dev.id, /./, dev.tomorrow) + '</select></label></div>'
        : '';
      return why + sourceRow + deviceRow + '<div class="ems-row">' + field(S.factor, 'ems-pv-factor', factor, 'number', ' step="0.01" min="0.1" max="3"') + '</div><p class="ems-why">' + esc(S.factorHint) + '</p>'
        + '<p class="ems-why">' + esc(S.fcCurveHint) + '</p><p class="ems-why ems-' + info.cls + '">' + esc(info.text) + '</p>';
    }
    var d = srcDevice(s.key);
    if (s.key === 'bat' && d.id) why += batteryControlHtml();
    var carExtra = s.key === 'car' && d.id ? '<div class="ems-row">' + field(S.carCap, 'ems-car-cap', state.cfg.car ? state.cfg.car.capacityKwh : 0, 'number', ' step="1" min="0" max="300"') + '</div><p class="ems-why">' + esc(S.carSetupHint) + '</p>' : '';
    return why + carExtra + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.device) + '</span><select id="src-' + s.key + '-dev" data-ems-src="' + s.key + '">' + deviceOptions(d.id, s.filter, s.tag === 'required' ? S.pick : S.none) + '</select></label>'
      + '<label class="ems-f ems-wide"><span>' + esc(S.value) + '</span><select id="src-' + s.key + '-cap">' + capOptions(d.id, s.re, d.cap) + '</select></label></div>';
  }

  // ---------------------------------------------------------------- Zeilen (Verbraucher)

  function newConsumerRow() {
    return {
      kind: 'consumer', name: '', control: true, deviceId: '', type: 'generic', mode: hasBattery() ? 'full' : 'surplus', fullSoc: 98, socOn: 80, hysteresis: 5,
      minSurplusW: 300, startSustainS: 60, stopGraceS: 120, minRunMin: 30, minOffMin: 10, protectSoc: 20, useForecastGate: true, live: false,
      humidity: { enabled: false, sensorId: '', capability: 'measure_humidity', onAbove: 65, offBelow: 61, runMin: 60 },
      meterDeviceId: '', meterCap: '',
      controlKind: 'device', flowOn: { id: '', advanced: false, name: '' }, flowOff: { id: '', advanced: false, name: '' }, assumedW: 0,
    };
  }

  /** Eine Liste aus Wallbox, EMS-Verbrauchern und Kosten-Zählern (nach Name verbunden). */
  function buildRows() {
    var c = state.cfg;
    var meters = (state.meters && state.meters.config && state.meters.config.consumers) || [];
    var used = {};
    var findMeter = function (name) {
      for (var i = 0; i < meters.length; i++) if (meters[i].name === name) { used[name] = true; return meters[i]; }
      return null;
    };
    var rows = [];
    var cm = findMeter(c.charger.costName);
    rows.push({
      kind: 'charger', name: c.charger.costName || 'E-Auto', control: true, deviceId: c.charger.id, maxAmps: c.charger.maxAmps, stepHoldS: c.charger.stepHoldS, live: c.charger.live === true, autoOff: c.charger.chargeNowAutoOff !== false,
      meterDeviceId: cm ? cm.deviceId : '', meterCap: cm ? cm.capability : '',
    });
    (c.consumers || []).forEach(function (x) {
      var m = findMeter(x.name);
      var r = Object.assign(newConsumerRow(), x, { kind: 'consumer', control: true, deviceId: x.id, meterDeviceId: m ? m.deviceId : '', meterCap: m ? m.capability : '' });
      r.humidity = Object.assign({}, newConsumerRow().humidity, x.humidity || {});
      r.flowOn = Object.assign({ id: '', advanced: false, name: '' }, x.flowOn || {});
      r.flowOff = Object.assign({ id: '', advanced: false, name: '' }, x.flowOff || {});
      rows.push(r);
    });
    meters.forEach(function (m) {
      if (used[m.name]) return;
      var r = newConsumerRow();
      r.control = false; r.name = m.name; r.meterDeviceId = m.deviceId; r.meterCap = m.capability;
      rows.push(r);
    });
    state.rows = rows;
  }

  function rowSub(r) {
    if (r.kind === 'charger') return r.deviceId ? (r.live ? S.modeLiveTag : S.modeTest) : S.notChosen;
    if (!r.control || !r.deviceId) return S.noCtrl;
    if (r.controlKind === 'flow' && !(r.flowOn && r.flowOn.id)) return S.notChosen;
    var m = { full: S.modeFull, soc: S.modeSoc, surplus: S.modeSurplus }[r.mode] || r.mode;
    return m + ' - ' + (r.live ? S.modeLiveTag : S.modeTest);
  }
  function rowIcon(r) { return r.kind === 'charger' ? 'charger' : (r.type === 'dehumidifier' ? 'drop' : 'plug'); }
  function rowColor(r) { return r.kind === 'charger' ? COLORS.charger : (r.type === 'dehumidifier' ? COLORS.dehumidifier : COLORS.generic); }

  function flowOptions(current) {
    var cur = current || { id: '' };
    var opts = '<option value="">' + esc(S.flowNone) + '</option>';
    if (cur.id && !state.flows.some(function (f) { return f.id === cur.id; })) opts += '<option value="' + esc(cur.id) + '" selected>' + esc(cur.name || cur.id) + '</option>';
    return opts + state.flows.map(function (f) {
      return '<option value="' + esc(f.id) + '"' + (f.id === cur.id ? ' selected' : '') + '>' + esc(f.name + (f.advanced ? ' ' + S.flowAdv : '')) + '</option>';
    }).join('');
  }
  function pickFlow(id, fallback) {
    var f = state.flows.filter(function (x) { return x.id === id; })[0];
    if (f) return { id: f.id, advanced: f.advanced === true, name: f.name };
    return fallback && fallback.id === id ? fallback : { id: '', advanced: false, name: '' };
  }

  function rowBody(r, i) {
    var p = 'row' + i + '-';
    var meterRow = '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.meterDevice) + '</span><select id="' + p + 'mdev" data-ems-mdev="' + i + '">' + deviceOptions(r.meterDeviceId, hasCap(/^meter_power/), S.none) + '</select></label>'
      + '<label class="ems-f ems-wide"><span>' + esc(S.value) + '</span><select id="' + p + 'mcap">' + capOptions(r.meterDeviceId, /^meter_power/, r.meterCap) + '</select></label></div>';
    var last = state.meters && state.meters.status && state.meters.status['consumer:' + r.name];
    var lastTxt = last ? '<p class="ems-why ' + (last.error ? 'ems-bad' : 'ems-ok') + '">' + esc(last.error ? S.error + ': ' + last.error : S.costLast + ' ' + Number(last.kwh).toFixed(2) + ' kWh') + '</p>' : '';
    if (r.kind === 'charger') {
      return '<p class="ems-why">' + esc(S.otherEms) + '</p>'
        + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.device) + '</span><select id="' + p + 'dev">' + deviceOptions(r.deviceId, hasCap(/^(evcharger_charging|target_power)/), S.pick) + '</select></label>'
        + field(S.name, p + 'name', r.name, 'text') + '</div>'
        + meterRow + lastTxt
        + '<details class="ems-adv"' + (state.open[p + 'adv'] ? ' open' : '') + '><summary data-ems-adv="' + p + 'adv">' + esc(S.advanced) + '</summary><div class="ems-row">'
        + field(S.maxAmps, p + 'maxAmps', r.maxAmps) + field(S.stepHold, p + 'stepHold', r.stepHoldS) + '</div>'
        + '<label class="ems-c"><span class="swt"><input class="sw" type="checkbox" id="' + p + 'autoOff"' + (r.autoOff !== false ? ' checked' : '') + '><i></i></span> <span>' + esc(S.chargeNowAutoOff) + '</span></label></details>';
    }
    var modes = [['surplus', S.modeSurplus]].concat(hasBattery() ? [['full', S.modeFull], ['soc', S.modeSoc]] : []);
    if (!hasBattery() && (r.mode === 'full' || r.mode === 'soc')) modes.push([r.mode, r.mode === 'full' ? S.modeFull : S.modeSoc]);
    var modeOpts = modes.map(function (m) { return '<option value="' + m[0] + '"' + (m[0] === r.mode ? ' selected' : '') + '>' + esc(m[1]) + '</option>'; }).join('');
    var typeOpts = [['generic', S.typeGeneric], ['dehumidifier', S.typeDehum]].map(function (t) {
      return '<option value="' + t[0] + '"' + (t[0] === r.type ? ' selected' : '') + '>' + esc(t[1]) + '</option>';
    }).join('');
    var params = '';
    if (r.mode === 'full') params += field(S.fullSoc, p + 'fullSoc', r.fullSoc) + field(S.hysteresis, p + 'hysteresis', r.hysteresis);
    if (r.mode === 'soc') params += field(S.socOn, p + 'socOn', r.socOn) + field(S.hysteresis, p + 'hysteresis', r.hysteresis);
    if (r.mode === 'surplus') params += field(S.minSurplus, p + 'minSurplusW', r.minSurplusW) + field(S.startSustain, p + 'startSustainS', r.startSustainS) + field(S.stopGrace, p + 'stopGraceS', r.stopGraceS);
    var viaFlow = r.controlKind === 'flow';
    var kindRow = '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.ctrlKind) + '</span><select id="' + p + 'kind" data-ems-mode="' + i + '">'
      + '<option value="device"' + (viaFlow ? '' : ' selected') + '>' + esc(S.ctrlViaDevice) + '</option><option value="flow"' + (viaFlow ? ' selected' : '') + '>' + esc(S.ctrlViaFlow) + '</option></select></label></div>';
    var ctrl = kindRow + (viaFlow
      ? '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.flowOnLbl) + '</span><select id="' + p + 'flowOn" data-ems-mode="' + i + '">' + flowOptions(r.flowOn) + '</select></label>'
        + '<label class="ems-f ems-wide"><span>' + esc(S.flowOffLbl) + '</span><select id="' + p + 'flowOff" data-ems-mode="' + i + '">' + flowOptions(r.flowOff) + '</select></label></div>'
        + (state.flows.length ? '' : '<p class="warn">' + esc(S.flowsNone) + '</p>') + '<p class="ems-why">' + esc(S.flowHint) + '</p>'
        + '<div class="ems-row">' + field(S.assumedW, p + 'assumedW', r.assumedW) + '</div>'
      : '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.ctrlDevice) + '</span><select id="' + p + 'dev" data-ems-mode="' + i + '">' + deviceOptions(r.deviceId, hasCap(/^onoff$/), S.none) + '</select></label></div>');
    var ctrlBody = '';
    if (viaFlow ? !!(r.flowOn && r.flowOn.id) : !!r.deviceId) {
      var h = r.humidity;
      var hum = r.type === 'dehumidifier'
        ? '<div class="ems-box"><b>' + esc(S.humTitle) + '</b><div class="ems-row">' + check(S.humEnable, p + 'humEnable', h.enabled) + '</div>'
          + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.humSensor) + '</span><select id="' + p + 'humSensor">' + deviceOptions(h.sensorId, hasCap(/^measure_humidity$/), S.none) + '</select></label>'
          + field(S.humOn, p + 'humOn', h.onAbove) + field(S.humOff, p + 'humOff', h.offBelow) + field(S.humRun, p + 'humRun', h.runMin) + '</div><p class="ems-why">' + esc(S.humHint) + '</p></div>'
        : '';
      ctrlBody = '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.mode) + '</span><select id="' + p + 'mode" data-ems-mode="' + i + '">' + modeOpts + '</select></label></div>'
        + (hasBattery() ? '' : '<p class="ems-why">' + esc(S.noBatMode) + '</p>')
        + '<div class="ems-row">' + params + '</div>'
        + '<details class="ems-adv"' + (state.open[p + 'adv'] ? ' open' : '') + '><summary data-ems-adv="' + p + 'adv">' + esc(S.advanced) + '</summary><div class="ems-row">'
        + field(S.minRun, p + 'minRunMin', r.minRunMin) + field(S.minOff, p + 'minOffMin', r.minOffMin) + field(S.protect, p + 'protectSoc', r.protectSoc) + '</div>'
        + '<div class="ems-row">' + check(S.useGate, p + 'useGate', r.useForecastGate) + '</div>' + hum + '</details>';
    }
    return '<div class="ems-row"><label class="ems-f"><span>' + esc(S.type) + '</span><select id="' + p + 'type" data-ems-mode="' + i + '">' + typeOpts + '</select></label>'
      + field(S.name, p + 'name', r.name, 'text') + '</div>'
      + ctrl + ctrlBody + meterRow + lastTxt
      + '<div class="ems-row"><button class="btn" data-ems-remove="' + i + '">' + esc(S.remove) + '</button></div>';
  }

  // ---------------------------------------------------------------- Setup-Ansicht

  function missingRequired() {
    var miss = [];
    SOURCES.forEach(function (s) {
      if (s.key === 'price') { if (priceMissing()) miss.push(S[s.label]); return; }
      if (s.tag === 'required' && !srcDevice(s.key).id) miss.push(S[s.label]);
    });
    return miss;
  }

  function setupHeadHtml() {
    var miss = missingRequired();
    var ok = miss.length === 0;
    var line = ok ? S.setupReady : S.setupMissing + ' ' + miss.join(', ');
    var sub = !hasBattery() && ok ? '<p class="ems-why">' + esc(S.setupNoBat) + '</p>' : '';
    return '<div class="ems-head ' + (ok ? 'ems-head-ok' : 'ems-head-warn') + '"><span class="ems-ic ' + (ok ? 'ems-ic-ok' : 'ems-ic-warn') + '">' + icon(ok ? 'check' : 'warn', 20) + '</span><div class="ems-head-t"><b>' + esc(line) + '</b>' + sub + '</div></div>'
      + '<p class="ems-suggest"><button class="btn" data-ems-suggest="1">' + esc(S.suggest) + '</button> <span class="sub" id="ems-suggest-msg">' + esc(state.suggestMsg || '') + '</span></p>';
  }

  var FUSE_DEFAULT = { enabled: false, live: false, amps: 40, reservePct: 90, meterId: '', caps: ['measure_current.phase1', 'measure_current.phase2', 'measure_current.phase3'], throttle: true, holdS: 10, restoreMin: 5, shed: [{ kind: 'charger' }] };
  function fuseCfg() {
    if (!state.cfg.fuse) state.cfg.fuse = JSON.parse(JSON.stringify(FUSE_DEFAULT));
    return state.cfg.fuse;
  }
  function fuseLimit(f) { return Math.round(f.amps * f.reservePct) / 100; }
  function shedKey(e) { return e.kind === 'device' ? 'd:' + e.id : (e.kind === 'flow' ? 'f:' + e.flow.id : 'charger'); }
  function shedName(e) {
    if (e.kind === 'charger') return S.wallbox;
    if (e.kind === 'device') { var d = findDevice(e.id); return d ? d.name : (e.name || e.id); }
    return (e.name || (e.flow && e.flow.name) || S.fuseFlow) + ' (' + S.fuseFlow + ')';
  }
  function fuseSummary() {
    var f = fuseCfg();
    if (!f.enabled) return { text: S.fuseOff, cls: 'muted' };
    return { text: S.fuseLimitLbl + ' ' + fuseLimit(f) + ' A - ' + (f.shed.length ? f.shed.map(shedName).join(', ') : S.fuseShedNone), cls: 'ok' };
  }
  function fuseBody() {
    var f = fuseCfg();
    var html = '<p class="ems-why">' + esc(S.fuseWhy) + '</p><div class="ems-row">' + check(S.fuseOn, 'ems-fuse-on', f.enabled) + '</div>';
    if (!f.enabled) return html;
    var meterId = f.meterId || state.cfg.devices.meter.id;
    var used = {};
    f.shed.forEach(function (e) { used[shedKey(e)] = true; });
    var rows = f.shed.map(function (e, i) {
      return '<div class="ems-row" style="align-items:center;margin:4px 0"><span style="flex:1;font-size:14px">' + (i + 1) + '. ' + esc(shedName(e)) + '</span>'
        + (i > 0 ? '<button class="btn" data-ems-fuseup="' + i + '">' + esc(S.fuseUp) + '</button>' : '')
        + '<button class="btn" data-ems-fusedel="' + i + '">' + esc(S.fuseDel) + '</button></div>';
    }).join('') || '<p class="ems-why">' + esc(S.fuseShedNone) + '</p>';
    var addOpts = '<option value="">' + esc(S.fuseAddPick) + '</option>'
      + (!used.charger && state.cfg.charger.id ? '<option value="charger">' + esc(S.wallbox) + '</option>' : '')
      + state.devices.filter(function (d) { return !used['d:' + d.id] && d.id !== state.cfg.charger.id && (d.caps || []).some(function (c) { return c === 'onoff' || c === 'thermostat_mode'; }); })
        .map(function (d) { return '<option value="d:' + esc(d.id) + '">' + esc(d.name) + '</option>'; }).join('')
      + (state.flows || []).filter(function (x) { return !used['f:' + x.id]; })
        .map(function (x) { return '<option value="f:' + esc(x.id) + '">' + esc(S.fuseFlow + ': ' + x.name) + '</option>'; }).join('');
    var cur = state.shadow && state.shadow.fuse;
    return html
      + '<div class="ems-row">' + field(S.fuseAmps, 'ems-fuse-amps', f.amps, 'number', ' step="1" min="6" max="250"') + field(S.fuseReserve, 'ems-fuse-pct', f.reservePct, 'number', ' step="1" min="50" max="100"') + '</div>'
      + '<p class="ems-why"><b>' + esc(S.fuseLimitLbl + ' ' + fuseLimit(f) + ' A ' + S.fusePerPhase) + '</b></p>'
      + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.fuseMeter) + '</span><select id="ems-fuse-dev" data-ems-fusedev="1">' + deviceOptions(f.meterId, hasCap(/^measure_current/), S.fuseMeterGrid) + '</select></label></div>'
      + '<div class="ems-row">' + [0, 1, 2].map(function (k) {
        return '<label class="ems-f"><span>' + esc(S.fusePhase + ' ' + (k + 1)) + '</span><select id="ems-fuse-cap' + k + '">' + capOptions(meterId, /^measure_current/, f.caps[k]) + '</select></label>';
      }).join('') + '</div>'
      + (cur && cur.error ? '<p class="ems-why ems-warn">' + esc(S.fuseNoPhases) + '</p>' : '')
      + check(S.fuseThrottle, 'ems-fuse-throttle', f.throttle) + '<p class="ems-why">' + esc(S.fuseThrottleHint) + '</p>'
      + '<div class="ems-row">' + field(S.fuseHold, 'ems-fuse-hold', f.holdS, 'number', ' step="1" min="0" max="120"') + field(S.fuseRestore, 'ems-fuse-restore', f.restoreMin, 'number', ' step="1" min="1" max="60"') + '</div>'
      + '<p class="lbl">' + esc(S.fuseShedTitle) + '</p>' + rows
      + '<div class="ems-row"><label class="ems-f ems-wide"><span>&nbsp;</span><select id="ems-fuse-addsel">' + addOpts + '</select></label><button class="btn" data-ems-fuseadd="1">' + esc(S.fuseAdd) + '</button></div>'
      + '<p class="ems-why">' + esc(S.fuseNoRestore) + '</p>'
      + '<div class="ems-row">' + check(S.fuseLive, 'ems-fuse-live', f.live) + '</div><p class="ems-why ems-warn">' + esc(S.fuseLiveHint) + '</p>';
  }
  function syncFuse() {
    if (!state.cfg || !state.open.fuse || !$('ems-fuse-on')) return;
    var f = fuseCfg();
    f.enabled = chk('ems-fuse-on');
    if (!$('ems-fuse-amps') || !f.enabled) return;
    f.amps = num('ems-fuse-amps', f.amps);
    f.reservePct = num('ems-fuse-pct', f.reservePct);
    f.meterId = String($('ems-fuse-dev').value || '');
    f.caps = [0, 1, 2].map(function (k) { return val('ems-fuse-cap' + k, f.caps[k]); });
    f.throttle = chk('ems-fuse-throttle');
    f.holdS = num('ems-fuse-hold', f.holdS);
    f.restoreMin = num('ems-fuse-restore', f.restoreMin);
    f.live = chk('ems-fuse-live');
  }

  function listRow(key, ic, color, title, tagHtmlStr, summary, body) {
    var open = !!state.open[key];
    return '<div class="ems-item' + (open ? ' open' : '') + '"><div class="ems-item-h" data-ems-open="' + esc(key) + '">'
      + '<span class="ems-ic" style="background:' + color + '">' + icon(ic, 17) + '</span>'
      + '<span class="ems-item-t"><span class="ems-item-n">' + esc(title) + ' ' + (tagHtmlStr || '') + '</span><span class="ems-item-s ems-' + summary.cls + '">' + esc(summary.text) + '</span></span>'
      + '<span class="ems-chev">' + icon('chevron', 16) + '</span></div>'
      + (open ? '<div class="ems-item-b">' + body + '</div>' : '') + '</div>';
  }

  function calcDeviceCount() {
    var c = state.cfg;
    var ids = {};
    var add = function (id) { if (id) ids[id] = true; };
    add(c.devices.meter.id); add(c.devices.house.id); add(c.devices.inverter.id); add(c.battery.deviceId); add(c.car && c.car.deviceId);
    state.rows.forEach(function (r) {
      if (r.kind === 'charger') add(r.deviceId);
      else if (r.control !== false && r.deviceId) { if (r.controlKind !== 'flow') add(r.deviceId); if (r.humidity && r.humidity.enabled) add(r.humidity.sensorId); }
    });
    return Object.keys(ids).length;
  }

  function calcSummary() {
    var s = Number(state.cfg.refreshS) || 0;
    return s ? S.calcEvery + ' ' + s + ' ' + S.calcSecs : S.calcAuto;
  }

  function calcBody() {
    var s = Number(state.cfg.refreshS) || 0;
    var d = calcDeviceCount();
    var opt = function (v, label) { return '<option value="' + v + '"' + (s === v ? ' selected' : '') + '>' + esc(label) + '</option>'; };
    var impact = s ? d + ' ' + S.calcDevices + ', ' + Math.round(d * 3600 / s) + ' ' + S.calcCalls : S.calcAutoImpact + ' (' + d + ' ' + S.calcDevices + ': ' + Math.round(d * 3600 / 300) + ' - ' + Math.round(d * 3600 / 15) + ' ' + S.calcCalls + ')';
    return '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.calcLabel) + '</span><select data-ems-calc="refreshS">'
      + opt(0, S.calcOptAuto) + opt(15, S.calcOpt15) + opt(30, S.calcOpt30) + opt(60, S.calcOpt60) + opt(300, S.calcOpt300) + '</select></label></div>'
      + '<p class="ems-why"><b>' + esc(impact) + '</b></p><p class="ems-why">' + esc(S.calcImpact) + '</p>'
      + '<div class="ems-row"><label class="ems-f"><span>' + esc(S.calcTick) + '</span><input type="number" min="1" max="15" step="1" data-ems-calc="tickMinutes" value="' + esc(state.cfg.tickMinutes || 5) + '"></label></div>'
      + '<p class="ems-why">' + esc(S.calcTickHint) + '</p>';
  }

  function renderSetup() {
    var host = $('ems-view-devices');
    if (!host) return;
    var head = $('h2-emsdev');
    if (noDevice()) {
      host.innerHTML = '<p class="warn">' + esc(S.noDevice) + '</p>';
      if (head) head.innerHTML = '<span class="st-open"></span>' + esc(S.devicesSec);
      return;
    }
    if (!state.cfg) return;
    var miss = missingRequired();
    if (head) head.innerHTML = (miss.length ? '<span class="st-open"></span>' : '<span class="st-check">✓</span>') + esc(S.devicesSec);
    var src = SOURCES.map(function (s) {
      return listRow('src-' + s.key, s.icon, s.color, S[s.label], tagHtml(srcTag(s)), srcSummary(s), srcBody(s));
    }).join('');
    var rows = state.rows.map(function (r, i) {
      var name = r.kind === 'charger' ? S.wallbox + (r.name ? ' (' + r.name + ')' : '') : (r.name || S.consumers.charAt(0) + S.consumers.slice(1).toLowerCase());
      return listRow('row' + i, rowIcon(r), rowColor(r), name, '', { text: rowSub(r), cls: r.deviceId && r.control !== false ? 'ok' : 'muted' }, rowBody(r, i));
    }).join('');
    host.innerHTML = styleHtml()
      + setupHeadHtml()
      + '<p class="lbl">' + esc(S.sources) + '</p><div class="ems-list">' + src + '</div>'
      + '<p class="lbl">' + esc(S.consumers) + '</p><div class="ems-list">' + rows
      + '<div class="ems-item ems-add" data-ems-add="1"><span class="ems-ic" style="background:var(--st-seg-bg);color:var(--st-text)">' + icon('plus', 17) + '</span><span class="ems-item-n">' + esc(S.addConsumer) + '</span></div></div>'
      + '<p class="lbl">' + esc(S.fuseTitle) + '</p><div class="ems-list">' + listRow('fuse', 'bolt', '#c0392b', S.fuseRow, '', fuseSummary(), fuseBody()) + '</div>'
      + '<p class="lbl">' + esc(S.calcTitle) + '</p><div class="ems-list">' + listRow('calc', 'clock', '#6b7280', S.calcRow, '', { text: calcSummary(), cls: 'muted' }, calcBody()) + '</div>'
      + '<p><button class="ems-save" data-ems-save="1">' + esc(S.save) + '</button></p><p class="sub" id="ems-msg">' + esc(state.msg) + '</p>';
  }

  function styleHtml() {
    return '<style>'
      + '.ems-head{display:flex;gap:10px;align-items:flex-start;margin:0 0 6px;padding:10px 12px;border-radius:12px}.ems-head-t{flex:1;font-size:14px}'
      + '.ems-head-ok{background:var(--st-lv-cheap-bg);color:var(--st-lv-cheap-fg)}.ems-head-ok .ems-why{color:var(--st-lv-cheap-fg)}.ems-head-warn{background:#fdf0d8;color:#7a4b00}'
      + '.ems-ic{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;flex:none}.ems-ic-ok{background:var(--st-switch-on)}.ems-ic-warn{background:#d98a1a}'
      + '.lbl{font-size:11px;color:var(--st-muted);letter-spacing:.06em;margin:14px 2px 6px}'
      + '.ems-list{border:1px solid var(--st-border);border-radius:12px;overflow:hidden;background:var(--st-bg)}'
      + '.ems-item{border-top:1px solid var(--st-border)}.ems-item:first-child{border-top:none}'
      + '.ems-item-h,.ems-add{display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer}'
      + '.ems-item-t{flex:1;display:flex;flex-direction:column;min-width:0}.ems-item-n{font-size:14px;color:var(--st-text)}.ems-item-s{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
      + '.ems-ok{color:var(--st-cheap)}.ems-warn{color:#b9770e}.ems-bad{color:var(--st-expensive)}.ems-muted{color:var(--st-muted)}'
      + '.ems-chev{color:var(--st-muted);display:flex}.ems-item.open .ems-chev{transform:rotate(180deg)}'
      + '.ems-item-b{padding:4px 12px 12px;background:var(--st-card-bg)}'
      + '.ems-tag{font-size:10px;padding:1px 7px;border-radius:999px;margin-left:4px;vertical-align:1px}'
      + '.ems-tag-required{background:var(--st-lv-exp-bg);color:var(--st-lv-exp-fg)}.ems-tag-recommended{background:var(--st-lv-normal-bg);color:var(--st-lv-normal-fg)}.ems-tag-optional,.ems-tag-auto{background:var(--st-chip-bg);color:var(--st-muted)}'
      + '.ems-why{font-size:12px;color:var(--st-muted);margin:6px 0}'
      + '.ems-row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin:8px 0}.ems-f{display:flex;flex-direction:column;font-size:12px;color:var(--st-muted);gap:2px}'
      + '.ems-f input,.ems-f select{font:inherit;padding:5px 7px;border:1px solid var(--st-border);border-radius:6px;background:var(--st-bg);color:var(--st-text);min-width:90px}.ems-wide{flex:1 1 200px}.ems-wide select{width:100%}'
      + '.ems-c{display:flex;align-items:center;gap:6px;font-size:13px}.ems-box{border:1px solid var(--st-border);border-radius:8px;padding:8px 10px;margin:8px 0}'
      + '.ems-adv{margin:8px 0}.ems-adv summary{cursor:pointer;font-size:12px;color:var(--st-muted)}'
      + '.ems-save{display:block;width:100%;padding:11px;border:0;border-radius:8px;background:var(--st-accent);color:#fff;font:inherit;font-weight:600;cursor:pointer;margin-top:14px}'
      + '.ems-cards{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.ems-card{flex:1 1 140px;border:1px solid var(--st-border);border-radius:8px;padding:8px 10px;background:var(--st-card-bg)}'
      + '.ems-k{font-size:12px;color:var(--st-muted)}.ems-v{font-size:18px;font-weight:600}.ems-s{font-size:12px;color:var(--st-muted)}'
      + '.ems-dot{width:10px;height:10px;border-radius:50%;flex:none}.ems-st{display:flex;align-items:center;gap:10px}.ems-st b{flex:1;font-size:15px}'
      + '.ems-chip{font-size:12px;padding:2px 10px;border-radius:999px;background:var(--st-lv-cheap-bg);color:var(--st-lv-cheap-fg)}'
      + '.ems-vals{display:flex;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--st-muted);margin-top:8px}'
      + '.ems-t{border-collapse:collapse;width:100%;font-size:12px;margin:6px 0}.ems-t td,.ems-t th{padding:3px 6px;border-bottom:1px solid var(--st-border);vertical-align:top;text-align:left}'
      + '.pl-w{position:relative}.pl-lbl{font-size:11px;color:var(--st-muted);margin:8px 0 2px}.pl-svg{display:block;width:100%}'
      + '.pl-now{position:absolute;top:0;bottom:16px;width:2px;margin-left:-1px;background:var(--st-text);opacity:.5;pointer-events:none;z-index:1}'
      + '.pl-axis{position:relative;height:14px;margin-top:2px;font-size:10px;color:var(--st-muted)}.pl-axis span{position:absolute;transform:translateX(-50%)}'
      + '.pl-c{fill:var(--st-cheap)}.pl-n{fill:var(--st-normal)}.pl-e{fill:var(--st-expensive)}.pl-past{opacity:.45}'
      + '.pl-blk{fill:var(--st-accent);opacity:.2}.pl-pv{fill:var(--st-muted);opacity:.45}.pl-trk{fill:var(--st-seg-bg)}'
      + '.pl-dot{display:inline-block;width:8px;height:8px;border-radius:50%;vertical-align:0}.pl-dot.pl-c{background:var(--st-cheap)}.pl-dot.pl-n{background:var(--st-normal)}.pl-dot.pl-e{background:var(--st-expensive)}'
      + '.pl-pva{stroke:#e08a1e;stroke-width:2}'
      + '.pl-tab{table-layout:auto;width:100%}.pl-tab td{white-space:nowrap}.pl-tab td.pl-what{max-width:0;width:100%;overflow:hidden;text-overflow:ellipsis}.pl-tab td.pl-avg{text-align:right}'
      + '.car-cal td{padding:2px 6px}.car-cal input[type=time]{font:inherit;padding:3px 5px;border:1px solid var(--st-border);border-radius:6px;background:var(--st-bg);color:var(--st-text)}.car-cal input[type=number]{font:inherit;padding:3px 5px;border:1px solid var(--st-border);border-radius:6px;background:var(--st-bg);color:var(--st-text)}'
      + '.pl-chip{display:inline;white-space:nowrap;background:var(--st-chip-bg);border:1px solid transparent;border-radius:999px;padding:1px 7px;font-size:11px}.pl-chip-plan{background:transparent;border:1px dashed var(--st-muted)}.pl-cur td{background:var(--st-lv-normal-bg)}.pl-pastrow{opacity:.55}.pl-tab th{color:var(--st-muted);font-weight:500}'
      + '.pl-leg{display:flex;flex-wrap:wrap;gap:2px 12px;font-size:10px;color:var(--st-muted);margin-top:3px}.pl-leg span{display:flex;align-items:center;gap:4px}'
      + '.pl-leg i{display:inline-block;width:10px;height:10px;border-radius:2px}.pl-leg i.pl-c{background:var(--st-cheap)}.pl-leg i.pl-n{background:var(--st-normal)}.pl-leg i.pl-e{background:var(--st-expensive)}'
      + '</style>';
  }

  // ---------------------------------------------------------------- Betriebs-Ansicht (EMS-Reiter)

  function liveRows() {
    var out = [];
    state.rows.forEach(function (r, i) {
      if (r.control === false || !r.deviceId) return;
      out.push({ i: i, r: r });
    });
    return out;
  }

  /** Hausanschluss: höchste Phase, Grenze, Drosselung, Abgeschaltetes. */
  function fuseLineHtml() {
    var f = state.cfg.fuse;
    var cur = state.shadow && state.shadow.fuse;
    if (!f || !f.enabled || !cur || cur.maxA === null || cur.maxA === undefined) return '';
    var parts = [S.fuseNow + ' ' + (Math.round(cur.maxA * 10) / 10) + ' A ' + S.fuseOf + ' ' + cur.limitA + ' A'];
    if (cur.capAmps !== null && cur.capAmps !== undefined && cur.capAmps < state.cfg.charger.maxAmps && state.cfg.charger.id) parts.push(S.fuseThrottled + ' ' + cur.capAmps + ' A');
    if (cur.shed && cur.shed.length) parts.push(S.fuseShedNow + ' ' + cur.shed.join(', '));
    var bad = cur.over || (cur.shed && cur.shed.length);
    return '<div class="card" id="ems-fuse-line"><div class="ems-st"><span class="ems-ic" style="background:' + (bad ? '#c0392b' : '#6b7280') + '">' + icon('bolt', 17) + '</span><span style="flex:1;font-size:14px">' + esc(parts.join(' - ')) + (cur.live ? '' : ' <span class="ems-muted">(' + esc(S.logTestTag) + ')</span>') + '</span></div></div>';
  }

  /** Kurze Statuszeile für «Heute». */
  function carCompactHtml() {
    var c = state.cfg.car || {};
    if (!c.deviceId) return '';
    var car = (state.shadow && state.shadow.car) || null;
    var soc = car && car.soc !== null && car.soc !== undefined ? Math.round(car.soc) + ' %' : '-';
    var parts = [S.carSocLbl + ' ' + soc];
    if (car && car.departure) parts.push(car.departure.soc + ' % ' + S.pvUntilShort + ' ' + time(car.departure.at));
    if (car) {
      var st = (S.carSt && S.carSt[car.state]) || car.state;
      if (car.starts && car.starts.length) st += ' ' + hm(car.starts[0]) + '-' + hm(car.starts[car.starts.length - 1] + 900000);
      parts.push(st + (car.connected ? '' : ' (' + S.carNotConnected + ')'));
    }
    return '<div class="card" id="ems-car-line"><div class="ems-st"><span class="ems-ic" style="background:' + COLORS.charger + '">' + icon('car', 17) + '</span><span style="flex:1;font-size:14px">' + esc(parts.join(' - ')) + '</span></div></div>';
  }

  /** Auto-Karte unter «Ausblick»: Status, «Heute/Morgen» oben, Wochenvorlage einklappbar darunter. */
  function carCardHtml() {
    var c = state.cfg.car || {};
    if (!c.deviceId) return '';
    var car = (state.shadow && state.shadow.car) || null;
    var sc = carSchedule();
    var lines = [];
    var socTxt = car && car.soc !== null && car.soc !== undefined ? Math.round(car.soc) + ' %' : '-';
    if (car && car.departure) {
      lines.push(S.carNext + ': ' + car.departure.soc + ' % ' + S.pvUntilShort + ' ' + time(car.departure.at) + ' (' + (car.departure.source === 'override' ? S.carFromOverride : S.carFromCal) + ')');
    } else lines.push(S.carNext + ': ' + S.carNone);
    if (car) {
      var st = (S.carSt && S.carSt[car.state]) || car.state;
      if (car.starts && car.starts.length) st += ': ' + hm(car.starts[0]) + ' - ' + hm(car.starts[car.starts.length - 1] + 900000) + (car.needKwh ? ' (' + car.needKwh + ' kWh)' : '');
      lines.push(st + (car.connected ? '' : ' - ' + S.carNotConnected));
    }
    var o = state.carDraft || (sc.override ? { day: 'tomorrow', time: sc.override.time, soc: sc.override.soc, on: sc.override.on } : { day: 'tomorrow', time: '06:00', soc: 80, on: true });
    var form = '<p class="lbl" style="margin-top:12px">' + esc(S.carOverride) + '</p><div class="ems-row">'
      + '<label class="ems-f"><span>&nbsp;</span><select data-ems-carf="day"><option value="today"' + (o.day === 'today' ? ' selected' : '') + '>' + esc(S.carToday) + '</option><option value="tomorrow"' + (o.day !== 'today' ? ' selected' : '') + '>' + esc(S.carTomorrow) + '</option></select></label>'
      + '<label class="ems-f"><span>' + esc(S.carTime) + '</span><input type="time" data-ems-carf="time" value="' + esc(o.time) + '"></label>'
      + '<label class="ems-f"><span>' + esc(S.carSoc) + '</span><input type="number" min="10" max="100" step="5" data-ems-carf="soc" value="' + esc(o.soc) + '" style="width:70px"></label></div>'
      + '<label class="ems-c"><span class="swt"><input class="sw" type="checkbox" data-ems-carf="on"' + (o.on ? ' checked' : '') + '><i></i></span> <span>' + esc(S.carCharge) + '</span></label>'
      + '<p style="margin:8px 0 0"><button class="btn primary" data-ems-car="save">' + esc(S.carApply) + '</button>' + (sc.override ? ' <button class="btn" data-ems-car="clear">' + esc(S.carClear) + '</button>' : '') + ' <span class="sub">' + esc(state.carMsg || '') + '</span></p>';
    return '<p class="lbl">' + esc(S.carCard) + '</p><div class="card" id="ems-car"><div class="ems-st"><span class="ems-ic" style="background:' + COLORS.charger + '">' + icon('car', 17) + '</span><b>' + esc(socTxt) + '</b></div>'
      + lines.map(function (l) { return '<p class="ems-why" style="margin:4px 0">' + esc(l) + '</p>'; }).join('') + form + carCalendarHtml() + '</div>';
  }

  function localDateKey(offsetDays) {
    var d = new Date(Date.now() + offsetDays * 86400000);
    try { return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' }); } catch (e) { return d.toISOString().slice(0, 10); }
  }

  function saveCarOverride(clear) {
    var sc = carSchedule();
    var o = state.carDraft || { day: 'tomorrow', time: '06:00', soc: 80, on: true };
    sc.override = clear ? null : { date: localDateKey(o.day === 'today' ? 0 : 1), on: o.on !== false, time: o.time || '06:00', soc: Number(o.soc) || 80 };
    var car = Object.assign({}, state.cfg.car, { schedule: sc });
    return api('PUT', '/ems/config', { car: car }).then(function (cfg) {
      if (cfg && cfg.car) state.cfg.car = JSON.parse(JSON.stringify(cfg.car)); else state.cfg.car = car;
      state.carDraft = null;
      state.carMsg = S.carSaved;
      return refreshStatus();
    }).catch(function (e) { state.carMsg = S.error + ': ' + (e && e.message || e); renderMain(); });
  }

  function saveCarTemplate() {
    var sc = carTemplate();
    sc.override = carSchedule().override; // ein Eintrag für heute/morgen bleibt
    var car = Object.assign({}, state.cfg.car, { schedule: sc });
    return api('PUT', '/ems/config', { car: car }).then(function (cfg) {
      if (cfg && cfg.car) state.cfg.car = JSON.parse(JSON.stringify(cfg.car)); else state.cfg.car = car;
      state.carCal = null;
      state.carMsg = S.carSaved;
      return refreshStatus();
    }).catch(function (e) { state.carMsg = S.error + ': ' + (e && e.message || e); renderMain(); });
  }

  function batteryControlled() {
    var c = state.cfg;
    return !!(c && c.battery && c.battery.deviceId && c.battery.control && c.battery.control.enabled && c.battery.control.preset);
  }
  function batModeLabel(m) { return m === 'charge' ? S.batModeCharge : (m === 'hold' ? S.batModeHold : S.batModeNormal); }

  function protocolHtml() {
    var rows = [];
    (state.events || []).forEach(function (e) {
      rows.push({ ts: e.ts, text: e.name + ': ' + (e.cmd === 'on' ? S.logOnWord : S.logOffWord) + (e.live ? '' : ' (' + S.logTestTag + ')'), reason: e.reason });
    });
    (state.batteryEvents || []).forEach(function (e) {
      rows.push({ ts: e.ts, text: S.batRow + ': ' + batModeLabel(e.mode) + (e.live ? '' : ' (' + S.logTestTag + ')') + (e.error ? ' - ' + S.error : ''), reason: e.reason });
    });
    (state.fuseEvents || []).forEach(function (e) {
      var what = e.action === 'over' ? S.fuseEvOver : (e.action === 'shed' ? (e.name + ' ' + S.fuseEvShed) : (e.action === 'throttle' ? S.fuseEvThrottle + ' ' + e.capAmps + ' A' : (e.action === 'throttle_end' ? S.fuseEvThrottleEnd : S.fuseEvRelease)));
      rows.push({ ts: e.ts, text: S.fuseNow + ': ' + what + (e.live ? '' : ' (' + S.logTestTag + ')') + (e.error ? ' - ' + S.error : ''), reason: e.maxA !== null && e.maxA !== undefined ? S.fusePhase + ' ' + e.phase + ': ' + e.maxA + ' A' : '' });
    });
    var chargerLive = state.cfg && state.cfg.charger && state.cfg.charger.live === true && state.cfg.silent === false;
    var ce = (state.shadow && state.shadow.charger && state.shadow.charger.events) || [];
    if (state.cfg && state.cfg.charger && state.cfg.charger.id) {
      ce.forEach(function (e) { rows.push({ ts: e.ts, text: S.wallbox + ': ' + modeLabel(e.mine) + (chargerLive ? '' : ' (' + S.logTestTag + ')'), reason: e.reason }); });
    }
    rows.sort(function (a, b) { return b.ts - a.ts; });
    var body = rows.length
      ? '<table class="ems-t pl-tab"><tbody>' + rows.slice(0, 12).map(function (x) {
        return '<tr><td class="pl-time">' + esc(time(x.ts)) + '</td><td class="pl-what" title="' + esc(x.text + ' - ' + (x.reason || '')) + '">' + esc(x.text) + ' <span class="ems-muted">' + esc(x.reason || '') + '</span></td></tr>';
      }).join('') + '</tbody></table>'
      : '<p class="sub" style="margin:0">' + esc(S.logNone) + '</p>';
    return '<p class="lbl">' + esc(S.logTitle) + '</p><div class="card" id="ems-log">' + body + '</div>';
  }

  function mainHtml() {
    var sh = state.shadow || {};
    var cfg = state.cfg;
    var ch = sh.charger && sh.charger.current;
    var cur = sh.current;
    var live = liveRows().filter(function (x) { return x.r.live; });
    var warn = ch && ch.warning;
    var errs = cur && cur.errors && cur.errors.length ? cur.errors.join(' | ') : '';
    var title; var dot;
    var silentOn = cfg.silent !== false;
    var bc = batteryControlled() ? cfg.battery.control : null;
    if (bc && bc.live) live = live.concat([{ r: { kind: 'battery' } }]);
    if (!cfg.enabled) { title = S.stOff; dot = 'var(--st-muted)'; }
    else if (warn) { title = S.stWarn; dot = '#d98a1a'; }
    else if (silentOn) { title = S.stSilent; dot = 'var(--st-switch-on)'; }
    else if (live.length) { title = S.stLive + ': ' + live.map(function (x) { return x.r.kind === 'charger' ? S.wallbox : (x.r.kind === 'battery' ? S.batRow : x.r.name); }).join(', '); dot = 'var(--st-switch-on)'; }
    else { title = S.stTest; dot = '#d98a1a'; }
    var vals = [];
    if (ch) {
      if (ch.pvW !== null && ch.pvW !== undefined) vals.push(S.pvLbl + ' ' + Math.round(ch.pvW) + ' W');
      if (ch.gridW !== null && ch.gridW !== undefined) vals.push(S.gridLbl + ' ' + Math.round(ch.gridW) + ' W');
      if (hasBattery() && ch.batterySoc !== null && ch.batterySoc !== undefined) vals.push(S.batLbl + ' ' + Math.round(ch.batterySoc) + ' %');
      if (ch.carSoc !== null && ch.carSoc !== undefined) vals.push(S.carSocLbl + ' ' + Math.round(ch.carSoc) + ' %');
    }
    var head = '<div class="card"><div class="ems-st"><span class="ems-dot" style="background:' + dot + '"></span><b>' + esc(title) + '</b>'
      + '<span class="swt"><input class="sw" id="ems-enabled" type="checkbox" data-ems-enable="1"' + (cfg.enabled ? ' checked' : '') + '><i></i></span></div>'
      + (cfg.enabled && ch ? '<div class="ems-st" style="margin-top:8px"><span class="ems-chip">' + esc(modeLabel(ch.mine.mode)) + '</span><span class="sub" style="margin:0">' + esc(ch.mine.reason) + '</span></div>' : '')
      + (vals.length ? '<div class="ems-vals">' + vals.map(function (v) { return '<span>' + esc(v) + '</span>'; }).join('') + '</div>' : '')
      + '<div class="ems-st" style="margin-top:10px"><span style="flex:1;font-size:14px">' + esc(S.silent) + '</span><span class="swt"><input class="sw" id="ems-silent" type="checkbox" data-ems-silent="1"' + (silentOn ? ' checked' : '') + '><i></i></span></div>'
      + '<p class="ems-why" style="margin-bottom:0">' + esc(S.silentHint) + '</p>'
      + (priceMissing() ? '<p class="warn">' + esc(S.noPriceDevice) + '</p>' : '') + (warn ? '<p class="warn">' + esc(warn) + '</p>' : '') + (errs ? '<p class="warn">' + esc(errs) + '</p>' : '') + '</div>';
    var items = liveRows().map(function (x) {
      var r = x.r;
      var name = r.kind === 'charger' ? S.wallbox : r.name;
      var cs = (state.consumersState || []).filter(function (c) { return c.name === r.name; })[0];
      var sub = r.kind === 'charger' ? (ch && ch.connected ? ch.mine.reason : rowSub(r)) : (cs && cs.reason ? cs.reason : rowSub(r));
      var subHasTag = r.kind === 'charger' ? !(ch && ch.connected) : !(cs && cs.reason); // rowSub() nennt Testbetrieb/live schon
      var sw = '<span class="swt"><input class="sw" type="checkbox" data-ems-toggle="' + (r.kind === 'charger' ? 'charger' : esc(r.deviceId)) + '"' + (r.live ? ' checked' : '') + '><i></i></span>';
      return '<div class="ems-item"><div class="ems-item-h" style="cursor:default"><span class="ems-ic" style="background:' + rowColor(r) + '">' + icon(rowIcon(r), 17) + '</span>'
        + '<span class="ems-item-t"><span class="ems-item-n">' + esc(name) + '</span><span class="ems-item-s ems-muted">' + esc(sub) + (subHasTag ? '' : ' - ' + esc(r.live ? S.modeLiveTag : S.modeTest)) + '</span></span>' + sw + '</div></div>';
    }).join('');
    var wb = state.rows[0] && state.rows[0].kind === 'charger' && state.rows[0].deviceId
      ? '<div class="ems-item"><div class="ems-item-h" style="cursor:default"><span class="ems-ic" style="background:' + COLORS.charger + '">' + icon('bolt', 17) + '</span><span class="ems-item-t"><span class="ems-item-n">' + esc(S.chargeNow) + '</span></span>'
        + '<span class="swt"><input class="sw" id="ems-chargenow" type="checkbox" data-ems-chargenow="1"' + (cfg.charger.chargeNow ? ' checked' : '') + '><i></i></span></div></div>'
      : '';
    var carHtml = fuseLineHtml() + carCompactHtml();
    var batItem = '';
    if (bc) {
      var bctl = sh.batteryControl;
      var bsub = bctl && bctl.lastMode ? S.batSent + ': ' + batModeLabel(bctl.lastMode) + (bctl.lastSentAt ? ' (' + time(bctl.lastSentAt) + ')' : '') : S.batRowNone;
      var btag = silentOn ? S.silentTag : (bc.live ? S.modeLiveTag : S.modeTest);
      batItem = '<div class="ems-item"><div class="ems-item-h" style="cursor:default"><span class="ems-ic" style="background:' + COLORS.bat + '">' + icon('battery', 17) + '</span>'
        + '<span class="ems-item-t"><span class="ems-item-n">' + esc(S.batRow) + '</span><span class="ems-item-s ems-muted">' + esc(bsub) + ' - ' + esc(btag) + '</span></span>'
        + '<span class="swt"><input class="sw" type="checkbox" data-ems-toggle="battery"' + (bc.live ? ' checked' : '') + '><i></i></span></div></div>';
    }
    if (silentOn) items = items.replace(/ - (gesteuert|nicht gesteuert|controlled|not controlled)<\/span>/g, ' - ' + esc(S.silentTag) + '</span>');
    var list = (items || wb || batItem) ? '<div class="ems-list">' + batItem + items + wb + '</div>' : '<p class="sub">' + esc(S.noConsumers) + '</p>';
    return styleHtml() + head + carHtml + '<p class="lbl">' + esc(S.consumers) + '</p>' + list + '<p class="ems-why">' + esc(S.switchHint) + '</p><p class="warn" id="ems-toggle-err" hidden></p>' + protocolHtml();
  }

  // ---------------------------------------------------------------- Plan-Sicht (unten im Betrieb)

  var PLAN_COLORS = {
    charge: '#3b9d4a', hold: '#d98a1a', normal: '#9aa0a6',
    instant_ev: '#5b52c8', solar_ev: '#9a93e8', holding: '#d4d1f3', battery_priority: '#d4d1f3', error: '#d32f2f',
  };
  var PLAN_STEP = 10;
  var MAX_CTRL = 8; // gleiche Grenze wie lib/ems/Config.js (MAX_CONSUMERS)

  function hm(ms) {
    try { return new Date(ms).toLocaleTimeString(LANG === 'de' ? 'de-CH' : 'en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }); } catch (e) { return String(ms); }
  }

  /** Aufeinanderfolgende gleiche Zellen zu Abschnitten zusammenfassen. */
  function planRuns(cells) {
    var out = [];
    var cur = null;
    cells.forEach(function (c, i) {
      var key = (c.state || '') + (c.planned ? '|p' : '');
      if (cur && cur.key === key) { cur.n += 1; } else { cur = { key: key, state: c.state, planned: c.planned, i: i, n: 1 }; out.push(cur); }
    });
    return out;
  }

  function planStateText(row, state) {
    if (row.kind === 'battery') return state === 'charge' ? S.planBatCharge : (state === 'hold' ? S.planBatHold : S.planBatNormal);
    if (row.kind === 'consumer') return S.planOn;
    if (row.kind === 'job') return row.preview ? S.pvPreviewLbl : S.pvJobWord;
    return modeLabel(state);
  }

  function planLaneColor(row, state) {
    if (!state) return null;
    if (row.kind === 'job') return state === 'on' ? '#0277bd' : null;
    if (row.kind === 'consumer') return state === 'on' ? consumerPlanColor(row.id) : null;
    return PLAN_COLORS[state] || null;
  }

  function consumerPlanColor(id) {
    var r = state.rows.filter(function (x) { return x.kind === 'consumer' && x.deviceId === id; })[0];
    return r ? rowColor(r) : COLORS.generic;
  }

  function planLaneSvg(row, day) {
    var W = day.slots.length * PLAN_STEP;
    var parts = ['<rect class="pl-trk" x="0" y="0" width="' + W + '" height="14" rx="3"/>'];
    planRuns(row.cells).forEach(function (r) {
      var color = planLaneColor(row, r.state);
      if (!color) return;
      var x = r.i * PLAN_STEP;
      var t0 = day.slots[r.i].t;
      var t1 = day.slots[r.i + r.n - 1].t + 900000;
      var title = hm(t0) + ' - ' + hm(t1) + ': ' + planStateText(row, r.state) + (r.planned ? ' (' + S.planPlanned + ')' : '');
      var plan = r.planned ? ' fill-opacity="0.45" stroke="' + color + '" stroke-width="1" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"' : '';
      parts.push('<rect x="' + x + '" y="1" width="' + (r.n * PLAN_STEP) + '" height="12" rx="2" fill="' + color + '"' + plan + '><title>' + esc(title) + '</title></rect>');
    });
    return '<svg class="pl-svg" viewBox="0 0 ' + W + ' 14" preserveAspectRatio="none" style="height:14px">' + parts.join('') + '</svg>';
  }

  function planPriceSvg(day, nowMs) {
    var n = day.slots.length;
    var W = n * PLAN_STEP;
    var H = 80;
    var vals = day.slots.map(function (s) { return s.price; }).filter(function (v) { return v !== null; });
    var hi = Math.max.apply(null, vals.concat([0.01]));
    var lo = Math.min.apply(null, vals.concat([0]));
    var scale = (H - 4) / (hi - lo);
    var zero = 2 + hi * scale;
    var parts = [];
    var b = day.stats.cheapestBlock;
    if (b) parts.push('<rect class="pl-blk" x="' + (b.i * PLAN_STEP) + '" y="0" width="' + (b.n * PLAN_STEP) + '" height="' + H + '" rx="3"/>');
    day.slots.forEach(function (s, i) {
      if (s.price === null) return;
      var h = Math.max(1, Math.abs(s.price) * scale);
      var y = s.price >= 0 ? zero - h : zero;
      var cls = 'pl-' + (s.level === 'cheap' ? 'c' : (s.level === 'expensive' ? 'e' : 'n')) + (s.t + 900000 <= nowMs ? ' pl-past' : '');
      parts.push('<rect class="' + cls + '" x="' + (i * PLAN_STEP) + '" y="' + y.toFixed(1) + '" width="' + (PLAN_STEP - 1) + '" height="' + h.toFixed(1) + '"><title>' + esc(hm(s.t) + ': ' + s.price + ' Rp./kWh') + '</title></rect>');
    });
    return '<svg class="pl-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="height:' + H + 'px">' + parts.join('') + '</svg>';
  }

  function planPvSvg(day) {
    var n = day.slots.length;
    var W = n * PLAN_STEP;
    var H = 34;
    var max = Math.max.apply(null, day.slots.map(function (s) { return Math.max(s.pvKw || 0, s.pvActualKw || 0); }).concat([0.1]));
    var parts = ['<rect class="pl-trk" x="0" y="0" width="' + W + '" height="' + H + '" rx="3"/>'];
    day.slots.forEach(function (s, i) {
      if (!s.pvKw) return;
      var h = Math.max(1, (s.pvKw / max) * (H - 2));
      parts.push('<rect class="pl-pv" x="' + (i * PLAN_STEP) + '" y="' + (H - h).toFixed(1) + '" width="' + PLAN_STEP + '" height="' + h.toFixed(1) + '"><title>' + esc(hm(s.t) + ': ' + s.pvKw + ' kW') + '</title></rect>');
    });
    // Was die Anlage wirklich geliefert hat: Linie über die Prognose (nur vergangene Viertelstunden mit Messung)
    var pts = [];
    day.slots.forEach(function (s, i) {
      if (s.pvActualKw === null || s.pvActualKw === undefined) return;
      pts.push({ x: i * PLAN_STEP + PLAN_STEP / 2, y: H - 1 - (s.pvActualKw / max) * (H - 3), t: s.t, kw: s.pvActualKw });
    });
    if (pts.length > 1) parts.push('<polyline class="pl-pva" fill="none" vector-effect="non-scaling-stroke" points="' + pts.map(function (q) { return q.x + ',' + q.y.toFixed(1); }).join(' ') + '"/>');
    pts.forEach(function (q) { parts.push('<circle cx="' + q.x + '" cy="' + q.y.toFixed(1) + '" r="3" fill="transparent"><title>' + esc(hm(q.t) + ': ' + q.kw + ' kW ' + S.pvReached) + '</title></circle>'); });
    return '<svg class="pl-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="height:' + H + 'px">' + parts.join('') + '</svg>';
  }

  /** Legende gleich unter der jeweiligen Grafik. */
  function legendFor(kind) {
    var sq = function (bg, text, extra) { return '<span><i style="background:' + bg + ';' + (extra || '') + '"></i>' + esc(text) + '</span>'; };
    var items = '';
    if (kind === 'price') items = '<span><i class="pl-c"></i>' + esc(S.planCheap) + '</span><span><i class="pl-n"></i>' + esc(S.planNormal) + '</span><span><i class="pl-e"></i>' + esc(S.planExp) + '</span>' + sq('rgba(2,119,189,.25)', S.planBlock);
    else if (kind === 'pv') items = sq('var(--st-muted)', S.pvForecastLeg, 'opacity:.5') + '<span><i style="background:#e08a1e;height:3px;margin-top:3px"></i>' + esc(S.pvReached) + '</span>';
    else if (kind === 'battery') items = sq(PLAN_COLORS.charge, S.planBatCharge) + sq(PLAN_COLORS.hold, S.planBatHold) + sq(PLAN_COLORS.normal, S.planBatNormal) + sq('transparent', S.planTag, 'border:1px dashed var(--st-muted)');
    else if (kind === 'charger') items = sq(PLAN_COLORS.solar_ev, S.planChSolar) + sq(PLAN_COLORS.instant_ev, S.planChFull);
    else if (kind === 'consumer') items = sq(COLORS.dehumidifier, S.planOn);
    else if (kind === 'job') items = sq('#0277bd', S.planOn) + sq('transparent', S.planTag, 'border:1px dashed #0277bd');
    return items ? '<div class="pl-leg">' + items + '</div>' : '';
  }

  /**
   * Was in dieser Zelle der Zeile "aktiv" ist: { text, planned } oder null. Die Texte sind bewusst kurz, damit ein
   * Tabelleneintrag auf dem Handy in jeder Sprache auf eine Zeile passt; "geplant" zeigt der gestrichelte Rahmen.
   */
  function planActive(row, cell) {
    var st = cell.state;
    var text = null;
    if (!st) return null;
    if (row.kind === 'battery') text = st === 'charge' ? S.batLbl + ': ' + S.planShortCharge : (st === 'hold' ? S.batLbl + ': ' + S.planShortHold : null);
    else if (row.kind === 'charger') text = st === 'solar_ev' ? S.wallbox + ': ' + S.planShortSolar : (st === 'instant_ev' ? S.wallbox + ': ' + S.planShortFull : null);
    else if (row.kind === 'consumer') text = st === 'on' ? row.name + ': ' + S.planOn : null;
    else if (row.kind === 'job') text = st === 'on' ? (row.name || S.wallbox) + ': ' + (row.preview ? S.pvPreviewLbl : S.pvJobWord) : null;
    return text ? { text: text, planned: !!cell.planned } : null;
  }

  /** Kurzer Wochentag ("Mi", "Wed") für Zeilen, die nicht heute sind. */
  function weekdayShort(ms) {
    try { return new Date(ms).toLocaleDateString(LANG === 'de' ? 'de-CH' : 'en-GB', { timeZone: 'Europe/Zurich', weekday: 'short' }).replace(/\.$/, ''); } catch (e) { return ''; }
  }

  /**
   * Tabelle ab jetzt, über beide Tage, solange Preisdaten da sind: Zeitraum, was passiert, Durchschnittspreis (Punkt = Preisniveau).
   * Neue Zeile bei jedem Wechsel von Preisniveau oder Zustand.
   */
  function planTableHtml(p) {
    var runs = [];
    var cur = null;
    p.days.forEach(function (day) {
      cur = null;
      day.slots.forEach(function (slot, i) {
        if (slot.t < p.nowQ || slot.price === null) { cur = null; return; }
        var parts = [];
        day.rows.forEach(function (row) { var a = planActive(row, row.cells[i]); if (a) parts.push(a); });
        var key = day.key + '|' + slot.level + '|' + parts.map(function (x) { return x.text + (x.planned ? '~' : ''); }).join('|');
        if (cur && cur.key === key) { cur.to = slot.t + 900000; cur.prices.push(slot.price); }
        else { cur = { key: key, day: day.key, level: slot.level, parts: parts, from: slot.t, to: slot.t + 900000, prices: [slot.price] }; runs.push(cur); }
      });
    });
    // Ohne Energiemanagement (nur Preise) gibt es keine Zeilen: dann zeigt die mittlere Spalte das Preisniveau.
    var priceOnly = !p.days.some(function (d) { return d.rows.length > 0; });
    var head = '<p class="lbl">' + esc(priceOnly ? S.planTablePrices : S.planTable) + '</p>';
    if (!runs.length) return head + '<p class="sub">' + esc(S.planNothing) + '</p>';
    if (priceOnly) {
      var levelWord = { cheap: S.planCheap, normal: S.planNormal, expensive: S.planExp };
      var prows = runs.map(function (r) {
        var avg2 = Math.round(r.prices.reduce(function (a, b) { return a + b; }, 0) / r.prices.length * 10) / 10;
        var lv2 = r.level === 'cheap' ? 'pl-c' : (r.level === 'expensive' ? 'pl-e' : 'pl-n');
        return '<tr class="' + (p.nowMs >= r.from && p.nowMs < r.to ? 'pl-cur' : '') + '"><td class="pl-time">' + (r.day === 'tomorrow' ? '<span class="ems-s">' + esc(weekdayShort(r.from)) + '</span> ' : '') + hm(r.from) + '-' + hm(r.to)
          + '</td><td class="pl-what">' + esc(levelWord[r.level] || r.level) + '</td><td class="pl-avg">' + avg2 + ' <i class="pl-dot ' + lv2 + '"></i></td></tr>';
      }).join('');
      return head + '<table class="ems-t pl-tab"><thead><tr><th>' + esc(S.planColTime) + '</th><th>' + esc(S.planColLevel) + '</th><th style="text-align:right">' + esc(S.planColPrice) + '</th></tr></thead><tbody>' + prows + '</tbody></table>';
    }
    var rows = runs.map(function (r) {
      var avg = Math.round(r.prices.reduce(function (a, b) { return a + b; }, 0) / r.prices.length * 10) / 10;
      var cls = p.nowMs >= r.from && p.nowMs < r.to ? 'pl-cur' : '';
      var lv = r.level === 'cheap' ? 'pl-c' : (r.level === 'expensive' ? 'pl-e' : 'pl-n');
      var full = r.parts.map(function (x) { return x.text + (x.planned ? ' (' + S.planTag + ')' : ''); }).join(', ');
      var what = r.parts.length ? r.parts.map(function (x) { return '<span class="pl-chip' + (x.planned ? ' pl-chip-plan' : '') + '">' + esc(x.text) + '</span>'; }).join(' ') : '<span class="ems-muted">-</span>';
      // Eine Zeile je Eintrag: Zeit ohne Umbruch (morgen mit kurzem Wochentag), der Inhalt wird bei Platzmangel gekürzt.
      return '<tr class="' + cls + '"><td class="pl-time">' + (r.day === 'tomorrow' ? '<span class="ems-s">' + esc(weekdayShort(r.from)) + '</span> ' : '') + hm(r.from) + '-' + hm(r.to) + '</td><td class="pl-what" title="' + esc(full) + '">' + what
        + '</td><td class="pl-avg">' + avg + ' <i class="pl-dot ' + lv + '"></i></td></tr>';
    }).join('');
    return head + '<table class="ems-t pl-tab"><thead><tr><th>' + esc(S.planColTime) + '</th><th>' + esc(S.planColWhat) + '</th><th style="text-align:right">' + esc(S.planColPrice) + '</th></tr></thead><tbody>' + rows + '</tbody></table>'
      + '<p class="ems-why"><span class="pl-chip pl-chip-plan">' + esc(S.planTag) + '</span> ' + esc(S.planTableHint) + '</p>';
  }

  function planHtml() {
    var p = state.preview && state.preview.days ? state.preview : state.plan;
    if (!p || !p.days || !p.days.length) return '';
    var day = p.days.filter(function (d) { return d.key === state.planDay; })[0] || p.days[0];
    var n = day.slots.length;
    var tabs = '<div class="subtabs" style="max-width:240px" data-ems-plantabs="1">' + p.days.map(function (d) {
      return '<button class="subtab' + (d.key === day.key ? ' active' : '') + '" data-ems-planday="' + d.key + '">' + esc(d.key === 'today' ? S.planToday : S.planTomorrow) + '</button>';
    }).join('') + '</div>';
    var hasPrices = day.stats.min !== null;
    var nowPct = day.key === 'today' ? ((p.nowMs - day.from) / (day.to - day.from) * 100) : null;
    var nowLine = nowPct !== null && nowPct >= 0 && nowPct <= 100 ? '<div class="pl-now" style="left:' + nowPct.toFixed(2) + '%" title="' + esc(S.planNow) + '"></div>' : '';
    var test = p.dryRun || {};
    var body = '';
    if (!hasPrices) {
      body = '<p class="sub">' + esc(S.planNoPrices) + '</p>';
    } else {
      body += '<div class="pl-w">' + nowLine;
      body += '<div class="pl-lbl">' + esc(S.planPrice) + '</div>' + planPriceSvg(day, p.nowMs) + legendFor('price');
      if (day.slots.some(function (s) { return s.pvKw !== null || (s.pvActualKw !== null && s.pvActualKw !== undefined); })) body += '<div class="pl-lbl">' + esc(S.planPv) + '</div>' + planPvSvg(day) + legendFor('pv');
      day.rows.forEach(function (row) {
        var label;
        if (row.kind === 'battery') {
          var bc = state.cfg && state.cfg.battery && state.cfg.battery.control;
          label = S.planBat + ' - ' + (!batteryControlled() ? S.planBatAdvice : (bc.live === true && state.cfg.silent === false ? S.planBatLive : S.planTest));
        }
        else if (row.kind === 'charger') label = S.planWallbox + (test.charger ? ' - ' + S.planTest : '');
        else if (row.kind === 'job') label = (row.name || S.wallbox) + ' - ' + (row.preview ? S.pvPreviewLbl : S.pvJobWord);
        else label = row.name + (test.consumers && test.consumers.indexOf(row.id) >= 0 ? ' - ' + S.planTest : '');
        body += '<div class="pl-lbl">' + esc(label) + '</div>' + planLaneSvg(row, day) + legendFor(row.kind);
      });
      body += '<div class="pl-axis">' + day.ticks.map(function (t) { return '<span style="left:' + (t.i / n * 100).toFixed(2) + '%">' + esc(t.label) + '</span>'; }).join('') + '</div>';
      body += '</div>';
    }
    var cards = '';
    if (hasPrices) {
      var b = day.stats.cheapestBlock;
      cards = '<div class="ems-cards">'
        + (b ? '<div class="ems-card"><div class="ems-k">' + esc(S.planBlock) + '</div><div class="ems-v">' + hm(b.from) + ' - ' + hm(b.to) + '</div><div class="ems-s">&#216; ' + b.avg + ' Rp./kWh</div></div>' : '')
        + '<div class="ems-card"><div class="ems-k">' + esc(S.planPriceRange) + '</div><div class="ems-v">' + day.stats.min + ' - ' + day.stats.max + '</div><div class="ems-s">&#216; ' + day.stats.avg + ' Rp./kWh</div></div>'
        + (day.stats.pvKwh !== null || day.stats.pvActualKwh !== null ? '<div class="ems-card"><div class="ems-k">' + esc(S.planPvKwh) + '</div><div class="ems-v">' + (day.stats.pvKwh !== null ? day.stats.pvKwh : '-') + ' kWh</div>' + (day.stats.pvActualKwh !== null ? '<div class="ems-s">' + esc(S.pvReachedSoFar) + ' ' + day.stats.pvActualKwh + ' kWh</div>' : '') + '</div>' : '')
        + '</div>';
    }
    return '<p class="lbl">' + esc(S.plan) + '</p><div class="card" id="ems-plan">' + tabs + body + cards + (hasPrices ? planTableHtml(p) : '') + (day.rows.length ? '<p class="ems-why">' + esc(S.planNote) + '</p>' : '') + '</div>' + previewFormHtml();
  }

  // ---------------------------------------------------------------- Vorschau: Auftrag planen

  function draftTargets() {
    var out = [];
    if (state.cfg && state.cfg.charger && state.cfg.charger.id) out.push({ id: 'charger', name: S.wallbox, kind: 'charger' });
    ((state.cfg && state.cfg.consumers) || []).forEach(function (c) {
      if (c.enabled !== false && c.id) out.push({ id: c.id, name: c.name || c.id, kind: 'consumer' });
    });
    return out;
  }

  function dtime(ms) { return hm(ms); }

  function carSocNow() {
    var ch = state.shadow && state.shadow.charger && state.shadow.charger.current;
    return ch && ch.carSoc !== null && ch.carSoc !== undefined ? ch.carSoc : null;
  }

  /** Der Auftrag im Tagesverlauf, direkt unter dem Ergebnis (der Plan oben ist beim Tippen oft nicht im Bild). */
  function previewStripHtml() {
    var p = state.preview;
    if (!p || !p.days) return '';
    var hit = null;
    p.days.forEach(function (d) {
      if (hit) return;
      d.rows.forEach(function (row) { if (!hit && row.kind === 'job' && row.preview && row.cells.some(function (c) { return c.state === 'on'; })) hit = { day: d, row: row }; });
    });
    if (!hit) return '';
    var n = hit.day.slots.length;
    return '<div class="pl-w" style="margin-top:10px"><div class="pl-lbl">' + esc(S.pvDayStrip) + ' - ' + esc(hit.day.key === 'today' ? S.planToday : S.planTomorrow) + '</div>'
      + planPriceSvg(hit.day, p.nowMs) + planLaneSvg(hit.row, hit.day)
      + '<div class="pl-axis">' + hit.day.ticks.map(function (t) { return '<span style="left:' + (t.i / n * 100).toFixed(2) + '%">' + esc(t.label) + '</span>'; }).join('') + '</div></div>';
  }

  function previewResultHtml() {
    var res = state.preview && state.preview.jobResults && state.preview.jobResults[0];
    if (!res) return '';
    if (res.error === 'amount') return '<p class="ems-why">' + esc(S.pvNeedAmount) + '</p>';
    if (res.error === 'carsoc') return '<p class="warn">' + esc(S.pvNeedCarSoc) + '</p>';
    if (res.error === 'carcap') return '<p class="warn">' + esc(S.pvNeedCarCap) + '</p>';
    if (res.error === 'reached') return '<p class="ems-ok" style="margin:8px 0 0;font-size:13px">' + esc(S.pvReachedAlready) + ' (' + Math.round(res.carSoc) + ' % / ' + res.targetSoc + ' %)</p>';
    if (res.error === 'time') return '<p class="warn">' + esc(S.pvBadTime) + '</p>';
    if (res.error === 'repeatsoc') return '<p class="warn">' + esc(S.pvRepeatSoc) + '</p>';
    var parts = [];
    var n = res.starts.length;
    if (res.carSoc !== null && res.carSoc !== undefined && res.targetSoc) parts.push(S.pvSocFrom + ' ' + Math.round(res.carSoc) + ' % ' + S.pvSocTo + ' ' + res.targetSoc + ' % = ' + res.amountKwh + ' kWh');
    if (res.feasible && n) {
      parts.push(res.starts.length === res.need && res.to - res.from === res.need * 900000
        ? S.pvRunsFrom + ' ' + dtime(res.from) + ' ' + S.pvTo + ' ' + dtime(res.to)
        : S.pvIn + ' ' + n + ' ' + S.pvQuarters + ' ' + dtime(res.from) + ' ' + S.pvTo + ' ' + dtime(res.to));
    } else if (!res.feasible) {
      parts.push((S['pvR_' + res.reason] || res.reason) + ' (' + S.pvHave + ' ' + (res.need - res.missing) + ' ' + S.pvOf + ' ' + res.need + ')');
    }
    if (res.avg !== null) parts.push(S.pvAvg + ' ' + res.avg + ' Rp./kWh');
    if (res.costChf !== null && res.costChf !== undefined) parts.push(S.pvCost + ' ' + res.costChf.toFixed(2) + ' CHF');
    return '<p class="' + (res.feasible ? 'ems-ok' : 'ems-warn') + '" style="margin:8px 0 0;font-size:13px">' + esc(parts.join(' - ')) + '</p>' + previewStripHtml();
  }

  function jobLineHtml(j) {
    var name = j.kind === 'charger' ? S.wallbox : (j.name || j.id);
    var what = j.targetSoc ? j.targetSoc + ' % (' + j.amount + ' kWh)' : j.amount + (j.kind === 'charger' ? ' kWh' : ' h');
    var status;
    if (j.runningNow) status = S.pvRunningNow;
    else if (j.from) status = S.pvPlannedAt + ' ' + hm(j.from) + ' - ' + hm(j.to);
    else status = S.pvWaiting;
    var warn = !j.feasible ? '<div class="ems-s ems-warn">' + esc(S['pvR_' + j.reason] || j.reason) + '</div>' : '';
    return '<div class="ems-item"><div class="ems-item-h" style="cursor:default"><span class="ems-ic" style="background:#0277bd">' + icon('forecast', 17) + '</span>'
      + '<span class="ems-item-t"><span class="ems-item-n">' + esc(name) + ' - ' + esc(what) + ' ' + esc(S.pvUntilShort) + ' ' + esc(time(j.deadline)) + (j.repeat && j.repeat !== 'once' ? ' (' + esc(S.pvRep[j.repeat] || j.repeat) + ')' : '') + '</span>'
      + '<span class="ems-item-s ems-muted">' + esc(status) + ' - ' + j.done + ' / ' + j.need + ' ' + esc(S.pvProgress) + '</span>' + warn + '</span>'
      + '<button class="btn" data-ems-jobdel="' + esc(j.id) + '">' + esc(S.pvRemove) + '</button></div></div>';
  }

  function jobsListHtml() {
    if (!state.jobs || !state.jobs.length) return '';
    return '<p class="lbl">' + esc(S.pvJobs) + '</p><div class="ems-list">' + state.jobs.map(jobLineHtml).join('') + '</div><p class="ems-why">' + esc(S.pvJobNote) + '</p>';
  }

  function previewFormHtml() {
    var d = state.draft;
    var targets = draftTargets();
    if (!targets.length) return '';
    var cur = targets.filter(function (t) { return t.id === d.target; })[0] || targets[0];
    var isCharger = cur.kind === 'charger';
    var opts = targets.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === cur.id ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('');
    var f = function (label, key, type, extra) {
      return '<label class="ems-f"><span>' + esc(label) + '</span><input type="' + type + '" data-ems-draft="' + key + '" value="' + esc(d[key]) + '"' + (extra || '') + '></label>';
    };
    return jobsListHtml() + '<p class="lbl">' + esc(S.pvTitle) + '</p><div class="card" id="ems-preview-form"><p class="ems-why" style="margin-top:0">' + esc(S.pvIntro) + '</p>'
      + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.pvDevice) + '</span><select data-ems-draft="target">' + opts + '</select></label></div>'
      + (isCharger && state.cfg.car && state.cfg.car.deviceId ? '<p class="ems-why" style="margin:0">' + esc(S.carNow) + ': ' + (carSocNow() === null ? '-' : Math.round(carSocNow()) + ' %') + '</p>' : '')
      + '<div class="ems-row">' + f(S.pvUntil, 'time', 'time') + (isCharger && state.cfg.car && state.cfg.car.deviceId ? f(S.pvTargetSoc, 'targetSoc', 'number', ' step="1" min="1" max="100"') : '') + f(isCharger ? S.pvKwh : S.pvHours, 'amount', 'number', ' step="' + (isCharger ? '1' : '0.25') + '" min="0"') + '</div>'
      + '<div class="ems-row">' + f(S.pvPower, 'powerKw', 'number', ' step="0.1" min="0"') + f(S.pvMaxPrice, 'maxPrice', 'number', ' step="0.5" min="0"')
      + '<label class="ems-f"><span>' + esc(S.pvRepeat) + '</span><select data-ems-draft="repeat">' + ['once', 'daily', 'weekdays', 'weekend'].map(function (k) { return '<option value="' + k + '"' + ((d.repeat || 'once') === k ? ' selected' : '') + '>' + esc(S.pvRep[k]) + '</option>'; }).join('') + '</select></label></div>'
      + (d.repeat && d.repeat !== 'once' ? '<p class="ems-why" style="margin:0">' + esc(S.pvRepeatHint) + '</p>' : '')
      + (isCharger ? '' : '<label class="ems-c"><span class="swt"><input class="sw" type="checkbox" data-ems-draft="contiguous"' + (d.contiguous ? ' checked' : '') + '><i></i></span> <span>' + esc(S.pvBlock) + '</span></label>')
      + '<p style="margin:10px 0 0"><button class="btn" data-ems-preview="run">' + esc(S.pvRun) + '</button> <button class="btn primary" data-ems-preview="save">' + esc(S.pvSave) + '</button> <button class="btn" data-ems-preview="clear">' + esc(S.pvClear) + '</button></p>'
      + previewResultHtml() + '<p class="ems-why" id="ems-job-msg" style="margin-bottom:0">' + esc(state.jobMsg || '') + '</p></div>';
  }

  function draftJob() {
    var d = state.draft;
    var targets = draftTargets();
    var cur = targets.filter(function (t) { return t.id === d.target; })[0] || targets[0];
    if (!cur) return null;
    return { id: cur.id, kind: cur.kind, time: d.time, targetSoc: cur.kind === 'charger' && d.targetSoc !== '' && d.targetSoc !== undefined ? Number(d.targetSoc) : null, amount: d.amount === '' ? 0 : Number(d.amount), powerKw: d.powerKw === '' ? null : Number(d.powerKw), maxPrice: d.maxPrice === '' ? null : Number(d.maxPrice), contiguous: d.contiguous !== false, repeat: d.repeat || 'once' };
  }

  function saveJob() {
    var job = draftJob();
    if (!job) return Promise.resolve();
    state.jobMsg = '';
    return api('POST', '/ems/jobs', job).then(function (r) {
      state.jobs = (r && r.jobs) || [];
      state.preview = null;
      state.jobMsg = S.pvSavedOk;
      return api('GET', '/ems/plan').catch(function () { return null; });
    }).then(function (p) {
      if (p) state.plan = p;
      renderMain();
    }).catch(function (e) {
      state.jobMsg = S.pvSaveFailed + ': ' + (e && e.message || e);
      renderMain();
    });
  }

  function deleteJob(id) {
    return api('DELETE', '/ems/jobs/' + encodeURIComponent(id)).then(function (r) {
      state.jobs = (r && r.jobs) || [];
      state.jobMsg = '';
      return api('GET', '/ems/plan').catch(function () { return null; });
    }).then(function (p) {
      if (p) state.plan = p;
      renderMain();
    }).catch(function () { renderMain(); });
  }

  function runPreview() {
    var d = state.draft;
    var targets = draftTargets();
    var cur = targets.filter(function (t) { return t.id === d.target; })[0] || targets[0];
    if (!cur) return Promise.resolve();
    var job = draftJob();
    return api('POST', '/ems/plan/preview', { jobs: [job] }).then(function (r) {
      state.preview = r || null;
      // Zum Tag springen, an dem der Auftrag läuft (sonst sieht man die Vorschau nicht)
      var days = (r && r.days) || [];
      var hasJob = function (d) { return d.rows.some(function (row) { return row.kind === 'job' && row.cells.some(function (c) { return c.state === 'on'; }); }); };
      var cur = days.filter(function (d) { return d.key === state.planDay; })[0];
      if (!cur || !hasJob(cur)) { var hit = days.filter(hasJob)[0]; if (hit) state.planDay = hit.key; }
      renderMain();
    }).catch(function () { state.preview = null; renderMain(); });
  }

  /** Ausblick: Plan, Tabelle, Aufträge. Auch ohne Energiemanagement-Gerät (dann nur die Preise und die Prognose). */
  function renderPlan() {
    var host = $('ems-view-plan');
    if (!host || !state.cfg) return;
    host.innerHTML = styleHtml() + carCardHtml() + planHtml();
  }

  function renderMain() {
    renderPlan();
    var panel = $('ems-view-main');
    if (!panel || !state.cfg) return;
    state.renderedNoDevice = noDevice();
    // Ohne Energiemanagement-Gerät bleibt «Heute» frei davon; die Einladung steht unter «Einrichten» → EMS.
    panel.innerHTML = noDevice() ? '' : mainHtml();
  }

  // ---------------------------------------------------------------- Vergleich (nur Testphase)

  function counts(o) {
    var keys = Object.keys(o || {});
    return keys.length ? keys.map(function (k) { return modeLabel(k) + ' ' + o[k]; }).join(' / ') : '-';
  }
  function cmpSection(title, data) {
    if (!data) return '<div class="card"><h2>' + esc(title) + '</h2><p class="sub">' + esc(S.none2) + '</p></div>';
    var pct = data.overallAgreePct === null || data.overallAgreePct === undefined ? '-' : data.overallAgreePct + ' %';
    var days = (data.days || []).slice().reverse().map(function (d) {
      return '<tr><td>' + esc(d.day) + '</td><td>' + esc(d.agreePct === null || d.agreePct === undefined ? '-' : d.agreePct + ' %') + '</td><td>' + esc(d.compared) + '/' + esc(d.ticks) + '</td><td>' + esc(counts(d.mine)) + '</td><td>' + esc(counts(d.other)) + '</td></tr>';
    }).join('');
    var ev = (data.events || []).slice(0, 25).map(function (e) {
      return '<tr><td>' + esc(time(e.ts)) + '</td><td>' + esc(e.soc === null || e.soc === undefined ? '-' : e.soc + ' %') + '</td><td>' + esc(e.price === null || e.price === undefined ? '-' : e.price) + '</td><td>' + esc(modeLabel(e.mine)) + '</td><td>' + esc(modeLabel(e.other)) + '</td><td>' + esc(e.reason) + '</td></tr>';
    }).join('');
    return '<div class="card"><h2>' + esc(title) + '</h2><p class="sub">' + esc(S.overall) + ': <b>' + esc(pct) + '</b></p>'
      + (days ? '<h3>' + esc(S.perDay) + '</h3><table class="ems-t"><tr><th>' + esc(S.day) + '</th><th>' + esc(S.same) + '</th><th>' + esc(S.compared) + '/' + esc(S.runs) + '</th><th>' + esc(S.mine) + '</th><th>' + esc(S.theirs) + '</th></tr>' + days + '</table>' : '<p class="sub">' + esc(S.none2) + '</p>')
      + (ev ? '<h3>' + esc(S.changes) + '</h3><table class="ems-t"><tr><th>' + esc(S.time) + '</th><th>SoC</th><th>' + esc(S.price) + '</th><th>' + esc(S.mine) + '</th><th>' + esc(S.theirs) + '</th><th>' + esc(S.reason) + '</th></tr>' + ev + '</table>' : '')
      + '</div>';
  }
  function compareNowHtml() {
    var sh = state.shadow;
    var cards = [];
    var ch = sh.charger && sh.charger.current;
    var cur = sh.current;
    if (ch) {
      cards.push('<div class="ems-card"><div class="ems-k">' + esc(S.cmpCharger) + ' - ' + esc(S.mine) + '</div><div class="ems-v">' + esc(ch.mine.mode) + '</div><div class="ems-s">' + esc(ch.mine.reason) + '</div></div>');
      cards.push('<div class="ems-card"><div class="ems-k">' + esc(S.cmpCharger) + ' - ' + esc(S.theirs) + '</div><div class="ems-v">' + esc(ch.other ? ch.other.mode : '-') + '</div><div class="ems-s">' + esc(ch.other ? ch.other.reason : '') + '</div></div>');
    }
    if (cur) {
      cards.push('<div class="ems-card"><div class="ems-k">' + esc(S.cmpBattery) + ' - ' + esc(S.mine) + '</div><div class="ems-v">' + esc(modeLabel(cur.mine.mode)) + '</div><div class="ems-s">' + esc(cur.soc === null ? '' : Math.round(cur.soc) + ' %') + '</div></div>');
      cards.push('<div class="ems-card"><div class="ems-k">' + esc(S.cmpBattery) + ' - ' + esc(S.theirs) + '</div><div class="ems-v">' + esc(modeLabel(cur.other && cur.other.mode)) + '</div><div class="ems-s">' + esc(cur.other ? cur.other.reason : '') + '</div></div>');
    }
    return cards.length ? '<div class="card"><h2>' + esc(S.nowSec) + '</h2><div class="ems-cards">' + cards.join('') + '</div></div>' : '';
  }
  function compareSettingsHtml() {
    var c = state.cfg;
    return '<div class="card"><h2>' + esc(S.cmpSource) + '</h2><div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.cmpDev) + '</span><select id="ems-d-cmp">' + deviceOptions(c.devices.compareEms, hasCap(/^ems_mode$/), S.none) + '</select></label></div></div>'
      + '<details class="card sec"><summary><h2>' + esc(S.batterySec) + '</h2></summary><div class="ems-row">'
      + field(S.targetSoc, 'ems-b-target', c.battery.targetSoc) + field(S.reserve, 'ems-b-reserve', c.battery.reserveHours) + field(S.solarLimit, 'ems-b-solar', c.battery.solarLimitKwh)
      + '</div></details><p><button class="btn" data-ems-save="1">' + esc(S.save) + '</button> <span class="sub" id="ems-msg-cmp">' + esc(state.msg) + '</span></p>';
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
    var on = !!(state.cfg && state.cfg.compare);
    var sw = '<div class="card"><label class="ems-c"><span class="swt"><input class="sw" id="ems-cmp-on" type="checkbox" data-ems-compare="1"' + (on ? ' checked' : '') + '><i></i></span> <span>' + esc(S.cmpSwitch) + '</span></label><p class="ems-why">' + esc(S.cmpSwitchHint) + '</p></div>';
    var settings = $('ems-cmp-settings');
    if (settings) settings.hidden = !on;
    if (!on) { host.innerHTML = styleHtml() + sw; return; }
    var sh = state.shadow;
    if (!sh) { host.innerHTML = '<div class="card"><p class="sub">' + esc(S.none2) + '</p></div>'; return; }
    host.innerHTML = styleHtml() + sw
      + '<div class="card"><p class="sub">' + esc(S.cmpIntro) + '</p></div>'
      + (sh.enabled ? '' : '<div class="card"><p class="warn">' + esc(S.cmpOff) + '</p></div>')
      + compareNowHtml()
      + cmpSection(S.cmpBattery, { overallAgreePct: sh.overallAgreePct, days: sh.days, events: sh.events })
      + cmpSection(S.cmpCharger, sh.charger ? { overallAgreePct: sh.charger.overallAgreePct, days: sh.charger.days, events: sh.charger.events } : null);
  }

  function render() {
    renderMain();
    renderSetup();
  }

  // ---------------------------------------------------------------- Formular -> Zustand

  /** Liest die Eingaben der aufgeklappten Zeilen in den Zustand (damit ein Neuzeichnen nichts verliert). */
  function sync() {
    if (!state.cfg || noDevice()) return;
    syncFuse();
    SOURCES.forEach(function (s) {
      if (s.key === 'price' || s.key === 'fc') return;
      if (s.key === 'bat' && state.open['src-bat'] && $('ems-bc-on')) {
        var bcc = state.cfg.battery.control = Object.assign({ enabled: false, live: false, preset: '', normalDischargeW: 7000, repeatMin: 10 }, state.cfg.battery.control);
        bcc.enabled = chk('ems-bc-on');
        if ($('ems-bc-normal')) {
          bcc.normalDischargeW = num('ems-bc-normal', bcc.normalDischargeW);
          bcc.repeatMin = num('ems-bc-repeat', bcc.repeatMin);
          state.cfg.battery.chargePowerKw = num('ems-bc-power', state.cfg.battery.chargePowerKw);
          state.cfg.battery.targetSoc = num('ems-bc-target', state.cfg.battery.targetSoc);
        }
        syncCustomMap(bcc);
      }
      if (s.key === 'car' && state.open['src-car'] && $('ems-car-cap')) state.cfg.car = Object.assign({ deviceId: '', socCapability: 'measure_battery' }, state.cfg.car, { capacityKwh: num('ems-car-cap', state.cfg.car ? state.cfg.car.capacityKwh : 0) });
      var d = srcDevice(s.key);
      if (!state.open['src-' + s.key]) return;
      var id = val('src-' + s.key + '-dev', d.id);
      var cap = val('src-' + s.key + '-cap', d.cap);
      setSrc(s.key, id, id === d.id ? cap : d.cap);
    });
    if (state.open['src-fc']) state.cfg.pv = Object.assign({}, state.cfg.pv, { factor: num('ems-pv-factor', state.cfg.pv ? state.cfg.pv.factor : 1) });
    state.rows.forEach(function (r, i) {
      var p = 'row' + i + '-';
      if (!state.open['row' + i]) return;
      r.name = val(p + 'name', r.name);
      if ($(p + 'dev')) r.deviceId = val(p + 'dev', r.deviceId);
      r.meterDeviceId = val(p + 'mdev', r.meterDeviceId);
      r.meterCap = val(p + 'mcap', r.meterCap);
      if (r.kind === 'charger') {
        r.maxAmps = num(p + 'maxAmps', r.maxAmps); r.stepHoldS = num(p + 'stepHold', r.stepHoldS);
        if ($(p + 'autoOff')) r.autoOff = chk(p + 'autoOff');
        return;
      }
      r.type = val(p + 'type', r.type);
      r.controlKind = val(p + 'kind', r.controlKind || 'device');
      if (r.controlKind === 'flow') {
        r.flowOn = pickFlow(val(p + 'flowOn', r.flowOn.id), r.flowOn);
        r.flowOff = pickFlow(val(p + 'flowOff', r.flowOff.id), r.flowOff);
        r.assumedW = num(p + 'assumedW', r.assumedW);
        if (!r.deviceId || r.deviceId.indexOf('flow:') !== 0) r.deviceId = 'flow:' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
      } else if (r.deviceId && r.deviceId.indexOf('flow:') === 0) {
        r.deviceId = '';
      }
      r.mode = val(p + 'mode', r.mode);
      ['fullSoc', 'socOn', 'hysteresis', 'minSurplusW', 'startSustainS', 'stopGraceS', 'minRunMin', 'minOffMin', 'protectSoc'].forEach(function (k) { r[k] = num(p + k, r[k]); });
      if ($(p + 'useGate')) r.useForecastGate = chk(p + 'useGate');
      if (r.type === 'dehumidifier' && $(p + 'humSensor')) {
        r.humidity = {
          enabled: chk(p + 'humEnable'), sensorId: val(p + 'humSensor', r.humidity.sensorId), capability: r.humidity.capability || 'measure_humidity',
          onAbove: num(p + 'humOn', r.humidity.onAbove), offBelow: num(p + 'humOff', r.humidity.offBelow), runMin: num(p + 'humRun', r.humidity.runMin),
        };
      }
    });
    if (state.cmpBuilt) {
      var other = $('ems-d-cmp');
      if (other && other.value !== undefined) state.cfg.devices.compareEms = other.value;
      if ($('ems-b-target')) {
        state.cfg.battery.targetSoc = num('ems-b-target', state.cfg.battery.targetSoc);
        state.cfg.battery.reserveHours = num('ems-b-reserve', state.cfg.battery.reserveHours);
        state.cfg.battery.solarLimitKwh = num('ems-b-solar', state.cfg.battery.solarLimitKwh);
      }
    }
  }

  /** Zustand -> zwei Konfigurationen: Energiemanagement und Zählerstände (Kosten). */
  function collect() {
    sync();
    var c = state.cfg;
    var charger = state.rows[0];
    var consumers = state.rows.filter(function (r) {
      return r.kind === 'consumer' && r.control !== false && r.deviceId && (r.controlKind !== 'flow' || (r.flowOn && r.flowOn.id) || (r.flowOff && r.flowOff.id));
    }).map(function (r) {
      return {
        controlKind: r.controlKind === 'flow' ? 'flow' : 'device', flowOn: r.flowOn, flowOff: r.flowOff, assumedW: r.assumedW || 0,
        id: r.deviceId, name: r.name || 'Verbraucher', enabled: true, live: r.live === true, type: r.type, mode: r.mode,
        fullSoc: r.fullSoc, socOn: r.socOn, hysteresis: r.hysteresis, minSurplusW: r.minSurplusW, startSustainS: r.startSustainS, stopGraceS: r.stopGraceS,
        minRunMin: r.minRunMin, minOffMin: r.minOffMin, protectSoc: r.protectSoc, useForecastGate: r.useForecastGate, humidity: r.humidity,
      };
    });
    var ems = {
      devices: { meter: c.devices.meter, house: c.devices.house, inverter: c.devices.inverter, compareEms: c.devices.compareEms },
      battery: {
        deviceId: c.battery.deviceId, socCapability: c.battery.socCapability, targetSoc: c.battery.targetSoc, reserveHours: c.battery.reserveHours, solarLimitKwh: c.battery.solarLimitKwh, chargePowerKw: c.battery.chargePowerKw,
        control: { enabled: !!(c.battery.control && c.battery.control.enabled), preset: (c.battery.control && c.battery.control.preset) || '', normalDischargeW: c.battery.control ? c.battery.control.normalDischargeW : 7000, repeatMin: c.battery.control ? c.battery.control.repeatMin : 10, custom: c.battery.control && c.battery.control.custom ? c.battery.control.custom : undefined },
      },
      charger: { id: charger ? charger.deviceId : c.charger.id, costName: charger ? charger.name : c.charger.costName, maxAmps: charger ? charger.maxAmps : c.charger.maxAmps, stepHoldS: charger ? charger.stepHoldS : c.charger.stepHoldS, chargeNowAutoOff: charger ? charger.autoOff !== false : c.charger.chargeNowAutoOff !== false },
      pv: { factor: c.pv ? c.pv.factor : 1, source: (c.pv && c.pv.source) || 'auto', device: (c.pv && c.pv.device) || { id: '', today: '', tomorrow: '' } },
      car: { schedule: c.car && c.car.schedule ? c.car.schedule : undefined, deviceId: c.car ? c.car.deviceId : '', socCapability: c.car ? c.car.socCapability : 'measure_battery', capacityKwh: c.car ? Number(c.car.capacityKwh) || 0 : 0 },
      refreshS: Number(c.refreshS) || 0,
      tickMinutes: Number(c.tickMinutes) || 5,
      fuse: c.fuse ? JSON.parse(JSON.stringify(c.fuse)) : undefined,
      consumers: consumers,
    };
    var cost = state.rows.filter(function (r) { return r.name && r.meterDeviceId && r.meterCap; }).map(function (r) {
      return { name: r.name, deviceId: r.meterDeviceId, capability: r.meterCap };
    });
    return { ems: ems, meters: { consumers: cost } };
  }

  // ---------------------------------------------------------------- Vorschläge

  function suggest() {
    sync();
    var n = 0;
    var by = function (fn) { for (var i = 0; i < state.devices.length; i++) if (fn(state.devices[i])) return state.devices[i]; return null; };
    var has = function (d, re) { return (d.caps || []).some(function (x) { return re.test(x); }); };
    var set = function (key, d, prefer, re) {
      if (!d || srcDevice(key).id) return;
      setSrc(key, d.id, pickCap(d.id, re || /^measure_power/, '', prefer)); n += 1;
    };
    var grid = by(function (d) { return has(d, /^measure_power$/) && has(d, /^meter_power\.exported$/); });
    set('grid', grid, 'measure_power');
    if (grid && has(grid, /^measure_power\.load$/)) set('house', grid, 'measure_power.load');
    set('pv', by(function (d) { return d.cls === 'solarpanel' && has(d, /^measure_power/); }), 'measure_power');
    set('bat', by(function (d) { return has(d, /^measure_battery$/) && (d.cls === 'battery' || has(d, /^measure_power/)); }), 'measure_battery', /^measure_battery/);
    var wb = by(function (d) { return d.cls === 'evcharger' || has(d, /^evcharger_charging_state$/) || has(d, /^target_power$/); });
    if (wb && state.rows[0] && state.rows[0].kind === 'charger' && !state.rows[0].deviceId) {
      state.rows[0].deviceId = wb.id;
      if (!state.rows[0].meterDeviceId && has(wb, /^meter_power$/)) { state.rows[0].meterDeviceId = wb.id; state.rows[0].meterCap = 'meter_power'; }
      n += 1;
    }
    state.suggestMsg = n ? S.suggested + ' ' + n : S.nothingSuggested;
    renderSetup();
  }

  // ---------------------------------------------------------------- Laden und Speichern

  function load() {
    return Promise.all([
      api('GET', '/ems/shadow'),
      api('GET', '/ems/consumers').catch(function () { return { current: [], events: [] }; }),
      api('GET', '/meters').catch(function () { return null; }),
      api('GET', '/ems/plan').catch(function () { return null; }),
      api('GET', '/ems/jobs').catch(function () { return { jobs: [] }; }),
    ]).then(function (r) {
      state.plan = r[3];
      state.jobs = (r[4] && r[4].jobs) || [];
      state.shadow = r[0];
      state.consumersState = r[1].current || [];
      state.events = r[1].events || [];
      state.batteryEvents = r[1].batteryEvents || [];
      state.fuseEvents = r[1].fuseEvents || [];
      state.meters = r[2];
      if (!state.cfg) state.cfg = JSON.parse(JSON.stringify(r[0].config)); // eigene Kopie: Formularänderungen dürfen die Serverantwort nicht verändern
      if (!state.built) { buildRows(); state.built = true; }
      else {
        // Schalter (live, ein/aus) kommen vom Server, ohne Eingaben zu überschreiben
        var sc = r[0].config;
        if (state.rows[0] && state.rows[0].kind === 'charger') state.rows[0].live = sc.charger.live === true;
        state.rows.forEach(function (row) {
          (sc.consumers || []).forEach(function (x) { if (row.kind === 'consumer' && x.id === row.deviceId) row.live = x.live === true; });
        });
        state.cfg.enabled = sc.enabled;
        state.cfg.compare = sc.compare === true;
        state.cfg.silent = sc.silent !== false;
        if (sc.battery && sc.battery.control) state.cfg.battery.control = Object.assign({}, state.cfg.battery.control, { live: sc.battery.control.live === true });
        state.cfg.charger.live = sc.charger.live;
        state.cfg.charger.chargeNow = sc.charger.chargeNow;
      }
      return state;
    });
  }

  function refreshStatus() {
    // Wer gerade in der Vorschau tippt, wird nicht unterbrochen (das Neuzeichnen würde die Eingabe löschen).
    var ae = typeof document !== 'undefined' ? document.activeElement : null;
    if (ae && ae.getAttribute && (ae.getAttribute('data-ems-draft') !== null || ae.getAttribute('data-ems-carf') !== null || ae.getAttribute('data-ems-carcal') !== null)) return Promise.resolve();
    return load().then(function () {
      if (noDevice() !== state.renderedNoDevice) { render(); } else { renderMain(); }
      renderCompare();
      if (state.preview) runPreview();
    }).catch(function () {});
  }

  function setMsg(text) {
    state.msg = text;
    ['ems-msg', 'ems-msg-cmp'].forEach(function (id) { var el = $(id); if (el) el.textContent = text; });
  }

  function save() {
    var b = collect();
    if (b.ems.consumers.length > MAX_CTRL) { setMsg(S.maxConsumers); return Promise.resolve(); }
    var metersCfg = state.meters && state.meters.config ? state.meters.config : null;
    var anyMeter = b.meters.consumers.length > 0;
    setMsg('...');
    var putMeters = (metersCfg || anyMeter)
      ? api('PUT', '/meters', { consumers: b.meters.consumers, enabled: metersCfg ? (metersCfg.enabled || anyMeter) : anyMeter }).catch(function () { return null; })
      : Promise.resolve(null);
    return api('PUT', '/ems/config', b.ems).then(function (cfg) {
      state.cfg = JSON.parse(JSON.stringify(cfg));
      return putMeters;
    }).then(function (m) {
      if (m) state.meters = m;
      state.built = false;
      state.cmpBuilt = false;
      return load();
    }).then(function () {
      setMsg(S.saved);
      render();
      renderCompare();
    }).catch(function (e) { setMsg(S.error + ': ' + (e && e.message || e)); });
  }

  function onToggle(t) {
    var target = t.getAttribute('data-ems-toggle');
    var on = !!t.checked;
    var errEl = $('ems-toggle-err');
    if (errEl) errEl.hidden = true;
    api('PUT', '/ems/toggle', { target: target, live: on }).then(function () { return refreshStatus(); }).catch(function (e) {
      t.checked = !on;
      if (errEl) { errEl.textContent = S.toggleFailed + ': ' + (e && e.message || e); errEl.hidden = false; }
    });
  }

  function onClick(ev) {
    var t = ev.target;
    if (!t || !t.getAttribute) return;
    var open = up(t, 'data-ems-open');
    var adv = up(t, 'data-ems-adv');
    var rm = up(t, 'data-ems-remove');
    var planDay = up(t, 'data-ems-planday');
    var carBtn = up(t, 'data-ems-car');
    if (carBtn === 'savecal') { saveCarTemplate(); return; }
    if (carBtn === 'resetcal') { state.carCal = null; renderMain(); return; }
    if (carBtn) { saveCarOverride(carBtn === 'clear'); return; }
    if (up(t, 'data-ems-carcalopen')) { state.carCalOpen = !state.carCalOpen; return; }
    var fuseAdd = up(t, 'data-ems-fuseadd');
    var fuseDel = up(t, 'data-ems-fusedel');
    var fuseUp = up(t, 'data-ems-fuseup');
    if (fuseAdd || fuseDel !== null || fuseUp !== null) {
      sync();
      var fz = fuseCfg();
      if (fuseAdd) {
        var pick = String(($('ems-fuse-addsel') || {}).value || '');
        if (pick === 'charger') fz.shed.push({ kind: 'charger' });
        else if (pick.indexOf('d:') === 0) { var dv = findDevice(pick.slice(2)); fz.shed.push({ kind: 'device', id: pick.slice(2), name: dv ? dv.name : '' }); }
        else if (pick.indexOf('f:') === 0) { var fl = (state.flows || []).filter(function (x) { return x.id === pick.slice(2); })[0]; if (fl) fz.shed.push({ kind: 'flow', flow: { id: fl.id, advanced: !!fl.advanced, name: fl.name }, name: fl.name }); }
      } else if (fuseDel !== null) {
        fz.shed.splice(Number(fuseDel), 1);
      } else {
        var ui = Number(fuseUp);
        if (ui > 0) { var mv = fz.shed.splice(ui, 1)[0]; fz.shed.splice(ui - 1, 0, mv); }
      }
      renderSetup();
      return;
    }
    var bccBtn = up(t, 'data-ems-bcc');
    if (bccBtn) {
      sync();
      var bcx = state.cfg.battery.control;
      var bm = customMap(bcx);
      var bp = bccBtn.split(':');
      if (bp[0] === 'add' && bm[bp[1]] && bm[bp[1]].length < MAX_BAT_STEPS) bm[bp[1]].push({ card: '', args: {}, skipWhenCarCharging: false });
      if (bp[0] === 'del' && bm[bp[1]]) bm[bp[1]].splice(Number(bp[2]), 1);
      bcx.custom = bm;
      renderSetup();
      return;
    }
    var jobDel = up(t, 'data-ems-jobdel');
    var pv = up(t, 'data-ems-preview');
    if (jobDel) {
      deleteJob(jobDel);
    } else if (pv) {
      if (pv === 'save') { saveJob(); } else if (pv === 'clear') { state.preview = null; state.draft.amount = ''; state.draft.powerKw = ''; state.draft.maxPrice = ''; renderMain(); } else { runPreview(); }
    } else if (planDay) {
      state.planDay = planDay;
      renderMain();
    } else if (open) {
      sync();
      state.open[open] = !state.open[open];
      if (open === 'src-bat' && state.open[open] && !state.batteryCards) loadBatteryCards();
      renderSetup();
    } else if (adv) {
      state.open[adv] = !state.open[adv];
    } else if (up(t, 'data-ems-add')) {
      sync();
      state.rows.push(newConsumerRow());
      state.open['row' + (state.rows.length - 1)] = true;
      renderSetup();
    } else if (rm !== null) {
      sync();
      state.rows.splice(Number(rm), 1);
      state.open = {};
      renderSetup();
    } else if (up(t, 'data-ems-suggest')) {
      suggest();
    } else if (up(t, 'data-ems-save')) {
      save();
    }
  }

  function onChange(ev) {
    var t = ev.target;
    if (!t || !t.getAttribute) return;
    var g = function (n) { var v = t.getAttribute(n); return v === null || v === undefined ? null : v; };
    var cc = g('data-ems-carcal');
    if (cc !== null) {
      var tpl = state.carCal = state.carCal || JSON.parse(JSON.stringify(carSchedule()));
      var part = cc.split(':');
      if (part[0] === 'holiday') { tpl.holiday = !!t.checked; renderMain(); }
      else if (part[0] === 'holidayUntil') tpl.holidayUntil = t.value || '';
      else if (part[0] === 'grid') tpl.gridCharge = !!t.checked;
      else if (tpl.days[part[0]]) {
        if (part[1] === 'on') tpl.days[part[0]].on = !!t.checked;
        else if (part[1] === 'time') tpl.days[part[0]].time = t.value;
        else if (part[1] === 'soc') tpl.days[part[0]].soc = Number(t.value) || tpl.days[part[0]].soc;
      }
      return;
    }
    var carf = g('data-ems-carf');
    if (carf !== null) {
      var sc1 = carSchedule();
      state.carDraft = state.carDraft || (sc1.override ? { day: 'tomorrow', time: sc1.override.time, soc: sc1.override.soc, on: sc1.override.on } : { day: 'tomorrow', time: '06:00', soc: 80, on: true });
      state.carDraft[carf] = carf === 'on' ? !!t.checked : t.value;
      return;
    }
    var pvk = g('data-ems-pv');
    if (pvk !== null) {
      sync();
      var pc = state.cfg.pv = Object.assign({ factor: 1, source: 'auto', device: { id: '', today: '', tomorrow: '' } }, state.cfg.pv);
      pc.device = Object.assign({ id: '', today: '', tomorrow: '' }, pc.device);
      if (pvk === 'source') pc.source = t.value;
      else if (pvk === 'device') {
        pc.device.id = t.value;
        var dd = findDevice(t.value);
        var caps = dd ? (dd.caps || []) : [];
        var titles = (dd && dd.capTitles) || {};
        var pick = function (re) { return caps.filter(function (c) { return re.test(c) || re.test(titles[c] || ''); })[0] || ''; };
        pc.device.today = pick(/today|heute/i);
        pc.device.tomorrow = pick(/tomorrow|morgen/i);
      } else pc.device[pvk] = t.value;
      renderSetup();
      return;
    }
    var calc = g('data-ems-calc');
    if (calc !== null) {
      sync();
      state.cfg[calc] = Number(t.value) || 0;
      renderSetup();
      return;
    }
    var dr = g('data-ems-draft');
    if (dr !== null) {
      if (dr === 'contiguous') state.draft.contiguous = !!t.checked;
      else state.draft[dr] = t.value;
      if (dr === 'target') { state.draft.amount = ''; state.draft.powerKw = ''; state.preview = null; renderMain(); return; }
      runPreview();
      return;
    }
    if (g('data-ems-silent') !== null) {
      var silentOn = !!t.checked;
      api('PUT', '/ems/config', { silent: silentOn }).then(function () { state.cfg.silent = silentOn; return refreshStatus(); }).catch(function () { t.checked = !silentOn; });
      return;
    }
    if (t.id === 'ems-bc-on') { sync(); renderSetup(); return; }
    if (t.id === 'ems-fuse-on' || g('data-ems-fusedev') !== null) { sync(); renderSetup(); return; }
    if (g('data-ems-bcpreset') !== null) { sync(); state.cfg.battery.control.preset = t.value; renderSetup(); return; }
    if (g('data-ems-bccard') !== null) { sync(); renderSetup(); return; }
    if (g('data-ems-compare') !== null) {
      var cmpOn = !!t.checked;
      api('PUT', '/ems/config', { compare: cmpOn }).then(function () { state.cfg.compare = cmpOn; return refreshStatus(); }).catch(function () { t.checked = !cmpOn; });
      return;
    }
    if (g('data-ems-toggle') !== null) { onToggle(t); return; }
    if (g('data-ems-enable') !== null) {
      var on = !!t.checked;
      api('PUT', '/ems/config', { enabled: on }).then(function () { return refreshStatus(); }).catch(function () { t.checked = !on; });
      return;
    }
    if (g('data-ems-chargenow') !== null) {
      var cn = !!t.checked;
      api('PUT', '/ems/config', { charger: { chargeNow: cn } }).then(function () { return refreshStatus(); }).catch(function () { t.checked = !cn; });
      return;
    }
    var src = g('data-ems-src');
    if (src !== null) {
      sync();
      var s = SOURCES.filter(function (x) { return x.key === src; })[0];
      var id = val('src-' + src + '-dev', '');
      var d = srcDevice(src);
      setSrc(src, id, id ? pickCap(id, s.re, d.cap, s.prefer) : '');
      renderSetup();
      return;
    }
    var md = g('data-ems-mdev');
    if (md !== null) {
      sync();
      var r = state.rows[Number(md)];
      r.meterCap = r.meterDeviceId ? pickCap(r.meterDeviceId, /^meter_power/, '', 'meter_power') : '';
      renderSetup();
      return;
    }
    if (g('data-ems-mode') !== null) {
      sync();
      renderSetup();
    }
  }

  function onSubClick(ev) {
    var t = ev.target;
    var which = t && t.getAttribute ? t.getAttribute('data-ems-sub') : null;
    if (!which) return;
    var main = $('ems-view-main');
    var cmp = $('ems-view-cmp');
    if (main) main.hidden = which !== 'main';
    if (cmp) cmp.hidden = which !== 'cmp';
    [[$('ems-sub-main'), which === 'main'], [$('ems-sub-cmp'), which === 'cmp']].forEach(function (p) {
      if (p[0] && p[0].classList && p[0].classList.toggle) p[0].classList.toggle('active', p[1]);
    });
  }

  function startTimer() {
    if (state.timer) return;
    state.timer = setInterval(function () {
      var panel = $('panel-ems');
      if (panel && panel.classList && panel.classList.contains('active')) refreshStatus();
    }, 20000);
  }

  function init(apiCall, lang) {
    api = apiCall;
    LANG = lang === 'de' ? 'de' : 'en';
    S = STR[LANG];
    var btn = $('t-ems');
    if (btn) btn.textContent = S.tab;
    var sm = $('ems-sub-main'); if (sm) sm.textContent = S.subMain;
    var sc = $('ems-sub-cmp'); if (sc) sc.textContent = S.cmpTab;
    var sub = $('ems-sub'); if (sub) sub.addEventListener('click', onSubClick);
    ['ems-view-main', 'ems-view-plan', 'ems-view-devices', 'ems-view-cmp'].forEach(function (id) {
      var host = $(id);
      if (host) { host.addEventListener('click', onClick); host.addEventListener('change', onChange); }
    });
    return Promise.all([
      load(),
      api('GET', '/ems/devices').then(function (r) { state.devices = r.devices || []; }).catch(function () { state.devices = []; }),
      api('GET', '/ems/flows').then(function (r) { state.flows = (r && r.flows) || []; }).catch(function () { state.flows = []; }),
    ]).then(function () { render(); renderCompare(); startTimer(); })
      .catch(function (e) {
        var m = $('ems-view-main');
        if (m) m.innerHTML = '<p class="warn">' + esc(S.error + ': ' + (e && e.message || e)) + '</p>';
      });
  }

  window.EmsUi = { init: init, _collect: collect, _state: state, _render: render, _sync: sync, _save: save };
})();
