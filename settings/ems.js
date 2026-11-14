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
      previewOn: 'Ansicht ohne Energiemanagement testen', previewBanner: 'Vorschau: so sieht die App ohne Energiemanagement aus (nur in diesem Browser, nichts wird geändert).', previewOff: 'Vorschau beenden',
      noDevice: 'Das Energiemanagement ist noch nicht eingerichtet. Füge in Homey unter «Geräte» → «+» → «Dynamischer Stromtarif CH» das Gerät «Energiemanagement» hinzu.',
      devicesSec: 'Energiemanagement einrichten', sources: 'DATENQUELLEN', consumers: 'VERBRAUCHER',
      stOff: 'Ausgeschaltet', stTest: 'Läuft, aber noch kein Gerät ist zum Steuern freigegeben', stLive: 'Läuft und steuert',
      stWarn: 'Läuft mit Warnung', switchHint: 'Schalter ein: das Energiemanagement steuert dieses Gerät. Aus: es lässt das Gerät in Ruhe. Solange der Silent-Modus an ist, wird nur simuliert.',
      pvLbl: 'PV', gridLbl: 'Netz', batLbl: 'Batterie',
      noConsumers: 'Noch kein Verbraucher eingetragen.',
      plan: 'PLAN', planToday: 'Heute', planTomorrow: 'Morgen', planPrice: 'Preis in Rp./kWh', planPv: 'Solar-Prognose', planNow: 'jetzt',
      planBlock: 'Günstigster Block (2 h)', planBlockNow: 'Günstigster Block ab jetzt (2 h)', planPvKwh: 'Solar erwartet', planPriceRange: 'Preis min bis max', planNoPrices: 'Für diesen Tag sind noch keine Preise da.',
      planBat: 'Batterie (Plan)', planBatAdvice: 'Empfehlung, wird nicht gesteuert', planBatLive: 'gesteuert', planWallbox: 'Wallbox (Verlauf)', planWallboxCar: 'Wallbox und E-Auto (Verlauf und Plan)', planChError: 'Fehler', planTo: 'bis', planPeak: 'Spitze', planTest: 'simuliert', planPlanned: 'geplant',
      planCheap: 'günstig', planNormal: 'normal', planExp: 'teuer', planBatCharge: 'Netzladen', planBatHold: 'Halten (Entladung gesperrt)', planBatNormal: 'Normal', planOn: 'ein',
      planNote: 'Die Batterie zeigt den Plan des Planers (alle 15 Minuten neu gerechnet, nur zum Vergleich). Wallbox und Verbraucher regeln nach dem aktuellen Überschuss: hier siehst du, was sie getan haben. Im Silent-Modus ist es die Simulation.',
      planDayTitle: 'Plan-Tag',
      carCal: 'Wochenvorlage (Mo bis So)', carCalHint: 'Gilt jede Woche. Ein Eintrag für «Heute» oder «Morgen» oben übersteuert den Tag. Änderungen werden sofort gespeichert.', carCalSaving: 'speichert ...', carCalSaved: 'gespeichert', carCalSave: 'Vorlage speichern', carCalReset: 'Verwerfen', carSetupHint: 'Ziele, «Heute/Morgen» und die Wochenvorlage stellst du unter «Ausblick» ein.',
      carDays: { mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa', sun: 'So' }, carTime: 'Abfahrt', carSoc: 'Ziel %',
      carHoliday: 'Ferien: keine Ladeziele (Solar lädt weiter)', carHolidayOn: 'Ferien', carHolidayUntilShort: 'bis', carHolidayOpen: 'bis ausgeschaltet', carHolidayUntil: 'bis und mit (leer = bis ausgeschaltet)', carGrid: 'Netz nachladen, wenn die Sonne bis zur Abfahrt nicht reicht', carGridHint: 'Ein: die App lädt in den günstigsten Viertelstunden bis zur Abfahrt. Aus: nur Solarstrom.',
      carCard: 'E-AUTO', carNext: 'Nächstes Ziel', carNone: 'kein Ziel geplant', carFromCal: 'Vorlage', carFromOverride: 'übersteuert',
      carSt: { none: 'Kein Ziel', no_soc: 'Ladestand unbekannt', no_capacity: 'Batteriegrösse fehlt (Einrichten → E-Auto)', reached: 'Ziel erreicht', solar_only: 'Nur Solarstrom', planned: 'Geplant', short: 'Reicht nicht ganz bis zur Abfahrt' },
      carNotConnected: 'nicht angesteckt', carBadgeCharging: 'lädt', carBadgePlugged: 'angesteckt', carBadgeReached: 'Ziel erreicht', carOverride: 'Heute oder morgen anders (übersteuert die Vorlage)', carToday: 'Heute', carTomorrow: 'Morgen', carCharge: 'laden',
      carApply: 'Übernehmen', carClear: 'Vorlage gilt wieder', carSaved: 'Gespeichert',
      silent: 'Silent-Modus: nur simulieren', silentHint: 'Ein: es wird nichts geschaltet. Protokoll und Ausblick zeigen, was passieren würde. Aus: die Geräte mit eingeschaltetem Schalter werden wirklich gesteuert.',
      stSilent: 'Silent-Modus: es wird nur simuliert', silentTag: 'Silent',
      batCtl: 'Batterie steuern', batCtlOn: 'Batterie über das Energiemanagement steuern', batCtlFound: 'Vorlage für dieses Gerät erkannt: Laden, Halten und Normal über die Karten der Batterie.',
      batCtlNone: 'Für dieses Gerät gibt es keine fertige Vorlage. Ordne unten selbst zu, welche Karten der Batterie bei Laden, Halten und Normal laufen.', batCtlNoCards: 'Das Gerät bietet keine Aktionskarten. Die Batterie kann nicht gesteuert werden.',
      batCtlMap: 'Zuordnung', batCtlMapAuto: 'erkannte Vorlage', batCtlMapCustom: 'eigene Zuordnung', batCtlAddStep: 'Karte hinzufügen', batCtlPick: '- Karte wählen -', batCtlDel: 'Entfernen',
      batCtlPh: 'In Zahlenfeldern gehen auch Platzhalter: {power} = Ladeleistung (W), {target_soc} = Ziel-Ladestand (%), {normal_discharge} = normale Entladeleistung (W).', batCtlEmpty: 'keine Karte (es wird nichts gesendet)', batCtlLoading: 'Karten der Batterie werden geprüft ...',
      batCtlWarn: 'Nur ein System darf die Batterie steuern. Schalte die Batteriesteuerung im anderen Energiemanagement und eigene Batterie-Flows aus, bevor du live schaltest.',
      bpMode: 'Spitzenstunden', bpModeAuto: 'automatisch (Fahrplan)', bpModeFixed: 'feste Anzahl Stunden',
      bpModeAutoHint: 'Der Fahrplan gibt die Ladung in die teuersten Viertelstunden bis zum nächsten Nachladen (nachts günstig aus dem Netz oder tagsüber von der Sonne) und lädt nur nach, wenn es sich trotz Verlust lohnt. Wie viele Stunden das sind, ergibt sich aus Ladung und Verbrauch.',
      schText: 'Fahrplan: lädt {kwh} kWh um {from} bis {to} (Schnitt {cp} Rp.), gibt {dkwh} kWh in die teuersten Viertelstunden ab (Schnitt {dp} Rp.). Nutzen ca. {chf} CHF.', schNoCharge: 'Fahrplan: kein Netzladen nötig, die Ladung ({dkwh} kWh) geht in die teuersten Viertelstunden (Schnitt {dp} Rp.).', schNothing: 'Fahrplan: zurzeit nichts zu tun.',
      ldTitle: 'KOSTEN DER ENTSCHEIDE (MODELL)', ldIntro: 'Was die Batterie-Entscheide gekostet hätten: zwei virtuelle Batterien mit dem echten Hausverbrauch, Solarstrom und den echten Preisen, eine nach diesem EMS, eine nach dem anderen. Jeder Tag startet beim echten Ladestand; übrige Ladung zählt zum Tagesdurchschnittspreis. Tiefer ist besser.',
      ldMine: 'Dieses EMS', ldOther: 'Anderes EMS', ldNone: 'Ohne Batterie', ldDiff: 'Differenz', ldToday: 'heute bisher', ldTotal: 'Summe', ldNone2: 'Noch keine Daten, die Auswertung startet mit dem nächsten Batterie-Lauf.',
      bpTitle: 'Planung', bpReserve: 'Spitzenstunden mit der Batterie abdecken (h)', bpReserveHint: 'In den so vielen teuersten Stunden der nächsten 24 Stunden gibt die Batterie Strom ab, sonst hält sie die Ladung zurück.',
      bpSolar: 'Kein Netzladen ab Sonne (kWh)', bpSolarHint: 'Bringt die Sonne in den nächsten 24 Stunden mindestens so viel, wird nicht aus dem Netz geladen (0 = immer laden).',
      bpBridge: 'Morgen überbrücken', bpBridgeHint: 'Auch bei viel Sonne so viel nachladen, wie die teuren Stunden bis zum Solarertrag brauchen.', bpLoad: 'Verbrauch bis die Sonne übernimmt', bpLoadSchedule: 'Hausverbrauch', bpDay1: '1 Tag', bpDays: '{n} Tage', bpEvening: 'abends {kw} kW', bpLoadAuto: 'automatisch (gelernt)', bpLoadFixed: 'fester Wert (kW)', bpFloor: 'Batterie nicht tiefer als (%)',
      backupTitle: 'Notstrom-Reserve', backupSoc: 'Reserve (%)',
      backupHint: 'Hält mindestens diesen Ladestand, lädt dafür notfalls aus dem Netz nach - egal zu welchem Preis. Ein- oder ausschalten über den Schalter bei «Heute» oder per Flow, nie automatisch.',
      backupActive: 'Aktiv: hält mind. {soc} %, lädt notfalls nach',
      backupRow: 'Notstrom-Reserve', backupRowOn: 'Aktiv - hält mind. {soc} %', backupRowOff: 'Aus',
      bpLearned: 'Gelernt: {kw} kW am Morgen (Schnitt 05 bis 10 Uhr, {days}). Das EMS misst den Hausverbrauch laufend und merkt sich den Durchschnitt jeder Viertelstunde der letzten 7 Tage. Ein kalter Morgen mit Wärmepumpe zählt so automatisch mehr als ein milder.',
      bpLearning: 'Lernt noch: es gibt noch keine Messungen. Bis dahin rechnet es mit {kw} kW.',
      brTitle: 'Morgen überbrücken', brCharge: 'lädt {kwh} kWh bis {soc} % um {at}. Grund: teuer {from} bis {to}, die Sonne übernimmt ab {sun}. Bedarf {need} kWh ({load} kW {how}), vorhanden {have} kWh.',
      brEnough: 'nicht nötig, die Ladung reicht (Bedarf {need} kWh für {from} bis {to}, vorhanden {have} kWh).', brUnprofitable: 'lohnt sich nicht: Laden wäre mit dem Verlust teurer als die teuren Stunden ({from} bis {to}).',
      brNoGap: 'nicht nötig, vor der Sonne (ab {sun}) gibt es keine teuren Stunden.', brNoSun: 'keine Sonne in Sicht.', brOff: 'zurzeit nicht nötig: die Solar-Grenze greift nicht, es wird normal aus dem Netz geladen.', brHowLearned: 'gelernt', brHowFixed: 'fest',
      batCtlPower: 'Ladeleistung beim Netzladen (kW)', batCtlTarget: 'Ziel-Ladestand beim Netzladen (%)', batCtlNormal: 'Normale Entladeleistung (W)', batCtlRepeat: 'Befehl wiederholen alle (min)',
      batCtlSteps: 'So wird gesteuert', batModeCharge: 'Laden', batModeHold: 'Halten', batModeNormal: 'Normal', batCarSkip: 'nicht, solange das Auto lädt',
      batRow: 'Batterie', batRowNone: 'noch nichts gesendet', batSent: 'zuletzt',
      logTitle: 'PROTOKOLL', logNone: 'Noch keine Einträge.', logAll: 'Alle', logCar: 'E-Auto', logWallbox: 'Wallbox', logBat: 'Batterie', logCons: 'Verbraucher', logFuse: 'Hausanschluss', logMore: 'Mehr anzeigen', logLess: 'Weniger anzeigen', logToday: 'Heute', logYesterday: 'Gestern',
      secCar: 'E-AUTO', secWallbox: 'WALLBOX', secBat: 'HAUSBATTERIE',
      carWaiting: 'Daten folgen mit dem nächsten Lauf', autoCharge: 'Automatisch laden', autoChargeOff: 'Aus: die Wallbox läuft wie bisher (eigene App oder Flows)', autoChargeNoCar: 'Kein Auto angesteckt',
      cnLimit: 'Grenze', cnNone: 'bis zum Abstecken', cnNoneManual: 'bis ausgeschaltet', cnSoc: 'bis Ladestand (%)', cnKwh: 'bis Energie (kWh)', cnUntil: 'bis', cnNow: 'jetzt', cnLoaded: 'geladen', cnHint: 'Sofort laden lädt mit voller Leistung, egal zu welchem Preis, und geht bei der Grenze von selbst aus.',
      logCmdOnly: 'nur Schaltungen', logAllSim: 'Silent-Modus: alle Einträge sind simuliert.', logOnWord: 'ein', logOffWord: 'aus', logStartWord: 'gestartet', logTestTag: 'simuliert',
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
      prioRow: 'Priorität (Reihenfolge bei Überschuss)', prioUp: 'nach oben', prioDown: 'nach unten', prioTag: 'Priorität {n}', prioWhy: 'Bei «Bei Überschuss»: Der Verbraucher weiter oben startet zuerst und geht zuletzt aus. Es startet immer nur einer pro Messung, damit der Überschuss nicht doppelt verplant wird. Die Reihenfolge wird mit «Speichern» übernommen.', suggestedTag: 'Vorschlag', suggest: 'Automatisch vorschlagen', suggested: 'Vorschläge eingetragen:', nothingSuggested: 'Nichts Passendes gefunden',
      tagRequired: 'Pflicht', tagRecommended: 'Empfohlen', tagOptional: 'Optional', tagAuto: 'Automatisch',
      notChosen: 'nicht gewählt', device: 'Gerät', value: 'Wert', pick: '- Gerät wählen -', none: '- keines -', pickFirst: '- zuerst Gerät wählen -',
      fuseTitle: 'HAUSANSCHLUSS', fuseRow: 'Hausanschluss-Schutz', fuseOff: 'aus', fuseOn: 'Hausanschluss schützen',
      fuseWhy: 'Hält jede Phase unter der Grenze der Hausanschluss-Sicherung: zuerst wird die Wallbox gedrosselt, reicht das nicht, werden die Geräte unten der Reihe nach ausgeschaltet.',
      fuseAmps: 'Sicherung (A)', fuseReserve: 'Reserve (% der Sicherung)', fuseLimitLbl: 'Grenze', fusePerPhase: 'pro Phase', fuseMeter: 'Zähler mit Phasenströmen', fuseMeterGrid: 'wie Netzzähler', fusePhase: 'Phase',
      fuseThrottle: 'Wallbox drosseln, damit keine Phase über die Grenze geht', fuseThrottleHint: 'Die Wallbox bekommt höchstens den Strom, der auf der knappsten Phase noch frei ist. Gilt, wenn das Energiemanagement die Wallbox steuert.',
      fuseHold: 'Wartezeit vor dem Ausschalten (s)', fuseRestore: 'Freigabe nach (min unter der Grenze)', fuseShedTitle: 'BEI ÜBERLAST DER REIHE NACH AUSSCHALTEN', fuseShedNone: 'Keine Geräte gewählt.', fuseAdd: 'Hinzufügen', fuseAddPick: '- Gerät oder Flow wählen -',
      fuseHowTitle: 'Wie ausschalten?', fuseAutoLbl: 'Automatisch', fuseAutoOnoff: 'Automatisch erkannt: Ein/Aus-Capability.', fuseAutoThermostat: 'Automatisch erkannt: Thermostat-Modus auf «Aus».', fuseAutoNone: 'Keine passende Capability erkannt - bitte einen Flow wählen.', fuseAutoCharger: 'Automatisch: Ladevorgang wird gestoppt.',
      fuseUp: 'nach oben', fuseDel: 'Entfernen', fuseFlow: 'Flow', fuseLive: 'Schutz live (sonst nur simulieren)', fuseLiveHint: 'Live schaltet der Schutz die gewählten Geräte wirklich aus. Der Silent-Modus hat Vorrang. Vorher die entsprechenden Zweige in eigenen Flows ausschalten, damit nur ein System schaltet.',
            tgtSource: 'Zieltemperatur', tgtManual: 'Fest eingestellt', tgtDevice: 'Aus der Wärmepumpe (WW-Soll)', tgtDev: 'Gerät und Wert (WW-Soll der Wärmepumpe)', tgtTol: 'Toleranz unter WW-Soll (K)', tgtHyst: 'Hysterese der Wärmepumpe (K, optional)',
      tgtHystH: 'Die Wärmepumpe schaltet das Warmwasser erst bei WW-Soll PLUS Hysterese ab (Parameter «Hysterese», P32 unter Warmwasser/Parameter). Dieser Wert ist per Modbus nicht lesbar: hier von Hand eintragen. 0 = nicht berücksichtigen.',
      tgtSrcH: 'Die Wärmepumpe heizt selbst nur bis zu ihrem WW-Soll (plus Hysterese) und schaltet dann ab. Ein festes Ziel darüber wird nie erreicht. «Aus der Wärmepumpe» beendet bei WW-Soll plus Hysterese minus Toleranz. Über ca. 50 °C springt der Heizstab an.',
      tgtTolH: 'Beendet, sobald das Warmwasser den WW-Soll minus diese Toleranz erreicht (der Fühler hinkt etwas nach).', tgtFallback: 'Ersatz-Ziel, falls der WW-Soll nicht lesbar ist (°C)', tgtFallbackH: 'Gilt nur, wenn der Wert der Wärmepumpe gerade nicht gelesen werden kann.',
      dhwModeProgram: 'Betriebsart während des Programms (z. B. Warmwasser)', dhwModeProgramH: 'Wert der Betriebsart, solange das Programm läuft. Ohne ihn würde die Prüfung unser eigenes Umschalten sofort abbrechen. Im Warmwasserbetrieb ist die Heizung aus, danach muss es zurück auf Automatik.',
      dhwMaxRun: 'Höchstdauer (Min.)', dhwMaxRunH: 'Sicherheitsgrenze: danach wird zurück auf Normal gesetzt (der Warmwasserbetrieb schaltet die Heizung ab). 0 = unbegrenzt.',
      dhwTitle: 'WARMWASSER-PROGRAMM BEI GÜNSTIGEM PREIS', dhwRow: 'Warmwasser-Programm', dhwOff: 'aus', dhwRunning: 'läuft', dhwWaiting: 'wartet',
      dhwOnLbl: 'Warmwasser-Programm bei günstigem Preis starten', dhwWhy: 'Unabhängig von SG-Ready: liegt die Zeit in den günstigsten Stunden des Tages und das Warmwasser unter dem Mindestwert, startet das Warmwasser-Programm der Wärmepumpe (Flow oder App-Funktion) und danach wieder zurück auf Normal. Läuft SG-Ready, startet das Programm nicht (und umgekehrt).',
      dhwCheapHours: 'Günstigste Stunden pro Tag (h)', dhwCheapH: 'Das Programm startet in den günstigsten N Stunden des Tages (nach den Viertelstunden-Preisen von heute). Die Vorschau zeigt, wann das heute und morgen wäre.',
      dhwPreview: 'Vorschau', dhwToday: 'Heute', dhwTomorrow: 'Morgen', dhwAvg: 'Ø', dhwNoPrices: 'Vorschau: noch keine Preise für heute.',
      dhwBelow: 'Nur starten unter Warmwasser (°C)', dhwBelowH: 'Nur wenn das Warmwasser unter diesem Wert liegt (0 = immer). Ohne Temperatur-Messwert startet es nicht.',
      dhwSkipPv: 'Nicht starten, wenn die Sonne reicht', dhwSkipPvKwh: 'Sonne reicht ab Prognose (kWh, Rest heute)', dhwSkipUntil: 'Sonnenprognose zählt bis', dhwSkipPvH: 'Lohnt sich nicht, per Preis zu starten, wenn die Sonne heute noch genug liefert (Rest-Prognose).', dhwSkipUntilH: 'Bis zu dieser Uhrzeit zählt die Sonnenprognose, danach darf der Preis starten.',
      dhwTarget: 'Beenden ab Warmwasser (°C)', dhwTargetH: 'Erreicht das Warmwasser diese Temperatur, wird zurück auf Normal gesetzt. Der eigentliche Zielwert steht in der Wärmepumpe selbst.', dhwMinRunH: 'Einmal gestartet läuft das Programm mindestens so lange. Nur Zieltemperatur, Betriebsart oder Sonne (SG-Ready) beenden früher.',
      dhwLive: 'Warmwasser-Programm live (sonst nur simulieren)', dhwLiveHint: 'Live startet es das Programm wirklich. Der Silent-Modus hat Vorrang. Vorher einen bestehenden Flow dafür ausschalten, damit nur ein System schaltet.',
      sgTitle: 'BOILER / WÄRMEPUMPE (SG-READY)', sgRow: 'SG-Ready-Steuerung', sgOff: 'aus', sgOn: 'SG-Ready steuern', sgWhy: 'Schaltet die Einschaltempfehlung (0:1) der Wärmepumpe, wenn die Sonne oder ein voller Akku das Warmwasser bezahlen. Normalbetrieb (0:0) ist der Ausgangszustand. Den günstigen Preis gibt es separat im Bereich darunter.',
      sgBasis: 'Steuerungsbasis', sgBasisPv: 'Solarleistung (PV-Produktion)', sgBasisExport: 'Netzeinspeisung', sgBasisH: 'Solarleistung = was die PV produziert (sinnvoll mit Hausakku, der den Überschuss sonst schluckt). Netzeinspeisung = was ins Netz fliesst.',
      sgMinSolar: 'Mindest-Solarleistung für Start (W)', sgMinSolarH: 'Ab dieser Leistung darf der Boost starten.',
      sgMinSoc: 'Mindest-Hausakku für Start (%)', sgMinSocH: 'Der Hausakku muss mindestens so voll sein, bevor die Wärmepumpe den Strom bekommt. Ohne Akku egal.',
      sgHyst: 'Akku-Toleranz beim Halten (%)', sgHystH: 'Nach der Mindestlaufzeit darf der Akku so viele Prozent unter die Startschwelle fallen, ohne dass der Boost endet (fängt kurze Wolken ab).',
      sgTemp: 'Boost beenden ab Warmwasser (°C)', sgTempH: 'Erreicht das Warmwasser diese Temperatur, geht die Steuerung zurück auf Normalbetrieb. Der eigentliche Zielwert steht in der Wärmepumpe selbst (nicht lesbar).',
      sgTo: 'Späteste Startzeit (Sonne)', sgToH: 'Nach dieser Uhrzeit startet kein neuer Boost mehr wegen Sonne. Der Preis-Auslöser gilt unabhängig davon.',
      sgStartDelay: 'Einschaltverzögerung (Min.)', sgStartDelayH: 'So lange müssen die Startbedingungen am Stück erfüllt sein, bevor der Boost startet (verhindert Schalten bei kurzen Sonnenspitzen).',
      sgMinRun: 'Mindestlaufzeit (Min.)', sgMinRunH: 'Einmal gestartet läuft der Boost mindestens so lange, auch bei Wolken. Nur Zieltemperatur oder Betriebsart beenden früher.',
      sgStopDelay: 'Ausschaltverzögerung (Min.)', sgStopDelayH: 'Fallen die Bedingungen nach der Mindestlaufzeit weg, wird noch so lange gewartet, bevor zurück auf Normalbetrieb geschaltet wird.',
      sgCooldown: 'Abkühlpause nach Ende (Min.)', sgCooldownH: 'Pause nach dem Ende eines Boosts, bevor ein neuer starten darf.',
      sgUsePrice: 'Günstigen Strompreis als zweiten Auslöser nutzen', sgMaxPrice: 'Höchster Preis (Rp./kWh)', sgPriceH: 'Startet den Boost auch bei günstigem Preis, unabhängig von Sonne und Uhrzeit.',
      sgPriceAct: 'Was startet der Preis?', sgActSg: 'SG-Ready-Empfehlung (wie bei Sonne)', sgActDhw: 'Nur das Warmwasser-Programm der Wärmepumpe', sgActH: 'Beim Preis kann statt SG-Ready nur das Warmwasser-Programm gestartet werden (ein) und danach wieder auf Normal gesetzt werden (aus). Sonne startet immer SG-Ready.', sgDhwOut: 'Warmwasser-Programm setzen über', sgDhwFlows: 'Flows (ein / zurück auf Normal, z. B. WW-Soll per Modbus)', sgDhwCap: 'App-Funktion (Capability eines Geräts)', sgDhwOn: 'Flow Warmwasser-Programm ein', sgDhwOff: 'Flow zurück auf Normal', sgDhwDev: 'Gerät und Capability der App-Funktion', sgDhwOnV: 'Wert für ein', sgDhwOffV: 'Wert für zurück auf Normal', sgDhwH: 'Werte als Text, true/false für Schalter. Beim Ende wird zurück auf Normal gesetzt, aber nur, wenn die Steuerung das Programm selbst gestartet hat.',
      sgPriceBelow: 'Preis-Start nur unter Warmwasser (°C)', sgPriceBelowH: 'Per Preis wird nur geheizt, wenn das Warmwasser unter diesem Wert liegt (0 = immer). Ohne Temperatur-Messwert kein Preis-Start.',
      sgPvBelow: 'Sonnen-Start nur unter Warmwasser (°C)', sgPvBelowH: 'Optional: auch mit Sonne nur starten, wenn das Warmwasser unter diesem Wert liegt (0 = immer, Standard).',
      sgSkipPv: 'Preis-Start auslassen, wenn die Sonne reicht', sgSkipPvKwh: 'Sonne reicht ab Prognose (kWh, Rest heute)', sgSkipPvH: 'Lohnt sich nicht, per Preis zu starten, wenn die Sonne heute noch genug liefert. Gilt nur, solange der Sonnen-Start noch offen ist (vor der spätesten Startzeit).',
      sgForced: 'Zwangsladung (1:1) erlauben', sgForcedW: 'Schwelle Zwangsladung (W)', sgForcedH: 'Zustand 1:1, oft mit Heizstab und viel Strom. Nur aus dem Boost heraus und erst ab dieser Solarleistung. Standard aus.',
      sgSensor: 'Warmwasser-Temperatur (Gerät und Wert)', sgSensorH: 'Messwert «WW IST» der Wärmepumpe, damit der Boost bei der Zieltemperatur endet.',
      sgMode: 'Betriebsart der Wärmepumpe (Gerät und Wert, optional)', sgModeOk: 'Steuern nur bei diesem Wert (z. B. Automatik)', sgModeH: 'Die Steuerung greift nur ein, wenn die Betriebsart diesen Wert hat. Bei Ferien, Komfort oder Standby wird nicht gesteuert. Leer lassen = keine Prüfung.',
      sgFeedback: 'Zustand von der Wärmepumpe übernehmen (Gerät und Wert, optional)', sgFeedbackH: 'Liest den SG-Ready-Zustand der Wärmepumpe (z. B. «2 NORMAL»), zeigt ihn im Widget und warnt, wenn er nach dem Schalten nicht passt. Leer = nur der eigene Zustand.',
      sgOutput: 'Wie werden die Zustände gesetzt?', sgOutRelays: 'Zwei Relais (z. B. 2 Shellys)', sgOutFlows: 'Flows (je Zustand ein Flow, z. B. Modbus)',
      sgOutH: 'Relais: Normal = beide aus, Empfehlung (0:1) = Relais 1 an, Zwangsladung (1:1) = beide an. Flows: ein eigener Flow je Zustand, z. B. Modbus-Register schreiben.',
      sgRecRelay: 'Relais Empfehlung (0:1)', sgForceRelay: 'Relais Zwangsladung (nur bei 1:1)', sgFlowNormal: 'Flow Normalbetrieb (0:0)', sgFlowBoost: 'Flow Empfehlung (0:1)', sgFlowForced: 'Flow Zwangsladung (1:1)',
      sgLive: 'SG-Ready live (sonst nur simulieren)',
      sgLiveHint: 'Live schaltet die Steuerung wirklich. Der Silent-Modus hat Vorrang. Vorher den bisherigen Flow ausschalten, damit nur ein System schaltet.', sgState: { off: 'Normalbetrieb (0:0)', boost: 'Empfehlung (0:1)', forced: 'Zwangsladung (1:1)', dhw: 'Warmwasser-Programm' },
      tips: {
        mode: 'Wann das Gerät läuft: bei Überschuss, voller Batterie, ab einem Ladestand oder als Programm mit einem Start.',
        fullSoc: 'Einschalten, sobald der Hausakku mindestens so voll ist.',
        socOn: 'Einschalten, sobald der Hausakku mindestens diesen Ladestand hat.',
        hysteresis: 'Ausgeschaltet wird erst, wenn der Ladestand so viele Prozentpunkte unter die Einschaltschwelle fällt.',
        minSurplusW: 'So viel Strom muss ins Netz fliessen, bevor das Gerät einschaltet.',
        startSustainS: 'So lange muss der Überschuss am Stück anliegen, damit kurze Spitzen nicht schalten.',
        stopGraceS: 'So lange darf der Überschuss fehlen, bevor es ausgeht (fängt kurze Wolken ab).',
        assumedW: 'Was das Gerät verbraucht. Per Flow lässt es sich nicht messen, die App rechnet mit diesem Wert.',
        minRunMin: 'Nach dem Einschalten läuft es mindestens so lange, auch wenn der Überschuss wegfällt.',
        minOffMin: 'Nach dem Ausschalten bleibt es mindestens so lange aus (Schutz vor ständigem Schalten).',
        protectSoc: 'Fällt der Hausakku unter diesen Wert, geht das Gerät sofort aus, auch in der Mindestlaufzeit.',
        useGate: 'Bei schwacher Sonnenprognose keine neuen Starts, damit der Akku für den Abend Ladung behält.',
        pgSurplus: 'Ab so viel Einspeisung startet das Programm sofort.',
        pgSustain: 'So lange muss dieser Überschuss am Stück anliegen.',
        pgFrom: 'Ab dieser Uhrzeit wird der günstigste Moment gesucht, falls vorher kein Überschuss kam.',
        pgWait: 'Am Ende dieses Zeitfensters wird spätestens gestartet. Solche Zeitplan-Starts gibt es höchstens einmal pro Tag.',
        pgDuration: 'Übliche Laufzeit. So lange nach einem Start startet die Automatik nicht nochmals.',
        pgStartVal: 'Dieser Wert wird an die Start-Capability gesendet (z. B. START).',
        pgRemoteVal: 'Nur wenn die Fernbedienung diesen Wert meldet, darf gestartet werden.',
        pgDoorVal: 'Nur bei diesem Türwert (geschlossen) wird gestartet.',
        'bp-reserve': 'Für so viele der teuersten Stunden des Tages hält die Batterie Reserve, statt vorher leer zu werden.',
        'bp-solar': 'Ab dieser erwarteten Solarmenge (kWh heute) wird nicht aus dem Netz nachgeladen.',
        'bp-bridge': 'Lädt bei Bedarf aus dem Netz nach, damit die Batterie bis zum Sonnenaufgang reicht.',
        'bp-floor': 'Unter diesem Ladestand wird die Batterie nicht mehr entladen.',
        'bp-backupsoc': 'So viel bleibt im Akku, wenn die Notstrom-Reserve eingeschaltet ist.',
        'fuse-pct': 'Anteil der Sicherung, den wir ausnutzen. Der Rest bleibt als Sicherheitsreserve.',
        'fuse-hold': 'So lange muss eine Überlast anhalten, bevor etwas abgeschaltet wird.',
        'fuse-restore': 'So lange muss alles unter der Grenze liegen, bevor die Wallbox wieder laden darf.',
        'pv-factor': 'Skaliert die PV-Prognose hoch oder runter, wenn sie bei dir meist zu hoch oder zu tief liegt.',
      },
      fuseNoRestore: 'Ausgeschaltete Geräte schaltet die App nicht wieder ein. Die Wallbox darf nach der Freigabe wieder laden.', fuseNoPhases: 'Der Zähler liefert keine Phasenströme. Bitte Zähler und Werte prüfen.',
      fuseNow: 'Hausanschluss', fuseOf: 'von', fuseLoad: 'Belastung', fuseThrottled: 'Wallbox auf', fuseShedNow: 'aus:', fuseEvOver: 'Grenze überschritten', fuseEvShed: 'ausgeschaltet', fuseEvThrottle: 'Wallbox gedrosselt auf', fuseEvThrottleEnd: 'Wallbox nicht mehr gedrosselt', fuseEvRelease: 'freigegeben',
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
      modeFull: 'Bei voller Batterie', modeSoc: 'Ab Batterie-SoC', modeSurplus: 'Bei Überschuss', modeProgram: 'Programm starten', noCtrl: 'nur Kostenzähler',
      programTitle: 'Programm starten', programWindow: 'Zeitfenster ab', programMaxWait: 'Max. Wartezeit (h)', programDuration: 'Programmdauer (h)',
      programHint: 'Startet sofort bei genug PV-Überschuss. Sonst wird im Zeitfenster der günstigste Moment gewählt, spätestens am Ende gestartet (Preis-Sicherheitsnetz). Höchstens einmal pro Tag.',
      programStartCap: 'Start-Capability', programStartVal: 'Start-Wert', programRemoteCap: 'Fernbedienung-Capability', programRemoteVal: 'Fernbedienung-Wert (wenn aktiv)',
      programRemoteWarn: 'Ohne Fernbedienung-Capability wird nicht geprüft, ob das Gerät überhaupt geschaltet werden kann - bei manchen Geräten (z. B. Electrolux) zwingend nötig.',
      programDoorCap: 'Tür-Capability (optional)', programDoorVal: 'Tür-Wert «zu» (wenn gewählt)',
      programStateCap: 'Status-Capability (optional)', programStateVal: 'Status-Wert «bereit/leer» (wenn gewählt)',
      programStateHint: 'Verhindert einen zweiten Start-Befehl, während das Gerät noch läuft (egal ob von Hand oder von uns gestartet) - welche Capability und welcher Wert «bereit» bedeutet, ist je Gerät anders. Leer lassen, wenn das Gerät so etwas nicht hat.',
      fullSoc: 'Voll ab SoC (%)', socOn: 'Ein ab SoC (%)', hysteresis: 'Aus unter (Prozentpunkte darunter)',
      batFirst: 'Hausbatterie zuerst bis (%)', batFirstPh: 'wie Wallbox', batFirstHint: 'Leer: wie die Wallbox (Hausbatterie hat Vorrang bis zur gemeinsamen Grenze). Eine Zahl: eigene Grenze; darüber nimmt der Verbraucher auch den Strom, der gerade in die Hausbatterie fliesst. Für kleine Verbraucher (eBike) z. B. 0.',
      minSurplus: 'Mindest-Überschuss (W)', startSustain: 'Überschuss muss anhalten (s)', stopGrace: 'Karenz vor dem Ausschalten (s)',
      advanced: 'Erweitert', minRun: 'Mindestlaufzeit (min)', minOff: 'Mindest-Pause (min)', protect: 'Schutz-SoC: darunter sofort aus (%)', useGate: 'Prognose-Sperre beachten',
      shareAt: 'Batterie ab (%)', shareGets: 'Anteil Solarstrom (%)', shareLowRow: 'Untere Grenze: ab hier bekommt das Auto Solarstrom', shareHighRow: 'Obere Grenze: ab hier bekommt es den vollen Überschuss', shareChartCap: 'So viel vom Solarstrom bekommt das Auto je Batteriestand', shareNow: 'Jetzt: Batterie {soc} % → das Auto bekommt {pct} % des Solarstroms.', shareBonusTitle: 'Prognose-Bonus', shareVal: 'Solaranteil Auto {pct} %', wbLinkTitle: 'Anschluss der Wallbox (wie sie angesprochen wird)', wbLinkWhy: 'Der Standard passt für Wallboxen mit den Karten «Laden starten» und «Ladeleistung setzen». Bei einer anderen Wallbox hier wählen, was das Gerät liest und welche Flow-Karten es zum Steuern hat. Die Leistung wird aus Ampere, Phasen und 230 V berechnet und in Watt an die Karte «Ladeleistung setzen» übergeben (Stopp = 0 W).', wbState: 'Ladezustand (Capability)', wbPower: 'Ladeleistung (Capability)', wbPhase: 'Phasen (Capability, optional)', wbPhaseH: 'Nur für die Phasenumschaltung. Erwartete Werte: 1 = eine Phase, 2 = drei Phasen.', wbStartCard: 'Karte «Laden starten» (optional)', wbPowerCard: 'Karte «Ladeleistung setzen»', wbPowerArg: 'Argument für die Leistung (W)', wbNone: '– keine –', wbStd: 'Standard', wbCustom: 'Eigene Zuordnung', wbCardMissing: 'Karte fehlt', wbCardsLoading: 'Karten des Geräts werden geladen …', wbNoPowerCard: 'Die gewählte Karte «Ladeleistung setzen» gibt es an diesem Gerät nicht. Die Wallbox kann so nicht geregelt werden.', pvAccTitle: 'Empfehlung aus den letzten Tagen', pvAccNone: 'Noch zu wenig Daten: {n} von mindestens {m} vollständigen Tagen. Die App hält jeden Morgen die Prognose des Tages fest und vergleicht sie am Abend mit der gemessenen Produktion.', pvAccRec: 'Empfehlung: {f} (Median aus {n} Tagen, meist zwischen {lo} und {hi}).', pvAccRecent: 'Nur die letzten {n} Tage: {f}.', pvApply: 'Übernehmen', pvAuto: 'Korrekturfaktor automatisch', pvAutoH: 'Ab 7 vollständigen Tagen trägt die App den empfohlenen Wert einmal am Tag selbst in das Feld ein. Das Feld zeigt dann den aktuellen Wert.', pvAccLog: 'Verlauf der letzten Tage', pvAccDay: 'Tag', pvAccFc: 'Prognose ohne Faktor (kWh)', pvAccAct: 'Gemessen (kWh)', pvAccRatio: 'Verhältnis', pvAccToday: 'heute', pvAccNote: 'Es zählen nur vollständige Tage mit mindestens 2 kWh Prognose. Das Verhältnis ist gemessen geteilt durch die Prognose ohne Faktor.', dlyTitle: 'Warmwasser verzögern (PV zuerst)', dlyWhy: 'Optional. Fällt das Warmwasser im Zeitfenster unter die Startschwelle der Wärmepumpe, wird ihr Start hinausgezögert (der WW-Soll wird per Flow abgesenkt), damit das Warmwasser mit Solarstrom oder im günstigen Block erzeugt wird statt morgens mit Netzstrom. Danach wird der Soll wieder freigegeben. Braucht den Flow «verzögern» und den Flow «zurück auf Normal» (oben).', dlyOn: 'Warmwasser verzögern', dlyFlow: 'Flow «Soll absenken (verzögern)»', dlyFrom: 'Zeitfenster von', dlyTo: 'bis', dlyForecast: 'Genug Sonne ab Prognose (kWh)', dlyForecastH: 'Rest-Prognose von heute. Ab diesem Wert wartet die Wärmepumpe bis zur Freigabezeit auf die Sonne (SG-Ready). Im November ist die Prognose oft zu hoch, darum eher tiefer ansetzen.', dlyComfort: 'Komfortgrenze (°C)', dlyComfortH: 'Fällt das Warmwasser unter diesen Wert, wird sofort freigegeben (niemand soll kalt duschen). Unter dieser Grenze wird auch nicht verzögert.', dlyRelWd: 'Freigabe Mo bis Fr', dlyRelWe: 'Freigabe Wochenende', dlyRelLow: 'Freigabe bei wenig Sonne', dlyRelLowH: 'Uhrzeit, zu der bei zu wenig Prognose (und ohne Preisoptimierung) freigegeben wird.', dlyMargin: 'Startschwelle: Marge über Soll minus Hysterese (K)', dlyMarginH: 'Verzögert wird, sobald das Warmwasser unter Soll minus Hysterese plus diese Marge fällt, also kurz bevor die Wärmepumpe von selbst startet.', dlyPriceRel: 'Bei wenig Sonne im günstigsten Block freigeben (Preisoptimierung)', dlyBlock: 'Dauer des Blocks (h)', dlyNow: 'Aktuell verzögert bis {time}: {why}', dlyNeed: 'Zum Verzögern fehlen die Flows «verzögern» und «zurück auf Normal».', dhwPriceFrom: 'Preisoptimierung ab (Datum)', dhwPriceFromH: 'Günstigste Stunden und der Preis-Block beim Verzögern gelten erst ab diesem Datum, zum Beispiel mit dem dynamischen Tarif. Leer = sofort.', shareTitle: 'Hausbatterie-Schutz: wie viel Solarstrom bekommt das Auto?', shareWhy: 'Solange das Auto eingesteckt ist, bekommt es je nach Batteriestand einen Teil des Solarstroms. Darunter wartet es ganz (Batterie zuerst), darüber steigt der Anteil linear bis zum vollen Überschuss. Gilt auch für Geräte ohne eigene Grenze («Hausbatterie zuerst bis»).', shareLo: 'Auto lädt ab Batterie (%)', sharePctLo: 'Anteil dort (%)', shareHi: 'Voller Überschuss ab Batterie (%)', sharePctHi: 'Anteil dort (%)', shareBonus: 'Prognose-Bonus (Prozentpunkte früher)', shareBonusH: 'Optional: Bringt die Solarprognose heute deutlich mehr Sonne, als die Batterie bis voll und das Haus bis zum Sonnenuntergang brauchen, wird die Rampe um bis zu so viele Prozentpunkte nach unten verschoben (das Auto lädt früher). Ohne frische Prognose oder gelerntes Hausprofil passiert nichts. 0 = aus.', shareBonusNow: 'Prognose-Bonus aktiv: Rampe aktuell {n} Punkte früher.', shareEx: 'Beispiel 30 / 30 / 70 / 100: ab 30 % Batterie geht ein Drittel des Solarstroms ins Auto, bei 70 % der ganze Überschuss. Standard 50 / 0 / 80 / 100: erst ab 50 % Batterie, dann langsam mehr.',
      maxAmps: 'Maximalstrom (A)', stepHold: 'Haltezeit vor Erhöhung (s)', chargeNowAutoOff: '«Sofort laden» beim Abstecken ausschalten',
      iconLbl: 'Symbol', iconNames: { dishwasher: 'Geschirrspüler', plug: 'Steckdose', bike: 'Velo', dehumidifier: 'Luftentfeuchter', boiler: 'Boiler', washer: 'Waschmaschine', tumbler: 'Tumbler', fan: 'Ventilator', heatpump: 'Wärmepumpe', pool: 'Pool', ac: 'Klimaanlage', heater: 'Heizstab', sauna: 'Sauna', freezer: 'Kühlgerät', pump: 'Pumpe', light: 'Licht', mower: 'Rasenroboter', purifier: 'Luftreiniger', aquarium: 'Aquarium' },
      accuTitle: 'Akku (z. B. eBike, Rasenmäher)', accuEnable: 'Ladestand des Akkus beachten', accuSensor: 'Ladestand von', accuCap: 'Wert', accuStop: 'Stoppen bei (%)', accuResume: 'Wieder laden unter (%)', accuLow: 'Immer laden unter (%)', accuMax: 'Spätestens aus nach (min)',
      accuHint: 'Stoppt bei der Grenze und lädt erst wieder, wenn der Akku darunter fällt. Unter der unteren Grenze wird auch ohne Überschuss geladen. Die Höchstdauer schaltet ab, falls der Ladestand nicht mehr ankommt (0 = ohne).',
      humTitle: 'Feuchte-Notlauf', humEnable: 'Notlauf bei hoher Luftfeuchtigkeit', humSensor: 'Feuchte-Sensor', humOn: 'Notlauf ein ab (%)', humOff: 'Notlauf aus unter (%)', humRun: 'Höchstdauer (min)',
      humHint: 'Läuft unabhängig von Batterie und Überschuss, bis die Feuchte unter den Aus-Wert fällt oder die Höchstdauer um ist. Danach startet er erst wieder, wenn die Feuchte zwischendurch unter den Ein-Wert gefallen ist.',
      modeTest: 'nicht gesteuert', modeLiveTag: 'gesteuert', costLast: 'Zähler zuletzt', noBatMode: 'Ohne Hausbatterie ist nur «Bei Überschuss» möglich.',
      save: 'EMS-Einstellungen speichern', saved: 'Gespeichert', saveDirty: 'Änderungen speichern ●', saveSec: 'Speichern', unsavedTag: '● ungespeichert', unsaved: 'Noch nicht gespeichert: bitte «Speichern» drücken.', error: 'Fehler', toggleFailed: 'Schalter konnte nicht gesetzt werden',
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
      previewOn: 'Preview without energy management', previewBanner: 'Preview: this is how the app looks without energy management (only in this browser, nothing is changed).', previewOff: 'End preview',
      noDevice: 'Energy management is not set up yet. In Homey go to Devices → "+" → "Swiss Dynamic Electricity Tariff" and add the "Energy management" device.',
      devicesSec: 'Set up energy management', sources: 'DATA SOURCES', consumers: 'CONSUMERS',
      stOff: 'Switched off', stTest: 'Running, but no device is released for control yet', stLive: 'Running and controlling',
      stWarn: 'Running with a warning', switchHint: 'Switch on: the energy management controls this device. Off: it leaves the device alone. While silent mode is on, everything is only simulated.',
      pvLbl: 'PV', gridLbl: 'Grid', batLbl: 'Battery',
      noConsumers: 'No consumer yet.',
      plan: 'PLAN', planToday: 'Today', planTomorrow: 'Tomorrow', planPrice: 'Price in Rp./kWh', planPv: 'Solar forecast', planNow: 'now',
      planBlock: 'Cheapest block (2 h)', planBlockNow: 'Cheapest block from now (2 h)', planPvKwh: 'Solar expected', planPriceRange: 'Price min to max', planNoPrices: 'No prices for this day yet.',
      planBat: 'Battery (plan)', planBatAdvice: 'recommendation, not controlled', planBatLive: 'controlled', planWallbox: 'EV charger (history)', planWallboxCar: 'EV charger and EV (history and plan)', planChError: 'error', planTo: 'to', planPeak: 'peak', planTest: 'simulated', planPlanned: 'planned',
      planCheap: 'cheap', planNormal: 'normal', planExp: 'expensive', planBatCharge: 'Grid charging', planBatHold: 'Hold (discharge blocked)', planBatNormal: 'Normal', planOn: 'on',
      planNote: 'The battery shows the planner\'s plan (recalculated every 15 minutes, comparison only). EV charger and consumers follow the current surplus: here you see what they did. In test mode it is the simulation.',
      planDayTitle: 'Plan day',
      carCal: 'Weekly template (Mon to Sun)', carCalHint: 'Applies every week. An entry for "Today" or "Tomorrow" above overrides the day. Changes are saved right away.', carCalSaving: 'saving ...', carCalSaved: 'saved', carCalSave: 'Save template', carCalReset: 'Discard', carSetupHint: 'Targets, "Today/Tomorrow" and the weekly template are set under "Outlook".',
      carDays: { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }, carTime: 'Departure', carSoc: 'Target %',
      carHoliday: 'Holiday: no charging targets (solar keeps charging)', carHolidayOn: 'Holiday', carHolidayUntilShort: 'until', carHolidayOpen: 'until switched off', carHolidayUntil: 'until and including (empty = until switched off)', carGrid: 'Charge from the grid if the sun is not enough by departure', carGridHint: 'On: the app charges in the cheapest quarter-hours before departure. Off: solar only.',
      carCard: 'EV', carNext: 'Next target', carNone: 'no target planned', carFromCal: 'template', carFromOverride: 'override',
      carSt: { none: 'No target', no_soc: 'Charge level unknown', no_capacity: 'Battery size missing (Set up → EV)', reached: 'Target reached', solar_only: 'Solar only', planned: 'Planned', short: 'Not quite enough before departure' },
      carNotConnected: 'not plugged in', carBadgeCharging: 'charging', carBadgePlugged: 'plugged in', carBadgeReached: 'target reached', carOverride: 'Different today or tomorrow (overrides the template)', carToday: 'Today', carTomorrow: 'Tomorrow', carCharge: 'charge',
      carApply: 'Apply', carClear: 'Use the template again', carSaved: 'Saved',
      silent: 'Silent mode: simulate only', silentHint: 'On: nothing is switched. Log and outlook show what would happen. Off: devices with their switch on are really controlled.',
      stSilent: 'Silent mode: only simulating', silentTag: 'silent',
      batCtl: 'Control the battery', batCtlOn: 'Control the battery through energy management', batCtlFound: 'Template for this device found: charge, hold and normal via the battery\'s cards.',
      batCtlNone: 'There is no ready-made template for this device. Assign below which of the battery\'s cards run for Charge, Hold and Normal.', batCtlNoCards: 'The device has no action cards. The battery cannot be controlled.',
      batCtlMap: 'Mapping', batCtlMapAuto: 'detected template', batCtlMapCustom: 'own mapping', batCtlAddStep: 'Add card', batCtlPick: '- pick a card -', batCtlDel: 'Remove',
      batCtlPh: 'Number fields also accept placeholders: {power} = charge power (W), {target_soc} = target charge (%), {normal_discharge} = normal discharge power (W).', batCtlEmpty: 'no card (nothing is sent)', batCtlLoading: 'Checking the battery\'s cards ...',
      batCtlWarn: 'Only one system may control the battery. Switch off battery control in the other energy management and your own battery flows before going live.',
      bpMode: 'Peak hours', bpModeAuto: 'automatic (schedule)', bpModeFixed: 'fixed number of hours',
      bpModeAutoHint: 'The schedule puts the charge into the most expensive quarter-hours until the next recharge (cheap from the grid at night or from the sun during the day) and only charges from the grid when it pays off despite losses. How many hours that is follows from charge and consumption.',
      schText: 'Schedule: charges {kwh} kWh at {from} to {to} (avg {cp} Rp.), delivers {dkwh} kWh in the most expensive quarter-hours (avg {dp} Rp.). Benefit approx. {chf} CHF.', schNoCharge: 'Schedule: no grid charging needed, the charge ({dkwh} kWh) goes into the most expensive quarter-hours (avg {dp} Rp.).', schNothing: 'Schedule: nothing to do at the moment.',
      ldTitle: 'COST OF THE DECISIONS (MODEL)', ldIntro: 'What the battery decisions would have cost: two virtual batteries with the real house consumption, solar power and real prices, one following this EMS, one the other. Each day starts at the real charge level; remaining charge counts at the daily average price. Lower is better.',
      ldMine: 'This EMS', ldOther: 'Other EMS', ldNone: 'Without battery', ldDiff: 'Difference', ldToday: 'today so far', ldTotal: 'Total', ldNone2: 'No data yet, the evaluation starts with the next battery run.',
      bpTitle: 'Planning', bpReserve: 'Cover peak hours with the battery (h)', bpReserveHint: 'During this many most expensive hours of the next 24 hours the battery discharges, otherwise it holds its charge.',
      bpSolar: 'No grid charging from solar (kWh)', bpSolarHint: 'If the sun brings at least this much in the next 24 hours, no charging from the grid (0 = always charge).',
      bpBridge: 'Bridge the morning', bpBridgeHint: 'Even with lots of sun, charge as much as the expensive hours until solar production need.', bpLoad: 'Consumption until solar takes over', bpLoadSchedule: 'House consumption', bpDay1: '1 day', bpDays: '{n} days', bpEvening: 'evening {kw} kW', bpLoadAuto: 'automatic (learned)', bpLoadFixed: 'fixed value (kW)', bpFloor: 'Do not discharge below (%)',
      backupTitle: 'Backup reserve', backupSoc: 'Reserve (%)',
      backupHint: 'Keeps at least this charge level, charging from the grid if needed - regardless of price. Turn on or off with the switch under "Today" or with a Flow, never automatically.',
      backupActive: 'Active: keeps at least {soc} %, charges from the grid if needed',
      backupRow: 'Backup reserve', backupRowOn: 'Active - keeps at least {soc} %', backupRowOff: 'Off',
      bpLearned: 'Learned: {kw} kW in the morning (average 05 to 10, {days}). The energy management measures the house consumption continuously and keeps the average of every quarter-hour of the last 7 days. A cold morning with the heat pump counts more than a mild one.',
      bpLearning: 'Still learning: no measurements yet. Until then it uses {kw} kW.',
      brTitle: 'Bridge the morning', brCharge: 'charges {kwh} kWh up to {soc} % at {at}. Reason: expensive {from} to {to}, solar takes over from {sun}. Need {need} kWh ({load} kW {how}), available {have} kWh.',
      brEnough: 'not needed, the charge is enough (need {need} kWh for {from} to {to}, available {have} kWh).', brUnprofitable: 'not worth it: charging would cost more incl. losses than the expensive hours ({from} to {to}).',
      brNoGap: 'not needed, there are no expensive hours before the sun (from {sun}).', brNoSun: 'no sun in sight.', brOff: 'not needed at the moment: the solar limit does not apply, normal grid charging.', brHowLearned: 'learned', brHowFixed: 'fixed',
      batCtlPower: 'Charge power when charging from the grid (kW)', batCtlTarget: 'Target charge when charging from the grid (%)', batCtlNormal: 'Normal discharge power (W)', batCtlRepeat: 'Repeat command every (min)',
      batCtlSteps: 'How it is controlled', batModeCharge: 'Charge', batModeHold: 'Hold', batModeNormal: 'Normal', batCarSkip: 'not while the car is charging',
      batRow: 'Battery', batRowNone: 'nothing sent yet', batSent: 'last',
      logTitle: 'LOG', logNone: 'No entries yet.', logAll: 'All', logCar: 'EV', logWallbox: 'EV charger', logBat: 'Battery', logCons: 'Devices', logFuse: 'House connection', logMore: 'Show more', logLess: 'Show less', logToday: 'Today', logYesterday: 'Yesterday',
      secCar: 'EV', secWallbox: 'EV CHARGER', secBat: 'HOME BATTERY',
      carWaiting: 'Data follows with the next run', autoCharge: 'Charge automatically', autoChargeOff: 'Off: the charger works as before (own app or flows)', autoChargeNoCar: 'No car plugged in',
      cnLimit: 'Limit', cnNone: 'until unplugged', cnNoneManual: 'until switched off', cnSoc: 'up to charge level (%)', cnKwh: 'up to energy (kWh)', cnUntil: 'up to', cnNow: 'now', cnLoaded: 'charged', cnHint: 'Charge now charges at full power regardless of the price and switches itself off at the limit.',
      logCmdOnly: 'switching only', logAllSim: 'Silent mode: all entries are simulated.', logOnWord: 'on', logOffWord: 'off', logStartWord: 'started', logTestTag: 'simulated',
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
      prioRow: 'Priority (order for surplus)', prioUp: 'up', prioDown: 'down', prioTag: 'Priority {n}', prioWhy: 'For "On surplus": the device higher up starts first and switches off last. Only one starts per measurement so the surplus is not planned twice. The order is applied with "Save".', suggestedTag: 'Suggested', suggest: 'Suggest automatically', suggested: 'Suggestions filled in:', nothingSuggested: 'Nothing suitable found',
      tagRequired: 'Required', tagRecommended: 'Recommended', tagOptional: 'Optional', tagAuto: 'Automatic',
      notChosen: 'not chosen', device: 'Device', value: 'Value', pick: '- choose device -', none: '- none -', pickFirst: '- choose a device first -',
      fuseTitle: 'HOUSE CONNECTION', fuseRow: 'Main fuse protection', fuseOff: 'off', fuseOn: 'Protect the main fuse',
      fuseWhy: 'Keeps every phase below the limit of the main fuse: first the EV charger is throttled; if that is not enough, the devices below are switched off one after the other.',
      fuseAmps: 'Main fuse (A)', fuseReserve: 'Reserve (% of the fuse)', fuseLimitLbl: 'Limit', fusePerPhase: 'per phase', fuseMeter: 'Meter with phase currents', fuseMeterGrid: 'same as grid meter', fusePhase: 'Phase',
      fuseThrottle: 'Throttle the EV charger so that no phase exceeds the limit', fuseThrottleHint: 'The charger gets at most the current still free on the tightest phase. Applies when the energy management controls the charger.',
      fuseHold: 'Wait before switching off (s)', fuseRestore: 'Release after (min below the limit)', fuseShedTitle: 'ON OVERLOAD SWITCH OFF IN THIS ORDER', fuseShedNone: 'No devices selected.', fuseAdd: 'Add', fuseAddPick: '- pick a device or flow -',
      fuseHowTitle: 'How to switch off?', fuseAutoLbl: 'Automatic', fuseAutoOnoff: 'Automatically detected: on/off capability.', fuseAutoThermostat: 'Automatically detected: thermostat mode set to "off".', fuseAutoNone: 'No matching capability detected - please choose a flow.', fuseAutoCharger: 'Automatic: charging session is stopped.',
      fuseUp: 'up', fuseDel: 'Remove', fuseFlow: 'Flow', fuseLive: 'Protection live (otherwise simulate only)', fuseLiveHint: 'Live, the protection really switches the selected devices off. Silent mode takes precedence. Switch off the matching branches in your own flows first so that only one system switches.',
            tgtSource: 'Target temperature', tgtManual: 'Fixed', tgtDevice: 'From the heat pump (DHW setpoint)', tgtDev: 'Device and value (heat pump DHW setpoint)', tgtTol: 'Tolerance below DHW setpoint (K)', tgtHyst: 'Heat pump hysteresis (K, optional)',
      tgtHystH: 'The heat pump only stops DHW heating at DHW setpoint PLUS hysteresis (parameter "Hysteresis", P32 under DHW/parameters). This value cannot be read via Modbus: enter it by hand. 0 = ignore.',
      tgtSrcH: 'The heat pump itself only heats up to its DHW setpoint (plus hysteresis) and then stops. A fixed target above it is never reached. "From the heat pump" ends at DHW setpoint plus hysteresis minus tolerance. Above about 50 °C the heating rod kicks in.',
      tgtTolH: 'Ends as soon as the hot water reaches the DHW setpoint minus this tolerance (the sensor lags a little).', tgtFallback: 'Fallback target if the DHW setpoint is not readable (°C)', tgtFallbackH: 'Only used when the heat pump value cannot be read right now.',
      dhwModeProgram: 'Operating mode during the program (e.g. DHW)', dhwModeProgramH: 'Value of the operating mode while the program runs. Without it the check would abort our own switching immediately. In DHW mode heating is off, afterwards it must return to automatic.',
      dhwMaxRun: 'Maximum duration (min)', dhwMaxRunH: 'Safety limit: afterwards it is set back to normal (DHW mode switches the heating off). 0 = unlimited.',
      dhwTitle: 'HOT-WATER PROGRAM ON A CHEAP PRICE', dhwRow: 'Hot-water program', dhwOff: 'off', dhwRunning: 'running', dhwWaiting: 'waiting',
      dhwOnLbl: 'Start the hot-water program on a cheap price', dhwWhy: 'Independent of SG Ready: if it is within the cheapest hours of the day and the hot water is below the minimum, the heat pump hot-water program starts (flow or app function) and is set back to normal afterwards. While SG Ready runs the program does not start (and vice versa).',
      dhwCheapHours: 'Cheapest hours per day (h)', dhwCheapH: 'The program starts during the cheapest N hours of the day (by today quarter-hour prices). The preview shows when that would be today and tomorrow.',
      dhwPreview: 'Preview', dhwToday: 'Today', dhwTomorrow: 'Tomorrow', dhwAvg: 'avg', dhwNoPrices: 'Preview: no prices for today yet.',
      dhwBelow: 'Only start below hot water (°C)', dhwBelowH: 'Only if the hot water is below this value (0 = always). Without a temperature reading it does not start.',
      dhwSkipPv: 'Do not start if the sun is enough', dhwSkipPvKwh: 'Sun is enough from forecast (kWh, rest of today)', dhwSkipUntil: 'Sun forecast counts until', dhwSkipPvH: 'Starting on price is pointless if the sun will still deliver enough today (remaining forecast).', dhwSkipUntilH: 'Until this time the sun forecast counts, afterwards the price may start.',
      dhwTarget: 'End at hot water (°C)', dhwTargetH: 'When the hot water reaches this temperature it is set back to normal. The real target is set in the heat pump itself.', dhwMinRunH: 'Once started the program runs at least this long. Only target temperature, operating mode or sun (SG Ready) end it earlier.',
      dhwLive: 'Hot-water program live (otherwise simulate only)', dhwLiveHint: 'Live, it really starts the program. Silent mode takes precedence. Switch off an existing flow for it first so that only one system switches.',
      sgTitle: 'BOILER / HEAT PUMP (SG READY)', sgRow: 'SG Ready control', sgOff: 'off', sgOn: 'Control SG Ready', sgWhy: 'Switches the heat pump switch-on recommendation (0:1) when sun or a full battery pays for the hot water. Normal operation (0:0) is the base state. The cheap price has its own section below.',
      sgBasis: 'Control basis', sgBasisPv: 'Solar power (PV production)', sgBasisExport: 'Grid feed-in', sgBasisH: 'Solar power = what the PV produces (useful with a house battery that would otherwise swallow the surplus). Grid feed-in = what flows into the grid.',
      sgMinSolar: 'Minimum solar power to start (W)', sgMinSolarH: 'The boost may start from this power.',
      sgMinSoc: 'Minimum house battery to start (%)', sgMinSocH: 'The house battery must be at least this full before the heat pump gets the power. Ignored without a battery.',
      sgHyst: 'Battery tolerance while holding (%)', sgHystH: 'After the minimum run time the battery may drop this many percent below the start threshold without ending the boost (absorbs short clouds).',
      sgTemp: 'End boost at hot water (°C)', sgTempH: 'When the hot water reaches this temperature, control returns to normal operation. The real target is set in the heat pump itself (not readable).',
      sgTo: 'Latest start time (sun)', sgToH: 'After this time no new boost starts because of sun. The price trigger is independent of it.',
      sgStartDelay: 'Switch-on delay (min)', sgStartDelayH: 'The start conditions must hold this long in a row before the boost starts (avoids switching on short sun peaks).',
      sgMinRun: 'Minimum run time (min)', sgMinRunH: 'Once started, the boost runs at least this long, even with clouds. Only target temperature or operating mode end it earlier.',
      sgStopDelay: 'Switch-off delay (min)', sgStopDelayH: 'If the conditions drop after the minimum run time, wait this long before returning to normal operation.',
      sgCooldown: 'Cool-down after end (min)', sgCooldownH: 'Pause after a boost ends before a new one may start.',
      sgUsePrice: 'Use a cheap electricity price as a second trigger', sgMaxPrice: 'Highest price (Rp./kWh)', sgPriceH: 'Also starts the boost at a cheap price, independent of sun and time of day.',
      sgPriceAct: 'What does the price start?', sgActSg: 'SG Ready recommendation (like with sun)', sgActDhw: 'Only the heat pump hot-water program', sgActH: 'On price, only the hot-water program can be started (on) instead of SG Ready and set back to normal afterwards (off). Sun always starts SG Ready.', sgDhwOut: 'Set the hot-water program via', sgDhwFlows: 'Flows (on / back to normal, e.g. DHW setpoint via Modbus)', sgDhwCap: 'App function (capability of a device)', sgDhwOn: 'Flow hot-water program on', sgDhwOff: 'Flow back to normal', sgDhwDev: 'Device and capability of the app function', sgDhwOnV: 'Value for on', sgDhwOffV: 'Value for back to normal', sgDhwH: 'Values as text, true/false for switches. At the end it is set back to normal, but only if the control started the program itself.',
      sgPriceBelow: 'Price start only below hot water (°C)', sgPriceBelowH: 'Heats on price only if the hot water is below this value (0 = always). Without a temperature reading there is no price start.',
      sgPvBelow: 'Sun start only below hot water (°C)', sgPvBelowH: 'Optional: also with sun, only start if the hot water is below this value (0 = always, default).',
      sgSkipPv: 'Skip price start when the sun is enough', sgSkipPvKwh: 'Sun is enough from forecast (kWh, rest of today)', sgSkipPvH: 'Starting on price is pointless if the sun will still deliver enough today. Only applies while the sun start is still open (before the latest start time).',
      sgForced: 'Allow forced charging (1:1)', sgForcedW: 'Forced charging threshold (W)', sgForcedH: 'State 1:1, often with a heating rod and high consumption. Only from the boost and only from this solar power. Off by default.',
      sgSensor: 'Hot-water temperature (device and value)', sgSensorH: 'The heat pump hot-water actual value, so the boost ends at the target temperature.',
      sgMode: 'Heat pump operating mode (device and value, optional)', sgModeOk: 'Control only at this value (e.g. Automatic)', sgModeH: 'Control only acts when the operating mode has this value. Not in holiday, comfort or standby. Leave empty = no check.',
      sgFeedback: 'Take the state from the heat pump (device and value, optional)', sgFeedbackH: 'Reads the SG Ready state of the heat pump (e.g. 2 NORMAL), shows it in the widget and warns if it does not match after switching. Empty = own state only.',
      sgOutput: 'How are the states set?', sgOutRelays: 'Two relays (e.g. 2 Shellys)', sgOutFlows: 'Flows (one flow per state, e.g. Modbus)',
      sgOutH: 'Relays: normal = both off, recommendation (0:1) = relay 1 on, forced (1:1) = both on. Flows: one flow per state, e.g. writing Modbus registers.',
      sgRecRelay: 'Relay recommendation (0:1)', sgForceRelay: 'Relay forced charging (1:1 only)', sgFlowNormal: 'Flow normal operation (0:0)', sgFlowBoost: 'Flow recommendation (0:1)', sgFlowForced: 'Flow forced charging (1:1)',
      sgLive: 'SG Ready live (otherwise simulate only)',
      sgLiveHint: 'Live, the control really switches. Silent mode takes precedence. Switch off your previous flow first so that only one system switches.', sgState: { off: 'Normal operation (0:0)', boost: 'Recommendation (0:1)', forced: 'Forced charging (1:1)', dhw: 'Hot-water program' },
      tips: {
        mode: 'When the device runs: on surplus, on a full battery, from a charge level, or as a program with one start.',
        fullSoc: 'Switch on as soon as the house battery is at least this full.',
        socOn: 'Switch on as soon as the house battery has at least this charge level.',
        hysteresis: 'Only switched off once the charge level falls this many percentage points below the switch-on threshold.',
        minSurplusW: 'This much power must flow into the grid before the device switches on.',
        startSustainS: 'The surplus must last this long in a row so short peaks do not switch.',
        stopGraceS: 'The surplus may be missing this long before it switches off (absorbs short clouds).',
        assumedW: 'What the device consumes. A flow cannot measure it, so the app calculates with this value.',
        minRunMin: 'After switching on it runs at least this long, even if the surplus disappears.',
        minOffMin: 'After switching off it stays off at least this long (protects against constant switching).',
        protectSoc: 'If the house battery falls below this value the device switches off immediately, even during the minimum run time.',
        useGate: 'On a weak sun forecast no new starts, so the battery keeps its charge for the evening.',
        pgSurplus: 'From this much feed-in the program starts right away.',
        pgSustain: 'This surplus must last this long in a row.',
        pgFrom: 'From this time on the cheapest moment is searched if no surplus came before.',
        pgWait: 'At the end of this window it starts at the latest. Such scheduled starts happen at most once a day.',
        pgDuration: 'Usual run time. For this long after a start the automation does not start again.',
        pgStartVal: 'This value is sent to the start capability (e.g. START).',
        pgRemoteVal: 'Only when the remote control reports this value may it start.',
        pgDoorVal: 'Only at this door value (closed) it starts.',
        'bp-reserve': 'The battery keeps reserve for this many of the most expensive hours of the day instead of running empty before.',
        'bp-solar': 'From this expected solar amount (kWh today) there is no charging from the grid.',
        'bp-bridge': 'Charges from the grid if needed so the battery lasts until sunrise.',
        'bp-floor': 'Below this charge level the battery is no longer discharged.',
        'bp-backupsoc': 'This much stays in the battery while the backup reserve is switched on.',
        'fuse-pct': 'Share of the fuse we use. The rest stays as a safety margin.',
        'fuse-hold': 'An overload must last this long before anything is switched off.',
        'fuse-restore': 'Everything must stay below the limit this long before the wallbox may charge again.',
        'pv-factor': 'Scales the PV forecast up or down if it is usually too high or too low for you.',
      },
      fuseNoRestore: 'Devices that were switched off are not switched back on. The EV charger may charge again after the release.', fuseNoPhases: 'The meter does not deliver phase currents. Please check the meter and values.',
      fuseNow: 'House connection', fuseOf: 'of', fuseLoad: 'load', fuseThrottled: 'EV charger at', fuseShedNow: 'off:', fuseEvOver: 'limit exceeded', fuseEvShed: 'switched off', fuseEvThrottle: 'EV charger throttled to', fuseEvThrottleEnd: 'EV charger no longer throttled', fuseEvRelease: 'released',
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
      modeFull: 'When battery is full', modeSoc: 'From battery SoC', modeSurplus: 'On surplus', modeProgram: 'Start a program', noCtrl: 'cost meter only',
      programTitle: 'Start a program', programWindow: 'Time window from', programMaxWait: 'Max. wait (h)', programDuration: 'Program duration (h)',
      programHint: 'Starts right away with enough PV surplus. Otherwise picks the cheapest moment within the window, starting at the latest by its end (price safety net). At most once a day.',
      programStartCap: 'Start capability', programStartVal: 'Start value', programRemoteCap: 'Remote-control capability', programRemoteVal: 'Remote value (when enabled)',
      programRemoteWarn: 'Without a remote-control capability, the app never checks whether the device can even be switched - required for some appliances (e.g. Electrolux).',
      programDoorCap: 'Door capability (optional)', programDoorVal: 'Door value "closed" (when chosen)',
      programStateCap: 'State capability (optional)', programStateVal: 'State value "ready/idle" (when chosen)',
      programStateHint: 'Stops a second start command while the appliance is still running (whether started by hand or by us) - which capability and which value means "ready" differs by device. Leave empty if the appliance has nothing like this.',
      fullSoc: 'Full from SoC (%)', socOn: 'On from SoC (%)', hysteresis: 'Off below (points under that)',
      batFirst: 'Home battery first up to (%)', batFirstPh: 'like charger', batFirstHint: 'Empty: like the EV charger (home battery first up to the shared limit). A number: own limit; above it the device also takes the power currently flowing into the home battery. For small devices (e-bike) e.g. 0.',
      minSurplus: 'Minimum surplus (W)', startSustain: 'Surplus must last (s)', stopGrace: 'Grace before switching off (s)',
      advanced: 'Advanced', minRun: 'Minimum run time (min)', minOff: 'Minimum pause (min)', protect: 'Protect SoC: off immediately below (%)', useGate: 'Respect forecast gate',
      shareAt: 'Battery from (%)', shareGets: 'Solar share (%)', shareLowRow: 'Lower limit: from here the car gets solar power', shareHighRow: 'Upper limit: from here it gets the full surplus', shareChartCap: 'How much of the solar power the car gets per battery level', shareNow: 'Now: battery {soc} % → the car gets {pct} % of the solar power.', shareBonusTitle: 'Forecast bonus', shareVal: 'Solar share car {pct} %', wbLinkTitle: 'Wallbox connection (how it is addressed)', wbLinkWhy: 'The default fits wallboxes with the cards "start charging" and "set charging power". For another wallbox choose what the device reports and which flow cards it has for control. The power is calculated from amps, phases and 230 V and passed in watts to the "set charging power" card (stop = 0 W).', wbState: 'Charging state (capability)', wbPower: 'Charging power (capability)', wbPhase: 'Phases (capability, optional)', wbPhaseH: 'Only for phase switching. Expected values: 1 = one phase, 2 = three phases.', wbStartCard: 'Card "start charging" (optional)', wbPowerCard: 'Card "set charging power"', wbPowerArg: 'Argument for the power (W)', wbNone: '– none –', wbStd: 'Default', wbCustom: 'Custom mapping', wbCardMissing: 'card missing', wbCardsLoading: 'Loading the device cards …', wbNoPowerCard: 'The chosen "set charging power" card does not exist on this device. The wallbox cannot be controlled like this.', pvAccTitle: 'Recommendation from the last days', pvAccNone: 'Not enough data yet: {n} of at least {m} complete days. Every morning the app records the forecast for the day and compares it in the evening with the measured production.', pvAccRec: 'Recommendation: {f} (median of {n} days, mostly between {lo} and {hi}).', pvAccRecent: 'Only the last {n} days: {f}.', pvApply: 'Apply', pvAuto: 'Correction factor automatic', pvAutoH: 'From 7 complete days on the app enters the recommended value into the field by itself once a day. The field then shows the current value.', pvAccLog: 'History of the last days', pvAccDay: 'Day', pvAccFc: 'Forecast without factor (kWh)', pvAccAct: 'Measured (kWh)', pvAccRatio: 'Ratio', pvAccToday: 'today', pvAccNote: 'Only complete days with at least 2 kWh forecast count. The ratio is measured divided by the forecast without factor.', dlyTitle: 'Delay hot water (PV first)', dlyWhy: 'Optional. If the hot water falls below the start threshold of the heat pump within the time window, its start is postponed (the DHW setpoint is lowered by a flow) so that the hot water is made with solar power or in the cheap block instead of with grid power in the morning. Afterwards the setpoint is released again. Needs the flow "delay" and the flow "back to normal" (above).', dlyOn: 'Delay hot water', dlyFlow: 'Flow "lower setpoint (delay)"', dlyFrom: 'Time window from', dlyTo: 'to', dlyForecast: 'Enough sun from forecast (kWh)', dlyForecastH: 'Remaining forecast for today. From this value the heat pump waits for the sun (SG Ready) until the release time. In November the forecast is often too high, so set it rather lower.', dlyComfort: 'Comfort limit (°C)', dlyComfortH: 'If the hot water falls below this value it is released immediately (nobody should have a cold shower). Below this limit nothing is delayed either.', dlyRelWd: 'Release Mon to Fri', dlyRelWe: 'Release weekend', dlyRelLow: 'Release with little sun', dlyRelLowH: 'Time of release when the forecast is too low (and without price optimization).', dlyMargin: 'Start threshold: margin above setpoint minus hysteresis (K)', dlyMarginH: 'Delaying starts as soon as the hot water falls below setpoint minus hysteresis plus this margin, i.e. shortly before the heat pump starts by itself.', dlyPriceRel: 'With little sun release in the cheapest block (price optimization)', dlyBlock: 'Block length (h)', dlyNow: 'Currently delayed until {time}: {why}', dlyNeed: 'Delaying needs the flows "delay" and "back to normal".', dhwPriceFrom: 'Price optimization from (date)', dhwPriceFromH: 'Cheapest hours and the price block when delaying only apply from this date, for example with the dynamic tariff. Empty = immediately.', shareTitle: 'Home battery protection: how much solar power does the car get?', shareWhy: 'While the car is plugged in it gets a share of the solar power depending on the battery level. Below the first level it waits completely (battery first), above it the share rises linearly up to the full surplus. Also applies to devices without their own limit ("home battery first up to").', shareLo: 'Car charges from battery (%)', sharePctLo: 'Share there (%)', shareHi: 'Full surplus from battery (%)', sharePctHi: 'Share there (%)', shareBonus: 'Forecast bonus (percentage points earlier)', shareBonusH: 'Optional: if the solar forecast shows clearly more sun today than the battery needs to fill up and the house until sunset, the ramp moves down by up to this many points (the car charges earlier). Without a fresh forecast or a learned house profile nothing happens. 0 = off.', shareBonusNow: 'Forecast bonus active: ramp currently {n} points earlier.', shareEx: 'Example 30 / 30 / 70 / 100: from 30 % battery a third of the solar power goes to the car, at 70 % all of the surplus. Default 50 / 0 / 80 / 100: only from 50 % battery, then gradually more.',
      maxAmps: 'Maximum current (A)', stepHold: 'Hold time before increase (s)', chargeNowAutoOff: 'Switch off "Charge now" when unplugged',
      iconLbl: 'Icon', iconNames: { dishwasher: 'Dishwasher', plug: 'Socket', bike: 'Bike', dehumidifier: 'Dehumidifier', boiler: 'Water heater', washer: 'Washing machine', tumbler: 'Tumble dryer', fan: 'Fan', heatpump: 'Heat pump', pool: 'Pool', ac: 'Air conditioning', heater: 'Heating element', sauna: 'Sauna', freezer: 'Fridge / freezer', pump: 'Pump', light: 'Light', mower: 'Robot mower', purifier: 'Air purifier', aquarium: 'Aquarium' },
      accuTitle: 'Battery pack (e.g. e-bike, lawn mower)', accuEnable: 'Respect the battery charge level', accuSensor: 'Charge level from', accuCap: 'Value', accuStop: 'Stop at (%)', accuResume: 'Charge again below (%)', accuLow: 'Always charge below (%)', accuMax: 'Switch off at the latest after (min)',
      accuHint: 'Stops at the limit and only charges again once the battery drops below it. Below the lower limit it charges even without surplus. The maximum duration switches off if the charge level stops arriving (0 = none).',
      humTitle: 'Humidity emergency run', humEnable: 'Emergency run at high humidity', humSensor: 'Humidity sensor', humOn: 'Emergency run on from (%)', humOff: 'Emergency run off below (%)', humRun: 'Maximum duration (min)',
      humHint: 'Runs regardless of battery and surplus until humidity drops below the off value or the maximum duration is over. It only starts again after humidity has dropped below the on value in between.',
      modeTest: 'not controlled', modeLiveTag: 'controlled', costLast: 'Meter last', noBatMode: 'Without a home battery only "On surplus" is possible.',
      save: 'Save energy management settings', saved: 'Saved', saveDirty: 'Save changes ●', saveSec: 'Save', unsavedTag: '● unsaved', unsaved: 'Not saved yet: please press "Save".', error: 'Error', toggleFailed: 'Could not set the switch',
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
    bike: 'M2 16.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0zM15 16.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0zM5.5 16.5 9 9h6l3.5 7.5M12 16.5 9 9M8 6.5h3M15 9l-1-3h2.5',
    dishwasher: 'M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM4 7h16M7.5 5h1M11.5 5h1M7 11.5h10M7 15.5h10',
    boiler: 'M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM6 8h12M12 11.5s2.5 2.3 2.5 4a2.5 2.5 0 0 1-5 0c0-1.7 2.5-4 2.5-4z',
    washer: 'M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM4 7.5h16M7.5 5.2h1.5M8.5 14a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0z',
    tumbler: 'M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM4 7h16M8 5h1.5M11.5 5h1.5M8.5 14.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0zM10 15.3c0-1 .9-1.8 1.9-1.8s1.9.8 1.9 1.8',
    fan: 'M10.5 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0zM12 10.5C11 6 12 3 14.5 3c2 0 2.5 3-1 7M13.5 12c4.5-1 7.5 0 7.5 2.5 0 2-3 2.5-7-1M12 13.5c1 4.5 0 7.5-2.5 7.5-2 0-2.5-3 1-7M10.5 12C6 13 3 12 3 9.5c0-2 3-2.5 7 1',
    heatpump: 'M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM10 12a4 4 0 1 0 8 0 4 4 0 1 0-8 0zM14 8.5v7M10.5 12h7M5.5 9v6',
    dehumidifier: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 6.5h8M8 9h8M12 12c1.6 2 2.7 3.1 2.7 4.4a2.7 2.7 0 0 1-5.4 0C9.3 15.1 10.4 14 12 12z',
    pool: 'M2 15c1.5-1.4 3-1.4 4.5 0s3 1.4 4.5 0 3-1.4 4.5 0 3 1.4 4.5 0M2 20c1.5-1.4 3-1.4 4.5 0s3 1.4 4.5 0 3-1.4 4.5 0 3 1.4 4.5 0M8 4v9M16 4v9M8 7.5h8M8 11h8',
    ac: 'M12 3v18M4.2 7.5l15.6 9M19.8 7.5L4.2 16.5M9.5 4.5 12 6.5l2.5-2M9.5 19.5 12 17.5l2.5 2',
    heater: 'M12 3c.8 3.2 4.5 4.6 4.5 8.5a4.5 4.5 0 0 1-9 0c0-1.7.7-2.9 1.8-4 .1 1.3.8 2.2 1.7 2.6-.3-2.6.1-5 1-7.1z',
    sauna: 'M8 3c-1 1.5 1 2.5 0 4M12 3c-1 1.5 1 2.5 0 4M16 3c-1 1.5 1 2.5 0 4M3 12h18M5 12v8M19 12v8M7 16h10',
    freezer: 'M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM4 10h16M8 6v1.5M8 13v3',
    pump: 'M12 8a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 8V4h5M7 13H3M10 11l4 4M14 11l-4 4',
    light: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
    mower: 'M3 15a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3H3zM7 13c0-2 1-4 5-4s5 2 5 4M5.5 20.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0zM15.5 20.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0z',
    purifier: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 9h8M8 12h8M8 15h8M9 18h2',
    aquarium: 'M3 6h18v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM6 14c2-3 5-3 7 0-2 3-5 3-7 0zM13 14l3-2v4zM16 9h.01M18 11h.01',
    plus: 'M12 5v14M5 12h14',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
    chevron: 'M6 9l6 6 6-6',
    check: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12l3 3 5-6',
    warn: 'M12 3 2 20h20zM12 10v5M12 17.5v.5',
    shield: 'M12 21s7-3.5 7-9V6l-7-3-7 3v6c0 5.5 7 9 7 9z',
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
  var PREVIEW_KEY = 'dtc.previewNoEms';
  function readPreview() { try { return window.localStorage && window.localStorage.getItem(PREVIEW_KEY) === '1'; } catch (e) { return false; } }
  function writePreview(on) { try { if (window.localStorage) { if (on) window.localStorage.setItem(PREVIEW_KEY, '1'); else window.localStorage.removeItem(PREVIEW_KEY); } } catch (e) { /* ohne Speicher nur bis zum Neuladen */ } }
  /** Ohne Gerät (oder in der Vorschau «ohne Energiemanagement») bleibt die App ein reiner Preisbezug. */
  function noDevice() { return !!state.previewNoEms || !!(state.shadow && state.shadow.deviceExists === false); }
  function previewBannerHtml() {
    if (!state.previewNoEms) return '';
    return '<div class="ems-head ems-head-warn"><span class="ems-ic ems-ic-warn">' + icon('warn', 20) + '</span><div class="ems-head-t"><b>' + esc(S.previewBanner) + '</b>'
      + '<p style="margin:6px 0 0"><button class="btn" data-ems-previewoff="1">' + esc(S.previewOff) + '</button></p></div></div>';
  }
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

  // Kurze Erklärung hinter einem ⓘ: eingeklappt, ein Klick zeigt sie. Der Text kommt aus S.tips (Schlüssel = Feld-Id ohne «rowN-»/«ems-»).
  function tipFor(id) { return (S.tips && S.tips[String(id).replace(/^row\d+-/, '').replace(/^ems-/, '')]) || ''; }
  function tipI(id) { return ' <i class="ems-tip" data-ems-tip="tip-' + id + '">\u24d8</i>'; }
  function tipT(id, text) { return '<small class="ems-tiptext" id="tip-' + id + '" hidden>' + esc(text) + '</small>'; }
  function field(label, id, value, type, extra, tip) {
    var t = type || 'number';
    var tp = tip === undefined ? tipFor(id) : tip;
    return '<label class="ems-f"><span>' + esc(label) + (tp ? tipI(id) : '') + '</span><input id="' + id + '" type="' + t + '" value="' + esc(value) + '"' + (t === 'text' ? ' spellcheck="false" autocomplete="off"' : '') + (extra || '') + '></label>' + (tp ? tipT(id, tp) : '');
  }
  function check(label, id, on, tip) {
    var tp = tip === undefined ? tipFor(id) : tip;
    return '<label class="ems-c"><span class="swt"><input class="sw" id="' + id + '" type="checkbox"' + (on ? ' checked' : '') + '><i></i></span> <span>' + esc(label) + (tp ? tipI(id) : '') + '</span></label>' + (tp ? tipT(id, tp) : '');
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
        var vals = { power: Math.round(c.battery.chargePowerKw * 1000), target_soc: c.battery.targetSoc, normal_discharge: bc.normalDischargeW };
        var argsOf = { luna2000_start_force_charge: { power: vals.power, target_soc: vals.target_soc }, luna2000_set_working_mode: { mode: '2' } };
        var title = function (id, k) {
          var t = cardTitle(cards, id);
          var a = argsOf[id] || (id === 'luna2000_set_max_discharge_power' ? { power: k === 'hold' ? 0 : vals.normal_discharge } : null);
          if (!a) return t;
          var card = (cards.cards || []).filter(function (x) { return x.id === id; })[0] || {};
          var names = [];
          (card.title || '').replace(/\[\[([^\]]+)\]\]/g, function (m, n) { names.push(n); return m; });
          var show = function (n) {
            if (a[n] === undefined) return '…';
            var arg = (card.args || []).filter(function (x) { return x.name === n; })[0];
            var opt = arg && arg.values ? arg.values.filter(function (v) { return String(v.id) === String(a[n]); })[0] : null;
            return opt ? opt.title : String(a[n]);
          };
          var i = 0;
          return t.replace(/…/g, function () { return show(names[i++]); });
        };
        var steps = { charge: ['luna2000_start_force_charge'], hold: ['luna2000_stop_force_charge_discharge', 'luna2000_set_max_discharge_power'], normal: ['luna2000_stop_force_charge_discharge', 'luna2000_set_working_mode', 'luna2000_set_max_discharge_power'] };
        html += batteryValuesHtml(c, bc)
          + '<p class="ems-why"><b>' + esc(S.batCtlSteps) + '</b><br>'
          + esc(S.batModeCharge) + ': ' + steps.charge.map(function (x) { return title(x, 'charge'); }).map(esc).join(', ') + '<br>'
          + esc(S.batModeHold) + ': ' + steps.hold.map(function (x) { return title(x, 'hold'); }).map(esc).join(', ') + '<br>'
          + esc(S.batModeNormal) + ': ' + steps.normal.map(function (x) { return title(x, 'normal'); }).map(esc).join(', ') + ' (' + esc(S.batCarSkip) + ')</p>'
          + '<p class="ems-why ems-warn">' + esc(S.batCtlWarn) + '</p>';
      }
    }
    return html + '</div>';
  }

  function cardTitle(cards, id) {
    var k = ((cards && cards.cards) || []).filter(function (x) { return x.id === id; })[0];
    return k && k.title ? k.title.replace(/\[\[[^\]]*\]\]/g, '…') : id;
  }
  function fill(t, o) { return String(t).replace(/\{(\w+)\}/g, function (m, k) { return o[k] !== undefined && o[k] !== null ? o[k] : m; }); }
  /** Was «Morgen überbrücken» gerade vorhat (aus dem letzten Batterie-Lauf); '' wenn ausgeschaltet. */
  function bridgeText(all) {
    var b = state.cfg && state.cfg.battery;
    if (!b || b.bridge === false) return '';
    var mine = state.shadow && state.shadow.current && state.shadow.current.mine;
    var bi = mine && mine.bridgeInfo;
    var o = bi ? {
      kwh: bi.chargeKwh, soc: bi.target, at: bi.chargeAt ? hm(bi.chargeAt) : '-', from: bi.gapFrom ? hm(bi.gapFrom) : '-', to: bi.gapTo ? hm(bi.gapTo) : '-',
      sun: bi.untilMs ? hm(bi.untilMs) : '-', need: bi.needKwh, have: bi.haveKwh, load: bi.loadKw, how: bi.learned ? S.brHowLearned : S.brHowFixed,
    } : {};
    var t;
    if (!bi) t = mine ? S.brOff : '';
    else if (bi.status === 'charge') t = fill(S.brCharge, o);
    else if (bi.status === 'enough') t = fill(S.brEnough, o);
    else if (bi.status === 'unprofitable') t = fill(S.brUnprofitable, o);
    else if (bi.status === 'nogap') t = fill(S.brNoGap, o);
    else t = S.brNoSun;
    if (!t || (!all && (!bi || (bi.status !== 'charge' && bi.status !== 'enough')))) return '';
    return S.brTitle + ': ' + t;
  }

  /** Was der Fahrplan vorhat (letzter Batterie-Lauf, reserveMode auto); '' wenn nicht aktiv. */
  function scheduleText() {
    var mine = state.shadow && state.shadow.current && state.shadow.current.mine;
    var sc = mine && mine.schedule;
    if (!sc) return '';
    var o = {
      kwh: sc.chargeKwh, from: sc.chargeFrom ? hm(sc.chargeFrom) : '-', to: sc.chargeTo ? hm(sc.chargeTo) : '-', cp: sc.chargeAvg, dkwh: sc.dischargeKwh, dp: sc.dischargeAvg, chf: sc.valueChf !== null && sc.valueChf !== undefined ? sc.valueChf.toFixed(2) : '-',
    };
    if (sc.chargeKwh > 0) return fill(S.schText, o);
    if (sc.dischargeKwh > 0) return fill(S.schNoCharge, o);
    return S.schNothing;
  }

  /** Batterie-Planer: wie die Batterie über den Tag eingesetzt wird (gilt für Plan, Simulation und Steuerung). */
  function batteryPlanHtml() {
    var b = state.cfg.battery;
    var fixedMode = b.reserveMode === 'fixed';
    return '<div class="ems-box"><b>' + esc(S.bpTitle) + '</b>'
      + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.bpMode) + '</span><select id="ems-bp-mode" data-ems-bpmode="1">'
      + '<option value="auto"' + (fixedMode ? '' : ' selected') + '>' + esc(S.bpModeAuto) + '</option><option value="fixed"' + (fixedMode ? ' selected' : '') + '>' + esc(S.bpModeFixed) + '</option></select></label>'
      + (fixedMode ? field(S.bpReserve, 'ems-bp-reserve', b.reserveHours, 'number', ' step="1" min="0" max="24"') : '') + '</div>'
      + '<p class="ems-why">' + esc(fixedMode ? S.bpReserveHint : S.bpModeAutoHint) + '</p>'
      + '<div class="ems-row">' + field(S.batCtlTarget, 'ems-bp-target', b.targetSoc, 'number', ' step="5" min="10" max="100"') + field(S.batCtlPower, 'ems-bp-power', b.chargePowerKw, 'number', ' step="0.5" min="0.5" max="10"') + '</div>'
      + (fixedMode ? '<div class="ems-row">' + field(S.bpSolar, 'ems-bp-solar', b.solarLimitKwh, 'number', ' step="1" min="0"') + '</div><p class="ems-why">' + esc(S.bpSolarHint) + '</p>'
        + '<div class="ems-row">' + check(S.bpBridge, 'ems-bp-bridge', b.bridge !== false) + '</div>' : '')
      + (function () {
        var auto = b.bridgeLoadMode !== 'fixed';
        var load = state.shadow && state.shadow.load;
        var learned = load && load.days > 0 && load.morningKw !== null && load.morningKw !== undefined;
        var fixedKw = b.bridgeLoadKw !== undefined ? b.bridgeLoadKw : 1;
        var daysTxt = learned ? (load.days === 1 ? S.bpDay1 : fill(S.bpDays, { n: load.days })) : '';
        var info = auto ? (learned ? fill(S.bpLearned, { kw: load.morningKw.toFixed(1), days: daysTxt + (load.eveningKw ? ', ' + fill(S.bpEvening, { kw: load.eveningKw.toFixed(1) }) : '') }) : fill(S.bpLearning, { kw: fixedKw })) : '';
        var preview = fixedMode ? bridgeText(true) : scheduleText();
        return '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(fixedMode ? S.bpLoad : S.bpLoadSchedule) + '</span><select id="ems-bp-loadmode" data-ems-bploadmode="1">'
          + '<option value="auto"' + (auto ? ' selected' : '') + '>' + esc(S.bpLoadAuto + (learned ? ': ' + load.morningKw.toFixed(1) + ' kW' : '')) + '</option>'
          + '<option value="fixed"' + (auto ? '' : ' selected') + '>' + esc(S.bpLoadFixed) + '</option></select></label>'
          + (auto ? '' : field(S.bpLoadFixed, 'ems-bp-load', fixedKw, 'number', ' step="0.1" min="0.1" max="10"'))
          + field(S.bpFloor, 'ems-bp-floor', b.floorSoc !== undefined ? b.floorSoc : 10, 'number', ' step="5" min="0" max="50"') + '</div>'
          + (info ? '<p class="ems-why">' + esc(info) + '</p>' : '')
          + (fixedMode ? '<p class="ems-why">' + esc(S.bpBridgeHint) + '</p>' : '')
          + (preview ? '<p class="ems-why" style="color:var(--st-text)"><b>' + esc(preview) + '</b></p>' : '');
      }()) + '</div>' + backupReserveHtml(b);
  }
  /** Notstrom-Reserve: nur die Reserve (%) ist hier einstellbar - ein/aus geht nur über «Heute» oder einen Flow. */
  function backupReserveHtml(b) {
    var br = b.backupReserve || { active: false, soc: 50 };
    return '<div class="ems-box"><b>' + esc(S.backupTitle) + '</b>'
      + '<div class="ems-row">' + field(S.backupSoc, 'ems-bp-backupsoc', br.soc, 'number', ' step="5" min="0" max="100"') + '</div>'
      + '<p class="ems-why">' + esc(S.backupHint) + '</p>'
      + (br.active ? '<p class="ems-why" style="color:var(--st-text)"><b>' + esc(fill(S.backupActive, { soc: br.soc })) + '</b></p>' : '') + '</div>';
  }
  function batteryValuesHtml(c, bc) {
    return '<div class="ems-row">' + field(S.batCtlNormal, 'ems-bc-normal', bc.normalDischargeW, 'number', ' step="100" min="0"') + field(S.batCtlRepeat, 'ems-bc-repeat', bc.repeatMin, 'number', ' step="1" min="2" max="60"') + '</div>';
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
    var st = state.carCalStatus ? ' <span id="ems-carcal-st" class="ems-ok" style="font-size:12px">' + esc(state.carCalStatus) + '</span>' : ' <span id="ems-carcal-st" style="font-size:12px"></span>';
    return '<details class="ems-adv car-tpl"' + (state.carCalOpen || dirty ? ' open' : '') + '><summary data-ems-carcalopen="1">' + esc(S.carCal) + st + '</summary>'
      + '<p class="ems-why">' + esc(S.carCalHint) + '</p>'
      + '<table class="ems-t car-cal"><thead><tr><th></th><th></th><th>' + esc(S.carTime) + '</th><th>' + esc(S.carSoc) + '</th></tr></thead><tbody>' + rows + '</tbody></table>'
      + '<label class="ems-c"><span class="swt"><input class="sw" type="checkbox" data-ems-carcal="grid"' + (sc.gridCharge ? ' checked' : '') + '><i></i></span> <span>' + esc(S.carGrid) + '</span></label><p class="ems-why" style="margin-bottom:0">' + esc(S.carGridHint) + '</p></details>'
      + '<label class="ems-c" style="margin-top:6px"><span class="swt"><input class="sw" type="checkbox" data-ems-carcal="holiday"' + (sc.holiday ? ' checked' : '') + '><i></i></span> <span>' + esc(S.carHoliday) + '</span></label>'
      + (sc.holiday ? '<label class="ems-f" style="margin-left:54px"><span>' + esc(S.carHolidayUntil) + '</span><input type="date" data-ems-carcal="holidayUntil" value="' + esc(sc.holidayUntil || '') + '"></label>' : '');
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
      return why + sourceRow + deviceRow + '<div class="ems-row">' + field(S.factor, 'ems-pv-factor', factor, 'number', ' step="0.01" min="0.1" max="3"') + '</div><p class="ems-why">' + esc(S.factorHint) + '</p>' + pvAccuracyHtml(factor, !!pvc.factorAuto)
        + '<p class="ems-why">' + esc(S.fcCurveHint) + '</p><p class="ems-why ems-' + info.cls + '">' + esc(info.text) + '</p>';
    }
    var d = srcDevice(s.key);
    var batExtra = s.key === 'bat' && d.id ? batteryPlanHtml() + batteryControlHtml() : '';
    var carExtra = s.key === 'car' && d.id ? '<div class="ems-row">' + field(S.carCap, 'ems-car-cap', state.cfg.car ? state.cfg.car.capacityKwh : 0, 'number', ' step="1" min="0" max="300"') + '</div><p class="ems-why">' + esc(S.carSetupHint) + '</p>' : '';
    return why + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.device) + '</span><select id="src-' + s.key + '-dev" data-ems-src="' + s.key + '">' + deviceOptions(d.id, s.filter, s.tag === 'required' ? S.pick : S.none) + '</select></label>'
      + '<label class="ems-f ems-wide"><span>' + esc(S.value) + '</span><select id="src-' + s.key + '-cap">' + capOptions(d.id, s.re, d.cap) + '</select></label></div>' + carExtra + batExtra;
  }

  // ---------------------------------------------------------------- Zeilen (Verbraucher)

  function newConsumerRow() {
    return {
      kind: 'consumer', name: '', control: true, deviceId: '', type: 'generic', mode: hasBattery() ? 'full' : 'surplus', fullSoc: 98, socOn: 80, hysteresis: 5,
      minSurplusW: 300, startSustainS: 60, stopGraceS: 120, minRunMin: 30, minOffMin: 10, protectSoc: 20, useForecastGate: true, live: false,
      humidity: { enabled: false, sensorId: '', capability: 'measure_humidity', onAbove: 65, offBelow: 61, runMin: 60 },
      accu: { enabled: false, sensorId: '', capability: 'measure_battery', stopAt: 80, resumeBelow: 75, chargeBelow: 20, maxRunMin: 240 },
      program: {
        minSurplusW: 2000, startSustainS: 300, windowFrom: '18:00', maxWaitH: 4, durationH: 3, remoteCapability: '', remoteOkValue: 'Enabled', doorCapability: '', doorOkValue: 'Closed', stateCapability: '', stateIdleValue: '', startCapability: 'dishwasher_execute_command', startValue: 'START',
      },
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
      r.accu = Object.assign({}, newConsumerRow().accu, x.accu || {});
      r.program = Object.assign({}, newConsumerRow().program, x.program || {});
      r.flowOn = Object.assign({ id: '', advanced: false, name: '' }, x.flowOn || {});
      r.flowOff = Object.assign({ id: '', advanced: false, name: '' }, x.flowOff || {});
      rows.push(r);
    });
    meters.forEach(function (m) {
      if (used[m.name]) return;
      var r = newConsumerRow();
      r.control = false; r.name = m.name; r.meterDeviceId = m.deviceId; r.meterCap = m.capability; r.icon = m.icon || '';
      rows.push(r);
    });
    state.rows = rows;
  }

  // Priorität bei Überschuss = Reihenfolge der gesteuerten Verbraucher in der Liste (oben startet zuerst und geht zuletzt aus)
  function prioList() {
    var out = [];
    // Nur «Bei Überschuss»: Programme (Geschirrspüler, Waschmaschine ...) und die Modi nach Batteriestand haben eine eigene Regel, eine Reihenfolge würde dort nichts bewirken
    state.rows.forEach(function (r, i) { if (r.kind === 'consumer' && r.control !== false && r.deviceId && r.mode === 'surplus') out.push({ r: r, i: i }); });
    return out;
  }
  function prioRank(i) {
    var list = prioList(); var rank = 0;
    list.forEach(function (x, k) { if (x.i === i) rank = k + 1; });
    return list.length >= 2 ? rank : 0;
  }
  function prioArrows(i) {
    var list = prioList(); var pos = -1;
    list.forEach(function (x, k) { if (x.i === i) pos = k; });
    if (list.length < 2 || pos < 0) return '';
    return '<span class="ems-mvs"><button class="ems-mv" data-ems-move="' + i + ':-1" title="' + esc(S.prioUp) + '" aria-label="' + esc(S.prioUp) + '"' + (pos === 0 ? ' disabled' : '') + '>▲</button>'
      + '<button class="ems-mv" data-ems-move="' + i + ':1" title="' + esc(S.prioDown) + '" aria-label="' + esc(S.prioDown) + '"' + (pos === list.length - 1 ? ' disabled' : '') + '>▼</button></span>';
  }
  function prioRow(i) {
    var list = prioList(); var pos = -1;
    list.forEach(function (x, k) { if (x.i === i) pos = k; });
    if (list.length < 2 || pos < 0) return '';
    return '<div class="ems-row"><span class="ems-f" style="flex-basis:100%">' + esc(S.prioRow) + '</span>'
      + '<button class="btn" data-ems-move="' + i + ':-1"' + (pos === 0 ? ' disabled' : '') + '>▲ ' + esc(S.prioUp) + '</button>'
      + '<button class="btn" data-ems-move="' + i + ':1"' + (pos === list.length - 1 ? ' disabled' : '') + '>▼ ' + esc(S.prioDown) + '</button></div>'
      + '<p class="ems-why">' + esc(S.prioWhy) + '</p>';
  }

  function rowSub(r) {
    if (r.kind === 'charger') return r.deviceId ? (r.live ? S.modeLiveTag : S.modeTest) : S.notChosen;
    if (!r.control || !r.deviceId) return S.noCtrl;
    if (r.controlKind === 'flow' && !(r.flowOn && r.flowOn.id)) return S.notChosen;
    var m = { full: S.modeFull, soc: S.modeSoc, surplus: S.modeSurplus }[r.mode] || r.mode;
    return m + ' - ' + (r.live ? S.modeLiveTag : S.modeTest);
  }
  var CONSUMER_ICONS = ['plug', 'bike', 'dehumidifier', 'dishwasher', 'boiler', 'washer', 'tumbler', 'fan', 'heatpump', 'pool', 'ac', 'heater', 'sauna', 'freezer', 'pump', 'light', 'mower', 'purifier', 'aquarium'];
  function rowIcon(r) { return r.kind === 'charger' ? 'charger' : (r.icon && ICONS[r.icon] ? r.icon : (r.type === 'dehumidifier' ? 'dehumidifier' : 'plug')); }
  function consumerIconById(id, name) {
    var c = ((state.cfg && state.cfg.consumers) || []).filter(function (x) { return x.id === id || x.name === name; })[0];
    return c ? rowIcon(c) : 'plug';
  }
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

  // Hausbatterie-Schutz: wie viel vom Solarstrom das Auto in Abhängigkeit vom Batteriestand bekommt (gilt auch für Geräte ohne eigene Grenze)
  /** Prognose-Genauigkeit: Empfehlung für den Korrekturfaktor aus den letzten Tagen, Automatik-Schalter und Verlauf. */
  function pvAccuracyHtml(cur, auto) {
    var acc = state.shadow && state.shadow.pvAccuracy;
    if (!acc) return '';
    var r = acc.recommend;
    var line = r.factor === null
      ? S.pvAccNone.replace('{n}', r.days).replace('{m}', r.needed)
      : S.pvAccRec.replace('{f}', r.factor.toFixed(2)).replace('{n}', r.days).replace('{lo}', r.p25.toFixed(2)).replace('{hi}', r.p75.toFixed(2));
    if (r.recent) line += ' ' + S.pvAccRecent.replace('{f}', r.recent.factor.toFixed(2)).replace('{n}', r.recent.days);
    var btn = r.factor !== null && Math.abs(r.factor - cur) >= 0.005 ? ' <button class="btn" data-ems-pvapply="' + r.factor + '">' + esc(S.pvApply) + '</button>' : '';
    var rows = (acc.rows || []).map(function (x) {
      var dp = String(x.day).split('-');
      return '<tr' + (x.counted ? '' : ' class="ems-muted"') + '><td>' + dp[2] + '.' + dp[1] + (x.today ? ' (' + esc(S.pvAccToday) + ')' : '') + '</td><td>' + (x.forecastKwh === null ? '–' : x.forecastKwh) + '</td><td>' + x.actualKwh + '</td><td>' + (x.ratio === null ? '–' : x.ratio.toFixed(2)) + '</td></tr>';
    }).join('');
    var table = rows ? '<details class="ems-adv"' + (state.open['pvacc-log'] ? ' open' : '') + '><summary data-ems-adv="pvacc-log">' + esc(S.pvAccLog) + '</summary>'
      + '<table class="ems-t"><thead><tr><th>' + esc(S.pvAccDay) + '</th><th>' + esc(S.pvAccFc) + '</th><th>' + esc(S.pvAccAct) + '</th><th>' + esc(S.pvAccRatio) + '</th></tr></thead><tbody>' + rows + '</tbody></table>'
      + '<p class="ems-why">' + esc(S.pvAccNote) + '</p></details>' : '';
    return '<div class="ems-box"><b>' + esc(S.pvAccTitle) + '</b><p class="ems-why ' + (r.factor === null ? '' : 'ems-ok') + '" style="margin:4px 0">' + esc(line) + btn + '</p>'
      + '<div class="ems-row">' + check(S.pvAuto, 'ems-pv-auto', auto, S.pvAutoH) + '</div>' + table + '</div>';
  }

  // ------------------------------------------------------------ Anschluss der Wallbox (Capabilities und Flow-Karten)
  var WB_DEFAULT = { stateCapability: 'evcharger_charging_state', powerCapability: 'measure_power', phaseCapability: 'goe_measure_phase_switching', startCard: 'evcharger_charging_start', powerCard: 'target_power_set', powerArg: 'target_power' };

  function loadChargerCards(devId) {
    if (!devId || state.chargerCardsLoading || (state.chargerCards && state.chargerCards.deviceId === devId)) return;
    state.chargerCardsLoading = true;
    api('GET', '/ems/device-cards?id=' + encodeURIComponent(devId)).then(function (r) {
      state.chargerCards = { deviceId: devId, cards: (r && r.cards) || [] };
      state.chargerCardsLoading = false;
      renderSetup();
    }).catch(function () { state.chargerCards = { deviceId: devId, cards: [] }; state.chargerCardsLoading = false; renderSetup(); });
  }

  function wbCardOpts(cards, current, allowNone) {
    var list = (cards || []).slice();
    var has = list.some(function (c) { return c.id === current; });
    var html = allowNone ? '<option value=""' + (current ? '' : ' selected') + '>' + esc(S.wbNone) + '</option>' : '';
    if (current && !has) html += '<option value="' + esc(current) + '" selected>' + esc(current) + '</option>';
    return html + list.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === current ? ' selected' : '') + '>' + esc(c.title ? c.title + ' (' + c.id + ')' : c.id) + '</option>'; }).join('');
  }

  function wbLinkBox(r, p) {
    var c = (state.cfg && state.cfg.charger) || {};
    var cur = {};
    Object.keys(WB_DEFAULT).forEach(function (k) { cur[k] = c[k] === undefined ? WB_DEFAULT[k] : c[k]; });
    var isStd = Object.keys(WB_DEFAULT).every(function (k) { return cur[k] === WB_DEFAULT[k]; });
    var devId = r.deviceId;
    if (!devId) return ''; // ohne gewähltes Gerät gibt es nichts zuzuordnen (und nichts, was beim Speichern überschrieben würde)
    state.wbShown = !!state.open[p.slice(0, -1)]; // nur wenn die Zeile aufgeklappt ist, steht der Bereich wirklich auf der Seite
    var cards = devId && state.chargerCards && state.chargerCards.deviceId === devId ? state.chargerCards.cards : null;
    if (devId && !cards) loadChargerCards(devId);
    var capSel = function (id, label, value, none, hint) {
      var opts = (none ? '<option value=""' + (value ? '' : ' selected') + '>' + esc(S.wbNone) + '</option>' : '') + capOptions(devId, /./, value);
      return '<label class="ems-f ems-wide"><span>' + esc(label) + (hint ? tipI(id) : '') + '</span><select id="' + id + '">' + opts + '</select></label>' + (hint ? tipT(id, hint) : '');
    };
    var pc = (cards || []).filter(function (x) { return x.id === cur.powerCard; })[0];
    var numArgs = pc ? (pc.args || []).filter(function (a) { return a.type === 'number' || a.type === 'range'; }) : [];
    var argOpts = numArgs.length ? numArgs.map(function (a) { return '<option value="' + esc(a.name) + '"' + (a.name === cur.powerArg ? ' selected' : '') + '>' + esc(a.title || a.name) + ' (' + esc(a.name) + ')</option>'; }).join('')
      + (numArgs.some(function (a) { return a.name === cur.powerArg; }) ? '' : '<option value="' + esc(cur.powerArg) + '" selected>' + esc(cur.powerArg) + '</option>')
      : '<option value="' + esc(cur.powerArg) + '" selected>' + esc(cur.powerArg) + '</option>';
    var body = '<p class="ems-why">' + esc(S.wbLinkWhy) + '</p>'
      + '<div class="ems-row">' + capSel('ems-wb-state', S.wbState, cur.stateCapability, false) + capSel('ems-wb-power', S.wbPower, cur.powerCapability, false) + '</div>'
      + '<div class="ems-row">' + capSel('ems-wb-phase', S.wbPhase, cur.phaseCapability, true, S.wbPhaseH) + '</div>'
      + (cards === null && devId ? '<p class="ems-why">' + esc(S.wbCardsLoading) + '</p>' : '')
      + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.wbStartCard) + '</span><select id="ems-wb-startcard">' + wbCardOpts(cards, cur.startCard, true) + '</select></label></div>'
      + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.wbPowerCard) + '</span><select id="ems-wb-powercard" data-ems-sgdev="1">' + wbCardOpts(cards, cur.powerCard, false) + '</select></label>'
      + '<label class="ems-f"><span>' + esc(S.wbPowerArg) + '</span><select id="ems-wb-powerarg">' + argOpts + '</select></label></div>'
      + (cards && cards.length && !pc ? '<p class="warn">' + esc(S.wbNoPowerCard) + '</p>' : '');
    // Fehlt die gewählte Karte am Gerät, ist der Bereich von Anfang an offen und die Titelzeile weist darauf hin
    var attn = !!(cards && cards.length && !pc);
    if (attn && state.open[p + 'link'] === undefined) state.open[p + 'link'] = true;
    return '<details class="ems-adv"' + (state.open[p + 'link'] ? ' open' : '') + '><summary data-ems-adv="' + p + 'link">' + esc(S.wbLinkTitle) + ' · ' + esc(isStd ? S.wbStd : S.wbCustom) + (attn ? ' · <span class="ems-warn">⚠ ' + esc(S.wbCardMissing) + '</span>' : '') + '</summary>' + body + '</details>';
  }

  /** Auswahl aus den Feldern in die Konfiguration übernehmen (nur wenn der Bereich gezeichnet ist). */
  function syncWb() {
    if (!state.cfg || !state.wbShown || !$('ems-wb-state')) return;
    var c = state.cfg.charger;
    c.stateCapability = val('ems-wb-state', c.stateCapability) || WB_DEFAULT.stateCapability;
    c.powerCapability = val('ems-wb-power', c.powerCapability) || WB_DEFAULT.powerCapability;
    c.phaseCapability = ($('ems-wb-phase') || { value: c.phaseCapability }).value || '';
    c.startCard = ($('ems-wb-startcard') || { value: c.startCard }).value || '';
    c.powerCard = val('ems-wb-powercard', c.powerCard) || WB_DEFAULT.powerCard;
    c.powerArg = val('ems-wb-powerarg', c.powerArg) || WB_DEFAULT.powerArg;
  }

  /** Kleines Diagramm der Rampe: Batteriestand (x) gegen Anteil Solarstrom fürs Auto (y), mit Markierung «jetzt» und ggf. der Verschiebung durch den Bonus. */
  function shareChart(sh, info) {
    var X = function (v) { return 14 + v * 0.9; };
    var Y = function (v) { return 42 - v * 0.38; };
    var line = function (lo, hi, pl, ph, attrs) {
      var p = [[0, 0], [lo, 0], [lo, pl], [hi, ph], [100, ph]].map(function (a) { return X(a[0]).toFixed(1) + ',' + Y(a[1]).toFixed(1); }).join(' ');
      return '<polyline points="' + p + '" fill="none" ' + attrs + '/>';
    };
    var eff = info && info.lo !== undefined ? { lo: info.lo, hi: info.hi, pl: info.pctLow, ph: info.pctHigh } : { lo: sh.socLow, hi: sh.socHigh, pl: sh.pctLow, ph: sh.pctHigh };
    var svg = '<svg viewBox="0 0 108 54" class="share-svg" role="img" aria-label="' + esc(S.shareChartCap) + '">'
      + '<line x1="14" y1="42" x2="104" y2="42" stroke="var(--st-border)" stroke-width="1" vector-effect="non-scaling-stroke"/><line x1="14" y1="4" x2="14" y2="42" stroke="var(--st-border)" stroke-width="1" vector-effect="non-scaling-stroke"/>';
    if (info && info.shift > 0) svg += line(sh.socLow, sh.socHigh, sh.pctLow, sh.pctHigh, 'stroke="var(--st-muted)" stroke-width="1.2" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"');
    svg += line(eff.lo, eff.hi, eff.pl, eff.ph, 'stroke="var(--st-accent)" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"');
    if (info && info.soc !== null && info.soc !== undefined && info.pct !== null && info.pct !== undefined) {
      svg += '<line x1="' + X(info.soc).toFixed(1) + '" y1="4" x2="' + X(info.soc).toFixed(1) + '" y2="42" stroke="var(--st-text)" stroke-width="1" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>'
        + '<circle cx="' + X(info.soc).toFixed(1) + '" cy="' + Y(info.pct).toFixed(1) + '" r="1.6" fill="var(--st-text)"/>';
    }
    [0, 25, 50, 75, 100].forEach(function (v) { svg += '<text x="' + X(v).toFixed(1) + '" y="49.5" font-size="3.4" text-anchor="middle" fill="var(--st-muted)">' + v + '</text>'; });
    svg += '<text x="12" y="6.5" font-size="3.4" text-anchor="end" fill="var(--st-muted)">100 %</text><text x="12" y="43.5" font-size="3.4" text-anchor="end" fill="var(--st-muted)">0 %</text></svg>';
    return svg;
  }

  /** Diagramm, «Jetzt»-Zeile und Bonus-Meldung der Box (mit den Statusdaten und, wenn angegeben, den gerade getippten Werten). */
  function shareLiveHtml(sh) {
    var info = state.shadow && state.shadow.shareInfo;
    var now = info && info.pct !== null && info.pct !== undefined && info.soc !== null && info.soc !== undefined
      ? '<p class="ems-why ems-ok" style="margin:4px 0">' + esc(S.shareNow.replace('{soc}', info.soc).replace('{pct}', info.pct)) + '</p>' : '';
    return '<span class="ems-f">' + esc(S.shareChartCap) + '</span>' + shareChart(sh, info) + now;
  }
  function shareBonusLine() {
    return state.shadow && state.shadow.shareShift > 0 ? '<p class="ems-why ems-ok" style="margin:4px 0">' + esc(S.shareBonusNow.replace('{n}', state.shadow.shareShift)) + '</p>' : '';
  }
  /** Ohne Neuzeichnen der Eingabefelder aktualisieren (beim Status-Update und beim Tippen). */
  function updateShareLive() {
    var el = $('ems-share-live');
    if (!el || !state.cfg) return;
    el.innerHTML = shareLiveHtml(shareCollect(state.cfg.share));
    var b = $('ems-share-bonusnow');
    if (b) b.innerHTML = shareBonusLine();
  }

  // Hausbatterie-Schutz: wie viel vom Solarstrom das Auto in Abhängigkeit vom Batteriestand bekommt (gilt auch für Geräte ohne eigene Grenze)
  function shareBox() {
    var sh = (state.cfg && state.cfg.share) || { socLow: 50, socHigh: 80, pctLow: 0, pctHigh: 100 };
    var num0 = ' step="5" min="0" max="100"';
    return '<div class="ems-box"><b>' + esc(S.shareTitle) + '</b><p class="ems-why">' + esc(S.shareWhy) + '</p>'
      + '<div class="ems-row"><span class="ems-f" style="flex-basis:100%">' + esc(S.shareLowRow) + '</span>'
      + field(S.shareAt, 'ems-share-lo', sh.socLow, 'number', num0) + field(S.shareGets, 'ems-share-pctlo', sh.pctLow, 'number', num0) + '</div>'
      + '<div class="ems-row"><span class="ems-f" style="flex-basis:100%">' + esc(S.shareHighRow) + '</span>'
      + field(S.shareAt, 'ems-share-hi', sh.socHigh, 'number', num0) + field(S.shareGets, 'ems-share-pcthi', sh.pctHigh, 'number', num0) + '</div>'
      + '<div id="ems-share-live" style="margin:8px 0 2px">' + shareLiveHtml(sh) + '</div>'
      + '<p class="ems-why">' + esc(S.shareEx) + '</p>'
      + '<div class="ems-box" style="margin:8px 0 0"><b>' + esc(S.shareBonusTitle) + '</b>'
      + '<div class="ems-row">' + field(S.shareBonus, 'ems-share-bonus', sh.forecastBonus || 0, 'number', ' step="5" min="0" max="40"', S.shareBonusH) + '</div><div id="ems-share-bonusnow">' + shareBonusLine() + '</div></div></div>';
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
        + field(S.name, p + 'name', r.name, 'text', ' style="max-width:115px"') + '</div>'
        + meterRow + lastTxt
        + wbLinkBox(r, p)
        + shareBox()
        + '<div class="ems-row">' + field(S.maxAmps, p + 'maxAmps', r.maxAmps) + field(S.stepHold, p + 'stepHold', r.stepHoldS) + '</div>'
        + '<label class="ems-c"><span class="swt"><input class="sw" type="checkbox" id="' + p + 'autoOff"' + (r.autoOff !== false ? ' checked' : '') + '><i></i></span> <span>' + esc(S.chargeNowAutoOff) + '</span></label>';
    }
    var modes = [['surplus', S.modeSurplus], ['program', S.modeProgram]].concat(hasBattery() ? [['full', S.modeFull], ['soc', S.modeSoc]] : []);
    if (!hasBattery() && (r.mode === 'full' || r.mode === 'soc')) modes.push([r.mode, r.mode === 'full' ? S.modeFull : S.modeSoc]);
    var modeOpts = modes.map(function (m) { return '<option value="' + m[0] + '"' + (m[0] === r.mode ? ' selected' : '') + '>' + esc(m[1]) + '</option>'; }).join('');
    var params = '';
    if (r.mode === 'full') params += field(S.fullSoc, p + 'fullSoc', r.fullSoc) + field(S.hysteresis, p + 'hysteresis', r.hysteresis);
    if (r.mode === 'soc') params += field(S.socOn, p + 'socOn', r.socOn) + field(S.hysteresis, p + 'hysteresis', r.hysteresis);
    if (r.mode === 'surplus') {
      params += field(S.minSurplus, p + 'minSurplusW', r.minSurplusW) + field(S.startSustain, p + 'startSustainS', r.startSustainS) + field(S.stopGrace, p + 'stopGraceS', r.stopGraceS);
      if (hasBattery()) params += '<label class="ems-f"><span>' + esc(S.batFirst) + '</span><input type="number" id="' + p + 'batFirst" min="0" max="100" step="5" placeholder="' + esc(S.batFirstPh) + '" value="' + (r.batteryFirstSoc === null || r.batteryFirstSoc === undefined ? '' : esc(r.batteryFirstSoc)) + '"></label>';
    }
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
      var hum = true
        ? '<div class="ems-box"><b>' + esc(S.humTitle) + '</b><div class="ems-row">' + check(S.humEnable, p + 'humEnable', h.enabled) + '</div>'
          + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.humSensor) + '</span><select id="' + p + 'humSensor">' + deviceOptions(h.sensorId, hasCap(/^measure_humidity$/), S.none) + '</select></label>'
          + field(S.humOn, p + 'humOn', h.onAbove) + field(S.humOff, p + 'humOff', h.offBelow) + field(S.humRun, p + 'humRun', h.runMin) + '</div><p class="ems-why">' + esc(S.humHint) + '</p></div>'
        : '';
      var ac = r.accu || newConsumerRow().accu;
      var accu = '<div class="ems-box"><b>' + esc(S.accuTitle) + '</b><div class="ems-row">' + check(S.accuEnable, p + 'accuEnable', ac.enabled) + '</div>'
        + (ac.enabled ? '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.accuSensor) + '</span><select id="' + p + 'accuSensor" data-ems-mode="' + i + '">' + deviceOptions(ac.sensorId, hasCap(/^measure_battery/), S.none) + '</select></label>'
          + '<label class="ems-f"><span>' + esc(S.accuCap) + '</span><select id="' + p + 'accuCap">' + capOptions(ac.sensorId, /^measure_battery/, ac.capability) + '</select></label></div>'
          + '<div class="ems-row">' + field(S.accuStop, p + 'accuStop', ac.stopAt) + field(S.accuResume, p + 'accuResume', ac.resumeBelow) + field(S.accuLow, p + 'accuLow', ac.chargeBelow) + field(S.accuMax, p + 'accuMax', ac.maxRunMin) + '</div>'
          + '<p class="ems-why">' + esc(S.accuHint) + '</p>' : '')
        + '</div>';
      var pg = r.program || newConsumerRow().program;
      var program = '<div class="ems-box"><b>' + esc(S.programTitle) + '</b>'
        + '<div class="ems-row">' + field(S.minSurplus, p + 'pgSurplus', pg.minSurplusW) + field(S.startSustain, p + 'pgSustain', pg.startSustainS) + '</div>'
        + '<div class="ems-row">' + field(S.programWindow, p + 'pgFrom', pg.windowFrom, 'time') + field(S.programMaxWait, p + 'pgWait', pg.maxWaitH, 'number', ' step="1" min="1" max="12"') + field(S.programDuration, p + 'pgDuration', pg.durationH, 'number', ' step="0.5" min="0.5" max="8"') + '</div>'
        + '<p class="ems-why">' + esc(S.programHint) + '</p>'
        + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.programStartCap) + '</span><select id="' + p + 'pgStartCap" data-ems-mode="' + i + '">' + capOptions(r.deviceId, /.*/, pg.startCapability) + '</select></label>'
        + field(S.programStartVal, p + 'pgStartVal', pg.startValue, 'text', ' style="max-width:115px"') + '</div>'
        + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.programRemoteCap) + '</span><select id="' + p + 'pgRemoteCap" data-ems-mode="' + i + '">' + '<option value="">' + esc(S.none) + '</option>' + capOptions(r.deviceId, /.*/, pg.remoteCapability) + '</select></label>'
        + field(S.programRemoteVal, p + 'pgRemoteVal', pg.remoteOkValue, 'text', ' style="max-width:115px"') + '</div>'
        + (pg.remoteCapability ? '' : '<p class="warn">' + esc(S.programRemoteWarn) + '</p>')
        + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.programDoorCap) + '</span><select id="' + p + 'pgDoorCap" data-ems-mode="' + i + '">' + '<option value="">' + esc(S.none) + '</option>' + capOptions(r.deviceId, /.*/, pg.doorCapability) + '</select></label>'
        + field(S.programDoorVal, p + 'pgDoorVal', pg.doorOkValue, 'text', ' style="max-width:115px"') + '</div>'
        + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.programStateCap) + '</span><select id="' + p + 'pgStateCap" data-ems-mode="' + i + '">' + '<option value="">' + esc(S.none) + '</option>' + capOptions(r.deviceId, /.*/, pg.stateCapability) + '</select></label>'
        + field(S.programStateVal, p + 'pgStateVal', pg.stateIdleValue, 'text', ' style="max-width:115px"') + '</div>'
        + '<p class="ems-why">' + esc(S.programStateHint) + '</p>'
        + '</div>';
      ctrlBody = '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.mode) + tipI(p + 'mode') + '</span><select id="' + p + 'mode" data-ems-mode="' + i + '">' + modeOpts + '</select></label>' + tipT(p + 'mode', S.tips.mode) + '</div>'
        + (hasBattery() ? '' : '<p class="ems-why">' + esc(S.noBatMode) + '</p>')
        + (r.mode === 'program' ? program : ('<div class="ems-row">' + params + '</div>' + (r.mode === 'surplus' && hasBattery() ? '<p class="ems-why">' + esc(S.batFirstHint) + '</p>' : '') + accu
          + '<details class="ems-adv"' + (state.open[p + 'adv'] ? ' open' : '') + '><summary data-ems-adv="' + p + 'adv">' + esc(S.advanced) + '</summary><div class="ems-row">'
          + field(S.minRun, p + 'minRunMin', r.minRunMin) + field(S.minOff, p + 'minOffMin', r.minOffMin) + field(S.protect, p + 'protectSoc', r.protectSoc) + '</div>'
          + '<div class="ems-row">' + check(S.useGate, p + 'useGate', r.useForecastGate) + '</div>' + hum + '</details>'));
    }
    return '<div class="ems-row">'
      + field(S.name, p + 'name', r.name, 'text', ' style="max-width:115px"') + '</div>'
      + '<div class="ems-row" style="gap:4px"><span class="ems-f" style="flex-basis:100%">' + esc(S.iconLbl) + '</span>' + CONSUMER_ICONS.map(function (k) {
        return '<button class="ic-pick' + (rowIcon(r) === k ? ' on' : '') + '" data-ems-icon="' + i + ':' + k + '" title="' + esc(S.iconNames[k] || k) + '">' + icon(k, 18) + '</button>';
      }).join('') + '</div>'
      + prioRow(i)
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
      + '<p class="ems-suggest"><button class="btn" data-ems-suggest="1">' + esc(S.suggest) + '</button> <button class="btn" data-ems-previewon="1">' + esc(S.previewOn) + '</button> <span class="sub" id="ems-suggest-msg">' + esc(state.suggestMsg || '') + '</span></p>';
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
      var head = '<div class="ems-row" style="align-items:center;margin:4px 0"><span style="flex:1;font-size:14px">' + (i + 1) + '. ' + esc(shedName(e)) + '</span>'
        + (i > 0 ? '<button class="btn" data-ems-fuseup="' + i + '">' + esc(S.fuseUp) + '</button>' : '')
        + '<button class="btn" data-ems-fusedel="' + i + '">' + esc(S.fuseDel) + '</button></div>';
      if (e.kind === 'flow') return head;
      var auto;
      if (e.kind === 'charger') {
        auto = S.fuseAutoCharger;
      } else {
        var d = findDevice(e.id);
        var caps = (d && d.caps) || [];
        auto = caps.indexOf('onoff') >= 0 ? S.fuseAutoOnoff : (caps.indexOf('thermostat_mode') >= 0 ? S.fuseAutoThermostat : S.fuseAutoNone);
      }
      var viaFlow = !!(e.offFlow && e.offFlow.id !== undefined);
      var key = 'fuseshed' + i;
      return head + '<details class="ems-adv" style="margin:0 0 8px"' + (state.open[key] ? ' open' : '') + '><summary data-ems-adv="' + key + '">' + esc(S.fuseHowTitle) + '</summary>'
        + '<div class="ems-row"><label class="ems-f ems-wide"><span>&nbsp;</span><select data-ems-fuseshedkind="' + i + '">'
        + '<option value="auto"' + (viaFlow ? '' : ' selected') + '>' + esc(S.fuseAutoLbl) + '</option>'
        + '<option value="flow"' + (viaFlow ? ' selected' : '') + '>' + esc(S.fuseFlow) + '</option>'
        + '</select></label></div>'
        + (viaFlow
          ? '<div class="ems-row"><label class="ems-f ems-wide"><span>&nbsp;</span><select data-ems-fuseshedflow="' + i + '">' + flowOptions(e.offFlow) + '</select></label></div>'
          : '<p class="ems-why">' + esc(auto) + '</p>')
        + '</details>';
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

  // ---------------------------------------------------------------- SG-Ready (Boiler/Wärmepumpe)

  function sgCfg() {
    if (!state.cfg.sgready) state.cfg.sgready = { enabled: false, live: false, recommendRelay: { deviceId: '', capability: 'onoff' }, forceRelay: { deviceId: '', capability: 'onoff' } };
    return state.cfg.sgready;
  }
  function sgSummary() {
    var g = sgCfg();
    if (!g.enabled) return { text: S.sgOff, cls: 'muted' };
    var cur = state.shadow && state.shadow.sgready;
    return { text: cur ? (S.sgState[cur.state] || cur.state) + ' - ' + cur.reason : S.sgRow, cls: 'ok' };
  }
  function sgDevPair(label, idBase, devId, cap, re, tip) {
    return '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(label) + (tip ? tipI(idBase) : '') + '</span><select id="' + idBase + '-dev" data-ems-sgdev="1">' + deviceOptions(devId, hasCap(re), S.pick) + '</select></label>'
      + '<label class="ems-f ems-wide"><span>&nbsp;</span><select id="' + idBase + '-cap">' + capOptions(devId, re, cap) + '</select></label>' + (tip ? tipT(idBase, tip) : '') + '</div>';
  }
  function sgFld(label, id, value, type, extra, hint) { return '<div class="ems-row">' + field(label, id, value, type, extra, hint) + '</div>'; }
  function sgFlowSel(label, id, cur) {
    return '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(label) + '</span><select id="' + id + '">' + flowOptions(cur) + '</select></label></div>';
  }
  // Zieltemperatur: fest oder aus der Wärmepumpe (WW-Soll). Die Wärmepumpe schaltet selbst bei Soll + Hysterese ab - ein festes Ziel darüber würde nie erreicht.
  function targetBlock(pre, c, manualId, label, manualTip) {
    var dev = c.targetSource === 'device';
    return '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.tgtSource) + tipI(pre + '-tgtsrc') + '</span><select id="' + pre + '-tgtsrc" data-ems-sgdev="1"><option value="manual"' + (dev ? '' : ' selected') + '>' + esc(S.tgtManual) + '</option><option value="device"' + (dev ? ' selected' : '') + '>' + esc(S.tgtDevice) + '</option></select></label>' + tipT(pre + '-tgtsrc', S.tgtSrcH) + '</div>'
      + (dev ? sgDevPair(S.tgtDev, pre + '-tgt', c.targetId, c.targetCapability, /^(measure|target)_temperature/) + '<div class="ems-row">' + field(S.tgtHyst, pre + '-tgthyst', c.targetHyst, 'number', ' step="0.5" min="0" max="15"', S.tgtHystH) + field(S.tgtTol, pre + '-tgttol', c.targetTol, 'number', ' step="0.5" min="0" max="10"', S.tgtTolH) + '</div>' : '')
      + sgFld(dev ? S.tgtFallback : label, manualId, c.targetTemp, 'number', ' step="1" min="20" max="90"', dev ? S.tgtFallbackH : manualTip);
  }
  function syncTarget(pre, manualId, c) {
    c.targetSource = val(pre + '-tgtsrc', c.targetSource) === 'device' ? 'device' : 'manual';
    c.targetTemp = num(manualId, c.targetTemp);
    if ($(pre + '-tgt-dev')) {
      c.targetId = $(pre + '-tgt-dev').value || '';
      c.targetCapability = c.targetId ? val(pre + '-tgt-cap', c.targetCapability) : '';
    }
    if ($(pre + '-tgttol')) c.targetTol = num(pre + '-tgttol', c.targetTol);
    if ($(pre + '-tgthyst')) c.targetHyst = num(pre + '-tgthyst', c.targetHyst);
  }
  function sgBody() {
    var g = sgCfg();
    var flows = g.output === 'flows';
    var html = '<p class="ems-why">' + esc(S.sgWhy) + '</p><div class="ems-row">' + check(S.sgOn, 'ems-sg-on', g.enabled) + '</div>';
    return html
      + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.sgBasis) + tipI('sg-basis') + '</span><select id="ems-sg-basis"><option value="pv"' + (g.basis === 'export' ? '' : ' selected') + '>' + esc(S.sgBasisPv) + '</option><option value="export"' + (g.basis === 'export' ? ' selected' : '') + '>' + esc(S.sgBasisExport) + '</option></select></label>' + tipT('sg-basis', S.sgBasisH) + '</div>'
      + sgFld(S.sgMinSolar, 'ems-sg-minsolar', g.minSolarW, 'number', ' step="100" min="0"', S.sgMinSolarH)
      + sgFld(S.sgMinSoc, 'ems-sg-minsoc', g.minSoc, 'number', ' step="1" min="0" max="100"', S.sgMinSocH)
      + sgDevPair(S.sgSensor, 'ems-sg-sensor', g.sensorId, g.tempCapability, /^measure_temperature/, S.sgSensorH)
      + targetBlock('ems-sg', g, 'ems-sg-temp', S.sgTemp, S.sgTempH)
      + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.sgOutput) + tipI('sg-output') + '</span><select id="ems-sg-output" data-ems-sgdev="1"><option value="relays"' + (flows ? '' : ' selected') + '>' + esc(S.sgOutRelays) + '</option><option value="flows"' + (flows ? ' selected' : '') + '>' + esc(S.sgOutFlows) + '</option></select></label>' + tipT('sg-output', S.sgOutH) + '</div>'
      + (flows
        ? sgFlowSel(S.sgFlowNormal, 'ems-sg-fn', g.flowNormal) + sgFlowSel(S.sgFlowBoost, 'ems-sg-fb', g.flowBoost) + (g.allowForced ? sgFlowSel(S.sgFlowForced, 'ems-sg-ff', g.flowForced) : '')
        : sgDevPair(S.sgRecRelay, 'ems-sg-rec', g.recommendRelay.deviceId, g.recommendRelay.capability, /^onoff/)
          + (g.allowForced ? sgDevPair(S.sgForceRelay, 'ems-sg-frc', g.forceRelay.deviceId, g.forceRelay.capability, /^onoff/) : ''))
      + '<details class="ems-adv"' + (state.open['sg-adv'] ? ' open' : '') + '><summary data-ems-adv="sg-adv">' + esc(S.advanced) + '</summary>'
      + sgFld(S.sgHyst, 'ems-sg-hyst', g.socHysteresis, 'number', ' step="1" min="0" max="50"', S.sgHystH)
      + sgFld(S.sgTo, 'ems-sg-to', g.windowTo, 'time', '', S.sgToH)
      + sgFld(S.sgStartDelay, 'ems-sg-startdelay', g.startDelayMin, 'number', ' step="1" min="0"', S.sgStartDelayH)
      + sgFld(S.sgMinRun, 'ems-sg-minrun', g.minRunMin, 'number', ' step="5" min="0"', S.sgMinRunH)
      + sgFld(S.sgStopDelay, 'ems-sg-stopdelay', g.stopDelayMin, 'number', ' step="1" min="0"', S.sgStopDelayH)
      + sgFld(S.sgCooldown, 'ems-sg-cooldown', g.cooldownMin, 'number', ' step="5" min="0"', S.sgCooldownH)
      + sgFld(S.sgPvBelow, 'ems-sg-pvbelow', g.pvBelowTemp, 'number', ' step="1" min="0" max="90"', S.sgPvBelowH)
      + sgDevPair(S.sgMode, 'ems-sg-mode', g.modeId, g.modeCapability, /./, S.sgModeH)
      + (g.modeId ? '<div class="ems-row">' + field(S.sgModeOk, 'ems-sg-modeok', g.modeOkValue, 'text') + '</div>' : '')
      + sgDevPair(S.sgFeedback, 'ems-sg-fbk', g.feedbackId, g.feedbackCapability, /./, S.sgFeedbackH)
      + '<div class="ems-row">' + check(S.sgForced, 'ems-sg-forced', g.allowForced, S.sgForcedH) + (g.allowForced ? field(S.sgForcedW, 'ems-sg-forcedw', g.forcedMinW, 'number', ' step="100" min="0"') : '') + '</div>'
      + '</details>'
      + '<div class="ems-row">' + check(S.sgLive, 'ems-sg-live', g.live) + '</div><p class="ems-why ems-warn">' + esc(S.sgLiveHint) + '</p>';
  }
  function syncSg() {
    if (!state.cfg || !state.open.sg || !$('ems-sg-on')) return;
    var g = sgCfg();
    g.enabled = chk('ems-sg-on');
    if (!$('ems-sg-basis')) return;
    g.basis = val('ems-sg-basis', g.basis) === 'export' ? 'export' : 'pv';
    g.minSolarW = num('ems-sg-minsolar', g.minSolarW); g.minSoc = num('ems-sg-minsoc', g.minSoc); g.socHysteresis = num('ems-sg-hyst', g.socHysteresis);
    syncTarget('ems-sg', 'ems-sg-temp', g); g.windowTo = val('ems-sg-to', g.windowTo);
    g.startDelayMin = num('ems-sg-startdelay', g.startDelayMin); g.minRunMin = num('ems-sg-minrun', g.minRunMin);
    g.stopDelayMin = num('ems-sg-stopdelay', g.stopDelayMin); g.cooldownMin = num('ems-sg-cooldown', g.cooldownMin);
    g.pvBelowTemp = num('ems-sg-pvbelow', g.pvBelowTemp);
    g.allowForced = chk('ems-sg-forced');
    if ($('ems-sg-forcedw')) g.forcedMinW = num('ems-sg-forcedw', g.forcedMinW);
    g.sensorId = val('ems-sg-sensor-dev', g.sensorId); g.tempCapability = val('ems-sg-sensor-cap', g.tempCapability);
    g.modeId = ($('ems-sg-mode-dev') || { value: g.modeId }).value || '';
    if ($('ems-sg-mode-cap')) g.modeCapability = g.modeId ? val('ems-sg-mode-cap', g.modeCapability) : '';
    if ($('ems-sg-modeok')) g.modeOkValue = String($('ems-sg-modeok').value || '');
    g.feedbackId = ($('ems-sg-fbk-dev') || { value: g.feedbackId }).value || '';
    if ($('ems-sg-fbk-cap')) g.feedbackCapability = g.feedbackId ? val('ems-sg-fbk-cap', g.feedbackCapability) : '';
    g.output = val('ems-sg-output', g.output) === 'flows' ? 'flows' : 'relays';
    if ($('ems-sg-rec-dev')) g.recommendRelay = { deviceId: val('ems-sg-rec-dev', g.recommendRelay.deviceId), capability: val('ems-sg-rec-cap', g.recommendRelay.capability) };
    if ($('ems-sg-frc-dev')) g.forceRelay = { deviceId: val('ems-sg-frc-dev', g.forceRelay.deviceId), capability: val('ems-sg-frc-cap', g.forceRelay.capability) };
    if ($('ems-sg-fn')) g.flowNormal = pickFlow($('ems-sg-fn').value || '', g.flowNormal);
    if ($('ems-sg-fb')) g.flowBoost = pickFlow($('ems-sg-fb').value || '', g.flowBoost);
    if ($('ems-sg-ff')) g.flowForced = pickFlow($('ems-sg-ff').value || '', g.flowForced);
    g.live = chk('ems-sg-live');
  }

  // ---------------------------------------------------------------- Warmwasser-Programm bei günstigem Preis (unabhängig von SG-Ready)

  function dhwCfg() {
    if (!state.cfg.dhw) state.cfg.dhw = { enabled: false, live: false };
    return state.cfg.dhw;
  }
  function dhwSummary() {
    var d = dhwCfg();
    if (!d.enabled) return { text: S.dhwOff, cls: 'muted' };
    var cur = state.shadow && state.shadow.dhw;
    return { text: cur ? (cur.on ? S.dhwRunning : S.dhwWaiting) + ' - ' + cur.reason : S.dhwRow, cls: 'ok' };
  }
  // Vorschau: wann wären die günstigsten N Stunden heute und morgen (gleiche Auswahl wie auf dem Server, lib/ems/planner/dhw.js)
  function dhwCheapestOf(slots, hours) {
    var n = Math.max(1, Math.round(hours * 4));
    if (!slots || slots.length < n) return null;
    var chosen = slots.slice().sort(function (a, b) { return (a[1] - b[1]) || (a[0] - b[0]); }).slice(0, n).sort(function (a, b) { return a[0] - b[0]; });
    var ranges = [];
    var sum = 0;
    chosen.forEach(function (sl) {
      sum += sl[1];
      var last = ranges[ranges.length - 1];
      if (last && last.end === sl[0]) last.end = sl[0] + 900000; else ranges.push({ start: sl[0], end: sl[0] + 900000 });
    });
    return { ranges: ranges, avg: sum / n };
  }
  function dhwPreviewHtml(hours) {
    var dp = state.shadow && state.shadow.dhwPrices;
    if (!dp) return '';
    var line = function (label, slots) {
      var c = dhwCheapestOf(slots, hours);
      if (!c) return '';
      return '<b>' + esc(label) + ':</b> ' + c.ranges.map(function (r) { return hm(r.start) + '-' + hm(r.end); }).join(', ') + ' (' + S.dhwAvg + ' ' + c.avg.toFixed(1) + ' Rp.)';
    };
    var parts = [line(S.dhwToday, dp.today), line(S.dhwTomorrow, dp.tomorrow)].filter(Boolean);
    return parts.length ? '<p class="ems-why">' + esc(S.dhwPreview) + ': ' + parts.join(' · ') + '</p>' : '<p class="ems-why">' + esc(S.dhwNoPrices) + '</p>';
  }
  /** Warmwasser verzögern (Option) mit allen Einstellungen. */
  var DLY = {
    enabled: false, flowDelay: { id: '', advanced: false, name: '' }, windowFrom: '05:00', windowTo: '14:00', minForecastKwh: 15, releaseWeekday: '16:00', releaseWeekend: '15:00', releaseLow: '10:00', comfortTemp: 32, startMargin: 3, priceRelease: true, priceBlockHours: 1.5,
  };
  function dlyCfg(d) { return Object.assign({}, DLY, d.delay || {}); }
  function delayBox(d) {
    var l = dlyCfg(d);
    var sh = state.shadow && state.shadow.dhw && state.shadow.dhw.delay;
    var now = sh && sh.active && sh.releaseAt
      ? '<p class="ems-why ems-ok" style="margin:4px 0">' + esc(S.dlyNow.replace('{time}', new Date(sh.releaseAt).toLocaleTimeString(LANG === 'de' ? 'de-CH' : 'en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' })).replace('{why}', sh.reason || '')) + '</p>' : '';
    var need = l.enabled && (!(l.flowDelay && l.flowDelay.id) || !(d.flowOff && d.flowOff.id) || d.output === 'capability') ? '<p class="ems-why ems-warn">' + esc(S.dlyNeed) + '</p>' : '';
    return '<div class="ems-box"><b>' + esc(S.dlyTitle) + '</b><p class="ems-why">' + esc(S.dlyWhy) + '</p>'
      + '<div class="ems-row">' + check(S.dlyOn, 'ems-dhw-dly-on', l.enabled, '') + '</div>' + now + need
      + '<div class="ems-row">' + field(S.dlyFrom, 'ems-dhw-dly-from', l.windowFrom, 'time') + field(S.dlyTo, 'ems-dhw-dly-to', l.windowTo, 'time') + '</div>'
      + '<div class="ems-row">' + field(S.dlyForecast, 'ems-dhw-dly-fc', l.minForecastKwh, 'number', ' step="1" min="0"', S.dlyForecastH) + field(S.dlyComfort, 'ems-dhw-dly-comfort', l.comfortTemp, 'number', ' step="1" min="10" max="60"', S.dlyComfortH) + '</div>'
      + '<div class="ems-row">' + field(S.dlyRelWd, 'ems-dhw-dly-rwd', l.releaseWeekday, 'time') + field(S.dlyRelWe, 'ems-dhw-dly-rwe', l.releaseWeekend, 'time') + '</div>'
      + sgFlowSel(S.dlyFlow, 'ems-dhw-dly-flow', l.flowDelay)
      + '<details class="ems-adv"' + (state.open['dhw-dly-adv'] ? ' open' : '') + '><summary data-ems-adv="dhw-dly-adv">' + esc(S.advanced) + '</summary>'
      + '<div class="ems-row">' + field(S.dlyRelLow, 'ems-dhw-dly-rlow', l.releaseLow, 'time', '', S.dlyRelLowH) + field(S.dlyMargin, 'ems-dhw-dly-margin', l.startMargin, 'number', ' step="0.5" min="0" max="10"', S.dlyMarginH) + '</div>'
      + '<div class="ems-row">' + check(S.dlyPriceRel, 'ems-dhw-dly-price', l.priceRelease, '') + field(S.dlyBlock, 'ems-dhw-dly-block', l.priceBlockHours, 'number', ' step="0.25" min="0.25" max="6"') + '</div></details></div>';
  }
  function syncDelay(d) {
    if (!$('ems-dhw-dly-on')) return;
    var l = dlyCfg(d);
    l.enabled = chk('ems-dhw-dly-on');
    if ($('ems-dhw-dly-flow')) l.flowDelay = pickFlow($('ems-dhw-dly-flow').value || '', l.flowDelay);
    l.windowFrom = val('ems-dhw-dly-from', l.windowFrom); l.windowTo = val('ems-dhw-dly-to', l.windowTo);
    l.minForecastKwh = num('ems-dhw-dly-fc', l.minForecastKwh); l.comfortTemp = num('ems-dhw-dly-comfort', l.comfortTemp);
    l.releaseWeekday = val('ems-dhw-dly-rwd', l.releaseWeekday); l.releaseWeekend = val('ems-dhw-dly-rwe', l.releaseWeekend);
    l.releaseLow = val('ems-dhw-dly-rlow', l.releaseLow); l.startMargin = num('ems-dhw-dly-margin', l.startMargin);
    l.priceRelease = chk('ems-dhw-dly-price'); l.priceBlockHours = num('ems-dhw-dly-block', l.priceBlockHours);
    d.delay = l;
  }

  function dhwBody() {
    var d = dhwCfg();
    var cap = d.output === 'capability';
    var dev = d.device || { deviceId: '', capability: '', onValue: '', offValue: '' };
    var html = '<p class="ems-why">' + esc(S.dhwWhy) + '</p><div class="ems-row">' + check(S.dhwOnLbl, 'ems-dhw-on', d.enabled) + '</div>';
    return html
      + sgFld(S.dhwCheapHours, 'ems-dhw-cheap', d.cheapHours, 'number', ' step="0.25" min="0.25" max="12" data-ems-sgdev="1"', S.dhwCheapH)
      + dhwPreviewHtml(d.cheapHours)
      + '<div class="ems-row">' + field(S.dhwPriceFrom, 'ems-dhw-pricefrom', d.priceFrom || '', 'date', '', S.dhwPriceFromH) + '</div>'
      + sgFld(S.dhwBelow, 'ems-dhw-below', d.belowTemp, 'number', ' step="1" min="0" max="90"', S.dhwBelowH)
      + '<div class="ems-row">' + check(S.dhwSkipPv, 'ems-dhw-skippv', d.skipPv, S.dhwSkipPvH) + (d.skipPv ? field(S.dhwSkipPvKwh, 'ems-dhw-skippvkwh', d.skipPvKwh, 'number', ' step="1" min="0"') + field(S.dhwSkipUntil, 'ems-dhw-skipuntil', d.skipPvUntil, 'time', '', S.dhwSkipUntilH) : '') + '</div>'
      + sgDevPair(S.sgSensor, 'ems-dhw-sensor', d.sensorId, d.tempCapability, /^measure_temperature/, S.sgSensorH)
      + targetBlock('ems-dhw', d, 'ems-dhw-target', S.dhwTarget, S.dhwTargetH)
      + delayBox(d)
      + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.sgDhwOut) + tipI('dhw-out') + '</span><select id="ems-dhw-out" data-ems-sgdev="1"><option value="flows"' + (cap ? '' : ' selected') + '>' + esc(S.sgDhwFlows) + '</option><option value="capability"' + (cap ? ' selected' : '') + '>' + esc(S.sgDhwCap) + '</option></select></label>' + tipT('dhw-out', S.sgDhwH) + '</div>'
      + (cap
        ? sgDevPair(S.sgDhwDev, 'ems-dhw-dev', dev.deviceId, dev.capability, /./) + '<div class="ems-row">' + field(S.sgDhwOnV, 'ems-dhw-onv', dev.onValue, 'text') + field(S.sgDhwOffV, 'ems-dhw-offv', dev.offValue, 'text') + '</div>'
        : sgFlowSel(S.sgDhwOn, 'ems-dhw-flowon', d.flowOn) + sgFlowSel(S.sgDhwOff, 'ems-dhw-flowoff', d.flowOff))
      + '<details class="ems-adv"' + (state.open['dhw-adv'] ? ' open' : '') + '><summary data-ems-adv="dhw-adv">' + esc(S.advanced) + '</summary>'
      + sgDevPair(S.sgMode, 'ems-dhw-mode', d.modeId, d.modeCapability, /./, S.sgModeH)
      + (d.modeId ? '<div class="ems-row">' + field(S.sgModeOk, 'ems-dhw-modeok', d.modeOkValue, 'text') + field(S.dhwModeProgram, 'ems-dhw-modeprog', d.modeProgramValue, 'text', '', S.dhwModeProgramH) + '</div>' : '')
      + sgFld(S.sgStartDelay, 'ems-dhw-startdelay', d.startDelayMin, 'number', ' step="1" min="0"', S.sgStartDelayH)
      + sgFld(S.sgMinRun, 'ems-dhw-minrun', d.minRunMin, 'number', ' step="5" min="0"', S.dhwMinRunH)
      + sgFld(S.dhwMaxRun, 'ems-dhw-maxrun', d.maxRunMin, 'number', ' step="10" min="0"', S.dhwMaxRunH)
      + sgFld(S.sgStopDelay, 'ems-dhw-stopdelay', d.stopDelayMin, 'number', ' step="1" min="0"', S.sgStopDelayH)
      + sgFld(S.sgCooldown, 'ems-dhw-cooldown', d.cooldownMin, 'number', ' step="5" min="0"', S.sgCooldownH)
      + '</details>'
      + '<div class="ems-row">' + check(S.dhwLive, 'ems-dhw-live', d.live) + '</div><p class="ems-why ems-warn">' + esc(S.dhwLiveHint) + '</p>';
  }
  function syncDhw() {
    if (!state.cfg || !state.open.dhw || !$('ems-dhw-on')) return;
    var d = dhwCfg();
    d.enabled = chk('ems-dhw-on');
    if (!$('ems-dhw-cheap')) return;
    d.cheapHours = num('ems-dhw-cheap', d.cheapHours); d.belowTemp = num('ems-dhw-below', d.belowTemp);
    if ($('ems-dhw-pricefrom')) d.priceFrom = val('ems-dhw-pricefrom', d.priceFrom || '');
    syncDelay(d);
    d.skipPv = chk('ems-dhw-skippv');
    if ($('ems-dhw-skippvkwh')) { d.skipPvKwh = num('ems-dhw-skippvkwh', d.skipPvKwh); d.skipPvUntil = val('ems-dhw-skipuntil', d.skipPvUntil); }
    d.sensorId = val('ems-dhw-sensor-dev', d.sensorId); d.tempCapability = val('ems-dhw-sensor-cap', d.tempCapability);
    syncTarget('ems-dhw', 'ems-dhw-target', d);
    d.modeId = ($('ems-dhw-mode-dev') || { value: d.modeId }).value || '';
    if ($('ems-dhw-mode-cap')) d.modeCapability = d.modeId ? val('ems-dhw-mode-cap', d.modeCapability) : '';
    if ($('ems-dhw-modeok')) d.modeOkValue = String($('ems-dhw-modeok').value || '');
    if ($('ems-dhw-modeprog')) d.modeProgramValue = String($('ems-dhw-modeprog').value || '');
    d.startDelayMin = num('ems-dhw-startdelay', d.startDelayMin); d.minRunMin = num('ems-dhw-minrun', d.minRunMin); d.maxRunMin = num('ems-dhw-maxrun', d.maxRunMin);
    d.stopDelayMin = num('ems-dhw-stopdelay', d.stopDelayMin); d.cooldownMin = num('ems-dhw-cooldown', d.cooldownMin);
    d.output = val('ems-dhw-out', d.output) === 'capability' ? 'capability' : 'flows';
    if ($('ems-dhw-flowon')) d.flowOn = pickFlow($('ems-dhw-flowon').value || '', d.flowOn);
    if ($('ems-dhw-flowoff')) d.flowOff = pickFlow($('ems-dhw-flowoff').value || '', d.flowOff);
    if ($('ems-dhw-dev-dev')) {
      d.device = {
        deviceId: val('ems-dhw-dev-dev', ''), capability: val('ems-dhw-dev-cap', ''), onValue: String(($('ems-dhw-onv') || { value: '' }).value || ''), offValue: String(($('ems-dhw-offv') || { value: '' }).value || ''),
      };
    }
    d.live = chk('ems-dhw-live');
  }

  function listRow(key, ic, color, title, tagHtmlStr, summary, body) {
    var open = !!state.open[key];
    var sug = !!(state.suggested && state.suggested[key]);
    if (sug) tagHtmlStr = (tagHtmlStr || '') + '<span class="ems-tag ems-tag-sug">' + esc(S.suggestedTag) + '</span>';
    return '<div class="ems-item' + (open ? ' open' : '') + (sug ? ' ems-sug' : '') + '"><div class="ems-item-h" data-ems-open="' + esc(key) + '">'
      + '<span class="ems-ic" style="background:' + color + '">' + icon(ic, 17) + '</span>'
      + '<span class="ems-item-t"><span class="ems-item-n">' + esc(title) + ' ' + (tagHtmlStr || '') + '</span><span class="ems-item-s ems-' + summary.cls + '">' + esc(summary.text) + '</span></span>'
      + '<span class="ems-chev">' + icon('chevron', 16) + '</span></div>'
      + (open ? '<div class="ems-item-b">' + body + '<button class="ems-save ems-save-sec" data-ems-save="1"' + (state.dirty ? ' style="background:var(--st-warn,#d98a1a)"' : '') + '>' + esc(state.dirty ? S.saveDirty : S.saveSec) + '</button></div>' : '') + '</div>';
  }

  function calcDeviceCount() {
    var c = state.cfg;
    var ids = {};
    var add = function (id) { if (id) ids[id] = true; };
    add(c.devices.meter.id); add(c.devices.house.id); add(c.devices.inverter.id); add(c.battery.deviceId); add(c.car && c.car.deviceId);
    state.rows.forEach(function (r) {
      if (r.kind === 'charger') add(r.deviceId);
      else if (r.control !== false && r.deviceId) { if (r.controlKind !== 'flow') add(r.deviceId); if (r.humidity && r.humidity.enabled) add(r.humidity.sensorId); if (r.accu && r.accu.enabled) add(r.accu.sensorId); }
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
    state.wbShown = false; // wird beim Zeichnen des Wallbox-Anschlusses wieder gesetzt
    // Beim ersten Zeichnen die erste nicht eingerichtete Pflichtquelle aufklappen (danach entscheidet nur noch der Benutzer)
    if (!state.autoOpened && state.cfg && !noDevice()) {
      state.autoOpened = true;
      for (var ai = 0; ai < SOURCES.length; ai += 1) {
        var as = SOURCES[ai];
        var missing = as.key === 'price' ? priceMissing() : !srcDevice(as.key).id;
        if (srcTag(as) === 'required' && missing && state.open['src-' + as.key] === undefined) { state.open['src-' + as.key] = true; break; }
      }
    }
    var head = $('h2-emsdev');
    if (noDevice()) {
      host.innerHTML = previewBannerHtml() + '<p class="warn">' + esc(S.noDevice) + '</p>';
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
      var pr = prioRank(i);
      return listRow('row' + i, rowIcon(r), rowColor(r), name, (pr ? '<span class="ems-tag ems-tag-prio">' + esc(S.prioTag.replace('{n}', pr)) + '</span>' : '') + (r.kind === 'consumer' ? prioArrows(i) : ''), { text: rowSub(r), cls: r.deviceId && r.control !== false ? 'ok' : 'muted' }, rowBody(r, i));
    }).join('');
    host.innerHTML = styleHtml()
      + setupHeadHtml()
      + '<p class="lbl">' + esc(S.sources) + '</p><div class="ems-list">' + src + '</div>'
      + '<p class="lbl">' + esc(S.consumers) + '</p><div class="ems-list">' + rows
      + '<div class="ems-item ems-add" data-ems-add="1"><span class="ems-ic" style="background:var(--st-seg-bg);color:var(--st-text)">' + icon('plus', 17) + '</span><span class="ems-item-n">' + esc(S.addConsumer) + '</span></div></div>'
      + '<p class="lbl">' + esc(S.sgTitle) + '</p><div class="ems-list">' + listRow('sg', 'boiler', '#e67e22', S.sgRow, '', sgSummary(), sgBody()) + '</div>'
      + '<p class="lbl">' + esc(S.dhwTitle) + '</p><div class="ems-list">' + listRow('dhw', 'drop', '#2980b9', S.dhwRow, '', dhwSummary(), dhwBody()) + '</div>'
      + '<p class="lbl">' + esc(S.fuseTitle) + '</p><div class="ems-list">' + listRow('fuse', 'bolt', '#c0392b', S.fuseRow, '', fuseSummary(), fuseBody()) + '</div>'
      + '<p class="lbl">' + esc(S.calcTitle) + '</p><div class="ems-list">' + listRow('calc', 'clock', '#6b7280', S.calcRow, '', { text: calcSummary(), cls: 'muted' }, calcBody()) + '</div>'
      + '<p><button class="ems-save" id="ems-savebtn" data-ems-save="1">' + esc(state.dirty ? S.saveDirty : S.save) + '</button></p><p class="sub" id="ems-msg">' + esc(state.msg) + '</p>';
  }

  function styleHtml() {
    return '<style>'
      + '.ems-head{display:flex;gap:10px;align-items:flex-start;margin:0 0 6px;padding:10px 12px;border-radius:12px}.ems-head-t{flex:1;font-size:14px}'
      + '.ems-head-ok{background:var(--st-lv-cheap-bg);color:var(--st-lv-cheap-fg)}.ems-head-ok .ems-why{color:var(--st-lv-cheap-fg)}.ems-head-warn{background:#fdf0d8;color:#7a4b00}'
      + '.ems-ic{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;flex:none}.ems-ic-ok{background:var(--st-switch-on)}.ems-ic-warn{background:#d98a1a}'
      + 'p.lbl{font-size:11px;color:var(--st-muted);letter-spacing:.06em;margin:14px 2px 6px}'
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
      + '.ems-tag-prio{background:var(--st-chip-bg);color:var(--st-muted)}.ems-mvs{white-space:nowrap}.ems-mv{display:inline-block !important;width:auto !important;min-width:0 !important;height:auto !important;margin:0 0 0 4px !important;padding:0 6px !important;font-size:11px !important;line-height:18px !important;border-radius:6px !important;border:1px solid var(--st-border) !important;background:var(--st-bg) !important;color:var(--st-text) !important;box-shadow:none !important;cursor:pointer}.ems-mv[disabled]{opacity:.35;cursor:default}'
      + '.ems-item.ems-sug{background:var(--st-lv-cheap-bg)}.ems-tag-sug{background:var(--st-switch-on);color:#fff}'
      + '.share-svg{width:100%;max-width:440px;height:auto;display:block;margin:2px 0}'
      + '.ems-dirty{color:#b9770e;font-size:11px;font-weight:600}.ems-save-sec{margin-top:12px}'
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
      + '.fuse-phs{display:flex;gap:16px;margin:10px 0 0 40px}.fuse-ph{flex:1;min-width:0;font-size:13px;white-space:nowrap}.fuse-kw{font-size:11px;margin-top:2px}.fuse-bar{height:4px;border-radius:2px;background:var(--st-seg-bg);margin:4px 0 0;overflow:hidden}.fuse-bar i{display:block;height:100%;border-radius:2px}.car-badge{display:inline-block;font-size:12px;font-weight:500;padding:2px 10px;border-radius:999px;margin-left:8px;vertical-align:1px;white-space:nowrap}.pl-pricechart .chart{margin-top:0;padding-left:0;padding-right:0;height:110px}.pl-pricechart .chart-labels{display:none}.pl-pvwrap{position:relative}.pl-scale{position:absolute;left:6px;top:3px;bottom:3px;display:flex;flex-direction:column;justify-content:space-between;font-size:10px;color:var(--st-muted);pointer-events:none}.pl-scale span{background:var(--st-chip-bg);padding:0 3px;border-radius:3px;opacity:.88}.ems-c span:not(.swt){text-transform:none !important;font-size:13px !important;letter-spacing:normal !important;font-weight:400 !important;color:var(--st-text) !important}.ems-f > span{text-transform:none !important;letter-spacing:normal !important}.ems-tip{font-style:normal;cursor:pointer;color:var(--st-accent);margin-left:4px;font-size:13px;user-select:none}.ems-tiptext{display:block;flex-basis:100%;font-size:11.5px;line-height:1.4;color:var(--st-muted);text-transform:none;letter-spacing:normal;margin:0 0 2px}.ems-tiptext[hidden]{display:none !important}.ic-pick{display:inline-flex !important;align-items:center;justify-content:center;width:32px !important;height:32px !important;min-width:0 !important;padding:0 !important;margin:0 !important;border-radius:8px !important;border:1px solid var(--st-border) !important;background:var(--st-bg) !important;color:var(--st-text) !important;box-shadow:none !important;cursor:pointer}.ic-pick.on{background:var(--st-accent) !important;border-color:var(--st-accent) !important;color:#fff !important}.log-ic{display:inline-flex;vertical-align:-2px;margin-right:5px;color:var(--st-muted)}.log-f{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}.log-f .log-chip{font:inherit !important;font-size:12px !important;line-height:1.4 !important;height:auto !important;min-height:0 !important;min-width:0 !important;width:auto !important;margin:0 !important;padding:3px 10px !important;border-radius:999px !important;border:1px solid var(--st-border) !important;background:var(--st-bg) !important;color:var(--st-text) !important;box-shadow:none !important;cursor:pointer}.log-f .log-chip.on{background:var(--st-accent) !important;border-color:var(--st-accent) !important;color:#fff !important}.log-day td{font-size:11px;color:var(--st-muted);letter-spacing:.04em;padding-top:8px;border-bottom:none}'
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

  /** Sofort laden mit Grenze (aufklappbar): bis abgesteckt, bis Ladestand % oder bis kWh. */
  function chargeNowHtml(cfg, ch) {
    var lim = cfg.charger.chargeNowLimit || { kind: 'none', value: null };
    var hasCar = !!(cfg.car && cfg.car.deviceId);
    var p = ch && ch.chargeNow;
    var sub;
    if (lim.kind === 'soc') sub = S.cnUntil + ' ' + lim.value + ' %' + (cfg.charger.chargeNow && p && p.soc !== null && p.soc !== undefined ? ' (' + S.cnNow + ' ' + Math.round(p.soc) + ' %)' : '');
    else if (lim.kind === 'kwh') sub = S.cnUntil + ' ' + lim.value + ' kWh' + (cfg.charger.chargeNow && p ? ' (' + p.kwh + ' kWh ' + S.cnLoaded + ')' : '');
    else sub = cfg.charger.chargeNowAutoOff !== false ? S.cnNone : S.cnNoneManual;
    var opt = function (k, label) { return '<option value="' + k + '"' + (lim.kind === k ? ' selected' : '') + '>' + esc(label) + '</option>'; };
    var val = lim.kind === 'soc' || lim.kind === 'kwh'
      ? '<label class="ems-f"><span>&nbsp;</span><input type="number" data-ems-cnlim="value" value="' + esc(lim.value) + '" min="' + (lim.kind === 'soc' ? 10 : 1) + '" max="' + (lim.kind === 'soc' ? 100 : 150) + '" step="' + (lim.kind === 'soc' ? 5 : 1) + '" style="width:80px"></label>'
      : '';
    return '<div class="ems-item"><div class="ems-item-h" style="cursor:default"><span class="ems-ic" style="background:' + COLORS.charger + '">' + icon('bolt', 17) + '</span>'
      + '<span class="ems-item-t"><span class="ems-item-n">' + esc(S.chargeNow) + '</span><span class="ems-item-s ems-muted">' + esc(sub) + '</span></span>'
      + '<span class="swt"><input class="sw" id="ems-chargenow" type="checkbox" data-ems-chargenow="1"' + (cfg.charger.chargeNow ? ' checked' : '') + '><i></i></span></div>'
      + '<details class="ems-adv" style="margin:0;padding:0 12px 10px"' + (state.cnOpen ? ' open' : '') + '><summary data-ems-cnopen="1">' + esc(S.cnLimit) + '</summary>'
      + '<div class="ems-row"><label class="ems-f ems-wide"><span>&nbsp;</span><select data-ems-cnlim="kind">' + opt('none', cfg.charger.chargeNowAutoOff !== false ? S.cnNone : S.cnNoneManual) + (hasCar ? opt('soc', S.cnSoc) : '') + opt('kwh', S.cnKwh) + '</select></label>' + val + '</div>'
      + '<p class="ems-why" style="margin:0">' + esc(S.cnHint) + '</p></details></div>';
  }

  /** Hausanschluss: höchste Phase, Grenze, Drosselung, Abgeschaltetes. */
  function fuseLineHtml() {
    var f = state.cfg.fuse;
    var cur = state.shadow && state.shadow.fuse;
    if (!f || !f.enabled || !cur || cur.maxA === null || cur.maxA === undefined) return '';
    var kwOf = function (amps) { return Math.abs(amps) * 230 / 1000; };
    var phases = (cur.phasesA || []).map(function (v) { return typeof v === 'number' && isFinite(v) ? v : null; });
    var total = phases.reduce(function (sum, v) { return sum + (v === null ? 0 : kwOf(v)); }, 0);
    var title = S.fuseNow + ' ' + (Math.round(cur.maxA * 10) / 10) + ' A ' + S.fuseOf + ' ' + cur.limitA + ' A';
    var sub = [];
    if (phases.some(function (v) { return v !== null; })) sub.push(total.toFixed(1) + ' kW');
    if (cur.capAmps !== null && cur.capAmps !== undefined && cur.capAmps < state.cfg.charger.maxAmps && state.cfg.charger.id) sub.push(S.fuseThrottled + ' ' + cur.capAmps + ' A');
    if (cur.shed && cur.shed.length) sub.push(S.fuseShedNow + ' ' + cur.shed.join(', '));
    if (!cur.live) sub.push(S.logTestTag);
    var bad = cur.over || (cur.shed && cur.shed.length);
    var cols = phases.map(function (v, k) {
      var pct = v === null || !(cur.limitA > 0) ? 0 : Math.min(100, Math.max(0, (Math.abs(v) / cur.limitA) * 100));
      var col = pct >= 90 ? '#c0392b' : (pct >= 70 ? '#d98a1a' : 'var(--st-switch-on)');
      return '<div class="fuse-ph"><div><span class="ems-muted">L' + (k + 1) + '</span> <b>' + (v === null ? '-' : (Math.round(Math.abs(v) * 10) / 10) + ' A') + '</b></div>'
        + '<div class="fuse-bar"><i style="width:' + pct.toFixed(0) + '%;background:' + col + '"></i></div>'
        + '<div class="ems-muted fuse-kw">' + (v === null ? '' : kwOf(v).toFixed(1) + ' kW') + '</div></div>';
    }).join('');
    return '<div class="card" id="ems-fuse-line"><div class="ems-st"><span class="ems-ic" style="background:' + (bad ? '#c0392b' : '#6b7280') + '">' + icon('bolt', 17) + '</span>'
      + '<span class="ems-item-t" style="flex:1"><span class="ems-item-n">' + esc(title) + '</span><span class="ems-item-s ems-muted">' + esc(sub.join(' · ')) + '</span></span></div>'
      + (cols ? '<div class="fuse-phs">' + cols + '</div>' : '') + '</div>';
  }



  /** «Ferien bis 20.11.» oder «Ferien bis ausgeschaltet», wenn die Vorlage gerade pausiert; sonst ''. */
  function carHolidayText() {
    var sc = carSchedule();
    if (!sc.holiday) return '';
    var until = sc.holidayUntil;
    if (until) {
      var today = dayKey(Date.now()).split('.').reverse().join('-');
      if (until < today) return '';
      var p = until.split('-');
      return S.carHolidayOn + ' ' + S.carHolidayUntilShort + ' ' + Number(p[2]) + '.' + Number(p[1]) + '.';
    }
    return S.carHolidayOn + ' ' + S.carHolidayOpen;
  }

  /** Zustand des Autos als Badge: nicht angesteckt / lädt / Ziel erreicht / angesteckt. '' ohne Daten. */
  function carBadgeHtml() {
    var car = state.shadow && state.shadow.car;
    var ch = state.shadow && state.shadow.charger && state.shadow.charger.current;
    if (!car && !ch) return '';
    var connected = car ? !!car.connected : !!(ch && ch.connected);
    var charging = !!(ch && ((ch.chargerPowerW || 0) > 300));
    var b;
    if (!connected) b = { t: S.carNotConnected, bg: 'var(--st-chip-bg)', fg: 'var(--st-muted)' };
    else if (charging) b = { t: S.carBadgeCharging, bg: '#e6e4fb', fg: '#4a43b0' };
    else if (car && car.state === 'reached') b = { t: S.carBadgeReached, bg: 'var(--st-lv-cheap-bg)', fg: 'var(--st-lv-cheap-fg)' };
    else b = { t: S.carBadgePlugged, bg: 'var(--st-lv-cheap-bg)', fg: 'var(--st-lv-cheap-fg)' };
    return '<span class="car-badge" style="background:' + b.bg + ';color:' + b.fg + '">' + esc(b.t) + '</span>';
  }

  /** Kurze Statuszeile für «Heute». */
  function carCompactHtml() {
    var c = state.cfg.car || {};
    if (!c.deviceId) return '';
    var car = (state.shadow && state.shadow.car) || null;
    var soc = car && car.soc !== null && car.soc !== undefined ? Math.round(car.soc) + ' %' : '';
    var parts = [((function () { var d = findDevice((state.cfg.car || {}).deviceId); return d && d.name ? d.name : S.carSocLbl; })() + ' ' + soc).trim()];
    if (!car) parts.push(S.carWaiting);
    if (carHolidayText()) parts.push(carHolidayText());
    if (car && car.departure) parts.push(car.departure.soc + ' % ' + S.pvUntilShort + ' ' + time(car.departure.at));
    if (car) {
      var st = (S.carSt && S.carSt[car.state]) || car.state;
      if (car.starts && car.starts.length) st += ' ' + hm(car.starts[0]) + '-' + hm(car.starts[car.starts.length - 1] + 900000);
      parts.push(st);
    }
    return '<div class="ems-item" id="ems-car-line"><div class="ems-item-h" style="cursor:default"><span class="ems-ic" style="background:' + COLORS.charger + '">' + icon('car', 17) + '</span>'
      + '<span class="ems-item-t"><span class="ems-item-n">' + esc(parts[0]) + ' ' + carBadgeHtml() + '</span><span class="ems-item-s ems-muted" style="white-space:normal">' + esc(parts.slice(1).join(' - ')) + '</span></span></div></div>';
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
    if (carHolidayText()) lines.unshift(carHolidayText());
    if (car) {
      var st = (S.carSt && S.carSt[car.state]) || car.state;
      if (car.starts && car.starts.length) st += ': ' + hm(car.starts[0]) + ' - ' + hm(car.starts[car.starts.length - 1] + 900000) + (car.needKwh ? ' (' + car.needKwh + ' kWh)' : '');
      lines.push(st);
    }
    var o = state.carDraft || (sc.override ? { day: 'tomorrow', time: sc.override.time, soc: sc.override.soc, on: sc.override.on } : { day: 'tomorrow', time: '06:00', soc: 80, on: true });
    var form = '<p class="lbl" style="margin-top:12px">' + esc(S.carOverride) + '</p><div class="ems-row">'
      + '<label class="ems-f"><span>&nbsp;</span><select data-ems-carf="day"><option value="today"' + (o.day === 'today' ? ' selected' : '') + '>' + esc(S.carToday) + '</option><option value="tomorrow"' + (o.day !== 'today' ? ' selected' : '') + '>' + esc(S.carTomorrow) + '</option></select></label>'
      + '<label class="ems-f"><span>' + esc(S.carTime) + '</span><input type="time" data-ems-carf="time" value="' + esc(o.time) + '"></label>'
      + '<label class="ems-f"><span>' + esc(S.carSoc) + '</span><input type="number" min="10" max="100" step="5" data-ems-carf="soc" value="' + esc(o.soc) + '" style="width:70px"></label></div>'
      + '<label class="ems-c"><span class="swt"><input class="sw" type="checkbox" data-ems-carf="on"' + (o.on ? ' checked' : '') + '><i></i></span> <span>' + esc(S.carCharge) + '</span></label>'
      + '<p style="margin:8px 0 0"><button class="btn primary" data-ems-car="save">' + esc(S.carApply) + '</button>' + (sc.override ? ' <button class="btn" data-ems-car="clear">' + esc(S.carClear) + '</button>' : '') + ' <span class="sub">' + esc(state.carMsg || '') + '</span></p>';
    return '<p class="lbl">' + esc(S.carCard) + '</p><div class="card" id="ems-car"><div class="ems-st"><span class="ems-ic" style="background:' + COLORS.charger + '">' + icon('car', 17) + '</span><b>' + esc((function () { var d = findDevice((state.cfg.car || {}).deviceId); return d && d.name ? d.name : S.carSocLbl; })() + ' ' + socTxt) + '</b>' + carBadgeHtml() + '</div>'
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

  function carCalStatus(text, ok) {
    state.carCalStatus = text;
    var el = $('ems-carcal-st');
    if (el) { el.textContent = text; el.className = ok === false ? 'ems-bad' : 'ems-ok'; }
  }
  /** Sofort speichern, kurz gebündelt (mehrere Änderungen in einer halben Sekunde = ein Speichern). */
  function scheduleCarSave() {
    carCalStatus(S.carCalSaving);
    if (state.carSaveTimer) clearTimeout(state.carSaveTimer);
    state.carSaveTimer = setTimeout(function () { state.carSaveTimer = null; saveCarTemplate(); }, 500);
  }
  function saveCarTemplate() {
    var sc = carTemplate();
    sc.override = carSchedule().override; // ein Eintrag für heute/morgen bleibt
    var car = Object.assign({}, state.cfg.car, { schedule: sc });
    return api('PUT', '/ems/config', { car: car }).then(function (cfg) {
      if (cfg && cfg.car) state.cfg.car = JSON.parse(JSON.stringify(cfg.car)); else state.cfg.car = car;
      state.carCal = null;
      carCalStatus(S.carCalSaved + ' ' + hm(Date.now()));
      return refreshStatus();
    }).catch(function (e) { carCalStatus(S.error + ': ' + (e && e.message || e), false); });
  }

  function batteryControlled() {
    var c = state.cfg;
    return !!(c && c.battery && c.battery.deviceId && c.battery.control && c.battery.control.enabled && c.battery.control.preset);
  }
  function batModeLabel(m) { return m === 'charge' ? S.batModeCharge : (m === 'hold' ? S.batModeHold : S.batModeNormal); }

  function dayKey(ms) {
    try { return new Date(ms).toLocaleDateString('de-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', year: 'numeric' }); } catch (e) { return ''; }
  }
  function dayLabel(ms) {
    var k = dayKey(ms);
    if (k === dayKey(Date.now())) return S.logToday;
    if (k === dayKey(Date.now() - 86400000)) return S.logYesterday;
    return k.slice(0, 6);
  }

  /** Protokoll: Filter nach Bereich, nach Tagen gruppiert, 12 Einträge oder mehr. */
  function protocolHtml() {
    var rows = [];
    var silentNow = !state.cfg || state.cfg.silent !== false;
    var hasCar = !!(state.cfg && state.cfg.car && state.cfg.car.deviceId);
    var tag = function (live) { return live || silentNow ? '' : ' (' + S.logTestTag + ')'; };
    (state.events || []).forEach(function (e) {
      rows.push({ kind: 'cons', icon: consumerIconById(e.id, e.name), dev: e.name, cmd: true, ts: e.ts, text: e.name + ' ' + (e.cmd === 'program' ? S.logStartWord : (e.cmd === 'on' ? S.logOnWord : S.logOffWord)) + tag(e.live), reason: e.reason });
    });
    var prevBat = null;
    (state.batteryEvents || []).slice().sort(function (a, b) { return a.ts - b.ts; }).forEach(function (e) {
      // Wiederholungen (alle 10 min) und Neustarts melden denselben Modus nochmals: nur Wechsel zeigen, Fehler immer
      var key = e.mode + '|' + !!e.live;
      if (key === prevBat && !e.error) return;
      prevBat = key;
      rows.push({ kind: 'bat', icon: 'battery', cmd: true, ts: e.ts, text: batModeLabel(e.mode) + tag(e.live) + (e.error ? ' - ' + S.error : ''), reason: e.reason });
    });
    (state.fuseEvents || []).forEach(function (e) {
      var what = e.action === 'over' ? S.fuseEvOver : (e.action === 'shed' ? (e.name + ' ' + S.fuseEvShed) : (e.action === 'throttle' ? S.fuseEvThrottle + ' ' + e.capAmps + ' A' : (e.action === 'throttle_end' ? S.fuseEvThrottleEnd : S.fuseEvRelease)));
      rows.push({ kind: 'fuse', icon: 'bolt', cmd: e.action !== 'over', ts: e.ts, text: what + tag(e.live) + (e.error ? ' - ' + S.error : ''), reason: e.maxA !== null && e.maxA !== undefined ? S.fusePhase + ' ' + e.phase + ': ' + e.maxA + ' A' : '' });
    });
    var chargerLive = state.cfg && state.cfg.charger && state.cfg.charger.live === true && state.cfg.silent === false;
    var ce = (state.shadow && state.shadow.charger && state.shadow.charger.events) || [];
    if (state.cfg && state.cfg.charger && state.cfg.charger.id) {
      // Schaltung = Laden beginnt oder endet; Wechsel zwischen Warte-Zuständen sind nur Status
      var charging = function (m) { return m === 'solar_ev' || m === 'instant_ev' || m === 'price_ev'; };
      var prev = null;
      var prevMode = null;
      ce.slice().sort(function (a, b) { return a.ts - b.ts; }).forEach(function (e) {
        // Das Wallbox-Protokoll hält auch Wechsel des Vergleichs-EMS fest; hier zählt nur ein Wechsel des eigenen Modus
        if (e.mine === prevMode) return;
        prevMode = e.mine;
        var now = charging(e.mine);
        rows.push({ kind: 'car', icon: hasCar ? 'car' : 'charger', cmd: prev === null ? now : now !== prev, ts: e.ts, text: modeLabel(e.mine) + tag(chargerLive), reason: e.reason });
        prev = now;
      });
    }
    var kinds = [['all', S.logAll], ['car', hasCar ? S.logCar : S.logWallbox], ['bat', S.logBat], ['cons', S.logCons], ['fuse', S.logFuse]]
      .filter(function (k) {
        var c = state.cfg || {};
        var configured = { car: !!(c.charger && c.charger.id), bat: batteryControlled(), cons: !!(c.consumers && c.consumers.length), fuse: !!(c.fuse && c.fuse.enabled) };
        return k[0] === 'all' || configured[k[0]] || rows.some(function (x) { return x.kind === k[0]; });
      });
    var f = state.logFilter || 'all';
    if (!kinds.some(function (k) { return k[0] === f; })) f = 'all';
    var devs = [];
    rows.forEach(function (x) { if (x.kind === 'cons' && devs.indexOf(x.dev) < 0) devs.push(x.dev); });
    var dv = f === 'cons' && devs.indexOf(state.logDev) >= 0 ? state.logDev : '';
    var shown = rows.filter(function (x) {
      return (f === 'all' || x.kind === f) && (!state.logCmdOnly || x.cmd) && (!dv || x.dev === dv);
    }).sort(function (a, b) { return b.ts - a.ts; });
    var limit = state.logMore ? 60 : 12;
    var chips = rows.length || kinds.length > 1 ? '<div class="log-f">' + kinds.map(function (k) {
      return '<button class="log-chip' + (k[0] === f ? ' on' : '') + '" data-ems-logf="' + k[0] + '">' + esc(k[1]) + '</button>';
    }).join('') + '<button class="log-chip' + (state.logCmdOnly ? ' on' : '') + '" data-ems-logcmd="1">' + esc(S.logCmdOnly) + '</button></div>' : '';
    if (f === 'cons' && devs.length > 1) {
      chips += '<div class="log-f">' + [''].concat(devs).map(function (d) {
        return '<button class="log-chip' + (d === dv ? ' on' : '') + '" data-ems-logdev="' + esc(d || '*') + '">' + esc(d || S.logAll) + '</button>';
      }).join('') + '</div>';
    }
    var body = '';
    if (!shown.length) body = '<p class="sub" style="margin:0">' + esc(S.logNone) + '</p>';
    else {
      var lastDay = '';
      body = '<table class="ems-t pl-tab"><tbody>' + shown.slice(0, limit).map(function (x) {
        var d = dayLabel(x.ts);
        var headRow = d !== lastDay ? '<tr class="log-day"><td colspan="2">' + esc(d) + '</td></tr>' : '';
        lastDay = d;
        return headRow + '<tr><td class="pl-time">' + esc(hm(x.ts)) + '</td><td class="pl-what" title="' + esc(x.text + ' - ' + (x.reason || '')) + '">' + (x.icon ? '<span class="log-ic">' + icon(x.icon, 13) + '</span>' : '') + esc(x.text) + ' <span class="ems-muted">' + esc(x.reason || '') + '</span></td></tr>';
      }).join('') + '</tbody></table>';
      if (shown.length > 12) body += '<p style="margin:6px 0 0"><button class="btn" data-ems-logmore="1">' + esc(state.logMore ? S.logLess : S.logMore) + ' (' + Math.min(shown.length, 60) + ')</button></p>';
    }
    return '<p class="lbl">' + esc(S.logTitle) + '</p><div class="card" id="ems-log">' + chips + (silentNow && shown.length ? '<p class="ems-why" style="margin:0 0 4px">' + esc(S.logAllSim) + '</p>' : '') + body + '</div>';
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
      var si = sh.shareInfo;
      if (cfg.charger && cfg.charger.id && si && si.pct !== null && si.pct !== undefined) vals.push(S.shareVal.replace('{pct}', si.pct) + (si.shift > 0 ? ' (' + S.shareBonusTitle + ' −' + si.shift + ')' : ''));
      if (ch.carSoc !== null && ch.carSoc !== undefined) vals.push(S.carSocLbl + ' ' + Math.round(ch.carSoc) + ' %');
    }
    var head = '<div class="card"><div class="ems-st"><span class="ems-dot" style="background:' + dot + '"></span><b>' + esc(title) + '</b>'
      + '<span class="swt"><input class="sw" id="ems-enabled" type="checkbox" data-ems-enable="1"' + (cfg.enabled ? ' checked' : '') + '><i></i></span></div>'
      + (cfg.enabled && ch ? '<div class="ems-st" style="margin-top:8px"><span class="ems-chip">' + esc(modeLabel(ch.mine.mode)) + '</span><span class="sub" style="margin:0">' + esc(ch.mine.reason) + '</span></div>' : '')
      + (vals.length ? '<div class="ems-vals">' + vals.map(function (v) { return '<span>' + esc(v) + '</span>'; }).join('') + '</div>' : '')
      + '<div class="ems-st" style="margin-top:10px"><span style="flex:1;font-size:14px">' + esc(S.silent) + '</span><span class="swt"><input class="sw" id="ems-silent" type="checkbox" data-ems-silent="1"' + (silentOn ? ' checked' : '') + '><i></i></span></div>'
      + '<p class="ems-why" style="margin-bottom:0">' + esc(S.silentHint) + '</p>'
      + (priceMissing() ? '<p class="warn">' + esc(S.noPriceDevice) + '</p>' : '') + (warn ? '<p class="warn">' + esc(warn) + '</p>' : '') + (errs ? '<p class="warn">' + esc(errs) + '</p>' : '') + '</div>';
    var rowHtml = function (x) {
      var r = x.r;
      var name = r.kind === 'charger' ? S.autoCharge : r.name;
      var cs = (state.consumersState || []).filter(function (c) { return c.name === r.name; })[0];
      var sub = r.kind === 'charger'
        ? (!r.live ? S.autoChargeOff : (ch && ch.connected ? modeLabel(ch.mine.mode) + (ch.mine.reason ? ' - ' + ch.mine.reason : '') : S.autoChargeNoCar)) + (silentOn && r.live ? ' - ' + S.silentTag : '')
        : (cs && cs.reason ? cs.reason : rowSub(r));
      var subHasTag = r.kind === 'charger' ? true : !(cs && cs.reason); // rowSub() nennt Testbetrieb/live schon
      var sw = '<span class="swt"><input class="sw" type="checkbox" data-ems-toggle="' + (r.kind === 'charger' ? 'charger' : esc(r.deviceId)) + '"' + (r.live ? ' checked' : '') + '><i></i></span>';
      return '<div class="ems-item"><div class="ems-item-h" style="cursor:default"><span class="ems-ic" style="background:' + rowColor(r) + '">' + icon(rowIcon(r), 17) + '</span>'
        + '<span class="ems-item-t"><span class="ems-item-n">' + esc(name) + '</span><span class="ems-item-s ems-muted">' + esc(sub) + (subHasTag ? '' : ' - ' + esc(r.live ? S.modeLiveTag : S.modeTest)) + '</span></span>' + sw + '</div></div>';
    };
    var chargerItem = liveRows().filter(function (x) { return x.r.kind === 'charger'; }).map(rowHtml).join('');
    var items = liveRows().filter(function (x) { return x.r.kind !== 'charger'; }).map(rowHtml).join('');
    var wb = state.rows[0] && state.rows[0].kind === 'charger' && state.rows[0].deviceId ? chargeNowHtml(cfg, ch) : '';
    var carItem = carCompactHtml();
    var batItem = '';
    if (bc) {
      var bctl = sh.batteryControl;
      var bsub = bctl && bctl.lastMode ? S.batSent + ': ' + batModeLabel(bctl.lastMode) + (bctl.lastSentAt ? ' (' + time(bctl.lastSentAt) + ')' : '') : S.batRowNone;
      var btag = silentOn ? S.silentTag : (bc.live ? S.modeLiveTag : S.modeTest);
      batItem = '<div class="ems-item"><div class="ems-item-h" style="cursor:default"><span class="ems-ic" style="background:' + COLORS.bat + '">' + icon('battery', 17) + '</span>'
        + '<span class="ems-item-t"><span class="ems-item-n">' + esc(S.batRow) + '</span><span class="ems-item-s ems-muted">' + esc(bsub) + ' - ' + esc(btag) + '</span></span>'
        + '<span class="swt"><input class="sw" type="checkbox" data-ems-toggle="battery"' + (bc.live ? ' checked' : '') + '><i></i></span></div></div>';
    }
    var backupItem = '';
    if (hasBattery()) {
      var br = cfg.battery.backupReserve || { active: false, soc: 50 };
      backupItem = '<div class="ems-item"><div class="ems-item-h" style="cursor:default"><span class="ems-ic" style="background:' + (br.active ? '#c0392b' : COLORS.bat) + '">' + icon('shield', 17) + '</span>'
        + '<span class="ems-item-t"><span class="ems-item-n">' + esc(S.backupRow) + '</span><span class="ems-item-s ems-muted">' + esc(br.active ? fill(S.backupRowOn, { soc: br.soc }) : S.backupRowOff) + '</span></span>'
        + '<span class="swt"><input class="sw" id="ems-backupreserve" type="checkbox" data-ems-backupreserve="1"' + (br.active ? ' checked' : '') + '><i></i></span></div></div>';
    }
    var silentTags = function (h) { return silentOn ? h.replace(/ - (gesteuert|nicht gesteuert|controlled|not controlled)<\/span>/g, ' - ' + esc(S.silentTag) + '</span>') : h; };
    var sections = '';
    if (carItem || chargerItem || wb) sections += '<p class="lbl">' + esc(carItem ? S.secCar : S.secWallbox) + '</p><div class="ems-list">' + carItem + silentTags(chargerItem) + wb + '</div>';
    if (batItem || backupItem) sections += '<p class="lbl">' + esc(S.secBat) + '</p><div class="ems-list">' + batItem + backupItem + '</div>';
    if (items) sections += '<p class="lbl">' + esc(S.consumers) + '</p><div class="ems-list">' + silentTags(items) + '</div>';
    if (!sections) sections = '<p class="lbl">' + esc(S.consumers) + '</p><p class="sub">' + esc(S.noConsumers) + '</p>';
    return styleHtml() + head + fuseLineHtml() + sections + '<p class="ems-why">' + esc(S.switchHint) + '</p><p class="warn" id="ems-toggle-err" hidden></p>' + protocolHtml();
  }

  // ---------------------------------------------------------------- Plan-Sicht (unten im Betrieb)

  var PLAN_COLORS = {
    charge: '#3b9d4a', hold: '#d98a1a', normal: '#9aa0a6',
    instant_ev: '#5b52c8', solar_ev: '#9a93e8', error: '#d32f2f',
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
      parts.push('<rect class="' + cls + '" x="' + (i * PLAN_STEP) + '" y="' + y.toFixed(1) + '" width="' + PLAN_STEP + '" height="' + h.toFixed(1) + '"><title>' + esc(hm(s.t) + ': ' + s.price + ' Rp./kWh') + '</title></rect>');
    });
    return '<svg class="pl-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" shape-rendering="crispEdges" style="height:' + H + 'px">' + parts.join('') + '</svg>';
  }

  function planPvSvg(day) {
    var n = day.slots.length;
    var W = n * PLAN_STEP;
    var H = 90;
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
    var scale = '<div class="pl-scale"><span>' + esc((max >= 10 ? Math.round(max) : max.toFixed(1)) + ' kW') + '</span><span>0</span></div>';
    return '<div class="pl-pvwrap"><svg class="pl-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="height:' + H + 'px">' + parts.join('') + '</svg>' + scale + '</div>';
  }

  /** Legende gleich unter der jeweiligen Grafik. */
  function legendFor(kind, row) {
    var sq = function (bg, text, extra) { return '<span><i style="background:' + bg + ';' + (extra || '') + '"></i>' + esc(text) + '</span>'; };
    var items = '';
    if (kind === 'price') items = '<span><i class="pl-c"></i>' + esc(S.planCheap) + '</span><span><i class="pl-n"></i>' + esc(S.planNormal) + '</span><span><i class="pl-e"></i>' + esc(S.planExp) + '</span>' + sq('rgba(2,119,189,.25)', S.planBlock);
    else if (kind === 'pv') items = sq('var(--st-muted)', S.pvForecastLeg, 'opacity:.5') + '<span><i style="background:#e08a1e;height:3px;margin-top:3px"></i>' + esc(S.pvReached) + '</span>';
    else if (kind === 'battery') items = sq(PLAN_COLORS.charge, S.planBatCharge) + sq(PLAN_COLORS.hold, S.planBatHold) + sq(PLAN_COLORS.normal, S.planBatNormal) + sq('transparent', S.planTag, 'border:1px dashed var(--st-muted)');
    else if (kind === 'charger') {
      items = sq(PLAN_COLORS.solar_ev, S.planChSolar) + sq(PLAN_COLORS.instant_ev, S.planChFull);
      if (row && row.carPlan) items += sq('transparent', S.planTag, 'border:1px dashed ' + PLAN_COLORS.instant_ev);
      if (row && row.cells.some(function (c) { return c.state === 'error'; })) items += sq(PLAN_COLORS.error, S.planChError);
    }
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
    var priceOnly = noDevice();
    if (priceOnly) {
      p = Object.assign({}, p, {
        days: p.days.map(function (d) {
          return Object.assign({}, d, {
            rows: [],
            slots: d.slots.map(function (x) { return Object.assign({}, x, { pvKw: null, pvActualKw: null }); }),
            stats: Object.assign({}, d.stats, { pvKwh: null, pvActualKwh: null }),
          });
        }),
      });
    }
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
      var shared = typeof window !== 'undefined' && window.DtcChart && typeof window.DtcChart.html === 'function';
      if (shared) {
        // Gleiche Grafik wie unter «Heute» (Farbverlauf, höchster/tiefster Wert), ohne Referenzpreis und ohne eigene Zeitleiste
        var cs = day.slots.map(function (x) {
          return { price: x.price, time: hm(x.t), isNow: day.key === 'today' && x.t <= p.nowMs && p.nowMs < x.t + 900000, isPast: x.t + 900000 <= p.nowMs };
        });
        body += '<div class="pl-lbl">' + esc(S.planPrice) + '</div><div class="pl-pricechart">' + window.DtcChart.html(cs, false) + '</div>';
      } else {
        body += '<div class="pl-lbl">' + esc(S.planPrice) + ' <span class="ems-muted">' + esc(day.stats.min + ' ' + S.planTo + ' ' + day.stats.max) + '</span></div>' + planPriceSvg(day, p.nowMs) + legendFor('price');
      }
      if (day.slots.some(function (s) { return s.pvKw !== null || (s.pvActualKw !== null && s.pvActualKw !== undefined); })) body += '<div class="pl-lbl">' + esc(S.planPv) + '</div>' + planPvSvg(day) + legendFor('pv');
      day.rows.forEach(function (row) {
        var label;
        if (row.kind === 'battery') {
          var bc = state.cfg && state.cfg.battery && state.cfg.battery.control;
          label = S.planBat + ' - ' + (!batteryControlled() ? S.planBatAdvice : (bc.live === true && state.cfg.silent === false ? S.planBatLive : S.planTest));
        }
        else if (row.kind === 'charger') label = (row.carPlan ? S.planWallboxCar : S.planWallbox) + (test.charger ? ' - ' + S.planTest : '');
        else if (row.kind === 'job') label = (row.name || S.wallbox) + ' - ' + (row.preview ? S.pvPreviewLbl : S.pvJobWord);
        else label = row.name + (test.consumers && test.consumers.indexOf(row.id) >= 0 ? ' - ' + S.planTest : '');
        body += '<div class="pl-lbl">' + esc(label) + '</div>' + planLaneSvg(row, day) + legendFor(row.kind, row);
        var batNote = row.kind === 'battery' && day.key === 'today' ? (state.cfg.battery.reserveMode === 'fixed' ? bridgeText(false) : scheduleText()) : '';
        if (batNote) body += '<p class="ems-why" style="margin:4px 0 0">' + esc(batNote) + '</p>';
      });
      body += '<div class="pl-axis">' + day.ticks.map(function (t) { return '<span style="left:' + (t.i / n * 100).toFixed(2) + '%">' + esc(t.label) + '</span>'; }).join('') + '</div>';
      body += '</div>';
    }
    var cards = '';
    if (hasPrices) {
      var b = day.stats.cheapestBlock;
      cards = '<div class="ems-cards">'
        + (b ? '<div class="ems-card"><div class="ems-k">' + esc(day.key === 'today' ? S.planBlockNow : S.planBlock) + '</div><div class="ems-v">' + hm(b.from) + ' - ' + hm(b.to) + '</div><div class="ems-s">&#216; ' + b.avg + ' Rp./kWh</div></div>' : '')
        + '<div class="ems-card"><div class="ems-k">' + esc(S.planPriceRange) + '</div><div class="ems-v">' + day.stats.min + ' - ' + day.stats.max + '</div><div class="ems-s">&#216; ' + day.stats.avg + ' Rp./kWh</div></div>'
        + (day.stats.pvKwh !== null || day.stats.pvActualKwh !== null ? '<div class="ems-card"><div class="ems-k">' + esc(S.planPvKwh) + '</div><div class="ems-v">' + (day.stats.pvKwh !== null ? day.stats.pvKwh : '-') + ' kWh</div>' + (day.stats.pvActualKwh !== null ? '<div class="ems-s">' + esc(S.pvReachedSoFar) + ' ' + day.stats.pvActualKwh + ' kWh</div>' : '') + '</div>' : '')
        + '</div>';
    }
    return '<p class="lbl">' + esc(S.plan) + '</p><div class="card" id="ems-plan">' + tabs + body + cards + (hasPrices ? planTableHtml(p) : '') + (day.rows.length ? '<p class="ems-why">' + esc(S.planNote) + '</p>' : '') + '</div>' + (priceOnly ? '' : previewFormHtml());
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
    host.innerHTML = styleHtml() + previewBannerHtml() + (noDevice() ? '' : carCardHtml()) + planHtml();
  }

  function renderMain() {
    renderPlan();
    var panel = $('ems-view-main');
    if (!panel || !state.cfg) return;
    state.renderedNoDevice = noDevice();
    // Ohne Energiemanagement-Gerät bleibt «Heute» frei davon; die Einladung steht unter «Einrichten» → EMS.
    panel.innerHTML = noDevice() ? previewBannerHtml() : mainHtml();
  }

  // ---------------------------------------------------------------- Vergleich (nur Testphase)

  function anyModeLabel(k) { return k === 'charge' || k === 'hold' || k === 'normal' ? batModeLabel(k) : modeLabel(k); }
  function counts(o) {
    var keys = Object.keys(o || {});
    return keys.length ? keys.map(function (k) { return anyModeLabel(k) + ' ' + o[k]; }).join(' / ') : '-';
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
      + (days ? '<h3>' + esc(S.perDay) + '</h3><div style="overflow-x:auto"><table class="ems-t"><tr><th>' + esc(S.day) + '</th><th>' + esc(S.same) + '</th><th>' + esc(S.compared) + '/' + esc(S.runs) + '</th><th>' + esc(S.mine) + '</th><th>' + esc(S.theirs) + '</th></tr>' + days + '</table></div>' : '<p class="sub">' + esc(S.none2) + '</p>')
      + (ev ? '<h3>' + esc(S.changes) + '</h3><div style="overflow-x:auto"><table class="ems-t"><tr><th>' + esc(S.time) + '</th><th>SoC</th><th>' + esc(S.price) + '</th><th>' + esc(S.mine) + '</th><th>' + esc(S.theirs) + '</th><th>' + esc(S.reason) + '</th></tr>' + ev + '</table></div>' : '')
      + '</div>';
  }
  function compareNowHtml() {
    var sh = state.shadow;
    var cards = [];
    var ch = sh.charger && sh.charger.current;
    var cur = sh.current;
    if (ch) {
      cards.push('<div class="ems-card"><div class="ems-k">' + esc(S.cmpCharger) + ' - ' + esc(S.mine) + '</div><div class="ems-v">' + esc(anyModeLabel(ch.mine.mode)) + '</div><div class="ems-s">' + esc(ch.mine.reason) + '</div></div>');
      cards.push('<div class="ems-card"><div class="ems-k">' + esc(S.cmpCharger) + ' - ' + esc(S.theirs) + '</div><div class="ems-v">' + esc(ch.other ? anyModeLabel(ch.other.mode) : '-') + '</div><div class="ems-s">' + esc(ch.other ? ch.other.reason : '') + '</div></div>');
    }
    if (cur) {
      cards.push('<div class="ems-card"><div class="ems-k">' + esc(S.cmpBattery) + ' - ' + esc(S.mine) + '</div><div class="ems-v">' + esc(anyModeLabel(cur.mine.mode)) + '</div><div class="ems-s">' + esc(cur.soc === null ? '' : Math.round(cur.soc) + ' %') + '</div></div>');
      cards.push('<div class="ems-card"><div class="ems-k">' + esc(S.cmpBattery) + ' - ' + esc(S.theirs) + '</div><div class="ems-v">' + esc(cur.other ? anyModeLabel(cur.other.mode) : '-') + '</div><div class="ems-s">' + esc(cur.other ? cur.other.reason : '') + '</div></div>');
    }
    return cards.length ? '<div class="card"><h2>' + esc(S.nowSec) + '</h2><div class="ems-cards">' + cards.join('') + '</div></div>' : '';
  }
  function compareSettingsHtml() {
    var c = state.cfg;
    return '<div class="card"><h2>' + esc(S.cmpSource) + '</h2><div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.cmpDev) + '</span><select id="ems-d-cmp">' + deviceOptions(c.devices.compareEms, hasCap(/^ems_mode$/), S.none) + '</select></label></div></div>'
      + '<p><button class="btn" data-ems-save="1">' + esc(S.save) + '</button> <span class="sub" id="ems-msg-cmp">' + esc(state.msg) + '</span></p>';
  }
  /** Franken-Auswertung der Batterie-Entscheide je Tag (Modell). */
  function ledgerHtml() {
    var ld = state.shadow && state.shadow.ledger;
    var rows = [];
    var fmt = function (v) { return v === null || v === undefined ? '-' : v.toFixed(2); };
    var diff = function (d) { return d.mine !== null && d.other !== null && d.mine !== undefined && d.other !== undefined ? (d.mine - d.other) : null; };
    var line = function (label, d, cls) {
      var df = diff(d);
      return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + esc(label) + '</td><td>' + fmt(d.mine) + '</td><td>' + fmt(d.other) + '</td><td>' + fmt(d.none) + '</td><td class="' + (df === null ? '' : (df <= 0 ? 'ems-ok' : 'ems-bad')) + '">' + (df === null ? '-' : (df > 0 ? '+' : '') + df.toFixed(2)) + '</td></tr>';
    };
    if (ld && ld.today) rows.push(line(S.ldToday, ld.today, 'pl-cur'));
    (ld && ld.days ? ld.days : []).slice(0, 14).forEach(function (d) { rows.push(line(d.day.slice(8, 10) + '.' + d.day.slice(5, 7) + '.', d)); });
    if (ld && ld.total && ld.total.days) rows.push(line(S.ldTotal + ' (' + ld.total.days + ')', ld.total));
    var body = rows.length
      ? '<table class="ems-t"><thead><tr><th></th><th>' + esc(S.ldMine) + '</th><th>' + esc(S.ldOther) + '</th><th>' + esc(S.ldNone) + '</th><th>' + esc(S.ldDiff) + '</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>'
      : '<p class="sub">' + esc(S.ldNone2) + '</p>';
    return '<p class="lbl">' + esc(S.ldTitle) + '</p><div class="card"><p class="ems-why" style="margin-top:0">' + esc(S.ldIntro) + '</p>' + body + '</div>';
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
      + ledgerHtml()
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
    syncSg();
    syncDhw();
    syncWb();
    SOURCES.forEach(function (s) {
      if (s.key === 'price' || s.key === 'fc') return;
      if (s.key === 'bat' && state.open['src-bat'] && $('ems-bp-target')) {
        var bb = state.cfg.battery;
        if ($('ems-bp-mode')) bb.reserveMode = String($('ems-bp-mode').value || 'auto') === 'fixed' ? 'fixed' : 'auto';
        if ($('ems-bp-reserve')) bb.reserveHours = num('ems-bp-reserve', bb.reserveHours);
        bb.targetSoc = num('ems-bp-target', bb.targetSoc);
        bb.chargePowerKw = num('ems-bp-power', bb.chargePowerKw);
        if ($('ems-bp-solar')) bb.solarLimitKwh = num('ems-bp-solar', bb.solarLimitKwh);
        if ($('ems-bp-bridge')) bb.bridge = chk('ems-bp-bridge');
        if ($('ems-bp-loadmode')) bb.bridgeLoadMode = String($('ems-bp-loadmode').value || 'auto') === 'fixed' ? 'fixed' : 'auto';
        if (bb.bridgeLoadMode === 'fixed' && $('ems-bp-load')) bb.bridgeLoadKw = num('ems-bp-load', bb.bridgeLoadKw);
        bb.floorSoc = num('ems-bp-floor', bb.floorSoc);
        if ($('ems-bp-backupsoc')) bb.backupReserve = Object.assign({ active: false, soc: 50 }, bb.backupReserve, { soc: num('ems-bp-backupsoc', (bb.backupReserve || {}).soc) });
      }
      if (s.key === 'bat' && state.open['src-bat'] && $('ems-bc-on')) {
        var bcc = state.cfg.battery.control = Object.assign({ enabled: false, live: false, preset: '', normalDischargeW: 7000, repeatMin: 10 }, state.cfg.battery.control);
        bcc.enabled = chk('ems-bc-on');
        if ($('ems-bc-normal')) {
          bcc.normalDischargeW = num('ems-bc-normal', bcc.normalDischargeW);
          bcc.repeatMin = num('ems-bc-repeat', bcc.repeatMin);
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
    if (state.open['src-fc']) state.cfg.pv = Object.assign({}, state.cfg.pv, { factor: num('ems-pv-factor', state.cfg.pv ? state.cfg.pv.factor : 1), factorAuto: $('ems-pv-auto') ? chk('ems-pv-auto') : !!(state.cfg.pv && state.cfg.pv.factorAuto) });
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
      if ($(p + 'batFirst')) { var bf = String($(p + 'batFirst').value || '').trim(); r.batteryFirstSoc = bf === '' || !isFinite(Number(bf)) ? null : Number(bf); }
      if ($(p + 'accuEnable')) {
        var ac0 = r.accu || newConsumerRow().accu;
        var sensor = $(p + 'accuSensor') ? val(p + 'accuSensor', ac0.sensorId) : ac0.sensorId;
        var cap = $(p + 'accuCap') ? val(p + 'accuCap', ac0.capability) : ac0.capability;
        var dev = findDevice(sensor);
        if (dev && (dev.caps || []).indexOf(cap) < 0) cap = (dev.caps || []).filter(function (x) { return /^measure_battery/.test(x); })[0] || cap;
        r.accu = {
          enabled: chk(p + 'accuEnable'), sensorId: sensor, capability: cap,
          stopAt: num(p + 'accuStop', ac0.stopAt), resumeBelow: num(p + 'accuResume', ac0.resumeBelow), chargeBelow: num(p + 'accuLow', ac0.chargeBelow), maxRunMin: num(p + 'accuMax', ac0.maxRunMin),
        };
      }
      if ($(p + 'humSensor')) {
        r.humidity = {
          enabled: chk(p + 'humEnable'), sensorId: val(p + 'humSensor', r.humidity.sensorId), capability: r.humidity.capability || 'measure_humidity',
          onAbove: num(p + 'humOn', r.humidity.onAbove), offBelow: num(p + 'humOff', r.humidity.offBelow), runMin: num(p + 'humRun', r.humidity.runMin),
        };
      }
      if ($(p + 'pgSurplus')) {
        var pg0 = r.program || newConsumerRow().program;
        r.program = {
          minSurplusW: num(p + 'pgSurplus', pg0.minSurplusW), startSustainS: num(p + 'pgSustain', pg0.startSustainS), windowFrom: val(p + 'pgFrom', pg0.windowFrom), maxWaitH: num(p + 'pgWait', pg0.maxWaitH), durationH: num(p + 'pgDuration', pg0.durationH), startCapability: val(p + 'pgStartCap', pg0.startCapability), startValue: val(p + 'pgStartVal', pg0.startValue), remoteCapability: val(p + 'pgRemoteCap', pg0.remoteCapability), remoteOkValue: val(p + 'pgRemoteVal', pg0.remoteOkValue), doorCapability: val(p + 'pgDoorCap', pg0.doorCapability), doorOkValue: val(p + 'pgDoorVal', pg0.doorOkValue), stateCapability: val(p + 'pgStateCap', pg0.stateCapability), stateIdleValue: val(p + 'pgStateVal', pg0.stateIdleValue),
        };
      }
    });
    if (state.cmpBuilt) {
      var other = $('ems-d-cmp');
      if (other && other.value !== undefined) state.cfg.devices.compareEms = other.value;
    }
  }

  /** Zustand -> zwei Konfigurationen: Energiemanagement und Zählerstände (Kosten). */
  function shareCollect(cur) {
    var s0 = cur || { socLow: 50, socHigh: 80, pctLow: 0, pctHigh: 100 };
    if (!$('ems-share-lo')) return s0;
    var b = function (id, fb) { return Math.min(100, Math.max(0, num(id, fb))); };
    return Object.assign({}, s0, { socLow: b('ems-share-lo', s0.socLow), pctLow: b('ems-share-pctlo', s0.pctLow), socHigh: b('ems-share-hi', s0.socHigh), pctHigh: b('ems-share-pcthi', s0.pctHigh), forecastBonus: Math.min(40, b('ems-share-bonus', s0.forecastBonus || 0)) });
  }

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
        minRunMin: r.minRunMin, minOffMin: r.minOffMin, protectSoc: r.protectSoc, useForecastGate: r.useForecastGate, icon: r.icon || '', batteryFirstSoc: r.batteryFirstSoc === undefined ? null : r.batteryFirstSoc, humidity: r.humidity, accu: r.accu, program: r.program,
      };
    });
    var ems = {
      devices: { meter: c.devices.meter, house: c.devices.house, inverter: c.devices.inverter, compareEms: c.devices.compareEms },
      battery: {
        deviceId: c.battery.deviceId, socCapability: c.battery.socCapability, targetSoc: c.battery.targetSoc, reserveHours: c.battery.reserveHours, solarLimitKwh: c.battery.solarLimitKwh, chargePowerKw: c.battery.chargePowerKw, bridge: c.battery.bridge !== false, bridgeLoadKw: c.battery.bridgeLoadKw, bridgeLoadMode: c.battery.bridgeLoadMode || 'auto', reserveMode: c.battery.reserveMode === 'fixed' ? 'fixed' : 'auto', floorSoc: c.battery.floorSoc,
        backupReserve: { soc: c.battery.backupReserve ? c.battery.backupReserve.soc : 50 }, // active geht nur über «Heute» oder einen Flow, nie über diesen Speichern-Knopf
        control: { enabled: !!(c.battery.control && c.battery.control.enabled), preset: (c.battery.control && c.battery.control.preset) || '', normalDischargeW: c.battery.control ? c.battery.control.normalDischargeW : 7000, repeatMin: c.battery.control ? c.battery.control.repeatMin : 10, custom: c.battery.control && c.battery.control.custom ? c.battery.control.custom : undefined },
      },
      charger: { id: charger ? charger.deviceId : c.charger.id, costName: charger ? charger.name : c.charger.costName, maxAmps: charger ? charger.maxAmps : c.charger.maxAmps, stepHoldS: charger ? charger.stepHoldS : c.charger.stepHoldS, chargeNowAutoOff: charger ? charger.autoOff !== false : c.charger.chargeNowAutoOff !== false, stateCapability: c.charger.stateCapability, powerCapability: c.charger.powerCapability, phaseCapability: c.charger.phaseCapability, startCard: c.charger.startCard, powerCard: c.charger.powerCard, powerArg: c.charger.powerArg },
      pv: { factor: c.pv ? c.pv.factor : 1, factorAuto: !!(c.pv && c.pv.factorAuto), source: (c.pv && c.pv.source) || 'auto', device: (c.pv && c.pv.device) || { id: '', today: '', tomorrow: '' } },
      car: { schedule: c.car && c.car.schedule ? c.car.schedule : undefined, deviceId: c.car ? c.car.deviceId : '', socCapability: c.car ? c.car.socCapability : 'measure_battery', capacityKwh: c.car ? Number(c.car.capacityKwh) || 0 : 0 },
      share: shareCollect(c.share),
      refreshS: Number(c.refreshS) || 0,
      tickMinutes: Number(c.tickMinutes) || 5,
      fuse: c.fuse ? JSON.parse(JSON.stringify(c.fuse)) : undefined,
      sgready: c.sgready ? JSON.parse(JSON.stringify(c.sgready)) : undefined,
      dhw: c.dhw ? JSON.parse(JSON.stringify(c.dhw)) : undefined,
      consumers: consumers,
    };
    var cost = state.rows.filter(function (r) { return r.name && r.meterDeviceId && r.meterCap; }).map(function (r) {
      return { name: r.name, deviceId: r.meterDeviceId, capability: r.meterCap, icon: r.icon || '' };
    });
    return { ems: ems, meters: { consumers: cost } };
  }

  // ---------------------------------------------------------------- Vorschläge

  function suggest() {
    sync();
    var n = 0;
    var by = function (fn) { for (var i = 0; i < state.devices.length; i++) if (fn(state.devices[i])) return state.devices[i]; return null; };
    var has = function (d, re) { return (d.caps || []).some(function (x) { return re.test(x); }); };
    state.suggested = {};
    var set = function (key, d, prefer, re) {
      if (!d || srcDevice(key).id) return;
      setSrc(key, d.id, pickCap(d.id, re || /^measure_power/, '', prefer)); n += 1;
      state.suggested['src-' + key] = true;
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
      state.suggested.row0 = true;
    }
    state.suggestMsg = n ? S.suggested + ' ' + n : S.nothingSuggested;
    if (n) markDirty();
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
        // Korrekturfaktor automatisch: den von der App selbst eingetragenen Wert übernehmen (sonst würde Speichern ihn zurücksetzen)
        if (sc.pv && sc.pv.factorAuto && state.cfg.pv && state.cfg.pv.factorAuto) state.cfg.pv.factor = sc.pv.factor;
      }
      return state;
    });
  }

  function refreshStatus() {
    // Wer gerade in der Vorschau tippt, wird nicht unterbrochen (das Neuzeichnen würde die Eingabe löschen).
    var ae = typeof document !== 'undefined' ? document.activeElement : null;
    if (ae && ae.getAttribute && (ae.getAttribute('data-ems-draft') !== null || ae.getAttribute('data-ems-carf') !== null || ae.getAttribute('data-ems-carcal') !== null || ae.getAttribute('data-ems-cnlim') !== null)) return Promise.resolve();
    return load().then(function () {
      if (noDevice() !== state.renderedNoDevice) { render(); } else { renderMain(); }
      updateShareLive();
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
      state.dirty = false;
      state.suggested = {};
      setMsg(S.saved);
      render();
      renderCompare();
    }).catch(function (e) { setMsg(S.error + ': ' + (e && e.message || e)); });
  }

  // Bewusst kein Auto-Speichern: die Einstellungen steuern echte Geräte, ein halb getippter Wert (z. B. «4» auf dem Weg zu «45»)
  // darf nie gespeichert werden. Stattdessen zeigt der Knopf unübersehbar an, dass noch Änderungen offen sind.
  var AUTOSAVE_SKIP = ['data-ems-enable', 'data-ems-toggle', 'data-ems-silent', 'data-ems-compare', 'data-ems-draft', 'data-ems-carf', 'data-ems-carcal', 'data-ems-cnlim', 'data-ems-calc'];
  function editWanted(t) {
    if (!t || !t.getAttribute) return false;
    var tag = String(t.tagName || '').toLowerCase();
    if (tag && tag !== 'input' && tag !== 'select' && tag !== 'textarea') return false;
    for (var i = 0; i < AUTOSAVE_SKIP.length; i += 1) if (up(t, AUTOSAVE_SKIP[i]) !== null) return false;
    return true;
  }
  function markDirty(target) {
    state.dirty = true;
    var b = $('ems-savebtn');
    if (b) {
      b.textContent = S.saveDirty;
      if (b.style) b.style.background = 'var(--st-warn, #d98a1a)';
    }
    // Jeder geöffnete Bereich hat seinen eigenen Speichern-Knopf (er speichert alle Änderungen der Seite) und zeigt hier, dass etwas offen ist
    var host = $('ems-view-devices');
    if (host && typeof host.querySelectorAll === 'function') {
      host.querySelectorAll('.ems-save-sec').forEach(function (sb) {
        sb.textContent = S.saveDirty;
        if (sb.style) sb.style.background = 'var(--st-warn, #d98a1a)';
      });
    }
    var item = target && target.closest ? target.closest('.ems-item') : null;
    if (item && !item.getAttribute('data-dirty')) {
      item.setAttribute('data-dirty', '1');
      var nm = item.querySelector('.ems-item-n');
      if (nm) nm.insertAdjacentHTML('beforeend', ' <span class="ems-dirty">' + esc(S.unsavedTag) + '</span>');
    }
    setMsg(S.unsaved);
  }
  function onEdit(ev) {
    if (ev && ev.target && /^ems-share-/.test(ev.target.id || '')) updateShareLive();
    if (editWanted(ev && ev.target)) markDirty(ev.target);
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
    var tipId = up(t, 'data-ems-tip');
    if (tipId) {
      if (ev.preventDefault) ev.preventDefault();
      var tipEl = $(tipId);
      if (tipEl) tipEl.hidden = !tipEl.hidden;
      return;
    }
    var open = up(t, 'data-ems-open');
    var adv = up(t, 'data-ems-adv');
    var rm = up(t, 'data-ems-remove');
    var planDay = up(t, 'data-ems-planday');
    var carBtn = up(t, 'data-ems-car');
    if (carBtn === 'savecal') { saveCarTemplate(); return; }
    if (carBtn === 'resetcal') { state.carCal = null; renderMain(); return; }
    if (carBtn) { saveCarOverride(carBtn === 'clear'); return; }
    if (up(t, 'data-ems-carcalopen')) { state.carCalOpen = !state.carCalOpen; return; }
    if (up(t, 'data-ems-previewon')) { state.previewNoEms = true; writePreview(true); render(); return; }
    if (up(t, 'data-ems-previewoff')) { state.previewNoEms = false; writePreview(false); render(); return; }
    var pva = up(t, 'data-ems-pvapply');
    if (pva !== null) {
      sync();
      state.cfg.pv = Object.assign({}, state.cfg.pv, { factor: Number(pva) });
      markDirty();
      renderSetup();
      return;
    }
    var mv = up(t, 'data-ems-move');
    if (mv) {
      sync();
      var mp = mv.split(':'); var mFrom = Number(mp[0]); var mDir = Number(mp[1]);
      var mList = prioList(); var mPos = -1;
      mList.forEach(function (x, k) { if (x.i === mFrom) mPos = k; });
      var mTo = mList[mPos + mDir];
      if (mPos >= 0 && mTo) {
        var tmp = state.rows[mFrom]; state.rows[mFrom] = state.rows[mTo.i]; state.rows[mTo.i] = tmp;
        var oa = state.open['row' + mFrom]; state.open['row' + mFrom] = state.open['row' + mTo.i]; state.open['row' + mTo.i] = oa;
        markDirty();
      }
      renderSetup();
      return;
    }
    var icPick = up(t, 'data-ems-icon');
    if (icPick) {
      sync();
      var ip = icPick.split(':');
      var icRow = state.rows[Number(ip[0])];
      if (icRow) icRow.icon = ip[1];
      renderSetup();
      // Symbol-Wahl ist ein einzelner Klick, kein Formular - direkt speichern statt den Button zu verlangen. Aber
      // nur für einen schon vollständigen Verbraucher (Gerät gewählt) - sonst fliegt die Zeile beim Speichern
      // komplett raus (collect() verlangt ein Gerät) und die Auswahl geht dadurch sofort wieder verloren.
      // Auch ein reiner Kostenzähler (ohne steuerbares Gerät) speichert das Symbol bei den Zählern, wenn Name und Zähler gewählt sind
      if (icRow && (icRow.deviceId || (icRow.name && icRow.meterDeviceId && icRow.meterCap))) save();
      return;
    }
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
    if (up(t, 'data-ems-cnopen')) { state.cnOpen = !state.cnOpen; return; }
    var logF = up(t, 'data-ems-logf');
    if (logF) { state.logFilter = logF; state.logDev = ''; renderMain(); return; }
    if (up(t, 'data-ems-logcmd')) { state.logCmdOnly = !state.logCmdOnly; renderMain(); return; }
    var logDev = up(t, 'data-ems-logdev');
    if (logDev) { state.logDev = logDev === '*' ? '' : logDev; renderMain(); return; }
    if (up(t, 'data-ems-logmore')) { state.logMore = !state.logMore; renderMain(); return; }
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
    if (t.id === 'ems-pv-auto') {
      sync();
      var pvAcc = state.shadow && state.shadow.pvAccuracy;
      if (t.checked && pvAcc && pvAcc.recommend.factor !== null) state.cfg.pv = Object.assign({}, state.cfg.pv, { factor: pvAcc.recommend.factor });
      renderSetup();
      return;
    }
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
      scheduleCarSave();
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
    if (t.id === 'ems-sg-on' || t.id === 'ems-sg-forced' || t.id === 'ems-dhw-on' || t.id === 'ems-dhw-skippv' || g('data-ems-sgdev') !== null) { sync(); renderSetup(); return; }
    var fuseShedKind = g('data-ems-fuseshedkind');
    if (fuseShedKind !== null) {
      sync();
      var fzk = fuseCfg().shed[Number(fuseShedKind)];
      if (fzk) fzk.offFlow = t.value === 'flow' ? { id: '', advanced: false, name: '' } : null;
      renderSetup();
      return;
    }
    var fuseShedFlow = g('data-ems-fuseshedflow');
    if (fuseShedFlow !== null) {
      sync();
      var fzf = fuseCfg().shed[Number(fuseShedFlow)];
      var flSel = (state.flows || []).filter(function (x) { return x.id === t.value; })[0];
      if (fzf) fzf.offFlow = flSel ? { id: flSel.id, advanced: !!flSel.advanced, name: flSel.name } : { id: t.value, advanced: false, name: '' };
      renderSetup();
      return;
    }
    if (t.id && /accuEnable$/.test(t.id)) { sync(); renderSetup(); return; }
    if (g('data-ems-bploadmode') !== null || g('data-ems-bpmode') !== null) { sync(); renderSetup(); return; }
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
    var cnl = g('data-ems-cnlim');
    if (cnl !== null) {
      var curLim = Object.assign({ kind: 'none', value: null }, state.cfg.charger.chargeNowLimit);
      if (cnl === 'kind') { curLim.kind = t.value; curLim.value = t.value === 'soc' ? 80 : (t.value === 'kwh' ? 10 : null); } else curLim.value = Number(t.value);
      api('PUT', '/ems/config', { charger: { chargeNowLimit: curLim } }).then(function (cfgNew) {
        state.cfg.charger.chargeNowLimit = cfgNew && cfgNew.charger ? cfgNew.charger.chargeNowLimit : curLim;
        renderMain();
      }).catch(function () { renderMain(); });
      return;
    }
    if (g('data-ems-chargenow') !== null) {
      var cn = !!t.checked;
      api('PUT', '/ems/config', { charger: { chargeNow: cn } }).then(function () { return refreshStatus(); }).catch(function () { t.checked = !cn; });
      return;
    }
    if (g('data-ems-backupreserve') !== null) {
      var br2 = !!t.checked;
      api('PUT', '/ems/config', { battery: { backupReserve: { active: br2 } } }).then(function () { return refreshStatus(); }).catch(function () { t.checked = !br2; });
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
    state.previewNoEms = readPreview();
    var btn = $('t-ems');
    if (btn) btn.textContent = S.tab;
    var sm = $('ems-sub-main'); if (sm) sm.textContent = S.subMain;
    var sc = $('ems-sub-cmp'); if (sc) sc.textContent = S.cmpTab;
    var sub = $('ems-sub'); if (sub) sub.addEventListener('click', onSubClick);
    ['ems-view-main', 'ems-view-plan', 'ems-view-devices', 'ems-view-cmp'].forEach(function (id) {
      var host = $(id);
      if (host) { host.addEventListener('click', onClick); host.addEventListener('change', id === 'ems-view-devices' ? function (ev) { onChange(ev); onEdit(ev); } : onChange); }
      if (host && id === 'ems-view-devices') host.addEventListener('input', onEdit);
    });
    return Promise.all([
      load(),
      api('GET', '/ems/devices').then(function (r) { state.devices = r.devices || []; }).catch(function () { state.devices = []; }),
      api('GET', '/ems/flows').then(function (r) { state.flows = (r && r.flows) || []; }).catch(function () { state.flows = []; }),
    ]).then(function () {
      render(); renderCompare(); startTimer();
      // Mit Energiemanagement-Gerät ist EMS die erste Ansicht unter «Einrichten»
      if (!noDevice() && window.SetupNav && typeof window.SetupNav.preferEms === 'function') window.SetupNav.preferEms();
    })
      .catch(function (e) {
        var m = $('ems-view-main');
        if (m) m.innerHTML = '<p class="warn">' + esc(S.error + ': ' + (e && e.message || e)) + '</p>';
      });
  }

  window.EmsUi = { init: init, _collect: collect, _state: state, _render: render, _sync: sync, _save: save };
})();
