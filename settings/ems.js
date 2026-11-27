/* Energiemanagement in den Einstellungen.
 *   window.EmsUi.init(apiCall, lang)
 * Drei Ansichten:
 *   #ems-view-main     Reiter "EMS": Betrieb (Statuskopf, Schalter je Gerät)
 *   #ems-view-devices  Setup > Energiemanagement: Datenquellen und Verbraucher
 * apiCall(method, path, body) -> Promise. */
(function () {
  'use strict';

  var STR = {
    de: {
      tab: 'Ausblick', subMain: 'Betrieb',             noDevice: 'Das Energiemanagement ist noch nicht eingerichtet. Füge in Homey unter «Geräte» → «+» → «Dynamischer Stromtarif CH» das Gerät «Energiemanagement» hinzu.',
      devicesSec: 'Energiemanagement einrichten', sources: 'DATENQUELLEN', consumers: 'VERBRAUCHER',
      stOff: 'Ausgeschaltet', stTest: 'Läuft, aber noch kein Gerät ist zum Steuern freigegeben', stLive: 'Läuft und steuert',
      stWarn: 'Läuft mit Warnung', switchHint: 'Schalter ein: das Energiemanagement steuert dieses Gerät. Aus: es lässt das Gerät in Ruhe. Solange der Silent-Modus an ist, wird nur simuliert.',
      pvLbl: 'PV', gridLbl: 'Netz', batLbl: 'Batterie',
      noConsumers: 'Noch kein Verbraucher eingetragen.',
      plan: 'PLAN', planToday: 'Heute', planTomorrow: 'Morgen', planPrice: 'Preis in Rp./kWh', planPv: 'Solar-Prognose', planNow: 'jetzt',
      planBlock: 'Günstigster Block (2 h)', planBlockNow: 'Günstigster Block ab jetzt (2 h)', planPvKwh: 'Solar erwartet', planPriceRange: 'Preis min bis max', planNoPrices: 'Für diesen Tag sind noch keine Preise da.',
      planBat: 'Batterie (Plan)', planBatAdvice: 'Empfehlung, wird nicht gesteuert', planBatLive: 'gesteuert', planWallbox: 'Wallbox (Verlauf)', planWallboxCar: 'Wallbox und E-Auto (Verlauf und Plan)', planChError: 'Fehler', planTo: 'bis', planTest: 'simuliert', planPlanned: 'geplant',
      planCheap: 'günstig', planNormal: 'normal', planExp: 'teuer', planBatCharge: 'Netzladen', planBatHold: 'Halten (Entladung gesperrt)', planBatNormal: 'Normal', planOn: 'ein',
      planNote: 'Die Batterie zeigt den Plan des Planers (alle 15 Minuten neu gerechnet, nur zum Vergleich). Wallbox und Verbraucher regeln nach dem aktuellen Überschuss: hier siehst du, was sie getan haben. Im Silent-Modus ist es die Simulation.',
            carCal: 'Wochenvorlage (Mo bis So)', carCalHint: 'Gilt jede Woche. Ein Eintrag für «Heute» oder «Morgen» oben übersteuert den Tag. Änderungen werden sofort gespeichert.', carCalSaving: 'speichert ...', carCalSaved: 'gespeichert', carSetupHint: 'Ziele, «Heute/Morgen» und die Wochenvorlage stellst du unter «Ausblick» ein.',
      carDays: { mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa', sun: 'So' }, carTime: 'Abfahrt', carSoc: 'Ziel %',
      carHoliday: 'Ferien: keine Ladeziele (Solar lädt weiter)', carHolidayOn: 'Ferien', carHolidayUntilShort: 'bis', carHolidayOpen: 'bis ausgeschaltet', carHolidayUntil: 'bis und mit (optional, leer = bis ausgeschaltet)', carGrid: 'Netz nachladen, wenn die Sonne bis zur Abfahrt nicht reicht', carGridHint: 'Ein: die App lädt in den günstigsten Viertelstunden bis zur Abfahrt. Aus: nur Solarstrom.',
      carCard: 'E-AUTO', carNext: 'Nächstes Ziel', carNone: 'kein Ziel geplant', carFromCal: 'Vorlage', carFromOverride: 'übersteuert',
      carSt: { none: 'Kein Ziel', no_soc: 'Ladestand unbekannt', no_capacity: 'Batteriegrösse fehlt (Einrichten → E-Auto)', reached: 'Ziel erreicht', solar_only: 'Nur Solarstrom', planned: 'Geplant', short: 'Reicht nicht ganz bis zur Abfahrt' },
      carNotConnected: 'nicht angesteckt', carBadgeCharging: 'lädt', carBadgePlugged: 'angesteckt', carBadgeReached: 'Ziel erreicht', carOverride: 'Heute oder morgen anders (übersteuert die Vorlage)', carToday: 'Heute', carTomorrow: 'Morgen', carCharge: 'laden',
      carApply: 'Übernehmen', carClear: 'Vorlage gilt wieder', carSaved: 'Gespeichert',
      silent: 'Silent-Modus: nur simulieren', silentHint: 'Ein: es wird nichts geschaltet. Protokoll und Ausblick zeigen, was passieren würde. Aus: die Geräte mit eingeschaltetem Schalter werden wirklich gesteuert.',
      stSilent: 'Silent-Modus: es wird nur simuliert', silentTag: 'Silent',
      batCtl: 'Batterie steuern', batCtlOn: 'Batterie über das Energiemanagement steuern',                         batCtlWarn: 'Nur ein System darf die Batterie steuern. Schalte die Batteriesteuerung im anderen Energiemanagement und eigene Batterie-Flows aus, bevor du live schaltest.',
      bpMode: 'Spitzenstunden', bpModeAuto: 'automatisch (Fahrplan)', bpModeFixed: 'feste Anzahl Stunden',
      bpModeAutoHint: 'Der Fahrplan gibt die Ladung in die teuersten Viertelstunden bis zum nächsten Nachladen (nachts günstig aus dem Netz oder tagsüber von der Sonne) und lädt nur nach, wenn es sich trotz Verlust lohnt. Wie viele Stunden das sind, ergibt sich aus Ladung und Verbrauch.',
      schText: 'Fahrplan: lädt {kwh} kWh um {from} bis {to} (Schnitt {cp} Rp.), gibt {dkwh} kWh in die teuersten Viertelstunden ab (Schnitt {dp} Rp.). Nutzen ca. {chf} CHF.', schNoCharge: 'Fahrplan: kein Netzladen nötig, die Ladung ({dkwh} kWh) geht in die teuersten Viertelstunden (Schnitt {dp} Rp.).', schNothing: 'Fahrplan: zurzeit nichts zu tun.',
      ldMode: { normal: 'entladen', hold: 'halten', charge: 'laden' }, ldBand: { low: 'unter 20 Rp.', mid: '20 bis 30 Rp.', high: 'ab 30 Rp.' },             bpTitle: 'Planung', bpReserve: 'Spitzenstunden mit der Batterie abdecken (h)', bpReserveHint: 'In den so vielen teuersten Stunden der nächsten 24 Stunden gibt die Batterie Strom ab, sonst hält sie die Ladung zurück.',
      bpSolar: 'Kein Netzladen ab Sonne (kWh)', bpSolarHint: 'Bringt die Sonne in den nächsten 24 Stunden mindestens so viel, wird nicht aus dem Netz geladen (0 = immer laden).',
      spreadLabel: 'Mindest-Gewinn je kWh (Rp.)',
      spreadHint: 'Die Batterie lädt nur aus dem Netz, wenn jede geladene und später genutzte kWh mindestens so viel einspart. Darin steckt der Verschleiss der Batterie: Preis der Batterie ÷ (Kapazität × Zyklen), zum Beispiel 7000 CHF ÷ (13.8 kWh × 6000) = 8.5 Rp. Der Wirkungsgrad wird zusätzlich eingerechnet. Höher = lädt seltener, nur bei grossem Preisunterschied. 0 = Verschleiss wird nicht gerechnet.',
      bufLabel: 'Puffer', bufAutoNow: 'Automatik (aktuell {pct} %)', bufFixed: 'fester Wert (%)', bufFixedNow: 'fester Wert', bufHint: 'Der Fahrplan hält so viel Ladung zusätzlich in Reserve, falls das Haus mehr braucht als erwartet. Mehr Puffer = sicherer, aber etwas mehr Netzladen.', bufInfoAuto: 'Aktuell {pct} % ({kwh} kWh): so viel mehr als erwartet brauchte das Haus {where} an 3 von 4 Tagen ({days} Tage gemessen).', bufInfoWait: 'Noch keine Messung ({days} von {needed} Tagen): bis dahin {pct} % ({kwh} kWh).', bufInfoFixed: 'Fest {pct} % ({kwh} kWh).', bufEvening: 'abends', bufMorning: 'morgens',
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
      batModeCharge: 'Laden', batModeHold: 'Halten', batModeNormal: 'Normal',       batRow: 'Batterie', batRowNone: 'noch nichts gesendet', batSent: 'zuletzt',
      logTitle: 'PROTOKOLL', logNone: 'Noch keine Einträge.', logAll: 'Alle', logCar: 'E-Auto', logWallbox: 'Wallbox', logBat: 'Batterie', logCons: 'Verbraucher', logFuse: 'Hausanschluss', logMore: 'Mehr anzeigen', logLess: 'Weniger anzeigen', logToday: 'Heute', logYesterday: 'Gestern',
      secCar: 'E-AUTO', secWallbox: 'WALLBOX', secBat: 'HAUSBATTERIE',
      carWaiting: 'Daten folgen mit dem nächsten Lauf', autoCharge: 'Automatisch laden', autoChargeOff: 'Aus: die Wallbox läuft wie bisher (eigene App oder Flows)', autoChargeNoCar: 'Kein Auto angesteckt',
      cnLimit: 'Grenze', cnNone: 'bis zum Abstecken', cnNoneManual: 'bis ausgeschaltet', cnSoc: 'bis Ladestand (%)', cnKwh: 'bis Energie (kWh)', cnUntil: 'bis', cnNow: 'jetzt', cnLoaded: 'geladen', cnHint: 'Sofort laden lädt mit voller Leistung, egal zu welchem Preis, und geht bei der Grenze von selbst aus.',
      logCmdOnly: 'nur Schaltungen', logAllSim: 'Silent-Modus: alle Einträge sind simuliert.', logOnWord: 'ein', logOffWord: 'aus', logStartWord: 'gestartet', logTestTag: 'simuliert',
            maxConsumers: 'Höchstens 8 gesteuerte Verbraucher. Entferne einen oder führe weitere als reine Kostenzähler (ohne Gerät zum Schalten).',
      srcCar: 'E-Auto', whyCar: 'Optional, empfohlen mit Wallbox. Mit dem Ladestand des Autos (aus der App deines Autos) kannst du Aufträge als «Ziel-Ladestand bis Uhrzeit» planen. Ohne läuft alles weiter, dann gibst du die Energie in kWh an.',
      carCap: 'Batteriegrösse des Autos (kWh)', carFallback: 'Ohne Ladestand: Energie je Abfahrt (kWh)', carFallbackH: 'Für Autos, die ihren Ladestand nicht an Homey melden. Die App lädt dann bis zu jeder Abfahrt aus der Wochenvorlage so viel Energie in den günstigsten Viertelstunden. Was seit dem Einstecken schon geladen wurde, wird abgezogen. Der Ziel-Ladestand in % gilt dann nicht. 0 = aus, dann lädt das Auto nur mit Solarstrom oder mit «Sofort laden». Liefert das Auto einen Ladestand, gilt immer der Ladestand.', carSocLbl: 'E-Auto', carNow: 'E-Auto jetzt', pvTargetSoc: 'Ziel-Ladestand (%, statt Energie)', pvNeedCarSoc: 'Der Ladestand des E-Autos ist unbekannt (Setup → E-Auto)', pvNeedCarCap: 'Batteriegrösse des E-Autos fehlt (Setup → E-Auto)',
      pvReachedAlready: 'Das Auto hat den Ziel-Ladestand schon erreicht', pvSocFrom: 'von', pvSocTo: 'auf', pvDayStrip: 'Vorschau im Tagesverlauf',
      cmdT: { 'battery.charge': 'Batterie: aus dem Netz laden', 'battery.hold': 'Batterie: halten (nicht entladen)', 'battery.normal': 'Batterie: Normalbetrieb', 'charger.start': 'Wallbox: Laden starten', 'charger.set': 'Wallbox: Ladeleistung setzen', 'charger.stop': 'Wallbox: Laden stoppen', 'sgready.normal': 'SG-Ready: Normalbetrieb', 'sgready.boost': 'SG-Ready: Empfehlung (Boost)', 'sgready.forced': 'SG-Ready: Zwangsladung', 'dhw.program': 'Warmwasser: Programm ein', 'dhw.normal': 'Warmwasser: zurück auf Normal', 'dhw.delay': 'Warmwasser: verzögern' },
      cmdTest: 'Testen', cmdTestFail: 'Befehl fehlgeschlagen:', cmdTestWhy: 'Mit «Testen» gibst du den Befehl einmal von Hand aus, auch im Testmodus, um deinen Flow zu prüfen (Werte vorsichtig: die Batterie bekommt keinen Ladeauftrag über den aktuellen Stand).',
      cmdLabel: 'Flow-Rezepte', cmdRow: 'Befehle der App an deine Geräte', cmdTagsLbl: 'Tags',
      cmdFlowOk: 'Flow vorhanden', cmdFlowMissing: 'Kein Flow', cmdFlowOff: 'Flow ist ausgeschaltet', cmdFlowBroken: 'Flow ist defekt', cmdFlowEmpty: 'Flow ohne Aktion',
      ctrlMissing: 'Steuerung fehlt', devMissing: 'Gerät fehlt', refTitle: 'Gelöschte Geräte oder Flows', refWhy: 'Diese Geräte oder Flows gibt es in Homey nicht mehr. Die App steuert dann ohne sie weiter. Wähle ein neues Gerät oder entferne den Verweis.', refRemove: 'Verweis entfernen', refRemoveConsumer: 'Verbraucher entfernen', refRecheck: 'Neu prüfen', refChecking: 'Prüfe …', refBadgeDev: 'Gerät gelöscht', refBadgeFlow: 'Flow gelöscht', refBadgeCap: 'Capability fehlt', refBadgeMix: 'Verweis fehlt', refArea: { grid: 'Netz-Zähler', pv: 'PV-Inverter', house: 'Hausverbrauch', battery: 'Batterie', charger: 'Wallbox', car: 'E-Auto', forecast: 'PV-Prognose', consumer: 'Verbraucher', fuse: 'Hausanschluss-Schutz', sgready: 'SG-Ready', dhw: 'Warmwasser' }, refField: { sensor: 'Fühler', mode: 'Betriebsart', feedback: 'Rückmeldung', relay: 'Relais', forceRelay: 'Zwangs-Relais', heating: 'Statusfeld', target: 'Soll', output: 'Ausgabe', meter: 'Zähler', shed: 'Abschaltgerät', shedFlow: 'Abschalt-Flow', accu: 'Akku-Fühler', humidity: 'Feuchte-Fühler', flowOn: 'Flow ein', flowOff: 'Flow aus', flowNormal: 'Flow Normal', flowBoost: 'Flow Empfehlung', flowForced: 'Flow Zwang', flowDelay: 'Flow Verzögern' }, refProblem: { device: 'Gerät gelöscht', flow: 'Flow gelöscht', capability: 'Capability fehlt' }, cmdSending: 'sendet …', cmdSent: 'Befehl ausgegeben', cmdChecked: 'Flows geprüft',
      cmdCheck: 'Flows neu prüfen', cmdChecking: 'Prüfe Flows …', cmdCheckFail: 'Flows konnten nicht geprüft werden', cmdSummary: 'mit Flow', cmdWhyCheck: 'Der Punkt zeigt, ob ein eingeschalteter Flow auf den Befehl wartet (Auslöser «Das Energiemanagement gibt einen Befehl»).',
      cmdIntro: 'Die App schaltet fremde Geräte nicht selbst: Homey erlaubt Apps nicht, Karten anderer Geräte auszuführen. Stattdessen gibt sie Befehle aus. Lege je Befehl einen Flow an: WENN «Das Energiemanagement gibt den Befehl …», DANN die Karte deines Geräts (egal welche Marke). Die Werte stehen als Tags zur Verfügung. Befehle gibt es nur live, im Testmodus werden sie nur protokolliert.',
      cmdWhere: 'Neuer Flow, WENN, App «Energiemanagement», Karte «Das Energiemanagement gibt einen Befehl», Befehl wählen.',
      cmdFires: 'Die App gibt aus:', cmdNone: 'Keine Befehle (noch nichts eingerichtet).', cmdOn: 'einschalten', cmdOff: 'ausschalten', cmdShed: 'Schutz',       cmdHint_battery: 'Laden: Karte deiner Batterie «Laden aus dem Netz» mit [power] und [target_soc]. Halten: Laden stoppen und die maximale Entladeleistung auf 0. Normal: Laden stoppen, Betriebsart Eigenverbrauch, maximale Entladeleistung auf [discharge].',
      cmdHint_charger: 'Ladeleistung setzen: Karte deiner Wallbox mit [power] (Watt). Laden starten und Laden stoppen: die Karten der Wallbox dazu.',
      cmdHint_consumer: 'Schalte das Gerät mit seiner Karte ein oder aus, oder starte einen deiner Flows (Aktion «Flow starten»).',
      cmdHint_sgready: 'Setze die Betriebsart deiner Wärmepumpe (SG-Ready) mit der passenden Karte oder schalte die Relais.',
      cmdHint_dhw: 'Programm ein: Warmwasser-Soll erhöhen. Zurück auf Normal: Soll zurücksetzen. Verzögern: Soll absenken. Der Wert «Warmwasser-Soll» ist nur beim Auslöser «Der Warmwasser-Soll soll gesetzt werden» ein Tag.',
      cmdHint_shed: 'Schalte das Gerät aus, das der Hausanschluss-Schutz abschalten soll.',
      ctrlKind: 'Schalten über', ctrlViaDevice: 'Gerät (ein/aus)', ctrlViaFlow: 'Befehl an einen Flow (ein und aus)',             assumedW: 'Leistung des Verbrauchers (W, für die Überschussrechnung)',
      pvReached: 'erreicht', pvReachedSoFar: 'bisher erreicht', pvForecastLeg: 'Prognose',
      planTable: 'AB JETZT: WANN PASSIERT WAS', planColTime: 'Zeit', planColWhat: 'Was passiert', planColPrice: 'Ø Rp.', planNothing: 'Es sind noch keine Preisdaten für die kommenden Stunden da.',
      planTablePrices: 'AB JETZT: PREISE', planColLevel: 'Preisniveau',
      planShortCharge: 'Laden', planShortHold: 'Halten', planShortSolar: 'Solar', planShortFull: 'voll', planTableHint: '= geplant, sonst läuft es schon so.',
      planChSolar: 'lädt (Solar)', planChFull: 'lädt (volle Leistung)', planTag: 'geplant',       calcTitle: 'BERECHNUNG', calcRow: 'Rechenintervall', calcAuto: 'Automatisch', calcEvery: 'Alle', calcSecs: 's', calcOptAuto: 'Automatisch (15 s mit Auto, 30 s mit Verbrauchern, sonst 5 min)', calcOpt15: 'Alle 15 Sekunden', calcOpt30: 'Alle 30 Sekunden', calcOpt60: 'Jede Minute', calcOpt300: 'Alle 5 Minuten',
      notifyTitle: 'MELDUNGEN', notifyRow: 'Timeline', notifyOn: 'Wichtige Meldungen in die Timeline', notifyOnS: 'an', notifyOffS: 'aus', notifyH: 'Schreibt nur, was du wissen musst, je Vorfall einmal: Fehler (z. B. Wallbox oder Zähler nicht lesbar, Batterie-Befehl gescheitert, Sicherheits-Stopp), Abschaltung durch den Hausanschluss-Schutz, Wärmepumpe folgt nicht (SG-Ready-Zustand oder Warmwasser-Soll) und gelöschte Geräte oder Flows (höchstens einmal am Tag). Alltägliches wie Batteriewechsel oder Starts kommt nicht in die Timeline, dafür gibt es die Flow-Auslöser.', calcLabel: 'Wallbox und Verbraucher rechnen', calcTick: 'Batterie-Plan alle (Minuten)', calcDevices: 'gelesene Geräte', calcCalls: 'Abfragen pro Stunde',
      calcAutoImpact: 'Je nach Lage: ruhig 5 min, mit Verbrauchern 30 s, mit Auto an der Wallbox 15 s.',
      calcImpact: 'Kürzer: reagiert schneller auf Wolken und Lastwechsel, belastet Homey aber stärker (sehr viele Abfragen können das Limit von Homey erreichen). Länger: ruhiger und schonender, die Anlage reagiert träger und etwas Überschuss geht ans Netz. Halte- und Karenzzeiten (in Sekunden) wirken nur im Takt des Laufs.',
      calcTickHint: 'Der Batterie-Plan (nur Vergleich) rechnet in diesem Takt, 1 bis 15 Minuten. Die Preise ändern sich nur alle 15 Minuten.',
      pvTitle: 'VORSCHAU: AUFTRAG PLANEN', pvIntro: 'Gib ein, was bis wann passieren soll. Die Vorschau zeigt, in welchen Viertelstunden es laufen würde. Es wird nichts gespeichert und nichts geschaltet.',
      pvDevice: 'Gerät', pvUntil: 'Fertig bis', pvKwh: 'Energie (kWh)', pvHours: 'Laufzeit (h)', pvPower: 'Leistung (kW, optional, leer = automatisch)', pvMaxPrice: 'Höchstpreis (Rp./kWh, optional, leer = egal)',
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
      fuseOutTabTitle: 'HAUSANSCHLUSS: AUSBLICK 24 STUNDEN', fuseOutWhy: 'Erwarteter Netzbezug, wenn alles Geplante gleichzeitig läuft: gelernter Hausverbrauch plus Batterie-Fahrplan, E-Auto und geplante Aufträge, abzüglich Sonne. Verbraucher nach Überschuss laufen von der Sonne und sind nicht eingerechnet. Annahme: gleichmässig auf die drei Phasen verteilt; ein einphasiges Gerät auf der falschen Phase kann die Grenze früher erreichen.', fuseOutPeak: 'Spitze {kw} kW um {time}: {pct} % der Grenze ({limit} kW)', fuseOutOk: 'ok', fuseOutTight: 'knapp', fuseOutOver: 'über der Grenze', fuseOutHouse: 'Haus', fuseOutNone: 'Noch kein Verbrauchsprofil: der Ausblick erscheint, sobald die App den Hausverbrauch gelernt hat.',
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
      dhwHeating: 'Wärmepumpe bereitet Warmwasser (Statusfeld, optional)', dhwHeatingH: 'Gerät und Eigenschaft, die meldet, dass die Wärmepumpe gerade selbst Warmwasser bereitet (zum Beispiel «WW Bereitung»). Solange das so ist, startet das Programm nicht (auch nicht von Hand), und die Verzögerung wird nicht gestartet, weil das Absenken den laufenden Zyklus abbrechen würde. Leer = keine Prüfung.', dhwHeatingOk: 'Wert für «bereitet» (zum Beispiel true)',
      dhwModeProgram: 'Betriebsart während des Programms (optional, z. B. Warmwasser)', dhwModeProgramH: 'Nur nötig, wenn das Programm die Betriebsart der Wärmepumpe selbst umschaltet (zum Beispiel ein Betriebsart-Flow auf «Warmwasser»). Dann trägst du hier den Wert ein, den das Gerät in dieser Betriebsart meldet, damit die Prüfung «Steuern nur bei diesem Wert» das eigene Umschalten nicht als Fremdeingriff wertet und den Lauf abbricht. Bleibt die Betriebsart während des Programms gleich (WW-Soll über Karte, Auslöser oder Flows), lass das Feld leer. Im Warmwasserbetrieb ist die Heizung aus, danach muss es zurück auf Automatik.',
      dhwMaxRun: 'Höchstdauer (Min.)', dhwMaxRunH: 'Sicherheitsgrenze: danach wird zurück auf Normal gesetzt (der Warmwasserbetrieb schaltet die Heizung ab). 0 = unbegrenzt.',
      dhwTitle: 'WARMWASSER-PROGRAMM BEI GÜNSTIGEM PREIS', dhwRow: 'Warmwasser-Programm', dhwOff: 'aus', dhwRunning: 'läuft', dhwWaiting: 'wartet',
      dhwOnLbl: 'Warmwasser-Programm bei günstigem Preis starten', dhwWhy: 'Unabhängig von SG-Ready: liegt die Zeit in den günstigsten Stunden des Tages und das Warmwasser unter dem Mindestwert, startet das Warmwasser-Programm der Wärmepumpe (Flow oder App-Funktion) und danach wieder zurück auf Normal. Läuft SG-Ready, startet das Programm nicht (und umgekehrt).',
      dhwCheapHours: 'Günstigste Stunden pro Tag (h)', dhwCheapH: 'Das Programm startet in den günstigsten N Stunden des Tages (nach den Viertelstunden-Preisen von heute). Die Vorschau zeigt, wann das heute und morgen wäre.',
      dhwPreview: 'Vorschau', dhwToday: 'Heute', dhwTomorrow: 'Morgen', dhwAvg: 'Ø', dhwNoPrices: 'Vorschau: noch keine Preise für heute.',
      dhwBelow: 'Nur starten unter Warmwasser (°C)', dhwBelowH: 'Nur wenn das Warmwasser unter diesem Wert liegt (0 = immer). Ohne Temperatur-Messwert startet es nicht.',
      dhwSkipPv: 'Nicht starten, wenn die Sonne reicht', dhwSkipPvKwh: 'Sonne reicht ab Prognose (kWh, Rest heute)', dhwSkipUntil: 'Sonnenprognose zählt bis', dhwSkipPvH: 'Lohnt sich nicht, per Preis zu starten, wenn die Sonne heute noch genug liefert (Rest-Prognose).', dhwSkipUntilH: 'Bis zu dieser Uhrzeit zählt die Sonnenprognose, danach darf der Preis starten.',
      dhwTarget: 'Beenden ab Warmwasser (°C)', dhwTargetH: 'Erreicht das Warmwasser diese Temperatur, wird zurück auf Normal gesetzt. Der eigentliche Zielwert steht in der Wärmepumpe selbst.', dhwMinRunH: 'Einmal gestartet läuft das Programm mindestens so lange. Nur Zieltemperatur, Betriebsart oder Sonne (SG-Ready) beenden früher.',
      dhwLive: 'Warmwasser-Programm live (sonst nur simulieren)', dhwLiveHint: 'Live startet es das Programm wirklich. Der Silent-Modus hat Vorrang. Vorher einen bestehenden Flow dafür ausschalten, damit nur ein System schaltet.',
      hpBoss: 'Wichtig: Die Wärmepumpe bleibt unabhängig von diesen Einstellungen der Chef. Die App gibt nur Signale und Sollwerte (SG-Ready-Empfehlung, Warmwasser-Soll). Ob und wie die Wärmepumpe heizt, entscheidet allein ihre eigene Regelung mit Hysterese, Schutzfunktionen und EVU-Sperre. Dieses Programm ist für Fortgeschrittene: Wer es einfacher will, nutzt nur SG-Ready mit Sonne oder baut sich die Logik selbst mit Advanced Flows (die App liefert dafür die Auslöser «Befehl» und «Warmwasser-Soll soll gesetzt werden»).',
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
            sgDhwOut: 'Warmwasser-Programm setzen über', sgDhwFlows: 'Flows (ein / zurück auf Normal, z. B. WW-Soll per Modbus)', sgDhwCap: 'App-Funktion (Capability eines Geräts)', sgDhwOn: 'Flow Warmwasser-Programm ein', sgDhwOff: 'Flow zurück auf Normal', sgDhwDev: 'Gerät und Capability der App-Funktion', sgDhwOnV: 'Wert für ein', sgDhwOffV: 'Wert für zurück auf Normal', sgDhwH: 'Werte als Text, true/false für Schalter. Beim Ende wird zurück auf Normal gesetzt, aber nur, wenn die Steuerung das Programm selbst gestartet hat.',
            sgPvBelow: 'Sonnen-Start nur unter Warmwasser (°C)', sgPvBelowH: 'Optional: auch mit Sonne nur starten, wenn das Warmwasser unter diesem Wert liegt (0 = immer, Standard).',
            sgForced: 'Zwangsladung (1:1) erlauben', sgForcedW: 'Schwelle Zwangsladung (W)', sgForcedH: 'Zustand 1:1, oft mit Heizstab und viel Strom. Nur aus dem Boost heraus und erst ab dieser Solarleistung. Standard aus.',
      sgSensor: 'Warmwasser-Temperatur (Gerät und Wert)', sgSensorH: 'Messwert «WW IST» der Wärmepumpe, damit der Boost bei der Zieltemperatur endet.',
      sgMode: 'Betriebsart der Wärmepumpe (Gerät und Wert, optional)', sgModeOk: 'Steuern nur bei diesem Wert (z. B. Automatik)', sgModeH: 'Die Steuerung greift nur ein, wenn die Betriebsart diesen Wert hat. Bei Ferien, Komfort oder Standby wird nicht gesteuert. Leer lassen = keine Prüfung.',
      sgFeedback: 'Zustand von der Wärmepumpe übernehmen (Gerät und Wert, optional)', sgFeedbackH: 'Liest den SG-Ready-Zustand der Wärmepumpe (z. B. «2 NORMAL»), zeigt ihn im Widget und warnt, wenn er nach dem Schalten nicht passt. Leer = nur der eigene Zustand.',
      sgOutput: 'Wie werden die Zustände gesetzt?', sgOutRelays: 'Zwei Relais (Schaltaktoren)', sgOutFlows: 'Flows (je Zustand ein Flow, z. B. Modbus)',
      sgOutH: 'Relais: Normal (0:0) = beide aus. Empfehlung (0:1) = das Empfehlungs-Relais ist an und schliesst den zweiten SG-Kontakt. Zwangsladung (1:1) = zusätzlich ist das Zwangsladungs-Relais an und schliesst den ersten Kontakt. Die Schreibweise heisst Kontakt 1 : Kontakt 2, 1 = geschlossen. Wie die Klemmen an deiner Wärmepumpe heissen (z. B. SG1/SG2 oder EVU/SG), steht in ihrer Anleitung. Den Zustand 1:0 (Sperre durch den Netzbetreiber) setzt die App nie, auch nicht kurz beim Umschalten. Flows: ein eigener Flow je Zustand, z. B. Modbus-Register schreiben.',
      sgSetupH: 'Anschluss und Wärmepumpe: Nur potenzialfreie Kontakte verwenden und nie Netzspannung an die SG-Eingänge legen. Den Anschluss macht eine Elektrofachperson. Die Relais so einstellen, dass sie nach einem Stromausfall aus sind, dann läuft die Wärmepumpe im Normalbetrieb weiter. SG-Ready muss im Menü der Wärmepumpe eingeschaltet sein. Dort wird oft auch eingestellt, um wie viel Grad sie bei 0:1 und 1:1 höher heizt. Manche Wärmepumpen reagieren erst nach einigen Minuten, deshalb gibt es eine Mindestlaufzeit. Mit «Zustand von der Wärmepumpe übernehmen» siehst du, ob sie das Signal erkannt hat.',
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
        pgFrom: 'Optional. Der günstige Block wird erst ab dieser Uhrzeit gesucht, auch wenn die Automatik früher eingeschaltet wird (zum Beispiel mittags beladen, aber erst abends laufen lassen). Leer: sofort ab dem Einschalten der Automatik. Bei PV-Überschuss startet es immer sofort.',
        pgWait: 'So lange wartet die Automatik höchstens auf Überschuss oder den günstigsten Block, danach startet sie auf jeden Fall. Beim Einschalten im Widget kannst du eine andere Wartezeit wählen, zum Beispiel 8 Stunden, wenn du abends einschaltest und es morgens um 04:00 starten soll.',
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
      name: 'Name', type: 'Typ',       ctrlDevice: 'Gerät zum Schalten', meterDevice: 'Zähler für die Kosten (kWh)', mode: 'Einschalten',
      modeFull: 'Bei voller Batterie', modeSoc: 'Ab Batterie-SoC', modeSurplus: 'Bei Überschuss', modeProgram: 'Programm starten', noCtrl: 'nur Kostenzähler',
      programTitle: 'Programm starten', programWindow: 'Preis-Start frühestens ab (optional)', programMaxWait: 'Standard-Wartezeit (h)', programDuration: 'Programmdauer (h)',
      programHint: 'Du schaltest die Automatik im Widget mit dem Schalter «Auto» ein, sobald die Maschine beladen ist. Sie startet sofort bei genug PV-Überschuss. Sonst wird bis zur Wartezeit der günstigste Block der Programmdauer gewählt, spätestens am Ende der Wartezeit gestartet (Sicherheitsnetz). Danach geht die Automatik von selbst aus, für den nächsten Lauf schaltest du sie wieder ein. Beliebig viele Läufe pro Tag, auch über Mitternacht.',
      programStartCap: 'Start-Capability', programStartVal: 'Start-Wert', programRemoteCap: 'Fernbedienung-Capability (optional)', programRemoteVal: 'Fernbedienung-Wert (wenn aktiv)',
      programRemoteWarn: 'Ohne Fernbedienung-Capability wird nicht geprüft, ob das Gerät überhaupt geschaltet werden kann - bei manchen Geräten (z. B. Electrolux) zwingend nötig.',
      programDoorCap: 'Tür-Capability (optional)', programDoorVal: 'Tür-Wert «zu» (wenn gewählt)',
      programStateCap: 'Status-Capability (optional)', programStateVal: 'Status-Wert «bereit/leer» (wenn gewählt)',
      programStateHint: 'Verhindert einen zweiten Start-Befehl, während das Gerät noch läuft (egal ob von Hand oder von uns gestartet) - welche Capability und welcher Wert «bereit» bedeutet, ist je Gerät anders. Leer lassen, wenn das Gerät so etwas nicht hat.',
      fullSoc: 'Voll ab SoC (%)', socOn: 'Ein ab SoC (%)', hysteresis: 'Aus unter (Prozentpunkte darunter)',
      batFirst: 'Hausbatterie zuerst bis (%, optional)', batFirstPh: 'wie Wallbox', batFirstHint: 'Leer: wie die Wallbox (Hausbatterie hat Vorrang bis zur gemeinsamen Grenze). Eine Zahl: eigene Grenze; darüber nimmt der Verbraucher auch den Strom, der gerade in die Hausbatterie fliesst. Für kleine Verbraucher (eBike) z. B. 0.',
      minSurplus: 'Mindest-Überschuss (W)', startSustain: 'Überschuss muss anhalten (s)', stopGrace: 'Karenz vor dem Ausschalten (s)',
      advanced: 'Erweitert', minRun: 'Mindestlaufzeit (min)', minOff: 'Mindest-Pause (min)', protect: 'Schutz-SoC: darunter sofort aus (%)', useGate: 'Prognose-Sperre beachten',
      shareAt: 'Batterie ab (%)', shareGets: 'Anteil Solarstrom (%)', shareLowRow: 'Untere Grenze: ab hier bekommt das Auto Solarstrom', shareHighRow: 'Obere Grenze: ab hier bekommt es den vollen Überschuss', shareChartCap: 'So viel vom Solarstrom bekommt das Auto je Batteriestand', shareNow: 'Jetzt: Batterie {soc} % → das Auto bekommt {pct} % des Solarstroms.', shareBonusTitle: 'Prognose-Bonus', shareVal: 'Solaranteil Auto {pct} %', wbLinkTitle: 'Anschluss der Wallbox (wie sie angesprochen wird)', wbLinkWhy: 'Der Standard passt für Wallboxen mit den Karten «Laden starten» und «Ladeleistung setzen». Bei einer anderen Wallbox hier wählen, was das Gerät liest und welche Flow-Karten es zum Steuern hat. Die Leistung wird aus Ampere, Phasen und 230 V berechnet und in Watt an die Karte «Ladeleistung setzen» übergeben (Stopp = 0 W).', wbState: 'Ladezustand (Capability)', wbPower: 'Ladeleistung (Capability)', wbPhase: 'Phasen (Capability, optional)', wbPhaseH: 'Nur für die Phasenumschaltung. Erwartete Werte: 1 = eine Phase, 2 = drei Phasen.', wbNone: '– keine –', wbStd: 'Standard', wbCustom: 'Eigene Zuordnung', paLabel: 'LERNBERICHT', paRow: 'Plan-Genauigkeit', paSumWait: 'Misst seit {n} Tagen, ein Urteil gibt es ab {m} Tagen', paSumBetter: '{k} von {t} Prognosen lassen sich verbessern', paSumNone: 'Die heutigen Methoden sind gut genug', paWhy: 'Misst nur und ändert nichts: wie gut stimmen die Prognosen des Planers mit dem überein, was wirklich geschah. Fehler = Abweichung in Prozent des Gemessenen, kleiner ist besser.', paDays: 'Tage', paNow: 'heutige Methode', paAlt: 'Alternative', paBest: 'Besser', paLoadM: 'Verbrauch Morgen 05-10', paLoadD: 'Verbrauch Tag 10-17', paLoadE: 'Verbrauch Abend 17-22', paPvRest: 'Solar: Rest des Tages ab 10:30', paWait: 'noch {n} von {m} Tagen', paMean: 'Durchschnitt', paRobust: 'robust', paPlain: 'unverändert', paNowcast: 'mit Morgen-Korrektur', paSame: 'gleich gut', paNote: 'Verbrauch: «Durchschnitt» ist die heutige Methode (Mittel der letzten 7 Tage), «robust» der Median der gleichen Tagesart (Werktag/Wochenende), unempfindlich gegen einzelne Grossverbraucher. Solar: «unverändert» ist die Rest-Prognose, «mit Morgen-Korrektur» wird mit dem Verhältnis gemessen/prognostiziert von 06:00 bis 10:30 skaliert. Eine Methode gilt erst als besser, wenn ihr Fehler um mindestens 10 % kleiner ist.', pvAccTitle: 'Empfehlung aus den letzten Tagen', pvAccNone: 'Noch zu wenig Daten: {n} von mindestens {m} vollständigen Tagen. Die App hält jeden Morgen die Prognose des Tages fest und vergleicht sie am Abend mit der gemessenen Produktion.', pvAccRec: 'Empfehlung: {f} (Median aus {n} Tagen, meist zwischen {lo} und {hi}).', pvAccRecent: 'Nur die letzten {n} Tage: {f}.', pvApply: 'Übernehmen', pvAuto: 'Korrekturfaktor automatisch', pvAutoH: 'Ab 7 vollständigen Tagen trägt die App den empfohlenen Wert einmal am Tag selbst in das Feld ein. Das Feld zeigt dann den aktuellen Wert.', pvAccLog: 'Verlauf der letzten Tage', pvAccDay: 'Tag', pvAccFc: 'Prognose ohne Faktor (kWh)', pvAccAct: 'Gemessen (kWh)', pvAccRatio: 'Verhältnis', pvAccToday: 'heute', pvAccNote: 'Es zählen nur vollständige Tage mit mindestens 2 kWh Prognose. Das Verhältnis ist gemessen geteilt durch die Prognose ohne Faktor.', dlyTitle: 'Warmwasser verzögern (PV zuerst)', dlyWhy: 'Optional. Fällt das Warmwasser im Zeitfenster unter die Startschwelle der Wärmepumpe, wird ihr Start hinausgezögert (der WW-Soll wird per Flow abgesenkt), damit das Warmwasser mit Solarstrom oder im günstigen Block erzeugt wird statt morgens mit Netzstrom. Danach wird der Soll wieder freigegeben. Braucht die Ausgabe über die Aktionskarte oder die Flows «verzögern» und «zurück auf Normal» (oben).', dlyOn: 'Warmwasser verzögern', dlyFlow: 'Flow «Soll absenken (verzögern)»', dlyFrom: 'Zeitfenster von', dlyTo: 'bis', dlyForecast: 'Genug Sonne ab Prognose (kWh)', dlyForecastH: 'Rest-Prognose von heute. Ab diesem Wert wartet die Wärmepumpe bis zur Freigabezeit auf die Sonne (SG-Ready). Im November ist die Prognose oft zu hoch, darum eher tiefer ansetzen.', dlyComfort: 'Komfortgrenze (°C)', dlyComfortH: 'Fällt das Warmwasser unter diesen Wert, wird sofort freigegeben (niemand soll kalt duschen). Unter dieser Grenze wird auch nicht verzögert.', dlyRelWd: 'Freigabe Mo bis Fr', dlyRelWe: 'Freigabe Wochenende', dlyRelLow: 'Freigabe bei wenig Sonne', dlyRelLowH: 'Uhrzeit, zu der bei zu wenig Prognose (und ohne Preisoptimierung) freigegeben wird.', dlyMargin: 'Startschwelle: Marge über Soll minus Hysterese (K)', dlyMarginH: 'Verzögert wird, sobald das Warmwasser unter Soll minus Hysterese plus diese Marge fällt, also kurz bevor die Wärmepumpe von selbst startet.', dlyNow: 'Aktuell verzögert bis {time}: {why}', dlyNeed: 'Zum Verzögern fehlt die Aktionskarte (oben) bzw. die Flows «verzögern» und «zurück auf Normal».', dhwPriceFrom: 'Preisoptimierung ab (Datum, optional)', dhwPriceFromH: 'Günstigste Stunden und der Preis-Block beim Verzögern gelten erst ab diesem Datum, zum Beispiel mit dem dynamischen Tarif. Leer = sofort.', sgDhwCard: 'Aktionskarte eines Geräts (WW-Soll direkt schreiben, ohne Flow)', spDev: 'Gerät mit der Karte (z. B. das Modbus-Gerät der Wärmepumpe)', spCard: 'Aktionskarte (z. B. «Register schreiben»)', spValueArg: 'Argument für den Soll', spScale: 'Faktor (geschriebener Wert = °C × Faktor)', spScaleH: 'Register mit Zehntelgrad: 10 (48 °C wird als 480 geschrieben).', spProgram: 'Soll während des Programms (°C)', spDelay: 'Soll beim Verzögern (°C)', spNormal: 'Normaler Soll, falls nicht lesbar (°C)', spNormalH: 'Zurück auf Normal schreibt den vor dem Programm bzw. der Verzögerung gelesenen Soll. Ist der nicht bekannt, gilt dieser Wert.', spArgsWhy: 'Die übrigen Argumente der Karte (z. B. Registernummer, Adressierung, Typ) werden bei jedem Aufruf unverändert mitgegeben. Geschrieben werden nur Werte von 10 bis 60 °C.', spLoading: 'Die Karten des Geräts werden geladen …', spNoCard: 'Die gewählte Karte gibt es an diesem Gerät nicht.', sgDhwTrig: 'Auslöser mit Wert (ein Flow schreibt den Soll, für jede Wärmepumpe)', spTrigWhy: 'Die App löst bei jeder Änderung den Auslöser «Der Warmwasser-Soll soll gesetzt werden» aus (mit den Werten «Soll (°C)» und «Art»: program, delay oder normal). Du baust einen einzigen Flow: Wenn dieser Auslöser, dann schreibe den Soll an die Wärmepumpe (Modbus, Cloud-App, Relais …). Die drei Temperaturen stellst du hier ein, der normale Soll wird vor dem Programm bzw. der Verzögerung gemerkt.', curNow: 'Aktuell', curOn: 'ein', curOff: 'aus', shareTitle: 'Hausbatterie-Schutz: wie viel Solarstrom bekommt das Auto?', shareWhy: 'Solange das Auto eingesteckt ist, bekommt es je nach Batteriestand einen Teil des Solarstroms. Darunter wartet es ganz (Batterie zuerst), darüber steigt der Anteil linear bis zum vollen Überschuss. Gilt auch für Geräte ohne eigene Grenze («Hausbatterie zuerst bis»).', shareLo: 'Auto lädt ab Batterie (%)', sharePctLo: 'Anteil dort (%)', shareHi: 'Voller Überschuss ab Batterie (%)', sharePctHi: 'Anteil dort (%)', shareBonus: 'Prognose-Bonus (Prozentpunkte früher)', shareBonusH: 'Optional: Bringt die Solarprognose heute deutlich mehr Sonne, als die Batterie bis voll und das Haus bis zum Sonnenuntergang brauchen, wird die Rampe um bis zu so viele Prozentpunkte nach unten verschoben (das Auto lädt früher). Ohne frische Prognose oder gelerntes Hausprofil passiert nichts. 0 = aus.', shareBonusNow: 'Prognose-Bonus aktiv: Rampe aktuell {n} Punkte früher.', shareEx: 'Beispiel 30 / 30 / 70 / 100: ab 30 % Batterie geht ein Drittel des Solarstroms ins Auto, bei 70 % der ganze Überschuss. Standard 50 / 0 / 80 / 100: erst ab 50 % Batterie, dann langsam mehr.',
      advWb: 'Erweitert (Anschluss, Phasenumschaltung, Mindeststrom)', wbPhases: 'Phasen der Wallbox', wbPh1: '1 Phase', wbPh3: '3 Phasen', wbPhaseSwitch: 'Wallbox schaltet selbst zwischen 1 und 3 Phasen um', wbPhaseSwitchH: 'An: Bei wenig Sonne lädt die Wallbox einphasig (ab etwa 1,4 kW), bei viel Sonne dreiphasig. Nur einschalten, wenn die Wallbox das kann. Kann sie es nicht, lädt sie dreiphasig mit mindestens etwa 4,1 kW, und darunter wird nicht mit Sonne geladen.', minAmps: 'Mindeststrom (A)', minAmpsH: 'Kleinster Ladestrom, den Wallbox und Auto annehmen. Meist 6 A, manche Autos brauchen mehr. Höchstens so hoch wie der Maximalstrom.', maxAmps: 'Maximalstrom (A)', stepHold: 'Haltezeit vor Erhöhung (s)', chargeNowAutoOff: '«Sofort laden» beim Abstecken ausschalten',
      iconLbl: 'Symbol', iconNames: { dishwasher: 'Geschirrspüler', plug: 'Steckdose', bike: 'Velo', dehumidifier: 'Luftentfeuchter', boiler: 'Boiler', washer: 'Waschmaschine', tumbler: 'Tumbler', fan: 'Ventilator', heatpump: 'Wärmepumpe', pool: 'Pool', ac: 'Klimaanlage', heater: 'Heizstab', sauna: 'Sauna', freezer: 'Kühlgerät', pump: 'Pumpe', light: 'Licht', mower: 'Rasenroboter', purifier: 'Luftreiniger', aquarium: 'Aquarium' },
      accuTitle: 'Akku (z. B. eBike, Rasenmäher)', accuEnable: 'Ladestand des Akkus beachten', accuSensor: 'Ladestand von', accuCap: 'Wert', accuStop: 'Stoppen bei (%)', accuResume: 'Wieder laden unter (%)', accuLow: 'Immer laden unter (%)', accuMax: 'Spätestens aus nach (min)',
      accuHint: 'Stoppt bei der Grenze und lädt erst wieder, wenn der Akku darunter fällt. Unter der unteren Grenze wird auch ohne Überschuss geladen. Die Höchstdauer schaltet ab, falls der Ladestand nicht mehr ankommt (0 = ohne).',
      humWait: 'Im günstigsten Block starten (statt sofort)', humCritical: 'Kritische Feuchte (%, optional)', humWaitHint: 'Statt sofort bei {on} % wartet der Notlauf auf den günstigsten Block der Notlaufdauer im Rest des Tages. Dazwischen läuft das Gerät wie sonst bei PV-Überschuss. Ohne Preise startet er sofort. Ab der kritischen Feuchte startet er immer sofort.', advConsumer: 'Erweitert (Laufzeiten, Schutz-Ladestand, Prognose-Sperre)', advSg: 'Erweitert (Hysterese, Verzögerungen, Mindestlaufzeit, Abkühlpause, Betriebsart-Prüfung, Rückmeldung)', advDly: 'Erweitert (Freigabe bei wenig Sonne, Marge)', advDhw: 'Erweitert (Betriebsart-Prüfung, Statusfeld, Verzögerungen, Mindest- und Höchstdauer, Abkühlpause)', humTitle: 'Feuchte-Notlauf', humEnable: 'Notlauf bei hoher Luftfeuchtigkeit', humSensor: 'Feuchte-Sensor', humOn: 'Notlauf ein ab (%)', humOff: 'Notlauf aus unter (%)', humRun: 'Höchstdauer (min)',
      humHint: 'Läuft unabhängig von Batterie und Überschuss, bis die Feuchte unter den Aus-Wert fällt oder die Höchstdauer um ist. Danach startet er erst wieder, wenn die Feuchte zwischendurch unter den Ein-Wert gefallen ist.',
      modeTest: 'nicht gesteuert', modeLiveTag: 'gesteuert', costLast: 'Zähler zuletzt', noBatMode: 'Ohne Hausbatterie ist nur «Bei Überschuss» möglich.',
      save: 'EMS-Einstellungen speichern', saved: 'Gespeichert', saveDirty: 'Änderungen speichern ●', saveSec: 'Speichern', unsavedTag: '● ungespeichert', unsaved: 'Noch nicht gespeichert: bitte «Speichern» drücken.', error: 'Fehler', toggleFailed: 'Schalter konnte nicht gesetzt werden',
      modeNames: { disabled: 'Aus', idle: 'Bereit', holding: 'Wartet auf Überschuss', solar_ev: 'Lädt mit Solarstrom', instant_ev: 'Lädt mit voller Leistung', battery_priority: 'Batterie hat Vorrang', error: 'Fehler' },
      otherEms: 'Steuert schon ein anderes Energiemanagement diese Wallbox, dort zuerst ausschalten. Sonst steuern zwei Systeme dieselbe Wallbox.',
      
      time: 'Zeit', price: 'Preis', 
      day: 'Tag', 
      targetSoc: 'Ziel-SoC (%)', reserve: 'Reserve (Stunden)', solarLimit: 'Solar-Schwelle (kWh)',
    },
    en: {
      tab: 'Outlook', subMain: 'Operation',             noDevice: 'Energy management is not set up yet. In Homey go to Devices → "+" → "Swiss Dynamic Electricity Tariff" and add the "Energy management" device.',
      devicesSec: 'Set up energy management', sources: 'DATA SOURCES', consumers: 'CONSUMERS',
      stOff: 'Switched off', stTest: 'Running, but no device is released for control yet', stLive: 'Running and controlling',
      stWarn: 'Running with a warning', switchHint: 'Switch on: the energy management controls this device. Off: it leaves the device alone. While silent mode is on, everything is only simulated.',
      pvLbl: 'PV', gridLbl: 'Grid', batLbl: 'Battery',
      noConsumers: 'No consumer yet.',
      plan: 'PLAN', planToday: 'Today', planTomorrow: 'Tomorrow', planPrice: 'Price in Rp./kWh', planPv: 'Solar forecast', planNow: 'now',
      planBlock: 'Cheapest block (2 h)', planBlockNow: 'Cheapest block from now (2 h)', planPvKwh: 'Solar expected', planPriceRange: 'Price min to max', planNoPrices: 'No prices for this day yet.',
      planBat: 'Battery (plan)', planBatAdvice: 'recommendation, not controlled', planBatLive: 'controlled', planWallbox: 'EV charger (history)', planWallboxCar: 'EV charger and EV (history and plan)', planChError: 'error', planTo: 'to', planTest: 'simulated', planPlanned: 'planned',
      planCheap: 'cheap', planNormal: 'normal', planExp: 'expensive', planBatCharge: 'Grid charging', planBatHold: 'Hold (discharge blocked)', planBatNormal: 'Normal', planOn: 'on',
      planNote: 'The battery shows the planner\'s plan (recalculated every 15 minutes, comparison only). EV charger and consumers follow the current surplus: here you see what they did. In test mode it is the simulation.',
            carCal: 'Weekly template (Mon to Sun)', carCalHint: 'Applies every week. An entry for "Today" or "Tomorrow" above overrides the day. Changes are saved right away.', carCalSaving: 'saving ...', carCalSaved: 'saved', carSetupHint: 'Targets, "Today/Tomorrow" and the weekly template are set under "Outlook".',
      carDays: { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }, carTime: 'Departure', carSoc: 'Target %',
      carHoliday: 'Holiday: no charging targets (solar keeps charging)', carHolidayOn: 'Holiday', carHolidayUntilShort: 'until', carHolidayOpen: 'until switched off', carHolidayUntil: 'until and including (optional, empty = until switched off)', carGrid: 'Charge from the grid if the sun is not enough by departure', carGridHint: 'On: the app charges in the cheapest quarter-hours before departure. Off: solar only.',
      carCard: 'EV', carNext: 'Next target', carNone: 'no target planned', carFromCal: 'template', carFromOverride: 'override',
      carSt: { none: 'No target', no_soc: 'Charge level unknown', no_capacity: 'Battery size missing (Set up → EV)', reached: 'Target reached', solar_only: 'Solar only', planned: 'Planned', short: 'Not quite enough before departure' },
      carNotConnected: 'not plugged in', carBadgeCharging: 'charging', carBadgePlugged: 'plugged in', carBadgeReached: 'target reached', carOverride: 'Different today or tomorrow (overrides the template)', carToday: 'Today', carTomorrow: 'Tomorrow', carCharge: 'charge',
      carApply: 'Apply', carClear: 'Use the template again', carSaved: 'Saved',
      silent: 'Silent mode: simulate only', silentHint: 'On: nothing is switched. Log and outlook show what would happen. Off: devices with their switch on are really controlled.',
      stSilent: 'Silent mode: only simulating', silentTag: 'silent',
      batCtl: 'Control the battery', batCtlOn: 'Control the battery through energy management',                         batCtlWarn: 'Only one system may control the battery. Switch off battery control in the other energy management and your own battery flows before going live.',
      bpMode: 'Peak hours', bpModeAuto: 'automatic (schedule)', bpModeFixed: 'fixed number of hours',
      bpModeAutoHint: 'The schedule puts the charge into the most expensive quarter-hours until the next recharge (cheap from the grid at night or from the sun during the day) and only charges from the grid when it pays off despite losses. How many hours that is follows from charge and consumption.',
      schText: 'Schedule: charges {kwh} kWh at {from} to {to} (avg {cp} Rp.), delivers {dkwh} kWh in the most expensive quarter-hours (avg {dp} Rp.). Benefit approx. {chf} CHF.', schNoCharge: 'Schedule: no grid charging needed, the charge ({dkwh} kWh) goes into the most expensive quarter-hours (avg {dp} Rp.).', schNothing: 'Schedule: nothing to do at the moment.',
      ldMode: { normal: 'discharge', hold: 'hold', charge: 'charge' }, ldBand: { low: 'below 20 Rp.', mid: '20 to 30 Rp.', high: 'from 30 Rp.' },             bpTitle: 'Planning', bpReserve: 'Cover peak hours with the battery (h)', bpReserveHint: 'During this many most expensive hours of the next 24 hours the battery discharges, otherwise it holds its charge.',
      bpSolar: 'No grid charging from solar (kWh)', bpSolarHint: 'If the sun brings at least this much in the next 24 hours, no charging from the grid (0 = always charge).',
      spreadLabel: 'Minimum gain per kWh (Rp.)',
      spreadHint: 'The battery only charges from the grid when each kWh charged and used later saves at least this much. This is where the battery wear goes: battery price ÷ (capacity × cycles), for example CHF 7000 ÷ (13.8 kWh × 6000) = 8.5 Rp. Efficiency is counted on top. Higher = charges less often, only with a large price difference. 0 = wear is not counted.',
      bufLabel: 'Buffer', bufAutoNow: 'Automatic (now {pct} %)', bufFixed: 'fixed value (%)', bufFixedNow: 'fixed value', bufHint: 'The schedule keeps this much charge in reserve in case the house uses more than expected. More buffer = safer, but slightly more grid charging.', bufInfoAuto: 'Now {pct} % ({kwh} kWh): this much more than expected is what the house used {where} on 3 out of 4 days ({days} days measured).', bufInfoWait: 'No measurement yet ({days} of {needed} days): until then {pct} % ({kwh} kWh).', bufInfoFixed: 'Fixed {pct} % ({kwh} kWh).', bufEvening: 'in the evening', bufMorning: 'in the morning',
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
      batModeCharge: 'Charge', batModeHold: 'Hold', batModeNormal: 'Normal',       batRow: 'Battery', batRowNone: 'nothing sent yet', batSent: 'last',
      logTitle: 'LOG', logNone: 'No entries yet.', logAll: 'All', logCar: 'EV', logWallbox: 'EV charger', logBat: 'Battery', logCons: 'Devices', logFuse: 'House connection', logMore: 'Show more', logLess: 'Show less', logToday: 'Today', logYesterday: 'Yesterday',
      secCar: 'EV', secWallbox: 'EV CHARGER', secBat: 'HOME BATTERY',
      carWaiting: 'Data follows with the next run', autoCharge: 'Charge automatically', autoChargeOff: 'Off: the charger works as before (own app or flows)', autoChargeNoCar: 'No car plugged in',
      cnLimit: 'Limit', cnNone: 'until unplugged', cnNoneManual: 'until switched off', cnSoc: 'up to charge level (%)', cnKwh: 'up to energy (kWh)', cnUntil: 'up to', cnNow: 'now', cnLoaded: 'charged', cnHint: 'Charge now charges at full power regardless of the price and switches itself off at the limit.',
      logCmdOnly: 'switching only', logAllSim: 'Silent mode: all entries are simulated.', logOnWord: 'on', logOffWord: 'off', logStartWord: 'started', logTestTag: 'simulated',
            maxConsumers: 'At most 8 controlled consumers. Remove one or keep further ones as cost meters only (without a device to switch).',
      srcCar: 'EV', whyCar: 'Optional, recommended with a charger. With the car\'s state of charge (from your car\'s app) you can plan jobs as "target charge by time". Without it everything keeps working, then you enter the energy in kWh.',
      carCap: 'Car battery size (kWh)', carFallback: 'Without charge level: energy per departure (kWh)', carFallbackH: 'For cars that do not report their charge level to Homey. The app then charges this much energy in the cheapest quarter-hours before every departure from the weekly template. What has already been charged since plugging in is deducted. The target charge level in % does not apply then. 0 = off, then the car only charges with solar power or with "Charge now". If the car reports a charge level, the charge level always applies.', carSocLbl: 'EV', carNow: 'EV now', pvTargetSoc: 'Target charge (%, instead of energy)', pvNeedCarSoc: 'The EV charge level is unknown (Setup → EV)', pvNeedCarCap: 'Car battery size is missing (Setup → EV)',
      pvReachedAlready: 'The car has already reached the target charge', pvSocFrom: 'from', pvSocTo: 'to', pvDayStrip: 'Preview over the day',
      cmdT: { 'battery.charge': 'Battery: charge from the grid', 'battery.hold': 'Battery: hold (do not discharge)', 'battery.normal': 'Battery: normal operation', 'charger.start': 'EV charger: start charging', 'charger.set': 'EV charger: set charging power', 'charger.stop': 'EV charger: stop charging', 'sgready.normal': 'SG Ready: normal operation', 'sgready.boost': 'SG Ready: recommendation (boost)', 'sgready.forced': 'SG Ready: forced charging', 'dhw.program': 'Hot water: program on', 'dhw.normal': 'Hot water: back to normal', 'dhw.delay': 'Hot water: delay' },
      cmdTest: 'Test', cmdTestFail: 'Command failed:', cmdTestWhy: 'With "Test" you give the command once by hand, also in test mode, to check your flow (careful values: the battery gets no charge order above the current level).',
      cmdLabel: 'Flow recipes', cmdRow: 'Commands of the app to your devices', cmdTagsLbl: 'Tags',
      cmdFlowOk: 'Flow found', cmdFlowMissing: 'No flow', cmdFlowOff: 'Flow is switched off', cmdFlowBroken: 'Flow is broken', cmdFlowEmpty: 'Flow without action',
      ctrlMissing: 'Control missing', devMissing: 'Device missing', refTitle: 'Deleted devices or flows', refWhy: 'These devices or flows no longer exist in Homey. The app keeps running without them. Choose a new device or remove the reference.', refRemove: 'Remove reference', refRemoveConsumer: 'Remove consumer', refRecheck: 'Check again', refChecking: 'Checking …', refBadgeDev: 'Device deleted', refBadgeFlow: 'Flow deleted', refBadgeCap: 'Capability missing', refBadgeMix: 'Reference missing', refArea: { grid: 'Grid meter', pv: 'PV inverter', house: 'House load', battery: 'Battery', charger: 'Charger', car: 'EV', forecast: 'PV forecast', consumer: 'Consumer', fuse: 'Main fuse protection', sgready: 'SG Ready', dhw: 'Hot water' }, refField: { sensor: 'Sensor', mode: 'Mode', feedback: 'Feedback', relay: 'Relay', forceRelay: 'Force relay', heating: 'Status field', target: 'Target', output: 'Output', meter: 'Meter', shed: 'Shed device', shedFlow: 'Shed flow', accu: 'Battery sensor', humidity: 'Humidity sensor', flowOn: 'Flow on', flowOff: 'Flow off', flowNormal: 'Flow normal', flowBoost: 'Flow boost', flowForced: 'Flow forced', flowDelay: 'Flow delay' }, refProblem: { device: 'Device deleted', flow: 'Flow deleted', capability: 'Capability missing' }, cmdSending: 'sending …', cmdSent: 'Command sent', cmdChecked: 'Flows checked',
      cmdCheck: 'Check flows again', cmdChecking: 'Checking flows …', cmdCheckFail: 'Flows could not be checked', cmdSummary: 'with a flow', cmdWhyCheck: 'The dot shows whether an enabled flow waits for the command (trigger "The energy management gives a command").',
      cmdIntro: 'The app does not switch other devices itself: Homey does not allow apps to run the cards of other devices. It gives commands instead. Add one flow per command: WHEN "The energy management gives the command ...", THEN the card of your device (any brand). The values are available as tags. Commands only go out live; in test mode they are only logged.',
      cmdWhere: 'New flow, WHEN, app "Energy management", card "The energy management gives a command", choose the command.',
      cmdFires: 'The app gives:', cmdNone: 'No commands (nothing set up yet).', cmdOn: 'switch on', cmdOff: 'switch off', cmdShed: 'Protection',       cmdHint_battery: 'Charge: card of your battery "charge from the grid" with [power] and [target_soc]. Hold: stop charging and set the maximum discharge power to 0. Normal: stop charging, working mode self-consumption, maximum discharge power to [discharge].',
      cmdHint_charger: 'Set charging power: card of your wallbox with [power] (watts). Start charging and stop charging: the matching wallbox cards.',
      cmdHint_consumer: 'Switch the device on or off with its card, or start one of your flows (action "Start flow").',
      cmdHint_sgready: 'Set the mode of your heat pump (SG Ready) with the matching card or switch the relays.',
      cmdHint_dhw: 'Program on: raise the hot-water setpoint. Back to normal: reset the setpoint. Delay: lower the setpoint. The value "hot-water setpoint" is only a tag of the trigger "The hot-water setpoint should be set".',
      cmdHint_shed: 'Switch off the device the house connection protection should switch off.',
      ctrlKind: 'Switch via', ctrlViaDevice: 'Device (on/off)', ctrlViaFlow: 'Command to a flow (on and off)',             assumedW: 'Power of the consumer (W, for the surplus calculation)',
      pvReached: 'reached', pvReachedSoFar: 'reached so far', pvForecastLeg: 'Forecast',
      planTable: 'FROM NOW: WHAT HAPPENS WHEN', planColTime: 'Time', planColWhat: 'What happens', planColPrice: 'Avg Rp.', planNothing: 'There is no price data for the coming hours yet.',
      planTablePrices: 'FROM NOW: PRICES', planColLevel: 'Price level',
      planShortCharge: 'charge', planShortHold: 'hold', planShortSolar: 'solar', planShortFull: 'full', planTableHint: '= planned, otherwise it is already running like this.',
      planChSolar: 'charging (solar)', planChFull: 'charging (full power)', planTag: 'planned',       calcTitle: 'CALCULATION', calcRow: 'Calculation interval', calcAuto: 'Automatic', calcEvery: 'Every', calcSecs: 's', calcOptAuto: 'Automatic (15 s with a car, 30 s with consumers, else 5 min)', calcOpt15: 'Every 15 seconds', calcOpt30: 'Every 30 seconds', calcOpt60: 'Every minute', calcOpt300: 'Every 5 minutes',
      notifyTitle: 'NOTIFICATIONS', notifyRow: 'Timeline', notifyOn: 'Important notifications in the timeline', notifyOnS: 'on', notifyOffS: 'off', notifyH: 'Only writes what you need to know, once per incident: errors (e.g. EV charger or meter not readable, battery command failed, safety stop), switch-off by the house connection protection, heat pump does not follow (SG Ready state or hot-water setpoint) and deleted devices or flows (at most once a day). Everyday events such as battery changes or starts do not go to the timeline, the flow triggers are there for that.', calcLabel: 'EV charger and consumers calculate', calcTick: 'Battery plan every (minutes)', calcDevices: 'devices read', calcCalls: 'requests per hour',
      calcAutoImpact: 'Depending on the situation: idle 5 min, with consumers 30 s, with a car at the charger 15 s.',
      calcImpact: 'Shorter: reacts faster to clouds and load changes but puts more load on Homey (very many requests can hit Homey\'s limit). Longer: calmer and gentler, but the system reacts more slowly and some surplus goes to the grid. Hold and grace times (in seconds) only act in the rhythm of the run.',
      calcTickHint: 'The battery plan (comparison only) calculates at this rhythm, 1 to 15 minutes. Prices only change every 15 minutes.',
      pvTitle: 'PREVIEW: PLAN A JOB', pvIntro: 'Enter what should happen by when. The preview shows in which quarter-hours it would run. Nothing is saved and nothing is switched.',
      pvDevice: 'Device', pvUntil: 'Done by', pvKwh: 'Energy (kWh)', pvHours: 'Run time (h)', pvPower: 'Power (kW, optional, empty = automatic)', pvMaxPrice: 'Maximum price (Rp./kWh, optional, empty = any)',
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
      fuseOutTabTitle: 'HOUSE CONNECTION: OUTLOOK 24 HOURS', fuseOutWhy: 'Expected grid draw if everything planned runs at the same time: learned house consumption plus battery schedule, EV and planned jobs, minus solar. Consumers that follow the surplus run on the sun and are not included. Assumption: spread evenly over the three phases; a single-phase device on the wrong phase can reach the limit earlier.', fuseOutPeak: 'Peak {kw} kW at {time}: {pct} % of the limit ({limit} kW)', fuseOutOk: 'ok', fuseOutTight: 'tight', fuseOutOver: 'over the limit', fuseOutHouse: 'House', fuseOutNone: 'No consumption profile yet: the outlook appears once the app has learned the house consumption.',
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
      dhwHeating: 'Heat pump is preparing hot water (status field, optional)', dhwHeatingH: 'Device and property that report that the heat pump is currently preparing hot water on its own (for example "DHW heating"). While that is the case, the program does not start (not even by hand), and the delay is not started because lowering the setpoint would abort the running cycle. Empty = no check.', dhwHeatingOk: 'Value for "preparing" (for example true)',
      dhwModeProgram: 'Operating mode during the program (optional, e.g. DHW)', dhwModeProgramH: 'Only needed if the program itself switches the operating mode of the heat pump (for example an operating-mode flow to "DHW"). Then enter the value the device reports in that mode, so that the check "Control only at this value" does not treat our own switching as an outside change and abort the run. If the operating mode stays the same during the program (DHW setpoint via card, trigger or flows), leave the field empty. In DHW mode heating is off, afterwards it must return to automatic.',
      dhwMaxRun: 'Maximum duration (min)', dhwMaxRunH: 'Safety limit: afterwards it is set back to normal (DHW mode switches the heating off). 0 = unlimited.',
      dhwTitle: 'HOT-WATER PROGRAM ON A CHEAP PRICE', dhwRow: 'Hot-water program', dhwOff: 'off', dhwRunning: 'running', dhwWaiting: 'waiting',
      dhwOnLbl: 'Start the hot-water program on a cheap price', dhwWhy: 'Independent of SG Ready: if it is within the cheapest hours of the day and the hot water is below the minimum, the heat pump hot-water program starts (flow or app function) and is set back to normal afterwards. While SG Ready runs the program does not start (and vice versa).',
      dhwCheapHours: 'Cheapest hours per day (h)', dhwCheapH: 'The program starts during the cheapest N hours of the day (by today quarter-hour prices). The preview shows when that would be today and tomorrow.',
      dhwPreview: 'Preview', dhwToday: 'Today', dhwTomorrow: 'Tomorrow', dhwAvg: 'avg', dhwNoPrices: 'Preview: no prices for today yet.',
      dhwBelow: 'Only start below hot water (°C)', dhwBelowH: 'Only if the hot water is below this value (0 = always). Without a temperature reading it does not start.',
      dhwSkipPv: 'Do not start if the sun is enough', dhwSkipPvKwh: 'Sun is enough from forecast (kWh, rest of today)', dhwSkipUntil: 'Sun forecast counts until', dhwSkipPvH: 'Starting on price is pointless if the sun will still deliver enough today (remaining forecast).', dhwSkipUntilH: 'Until this time the sun forecast counts, afterwards the price may start.',
      dhwTarget: 'End at hot water (°C)', dhwTargetH: 'When the hot water reaches this temperature it is set back to normal. The real target is set in the heat pump itself.', dhwMinRunH: 'Once started the program runs at least this long. Only target temperature, operating mode or sun (SG Ready) end it earlier.',
      dhwLive: 'Hot-water program live (otherwise simulate only)', dhwLiveHint: 'Live, it really starts the program. Silent mode takes precedence. Switch off an existing flow for it first so that only one system switches.',
      hpBoss: 'Important: The heat pump stays in charge, independent of these settings. The app only gives signals and setpoints (SG Ready recommendation, hot-water setpoint). Whether and how the heat pump heats is decided solely by its own control with hysteresis, protection functions and utility lock. This program is for advanced users: if you want it simpler, use only SG Ready with sun, or build the logic yourself with advanced flows (the app provides the triggers "Command" and "Hot-water setpoint should be set").',
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
            sgDhwOut: 'Set the hot-water program via', sgDhwFlows: 'Flows (on / back to normal, e.g. DHW setpoint via Modbus)', sgDhwCap: 'App function (capability of a device)', sgDhwOn: 'Flow hot-water program on', sgDhwOff: 'Flow back to normal', sgDhwDev: 'Device and capability of the app function', sgDhwOnV: 'Value for on', sgDhwOffV: 'Value for back to normal', sgDhwH: 'Values as text, true/false for switches. At the end it is set back to normal, but only if the control started the program itself.',
            sgPvBelow: 'Sun start only below hot water (°C)', sgPvBelowH: 'Optional: also with sun, only start if the hot water is below this value (0 = always, default).',
            sgForced: 'Allow forced charging (1:1)', sgForcedW: 'Forced charging threshold (W)', sgForcedH: 'State 1:1, often with a heating rod and high consumption. Only from the boost and only from this solar power. Off by default.',
      sgSensor: 'Hot-water temperature (device and value)', sgSensorH: 'The heat pump hot-water actual value, so the boost ends at the target temperature.',
      sgMode: 'Heat pump operating mode (device and value, optional)', sgModeOk: 'Control only at this value (e.g. Automatic)', sgModeH: 'Control only acts when the operating mode has this value. Not in holiday, comfort or standby. Leave empty = no check.',
      sgFeedback: 'Take the state from the heat pump (device and value, optional)', sgFeedbackH: 'Reads the SG Ready state of the heat pump (e.g. 2 NORMAL), shows it in the widget and warns if it does not match after switching. Empty = own state only.',
      sgOutput: 'How are the states set?', sgOutRelays: 'Two relays (switch actuators)', sgOutFlows: 'Flows (one flow per state, e.g. Modbus)',
      sgOutH: 'Relays: normal (0:0) = both off. Recommendation (0:1) = the recommendation relay is on and closes the second SG contact. Forced (1:1) = the forced relay is also on and closes the first contact. The notation means contact 1 : contact 2, 1 = closed. Your heat pump manual tells you what the terminals are called (e.g. SG1/SG2 or EVU/SG). The app never sets state 1:0 (blocking by the grid operator), not even briefly while switching. Flows: one flow per state, e.g. writing Modbus registers.',
      sgSetupH: 'Wiring and heat pump: use potential-free contacts only and never put mains voltage on the SG inputs. Have a qualified electrician do the wiring. Set the relays to be off after a power failure, so the heat pump keeps running in normal mode. SG Ready must be switched on in the heat pump menu. That is often also where you set how many degrees higher it heats in 0:1 and 1:1. Some heat pumps only react after a few minutes, which is why there is a minimum run time. With "Take the state from the heat pump" you can see whether it has picked up the signal.',
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
        pgFrom: 'Optional. The cheap block is only searched from this time on, even if the automatic is switched on earlier (for example loaded at noon but run in the evening). Empty: right away when the automatic is switched on. With PV surplus it always starts immediately.',
        pgWait: 'This is how long the automatic waits at most for surplus or the cheapest block, then it starts in any case. When switching on in the widget you can choose another wait, for example 8 hours if you switch on in the evening and want it to start at 04:00.',
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
      name: 'Name', type: 'Type',       ctrlDevice: 'Device to switch', meterDevice: 'Meter for costs (kWh)', mode: 'Switch on',
      modeFull: 'When battery is full', modeSoc: 'From battery SoC', modeSurplus: 'On surplus', modeProgram: 'Start a program', noCtrl: 'cost meter only',
      programTitle: 'Start a program', programWindow: 'Price start earliest from (optional)', programMaxWait: 'Default wait (h)', programDuration: 'Program duration (h)',
      programHint: 'You switch the automatic on in the widget with the \"Auto\" switch once the machine is loaded. It starts right away with enough PV surplus. Otherwise it picks the cheapest block of the program duration until the wait is over and starts at the latest then (safety net). Afterwards the automatic switches itself off; switch it on again for the next run. Any number of runs per day, also across midnight.',
      programStartCap: 'Start capability', programStartVal: 'Start value', programRemoteCap: 'Remote-control capability (optional)', programRemoteVal: 'Remote value (when enabled)',
      programRemoteWarn: 'Without a remote-control capability, the app never checks whether the device can even be switched - required for some appliances (e.g. Electrolux).',
      programDoorCap: 'Door capability (optional)', programDoorVal: 'Door value "closed" (when chosen)',
      programStateCap: 'State capability (optional)', programStateVal: 'State value "ready/idle" (when chosen)',
      programStateHint: 'Stops a second start command while the appliance is still running (whether started by hand or by us) - which capability and which value means "ready" differs by device. Leave empty if the appliance has nothing like this.',
      fullSoc: 'Full from SoC (%)', socOn: 'On from SoC (%)', hysteresis: 'Off below (points under that)',
      batFirst: 'Home battery first up to (%, optional)', batFirstPh: 'like charger', batFirstHint: 'Empty: like the EV charger (home battery first up to the shared limit). A number: own limit; above it the device also takes the power currently flowing into the home battery. For small devices (e-bike) e.g. 0.',
      minSurplus: 'Minimum surplus (W)', startSustain: 'Surplus must last (s)', stopGrace: 'Grace before switching off (s)',
      advanced: 'Advanced', minRun: 'Minimum run time (min)', minOff: 'Minimum pause (min)', protect: 'Protect SoC: off immediately below (%)', useGate: 'Respect forecast gate',
      shareAt: 'Battery from (%)', shareGets: 'Solar share (%)', shareLowRow: 'Lower limit: from here the car gets solar power', shareHighRow: 'Upper limit: from here it gets the full surplus', shareChartCap: 'How much of the solar power the car gets per battery level', shareNow: 'Now: battery {soc} % → the car gets {pct} % of the solar power.', shareBonusTitle: 'Forecast bonus', shareVal: 'Solar share car {pct} %', wbLinkTitle: 'Wallbox connection (how it is addressed)', wbLinkWhy: 'The default fits wallboxes with the cards "start charging" and "set charging power". For another wallbox choose what the device reports and which flow cards it has for control. The power is calculated from amps, phases and 230 V and passed in watts to the "set charging power" card (stop = 0 W).', wbState: 'Charging state (capability)', wbPower: 'Charging power (capability)', wbPhase: 'Phases (capability, optional)', wbPhaseH: 'Only for phase switching. Expected values: 1 = one phase, 2 = three phases.', wbNone: '– none –', wbStd: 'Default', wbCustom: 'Custom mapping', paLabel: 'LEARNING REPORT', paRow: 'Plan accuracy', paSumWait: 'Measuring for {n} days, a verdict from {m} days', paSumBetter: '{k} of {t} forecasts can be improved', paSumNone: 'The current methods are good enough', paWhy: 'Only measures, changes nothing: how well the planner\'s forecasts match what actually happened. Error = deviation in percent of the measured value, smaller is better.', paDays: 'Days', paNow: 'current method', paAlt: 'Alternative', paBest: 'Better', paLoadM: 'Consumption morning 05-10', paLoadD: 'Consumption day 10-17', paLoadE: 'Consumption evening 17-22', paPvRest: 'Solar: rest of the day from 10:30', paWait: '{n} of {m} days so far', paMean: 'average', paRobust: 'robust', paPlain: 'unchanged', paNowcast: 'with morning correction', paSame: 'equally good', paNote: 'Consumption: "average" is the current method (mean of the last 7 days), "robust" is the median of the same day type (weekday/weekend), not thrown off by single big loads. Solar: "unchanged" is the remaining-day forecast, "with morning correction" is scaled by measured/forecast from 06:00 to 10:30. A method only counts as better if its error is at least 10 % smaller.', pvAccTitle: 'Recommendation from the last days', pvAccNone: 'Not enough data yet: {n} of at least {m} complete days. Every morning the app records the forecast for the day and compares it in the evening with the measured production.', pvAccRec: 'Recommendation: {f} (median of {n} days, mostly between {lo} and {hi}).', pvAccRecent: 'Only the last {n} days: {f}.', pvApply: 'Apply', pvAuto: 'Correction factor automatic', pvAutoH: 'From 7 complete days on the app enters the recommended value into the field by itself once a day. The field then shows the current value.', pvAccLog: 'History of the last days', pvAccDay: 'Day', pvAccFc: 'Forecast without factor (kWh)', pvAccAct: 'Measured (kWh)', pvAccRatio: 'Ratio', pvAccToday: 'today', pvAccNote: 'Only complete days with at least 2 kWh forecast count. The ratio is measured divided by the forecast without factor.', dlyTitle: 'Delay hot water (PV first)', dlyWhy: 'Optional. If the hot water falls below the start threshold of the heat pump within the time window, its start is postponed (the DHW setpoint is lowered by a flow) so that the hot water is made with solar power or in the cheap block instead of with grid power in the morning. Afterwards the setpoint is released again. Needs the output via action card or the flows "delay" and "back to normal" (above).', dlyOn: 'Delay hot water', dlyFlow: 'Flow "lower setpoint (delay)"', dlyFrom: 'Time window from', dlyTo: 'to', dlyForecast: 'Enough sun from forecast (kWh)', dlyForecastH: 'Remaining forecast for today. From this value the heat pump waits for the sun (SG Ready) until the release time. In November the forecast is often too high, so set it rather lower.', dlyComfort: 'Comfort limit (°C)', dlyComfortH: 'If the hot water falls below this value it is released immediately (nobody should have a cold shower). Below this limit nothing is delayed either.', dlyRelWd: 'Release Mon to Fri', dlyRelWe: 'Release weekend', dlyRelLow: 'Release with little sun', dlyRelLowH: 'Time of release when the forecast is too low (and without price optimization).', dlyMargin: 'Start threshold: margin above setpoint minus hysteresis (K)', dlyMarginH: 'Delaying starts as soon as the hot water falls below setpoint minus hysteresis plus this margin, i.e. shortly before the heat pump starts by itself.', dlyNow: 'Currently delayed until {time}: {why}', dlyNeed: 'Delaying needs the action card (above) or the flows "delay" and "back to normal".', dhwPriceFrom: 'Price optimization from (date, optional)', dhwPriceFromH: 'Cheapest hours and the price block when delaying only apply from this date, for example with the dynamic tariff. Empty = immediately.', sgDhwCard: 'Action card of a device (write the DHW setpoint directly, no flow)', spDev: 'Device with the card (e.g. the Modbus device of the heat pump)', spCard: 'Action card (e.g. "write register")', spValueArg: 'Argument for the setpoint', spScale: 'Factor (written value = °C × factor)', spScaleH: 'Register in tenths of a degree: 10 (48 °C is written as 480).', spProgram: 'Setpoint during the program (°C)', spDelay: 'Setpoint when delaying (°C)', spNormal: 'Normal setpoint if not readable (°C)', spNormalH: 'Back to normal writes the setpoint read before the program or the delay. If that is unknown, this value is used.', spArgsWhy: 'The other arguments of the card (e.g. register number, addressing, type) are passed unchanged on every call. Only values from 10 to 60 °C are written.', spLoading: 'Loading the cards of the device …', spNoCard: 'The chosen card does not exist on this device.', sgDhwTrig: 'Trigger with value (one flow writes the setpoint, for any heat pump)', spTrigWhy: 'On every change the app fires the trigger "The hot-water setpoint should be set" (with the values "Setpoint (°C)" and "Kind": program, delay or normal). You build a single flow: when this trigger, write the setpoint to the heat pump (Modbus, cloud app, relay …). You set the three temperatures here; the normal setpoint is remembered before the program or the delay.', curNow: 'Now', curOn: 'on', curOff: 'off', shareTitle: 'Home battery protection: how much solar power does the car get?', shareWhy: 'While the car is plugged in it gets a share of the solar power depending on the battery level. Below the first level it waits completely (battery first), above it the share rises linearly up to the full surplus. Also applies to devices without their own limit ("home battery first up to").', shareLo: 'Car charges from battery (%)', sharePctLo: 'Share there (%)', shareHi: 'Full surplus from battery (%)', sharePctHi: 'Share there (%)', shareBonus: 'Forecast bonus (percentage points earlier)', shareBonusH: 'Optional: if the solar forecast shows clearly more sun today than the battery needs to fill up and the house until sunset, the ramp moves down by up to this many points (the car charges earlier). Without a fresh forecast or a learned house profile nothing happens. 0 = off.', shareBonusNow: 'Forecast bonus active: ramp currently {n} points earlier.', shareEx: 'Example 30 / 30 / 70 / 100: from 30 % battery a third of the solar power goes to the car, at 70 % all of the surplus. Default 50 / 0 / 80 / 100: only from 50 % battery, then gradually more.',
      advWb: 'Advanced (connection, phase switching, minimum current)', wbPhases: 'Wallbox phases', wbPh1: '1 phase', wbPh3: '3 phases', wbPhaseSwitch: 'Wallbox switches between 1 and 3 phases by itself', wbPhaseSwitchH: 'On: with little sun the wallbox charges on one phase (from about 1.4 kW), with plenty of sun on three phases. Only switch this on if the wallbox can do it. If it cannot, it charges on three phases with at least about 4.1 kW, and below that it does not charge from solar.', minAmps: 'Minimum current (A)', minAmpsH: 'Smallest charging current the wallbox and the car accept. Usually 6 A, some cars need more. At most as high as the maximum current.', maxAmps: 'Maximum current (A)', stepHold: 'Hold time before increase (s)', chargeNowAutoOff: 'Switch off "Charge now" when unplugged',
      iconLbl: 'Icon', iconNames: { dishwasher: 'Dishwasher', plug: 'Socket', bike: 'Bike', dehumidifier: 'Dehumidifier', boiler: 'Water heater', washer: 'Washing machine', tumbler: 'Tumble dryer', fan: 'Fan', heatpump: 'Heat pump', pool: 'Pool', ac: 'Air conditioning', heater: 'Heating element', sauna: 'Sauna', freezer: 'Fridge / freezer', pump: 'Pump', light: 'Light', mower: 'Robot mower', purifier: 'Air purifier', aquarium: 'Aquarium' },
      accuTitle: 'Battery pack (e.g. e-bike, lawn mower)', accuEnable: 'Respect the battery charge level', accuSensor: 'Charge level from', accuCap: 'Value', accuStop: 'Stop at (%)', accuResume: 'Charge again below (%)', accuLow: 'Always charge below (%)', accuMax: 'Switch off at the latest after (min)',
      accuHint: 'Stops at the limit and only charges again once the battery drops below it. Below the lower limit it charges even without surplus. The maximum duration switches off if the charge level stops arriving (0 = none).',
      humWait: 'Start in the cheapest block (instead of right away)', humCritical: 'Critical humidity (%, optional)', humWaitHint: 'Instead of right away at {on} % the emergency run waits for the cheapest block of its run time in the rest of the day. In between the device runs on PV surplus as usual. Without prices it starts right away. From the critical humidity on it always starts right away.', advConsumer: 'Advanced (run times, protect level, forecast gate)', advSg: 'Advanced (hysteresis, delays, minimum run time, cool-down, operating-mode check, feedback)', advDly: 'Advanced (release with little sun, margin)', advDhw: 'Advanced (operating-mode check, status field, delays, minimum and maximum duration, cool-down)', humTitle: 'Humidity emergency run', humEnable: 'Emergency run at high humidity', humSensor: 'Humidity sensor', humOn: 'Emergency run on from (%)', humOff: 'Emergency run off below (%)', humRun: 'Maximum duration (min)',
      humHint: 'Runs regardless of battery and surplus until humidity drops below the off value or the maximum duration is over. It only starts again after humidity has dropped below the on value in between.',
      modeTest: 'not controlled', modeLiveTag: 'controlled', costLast: 'Meter last', noBatMode: 'Without a home battery only "On surplus" is possible.',
      save: 'Save energy management settings', saved: 'Saved', saveDirty: 'Save changes ●', saveSec: 'Save', unsavedTag: '● unsaved', unsaved: 'Not saved yet: please press "Save".', error: 'Error', toggleFailed: 'Could not set the switch',
      modeNames: { disabled: 'Off', idle: 'Idle', holding: 'Waiting for surplus', solar_ev: 'Charging from solar', instant_ev: 'Charging at full power', battery_priority: 'Battery first', error: 'Error' },
      otherEms: 'If another energy management already controls this charger, switch it off there first. Otherwise two systems control the same charger.',
      
      time: 'Time', price: 'Price', 
      day: 'Day', 
      targetSoc: 'Target SoC (%)', reserve: 'Reserve (hours)', solarLimit: 'Solar threshold (kWh)',
    },
    fr: {
      tab: 'Aperçu',
      subMain: 'Fonctionnement',
      noDevice: 'La gestion de l’énergie n’est pas encore configurée. Dans Homey, allez à Appareils → « + » → « Tarif électrique dynamique CH » et ajoutez l’appareil « Gestion de l’énergie ».',
      devicesSec: 'Configurer la gestion de l’énergie',
      sources: 'SOURCES DE DONNÉES',
      consumers: 'CONSOMMATEURS',
      stOff: 'Désactivée',
      stTest: 'En marche, mais aucun appareil n’est encore autorisé à être piloté',
      stLive: 'En marche et pilote',
      stWarn: 'En marche avec un avertissement',
      switchHint: 'Activé : la gestion de l’énergie pilote cet appareil. Désactivé : elle le laisse tranquille. Tant que le mode silencieux est activé, tout est seulement simulé.',
      pvLbl: 'PV',
      gridLbl: 'Réseau',
      batLbl: 'Batterie',
      noConsumers: 'Aucun consommateur pour l’instant.',
      plan: 'PLAN',
      planToday: 'Aujourd’hui',
      planTomorrow: 'Demain',
      planPrice: 'Prix en Rp./kWh',
      planPv: 'Prévision solaire',
      planNow: 'maintenant',
      planBlock: 'Bloc le moins cher (2 h)',
      planBlockNow: 'Bloc le moins cher à partir de maintenant (2 h)',
      planPvKwh: 'Solaire attendu',
      planPriceRange: 'Prix min. à max.',
      planNoPrices: 'Pas encore de prix pour ce jour.',
      planBat: 'Batterie (plan)',
      planBatAdvice: 'recommandation, non pilotée',
      planBatLive: 'pilotée',
      planWallbox: 'Wallbox (historique)',
      planWallboxCar: 'Wallbox et voiture (historique et plan)',
      planChError: 'erreur',
      planTo: 'à',
      planTest: 'simulé',
      planPlanned: 'prévu',
      planCheap: 'bon marché',
      planNormal: 'normal',
      planExp: 'cher',
      planBatCharge: 'Charge depuis le réseau',
      planBatHold: 'Maintien (décharge bloquée)',
      planBatNormal: 'Normal',
      planOn: 'activé',
      planNote: 'La batterie montre le plan du planificateur (recalculé toutes les 15 minutes, à titre de comparaison). La wallbox et les consommateurs suivent le surplus actuel : vous voyez ici ce qu’ils ont fait. En mode test, c’est la simulation.',
      carCal: 'Modèle hebdomadaire (lun. à dim.)',
      carCalHint: 'S’applique chaque semaine. Une entrée pour « Aujourd’hui » ou « Demain » ci-dessus remplace le jour. Les modifications sont enregistrées immédiatement.',
      carCalSaving: 'enregistrement …',
      carCalSaved: 'enregistré',
      carSetupHint: 'Les objectifs, « Aujourd’hui/Demain » et le modèle hebdomadaire se règlent sous « Aperçu ».',
      carDays: {
        mon: 'lun.',
        tue: 'mar.',
        wed: 'mer.',
        thu: 'jeu.',
        fri: 'ven.',
        sat: 'sam.',
        sun: 'dim.',
      },
      carTime: 'Départ',
      carSoc: 'Objectif %',
      carHoliday: 'Vacances : pas d’objectifs de charge (le solaire continue de charger)',
      carHolidayOn: 'Vacances',
      carHolidayUntilShort: 'jusqu’au',
      carHolidayOpen: 'jusqu’à désactivation',
      carHolidayUntil: 'jusqu’au (inclus, facultatif, vide = jusqu’à désactivation)',
      carGrid: 'Charger depuis le réseau si le soleil ne suffit pas d’ici le départ',
      carGridHint: 'Activé : l’app charge pendant les quarts d’heure les moins chers avant le départ. Désactivé : solaire uniquement.',
      carCard: 'Voiture',
      carNext: 'Prochain objectif',
      carNone: 'aucun objectif prévu',
      carFromCal: 'modèle',
      carFromOverride: 'exception',
      carSt: {
        none: 'Aucun objectif',
        no_soc: 'Niveau de charge inconnu',
        no_capacity: 'Capacité de la batterie manquante (Setup → Voiture)',
        reached: 'Objectif atteint',
        solar_only: 'Solaire uniquement',
        planned: 'Prévu',
        short: 'Pas tout à fait assez avant le départ',
      },
      carNotConnected: 'non branchée',
      carBadgeCharging: 'en charge',
      carBadgePlugged: 'branchée',
      carBadgeReached: 'objectif atteint',
      carOverride: 'Différent aujourd’hui ou demain (remplace le modèle)',
      carToday: 'Aujourd’hui',
      carTomorrow: 'Demain',
      carCharge: 'charge',
      carApply: 'Appliquer',
      carClear: 'Réutiliser le modèle',
      carSaved: 'Enregistré',
      silent: 'Mode silencieux : simuler uniquement',
      silentHint: 'Activé : rien n’est commuté. Le journal et les prévisions montrent ce qui se passerait. Désactivé : les appareils dont l’interrupteur est activé sont réellement pilotés.',
      stSilent: 'Mode silencieux : simulation uniquement',
      silentTag: 'silencieux',
      batCtl: 'Piloter la batterie',
      batCtlOn: 'Piloter la batterie via la gestion de l’énergie',
      batCtlWarn: 'Un seul système peut piloter la batterie. Désactivez le pilotage de la batterie dans l’autre gestion de l’énergie et dans vos propres Flows de batterie avant de passer en mode réel.',
      bpMode: 'Heures de pointe',
      bpModeAuto: 'automatique (planning)',
      bpModeFixed: 'nombre d’heures fixe',
      bpModeAutoHint: 'Le planning place la charge dans les quarts d’heure les plus chers jusqu’à la prochaine recharge (bon marché depuis le réseau la nuit ou depuis le soleil le jour) et ne charge depuis le réseau que si cela vaut la peine malgré les pertes. Le nombre d’heures découle de la charge et de la consommation.',
      schText: 'Planning : charge {kwh} kWh de {from} à {to} (moy. {cp} Rp.), restitue {dkwh} kWh pendant les quarts d’heure les plus chers (moy. {dp} Rp.). Gain env. {chf} CHF.',
      schNoCharge: 'Planning : aucune charge depuis le réseau nécessaire, la charge ({dkwh} kWh) va dans les quarts d’heure les plus chers (moy. {dp} Rp.).',
      schNothing: 'Planning : rien à faire pour le moment.',
      ldMode: {
        normal: 'décharge',
        hold: 'maintien',
        charge: 'charge',
      },
      ldBand: {
        low: 'moins de 20 Rp.',
        mid: '20 à 30 Rp.',
        high: 'dès 30 Rp.',
      },
      bpTitle: 'Planification',
      bpReserve: 'Couvrir les heures de pointe avec la batterie (h)',
      bpReserveHint: 'Pendant ce nombre d’heures les plus chères des 24 prochaines heures, la batterie se décharge ; sinon elle garde sa charge.',
      bpSolar: 'Pas de charge depuis le réseau avec le solaire (kWh)',
      bpSolarHint: 'Si le soleil apporte au moins cette quantité dans les 24 prochaines heures, pas de charge depuis le réseau (0 = toujours charger).',
      spreadLabel: 'Gain minimal par kWh (Rp.)',
      spreadHint: 'La batterie ne charge depuis le réseau que si chaque kWh chargé puis utilisé plus tard fait économiser au moins ce montant. L’usure de la batterie y est comprise : prix de la batterie ÷ (capacité × cycles), par exemple 7000 CHF ÷ (13,8 kWh × 6000) = 8,5 Rp. Le rendement est compté en plus. Plus élevé = charge moins souvent, seulement en cas de grand écart de prix. 0 = l’usure n’est pas comptée.',
      bufLabel: 'Marge',
      bufAutoNow: 'Automatique (actuellement {pct} %)',
      bufFixed: 'valeur fixe (%)',
      bufFixedNow: 'valeur fixe',
      bufHint: 'Le planning garde cette quantité de charge en réserve au cas où la maison consommerait plus que prévu. Plus de marge = plus sûr, mais un peu plus de charge depuis le réseau.',
      bufInfoAuto: 'Actuellement {pct} % ({kwh} kWh) : c’est de combien la maison a consommé de plus que prévu {where} sur 3 jours sur 4 ({days} jours mesurés).',
      bufInfoWait: 'Pas encore de mesure ({days} jours sur {needed}) : d’ici là {pct} % ({kwh} kWh).',
      bufInfoFixed: 'Fixe {pct} % ({kwh} kWh).',
      bufEvening: 'le soir',
      bufMorning: 'le matin',
      bpBridge: 'Passer la matinée',
      bpBridgeHint: 'Même avec beaucoup de soleil, charger autant que nécessaire pour les heures chères jusqu’à ce que la production solaire prenne le relais.',
      bpLoad: 'Consommation jusqu’à la reprise par le solaire',
      bpLoadSchedule: 'Consommation de la maison',
      bpDay1: '1 jour',
      bpDays: '{n} jours',
      bpEvening: 'soir {kw} kW',
      bpLoadAuto: 'automatique (appris)',
      bpLoadFixed: 'valeur fixe (kW)',
      bpFloor: 'Ne pas décharger en dessous de (%)',
      backupTitle: 'Réserve de secours',
      backupSoc: 'Réserve (%)',
      backupHint: 'Maintient au moins ce niveau de charge, en chargeant depuis le réseau si nécessaire, quel que soit le prix. À activer ou désactiver avec l’interrupteur sous « Aujourd’hui » ou avec un Flow, jamais automatiquement.',
      backupActive: 'Actif : maintient au moins {soc} %, charge depuis le réseau si nécessaire',
      backupRow: 'Réserve de secours',
      backupRowOn: 'Actif – maintient au moins {soc} %',
      backupRowOff: 'Désactivée',
      bpLearned: 'Appris : {kw} kW le matin (moyenne de 05 à 10 h, {days}). La gestion de l’énergie mesure en continu la consommation de la maison et conserve la moyenne de chaque quart d’heure des 7 derniers jours. Un matin froid avec la pompe à chaleur compte plus qu’un matin doux.',
      bpLearning: 'Apprentissage en cours : pas encore de mesures. D’ici là, {kw} kW sont utilisés.',
      brTitle: 'Passer la matinée',
      brCharge: 'charge {kwh} kWh jusqu’à {soc} % à {at}. Raison : cher de {from} à {to}, le solaire prend le relais dès {sun}. Besoin {need} kWh ({load} kW {how}), disponible {have} kWh.',
      brEnough: 'pas nécessaire, la charge suffit (besoin {need} kWh pour {from} à {to}, disponible {have} kWh).',
      brUnprofitable: 'pas rentable : charger coûterait plus cher, pertes comprises, que les heures chères ({from} à {to}).',
      brNoGap: 'pas nécessaire, il n’y a pas d’heures chères avant le soleil (dès {sun}).',
      brNoSun: 'pas de soleil en vue.',
      brOff: 'pas nécessaire pour le moment : la limite solaire ne s’applique pas, charge normale depuis le réseau.',
      brHowLearned: 'appris',
      brHowFixed: 'fixe',
      batCtlPower: 'Puissance de charge depuis le réseau (kW)',
      batCtlTarget: 'Niveau de charge cible depuis le réseau (%)',
      batCtlNormal: 'Puissance de décharge normale (W)',
      batCtlRepeat: 'Répéter la commande toutes les (min)',
      batModeCharge: 'Charge',
      batModeHold: 'Maintien',
      batModeNormal: 'Normal',
      batRow: 'Batterie',
      batRowNone: 'rien envoyé pour l’instant',
      batSent: 'dernier',
      logTitle: 'JOURNAL',
      logNone: 'Aucune entrée pour l’instant.',
      logAll: 'Tout',
      logCar: 'Voiture',
      logWallbox: 'Wallbox',
      logBat: 'Batterie',
      logCons: 'Appareils',
      logFuse: 'Raccordement',
      logMore: 'Afficher plus',
      logLess: 'Afficher moins',
      logToday: 'Aujourd’hui',
      logYesterday: 'Hier',
      secCar: 'VOITURE',
      secWallbox: 'WALLBOX',
      secBat: 'BATTERIE DOMESTIQUE',
      carWaiting: 'Les données suivent au prochain cycle',
      autoCharge: 'Charger automatiquement',
      autoChargeOff: 'Désactivé : la wallbox fonctionne comme avant (propre app ou Flows)',
      autoChargeNoCar: 'Aucune voiture branchée',
      cnLimit: 'Limite',
      cnNone: 'jusqu’au débranchement',
      cnNoneManual: 'jusqu’à désactivation',
      cnSoc: 'jusqu’au niveau de charge (%)',
      cnKwh: 'jusqu’à l’énergie (kWh)',
      cnUntil: 'jusqu’à',
      cnNow: 'maintenant',
      cnLoaded: 'chargé',
      cnHint: 'La charge immédiate charge à pleine puissance quel que soit le prix et s’arrête d’elle-même à la limite.',
      logCmdOnly: 'commutations uniquement',
      logAllSim: 'Mode silencieux : toutes les entrées sont simulées.',
      logOnWord: 'marche',
      logOffWord: 'arrêt',
      logStartWord: 'démarré',
      logTestTag: 'simulé',
      maxConsumers: 'Au maximum 8 consommateurs pilotés. Supprimez-en un ou gardez les autres comme simples compteurs de coûts (sans appareil à commuter).',
      srcCar: 'Voiture',
      whyCar: 'Facultatif, recommandé avec une wallbox. Avec le niveau de charge de la voiture (depuis l’app de votre voiture), vous pouvez planifier des tâches du type « niveau de charge cible à une heure donnée ». Sans lui, tout continue de fonctionner, vous indiquez alors l’énergie en kWh.',
      carCap: 'Capacité de la batterie de la voiture (kWh)', carFallback: 'Sans niveau de charge : énergie par départ (kWh)', carFallbackH: 'Pour les voitures qui ne transmettent pas leur niveau de charge à Homey. L’app charge alors cette quantité d’énergie dans les quarts d’heure les moins chers avant chaque départ du modèle hebdomadaire. Ce qui a déjà été chargé depuis le branchement est déduit. Le niveau de charge cible en % ne s’applique alors pas. 0 = désactivé, la voiture ne charge alors qu’avec le courant solaire ou avec « Charger maintenant ». Si la voiture transmet un niveau de charge, c’est toujours lui qui s’applique.',
      carSocLbl: 'Voiture',
      carNow: 'Voiture maintenant',
      pvTargetSoc: 'Niveau de charge cible (%, au lieu de l’énergie)',
      pvNeedCarSoc: 'Le niveau de charge de la voiture est inconnu (Setup → Voiture)',
      pvNeedCarCap: 'La capacité de la batterie de la voiture manque (Setup → Voiture)',
      pvReachedAlready: 'La voiture a déjà atteint le niveau de charge cible',
      pvSocFrom: 'de',
      pvSocTo: 'à',
      pvDayStrip: 'Aperçu sur la journée',
      cmdT: {
        'battery.charge': 'Batterie : charger depuis le réseau',
        'battery.hold': 'Batterie : maintenir (ne pas décharger)',
        'battery.normal': 'Batterie : fonctionnement normal',
        'charger.start': 'Wallbox : démarrer la charge',
        'charger.set': 'Wallbox : régler la puissance de charge',
        'charger.stop': 'Wallbox : arrêter la charge',
        'sgready.normal': 'SG Ready : fonctionnement normal',
        'sgready.boost': 'SG Ready : recommandation (boost)',
        'sgready.forced': 'SG Ready : charge forcée',
        'dhw.program': 'Eau chaude : programme activé',
        'dhw.normal': 'Eau chaude : retour à la normale',
        'dhw.delay': 'Eau chaude : retarder',
      },
      cmdTest: 'Tester',
      cmdTestFail: 'Échec de la commande :',
      cmdTestWhy: 'Avec « Tester », vous émettez la commande une fois à la main, aussi en mode test, pour vérifier votre Flow (valeurs prudentes : la batterie ne reçoit aucun ordre de charge au-dessus du niveau actuel).',
      cmdLabel: 'Recettes de Flow',
      cmdRow: 'Commandes de l’app vers vos appareils',
      cmdTagsLbl: 'Tags',
      cmdFlowOk: 'Flow trouvé',
      cmdFlowMissing: 'Aucun Flow',
      cmdFlowOff: 'Le Flow est désactivé',
      cmdFlowBroken: 'Le Flow est défectueux',
      cmdFlowEmpty: 'Flow sans action',
      ctrlMissing: 'Pilotage manquant',
      devMissing: 'Appareil manquant',
      refTitle: 'Appareils ou Flows supprimés',
      refWhy: 'Ces appareils ou Flows n’existent plus dans Homey. L’app continue de fonctionner sans eux. Choisissez un nouvel appareil ou supprimez la référence.',
      refRemove: 'Supprimer la référence',
      refRemoveConsumer: 'Supprimer le consommateur',
      refRecheck: 'Vérifier à nouveau',
      refChecking: 'Vérification …',
      refBadgeDev: 'Appareil supprimé',
      refBadgeFlow: 'Flow supprimé',
      refBadgeCap: 'Capability manquante',
      refBadgeMix: 'Référence manquante',
      refArea: {
        grid: 'Compteur réseau',
        pv: 'Onduleur PV',
        house: 'Consommation de la maison',
        battery: 'Batterie',
        charger: 'Wallbox',
        car: 'Voiture',
        forecast: 'Prévision PV',
        consumer: 'Consommateur',
        fuse: 'Protection du raccordement',
        sgready: 'SG Ready',
        dhw: 'Eau chaude',
      },
      refField: {
        sensor: 'Capteur',
        mode: 'Mode',
        feedback: 'Retour d’état',
        relay: 'Relais',
        forceRelay: 'Relais de forçage',
        heating: 'Champ d’état',
        target: 'Consigne',
        output: 'Sortie',
        meter: 'Compteur',
        shed: 'Appareil à couper',
        shedFlow: 'Flow de coupure',
        accu: 'Capteur de batterie',
        humidity: 'Capteur d’humidité',
        flowOn: 'Flow marche',
        flowOff: 'Flow arrêt',
        flowNormal: 'Flow normal',
        flowBoost: 'Flow recommandation',
        flowForced: 'Flow forçage',
        flowDelay: 'Flow retard',
      },
      refProblem: {
        device: 'Appareil supprimé',
        flow: 'Flow supprimé',
        capability: 'Capability manquante',
      },
      cmdSending: 'envoi …',
      cmdSent: 'Commande envoyée',
      cmdChecked: 'Flows vérifiés',
      cmdCheck: 'Vérifier à nouveau les Flows',
      cmdChecking: 'Vérification des Flows …',
      cmdCheckFail: 'Impossible de vérifier les Flows',
      cmdSummary: 'avec un Flow',
      cmdWhyCheck: 'Le point indique si un Flow activé attend la commande (déclencheur « La gestion de l’énergie donne une commande »).',
      cmdIntro: 'L’app ne commute pas elle-même d’autres appareils : Homey n’autorise pas les apps à exécuter les cartes d’autres appareils. Elle donne des commandes à la place. Créez un Flow par commande : QUAND « La gestion de l’énergie donne la commande … », ALORS la carte de votre appareil (toute marque). Les valeurs sont disponibles comme tags. Les commandes ne sont émises qu’en mode réel ; en mode test, elles sont seulement journalisées.',
      cmdWhere: 'Nouveau Flow, QUAND, app « Gestion de l’énergie », carte « La gestion de l’énergie donne une commande », choisissez la commande.',
      cmdFires: 'L’app donne :',
      cmdNone: 'Aucune commande (rien n’est encore configuré).',
      cmdOn: 'activer',
      cmdOff: 'désactiver',
      cmdShed: 'Protection',
      cmdHint_battery: 'Charge : carte de votre batterie « charger depuis le réseau » avec [power] et [target_soc]. Maintien : arrêter la charge et régler la puissance de décharge maximale à 0. Normal : arrêter la charge, mode de fonctionnement autoconsommation, puissance de décharge maximale à [discharge].',
      cmdHint_charger: 'Régler la puissance de charge : carte de votre wallbox avec [power] (watts). Démarrer la charge et arrêter la charge : les cartes correspondantes de la wallbox.',
      cmdHint_consumer: 'Activez ou désactivez l’appareil avec sa carte, ou lancez l’un de vos Flows (action « Démarrer un Flow »).',
      cmdHint_sgready: 'Réglez le mode de votre pompe à chaleur (SG Ready) avec la carte correspondante ou commutez les relais.',
      cmdHint_dhw: 'Programme activé : augmenter la consigne d’eau chaude. Retour à la normale : rétablir la consigne. Retarder : abaisser la consigne. La valeur « consigne d’eau chaude » n’est qu’un tag du déclencheur « La consigne d’eau chaude doit être réglée ».',
      cmdHint_shed: 'Coupez l’appareil que la protection du raccordement doit couper.',
      ctrlKind: 'Commuter via',
      ctrlViaDevice: 'Appareil (marche/arrêt)',
      ctrlViaFlow: 'Commande vers un Flow (marche et arrêt)',
      assumedW: 'Puissance du consommateur (W, pour le calcul du surplus)',
      pvReached: 'atteint',
      pvReachedSoFar: 'atteint jusqu’ici',
      pvForecastLeg: 'Prévision',
      planTable: 'À PARTIR DE MAINTENANT : CE QUI SE PASSE ET QUAND',
      planColTime: 'Heure',
      planColWhat: 'Ce qui se passe',
      planColPrice: 'Moy. Rp.',
      planNothing: 'Il n’y a pas encore de données de prix pour les prochaines heures.',
      planTablePrices: 'À PARTIR DE MAINTENANT : PRIX',
      planColLevel: 'Niveau de prix',
      planShortCharge: 'charge',
      planShortHold: 'maintien',
      planShortSolar: 'solaire',
      planShortFull: 'pleine',
      planTableHint: '= prévu, sinon cela fonctionne déjà ainsi.',
      planChSolar: 'charge (solaire)',
      planChFull: 'charge (pleine puissance)',
      planTag: 'prévu',
      calcTitle: 'CALCUL',
      calcRow: 'Intervalle de calcul',
      calcAuto: 'Automatique',
      calcEvery: 'Toutes les',
      calcSecs: 's',
      calcOptAuto: 'Automatique (15 s avec une voiture, 30 s avec des consommateurs, sinon 5 min)',
      calcOpt15: 'Toutes les 15 secondes',
      calcOpt30: 'Toutes les 30 secondes',
      calcOpt60: 'Toutes les minutes',
      calcOpt300: 'Toutes les 5 minutes',
      notifyTitle: 'NOTIFICATIONS', notifyRow: 'Timeline', notifyOn: 'Notifications importantes dans la timeline', notifyOnS: 'activé', notifyOffS: 'désactivé', notifyH: 'N’écrit que ce que vous devez savoir, une fois par incident : erreurs (p. ex. wallbox ou compteur illisible, commande de batterie échouée, arrêt de sécurité), coupure par la protection du raccordement, pompe à chaleur qui ne suit pas (état SG Ready ou consigne d’eau chaude) et appareils ou Flows supprimés (au plus une fois par jour). Les événements quotidiens comme les changements de batterie ou les démarrages ne vont pas dans la timeline, les déclencheurs Flow sont là pour cela.', calcLabel: 'La wallbox et les consommateurs calculent',
      calcTick: 'Plan de la batterie toutes les (minutes)',
      calcDevices: 'appareils lus',
      calcCalls: 'requêtes par heure',
      calcAutoImpact: 'Selon la situation : au repos 5 min, avec des consommateurs 30 s, avec une voiture à la wallbox 15 s.',
      calcImpact: 'Plus court : réagit plus vite aux nuages et aux changements de charge, mais sollicite davantage Homey (un très grand nombre de requêtes peut atteindre la limite de Homey). Plus long : plus calme et plus ménageant, mais le système réagit plus lentement et une partie du surplus part vers le réseau. Les temps de maintien et de grâce (en secondes) n’agissent qu’au rythme du calcul.',
      calcTickHint: 'Le plan de la batterie (à titre de comparaison) se calcule à ce rythme, de 1 à 15 minutes. Les prix ne changent que toutes les 15 minutes.',
      pvTitle: 'APERÇU : PLANIFIER UNE TÂCHE',
      pvIntro: 'Indiquez ce qui doit se passer et pour quand. L’aperçu montre pendant quels quarts d’heure cela se ferait. Rien n’est enregistré et rien n’est commuté.',
      pvDevice: 'Appareil',
      pvUntil: 'Terminé pour',
      pvKwh: 'Énergie (kWh)',
      pvHours: 'Durée de fonctionnement (h)',
      pvPower: 'Puissance (kW, facultatif, vide = automatique)',
      pvMaxPrice: 'Prix maximal (Rp./kWh, facultatif, vide = aucun)',
      pvBlock: 'fonctionner en un seul bloc',
      pvRun: 'Aperçu',
      pvClear: 'Réinitialiser',
      pvPreviewLbl: 'aperçu',
      pvRunsFrom: 'Fonctionne de',
      pvTo: 'à',
      pvIn: 'en',
      pvQuarters: 'quarts d’heure entre',
      pvAvg: 'Moyenne',
      pvCost: 'Coût env.',
      pvNeedAmount: 'Saisissez une quantité',
      pvBadTime: 'Heure invalide',
      pvRepeat: 'Répéter',
      pvRep: {
        once: 'une fois',
        daily: 'chaque jour',
        weekdays: 'lun. à ven.',
        weekend: 'sam. et dim.',
      },
      pvRepeatSoc: 'Un niveau de charge cible ne s’applique qu’une seule fois. Identique chaque semaine : modèle hebdomadaire sous « Voiture ».',
      pvRepeatHint: 'Récurrent : planifié dans les 24 heures avant l’échéance.',
      pvR_prices_missing: 'Tous les prix ne sont pas encore connus pour cette échéance',
      pvR_too_expensive: 'Pas assez de quarts d’heure sous le prix maximal',
      pvR_too_short: 'Il n’y a pas assez de temps d’ici là',
      pvR_no_block: 'Il n’y a pas de bloc continu sous le prix maximal',
      pvR_deadline_passed: 'L’échéance est déjà passée',
      pvHave: 'possible',
      pvOf: 'sur',
      pvSave: 'Appliquer',
      pvJobs: 'TÂCHES ACTIVES',
      pvJobWord: 'tâche',
      pvRemove: 'Supprimer',
      pvUntilShort: 'd’ici',
      pvRunningNow: 'en cours',
      pvPlannedAt: 'prévu',
      pvWaiting: 'en attente des prix',
      pvProgress: 'quarts d’heure effectués',
      pvJobNote: 'Les tâches sont replanifiées à chaque cycle avec les prix actuels. En mode silencieux, elles sont seulement simulées.',
      pvSaveFailed: 'Enregistrement impossible',
      pvSavedOk: 'Tâche appliquée',
      setupReady: 'Prêt : toutes les sources requises sont choisies',
      setupMissing: 'Il manque encore :',
      setupNoBat: 'Sans batterie domestique, la gestion de l’énergie fonctionne quand même : la wallbox et les consommateurs chargent avec le surplus. Les modes selon le niveau de batterie ne sont alors pas possibles.',
      prioRow: 'Priorité (ordre pour le surplus)',
      prioUp: 'vers le haut',
      prioDown: 'vers le bas',
      prioTag: 'Priorité {n}',
      prioWhy: 'Pour « Avec surplus » : l’appareil placé plus haut démarre en premier et s’arrête en dernier. Un seul démarre par mesure pour que le surplus ne soit pas planifié deux fois. L’ordre est appliqué avec « Enregistrer ».',
      suggestedTag: 'Suggéré',
      suggest: 'Suggérer automatiquement',
      suggested: 'Suggestions remplies :',
      nothingSuggested: 'Rien de convenable trouvé',
      tagRequired: 'Obligatoire',
      tagRecommended: 'Recommandé',
      tagOptional: 'Facultatif',
      tagAuto: 'Automatique',
      notChosen: 'non choisi',
      device: 'Appareil',
      value: 'Valeur',
      pick: '- choisir un appareil -',
      none: '- aucun -',
      pickFirst: '- choisir d’abord un appareil -',
      fuseOutTabTitle: 'RACCORDEMENT : PRÉVISION 24 HEURES',
      fuseOutWhy: 'Soutirage réseau attendu si tout ce qui est planifié fonctionne en même temps : consommation apprise de la maison plus plan de la batterie, voiture et tâches planifiées, moins le solaire. Les consommateurs qui suivent le surplus fonctionnent avec le soleil et ne sont pas inclus. Hypothèse : réparti uniformément sur les trois phases ; un appareil monophasé sur la mauvaise phase peut atteindre la limite plus tôt.',
      fuseOutPeak: 'Pic de {kw} kW à {time} : {pct} % de la limite ({limit} kW)',
      fuseOutOk: 'ok',
      fuseOutTight: 'juste',
      fuseOutOver: 'au-dessus de la limite',
      fuseOutHouse: 'Maison',
      fuseOutNone: 'Pas encore de profil de consommation : la prévision apparaît dès que l’app a appris la consommation de la maison.',
      fuseTitle: 'RACCORDEMENT',
      fuseRow: 'Protection du raccordement',
      fuseOff: 'désactivée',
      fuseOn: 'Protéger le raccordement',
      fuseWhy: 'Garde chaque phase sous la limite du fusible principal : d’abord la wallbox est bridée ; si cela ne suffit pas, les appareils ci-dessous sont coupés l’un après l’autre.',
      fuseAmps: 'Fusible principal (A)',
      fuseReserve: 'Réserve (% du fusible)',
      fuseLimitLbl: 'Limite',
      fusePerPhase: 'par phase',
      fuseMeter: 'Compteur avec courants de phase',
      fuseMeterGrid: 'identique au compteur réseau',
      fusePhase: 'Phase',
      fuseThrottle: 'Brider la wallbox pour qu’aucune phase ne dépasse la limite',
      fuseThrottleHint: 'La wallbox reçoit au maximum le courant encore libre sur la phase la plus sollicitée. S’applique quand la gestion de l’énergie pilote la wallbox.',
      fuseHold: 'Attendre avant de couper (s)',
      fuseRestore: 'Libérer après (min sous la limite)',
      fuseShedTitle: 'EN CAS DE SURCHARGE, COUPER DANS CET ORDRE',
      fuseShedNone: 'Aucun appareil sélectionné.',
      fuseAdd: 'Ajouter',
      fuseAddPick: '- choisir un appareil ou un Flow -',
      fuseHowTitle: 'Comment couper ?',
      fuseAutoLbl: 'Automatique',
      fuseAutoOnoff: 'Détecté automatiquement : capability marche/arrêt.',
      fuseAutoThermostat: 'Détecté automatiquement : mode thermostat réglé sur « arrêt ».',
      fuseAutoNone: 'Aucune capability adaptée détectée – veuillez choisir un Flow.',
      fuseAutoCharger: 'Automatique : la session de charge est arrêtée.',
      fuseUp: 'vers le haut',
      fuseDel: 'Supprimer',
      fuseFlow: 'Flow',
      fuseLive: 'Protection en mode réel (sinon simulation uniquement)',
      fuseLiveHint: 'En mode réel, la protection coupe vraiment les appareils sélectionnés. Le mode silencieux est prioritaire. Désactivez d’abord les branches correspondantes dans vos propres Flows pour qu’un seul système commute.',
      tgtSource: 'Température cible',
      tgtManual: 'Fixe',
      tgtDevice: 'Depuis la pompe à chaleur (consigne ECS)',
      tgtDev: 'Appareil et valeur (consigne ECS de la pompe à chaleur)',
      tgtTol: 'Tolérance sous la consigne ECS (K)',
      tgtHyst: 'Hystérésis de la pompe à chaleur (K, facultatif)',
      tgtHystH: 'La pompe à chaleur n’arrête le chauffage de l’ECS qu’à la consigne ECS PLUS l’hystérésis (paramètre « Hystérésis », P32 sous ECS/paramètres). Cette valeur ne peut pas être lue via Modbus : saisissez-la à la main. 0 = ignorer.',
      tgtSrcH: 'La pompe à chaleur ne chauffe elle-même que jusqu’à sa consigne ECS (plus l’hystérésis), puis s’arrête. Une cible fixe au-dessus n’est jamais atteinte. « Depuis la pompe à chaleur » se termine à la consigne ECS plus l’hystérésis moins la tolérance. Au-dessus d’environ 50 °C, la résistance électrique intervient.',
      tgtTolH: 'Se termine dès que l’eau chaude atteint la consigne ECS moins cette tolérance (la sonde a un léger retard).',
      tgtFallback: 'Cible de secours si la consigne ECS n’est pas lisible (°C)',
      tgtFallbackH: 'Utilisée uniquement quand la valeur de la pompe à chaleur ne peut pas être lue pour le moment.',
      dhwHeating: 'La pompe à chaleur prépare l’eau chaude (champ d’état, facultatif)',
      dhwHeatingH: 'Appareil et propriété qui indiquent que la pompe à chaleur prépare actuellement l’eau chaude d’elle-même (par exemple « Chauffage ECS »). Tant que c’est le cas, le programme ne démarre pas (pas même à la main) et le retard n’est pas lancé, car abaisser la consigne interromprait le cycle en cours. Vide = pas de contrôle.',
      dhwHeatingOk: 'Valeur pour « prépare » (par exemple true)',
      dhwModeProgram: 'Mode de fonctionnement pendant le programme (facultatif, p. ex. ECS)',
      dhwModeProgramH: 'Nécessaire uniquement si le programme commute lui-même le mode de fonctionnement de la pompe à chaleur (par exemple un Flow de mode de fonctionnement vers « ECS »). Saisissez alors la valeur que l’appareil indique dans ce mode, pour que le contrôle « Piloter uniquement à cette valeur » ne prenne pas notre propre commutation pour un changement extérieur et n’interrompe pas le cycle. Si le mode de fonctionnement reste le même pendant le programme (consigne ECS via carte, déclencheur ou Flows), laissez le champ vide. En mode ECS, le chauffage est coupé ; ensuite il doit repasser en automatique.',
      dhwMaxRun: 'Durée maximale (min)',
      dhwMaxRunH: 'Limite de sécurité : ensuite le programme est remis sur normal (le mode ECS coupe le chauffage). 0 = illimitée.',
      dhwTitle: 'PROGRAMME EAU CHAUDE À PRIX AVANTAGEUX',
      dhwRow: 'Programme eau chaude',
      dhwOff: 'désactivé',
      dhwRunning: 'en cours',
      dhwWaiting: 'en attente',
      dhwOnLbl: 'Démarrer le programme eau chaude à prix avantageux',
      dhwWhy: 'Indépendant de SG Ready : s’il se trouve dans les heures les moins chères de la journée et que l’eau chaude est sous le minimum, le programme eau chaude de la pompe à chaleur démarre (Flow ou fonction de l’app) puis est remis sur normal. Tant que SG Ready fonctionne, le programme ne démarre pas (et inversement).',
      dhwCheapHours: 'Heures les moins chères par jour (h)',
      dhwCheapH: 'Le programme démarre pendant les N heures les moins chères de la journée (d’après les prix au quart d’heure du jour). L’aperçu montre quand ce serait aujourd’hui et demain.',
      dhwPreview: 'Aperçu',
      dhwToday: 'Aujourd’hui',
      dhwTomorrow: 'Demain',
      dhwAvg: 'moy.',
      dhwNoPrices: 'Aperçu : pas encore de prix pour aujourd’hui.',
      dhwBelow: 'Ne démarrer que sous eau chaude (°C)',
      dhwBelowH: 'Uniquement si l’eau chaude est sous cette valeur (0 = toujours). Sans mesure de température, il ne démarre pas.',
      dhwSkipPv: 'Ne pas démarrer si le soleil suffit',
      dhwSkipPvKwh: 'Le soleil suffit à partir de la prévision (kWh, reste d’aujourd’hui)',
      dhwSkipUntil: 'La prévision solaire compte jusqu’à',
      dhwSkipPvH: 'Démarrer selon le prix n’a pas de sens si le soleil fournira encore assez aujourd’hui (prévision restante).',
      dhwSkipUntilH: 'Jusqu’à cette heure, la prévision solaire compte ; ensuite le prix peut déclencher le démarrage.',
      dhwTarget: 'Terminer à l’eau chaude (°C)',
      dhwTargetH: 'Quand l’eau chaude atteint cette température, le programme est remis sur normal. La vraie cible se règle dans la pompe à chaleur elle-même.',
      dhwMinRunH: 'Une fois démarré, le programme fonctionne au moins aussi longtemps. Seuls la température cible, le mode de fonctionnement ou le soleil (SG Ready) le terminent plus tôt.',
      dhwLive: 'Programme eau chaude en mode réel (sinon simulation uniquement)',
      dhwLiveHint: 'En mode réel, il démarre vraiment le programme. Le mode silencieux est prioritaire. Désactivez d’abord un Flow existant pour qu’un seul système commute.',
      hpBoss: 'Important : la pompe à chaleur reste maître, indépendamment de ces réglages. L’app ne donne que des signaux et des consignes (recommandation SG Ready, consigne d’eau chaude). Que la pompe à chaleur chauffe et comment, c’est décidé uniquement par sa propre régulation avec hystérésis, fonctions de protection et blocage du fournisseur d’énergie. Ce programme s’adresse aux utilisateurs avancés : si vous voulez plus simple, utilisez uniquement SG Ready avec le soleil, ou construisez la logique vous-même avec des Flows avancés (l’app fournit les déclencheurs « Commande » et « La consigne d’eau chaude doit être réglée »).',
      sgTitle: 'CHAUFFE-EAU / POMPE À CHALEUR (SG READY)',
      sgRow: 'Pilotage SG Ready',
      sgOff: 'désactivé',
      sgOn: 'Piloter SG Ready',
      sgWhy: 'Commute la recommandation d’enclenchement de la pompe à chaleur (0:1) quand le soleil ou une batterie pleine finance l’eau chaude. Le fonctionnement normal (0:0) est l’état de base. Le prix avantageux a sa propre section plus bas.',
      sgBasis: 'Base de pilotage',
      sgBasisPv: 'Puissance solaire (production PV)',
      sgBasisExport: 'Injection dans le réseau',
      sgBasisH: 'Puissance solaire = ce que produit le PV (utile avec une batterie domestique qui avalerait sinon le surplus). Injection dans le réseau = ce qui part dans le réseau.',
      sgMinSolar: 'Puissance solaire minimale pour démarrer (W)',
      sgMinSolarH: 'Le boost peut démarrer à partir de cette puissance.',
      sgMinSoc: 'Batterie domestique minimale pour démarrer (%)',
      sgMinSocH: 'La batterie domestique doit être au moins aussi pleine avant que la pompe à chaleur reçoive le courant. Ignoré sans batterie.',
      sgHyst: 'Tolérance de la batterie pendant le maintien (%)',
      sgHystH: 'Après la durée de fonctionnement minimale, la batterie peut descendre d’autant de pour cent sous le seuil de démarrage sans terminer le boost (absorbe les petits nuages).',
      sgTemp: 'Terminer le boost à l’eau chaude (°C)',
      sgTempH: 'Quand l’eau chaude atteint cette température, le pilotage revient au fonctionnement normal. La vraie cible se règle dans la pompe à chaleur elle-même (non lisible).',
      sgTo: 'Heure de démarrage la plus tardive (soleil)',
      sgToH: 'Après cette heure, aucun nouveau boost ne démarre à cause du soleil. Le déclencheur de prix en est indépendant.',
      sgStartDelay: 'Délai d’enclenchement (min)',
      sgStartDelayH: 'Les conditions de démarrage doivent être remplies aussi longtemps d’affilée avant que le boost démarre (évite d’enclencher sur de courtes pointes de soleil).',
      sgMinRun: 'Durée de fonctionnement minimale (min)',
      sgMinRunH: 'Une fois démarré, le boost fonctionne au moins aussi longtemps, même avec des nuages. Seuls la température cible ou le mode de fonctionnement le terminent plus tôt.',
      sgStopDelay: 'Délai de déclenchement (min)',
      sgStopDelayH: 'Si les conditions se dégradent après la durée de fonctionnement minimale, attendre aussi longtemps avant de revenir au fonctionnement normal.',
      sgCooldown: 'Pause après la fin (min)',
      sgCooldownH: 'Pause après la fin d’un boost avant qu’un nouveau puisse démarrer.',
      sgDhwOut: 'Régler le programme eau chaude via',
      sgDhwFlows: 'Flows (marche / retour à la normale, p. ex. consigne ECS via Modbus)',
      sgDhwCap: 'Fonction de l’app (capability d’un appareil)',
      sgDhwOn: 'Flow programme eau chaude activé',
      sgDhwOff: 'Flow retour à la normale',
      sgDhwDev: 'Appareil et capability de la fonction de l’app',
      sgDhwOnV: 'Valeur pour marche',
      sgDhwOffV: 'Valeur pour retour à la normale',
      sgDhwH: 'Valeurs sous forme de texte, true/false pour les interrupteurs. À la fin, il est remis sur normal, mais seulement si le pilotage a lui-même démarré le programme.',
      sgPvBelow: 'Démarrage solaire seulement sous eau chaude (°C)',
      sgPvBelowH: 'Facultatif : même avec le soleil, ne démarrer que si l’eau chaude est sous cette valeur (0 = toujours, par défaut).',
      sgForced: 'Autoriser la charge forcée (1:1)',
      sgForcedW: 'Seuil de charge forcée (W)',
      sgForcedH: 'État 1:1, souvent avec une résistance électrique et une forte consommation. Seulement à partir du boost et seulement à partir de cette puissance solaire. Désactivé par défaut.',
      sgSensor: 'Température de l’eau chaude (appareil et valeur)',
      sgSensorH: 'La valeur réelle de l’eau chaude de la pompe à chaleur, pour que le boost se termine à la température cible.',
      sgMode: 'Mode de fonctionnement de la pompe à chaleur (appareil et valeur, facultatif)',
      sgModeOk: 'Piloter uniquement à cette valeur (p. ex. Automatique)',
      sgModeH: 'Le pilotage n’agit que si le mode de fonctionnement a cette valeur. Pas en vacances, confort ou veille. Laisser vide = pas de contrôle.',
      sgFeedback: 'Reprendre l’état de la pompe à chaleur (appareil et valeur, facultatif)',
      sgFeedbackH: 'Lit l’état SG Ready de la pompe à chaleur (p. ex. 2 NORMAL), l’affiche dans le widget et avertit s’il ne correspond pas après la commutation. Vide = état propre uniquement.',
      sgOutput: 'Comment les états sont-ils réglés ?',
      sgOutRelays: 'Deux relais (actionneurs de commutation)',
      sgOutFlows: 'Flows (un Flow par état, p. ex. Modbus)',
      sgOutH: 'Relais : normal (0:0) = les deux désactivés. Recommandation (0:1) = le relais recommandation est activé et ferme le deuxième contact SG. Forcé (1:1) = le relais charge forcée est en plus activé et ferme le premier contact. La notation signifie contact 1 : contact 2, 1 = fermé. Le nom des bornes de votre pompe à chaleur (p. ex. SG1/SG2 ou EVU/SG) figure dans son manuel. L’app ne règle jamais l’état 1:0 (blocage par le gestionnaire de réseau), pas même brièvement lors d’une commutation. Flows : un Flow par état, p. ex. écriture de registres Modbus.',
      sgSetupH: 'Raccordement et pompe à chaleur : utilisez uniquement des contacts libres de potentiel et ne mettez jamais la tension du réseau sur les entrées SG. Le raccordement est fait par un électricien qualifié. Réglez les relais pour qu’ils soient désactivés après une coupure de courant : la pompe à chaleur continue alors en fonctionnement normal. SG Ready doit être activé dans le menu de la pompe à chaleur. C’est souvent là aussi que l’on règle de combien de degrés elle chauffe davantage en 0:1 et 1:1. Certaines pompes à chaleur ne réagissent qu’après quelques minutes, d’où la durée minimale de fonctionnement. Avec « Reprendre l’état de la pompe à chaleur », vous voyez si elle a reconnu le signal.',
      sgRecRelay: 'Relais recommandation (0:1)',
      sgForceRelay: 'Relais charge forcée (1:1 uniquement)',
      sgFlowNormal: 'Flow fonctionnement normal (0:0)',
      sgFlowBoost: 'Flow recommandation (0:1)',
      sgFlowForced: 'Flow charge forcée (1:1)',
      sgLive: 'SG Ready en mode réel (sinon simulation uniquement)',
      sgLiveHint: 'En mode réel, le pilotage commute vraiment. Le mode silencieux est prioritaire. Désactivez d’abord votre Flow précédent pour qu’un seul système commute.',
      sgState: {
        off: 'Fonctionnement normal (0:0)',
        boost: 'Recommandation (0:1)',
        forced: 'Charge forcée (1:1)',
        dhw: 'Programme eau chaude',
      },
      tips: {
        mode: 'Quand l’appareil fonctionne : avec le surplus, avec une batterie pleine, à partir d’un niveau de charge, ou comme programme avec un seul démarrage.',
        fullSoc: 'Enclencher dès que la batterie domestique est au moins aussi pleine.',
        socOn: 'Enclencher dès que la batterie domestique a au moins ce niveau de charge.',
        hysteresis: 'Ne s’éteint que lorsque le niveau de charge descend d’autant de points de pourcentage sous le seuil d’enclenchement.',
        minSurplusW: 'Cette puissance doit s’écouler vers le réseau avant que l’appareil s’enclenche.',
        startSustainS: 'Le surplus doit durer aussi longtemps d’affilée pour que de courtes pointes ne commutent pas.',
        stopGraceS: 'Le surplus peut manquer aussi longtemps avant l’arrêt (absorbe les petits nuages).',
        assumedW: 'Ce que l’appareil consomme. Un Flow ne peut pas le mesurer, l’app calcule donc avec cette valeur.',
        minRunMin: 'Après l’enclenchement, il fonctionne au moins aussi longtemps, même si le surplus disparaît.',
        minOffMin: 'Après l’arrêt, il reste éteint au moins aussi longtemps (protège contre les commutations continuelles).',
        protectSoc: 'Si la batterie domestique descend sous cette valeur, l’appareil s’arrête immédiatement, même pendant la durée de fonctionnement minimale.',
        useGate: 'Avec une faible prévision solaire, aucun nouveau démarrage : la batterie garde sa charge pour le soir.',
        pgSurplus: 'À partir de cette injection, le programme démarre immédiatement.',
        pgSustain: 'Ce surplus doit durer aussi longtemps d’affilée.',
        pgFrom: 'Facultatif. Le bloc bon marché n’est cherché qu’à partir de cette heure, même si l’automatique est activé plus tôt (par exemple chargé à midi mais lancé le soir). Vide : tout de suite à l’activation de l’automatique. Avec un surplus PV, il démarre toujours immédiatement.',
        pgWait: 'Durée maximale pendant laquelle l’automatique attend le surplus ou le bloc le moins cher ; ensuite il démarre dans tous les cas. À l’activation dans le widget, vous pouvez choisir une autre attente, par exemple 8 heures si vous activez le soir et voulez un démarrage à 04:00.',
        pgDuration: 'Durée de fonctionnement habituelle. Pendant ce temps après un démarrage, l’automatisme ne redémarre pas.',
        pgStartVal: 'Cette valeur est envoyée à la capability de démarrage (p. ex. START).',
        pgRemoteVal: 'Il ne peut démarrer que si la télécommande indique cette valeur.',
        pgDoorVal: 'Il ne démarre qu’à cette valeur de la porte (fermée).',
        'bp-reserve': 'La batterie garde de la réserve pour ce nombre d’heures les plus chères de la journée au lieu de se vider avant.',
        'bp-solar': 'À partir de cette quantité solaire attendue (kWh aujourd’hui), pas de charge depuis le réseau.',
        'bp-bridge': 'Charge depuis le réseau si nécessaire pour que la batterie tienne jusqu’au lever du soleil.',
        'bp-floor': 'Sous ce niveau de charge, la batterie n’est plus déchargée.',
        'bp-backupsoc': 'Cette quantité reste dans la batterie tant que la réserve de secours est activée.',
        'fuse-pct': 'Part du fusible que nous utilisons. Le reste sert de marge de sécurité.',
        'fuse-hold': 'Une surcharge doit durer aussi longtemps avant que quoi que ce soit soit coupé.',
        'fuse-restore': 'Tout doit rester sous la limite aussi longtemps avant que la wallbox puisse recharger.',
        'pv-factor': 'Met à l’échelle la prévision PV vers le haut ou le bas si elle est en général trop élevée ou trop basse chez vous.',
      },
      fuseNoRestore: 'Les appareils qui ont été coupés ne sont pas rallumés. La wallbox peut recharger après la libération.',
      fuseNoPhases: 'Le compteur ne fournit pas de courants de phase. Veuillez vérifier le compteur et les valeurs.',
      fuseNow: 'Raccordement',
      fuseOf: 'sur',
      fuseThrottled: 'Wallbox à',
      fuseShedNow: 'coupé :',
      fuseEvOver: 'limite dépassée',
      fuseEvShed: 'coupé',
      fuseEvThrottle: 'Wallbox bridée à',
      fuseEvThrottleEnd: 'Wallbox plus bridée',
      fuseEvRelease: 'libéré',
      srcGrid: 'Compteur réseau',
      srcPv: 'Onduleur solaire',
      srcHouse: 'Consommation de la maison',
      srcBat: 'Batterie domestique',
      srcPrice: 'Prix de l’électricité',
      srcFc: 'Prévision solaire',
      whyGrid: 'Le compteur réseau est la base : soutirage positif, injection négative. Sans lui, rien ne peut être piloté.',
      whyPv: 'Améliore le calcul du surplus (production moins consommation) et sa répartition entre la batterie et les appareils.',
      whyHouse: 'Améliore le calcul du surplus. Peut être le même compteur que le compteur réseau s’il indique la consommation de la maison.',
      whyBat: 'Facultatif. Avec une batterie, il y a des niveaux de protection, la porte de prévision et des modes selon le niveau de la batterie. Sans elle, tout fonctionne avec le surplus.',
      whyPrice: 'Condition : l’appareil de prix « Tarif électrique dynamique CH » est configuré. Les prix au quart d’heure en proviennent automatiquement, rien à choisir ici.',
      priceMissing: 'Appareil de prix manquant – d’abord l’ajouter dans Homey',
      noPriceDevice: 'La gestion de l’énergie a besoin de l’appareil de prix « Tarif électrique dynamique CH ». Ajoutez-le dans Homey sous Appareils → « + ».',
      whyFc: 'Facultatif. Il alimente la porte de prévision et la vue du plan. Homey fournit des valeurs journalières (aujourd’hui, demain) que l’app répartit en une courbe journalière. Plus précise : votre propre prévision horaire transmise avec l’action Flow « Définir la prévision solaire ».',
      fcSource: 'Source',
      fcSrcAuto: 'Automatique (transmise, sinon Homey)',
      fcSrcHomey: 'Homey (prévision énergétique)',
      fcSrcDevice: 'Valeurs journalières d’un appareil',
      fcSrcExternal: 'Uniquement transmise par action Flow',
      fcToday: 'Valeur pour aujourd’hui (kWh)',
      fcTomorrow: 'Valeur pour demain (kWh)',
      fcFrom: 'Source',
      fcNames: {
        homey: 'Homey',
        device: 'appareil',
        external: 'action Flow',
        fallback: 'source de comparaison',
      },
      fcDays: 'aujourd’hui',
      fcDay2: 'demain',
      fcCurveHint: 'Une valeur journalière devient une courbe entre le lever et le coucher du soleil. C’est une approximation sans couverture nuageuse.',
      autoPrice: 'depuis cette app',
      fcNone: 'non transmise',
      fcAge: 'dernière',
      fcStale: 'périmée',
      fcSlots: 'entrées',
      min: 'min',
      h: 'h',
      factor: 'Facteur de correction',
      factorHint: 'Appliqué à chaque valeur de prévision, par exemple 0,75 si elle est en général trop élevée de 25 %.',
      wallbox: 'Wallbox',
      chargeNow: 'Charge immédiate (pleine puissance)',
      addConsumer: 'Ajouter un consommateur',
      remove: 'Supprimer',
      name: 'Nom',
      type: 'Type',
      ctrlDevice: 'Appareil à commuter',
      meterDevice: 'Compteur pour les coûts (kWh)',
      mode: 'Enclencher',
      modeFull: 'Quand la batterie est pleine',
      modeSoc: 'À partir du niveau de la batterie',
      modeSurplus: 'Avec le surplus',
      modeProgram: 'Démarrer un programme',
      noCtrl: 'compteur de coûts uniquement',
      programTitle: 'Démarrer un programme',
      programWindow: 'Démarrage selon le prix au plus tôt à partir de (facultatif)',
      programMaxWait: 'Attente par défaut (h)',
      programDuration: 'Durée du programme (h)',
      programHint: 'Vous activez l’automatique dans le widget avec l’interrupteur « Auto » une fois la machine chargée. Elle démarre tout de suite avec un surplus PV suffisant. Sinon elle choisit le bloc le moins cher de la durée du programme jusqu’à la fin de l’attente et démarre au plus tard alors (filet de sécurité). Ensuite l’automatique se désactive ; réactivez-la pour le cycle suivant. Autant de cycles par jour que souhaité, aussi au-delà de minuit.',
      programStartCap: 'Capability de démarrage',
      programStartVal: 'Valeur de démarrage',
      programRemoteCap: 'Capability de télécommande (facultatif)',
      programRemoteVal: 'Valeur de la télécommande (si activée)',
      programRemoteWarn: 'Sans capability de télécommande, l’app ne vérifie jamais si l’appareil peut même être commuté – nécessaire pour certains appareils (p. ex. Electrolux).',
      programDoorCap: 'Capability de la porte (facultatif)',
      programDoorVal: 'Valeur de la porte « fermée » (si choisie)',
      programStateCap: 'Capability d’état (facultatif)',
      programStateVal: 'Valeur d’état « prêt/inactif » (si choisie)',
      programStateHint: 'Empêche une deuxième commande de démarrage tant que l’appareil fonctionne encore (démarré à la main ou par nous) – quelle capability et quelle valeur signifient « prêt » dépend de l’appareil. Laissez vide si l’appareil n’a rien de tel.',
      fullSoc: 'Plein à partir de SoC (%)',
      socOn: 'Activé à partir de SoC (%)',
      hysteresis: 'Arrêt en dessous (points sous cette valeur)',
      batFirst: 'Batterie domestique d’abord jusqu’à (%, facultatif)',
      batFirstPh: 'comme la wallbox',
      batFirstHint: 'Vide : comme la wallbox (batterie domestique d’abord jusqu’à la limite commune). Un nombre : limite propre ; au-dessus, l’appareil prend aussi la puissance qui part actuellement dans la batterie domestique. Pour de petits appareils (vélo électrique), p. ex. 0.',
      minSurplus: 'Surplus minimal (W)',
      startSustain: 'Le surplus doit durer (s)',
      stopGrace: 'Délai de grâce avant l’arrêt (s)',
      advanced: 'Avancé',
      minRun: 'Durée de fonctionnement minimale (min)',
      minOff: 'Pause minimale (min)',
      protect: 'Protéger le SoC : arrêt immédiat en dessous de (%)',
      useGate: 'Respecter la porte de prévision',
      shareAt: 'Batterie à partir de (%)',
      shareGets: 'Part solaire (%)',
      shareLowRow: 'Limite inférieure : à partir d’ici la voiture reçoit du courant solaire',
      shareHighRow: 'Limite supérieure : à partir d’ici elle reçoit tout le surplus',
      shareChartCap: 'Quelle part du courant solaire la voiture reçoit selon le niveau de la batterie',
      shareNow: 'Maintenant : batterie {soc} % → la voiture reçoit {pct} % du courant solaire.',
      shareBonusTitle: 'Bonus de prévision',
      shareVal: 'Part solaire voiture {pct} %',
      wbLinkTitle: 'Raccordement de la wallbox (comment elle est adressée)',
      wbLinkWhy: 'Le réglage par défaut convient aux wallbox avec les cartes « démarrer la charge » et « régler la puissance de charge ». Pour une autre wallbox, choisissez ce que l’appareil indique et quelles cartes Flow il a pour le pilotage. La puissance est calculée à partir des ampères, des phases et de 230 V, et transmise en watts à la carte « régler la puissance de charge » (arrêt = 0 W).',
      wbState: 'État de charge (capability)',
      wbPower: 'Puissance de charge (capability)',
      wbPhase: 'Phases (capability, facultatif)',
      wbPhaseH: 'Uniquement pour la commutation de phases. Valeurs attendues : 1 = une phase, 2 = trois phases.',
      wbNone: '– aucune –',
      wbStd: 'Par défaut',
      wbCustom: 'Affectation personnalisée',
      paLabel: 'RAPPORT D’APPRENTISSAGE',
      paRow: 'Précision du plan',
      paSumWait: 'Mesure depuis {n} jours, un verdict à partir de {m} jours',
      paSumBetter: '{k} prévisions sur {t} peuvent être améliorées',
      paSumNone: 'Les méthodes actuelles sont suffisamment bonnes',
      paWhy: 'Mesure seulement, ne change rien : dans quelle mesure les prévisions du planificateur correspondent à ce qui s’est réellement passé. Erreur = écart en pourcentage de la valeur mesurée, plus petit est meilleur.',
      paDays: 'Jours',
      paNow: 'méthode actuelle',
      paAlt: 'Alternative',
      paBest: 'Meilleur',
      paLoadM: 'Consommation matin 05-10',
      paLoadD: 'Consommation journée 10-17',
      paLoadE: 'Consommation soir 17-22',
      paPvRest: 'Solaire : reste de la journée dès 10:30',
      paWait: '{n} jours sur {m} jusqu’ici',
      paMean: 'moyenne',
      paRobust: 'robuste',
      paPlain: 'inchangé',
      paNowcast: 'avec correction du matin',
      paSame: 'aussi bon',
      paNote: 'Consommation : « moyenne » est la méthode actuelle (moyenne des 7 derniers jours), « robuste » est la médiane du même type de jour (jour ouvré/week-end), insensible aux gros consommateurs isolés. Solaire : « inchangé » est la prévision du reste de la journée, « avec correction du matin » est mise à l’échelle avec le rapport mesuré/prévu de 06:00 à 10:30. Une méthode ne compte comme meilleure que si son erreur est au moins 10 % plus petite.',
      pvAccTitle: 'Recommandation d’après les derniers jours',
      pvAccNone: 'Pas encore assez de données : {n} jours complets sur au moins {m}. Chaque matin, l’app enregistre la prévision du jour et la compare le soir avec la production mesurée.',
      pvAccRec: 'Recommandation : {f} (médiane de {n} jours, le plus souvent entre {lo} et {hi}).',
      pvAccRecent: 'Seulement les {n} derniers jours : {f}.',
      pvApply: 'Appliquer',
      pvAuto: 'Facteur de correction automatique',
      pvAutoH: 'À partir de 7 jours complets, l’app inscrit elle-même la valeur recommandée dans le champ une fois par jour. Le champ affiche alors la valeur actuelle.',
      pvAccLog: 'Historique des derniers jours',
      pvAccDay: 'Jour',
      pvAccFc: 'Prévision sans facteur (kWh)',
      pvAccAct: 'Mesuré (kWh)',
      pvAccRatio: 'Rapport',
      pvAccToday: 'aujourd’hui',
      pvAccNote: 'Seuls les jours complets avec au moins 2 kWh de prévision comptent. Le rapport est la valeur mesurée divisée par la prévision sans facteur.',
      dlyTitle: 'Retarder l’eau chaude (PV d’abord)',
      dlyWhy: 'Facultatif. Si l’eau chaude descend sous le seuil de démarrage de la pompe à chaleur dans la plage horaire, son démarrage est repoussé (la consigne ECS est abaissée par un Flow) pour que l’eau chaude soit produite avec le courant solaire ou dans le bloc bon marché plutôt qu’avec le courant du réseau le matin. Ensuite la consigne est de nouveau libérée. Nécessite la sortie par carte d’action ou les Flows « retarder » et « retour à la normale » (ci-dessus).',
      dlyOn: 'Retarder l’eau chaude',
      dlyFlow: 'Flow « abaisser la consigne (retarder) »',
      dlyFrom: 'Plage horaire de',
      dlyTo: 'à',
      dlyForecast: 'Assez de soleil à partir de la prévision (kWh)',
      dlyForecastH: 'Prévision restante pour aujourd’hui. À partir de cette valeur, la pompe à chaleur attend le soleil (SG Ready) jusqu’à l’heure de libération. En novembre, la prévision est souvent trop élevée ; mieux vaut la régler plus bas.',
      dlyComfort: 'Limite de confort (°C)',
      dlyComfortH: 'Si l’eau chaude descend sous cette valeur, elle est libérée immédiatement (personne ne doit prendre une douche froide). Sous cette limite, rien n’est retardé non plus.',
      dlyRelWd: 'Libération lun. à ven.',
      dlyRelWe: 'Libération week-end',
      dlyRelLow: 'Libération avec peu de soleil',
      dlyRelLowH: 'Heure de libération quand la prévision est trop faible (et sans optimisation des prix).',
      dlyMargin: 'Seuil de démarrage : marge au-dessus de la consigne moins l’hystérésis (K)',
      dlyMarginH: 'Le retard commence dès que l’eau chaude descend sous la consigne moins l’hystérésis plus cette marge, c’est-à-dire peu avant que la pompe à chaleur démarre d’elle-même.',
      dlyNow: 'Actuellement retardé jusqu’à {time} : {why}',
      dlyNeed: 'Pour retarder, il faut la carte d’action (ci-dessus) ou les Flows « retarder » et « retour à la normale ».',
      dhwPriceFrom: 'Optimisation des prix à partir de (date, facultatif)',
      dhwPriceFromH: 'Les heures les moins chères et le bloc de prix lors du retard ne s’appliquent qu’à partir de cette date, par exemple avec le tarif dynamique. Vide = immédiatement.',
      sgDhwCard: 'Carte d’action d’un appareil (écrire directement la consigne ECS, sans Flow)',
      spDev: 'Appareil avec la carte (p. ex. l’appareil Modbus de la pompe à chaleur)',
      spCard: 'Carte d’action (p. ex. « écrire un registre »)',
      spValueArg: 'Argument pour la consigne',
      spScale: 'Facteur (valeur écrite = °C × facteur)',
      spScaleH: 'Registre en dixièmes de degré : 10 (48 °C s’écrit 480).',
      spProgram: 'Consigne pendant le programme (°C)',
      spDelay: 'Consigne pendant le retard (°C)',
      spNormal: 'Consigne normale si illisible (°C)',
      spNormalH: 'Retour à la normale écrit la consigne lue avant le programme ou le retard. Si elle est inconnue, cette valeur est utilisée.',
      spArgsWhy: 'Les autres arguments de la carte (p. ex. numéro de registre, adressage, type) sont transmis tels quels à chaque appel. Seules les valeurs de 10 à 60 °C sont écrites.',
      spLoading: 'Chargement des cartes de l’appareil …',
      spNoCard: 'La carte choisie n’existe pas sur cet appareil.',
      sgDhwTrig: 'Déclencheur avec valeur (un Flow écrit la consigne, pour toute pompe à chaleur)',
      spTrigWhy: 'À chaque changement, l’app émet le déclencheur « La consigne d’eau chaude doit être réglée » (avec les valeurs « Consigne (°C) » et « Type » : program, delay ou normal). Vous créez un seul Flow : quand ce déclencheur, écrire la consigne dans la pompe à chaleur (Modbus, app cloud, relais …). Vous réglez ici les trois températures ; la consigne normale est mémorisée avant le programme ou le retard.',
      curNow: 'Actuellement',
      curOn: 'marche',
      curOff: 'arrêt',
      shareTitle: 'Protection de la batterie domestique : quelle part du courant solaire reçoit la voiture ?',
      shareWhy: 'Tant que la voiture est branchée, elle reçoit une part du courant solaire selon le niveau de la batterie. Sous le premier niveau, elle attend complètement (batterie d’abord) ; au-dessus, la part monte linéairement jusqu’au surplus complet. S’applique aussi aux appareils sans limite propre (« batterie domestique d’abord jusqu’à »).',
      shareLo: 'La voiture charge à partir de la batterie (%)',
      sharePctLo: 'Part à ce niveau (%)',
      shareHi: 'Surplus complet à partir de la batterie (%)',
      sharePctHi: 'Part à ce niveau (%)',
      shareBonus: 'Bonus de prévision (points de pourcentage plus tôt)',
      shareBonusH: 'Facultatif : si la prévision solaire annonce nettement plus de soleil aujourd’hui que ce dont la batterie a besoin pour se remplir et la maison jusqu’au coucher du soleil, la rampe se décale vers le bas d’au plus autant de points (la voiture charge plus tôt). Sans prévision récente ni profil de maison appris, rien ne se passe. 0 = désactivé.',
      shareBonusNow: 'Bonus de prévision actif : rampe actuellement {n} points plus tôt.',
      shareEx: 'Exemple 30 / 30 / 70 / 100 : à partir de 30 % de batterie, un tiers du courant solaire va à la voiture, à 70 % tout le surplus. Par défaut 50 / 0 / 80 / 100 : seulement à partir de 50 % de batterie, puis de plus en plus.',
      advWb: 'Avancé (raccordement, commutation de phases, courant minimal)', wbPhases: 'Phases de la wallbox', wbPh1: '1 phase', wbPh3: '3 phases', wbPhaseSwitch: 'La wallbox commute elle-même entre 1 et 3 phases', wbPhaseSwitchH: 'Activé : avec peu de soleil, la wallbox charge en monophasé (à partir d’environ 1,4 kW), avec beaucoup de soleil en triphasé. À activer seulement si la wallbox en est capable. Sinon elle charge en triphasé avec au moins environ 4,1 kW, et en dessous elle ne charge pas avec le soleil.', minAmps: 'Courant minimal (A)', minAmpsH: 'Plus petit courant de charge accepté par la wallbox et la voiture. En général 6 A, certaines voitures ont besoin de plus. Au plus aussi élevé que le courant maximal.', maxAmps: 'Courant maximal (A)',
      stepHold: 'Temps de maintien avant augmentation (s)',
      chargeNowAutoOff: 'Désactiver « Charge immédiate » au débranchement',
      iconLbl: 'Icône',
      iconNames: {
        dishwasher: 'Lave-vaisselle',
        plug: 'Prise',
        bike: 'Vélo',
        dehumidifier: 'Déshumidificateur',
        boiler: 'Chauffe-eau',
        washer: 'Lave-linge',
        tumbler: 'Sèche-linge',
        fan: 'Ventilateur',
        heatpump: 'Pompe à chaleur',
        pool: 'Piscine',
        ac: 'Climatisation',
        heater: 'Résistance chauffante',
        sauna: 'Sauna',
        freezer: 'Réfrigérateur / congélateur',
        pump: 'Pompe',
        light: 'Lumière',
        mower: 'Tondeuse robot',
        purifier: 'Purificateur d’air',
        aquarium: 'Aquarium',
      },
      accuTitle: 'Batterie d’appareil (p. ex. vélo électrique, tondeuse)',
      accuEnable: 'Tenir compte du niveau de charge de la batterie',
      accuSensor: 'Niveau de charge depuis',
      accuCap: 'Valeur',
      accuStop: 'Arrêter à (%)',
      accuResume: 'Recharger sous (%)',
      accuLow: 'Toujours charger sous (%)',
      accuMax: 'Arrêter au plus tard après (min)',
      accuHint: 'S’arrête à la limite et ne recharge que lorsque la batterie descend en dessous. Sous la limite inférieure, il charge même sans surplus. La durée maximale coupe si le niveau de charge n’arrive plus (0 = aucune).',
      humWait: 'Démarrer dans le bloc le moins cher (au lieu de tout de suite)',
      humCritical: 'Humidité critique (%, facultatif)',
      humWaitHint: 'Au lieu de démarrer tout de suite à {on} %, le mode d’urgence attend le bloc le moins cher de sa durée de fonctionnement pour le reste de la journée. Entre-temps, l’appareil fonctionne avec le surplus PV comme d’habitude. Sans prix, il démarre tout de suite. À partir de l’humidité critique, il démarre toujours tout de suite.',
      advConsumer: 'Avancé (durées de fonctionnement, niveau de protection, porte de prévision)',
      advSg: 'Avancé (hystérésis, délais, durée de fonctionnement minimale, pause, contrôle du mode de fonctionnement, retour d’état)',
      advDly: 'Avancé (libération avec peu de soleil, marge)',
      advDhw: 'Avancé (contrôle du mode de fonctionnement, champ d’état, délais, durée minimale et maximale, pause)',
      humTitle: 'Mode d’urgence humidité',
      humEnable: 'Mode d’urgence en cas d’humidité élevée',
      humSensor: 'Capteur d’humidité',
      humOn: 'Mode d’urgence activé à partir de (%)',
      humOff: 'Mode d’urgence désactivé sous (%)',
      humRun: 'Durée maximale (min)',
      humHint: 'Fonctionne indépendamment de la batterie et du surplus jusqu’à ce que l’humidité descende sous la valeur d’arrêt ou que la durée maximale soit écoulée. Il ne redémarre qu’après que l’humidité est passée entre-temps sous la valeur d’enclenchement.',
      modeTest: 'non piloté',
      modeLiveTag: 'piloté',
      costLast: 'Compteur dernier',
      noBatMode: 'Sans batterie domestique, seul « Avec le surplus » est possible.',
      save: 'Enregistrer les réglages de la gestion de l’énergie',
      saved: 'Enregistré',
      saveDirty: 'Enregistrer les modifications ●',
      saveSec: 'Enregistrer',
      unsavedTag: '● non enregistré',
      unsaved: 'Pas encore enregistré : veuillez appuyer sur « Enregistrer ».',
      error: 'Erreur',
      toggleFailed: 'Impossible de régler l’interrupteur',
      modeNames: {
        disabled: 'Désactivé',
        idle: 'Au repos',
        holding: 'En attente de surplus',
        solar_ev: 'Charge solaire',
        instant_ev: 'Charge à pleine puissance',
        battery_priority: 'Batterie d’abord',
        error: 'Erreur',
      },
      otherEms: 'Si une autre gestion de l’énergie pilote déjà cette wallbox, désactivez-la d’abord là-bas. Sinon deux systèmes pilotent la même wallbox.',
      time: 'Heure',
      price: 'Prix',
      day: 'Jour',
      targetSoc: 'SoC cible (%)',
      reserve: 'Réserve (heures)',
      solarLimit: 'Seuil solaire (kWh)',
    },
    it: {
      tab: 'Previsione',
      subMain: 'Funzionamento',
      noDevice: 'La gestione dell’energia non è ancora configurata. In Homey vai su Dispositivi → «+» → «Tariffa elettrica dinamica CH» e aggiungi il dispositivo «Gestione dell’energia».',
      devicesSec: 'Configura la gestione dell’energia',
      sources: 'FONTI DI DATI',
      consumers: 'CONSUMATORI',
      stOff: 'Disattivata',
      stTest: 'In funzione, ma nessun dispositivo è ancora abilitato al controllo',
      stLive: 'In funzione e controlla',
      stWarn: 'In funzione con un avviso',
      switchHint: 'Attivo: la gestione dell’energia controlla questo dispositivo. Disattivo: lo lascia stare. Finché la modalità silenziosa è attiva, tutto è solo simulato.',
      pvLbl: 'FV',
      gridLbl: 'Rete',
      batLbl: 'Batteria',
      noConsumers: 'Nessun consumatore finora.',
      plan: 'PIANO',
      planToday: 'Oggi',
      planTomorrow: 'Domani',
      planPrice: 'Prezzo in Rp./kWh',
      planPv: 'Previsione solare',
      planNow: 'adesso',
      planBlock: 'Blocco più conveniente (2 h)',
      planBlockNow: 'Blocco più conveniente da adesso (2 h)',
      planPvKwh: 'Solare previsto',
      planPriceRange: 'Prezzo min. a max.',
      planNoPrices: 'Ancora nessun prezzo per questo giorno.',
      planBat: 'Batteria (piano)',
      planBatAdvice: 'raccomandazione, non controllata',
      planBatLive: 'controllata',
      planWallbox: 'Wallbox (storico)',
      planWallboxCar: 'Wallbox e auto (storico e piano)',
      planChError: 'errore',
      planTo: 'alle',
      planTest: 'simulato',
      planPlanned: 'previsto',
      planCheap: 'conveniente',
      planNormal: 'normale',
      planExp: 'caro',
      planBatCharge: 'Carica dalla rete',
      planBatHold: 'Mantenimento (scarica bloccata)',
      planBatNormal: 'Normale',
      planOn: 'attivo',
      planNote: 'La batteria mostra il piano del pianificatore (ricalcolato ogni 15 minuti, solo come confronto). Wallbox e consumatori seguono l’eccedenza attuale: qui vedi cosa hanno fatto. In modalità test è la simulazione.',
      carCal: 'Modello settimanale (lun.–dom.)',
      carCalHint: 'Vale ogni settimana. Una voce per «Oggi» o «Domani» sopra sostituisce il giorno. Le modifiche vengono salvate subito.',
      carCalSaving: 'salvataggio …',
      carCalSaved: 'salvato',
      carSetupHint: 'Gli obiettivi, «Oggi/Domani» e il modello settimanale si impostano sotto «Previsione».',
      carDays: {
        mon: 'lun.',
        tue: 'mar.',
        wed: 'mer.',
        thu: 'gio.',
        fri: 'ven.',
        sat: 'sab.',
        sun: 'dom.',
      },
      carTime: 'Partenza',
      carSoc: 'Obiettivo %',
      carHoliday: 'Vacanza: nessun obiettivo di carica (il solare continua a caricare)',
      carHolidayOn: 'Vacanza',
      carHolidayUntilShort: 'fino al',
      carHolidayOpen: 'fino alla disattivazione',
      carHolidayUntil: 'fino al (incluso, facoltativo, vuoto = fino alla disattivazione)',
      carGrid: 'Carica dalla rete se il sole non basta entro la partenza',
      carGridHint: 'Attivo: l’app carica nei quarti d’ora più convenienti prima della partenza. Disattivo: solo solare.',
      carCard: 'Auto',
      carNext: 'Prossimo obiettivo',
      carNone: 'nessun obiettivo previsto',
      carFromCal: 'modello',
      carFromOverride: 'eccezione',
      carSt: {
        none: 'Nessun obiettivo',
        no_soc: 'Livello di carica sconosciuto',
        no_capacity: 'Capacità della batteria mancante (Setup → Auto)',
        reached: 'Obiettivo raggiunto',
        solar_only: 'Solo solare',
        planned: 'Previsto',
        short: 'Non proprio abbastanza prima della partenza',
      },
      carNotConnected: 'non collegata',
      carBadgeCharging: 'in carica',
      carBadgePlugged: 'collegata',
      carBadgeReached: 'obiettivo raggiunto',
      carOverride: 'Diverso oggi o domani (sostituisce il modello)',
      carToday: 'Oggi',
      carTomorrow: 'Domani',
      carCharge: 'carica',
      carApply: 'Applica',
      carClear: 'Usa di nuovo il modello',
      carSaved: 'Salvato',
      silent: 'Modalità silenziosa: solo simulazione',
      silentHint: 'Attiva: nulla viene commutato. Il registro e le previsioni mostrano cosa accadrebbe. Disattiva: i dispositivi con l’interruttore attivo vengono controllati davvero.',
      stSilent: 'Modalità silenziosa: solo simulazione',
      silentTag: 'silenziosa',
      batCtl: 'Controlla la batteria',
      batCtlOn: 'Controlla la batteria tramite la gestione dell’energia',
      batCtlWarn: 'Un solo sistema può controllare la batteria. Disattiva il controllo della batteria nell’altra gestione dell’energia e nei tuoi Flow della batteria prima di passare alla modalità reale.',
      bpMode: 'Ore di punta',
      bpModeAuto: 'automatico (piano)',
      bpModeFixed: 'numero di ore fisso',
      bpModeAutoHint: 'Il piano colloca la carica nei quarti d’ora più cari fino alla prossima ricarica (conveniente dalla rete di notte o dal sole di giorno) e carica dalla rete solo se conviene nonostante le perdite. Quante ore sono dipende da carica e consumo.',
      schText: 'Piano: carica {kwh} kWh dalle {from} alle {to} (media {cp} Rp.), restituisce {dkwh} kWh nei quarti d’ora più cari (media {dp} Rp.). Vantaggio circa {chf} CHF.',
      schNoCharge: 'Piano: nessuna carica dalla rete necessaria, la carica ({dkwh} kWh) va nei quarti d’ora più cari (media {dp} Rp.).',
      schNothing: 'Piano: al momento nulla da fare.',
      ldMode: {
        normal: 'scarica',
        hold: 'mantenimento',
        charge: 'carica',
      },
      ldBand: {
        low: 'sotto 20 Rp.',
        mid: 'da 20 a 30 Rp.',
        high: 'da 30 Rp.',
      },
      bpTitle: 'Pianificazione',
      bpReserve: 'Coprire le ore di punta con la batteria (h)',
      bpReserveHint: 'Durante questo numero di ore più care delle prossime 24 ore la batteria si scarica; altrimenti mantiene la carica.',
      bpSolar: 'Nessuna carica dalla rete con il solare (kWh)',
      bpSolarHint: 'Se il sole porta almeno questa quantità nelle prossime 24 ore, nessuna carica dalla rete (0 = carica sempre).',
      spreadLabel: 'Guadagno minimo per kWh (Rp.)',
      spreadHint: 'La batteria carica dalla rete solo se ogni kWh caricato e usato più tardi fa risparmiare almeno questo importo. Qui rientra l’usura della batteria: prezzo della batteria ÷ (capacità × cicli), ad esempio 7000 CHF ÷ (13,8 kWh × 6000) = 8,5 Rp. Il rendimento viene calcolato in aggiunta. Più alto = carica meno spesso, solo con grande differenza di prezzo. 0 = l’usura non viene calcolata.',
      bufLabel: 'Margine',
      bufAutoNow: 'Automatico (ora {pct} %)',
      bufFixed: 'valore fisso (%)',
      bufFixedNow: 'valore fisso',
      bufHint: 'Il piano tiene in riserva questa quantità di carica nel caso in cui la casa consumi più del previsto. Più margine = più sicuro, ma un po’ più di carica dalla rete.',
      bufInfoAuto: 'Ora {pct} % ({kwh} kWh): è di quanto la casa ha consumato in più del previsto {where} in 3 giorni su 4 ({days} giorni misurati).',
      bufInfoWait: 'Ancora nessuna misura ({days} giorni su {needed}): nel frattempo {pct} % ({kwh} kWh).',
      bufInfoFixed: 'Fisso {pct} % ({kwh} kWh).',
      bufEvening: 'la sera',
      bufMorning: 'la mattina',
      bpBridge: 'Coprire la mattina',
      bpBridgeHint: 'Anche con molto sole, carica quanto serve per le ore care fino a quando la produzione solare subentra.',
      bpLoad: 'Consumo fino al subentro del solare',
      bpLoadSchedule: 'Consumo della casa',
      bpDay1: '1 giorno',
      bpDays: '{n} giorni',
      bpEvening: 'sera {kw} kW',
      bpLoadAuto: 'automatico (appreso)',
      bpLoadFixed: 'valore fisso (kW)',
      bpFloor: 'Non scaricare sotto (%)',
      backupTitle: 'Riserva di emergenza',
      backupSoc: 'Riserva (%)',
      backupHint: 'Mantiene almeno questo livello di carica, caricando dalla rete se necessario, indipendentemente dal prezzo. Si attiva o disattiva con l’interruttore sotto «Oggi» o con un Flow, mai automaticamente.',
      backupActive: 'Attiva: mantiene almeno {soc} %, carica dalla rete se necessario',
      backupRow: 'Riserva di emergenza',
      backupRowOn: 'Attiva – mantiene almeno {soc} %',
      backupRowOff: 'Disattivata',
      bpLearned: 'Appreso: {kw} kW al mattino (media dalle 05 alle 10, {days}). La gestione dell’energia misura continuamente il consumo della casa e conserva la media di ogni quarto d’ora degli ultimi 7 giorni. Una mattina fredda con la pompa di calore pesa più di una mite.',
      bpLearning: 'Apprendimento in corso: ancora nessuna misura. Nel frattempo vengono usati {kw} kW.',
      brTitle: 'Coprire la mattina',
      brCharge: 'carica {kwh} kWh fino al {soc} % alle {at}. Motivo: caro dalle {from} alle {to}, il solare subentra dalle {sun}. Servono {need} kWh ({load} kW {how}), disponibili {have} kWh.',
      brEnough: 'non necessario, la carica basta (servono {need} kWh per {from}–{to}, disponibili {have} kWh).',
      brUnprofitable: 'non conviene: caricare costerebbe di più, perdite incluse, delle ore care ({from}–{to}).',
      brNoGap: 'non necessario, non ci sono ore care prima del sole (dalle {sun}).',
      brNoSun: 'nessun sole in vista.',
      brOff: 'al momento non necessario: il limite solare non vale, carica normale dalla rete.',
      brHowLearned: 'appreso',
      brHowFixed: 'fisso',
      batCtlPower: 'Potenza di carica dalla rete (kW)',
      batCtlTarget: 'Livello di carica obiettivo dalla rete (%)',
      batCtlNormal: 'Potenza di scarica normale (W)',
      batCtlRepeat: 'Ripeti il comando ogni (min)',
      batModeCharge: 'Carica',
      batModeHold: 'Mantenimento',
      batModeNormal: 'Normale',
      batRow: 'Batteria',
      batRowNone: 'ancora nulla inviato',
      batSent: 'ultimo',
      logTitle: 'REGISTRO',
      logNone: 'Ancora nessuna voce.',
      logAll: 'Tutto',
      logCar: 'Auto',
      logWallbox: 'Wallbox',
      logBat: 'Batteria',
      logCons: 'Dispositivi',
      logFuse: 'Allacciamento',
      logMore: 'Mostra di più',
      logLess: 'Mostra meno',
      logToday: 'Oggi',
      logYesterday: 'Ieri',
      secCar: 'AUTO',
      secWallbox: 'WALLBOX',
      secBat: 'BATTERIA DOMESTICA',
      carWaiting: 'I dati arrivano con il prossimo ciclo',
      autoCharge: 'Carica automaticamente',
      autoChargeOff: 'Disattivo: la wallbox funziona come prima (app propria o Flow)',
      autoChargeNoCar: 'Nessuna auto collegata',
      cnLimit: 'Limite',
      cnNone: 'fino allo scollegamento',
      cnNoneManual: 'fino alla disattivazione',
      cnSoc: 'fino al livello di carica (%)',
      cnKwh: 'fino all’energia (kWh)',
      cnUntil: 'fino a',
      cnNow: 'adesso',
      cnLoaded: 'caricato',
      cnHint: 'La carica immediata carica a piena potenza indipendentemente dal prezzo e si spegne da sola al limite.',
      logCmdOnly: 'solo commutazioni',
      logAllSim: 'Modalità silenziosa: tutte le voci sono simulate.',
      logOnWord: 'acceso',
      logOffWord: 'spento',
      logStartWord: 'avviato',
      logTestTag: 'simulato',
      maxConsumers: 'Al massimo 8 consumatori controllati. Rimuovine uno o tieni gli altri solo come contatori dei costi (senza dispositivo da commutare).',
      srcCar: 'Auto',
      whyCar: 'Facoltativo, consigliato con una wallbox. Con il livello di carica dell’auto (dall’app della tua auto) puoi pianificare attività come «livello di carica obiettivo entro un orario». Senza, tutto continua a funzionare, e indichi l’energia in kWh.',
      carCap: 'Capacità della batteria dell’auto (kWh)', carFallback: 'Senza livello di carica: energia per partenza (kWh)', carFallbackH: 'Per le auto che non comunicano il loro livello di carica a Homey. L’app carica allora questa quantità di energia nei quarti d’ora più convenienti prima di ogni partenza del modello settimanale. Quanto già caricato dal collegamento viene detratto. Il livello di carica obiettivo in % allora non vale. 0 = disattivato, l’auto carica allora solo con l’energia solare o con «Carica ora». Se l’auto comunica un livello di carica, vale sempre il livello di carica.',
      carSocLbl: 'Auto',
      carNow: 'Auto adesso',
      pvTargetSoc: 'Livello di carica obiettivo (%, invece dell’energia)',
      pvNeedCarSoc: 'Il livello di carica dell’auto è sconosciuto (Setup → Auto)',
      pvNeedCarCap: 'Manca la capacità della batteria dell’auto (Setup → Auto)',
      pvReachedAlready: 'L’auto ha già raggiunto il livello di carica obiettivo',
      pvSocFrom: 'da',
      pvSocTo: 'a',
      pvDayStrip: 'Anteprima sulla giornata',
      cmdT: {
        'battery.charge': 'Batteria: carica dalla rete',
        'battery.hold': 'Batteria: mantenere (non scaricare)',
        'battery.normal': 'Batteria: funzionamento normale',
        'charger.start': 'Wallbox: avvia la carica',
        'charger.set': 'Wallbox: imposta la potenza di carica',
        'charger.stop': 'Wallbox: ferma la carica',
        'sgready.normal': 'SG Ready: funzionamento normale',
        'sgready.boost': 'SG Ready: raccomandazione (boost)',
        'sgready.forced': 'SG Ready: carica forzata',
        'dhw.program': 'Acqua calda: programma attivo',
        'dhw.normal': 'Acqua calda: ritorno alla normalità',
        'dhw.delay': 'Acqua calda: ritardare',
      },
      cmdTest: 'Prova',
      cmdTestFail: 'Comando non riuscito:',
      cmdTestWhy: 'Con «Prova» dai il comando una volta a mano, anche in modalità test, per controllare il tuo Flow (valori prudenti: la batteria non riceve alcun ordine di carica sopra il livello attuale).',
      cmdLabel: 'Ricette di Flow',
      cmdRow: 'Comandi dell’app ai tuoi dispositivi',
      cmdTagsLbl: 'Tag',
      cmdFlowOk: 'Flow trovato',
      cmdFlowMissing: 'Nessun Flow',
      cmdFlowOff: 'Il Flow è disattivato',
      cmdFlowBroken: 'Il Flow è difettoso',
      cmdFlowEmpty: 'Flow senza azione',
      ctrlMissing: 'Controllo mancante',
      devMissing: 'Dispositivo mancante',
      refTitle: 'Dispositivi o Flow eliminati',
      refWhy: 'Questi dispositivi o Flow non esistono più in Homey. L’app continua a funzionare senza di essi. Scegli un nuovo dispositivo o rimuovi il riferimento.',
      refRemove: 'Rimuovi il riferimento',
      refRemoveConsumer: 'Rimuovi il consumatore',
      refRecheck: 'Controlla di nuovo',
      refChecking: 'Controllo …',
      refBadgeDev: 'Dispositivo eliminato',
      refBadgeFlow: 'Flow eliminato',
      refBadgeCap: 'Capability mancante',
      refBadgeMix: 'Riferimento mancante',
      refArea: {
        grid: 'Contatore di rete',
        pv: 'Inverter FV',
        house: 'Consumo della casa',
        battery: 'Batteria',
        charger: 'Wallbox',
        car: 'Auto',
        forecast: 'Previsione FV',
        consumer: 'Consumatore',
        fuse: 'Protezione dell’allacciamento',
        sgready: 'SG Ready',
        dhw: 'Acqua calda',
      },
      refField: {
        sensor: 'Sensore',
        mode: 'Modalità',
        feedback: 'Riscontro',
        relay: 'Relè',
        forceRelay: 'Relè di forzatura',
        heating: 'Campo di stato',
        target: 'Setpoint',
        output: 'Uscita',
        meter: 'Contatore',
        shed: 'Dispositivo da spegnere',
        shedFlow: 'Flow di spegnimento',
        accu: 'Sensore batteria',
        humidity: 'Sensore di umidità',
        flowOn: 'Flow acceso',
        flowOff: 'Flow spento',
        flowNormal: 'Flow normale',
        flowBoost: 'Flow raccomandazione',
        flowForced: 'Flow forzatura',
        flowDelay: 'Flow ritardo',
      },
      refProblem: {
        device: 'Dispositivo eliminato',
        flow: 'Flow eliminato',
        capability: 'Capability mancante',
      },
      cmdSending: 'invio …',
      cmdSent: 'Comando inviato',
      cmdChecked: 'Flow controllati',
      cmdCheck: 'Controlla di nuovo i Flow',
      cmdChecking: 'Controllo dei Flow …',
      cmdCheckFail: 'Impossibile controllare i Flow',
      cmdSummary: 'con un Flow',
      cmdWhyCheck: 'Il punto indica se un Flow attivo attende il comando (trigger «La gestione dell’energia dà un comando»).',
      cmdIntro: 'L’app non commuta da sola altri dispositivi: Homey non permette alle app di eseguire le card di altri dispositivi. Dà invece dei comandi. Crea un Flow per comando: QUANDO «La gestione dell’energia dà il comando …», ALLORA la card del tuo dispositivo (di qualsiasi marca). I valori sono disponibili come tag. I comandi vengono emessi solo in modalità reale; in modalità test vengono solo registrati.',
      cmdWhere: 'Nuovo Flow, QUANDO, app «Gestione dell’energia», card «La gestione dell’energia dà un comando», scegli il comando.',
      cmdFires: 'L’app dà:',
      cmdNone: 'Nessun comando (ancora nulla configurato).',
      cmdOn: 'accendere',
      cmdOff: 'spegnere',
      cmdShed: 'Protezione',
      cmdHint_battery: 'Carica: card della tua batteria «carica dalla rete» con [power] e [target_soc]. Mantenimento: ferma la carica e imposta a 0 la potenza di scarica massima. Normale: ferma la carica, modalità di funzionamento autoconsumo, potenza di scarica massima a [discharge].',
      cmdHint_charger: 'Imposta la potenza di carica: card della tua wallbox con [power] (watt). Avvia la carica e ferma la carica: le card corrispondenti della wallbox.',
      cmdHint_consumer: 'Accendi o spegni il dispositivo con la sua card, oppure avvia uno dei tuoi Flow (azione «Avvia Flow»).',
      cmdHint_sgready: 'Imposta la modalità della tua pompa di calore (SG Ready) con la card corrispondente o commuta i relè.',
      cmdHint_dhw: 'Programma attivo: alza il setpoint dell’acqua calda. Ritorno alla normalità: ripristina il setpoint. Ritardare: abbassa il setpoint. Il valore «setpoint dell’acqua calda» è solo un tag del trigger «Il setpoint dell’acqua calda deve essere impostato».',
      cmdHint_shed: 'Spegni il dispositivo che la protezione dell’allacciamento deve spegnere.',
      ctrlKind: 'Commuta tramite',
      ctrlViaDevice: 'Dispositivo (acceso/spento)',
      ctrlViaFlow: 'Comando a un Flow (acceso e spento)',
      assumedW: 'Potenza del consumatore (W, per il calcolo dell’eccedenza)',
      pvReached: 'raggiunto',
      pvReachedSoFar: 'raggiunto finora',
      pvForecastLeg: 'Previsione',
      planTable: 'DA ADESSO: COSA SUCCEDE E QUANDO',
      planColTime: 'Ora',
      planColWhat: 'Cosa succede',
      planColPrice: 'Media Rp.',
      planNothing: 'Non ci sono ancora dati sui prezzi per le prossime ore.',
      planTablePrices: 'DA ADESSO: PREZZI',
      planColLevel: 'Livello di prezzo',
      planShortCharge: 'carica',
      planShortHold: 'mantenimento',
      planShortSolar: 'solare',
      planShortFull: 'piena',
      planTableHint: '= previsto, altrimenti funziona già così.',
      planChSolar: 'carica (solare)',
      planChFull: 'carica (piena potenza)',
      planTag: 'previsto',
      calcTitle: 'CALCOLO',
      calcRow: 'Intervallo di calcolo',
      calcAuto: 'Automatico',
      calcEvery: 'Ogni',
      calcSecs: 's',
      calcOptAuto: 'Automatico (15 s con un’auto, 30 s con consumatori, altrimenti 5 min)',
      calcOpt15: 'Ogni 15 secondi',
      calcOpt30: 'Ogni 30 secondi',
      calcOpt60: 'Ogni minuto',
      calcOpt300: 'Ogni 5 minuti',
      notifyTitle: 'NOTIFICHE', notifyRow: 'Timeline', notifyOn: 'Notifiche importanti nella timeline', notifyOnS: 'attivo', notifyOffS: 'disattivo', notifyH: 'Scrive solo ciò che devi sapere, una volta per evento: errori (ad es. wallbox o contatore non leggibile, comando della batteria non riuscito, arresto di sicurezza), spegnimento da parte della protezione dell’allacciamento, pompa di calore che non segue (stato SG Ready o setpoint dell’acqua calda) e dispositivi o Flow eliminati (al massimo una volta al giorno). Gli eventi quotidiani come i cambi della batteria o gli avvii non vanno nella timeline, per questo ci sono i trigger Flow.', calcLabel: 'Wallbox e consumatori calcolano',
      calcTick: 'Piano della batteria ogni (minuti)',
      calcDevices: 'dispositivi letti',
      calcCalls: 'richieste all’ora',
      calcAutoImpact: 'A seconda della situazione: a riposo 5 min, con consumatori 30 s, con un’auto alla wallbox 15 s.',
      calcImpact: 'Più breve: reagisce più rapidamente a nuvole e variazioni di carico, ma sollecita di più Homey (un numero molto elevato di richieste può raggiungere il limite di Homey). Più lungo: più calmo e più delicato, ma il sistema reagisce più lentamente e parte dell’eccedenza va alla rete. I tempi di mantenimento e di tolleranza (in secondi) agiscono solo al ritmo del calcolo.',
      calcTickHint: 'Il piano della batteria (solo come confronto) si calcola a questo ritmo, da 1 a 15 minuti. I prezzi cambiano solo ogni 15 minuti.',
      pvTitle: 'ANTEPRIMA: PIANIFICARE UN’ATTIVITÀ',
      pvIntro: 'Indica cosa deve succedere e per quando. L’anteprima mostra in quali quarti d’ora avverrebbe. Nulla viene salvato e nulla viene commutato.',
      pvDevice: 'Dispositivo',
      pvUntil: 'Terminato entro',
      pvKwh: 'Energia (kWh)',
      pvHours: 'Durata di funzionamento (h)',
      pvPower: 'Potenza (kW, facoltativa, vuoto = automatica)',
      pvMaxPrice: 'Prezzo massimo (Rp./kWh, facoltativo, vuoto = qualsiasi)',
      pvBlock: 'funzionare in un unico blocco',
      pvRun: 'Anteprima',
      pvClear: 'Reimposta',
      pvPreviewLbl: 'anteprima',
      pvRunsFrom: 'Funziona dalle',
      pvTo: 'alle',
      pvIn: 'in',
      pvQuarters: 'quarti d’ora tra',
      pvAvg: 'Media',
      pvCost: 'Costo circa',
      pvNeedAmount: 'Inserisci una quantità',
      pvBadTime: 'Orario non valido',
      pvRepeat: 'Ripeti',
      pvRep: {
        once: 'una volta',
        daily: 'ogni giorno',
        weekdays: 'lun.–ven.',
        weekend: 'sab. e dom.',
      },
      pvRepeatSoc: 'Un livello di carica obiettivo vale una sola volta. Uguale ogni settimana: modello settimanale sotto «Auto».',
      pvRepeatHint: 'Ricorrente: pianificato nelle 24 ore prima della scadenza.',
      pvR_prices_missing: 'Non tutti i prezzi sono ancora noti per questa scadenza',
      pvR_too_expensive: 'Non ci sono abbastanza quarti d’ora sotto il prezzo massimo',
      pvR_too_short: 'Non c’è abbastanza tempo fino ad allora',
      pvR_no_block: 'Non c’è un blocco continuo sotto il prezzo massimo',
      pvR_deadline_passed: 'La scadenza è già passata',
      pvHave: 'possibile',
      pvOf: 'di',
      pvSave: 'Applica',
      pvJobs: 'ATTIVITÀ ATTIVE',
      pvJobWord: 'attività',
      pvRemove: 'Rimuovi',
      pvUntilShort: 'entro',
      pvRunningNow: 'in corso',
      pvPlannedAt: 'previsto',
      pvWaiting: 'in attesa dei prezzi',
      pvProgress: 'quarti d’ora eseguiti',
      pvJobNote: 'Le attività vengono ripianificate a ogni ciclo con i prezzi attuali. In modalità silenziosa sono solo simulate.',
      pvSaveFailed: 'Impossibile salvare',
      pvSavedOk: 'Attività applicata',
      setupReady: 'Pronto: tutte le fonti necessarie sono state scelte',
      setupMissing: 'Manca ancora:',
      setupNoBat: 'Senza batteria domestica la gestione dell’energia funziona comunque: wallbox e consumatori caricano con l’eccedenza. Le modalità in base al livello della batteria non sono allora possibili.',
      prioRow: 'Priorità (ordine per l’eccedenza)',
      prioUp: 'su',
      prioDown: 'giù',
      prioTag: 'Priorità {n}',
      prioWhy: 'Per «Con eccedenza»: il dispositivo più in alto parte per primo e si spegne per ultimo. Ne parte solo uno per misurazione, così l’eccedenza non viene pianificata due volte. L’ordine viene applicato con «Salva».',
      suggestedTag: 'Suggerito',
      suggest: 'Suggerisci automaticamente',
      suggested: 'Suggerimenti compilati:',
      nothingSuggested: 'Nulla di adatto trovato',
      tagRequired: 'Obbligatorio',
      tagRecommended: 'Consigliato',
      tagOptional: 'Facoltativo',
      tagAuto: 'Automatico',
      notChosen: 'non scelto',
      device: 'Dispositivo',
      value: 'Valore',
      pick: '- scegli un dispositivo -',
      none: '- nessuno -',
      pickFirst: '- scegli prima un dispositivo -',
      fuseOutTabTitle: 'ALLACCIAMENTO: PREVISIONE 24 ORE',
      fuseOutWhy: 'Prelievo dalla rete previsto se tutto ciò che è pianificato funziona contemporaneamente: consumo appreso della casa più piano della batteria, auto e attività pianificate, meno il solare. I consumatori che seguono l’eccedenza funzionano con il sole e non sono inclusi. Ipotesi: ripartito in modo uniforme sulle tre fasi; un dispositivo monofase sulla fase sbagliata può raggiungere il limite prima.',
      fuseOutPeak: 'Picco di {kw} kW alle {time}: {pct} % del limite ({limit} kW)',
      fuseOutOk: 'ok',
      fuseOutTight: 'al limite',
      fuseOutOver: 'oltre il limite',
      fuseOutHouse: 'Casa',
      fuseOutNone: 'Ancora nessun profilo di consumo: la previsione compare non appena l’app ha appreso il consumo della casa.',
      fuseTitle: 'ALLACCIAMENTO',
      fuseRow: 'Protezione dell’allacciamento',
      fuseOff: 'disattivata',
      fuseOn: 'Proteggi l’allacciamento',
      fuseWhy: 'Mantiene ogni fase sotto il limite del fusibile principale: prima la wallbox viene limitata; se non basta, i dispositivi qui sotto vengono spenti uno dopo l’altro.',
      fuseAmps: 'Fusibile principale (A)',
      fuseReserve: 'Riserva (% del fusibile)',
      fuseLimitLbl: 'Limite',
      fusePerPhase: 'per fase',
      fuseMeter: 'Contatore con correnti di fase',
      fuseMeterGrid: 'uguale al contatore di rete',
      fusePhase: 'Fase',
      fuseThrottle: 'Limita la wallbox in modo che nessuna fase superi il limite',
      fuseThrottleHint: 'La wallbox riceve al massimo la corrente ancora libera sulla fase più carica. Vale quando la gestione dell’energia controlla la wallbox.',
      fuseHold: 'Attendere prima di spegnere (s)',
      fuseRestore: 'Rilascia dopo (min sotto il limite)',
      fuseShedTitle: 'IN CASO DI SOVRACCARICO SPEGNERE IN QUESTO ORDINE',
      fuseShedNone: 'Nessun dispositivo selezionato.',
      fuseAdd: 'Aggiungi',
      fuseAddPick: '- scegli un dispositivo o un Flow -',
      fuseHowTitle: 'Come spegnere?',
      fuseAutoLbl: 'Automatico',
      fuseAutoOnoff: 'Rilevato automaticamente: capability acceso/spento.',
      fuseAutoThermostat: 'Rilevato automaticamente: modalità termostato impostata su «spento».',
      fuseAutoNone: 'Nessuna capability adatta rilevata – scegli un Flow.',
      fuseAutoCharger: 'Automatico: la sessione di carica viene interrotta.',
      fuseUp: 'su',
      fuseDel: 'Rimuovi',
      fuseFlow: 'Flow',
      fuseLive: 'Protezione in modalità reale (altrimenti solo simulazione)',
      fuseLiveHint: 'In modalità reale la protezione spegne davvero i dispositivi selezionati. La modalità silenziosa ha la precedenza. Disattiva prima i rami corrispondenti nei tuoi Flow, così commuta un solo sistema.',
      tgtSource: 'Temperatura obiettivo',
      tgtManual: 'Fissa',
      tgtDevice: 'Dalla pompa di calore (setpoint ACS)',
      tgtDev: 'Dispositivo e valore (setpoint ACS della pompa di calore)',
      tgtTol: 'Tolleranza sotto il setpoint ACS (K)',
      tgtHyst: 'Isteresi della pompa di calore (K, facoltativa)',
      tgtHystH: 'La pompa di calore interrompe il riscaldamento dell’ACS solo al setpoint ACS PIÙ l’isteresi (parametro «Isteresi», P32 sotto ACS/parametri). Questo valore non può essere letto via Modbus: inseriscilo a mano. 0 = ignora.',
      tgtSrcH: 'La pompa di calore riscalda da sola solo fino al suo setpoint ACS (più l’isteresi), poi si ferma. Un obiettivo fisso più alto non viene mai raggiunto. «Dalla pompa di calore» termina al setpoint ACS più l’isteresi meno la tolleranza. Sopra circa 50 °C interviene la resistenza elettrica.',
      tgtTolH: 'Termina non appena l’acqua calda raggiunge il setpoint ACS meno questa tolleranza (il sensore ha un leggero ritardo).',
      tgtFallback: 'Obiettivo di riserva se il setpoint ACS non è leggibile (°C)',
      tgtFallbackH: 'Usato solo quando il valore della pompa di calore non può essere letto al momento.',
      dhwHeating: 'La pompa di calore prepara l’acqua calda (campo di stato, facoltativo)',
      dhwHeatingH: 'Dispositivo e proprietà che indicano che la pompa di calore sta preparando l’acqua calda da sola (ad esempio «Riscaldamento ACS»). Finché è così, il programma non parte (nemmeno a mano) e il ritardo non viene avviato, perché abbassare il setpoint interromperebbe il ciclo in corso. Vuoto = nessun controllo.',
      dhwHeatingOk: 'Valore per «prepara» (ad esempio true)',
      dhwModeProgram: 'Modalità di funzionamento durante il programma (facoltativa, ad es. ACS)',
      dhwModeProgramH: 'Necessaria solo se il programma commuta da sé la modalità di funzionamento della pompa di calore (ad esempio un Flow di modalità di funzionamento su «ACS»). Inserisci allora il valore che il dispositivo riporta in quella modalità, così il controllo «Controlla solo a questo valore» non scambia la nostra commutazione per una modifica esterna e non interrompe il ciclo. Se la modalità di funzionamento resta la stessa durante il programma (setpoint ACS tramite card, trigger o Flow), lascia il campo vuoto. In modalità ACS il riscaldamento è spento; dopo deve tornare in automatico.',
      dhwMaxRun: 'Durata massima (min)',
      dhwMaxRunH: 'Limite di sicurezza: poi viene riportato alla normalità (la modalità ACS spegne il riscaldamento). 0 = illimitata.',
      dhwTitle: 'PROGRAMMA ACQUA CALDA A PREZZO CONVENIENTE',
      dhwRow: 'Programma acqua calda',
      dhwOff: 'disattivato',
      dhwRunning: 'in corso',
      dhwWaiting: 'in attesa',
      dhwOnLbl: 'Avvia il programma acqua calda a prezzo conveniente',
      dhwWhy: 'Indipendente da SG Ready: se rientra nelle ore più convenienti della giornata e l’acqua calda è sotto il minimo, parte il programma acqua calda della pompa di calore (Flow o funzione dell’app) e poi viene riportato alla normalità. Finché SG Ready è in funzione, il programma non parte (e viceversa).',
      dhwCheapHours: 'Ore più convenienti al giorno (h)',
      dhwCheapH: 'Il programma parte durante le N ore più convenienti della giornata (in base ai prezzi al quarto d’ora del giorno). L’anteprima mostra quando sarebbe oggi e domani.',
      dhwPreview: 'Anteprima',
      dhwToday: 'Oggi',
      dhwTomorrow: 'Domani',
      dhwAvg: 'media',
      dhwNoPrices: 'Anteprima: ancora nessun prezzo per oggi.',
      dhwBelow: 'Avvia solo sotto acqua calda (°C)',
      dhwBelowH: 'Solo se l’acqua calda è sotto questo valore (0 = sempre). Senza misura della temperatura non parte.',
      dhwSkipPv: 'Non avviare se il sole basta',
      dhwSkipPvKwh: 'Il sole basta dalla previsione (kWh, resto di oggi)',
      dhwSkipUntil: 'La previsione solare conta fino alle',
      dhwSkipPvH: 'Partire in base al prezzo non ha senso se oggi il sole fornirà ancora abbastanza (previsione residua).',
      dhwSkipUntilH: 'Fino a quest’ora conta la previsione solare; dopo può avviare il prezzo.',
      dhwTarget: 'Termina a acqua calda (°C)',
      dhwTargetH: 'Quando l’acqua calda raggiunge questa temperatura, il programma viene riportato alla normalità. Il vero obiettivo si imposta nella pompa di calore stessa.',
      dhwMinRunH: 'Una volta avviato, il programma funziona almeno per questo tempo. Solo temperatura obiettivo, modalità di funzionamento o sole (SG Ready) lo terminano prima.',
      dhwLive: 'Programma acqua calda in modalità reale (altrimenti solo simulazione)',
      dhwLiveHint: 'In modalità reale avvia davvero il programma. La modalità silenziosa ha la precedenza. Disattiva prima un Flow esistente, così commuta un solo sistema.',
      hpBoss: 'Importante: la pompa di calore resta al comando, indipendentemente da queste impostazioni. L’app dà solo segnali e setpoint (raccomandazione SG Ready, setpoint dell’acqua calda). Se e come la pompa di calore riscalda lo decide esclusivamente la sua regolazione con isteresi, funzioni di protezione e blocco dell’azienda elettrica. Questo programma è per utenti avanzati: se vuoi qualcosa di più semplice, usa solo SG Ready con il sole, oppure costruisci la logica da solo con Flow avanzati (l’app fornisce i trigger «Comando» e «Il setpoint dell’acqua calda deve essere impostato»).',
      sgTitle: 'BOILER / POMPA DI CALORE (SG READY)',
      sgRow: 'Controllo SG Ready',
      sgOff: 'disattivato',
      sgOn: 'Controlla SG Ready',
      sgWhy: 'Commuta la raccomandazione di accensione della pompa di calore (0:1) quando sole o batteria piena finanziano l’acqua calda. Il funzionamento normale (0:0) è lo stato di base. Il prezzo conveniente ha una sezione propria più sotto.',
      sgBasis: 'Base di controllo',
      sgBasisPv: 'Potenza solare (produzione FV)',
      sgBasisExport: 'Immissione in rete',
      sgBasisH: 'Potenza solare = ciò che produce il FV (utile con una batteria domestica che altrimenti assorbirebbe l’eccedenza). Immissione in rete = ciò che va nella rete.',
      sgMinSolar: 'Potenza solare minima per partire (W)',
      sgMinSolarH: 'Il boost può partire da questa potenza.',
      sgMinSoc: 'Batteria domestica minima per partire (%)',
      sgMinSocH: 'La batteria domestica deve essere almeno così piena prima che la pompa di calore riceva la corrente. Ignorato senza batteria.',
      sgHyst: 'Tolleranza della batteria durante il mantenimento (%)',
      sgHystH: 'Dopo la durata minima di funzionamento la batteria può scendere di altrettante percentuali sotto la soglia di avvio senza terminare il boost (assorbe le brevi nuvole).',
      sgTemp: 'Termina il boost a acqua calda (°C)',
      sgTempH: 'Quando l’acqua calda raggiunge questa temperatura, il controllo torna al funzionamento normale. Il vero obiettivo si imposta nella pompa di calore stessa (non leggibile).',
      sgTo: 'Orario di avvio più tardo (sole)',
      sgToH: 'Dopo quest’ora non parte più alcun nuovo boost a causa del sole. Il trigger del prezzo ne è indipendente.',
      sgStartDelay: 'Ritardo di accensione (min)',
      sgStartDelayH: 'Le condizioni di avvio devono essere soddisfatte per così tanto tempo di fila prima che il boost parta (evita di accendere per brevi picchi di sole).',
      sgMinRun: 'Durata minima di funzionamento (min)',
      sgMinRunH: 'Una volta avviato, il boost funziona almeno per questo tempo, anche con le nuvole. Solo temperatura obiettivo o modalità di funzionamento lo terminano prima.',
      sgStopDelay: 'Ritardo di spegnimento (min)',
      sgStopDelayH: 'Se le condizioni peggiorano dopo la durata minima di funzionamento, attende così a lungo prima di tornare al funzionamento normale.',
      sgCooldown: 'Pausa dopo la fine (min)',
      sgCooldownH: 'Pausa dopo la fine di un boost prima che ne possa partire uno nuovo.',
      sgDhwOut: 'Imposta il programma acqua calda tramite',
      sgDhwFlows: 'Flow (attivo / ritorno alla normalità, ad es. setpoint ACS via Modbus)',
      sgDhwCap: 'Funzione dell’app (capability di un dispositivo)',
      sgDhwOn: 'Flow programma acqua calda attivo',
      sgDhwOff: 'Flow ritorno alla normalità',
      sgDhwDev: 'Dispositivo e capability della funzione dell’app',
      sgDhwOnV: 'Valore per attivo',
      sgDhwOffV: 'Valore per ritorno alla normalità',
      sgDhwH: 'Valori come testo, true/false per gli interruttori. Alla fine viene riportato alla normalità, ma solo se il controllo ha avviato lui stesso il programma.',
      sgPvBelow: 'Avvio solare solo sotto acqua calda (°C)',
      sgPvBelowH: 'Facoltativo: anche con il sole, avvia solo se l’acqua calda è sotto questo valore (0 = sempre, predefinito).',
      sgForced: 'Consenti la carica forzata (1:1)',
      sgForcedW: 'Soglia di carica forzata (W)',
      sgForcedH: 'Stato 1:1, spesso con una resistenza elettrica e un consumo elevato. Solo dal boost e solo da questa potenza solare. Disattivato per impostazione predefinita.',
      sgSensor: 'Temperatura dell’acqua calda (dispositivo e valore)',
      sgSensorH: 'Il valore reale dell’acqua calda della pompa di calore, così il boost termina alla temperatura obiettivo.',
      sgMode: 'Modalità di funzionamento della pompa di calore (dispositivo e valore, facoltativa)',
      sgModeOk: 'Controlla solo a questo valore (ad es. Automatico)',
      sgModeH: 'Il controllo agisce solo quando la modalità di funzionamento ha questo valore. Non in vacanza, comfort o standby. Lasciare vuoto = nessun controllo.',
      sgFeedback: 'Prendi lo stato dalla pompa di calore (dispositivo e valore, facoltativo)',
      sgFeedbackH: 'Legge lo stato SG Ready della pompa di calore (ad es. 2 NORMAL), lo mostra nel widget e avvisa se non corrisponde dopo la commutazione. Vuoto = solo stato proprio.',
      sgOutput: 'Come vengono impostati gli stati?',
      sgOutRelays: 'Due relè (attuatori di commutazione)',
      sgOutFlows: 'Flow (un Flow per stato, ad es. Modbus)',
      sgOutH: 'Relè: normale (0:0) = entrambi spenti. Raccomandazione (0:1) = il relè raccomandazione è acceso e chiude il secondo contatto SG. Forzato (1:1) = è acceso anche il relè carica forzata, che chiude il primo contatto. La notazione significa contatto 1 : contatto 2, 1 = chiuso. Il nome dei morsetti della tua pompa di calore (ad es. SG1/SG2 o EVU/SG) è indicato nel suo manuale. L’app non imposta mai lo stato 1:0 (blocco da parte del gestore di rete), nemmeno per un attimo durante la commutazione. Flow: un Flow per stato, ad es. scrittura di registri Modbus.',
      sgSetupH: 'Collegamento e pompa di calore: usa solo contatti a potenziale zero e non mettere mai la tensione di rete sugli ingressi SG. Il collegamento lo esegue un elettricista qualificato. Imposta i relè in modo che dopo un’interruzione di corrente siano spenti: la pompa di calore continua così in funzionamento normale. SG Ready deve essere attivato nel menu della pompa di calore. Spesso è lì che si imposta anche di quanti gradi in più riscalda in 0:1 e 1:1. Alcune pompe di calore reagiscono solo dopo alcuni minuti, per questo c’è una durata minima di funzionamento. Con « Prendi lo stato dalla pompa di calore » vedi se ha riconosciuto il segnale.',
      sgRecRelay: 'Relè raccomandazione (0:1)',
      sgForceRelay: 'Relè carica forzata (solo 1:1)',
      sgFlowNormal: 'Flow funzionamento normale (0:0)',
      sgFlowBoost: 'Flow raccomandazione (0:1)',
      sgFlowForced: 'Flow carica forzata (1:1)',
      sgLive: 'SG Ready in modalità reale (altrimenti solo simulazione)',
      sgLiveHint: 'In modalità reale il controllo commuta davvero. La modalità silenziosa ha la precedenza. Disattiva prima il tuo Flow precedente, così commuta un solo sistema.',
      sgState: {
        off: 'Funzionamento normale (0:0)',
        boost: 'Raccomandazione (0:1)',
        forced: 'Carica forzata (1:1)',
        dhw: 'Programma acqua calda',
      },
      tips: {
        mode: 'Quando funziona il dispositivo: con l’eccedenza, con una batteria piena, da un livello di carica o come programma con un solo avvio.',
        fullSoc: 'Accendere non appena la batteria domestica è almeno così piena.',
        socOn: 'Accendere non appena la batteria domestica ha almeno questo livello di carica.',
        hysteresis: 'Si spegne solo quando il livello di carica scende di altrettanti punti percentuali sotto la soglia di accensione.',
        minSurplusW: 'Questa potenza deve fluire verso la rete prima che il dispositivo si accenda.',
        startSustainS: 'L’eccedenza deve durare così a lungo di fila perché brevi picchi non commutino.',
        stopGraceS: 'L’eccedenza può mancare così a lungo prima dello spegnimento (assorbe le brevi nuvole).',
        assumedW: 'Ciò che il dispositivo consuma. Un Flow non può misurarlo, quindi l’app calcola con questo valore.',
        minRunMin: 'Dopo l’accensione funziona almeno per questo tempo, anche se l’eccedenza scompare.',
        minOffMin: 'Dopo lo spegnimento resta spento almeno per questo tempo (protegge da commutazioni continue).',
        protectSoc: 'Se la batteria domestica scende sotto questo valore, il dispositivo si spegne subito, anche durante la durata minima di funzionamento.',
        useGate: 'Con una previsione solare debole nessun nuovo avvio: la batteria mantiene la carica per la sera.',
        pgSurplus: 'Da questa immissione il programma parte subito.',
        pgSustain: 'Questa eccedenza deve durare così a lungo di fila.',
        pgFrom: 'Facoltativo. Il blocco conveniente viene cercato solo a partire da quest’ora, anche se l’automatico viene attivato prima (ad esempio caricato a mezzogiorno ma avviato la sera). Vuoto: subito all’attivazione dell’automatico. Con eccedenza FV parte sempre subito.',
        pgWait: 'Per quanto tempo al massimo l’automatico attende l’eccedenza o il blocco più conveniente; poi parte comunque. All’attivazione nel widget puoi scegliere un’altra attesa, ad esempio 8 ore se attivi la sera e vuoi che parta alle 04:00.',
        pgDuration: 'Durata di funzionamento abituale. Per questo tempo dopo un avvio l’automatismo non riparte.',
        pgStartVal: 'Questo valore viene inviato alla capability di avvio (ad es. START).',
        pgRemoteVal: 'Può partire solo se il telecomando segnala questo valore.',
        pgDoorVal: 'Parte solo con questo valore dello sportello (chiuso).',
        'bp-reserve': 'La batteria tiene in riserva questo numero di ore più care della giornata invece di svuotarsi prima.',
        'bp-solar': 'Da questa quantità solare prevista (kWh oggi) non c’è carica dalla rete.',
        'bp-bridge': 'Carica dalla rete se necessario affinché la batteria duri fino all’alba.',
        'bp-floor': 'Sotto questo livello di carica la batteria non viene più scaricata.',
        'bp-backupsoc': 'Questa quantità resta nella batteria finché la riserva di emergenza è attiva.',
        'fuse-pct': 'Quota del fusibile che utilizziamo. Il resto resta come margine di sicurezza.',
        'fuse-hold': 'Un sovraccarico deve durare così a lungo prima che venga spento qualcosa.',
        'fuse-restore': 'Tutto deve restare sotto il limite così a lungo prima che la wallbox possa ricaricare.',
        'pv-factor': 'Scala la previsione FV verso l’alto o verso il basso se di solito è troppo alta o troppo bassa da te.',
      },
      fuseNoRestore: 'I dispositivi che sono stati spenti non vengono riaccesi. La wallbox può caricare di nuovo dopo il rilascio.',
      fuseNoPhases: 'Il contatore non fornisce correnti di fase. Controlla il contatore e i valori.',
      fuseNow: 'Allacciamento',
      fuseOf: 'di',
      fuseThrottled: 'Wallbox a',
      fuseShedNow: 'spento:',
      fuseEvOver: 'limite superato',
      fuseEvShed: 'spento',
      fuseEvThrottle: 'Wallbox limitata a',
      fuseEvThrottleEnd: 'Wallbox non più limitata',
      fuseEvRelease: 'rilasciato',
      srcGrid: 'Contatore di rete',
      srcPv: 'Inverter solare',
      srcHouse: 'Consumo della casa',
      srcBat: 'Batteria domestica',
      srcPrice: 'Prezzo dell’elettricità',
      srcFc: 'Previsione solare',
      whyGrid: 'Il contatore di rete è la base: prelievo positivo, immissione negativa. Senza di esso nulla può essere controllato.',
      whyPv: 'Migliora il calcolo dell’eccedenza (produzione meno consumo) e la sua ripartizione tra batteria e dispositivi.',
      whyHouse: 'Migliora il calcolo dell’eccedenza. Può essere lo stesso contatore del contatore di rete se riporta il consumo della casa.',
      whyBat: 'Facoltativo. Con una batteria ci sono livelli di protezione, il filtro di previsione e modalità in base al livello della batteria. Senza, tutto funziona con l’eccedenza.',
      whyPrice: 'Presupposto: il dispositivo dei prezzi «Tariffa elettrica dinamica CH» è configurato. I prezzi al quarto d’ora provengono automaticamente da lì, qui non c’è nulla da scegliere.',
      priceMissing: 'Dispositivo dei prezzi mancante – aggiungilo prima in Homey',
      noPriceDevice: 'La gestione dell’energia ha bisogno del dispositivo dei prezzi «Tariffa elettrica dinamica CH». Aggiungilo in Homey sotto Dispositivi → «+».',
      whyFc: 'Facoltativo. Alimenta il filtro di previsione e la vista del piano. Homey fornisce valori giornalieri (oggi, domani) che l’app distribuisce in una curva giornaliera. Più precisa: la tua previsione oraria fornita con l’azione Flow «Imposta la previsione solare».',
      fcSource: 'Fonte',
      fcSrcAuto: 'Automatica (fornita, altrimenti Homey)',
      fcSrcHomey: 'Homey (previsione energetica)',
      fcSrcDevice: 'Valori giornalieri di un dispositivo',
      fcSrcExternal: 'Solo fornita tramite azione Flow',
      fcToday: 'Valore per oggi (kWh)',
      fcTomorrow: 'Valore per domani (kWh)',
      fcFrom: 'Fonte',
      fcNames: {
        homey: 'Homey',
        device: 'dispositivo',
        external: 'azione Flow',
        fallback: 'fonte di confronto',
      },
      fcDays: 'oggi',
      fcDay2: 'domani',
      fcCurveHint: 'Un valore giornaliero diventa una curva tra alba e tramonto. È un’approssimazione senza copertura nuvolosa.',
      autoPrice: 'da questa app',
      fcNone: 'non fornita',
      fcAge: 'ultima',
      fcStale: 'obsoleta',
      fcSlots: 'voci',
      min: 'min',
      h: 'h',
      factor: 'Fattore di correzione',
      factorHint: 'Applicato a ogni valore di previsione, ad esempio 0,75 se di solito è troppo alta del 25 %.',
      wallbox: 'Wallbox',
      chargeNow: 'Carica immediata (piena potenza)',
      addConsumer: 'Aggiungi un consumatore',
      remove: 'Rimuovi',
      name: 'Nome',
      type: 'Tipo',
      ctrlDevice: 'Dispositivo da commutare',
      meterDevice: 'Contatore per i costi (kWh)',
      mode: 'Accendere',
      modeFull: 'Quando la batteria è piena',
      modeSoc: 'Dal livello della batteria',
      modeSurplus: 'Con l’eccedenza',
      modeProgram: 'Avviare un programma',
      noCtrl: 'solo contatore dei costi',
      programTitle: 'Avviare un programma',
      programWindow: 'Avvio in base al prezzo al più presto dalle (facoltativo)',
      programMaxWait: 'Attesa predefinita (h)',
      programDuration: 'Durata del programma (h)',
      programHint: 'Attivi l’automatico nel widget con l’interruttore «Auto» una volta caricata la macchina. Parte subito con eccedenza FV sufficiente. Altrimenti sceglie il blocco più conveniente della durata del programma fino alla fine dell’attesa e parte al più tardi allora (rete di sicurezza). Poi l’automatico si disattiva; riattivalo per il ciclo successivo. Quanti cicli al giorno vuoi, anche oltre la mezzanotte.',
      programStartCap: 'Capability di avvio',
      programStartVal: 'Valore di avvio',
      programRemoteCap: 'Capability del telecomando (facoltativa)',
      programRemoteVal: 'Valore del telecomando (se attivo)',
      programRemoteWarn: 'Senza una capability del telecomando l’app non controlla mai se il dispositivo può essere commutato – necessario per alcuni elettrodomestici (ad es. Electrolux).',
      programDoorCap: 'Capability dello sportello (facoltativa)',
      programDoorVal: 'Valore dello sportello «chiuso» (se scelto)',
      programStateCap: 'Capability di stato (facoltativa)',
      programStateVal: 'Valore di stato «pronto/inattivo» (se scelto)',
      programStateHint: 'Impedisce un secondo comando di avvio finché l’elettrodomestico è ancora in funzione (avviato a mano o da noi) – quale capability e quale valore significhi «pronto» dipende dal dispositivo. Lascia vuoto se l’elettrodomestico non ha nulla del genere.',
      fullSoc: 'Pieno dal SoC (%)',
      socOn: 'Attivo dal SoC (%)',
      hysteresis: 'Spegni sotto (punti sotto questo valore)',
      batFirst: 'Prima la batteria domestica fino al (%, facoltativo)',
      batFirstPh: 'come la wallbox',
      batFirstHint: 'Vuoto: come la wallbox (prima la batteria domestica fino al limite comune). Un numero: limite proprio; sopra, il dispositivo prende anche la potenza che sta fluendo nella batteria domestica. Per piccoli dispositivi (e-bike), ad es. 0.',
      minSurplus: 'Eccedenza minima (W)',
      startSustain: 'L’eccedenza deve durare (s)',
      stopGrace: 'Tolleranza prima dello spegnimento (s)',
      advanced: 'Avanzate',
      minRun: 'Durata minima di funzionamento (min)',
      minOff: 'Pausa minima (min)',
      protect: 'Proteggi il SoC: spegni subito sotto (%)',
      useGate: 'Rispetta il filtro di previsione',
      shareAt: 'Batteria dal (%)',
      shareGets: 'Quota solare (%)',
      shareLowRow: 'Limite inferiore: da qui l’auto riceve energia solare',
      shareHighRow: 'Limite superiore: da qui riceve tutta l’eccedenza',
      shareChartCap: 'Quanta energia solare riceve l’auto in base al livello della batteria',
      shareNow: 'Adesso: batteria {soc} % → l’auto riceve il {pct} % dell’energia solare.',
      shareBonusTitle: 'Bonus di previsione',
      shareVal: 'Quota solare auto {pct} %',
      wbLinkTitle: 'Collegamento della wallbox (come viene indirizzata)',
      wbLinkWhy: 'L’impostazione predefinita va bene per wallbox con le card «avvia la carica» e «imposta la potenza di carica». Per un’altra wallbox scegli cosa riporta il dispositivo e quali card Flow ha per il controllo. La potenza viene calcolata da ampere, fasi e 230 V e passata in watt alla card «imposta la potenza di carica» (stop = 0 W).',
      wbState: 'Stato di carica (capability)',
      wbPower: 'Potenza di carica (capability)',
      wbPhase: 'Fasi (capability, facoltativa)',
      wbPhaseH: 'Solo per la commutazione di fase. Valori attesi: 1 = una fase, 2 = tre fasi.',
      wbNone: '– nessuna –',
      wbStd: 'Predefinito',
      wbCustom: 'Assegnazione personalizzata',
      paLabel: 'RAPPORTO DI APPRENDIMENTO',
      paRow: 'Precisione del piano',
      paSumWait: 'Misura da {n} giorni, un giudizio da {m} giorni',
      paSumBetter: '{k} previsioni su {t} possono essere migliorate',
      paSumNone: 'I metodi attuali sono abbastanza buoni',
      paWhy: 'Misura soltanto, non cambia nulla: quanto le previsioni del pianificatore corrispondono a ciò che è realmente accaduto. Errore = scostamento in percentuale del valore misurato, più piccolo è meglio.',
      paDays: 'Giorni',
      paNow: 'metodo attuale',
      paAlt: 'Alternativa',
      paBest: 'Migliore',
      paLoadM: 'Consumo mattina 05-10',
      paLoadD: 'Consumo giornata 10-17',
      paLoadE: 'Consumo sera 17-22',
      paPvRest: 'Solare: resto della giornata dalle 10:30',
      paWait: '{n} giorni su {m} finora',
      paMean: 'media',
      paRobust: 'robusto',
      paPlain: 'invariato',
      paNowcast: 'con correzione del mattino',
      paSame: 'ugualmente buono',
      paNote: 'Consumo: «media» è il metodo attuale (media degli ultimi 7 giorni), «robusto» è la mediana dello stesso tipo di giorno (feriale/weekend), insensibile ai singoli grandi carichi. Solare: «invariato» è la previsione del resto della giornata, «con correzione del mattino» viene scalata con il rapporto misurato/previsto dalle 06:00 alle 10:30. Un metodo conta come migliore solo se il suo errore è almeno il 10 % più piccolo.',
      pvAccTitle: 'Raccomandazione in base agli ultimi giorni',
      pvAccNone: 'Non ci sono ancora abbastanza dati: {n} giorni completi su almeno {m}. Ogni mattina l’app registra la previsione del giorno e la confronta la sera con la produzione misurata.',
      pvAccRec: 'Raccomandazione: {f} (mediana di {n} giorni, per lo più tra {lo} e {hi}).',
      pvAccRecent: 'Solo gli ultimi {n} giorni: {f}.',
      pvApply: 'Applica',
      pvAuto: 'Fattore di correzione automatico',
      pvAutoH: 'Da 7 giorni completi l’app inserisce da sola il valore raccomandato nel campo una volta al giorno. Il campo mostra allora il valore attuale.',
      pvAccLog: 'Storico degli ultimi giorni',
      pvAccDay: 'Giorno',
      pvAccFc: 'Previsione senza fattore (kWh)',
      pvAccAct: 'Misurato (kWh)',
      pvAccRatio: 'Rapporto',
      pvAccToday: 'oggi',
      pvAccNote: 'Contano solo i giorni completi con almeno 2 kWh di previsione. Il rapporto è il valore misurato diviso per la previsione senza fattore.',
      dlyTitle: 'Ritardare l’acqua calda (prima FV)',
      dlyWhy: 'Facoltativo. Se l’acqua calda scende sotto la soglia di avvio della pompa di calore nella fascia oraria, il suo avvio viene rimandato (il setpoint ACS viene abbassato da un Flow) in modo che l’acqua calda venga prodotta con energia solare o nel blocco conveniente invece che con energia dalla rete al mattino. Poi il setpoint viene rilasciato di nuovo. Richiede l’uscita tramite card azione o i Flow «ritardare» e «ritorno alla normalità» (sopra).',
      dlyOn: 'Ritardare l’acqua calda',
      dlyFlow: 'Flow «abbassare il setpoint (ritardare)»',
      dlyFrom: 'Fascia oraria dalle',
      dlyTo: 'alle',
      dlyForecast: 'Abbastanza sole dalla previsione (kWh)',
      dlyForecastH: 'Previsione residua per oggi. Da questo valore la pompa di calore attende il sole (SG Ready) fino all’orario di rilascio. A novembre la previsione è spesso troppo alta, quindi meglio impostarla più bassa.',
      dlyComfort: 'Limite di comfort (°C)',
      dlyComfortH: 'Se l’acqua calda scende sotto questo valore, viene rilasciata subito (nessuno deve fare una doccia fredda). Sotto questo limite non si ritarda nulla.',
      dlyRelWd: 'Rilascio lun.–ven.',
      dlyRelWe: 'Rilascio weekend',
      dlyRelLow: 'Rilascio con poco sole',
      dlyRelLowH: 'Orario di rilascio quando la previsione è troppo bassa (e senza ottimizzazione dei prezzi).',
      dlyMargin: 'Soglia di avvio: margine sopra il setpoint meno l’isteresi (K)',
      dlyMarginH: 'Il ritardo inizia non appena l’acqua calda scende sotto il setpoint meno l’isteresi più questo margine, cioè poco prima che la pompa di calore parta da sola.',
      dlyNow: 'Attualmente ritardato fino alle {time}: {why}',
      dlyNeed: 'Per ritardare servono la card azione (sopra) o i Flow «ritardare» e «ritorno alla normalità».',
      dhwPriceFrom: 'Ottimizzazione dei prezzi dal (data, facoltativa)',
      dhwPriceFromH: 'Le ore più convenienti e il blocco di prezzo durante il ritardo valgono solo da questa data, ad esempio con la tariffa dinamica. Vuoto = subito.',
      sgDhwCard: 'Card azione di un dispositivo (scrivere direttamente il setpoint ACS, senza Flow)',
      spDev: 'Dispositivo con la card (ad es. il dispositivo Modbus della pompa di calore)',
      spCard: 'Card azione (ad es. «scrivi registro»)',
      spValueArg: 'Argomento per il setpoint',
      spScale: 'Fattore (valore scritto = °C × fattore)',
      spScaleH: 'Registro in decimi di grado: 10 (48 °C si scrive 480).',
      spProgram: 'Setpoint durante il programma (°C)',
      spDelay: 'Setpoint durante il ritardo (°C)',
      spNormal: 'Setpoint normale se non leggibile (°C)',
      spNormalH: 'Il ritorno alla normalità scrive il setpoint letto prima del programma o del ritardo. Se non è noto, viene usato questo valore.',
      spArgsWhy: 'Gli altri argomenti della card (ad es. numero di registro, indirizzamento, tipo) vengono passati invariati a ogni chiamata. Vengono scritti solo valori da 10 a 60 °C.',
      spLoading: 'Caricamento delle card del dispositivo …',
      spNoCard: 'La card scelta non esiste su questo dispositivo.',
      sgDhwTrig: 'Trigger con valore (un Flow scrive il setpoint, per qualsiasi pompa di calore)',
      spTrigWhy: 'A ogni modifica l’app emette il trigger «Il setpoint dell’acqua calda deve essere impostato» (con i valori «Setpoint (°C)» e «Tipo»: program, delay o normal). Crei un solo Flow: quando questo trigger, scrivi il setpoint nella pompa di calore (Modbus, app cloud, relè …). Qui imposti le tre temperature; il setpoint normale viene memorizzato prima del programma o del ritardo.',
      curNow: 'Attualmente',
      curOn: 'acceso',
      curOff: 'spento',
      shareTitle: 'Protezione della batteria domestica: quanta energia solare riceve l’auto?',
      shareWhy: 'Finché l’auto è collegata, riceve una quota dell’energia solare in base al livello della batteria. Sotto il primo livello attende completamente (prima la batteria); sopra, la quota sale linearmente fino a tutta l’eccedenza. Vale anche per i dispositivi senza limite proprio («prima la batteria domestica fino al»).',
      shareLo: 'L’auto carica dalla batteria al (%)',
      sharePctLo: 'Quota a quel livello (%)',
      shareHi: 'Eccedenza completa dalla batteria al (%)',
      sharePctHi: 'Quota a quel livello (%)',
      shareBonus: 'Bonus di previsione (punti percentuali prima)',
      shareBonusH: 'Facoltativo: se la previsione solare indica oggi nettamente più sole di quanto servano alla batteria per riempirsi e alla casa fino al tramonto, la rampa si sposta verso il basso di al massimo altrettanti punti (l’auto carica prima). Senza una previsione recente o un profilo della casa appreso non succede nulla. 0 = disattivato.',
      shareBonusNow: 'Bonus di previsione attivo: rampa attualmente {n} punti prima.',
      shareEx: 'Esempio 30 / 30 / 70 / 100: dal 30 % di batteria un terzo dell’energia solare va all’auto, al 70 % tutta l’eccedenza. Predefinito 50 / 0 / 80 / 100: solo dal 50 % di batteria, poi gradualmente di più.',
      advWb: 'Avanzate (collegamento, commutazione delle fasi, corrente minima)', wbPhases: 'Fasi della wallbox', wbPh1: '1 fase', wbPh3: '3 fasi', wbPhaseSwitch: 'La wallbox commuta da sola tra 1 e 3 fasi', wbPhaseSwitchH: 'Attivo: con poco sole la wallbox carica in monofase (da circa 1,4 kW), con molto sole in trifase. Attivalo solo se la wallbox ne è capace. Altrimenti carica in trifase con almeno circa 4,1 kW e sotto questa soglia non carica con il sole.', minAmps: 'Corrente minima (A)', minAmpsH: 'La corrente di carica più piccola accettata da wallbox e auto. Di solito 6 A, alcune auto ne richiedono di più. Al massimo quanto la corrente massima.', maxAmps: 'Corrente massima (A)',
      stepHold: 'Tempo di attesa prima dell’aumento (s)',
      chargeNowAutoOff: 'Disattiva «Carica immediata» allo scollegamento',
      iconLbl: 'Icona',
      iconNames: {
        dishwasher: 'Lavastoviglie',
        plug: 'Presa',
        bike: 'Bicicletta',
        dehumidifier: 'Deumidificatore',
        boiler: 'Scaldabagno',
        washer: 'Lavatrice',
        tumbler: 'Asciugatrice',
        fan: 'Ventilatore',
        heatpump: 'Pompa di calore',
        pool: 'Piscina',
        ac: 'Climatizzatore',
        heater: 'Resistenza riscaldante',
        sauna: 'Sauna',
        freezer: 'Frigorifero / congelatore',
        pump: 'Pompa',
        light: 'Luce',
        mower: 'Robot tagliaerba',
        purifier: 'Purificatore d’aria',
        aquarium: 'Acquario',
      },
      accuTitle: 'Batteria del dispositivo (ad es. e-bike, tagliaerba)',
      accuEnable: 'Tieni conto del livello di carica della batteria',
      accuSensor: 'Livello di carica da',
      accuCap: 'Valore',
      accuStop: 'Fermare al (%)',
      accuResume: 'Ricaricare sotto il (%)',
      accuLow: 'Caricare sempre sotto il (%)',
      accuMax: 'Spegnere al più tardi dopo (min)',
      accuHint: 'Si ferma al limite e ricarica solo quando la batteria scende sotto di esso. Sotto il limite inferiore carica anche senza eccedenza. La durata massima spegne se il livello di carica non arriva più (0 = nessuna).',
      humWait: 'Avviare nel blocco più conveniente (invece che subito)',
      humCritical: 'Umidità critica (%, facoltativa)',
      humWaitHint: 'Invece di partire subito al {on} %, il funzionamento di emergenza attende il blocco più conveniente della sua durata di funzionamento nel resto della giornata. Nel frattempo il dispositivo funziona con l’eccedenza FV come al solito. Senza prezzi parte subito. Dall’umidità critica parte sempre subito.',
      advConsumer: 'Avanzate (durate di funzionamento, livello di protezione, filtro di previsione)',
      advSg: 'Avanzate (isteresi, ritardi, durata minima di funzionamento, pausa, controllo della modalità di funzionamento, riscontro)',
      advDly: 'Avanzate (rilascio con poco sole, margine)',
      advDhw: 'Avanzate (controllo della modalità di funzionamento, campo di stato, ritardi, durata minima e massima, pausa)',
      humTitle: 'Funzionamento di emergenza umidità',
      humEnable: 'Funzionamento di emergenza in caso di umidità elevata',
      humSensor: 'Sensore di umidità',
      humOn: 'Funzionamento di emergenza attivo dal (%)',
      humOff: 'Funzionamento di emergenza disattivato sotto il (%)',
      humRun: 'Durata massima (min)',
      humHint: 'Funziona indipendentemente da batteria ed eccedenza finché l’umidità scende sotto il valore di spegnimento o la durata massima è trascorsa. Riparte solo dopo che nel frattempo l’umidità è scesa sotto il valore di accensione.',
      modeTest: 'non controllato',
      modeLiveTag: 'controllato',
      costLast: 'Contatore ultimo',
      noBatMode: 'Senza batteria domestica è possibile solo «Con l’eccedenza».',
      save: 'Salva le impostazioni della gestione dell’energia',
      saved: 'Salvato',
      saveDirty: 'Salva le modifiche ●',
      saveSec: 'Salva',
      unsavedTag: '● non salvato',
      unsaved: 'Non ancora salvato: premi «Salva».',
      error: 'Errore',
      toggleFailed: 'Impossibile impostare l’interruttore',
      modeNames: {
        disabled: 'Spento',
        idle: 'In attesa',
        holding: 'In attesa di eccedenza',
        solar_ev: 'Carica da solare',
        instant_ev: 'Carica a piena potenza',
        battery_priority: 'Prima la batteria',
        error: 'Errore',
      },
      otherEms: 'Se un’altra gestione dell’energia controlla già questa wallbox, disattivala prima lì. Altrimenti due sistemi controllano la stessa wallbox.',
      time: 'Ora',
      price: 'Prezzo',
      day: 'Giorno',
      targetSoc: 'SoC obiettivo (%)',
      reserve: 'Riserva (ore)',
      solarLimit: 'Soglia solare (kWh)',
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
  function LOCALE() { return { de: 'de-CH', fr: 'fr-CH', it: 'it-CH' }[LANG] || 'en-GB'; }
  var state = {
    cfg: null, shadow: null, meters: null, plan: null, flows: [], batteryCards: null, batteryEvents: [], planDay: 'today', preview: null, jobs: [], draft: { target: 'charger', time: '07:00', targetSoc: '', amount: '', powerKw: '', maxPrice: '', contiguous: true, repeat: 'once' }, devices: [], consumersState: [], events: [], rows: [], open: {},
    msg: '', built: false, renderedNoDevice: null, timer: null,
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
    try { return new Date(ms).toLocaleString(LOCALE(), { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return String(ms); }
  }
  function modeLabel(m) { return (S.modeNames && S.modeNames[m]) || m || '-'; }
  /** Ohne Gerät bleibt die App ein reiner Preisbezug. */
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
    var gone = d.id && refsFor([SRC_AREA[s.key]]).filter(function (i) { return i.problem === 'device'; })[0];
    if (gone) return { text: S.refBadgeDev, cls: 'bad' };
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
    var html = '<div class="ems-box"><b>' + esc(S.batCtl) + '</b><div class="ems-row">' + check(S.batCtlOn, 'ems-bc-on', bc.enabled) + '</div>';
    if (!bc.enabled) return html + '</div>';
    return html + batteryValuesHtml(c, bc)
      + cmdFiresHtml([['battery.charge', ''], ['battery.hold', ''], ['battery.normal', '']])
      + '<p class="ems-why">' + esc(S.cmdHint_battery) + '</p>'
      + '<p class="ems-why ems-warn">' + esc(S.batCtlWarn) + '</p></div>';
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
  /** Puffer der Planung: Automatik (zeigt den aktuellen Wert) oder fester Wert. Messwert aus dem Shadow-Zustand (`buffer`). */
  function bufferHtml(b) {
    var buf = state.shadow && state.shadow.buffer;
    var auto = b.bufferMode !== 'fixed';
    var fixedPct = b.bufferPct !== undefined ? b.bufferPct : 3;
    var capKwh = buf && buf.pct > 0 ? buf.kwh / buf.pct * 100 : (b.capacityKwh || 0);
    var kwhOf = function (pct) { return (pct / 100 * capKwh).toFixed(1); };
    var shownPct = auto && buf && buf.mode === 'auto' ? buf.pct : fixedPct;
    var info;
    if (!auto) info = fill(S.bufInfoFixed, { pct: fixedPct, kwh: kwhOf(fixedPct) });
    else if (buf && buf.mode === 'auto' && buf.measured) info = fill(S.bufInfoAuto, { pct: buf.pct, kwh: buf.kwh.toFixed(1), where: buf.basis === 'm' ? S.bufMorning : S.bufEvening, days: buf.days });
    else info = fill(S.bufInfoWait, { pct: fixedPct, kwh: kwhOf(fixedPct), days: 0, needed: 5 });
    return '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.bufLabel) + '</span><select id="ems-bp-bufmode" data-ems-bpbufmode="1">'
      + '<option value="auto"' + (auto ? ' selected' : '') + '>' + esc(fill(S.bufAutoNow, { pct: shownPct })) + '</option>'
      + '<option value="fixed"' + (auto ? '' : ' selected') + '>' + esc(S.bufFixedNow) + '</option></select></label>'
      + (auto ? '' : field(S.bufFixed, 'ems-bp-buffer', fixedPct, 'number', ' step="1" min="0" max="15"')) + '</div>'
      + '<p class="ems-why" style="color:var(--st-text)"><b>' + esc(info) + '</b></p><p class="ems-why">' + esc(S.bufHint) + '</p>';
  }
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
          + (fixedMode ? '' : '<div class="ems-row">' + field(S.spreadLabel, 'ems-bp-spread', b.minSpreadRp !== undefined ? b.minSpreadRp : 5, 'number', ' step="0.5" min="0" max="20"') + '</div><p class="ems-why">' + esc(S.spreadHint) + '</p>')
          + (fixedMode ? '' : bufferHtml(b))
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
          + '<label class="ems-f ems-wide"><span>' + esc(S.fcToday) + '</span><select data-ems-pv="today">' + capOptions(dev.id, /./, dev.today) + '</select></label>' + (dev.id && dev.today ? curHtml(dev.id, dev.today) : '')
          + '<label class="ems-f ems-wide"><span>' + esc(S.fcTomorrow) + '</span><select data-ems-pv="tomorrow">' + capOptions(dev.id, /./, dev.tomorrow) + '</select></label>' + (dev.id && dev.tomorrow ? curHtml(dev.id, dev.tomorrow) : '') + '</div>'
        : '';
      return why + sourceRow + deviceRow + '<div class="ems-row">' + field(S.factor, 'ems-pv-factor', factor, 'number', ' step="0.01" min="0.1" max="3"') + '</div><p class="ems-why">' + esc(S.factorHint) + '</p>' + pvAccuracyHtml(factor, !!pvc.factorAuto)
        + '<p class="ems-why">' + esc(S.fcCurveHint) + '</p><p class="ems-why ems-' + info.cls + '">' + esc(info.text) + '</p>';
    }
    var d = srcDevice(s.key);
    var batExtra = s.key === 'bat' && d.id ? batteryPlanHtml() + batteryControlHtml() : '';
    var carExtra = s.key === 'car'
      ? (d.id ? '<div class="ems-row">' + field(S.carCap, 'ems-car-cap', state.cfg.car ? state.cfg.car.capacityKwh : 0, 'number', ' step="1" min="0" max="300"') + '</div>' : '')
        + '<div class="ems-row">' + field(S.carFallback, 'ems-car-fb', state.cfg.car && state.cfg.car.fallbackKwh ? state.cfg.car.fallbackKwh : 0, 'number', ' step="1" min="0" max="200"', S.carFallbackH) + '</div>'
        + '<p class="ems-why">' + esc(S.carSetupHint) + '</p>'
      : '';
    return why + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.device) + '</span><select id="src-' + s.key + '-dev" data-ems-src="' + s.key + '">' + deviceOptions(d.id, s.filter, s.tag === 'required' ? S.pick : S.none) + '</select></label>'
      + '<label class="ems-f ems-wide"><span>' + esc(S.value) + '</span><select id="src-' + s.key + '-cap">' + capOptions(d.id, s.re, d.cap) + '</select></label>' + (d.id && d.cap ? curHtml(d.id, d.cap) : '') + '</div>' + carExtra + batExtra;
  }

  // ---------------------------------------------------------------- Zeilen (Verbraucher)

  function newConsumerRow() {
    return {
      kind: 'consumer', name: '', control: true, deviceId: '', type: 'generic', mode: hasBattery() ? 'full' : 'surplus', fullSoc: 98, socOn: 80, hysteresis: 5,
      minSurplusW: 300, startSustainS: 60, stopGraceS: 120, minRunMin: 30, minOffMin: 10, protectSoc: 20, useForecastGate: true, live: false,
      humidity: { enabled: false, sensorId: '', capability: 'measure_humidity', onAbove: 65, offBelow: 61, runMin: 60, waitForCheap: false, criticalAbove: 75 },
      accu: { enabled: false, sensorId: '', capability: 'measure_battery', stopAt: 80, resumeBelow: 75, chargeBelow: 20, maxRunMin: 240 },
      program: {
        minSurplusW: 2000, startSustainS: 300, windowFrom: '', maxWaitH: 4, durationH: 3, remoteCapability: '', remoteOkValue: 'Enabled', doorCapability: '', doorOkValue: 'Closed', stateCapability: '', stateIdleValue: '', startCapability: 'dishwasher_execute_command', startValue: 'START',
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
      kind: 'charger', name: c.charger.costName || 'E-Auto', control: true, deviceId: c.charger.id, maxAmps: c.charger.maxAmps, minAmps: c.charger.minAmps, phases: c.charger.phases === 1 ? 1 : 3, phaseSwitch: c.charger.phaseSwitch === true, stepHoldS: c.charger.stepHoldS, live: c.charger.live === true, autoOff: c.charger.chargeNowAutoOff !== false,
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

  /** Titel eines Befehls: aus der Befehlsliste der App, sonst aus Name und Art. */
  function cmdName(id, name) {
    var list = (state.shadow && state.shadow.commands) || [];
    var f = list.filter(function (c) { return c.id === id; })[0];
    if (f) return f.title;
    if (S.cmdT && S.cmdT[id]) return S.cmdT[id];
    var m = /\.(on|off)$/.exec(id);
    if (/^consumer\./.test(id) && m) return (name || id) + ': ' + (m[1] === 'on' ? S.cmdOn : S.cmdOff);
    if (/^shed\./.test(id)) return S.cmdShed + ': ' + (name || id) + ' ' + S.cmdOff;
    return id;
  }
  /** Punkt mit Text: gibt es einen eingeschalteten Flow, der auf diesen Befehl wartet? (leer, solange noch nicht geprüft) */
  function cmdBadge(id) {
    var st = state.cmdFlows && state.cmdFlows[id];
    if (!st) return '';
    var m = { ok: ['ok', S.cmdFlowOk], empty: ['warn', S.cmdFlowEmpty], broken: ['alarm', S.cmdFlowBroken], off: ['warn', S.cmdFlowOff], missing: ['alarm', S.cmdFlowMissing] }[st.state];
    if (!m) return '';
    var names = st.state === 'ok' || st.state === 'empty' ? ': ' + st.flows.map(function (f) { return f.name; }).join(', ') : '';
    return '<span class="st-line" style="display:inline-flex;margin:0 0 0 6px" title="' + esc(S.cmdWhyCheck) + '"><span class="st-dot ' + m[0] + '"></span>' + esc(m[1] + names) + '</span>';
  }
  function cmdFiresHtml(ids) {
    return '<p class="ems-why">' + esc(S.cmdFires) + '</p>'
      + '<ul style="margin:2px 0 4px 18px;padding:0">' + ids.map(function (x) { return '<li><b>' + esc(cmdName(x[0], x[1])) + '</b>' + cmdBadge(x[0]) + '</li>'; }).join('') + '</ul>'
      + '<p class="ems-why">' + esc(S.cmdWhere) + '</p>';
  }
  /** Kleines Abzeichen an einer Zeile (Batterie, Wallbox, Verbraucher …): alle Befehle mit diesem Anfang haben einen Flow? Sonst der schlechteste Zustand. */
  function cmdRowBadge(prefix) {
    if (!state.cmdFlows) return '';
    var ids = Object.keys(state.cmdFlows).filter(function (id) { return id.indexOf(prefix) === 0; });
    if (!ids.length) return '';
    var rank = { ok: 0, empty: 1, off: 2, broken: 3, missing: 4 };
    var worst = 'ok';
    var bad = 0;
    ids.forEach(function (id) {
      var st = (state.cmdFlows[id] && state.cmdFlows[id].state) || 'missing';
      if (st !== 'ok') bad += 1;
      if (rank[st] > rank[worst]) worst = st;
    });
    var m = { ok: ['ok', S.cmdFlowOk], empty: ['warn', S.cmdFlowEmpty], broken: ['alarm', S.cmdFlowBroken], off: ['warn', S.cmdFlowOff], missing: ['alarm', S.cmdFlowMissing] }[worst];
    // in der Zeile kurz halten (sonst bricht sie um): bei «in Ordnung» nur «Flow», sonst der Zustand
    var txt = worst === 'ok' ? 'Flow' : m[1] + (bad && ids.length > 1 ? ' (' + bad + '/' + ids.length + ')' : '');
    return '<span class="ems-tag" style="background:var(--st-chip-bg);color:var(--st-text);white-space:nowrap" title="' + esc(S.cmdWhyCheck) + '"><span class="st-dot ' + m[0] + '" style="display:inline-block;width:7px;height:7px;margin-right:4px"></span>' + esc(txt) + '</span>';
  }
  /** Orangenes Abzeichen, wenn bei einer Zeile die Steuerung noch nicht gewählt ist (neuer Verbraucher ohne Gerät/Flow, Wallbox ohne Gerät). Reine Kostenzähler (control false) bleiben ohne Warnung. */
  function rowMissingBadge(r) {
    var txt = r.kind === 'charger' ? (!r.deviceId ? S.devMissing : '') : (r.control !== false && !r.deviceId ? S.ctrlMissing : '');
    if (!txt) return '';
    return '<span class="ems-tag" style="background:var(--st-chip-bg);color:var(--st-text);white-space:nowrap"><span class="st-dot warn" style="display:inline-block;width:7px;height:7px;margin-right:4px"></span>' + esc(txt) + '</span>';
  }
  /** Zusammenfassung für die Zeile «Flow-Rezepte»: wie viele Befehle haben einen Flow? */
  function cmdSummary() {
    var list = (state.shadow && state.shadow.commands) || [];
    if (!state.cmdFlows) return { text: list.length + '', cls: 'muted' };
    var ok = list.filter(function (c) { return state.cmdFlows[c.id] && state.cmdFlows[c.id].state === 'ok'; }).length;
    return { text: ok + '/' + list.length + ' ' + S.cmdSummary, cls: ok === list.length ? 'ok' : 'warn' };
  }
  /** Rückmeldung direkt neben dem Knopf (id = Befehl oder '_check'), verschwindet nach ms wieder. */
  function cmdNote(id, text, cls, ms) {
    state.cmdMsg = state.cmdMsg || {};
    state.cmdMsg[id] = { text: text, cls: cls };
    sync(); renderSetup();
    if (ms) {
      setTimeout(function () {
        if (state.cmdMsg && state.cmdMsg[id] && state.cmdMsg[id].text === text) { delete state.cmdMsg[id]; sync(); renderSetup(); }
      }, ms);
    }
  }
  function cmdNoteHtml(id) {
    var m = state.cmdMsg && state.cmdMsg[id];
    return m ? ' <span class="ems-' + m.cls + '">' + esc(m.text) + '</span>' : '';
  }
  function loadCmdFlows() {
    return api('GET', '/ems/command-flows').then(function (r) {
      state.cmdFlows = r && r.ok ? r.status : null;
      return !!(r && r.ok);
    }).catch(function () { state.cmdFlows = null; return false; });
  }
  // ---------------------------------------------------------------- Gelöschte Geräte und Flows (Verweise prüfen)

  /** Probleme der Prüfung auf dem Homey: Gerät/Flow gelöscht, Capability fehlt (fresh = jetzt neu prüfen). */
  function loadRefs(fresh) {
    return api('GET', '/ems/ref-check' + (fresh ? '?fresh=1' : '')).then(function (r) {
      state.refs = (r && r.issues) || [];
      return true;
    }).catch(function () { return false; });
  }
  /** Probleme eines Bereichs (optional nur ein Schlüsselanfang, z. B. ein einzelner Verbraucher). */
  function refsFor(areas, prefix) {
    return (state.refs || []).filter(function (i) { return areas.indexOf(i.area) >= 0 && (!prefix || i.key === prefix || i.key.indexOf(prefix + '.') === 0); });
  }
  function refText(i) {
    var head = i.name || S.refArea[i.area] || i.area;
    if (i.field && i.field !== 'device') head += ' · ' + (S.refField[i.field] || i.field);
    return head + ': ' + (S.refProblem[i.problem] || i.problem) + (i.caps && i.caps.length ? ' (' + i.caps.join(', ') + ')' : '');
  }
  /** Rotes Abzeichen an einer Zeile, wenn ein Verweis darin nicht mehr existiert. */
  function refBadge(list) {
    if (!list || !list.length) return '';
    var kinds = {};
    list.forEach(function (i) { kinds[i.problem] = 1; });
    var ks = Object.keys(kinds);
    var txt = ks.length > 1 ? S.refBadgeMix : { device: S.refBadgeDev, flow: S.refBadgeFlow, capability: S.refBadgeCap }[ks[0]];
    return '<span class="ems-tag ems-tag-required" title="' + esc(list.map(refText).join('\n')) + '">' + esc(txt) + '</span>';
  }
  /** Kasten oben in der Einrichtung mit allen gelöschten Verweisen und dem Knopf zum Entfernen. */
  function refBoxHtml() {
    var list = state.refs || [];
    if (!list.length) return '';
    var rows = list.map(function (i) {
      var btn = i.fixable ? ' <button class="btn" data-ems-refclear="' + esc(i.key) + '">' + esc(i.removes === 'consumer' ? S.refRemoveConsumer : S.refRemove) + '</button>' : '';
      return '<li>' + esc(refText(i)) + btn + '</li>';
    }).join('');
    return '<div class="ems-head ems-head-warn"><span class="ems-ic ems-ic-warn">' + icon('warn', 20) + '</span><div class="ems-head-t"><b>' + esc(S.refTitle) + '</b>'
      + '<p class="ems-why">' + esc(S.refWhy) + '</p><ul style="margin:4px 0 4px 18px;padding:0">' + rows + '</ul>'
      + '<button class="btn" data-ems-refcheck="1">' + esc(S.refRecheck) + '</button> <span class="sub" id="ems-ref-msg"></span></div></div>';
  }
  var SRC_AREA = { grid: 'grid', pv: 'pv', house: 'house', car: 'car', bat: 'battery', fc: 'forecast' };

  /** Flow-Rezepte: alle Befehle der App gruppiert, mit Hinweisen für bekannte Geräte. */
  function commandsHtml() {
    var list = (state.shadow && state.shadow.commands) || [];
    var out = '<p class="ems-why">' + esc(S.cmdIntro) + '</p><p class="ems-why">' + esc(S.cmdWhere) + '</p>'
      + '<p class="ems-why">' + esc(S.cmdTagsLbl) + ': ' + esc('power (W), target_soc (%), discharge (W), amps (A), phases') + '</p><p class="ems-why">' + esc(S.cmdTestWhy) + '</p>'
      + '<p class="ems-why">' + esc(S.cmdWhyCheck) + ' <button class="btn" data-ems-cmdcheck="1">' + esc(S.cmdCheck) + '</button>' + cmdNoteHtml('_check') + '</p>';
    if (!list.length) return out + '<p class="ems-why">' + esc(S.cmdNone) + '</p>';
    var groups = [];
    list.forEach(function (c) { if (groups.indexOf(c.group) < 0) groups.push(c.group); });
    return out + groups.map(function (g) {
      var items = list.filter(function (c) { return c.group === g; });
      var hint = S['cmdHint_' + g];
      return '<div class="ems-box" style="margin:6px 0"><b>' + esc(items[0].groupTitle) + '</b>'
        + '<ul style="margin:6px 0 4px 18px;padding:0">' + items.map(function (c) { return '<li>' + esc(c.title) + cmdBadge(c.id) + ' <button class="btn" data-ems-cmdtest="' + esc(c.id) + '">' + esc(S.cmdTest) + '</button>' + cmdNoteHtml(c.id) + '</li>'; }).join('') + '</ul>'
        + (hint ? '<p class="ems-why">' + esc(hint) + '</p>' : '') + '</div>';
    }).join('');
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

  /** Zusammenfassung der Plan-Genauigkeit für die Zeile in der Liste. */
  function planAccuracySummary() {
    var pa = state.shadow && state.shadow.planAccuracy;
    if (!pa) return { text: S.paSumWait.replace('{n}', 0).replace('{m}', 5), cls: 'muted' };
    var wins = pa.load.windows || [];
    var judged = wins.filter(function (w) { return !!w.mean; }).length + (pa.pv && pa.pv.plain ? 1 : 0);
    var total = wins.length + 1;
    var days = Math.max.apply(null, wins.map(function (w) { return w.days; }).concat([pa.pv ? pa.pv.days : 0]));
    if (!judged) return { text: S.paSumWait.replace('{n}', days).replace('{m}', pa.needed), cls: 'muted' };
    // «verbessern» heisst: die ALTERNATIVE ist klar besser. Gewinnt die heutige Methode (mean/plain), ist nichts zu verbessern.
    var better = wins.filter(function (w) { return w.better === 'robust'; }).length + (pa.pv && pa.pv.better === 'nowcast' ? 1 : 0);
    return better ? { text: S.paSumBetter.replace('{k}', better).replace('{t}', total), cls: 'ok' } : { text: S.paSumNone, cls: 'muted' };
  }

  /** Plan-Genauigkeit (Lernbericht): Fehler der Verbrauchs- und Solar-Prognose, heutige Methode gegen Alternative. Nur Anzeige. */
  function planAccuracyHtml() {
    var pa = state.shadow && state.shadow.planAccuracy;
    if (!pa) return '<p class="ems-why">' + esc(S.paWhy) + '</p>';
    var label = { mean: S.paMean, robust: S.paRobust, plain: S.paPlain, nowcast: S.paNowcast };
    var cell = function (e) { return e ? e.errPct.toFixed(1) + ' %' : '–'; };
    var best = function (b, enough) { return !enough ? '–' : (b ? esc(label[b]) : esc(S.paSame)); };
    var rows = (pa.load.windows || []).map(function (w) {
      var enough = !!w.mean;
      var name = { m: S.paLoadM, d: S.paLoadD, e: S.paLoadE }[w.key];
      return '<tr><td>' + esc(name) + '</td><td>' + (enough ? w.days : esc(S.paWait.replace('{n}', w.days).replace('{m}', pa.needed))) + '</td><td>' + cell(w.mean) + '</td><td>' + cell(w.robust) + '</td><td class="' + (w.better ? 'ems-ok' : '') + '">' + best(w.better, enough) + '</td></tr>';
    });
    var pv = pa.pv || {};
    var pvEnough = !!pv.plain;
    rows.push('<tr><td>' + esc(S.paPvRest) + '</td><td>' + (pvEnough ? pv.days : esc(S.paWait.replace('{n}', pv.days || 0).replace('{m}', pa.needed))) + '</td><td>' + cell(pv.plain) + '</td><td>' + cell(pv.nowcast) + '</td><td class="' + (pv.better ? 'ems-ok' : '') + '">' + best(pv.better, pvEnough) + '</td></tr>');
    return '<p class="ems-why">' + esc(S.paWhy) + '</p>'
      + '<table class="ems-t"><thead><tr><th></th><th>' + esc(S.paDays) + '</th><th>' + esc(S.paNow) + '</th><th>' + esc(S.paAlt) + '</th><th>' + esc(S.paBest) + '</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>'
      + '<p class="ems-why">' + esc(S.paNote) + '</p>';
  }

  // ------------------------------------------------------------ Anschluss der Wallbox (Capabilities und Flow-Karten)
  var WB_DEFAULT = { stateCapability: 'evcharger_charging_state', powerCapability: 'measure_power', phaseCapability: '', startCard: 'evcharger_charging_start', powerCard: 'target_power_set', powerArg: 'target_power' };


  function wbLinkBox(r, p) {
    var c = (state.cfg && state.cfg.charger) || {};
    var keys = ['stateCapability', 'powerCapability', 'phaseCapability'];
    var cur = {};
    keys.forEach(function (k) { cur[k] = c[k] === undefined ? WB_DEFAULT[k] : c[k]; });
    var isStd = keys.every(function (k) { return cur[k] === WB_DEFAULT[k]; });
    var devId = r.deviceId;
    if (!devId) return ''; // ohne gewähltes Gerät gibt es nichts zuzuordnen (und nichts, was beim Speichern überschrieben würde)
    state.wbShown = !!state.open[p.slice(0, -1)]; // nur wenn die Zeile aufgeklappt ist, steht der Bereich wirklich auf der Seite
    var capSel = function (id, label, value, none, hint) {
      var opts = (none ? '<option value=""' + (value ? '' : ' selected') + '>' + esc(S.wbNone) + '</option>' : '') + capOptions(devId, /./, value);
      return '<label class="ems-f ems-wide"><span>' + esc(label) + (hint ? tipI(id) : '') + '</span><select id="' + id + '">' + opts + '</select></label>' + (devId && value ? curHtml(devId, value) : '') + (hint ? tipT(id, hint) : '');
    };
    var body = '<p class="ems-why">' + esc(S.wbLinkWhy) + '</p>'
      + '<div class="ems-row">' + capSel('ems-wb-state', S.wbState, cur.stateCapability, false) + capSel('ems-wb-power', S.wbPower, cur.powerCapability, false) + '</div>'
      + '<div class="ems-row">' + capSel('ems-wb-phase', S.wbPhase, cur.phaseCapability, true, S.wbPhaseH) + '</div>'
      + cmdFiresHtml([['charger.set', ''], ['charger.start', ''], ['charger.stop', '']]);
    return '<details class="ems-adv"' + (state.open[p + 'link'] ? ' open' : '') + '><summary data-ems-adv="' + p + 'link">' + esc(S.wbLinkTitle) + ' · ' + esc(isStd ? S.wbStd : S.wbCustom) + '</summary>' + body + '</details>';
  }

  /** Auswahl aus den Feldern in die Konfiguration übernehmen (nur wenn der Bereich gezeichnet ist). */
  function syncWb() {
    if (!state.cfg || !state.wbShown || !$('ems-wb-state')) return;
    var c = state.cfg.charger;
    c.stateCapability = val('ems-wb-state', c.stateCapability) || WB_DEFAULT.stateCapability;
    c.powerCapability = val('ems-wb-power', c.powerCapability) || WB_DEFAULT.powerCapability;
    c.phaseCapability = ($('ems-wb-phase') || { value: c.phaseCapability }).value || '';
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
    // Live-Werte (Ladestand, Prognose-Verschiebung) vom Status, die Rampe aber aus den gerade getippten Werten rechnen,
    // sonst zeigt das Diagramm bis zum Speichern die alte Rampe (gleiche Formel wie planner/charger.js und shareBonus.js)
    var info = shareInfoFor(sh, state.shadow && state.shadow.shareInfo);
    var now = info && info.pct !== null && info.pct !== undefined && info.soc !== null && info.soc !== undefined
      ? '<p class="ems-why ems-ok" style="margin:4px 0">' + esc(S.shareNow.replace('{soc}', info.soc).replace('{pct}', info.pct)) + '</p>' : '';
    return '<span class="ems-f">' + esc(S.shareChartCap) + '</span>' + shareChart(sh, info) + now;
  }
  function shareInfoFor(sh, live) {
    if (!live) return null;
    var shift = Number(live.shift) || 0;
    var lo0 = Number(sh.socLow) || 0;
    var hi0 = Number(sh.socHigh) || 0;
    var lo = shift > 0 ? Math.max(0, lo0 - shift) : lo0;
    var hi = shift > 0 ? Math.max(lo + 1, hi0 - shift) : hi0;
    var pl = Number(sh.pctLow) || 0;
    var ph = sh.pctHigh === undefined ? 100 : Number(sh.pctHigh);
    var soc = live.soc;
    var pct = null;
    if (soc !== null && soc !== undefined && hi > lo) {
      if (soc < lo) pct = 0;
      else {
        var t = Math.min(1, Math.max(0, (soc - lo) / (hi - lo)));
        pct = Math.round(Math.min(1, Math.max(0, pl / 100 + t * (ph / 100 - pl / 100))) * 100);
      }
    }
    return { soc: soc, pct: pct, lo: lo, hi: hi, pctLow: pl, pctHigh: ph, shift: shift };
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
      + '<label class="ems-f ems-wide"><span>' + esc(S.value) + '</span><select id="' + p + 'mcap">' + capOptions(r.meterDeviceId, /^meter_power/, r.meterCap) + '</select></label>' + (r.meterDeviceId && r.meterCap ? curHtml(r.meterDeviceId, r.meterCap) : '') + '</div>';
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
        + '<details class="ems-adv"' + (state.open[p + 'wbadv'] ? ' open' : '') + '><summary data-ems-adv="' + p + 'wbadv">' + esc(S.advWb) + '</summary>'
        + '<div class="ems-row"><label class="ems-f"><span>' + esc(S.wbPhases) + '</span><select id="' + p + 'phases"><option value="3"' + (r.phases === 1 ? '' : ' selected') + '>' + esc(S.wbPh3) + '</option><option value="1"' + (r.phases === 1 ? ' selected' : '') + '>' + esc(S.wbPh1) + '</option></select></label>'
        + field(S.minAmps, p + 'minAmps', r.minAmps === undefined ? 6 : r.minAmps, 'number', ' step="1" min="6" max="32"', S.minAmpsH) + '</div>'
        + '<div class="ems-row">' + check(S.wbPhaseSwitch, p + 'phaseSwitch', r.phaseSwitch === true, S.wbPhaseSwitchH) + '</div></details>'
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
      ? cmdFiresHtml([['consumer.' + r.deviceId + '.on', r.name], ['consumer.' + r.deviceId + '.off', r.name]])
        + '<div class="ems-row">' + field(S.assumedW, p + 'assumedW', r.assumedW) + '</div>'
      : '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.ctrlDevice) + '</span><select id="' + p + 'dev" data-ems-mode="' + i + '">' + deviceOptions(r.deviceId, hasCap(/^onoff$/), S.none) + '</select></label></div>');
    var ctrlBody = '';
    if (viaFlow || !!r.deviceId) {
      var h = r.humidity;
      var hum = true
        ? '<details class="ems-adv"' + (state.open[p + 'hum'] ? ' open' : '') + '><summary data-ems-adv="' + p + 'hum">' + esc(S.humTitle) + ' (' + esc(String(S.tagOptional).toLowerCase()) + ') · ' + esc(h.enabled ? S.curOn : S.curOff) + '</summary>'
          + '<div class="ems-box"><div class="ems-row">' + check(S.humEnable, p + 'humEnable', h.enabled) + '</div>'
          + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.humSensor) + '</span><select id="' + p + 'humSensor">' + deviceOptions(h.sensorId, hasCap(/^measure_humidity$/), S.none) + '</select></label>'
          + field(S.humOn, p + 'humOn', h.onAbove) + field(S.humOff, p + 'humOff', h.offBelow) + field(S.humRun, p + 'humRun', h.runMin) + '</div><p class="ems-why">' + esc(S.humHint) + '</p>'
          + '<div class="ems-row">' + check(S.humWait, p + 'humWait', h.waitForCheap === true) + field(S.humCritical, p + 'humCrit', h.criticalAbove === undefined ? 75 : h.criticalAbove, 'number', ' step="1" min="10" max="100"') + '</div>'
          + '<p class="ems-why">' + esc(S.humWaitHint.replace('{on}', String(h.onAbove))) + '</p></div></details>'
        : '';
      var ac = r.accu || newConsumerRow().accu;
      var accu = '<div class="ems-box"><b>' + esc(S.accuTitle) + '</b><div class="ems-row">' + check(S.accuEnable, p + 'accuEnable', ac.enabled) + '</div>'
        + (ac.enabled ? '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.accuSensor) + '</span><select id="' + p + 'accuSensor" data-ems-mode="' + i + '">' + deviceOptions(ac.sensorId, hasCap(/^measure_battery/), S.none) + '</select></label>'
          + '<label class="ems-f"><span>' + esc(S.accuCap) + '</span><select id="' + p + 'accuCap">' + capOptions(ac.sensorId, /^measure_battery/, ac.capability) + '</select></label>' + (ac.sensorId && ac.capability ? curHtml(ac.sensorId, ac.capability) : '') + '</div>'
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
        + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.programRemoteCap) + '</span><select id="' + p + 'pgRemoteCap" data-ems-mode="' + i + '">' + '<option value="">' + esc(S.none) + '</option>' + capOptions(r.deviceId, /.*/, pg.remoteCapability) + '</select></label>' + (r.deviceId && pg.remoteCapability ? curHtml(r.deviceId, pg.remoteCapability) : '')
        + field(S.programRemoteVal, p + 'pgRemoteVal', pg.remoteOkValue, 'text', ' style="max-width:115px"') + '</div>'
        + (pg.remoteCapability ? '' : '<p class="warn">' + esc(S.programRemoteWarn) + '</p>')
        + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.programDoorCap) + '</span><select id="' + p + 'pgDoorCap" data-ems-mode="' + i + '">' + '<option value="">' + esc(S.none) + '</option>' + capOptions(r.deviceId, /.*/, pg.doorCapability) + '</select></label>' + (r.deviceId && pg.doorCapability ? curHtml(r.deviceId, pg.doorCapability) : '')
        + field(S.programDoorVal, p + 'pgDoorVal', pg.doorOkValue, 'text', ' style="max-width:115px"') + '</div>'
        + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.programStateCap) + '</span><select id="' + p + 'pgStateCap" data-ems-mode="' + i + '">' + '<option value="">' + esc(S.none) + '</option>' + capOptions(r.deviceId, /.*/, pg.stateCapability) + '</select></label>' + (r.deviceId && pg.stateCapability ? curHtml(r.deviceId, pg.stateCapability) : '')
        + field(S.programStateVal, p + 'pgStateVal', pg.stateIdleValue, 'text', ' style="max-width:115px"') + '</div>'
        + '<p class="ems-why">' + esc(S.programStateHint) + '</p>'
        + '</div>';
      ctrlBody = '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.mode) + tipI(p + 'mode') + '</span><select id="' + p + 'mode" data-ems-mode="' + i + '">' + modeOpts + '</select></label>' + tipT(p + 'mode', S.tips.mode) + '</div>'
        + (hasBattery() ? '' : '<p class="ems-why">' + esc(S.noBatMode) + '</p>')
        + (r.mode === 'program' ? program : ('<div class="ems-row">' + params + '</div>' + (r.mode === 'surplus' && hasBattery() ? '<p class="ems-why">' + esc(S.batFirstHint) + '</p>' : '') + accu
          + '<details class="ems-adv"' + (state.open[p + 'adv'] ? ' open' : '') + '><summary data-ems-adv="' + p + 'adv">' + esc(S.advConsumer) + '</summary><div class="ems-row">'
          + field(S.minRun, p + 'minRunMin', r.minRunMin) + field(S.minOff, p + 'minOffMin', r.minOffMin) + field(S.protect, p + 'protectSoc', r.protectSoc) + '</div>'
          + '<div class="ems-row">' + check(S.useGate, p + 'useGate', r.useForecastGate) + '</div></details>' + hum));
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
    return refBoxHtml() + '<div class="ems-head ' + (ok ? 'ems-head-ok' : 'ems-head-warn') + '"><span class="ems-ic ' + (ok ? 'ems-ic-ok' : 'ems-ic-warn') + '">' + icon(ok ? 'check' : 'warn', 20) + '</span><div class="ems-head-t"><b>' + esc(line) + '</b>' + sub + '</div></div>'
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
    var ol = state.shadow && state.shadow.outlook;
    var olTxt = ol ? ' - ' + (ol.status === 'over' ? S.fuseOutOver : (ol.status === 'tight' ? S.fuseOutTight : S.fuseOutOk)) : '';
    return { text: S.fuseLimitLbl + ' ' + fuseLimit(f) + ' A - ' + (f.shed.length ? f.shed.map(shedName).join(', ') : S.fuseShedNone) + olTxt, cls: ol && ol.status !== 'ok' ? 'warn' : 'ok' };
  }
  /** Ausblick Hausanschluss: Urteil, Spitze mit Beteiligten und Stundenbalken (aus dem Shadow-Zustand). */
  /** Karte im Reiter «Ausblick», vor der Vorschau für Aufträge (die Zusammenfassung steht auch in der Zeile unter Einrichten). */
  function outlookCardHtml() {
    if (!state.shadow || !state.shadow.deviceExists) return '';
    return '<p class="lbl">' + esc(S.fuseOutTabTitle) + '</p><div class="card">' + fuseOutlookBodyHtml() + '</div>';
  }
  function fuseOutlookBodyHtml() {
    var o = state.shadow && state.shadow.outlook;
    if (!o) return '<p class="ems-why">' + esc(S.fuseOutNone) + '</p>';
    var col = function (pct) { return pct >= 100 ? '#c0392b' : (pct >= 80 ? '#d98a1a' : '#2e9d5a'); };
    var label = o.status === 'over' ? S.fuseOutOver : (o.status === 'tight' ? S.fuseOutTight : S.fuseOutOk);
    var parts = [S.fuseOutHouse + ' ' + o.peak.baseKw.toFixed(1)].concat((o.peak.parts || []).map(function (p) { return p.name + ' ' + p.kw.toFixed(1); }));
    var bars = (o.hours || []).map(function (h) {
      return '<i title="' + esc(h.time + ': ' + h.kw.toFixed(1) + ' kW' + (h.parts.length ? ' (' + h.parts.join(', ') + ')' : '')) + '" style="flex:1 1 0;min-width:0;border-radius:1px;height:' + Math.max(2, Math.min(100, h.pct)).toFixed(0) + '%;background:' + col(h.pct) + '"></i>';
    }).join('');
    var first = (o.hours && o.hours[0] ? o.hours[0].time : '');
    var last = (o.hours && o.hours.length ? o.hours[o.hours.length - 1].time : '');
    return ''
      + '<p class="ems-why"><b style="color:' + (o.status === 'over' ? '#c0392b' : (o.status === 'tight' ? '#d98a1a' : '#2e9d5a')) + '">' + esc(label) + '</b> - ' + esc(S.fuseOutPeak.replace('{kw}', o.peak.kw.toFixed(1)).replace('{time}', o.peak.time).replace('{pct}', o.peak.pct).replace('{limit}', o.limitKw.toFixed(1))) + '</p>'
      + '<p class="ems-why">' + esc(parts.join(' + ')) + ' kW</p>'
      + '<div style="display:flex;align-items:flex-end;gap:1px;height:44px;margin:6px 0 2px">' + bars + '</div>'
      + '<div style="display:flex;justify-content:space-between;font-size:11px;opacity:.7"><span>' + esc(first) + '</span><span>' + esc(last) + '</span></div>'
      + '<p class="ems-why">' + esc(S.fuseOutWhy) + '</p>';
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
          ? cmdFiresHtml([['shed.' + (e.kind === 'charger' ? 'charger' : e.id), e.name]])
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
        return '<label class="ems-f"><span>' + esc(S.fusePhase + ' ' + (k + 1)) + '</span><select id="ems-fuse-cap' + k + '">' + capOptions(meterId, /^measure_current/, f.caps[k]) + '</select></label>' + (meterId && f.caps[k] ? curHtml(meterId, f.caps[k]) : '');
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
  /** Aktueller Wert einer Capability als Text (Hilfe, nur lesen), leer wenn nicht bekannt. */
  function curText(devId, cap) {
    var d = findDevice(devId);
    if (!d || !cap || !d.values) return '';
    var v = d.values[cap];
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? S.curOn : S.curOff;
    if (typeof v === 'number') {
      var u = d.units && d.units[cap] ? ' ' + d.units[cap] : '';
      return (Math.round(v * 100) / 100).toLocaleString(LOCALE(), { maximumFractionDigits: 2 }) + u;
    }
    return String(v);
  }
  function curHtml(devId, cap) {
    var t = curText(devId, cap);
    return '<span class="ems-f ems-cur-w"><span>' + esc(S.curNow) + '</span><b class="ems-cur" data-ems-cur="' + esc(devId) + '|' + esc(cap) + '">' + (t ? esc(t) : '–') + '</b></span>';
  }
  /** Werte in der Seite nachführen (ohne neu zu zeichnen), wenn die Geräteliste aufgefrischt wurde. */
  function updateCur() {
    if (typeof document.querySelectorAll !== 'function') return;
    var els = document.querySelectorAll('[data-ems-cur]');
    for (var i = 0; i < els.length; i++) {
      var k = String(els[i].getAttribute('data-ems-cur') || '').split('|');
      var t = curText(k[0], k[1]);
      els[i].textContent = t || '–';
    }
  }
  /** Geräteliste (mit aktuellen Werten) neu holen, höchstens alle 30 s und nur beim Aufklappen eines Bereichs. */
  function refreshDevices() {
    if (state.devRefreshing || Date.now() - (state.devicesAt || 0) < 30000) return;
    state.devRefreshing = true;
    api('GET', '/ems/devices').then(function (r) {
      if (r && r.devices) { state.devices = r.devices; state.devicesAt = Date.now(); updateCur(); }
      state.devRefreshing = false;
    }).catch(function () { state.devRefreshing = false; });
  }
  function sgDevPair(label, idBase, devId, cap, re, tip) {
    return '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(label) + (tip ? tipI(idBase) : '') + '</span><select id="' + idBase + '-dev" data-ems-sgdev="1">' + deviceOptions(devId, hasCap(re), S.pick) + '</select></label>'
      + '<label class="ems-f ems-wide"><span>&nbsp;</span><select id="' + idBase + '-cap">' + capOptions(devId, re, cap) + '</select></label>' + (devId && cap ? curHtml(devId, cap) : '') + (tip ? tipT(idBase, tip) : '') + '</div>';
  }
  function sgFld(label, id, value, type, extra, hint) { return '<div class="ems-row">' + field(label, id, value, type, extra, hint) + '</div>'; }
  // Früher wählte man hier einen Flow; jetzt gibt die App einen Befehl aus (Flow-Rezepte)
  var CMD_OF = { 'ems-sg-fn': 'sgready.normal', 'ems-sg-fb': 'sgready.boost', 'ems-sg-ff': 'sgready.forced', 'ems-dhw-dly-flow': 'dhw.delay', 'ems-dhw-flowon': 'dhw.program', 'ems-dhw-flowoff': 'dhw.normal' };
  function sgFlowSel(label, id, cur) {
    return '<p class="ems-why">' + esc(S.cmdFires) + ' <b>' + esc(cmdName(CMD_OF[id] || id, '')) + '</b></p>';
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
    var html = '<p class="ems-why">' + esc(S.sgWhy) + '</p><p class="ems-why" style="font-weight:600">' + esc(S.hpBoss) + '</p><div class="ems-row">' + check(S.sgOn, 'ems-sg-on', g.enabled) + '</div>';
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
      + '<p class="ems-why">' + esc(S.sgSetupH) + '</p>'
      + '<details class="ems-adv"' + (state.open['sg-adv'] ? ' open' : '') + '><summary data-ems-adv="sg-adv">' + esc(S.advSg) + '</summary>'
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
    enabled: false, flowDelay: { id: '', advanced: false, name: '' }, windowFrom: '05:00', windowTo: '14:00', minForecastKwh: 15, releaseWeekday: '16:00', releaseWeekend: '15:00', releaseLow: '10:00', comfortTemp: 32, startMargin: 3,
  };
  function dlyCfg(d) { return Object.assign({}, DLY, d.delay || {}); }
  function delayBox(d) {
    var l = dlyCfg(d);
    var sh = state.shadow && state.shadow.dhw && state.shadow.dhw.delay;
    var now = sh && sh.active && sh.releaseAt
      ? '<p class="ems-why ems-ok" style="margin:4px 0">' + esc(S.dlyNow.replace('{time}', new Date(sh.releaseAt).toLocaleTimeString(LOCALE(), { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' })).replace('{why}', sh.reason || '')) + '</p>' : '';
    var viaCardD = d.output === 'trigger';
    var ready = true; // Auslöser mit Wert oder Befehle: nichts weiter einzustellen
    var need = l.enabled && !ready ? '<p class="ems-why ems-warn">' + esc(S.dlyNeed) + '</p>' : '';
    return '<div class="ems-box"><b>' + esc(S.dlyTitle) + '</b><p class="ems-why">' + esc(S.dlyWhy) + '</p>'
      + '<div class="ems-row">' + check(S.dlyOn, 'ems-dhw-dly-on', l.enabled, '') + '</div>' + now + need
      + '<div class="ems-row">' + field(S.dlyFrom, 'ems-dhw-dly-from', l.windowFrom, 'time') + field(S.dlyTo, 'ems-dhw-dly-to', l.windowTo, 'time') + '</div>'
      + '<div class="ems-row">' + field(S.dlyForecast, 'ems-dhw-dly-fc', l.minForecastKwh, 'number', ' step="1" min="0"', S.dlyForecastH) + field(S.dlyComfort, 'ems-dhw-dly-comfort', l.comfortTemp, 'number', ' step="1" min="10" max="60"', S.dlyComfortH) + '</div>'
      + '<div class="ems-row">' + field(S.dlyRelWd, 'ems-dhw-dly-rwd', l.releaseWeekday, 'time') + field(S.dlyRelWe, 'ems-dhw-dly-rwe', l.releaseWeekend, 'time') + '</div>'
      + (viaCardD ? '' : sgFlowSel(S.dlyFlow, 'ems-dhw-dly-flow', l.flowDelay))
      + '<details class="ems-adv"' + (state.open['dhw-dly-adv'] ? ' open' : '') + '><summary data-ems-adv="dhw-dly-adv">' + esc(S.advDly) + '</summary>'
      + '<div class="ems-row">' + field(S.dlyRelLow, 'ems-dhw-dly-rlow', l.releaseLow, 'time', '', S.dlyRelLowH) + field(S.dlyMargin, 'ems-dhw-dly-margin', l.startMargin, 'number', ' step="0.5" min="0" max="10"', S.dlyMarginH) + '</div></details></div>';
  }
  function syncDelay(d) {
    if (!$('ems-dhw-dly-on')) return;
    var l = dlyCfg(d);
    l.enabled = chk('ems-dhw-dly-on');
    l.windowFrom = val('ems-dhw-dly-from', l.windowFrom); l.windowTo = val('ems-dhw-dly-to', l.windowTo);
    l.minForecastKwh = num('ems-dhw-dly-fc', l.minForecastKwh); l.comfortTemp = num('ems-dhw-dly-comfort', l.comfortTemp);
    l.releaseWeekday = val('ems-dhw-dly-rwd', l.releaseWeekday); l.releaseWeekend = val('ems-dhw-dly-rwe', l.releaseWeekend);
    l.releaseLow = val('ems-dhw-dly-rlow', l.releaseLow); l.startMargin = num('ems-dhw-dly-margin', l.startMargin);
    d.delay = l;
  }

  // WW-Soll direkt über eine Aktionskarte schreiben (statt Flows)
  var SP = { deviceId: '', card: '', valueArg: 'value', scale: 10, args: {}, programC: 52, delayC: 30, normalC: 48 };
  function spCfg(d) { return Object.assign({}, SP, d.setpoint || {}); }
  function spTemps(sp) {
    return '<div class="ems-row">' + field(S.spProgram, 'ems-dhw-sp-prog', sp.programC, 'number', ' step="0.5" min="10" max="60"') + field(S.spDelay, 'ems-dhw-sp-delay', sp.delayC, 'number', ' step="0.5" min="10" max="60"')
      + field(S.spNormal, 'ems-dhw-sp-normal', sp.normalC, 'number', ' step="0.5" min="10" max="60"', S.spNormalH) + '</div>';
  }
  function syncSp(d) {
    var sp = spCfg(d);
    if ($('ems-dhw-sp-prog')) { sp.programC = num('ems-dhw-sp-prog', sp.programC); sp.delayC = num('ems-dhw-sp-delay', sp.delayC); sp.normalC = num('ems-dhw-sp-normal', sp.normalC); d.setpoint = sp; }
    d.setpoint = sp;
  }

  function dhwBody() {
    var d = dhwCfg();
    var cap = d.output === 'capability';
    var viaTrig = d.output === 'trigger';
    var dev = d.device || { deviceId: '', capability: '', onValue: '', offValue: '' };
    var html = '<p class="ems-why">' + esc(S.dhwWhy) + '</p><p class="ems-why" style="font-weight:600">' + esc(S.hpBoss) + '</p><div class="ems-row">' + check(S.dhwOnLbl, 'ems-dhw-on', d.enabled) + '</div>';
    return html
      + sgFld(S.dhwCheapHours, 'ems-dhw-cheap', d.cheapHours, 'number', ' step="0.25" min="0.25" max="12" data-ems-sgdev="1"', S.dhwCheapH)
      + dhwPreviewHtml(d.cheapHours)
      + '<div class="ems-row">' + field(S.dhwPriceFrom, 'ems-dhw-pricefrom', d.priceFrom || '', 'date', '', S.dhwPriceFromH) + '</div>'
      + sgFld(S.dhwBelow, 'ems-dhw-below', d.belowTemp, 'number', ' step="1" min="0" max="90"', S.dhwBelowH)
      + '<div class="ems-row">' + check(S.dhwSkipPv, 'ems-dhw-skippv', d.skipPv, S.dhwSkipPvH) + (d.skipPv ? field(S.dhwSkipPvKwh, 'ems-dhw-skippvkwh', d.skipPvKwh, 'number', ' step="1" min="0"') + field(S.dhwSkipUntil, 'ems-dhw-skipuntil', d.skipPvUntil, 'time', '', S.dhwSkipUntilH) : '') + '</div>'
      + sgDevPair(S.sgSensor, 'ems-dhw-sensor', d.sensorId, d.tempCapability, /^measure_temperature/, S.sgSensorH)
      + targetBlock('ems-dhw', d, 'ems-dhw-target', S.dhwTarget, S.dhwTargetH)
      + delayBox(d)
      + '<div class="ems-row"><label class="ems-f ems-wide"><span>' + esc(S.sgDhwOut) + tipI('dhw-out') + '</span><select id="ems-dhw-out" data-ems-sgdev="1"><option value="flows"' + (cap || viaTrig ? '' : ' selected') + '>' + esc(S.sgDhwFlows) + '</option><option value="trigger"' + (viaTrig ? ' selected' : '') + '>' + esc(S.sgDhwTrig) + '</option><option value="capability"' + (cap ? ' selected' : '') + '>' + esc(S.sgDhwCap) + '</option></select></label>' + tipT('dhw-out', S.sgDhwH) + '</div>'
      + (viaTrig ? '<p class="ems-why">' + esc(S.spTrigWhy) + '</p>' + spTemps(spCfg(d)) : cap
        ? sgDevPair(S.sgDhwDev, 'ems-dhw-dev', dev.deviceId, dev.capability, /./) + '<div class="ems-row">' + field(S.sgDhwOnV, 'ems-dhw-onv', dev.onValue, 'text') + field(S.sgDhwOffV, 'ems-dhw-offv', dev.offValue, 'text') + '</div>'
        : sgFlowSel(S.sgDhwOn, 'ems-dhw-flowon', d.flowOn) + sgFlowSel(S.sgDhwOff, 'ems-dhw-flowoff', d.flowOff))
      + '<details class="ems-adv"' + (state.open['dhw-adv'] ? ' open' : '') + '><summary data-ems-adv="dhw-adv">' + esc(S.advDhw) + '</summary>'
      + sgDevPair(S.sgMode, 'ems-dhw-mode', d.modeId, d.modeCapability, /./, S.sgModeH)
      + sgDevPair(S.dhwHeating, 'ems-dhw-heat', d.heatingId, d.heatingCapability, /./, S.dhwHeatingH)
      + (d.heatingId ? '<div class="ems-row">' + field(S.dhwHeatingOk, 'ems-dhw-heatok', d.heatingOkValue || 'true', 'text') + '</div>' : '')
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
    d.heatingId = ($('ems-dhw-heat-dev') || { value: d.heatingId || '' }).value || '';
    if ($('ems-dhw-heat-cap')) d.heatingCapability = d.heatingId ? val('ems-dhw-heat-cap', d.heatingCapability) : '';
    if ($('ems-dhw-heatok')) d.heatingOkValue = String($('ems-dhw-heatok').value || 'true');
    if ($('ems-dhw-modeok')) d.modeOkValue = String($('ems-dhw-modeok').value || '');
    if ($('ems-dhw-modeprog')) d.modeProgramValue = String($('ems-dhw-modeprog').value || '');
    d.startDelayMin = num('ems-dhw-startdelay', d.startDelayMin); d.minRunMin = num('ems-dhw-minrun', d.minRunMin); d.maxRunMin = num('ems-dhw-maxrun', d.maxRunMin);
    d.stopDelayMin = num('ems-dhw-stopdelay', d.stopDelayMin); d.cooldownMin = num('ems-dhw-cooldown', d.cooldownMin);
    d.output = ['capability', 'card', 'trigger'].indexOf(val('ems-dhw-out', d.output)) >= 0 ? val('ems-dhw-out', d.output) : 'flows';
    syncSp(d);
    if ($('ems-dhw-dev-dev')) {
      d.device = {
        deviceId: val('ems-dhw-dev-dev', ''), capability: val('ems-dhw-dev-cap', ''), onValue: String(($('ems-dhw-onv') || { value: '' }).value || ''), offValue: String(($('ems-dhw-offv') || { value: '' }).value || ''),
      };
    }
    d.live = chk('ems-dhw-live');
  }

  function listRow(key, ic, color, title, tagHtmlStr, summary, body, noSave) {
    var open = !!state.open[key];
    var sug = !!(state.suggested && state.suggested[key]);
    if (sug) tagHtmlStr = (tagHtmlStr || '') + '<span class="ems-tag ems-tag-sug">' + esc(S.suggestedTag) + '</span>';
    return '<div class="ems-item' + (open ? ' open' : '') + (sug ? ' ems-sug' : '') + '"><div class="ems-item-h" data-ems-open="' + esc(key) + '">'
      + '<span class="ems-ic" style="background:' + color + '">' + icon(ic, 17) + '</span>'
      + '<span class="ems-item-t"><span class="ems-item-n">' + esc(title) + ' ' + (tagHtmlStr || '') + '</span><span class="ems-item-s ems-' + summary.cls + '">' + esc(summary.text) + '</span></span>'
      + '<span class="ems-chev">' + icon('chevron', 16) + '</span></div>'
      + (open ? '<div class="ems-item-b">' + body + (noSave ? '' : '<button class="ems-save ems-save-sec" data-ems-save="1"' + (state.dirty ? ' style="background:var(--st-warn,#d98a1a)"' : '') + '>' + esc(state.dirty ? S.saveDirty : S.saveSec) + '</button>') + '</div>' : '') + '</div>';
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
      host.innerHTML = '<p class="warn">' + esc(S.noDevice) + '</p>';
      if (head) head.innerHTML = '<span class="st-open"></span>' + esc(S.devicesSec);
      return;
    }
    if (!state.cfg) return;
    var miss = missingRequired();
    if (head) head.innerHTML = (miss.length ? '<span class="st-open"></span>' : '<span class="st-check">✓</span>') + esc(S.devicesSec);
    var src = SOURCES.map(function (s) {
      return listRow('src-' + s.key, s.icon, s.color, S[s.label], tagHtml(srcTag(s)) + refBadge(refsFor([SRC_AREA[s.key]])) + (s.key === 'bat' && state.cfg.battery && state.cfg.battery.deviceId ? cmdRowBadge('battery.') : ''), srcSummary(s), srcBody(s));
    }).join('');
    var rows = state.rows.map(function (r, i) {
      var name = r.kind === 'charger' ? S.wallbox + (r.name ? ' (' + r.name + ')' : '') : (r.name || S.consumers.charAt(0) + S.consumers.slice(1).toLowerCase());
      var pr = prioRank(i);
      return listRow('row' + i, rowIcon(r), rowColor(r), name, (pr ? '<span class="ems-tag ems-tag-prio">' + esc(S.prioTag.replace('{n}', pr)) + '</span>' : '') + (r.kind === 'consumer' ? prioArrows(i) : '') + rowMissingBadge(r) + (r.kind === 'charger' ? refBadge(refsFor(['charger'])) : (r.deviceId ? refBadge(refsFor(['consumer'], 'consumer.' + r.deviceId)) : '')) + (r.deviceId ? cmdRowBadge(r.kind === 'charger' ? 'charger.' : 'consumer.' + r.deviceId + '.') : ''), { text: rowSub(r), cls: r.deviceId && r.control !== false ? 'ok' : 'muted' }, rowBody(r, i));
    }).join('');
    host.innerHTML = styleHtml()
      + setupHeadHtml()
      + '<p class="lbl">' + esc(S.sources) + '</p><div class="ems-list">' + src + '</div>'
      + '<p class="lbl">' + esc(S.consumers) + '</p><div class="ems-list">' + rows
      + '<div class="ems-item ems-add" data-ems-add="1"><span class="ems-ic" style="background:var(--st-seg-bg);color:var(--st-text)">' + icon('plus', 17) + '</span><span class="ems-item-n">' + esc(S.addConsumer) + '</span></div></div>'
      + '<p class="lbl">' + esc(S.sgTitle) + '</p><div class="ems-list">' + listRow('sg', 'boiler', '#e67e22', S.sgRow, refBadge(refsFor(['sgready'])) + cmdRowBadge('sgready.'), sgSummary(), sgBody()) + '</div>'
      + '<p class="lbl">' + esc(S.dhwTitle) + '</p><div class="ems-list">' + listRow('dhw', 'drop', '#2980b9', S.dhwRow, refBadge(refsFor(['dhw'])) + cmdRowBadge('dhw.'), dhwSummary(), dhwBody()) + '</div>'
      + '<p class="lbl">' + esc(S.fuseTitle) + '</p><div class="ems-list">' + listRow('fuse', 'bolt', '#c0392b', S.fuseRow, refBadge(refsFor(['fuse'])) + cmdRowBadge('shed.'), fuseSummary(), fuseBody()) + '</div>'
      + '<p class="lbl">' + esc(S.cmdLabel) + '</p><div class="ems-list">' + listRow('cmd', 'bolt', '#8e44ad', S.cmdRow, '', cmdSummary(), commandsHtml(), true) + '</div>'
      + '<p class="lbl">' + esc(S.paLabel) + '</p><div class="ems-list">' + listRow('learn', 'target', '#16a085', S.paRow, '', planAccuracySummary(), planAccuracyHtml(), true) + '</div>'
      + '<p class="lbl">' + esc(S.calcTitle) + '</p><div class="ems-list">' + listRow('calc', 'clock', '#6b7280', S.calcRow, '', { text: calcSummary(), cls: 'muted' }, calcBody()) + '</div>'
      + '<p class="lbl">' + esc(S.notifyTitle) + '</p><div class="ems-list">' + listRow('notify', 'clock', '#6b7280', S.notifyRow, '', { text: state.cfg.notify === false ? S.notifyOffS : S.notifyOnS, cls: 'muted' },
        '<div class="ems-row"><label class="ems-c"><span class="swt"><input class="sw" type="checkbox" data-ems-notify="1"' + (state.cfg.notify === false ? '' : ' checked') + '><i></i></span> <span>' + esc(S.notifyOn) + '</span></label></div><p class="ems-why">' + esc(S.notifyH) + '</p>') + '</div>'
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
      + '.pl-w .pl-axis-top{margin:0 0 2px}.pl-axis{position:relative;height:14px;margin-top:2px;font-size:10px;color:var(--st-muted)}.pl-axis span{position:absolute;transform:translateX(-50%)}'
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
    if (!c.deviceId && !(c.fallbackKwh > 0)) return ''; // Auto in Homey oder Energie je Abfahrt
    var car = (state.shadow && state.shadow.car) || null;
    var soc = car && car.soc !== null && car.soc !== undefined ? Math.round(car.soc) + ' %' : '';
    var parts = [((function () { var d = findDevice((state.cfg.car || {}).deviceId); return d && d.name ? d.name : S.carSocLbl; })() + ' ' + soc).trim()];
    if (!car) parts.push(S.carWaiting);
    if (carHolidayText()) parts.push(carHolidayText());
    if (car && car.departure) parts.push((car.byEnergy ? c.fallbackKwh + ' kWh' : car.departure.soc + ' %') + ' ' + S.pvUntilShort + ' ' + time(car.departure.at));
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
    if (!c.deviceId && !(c.fallbackKwh > 0)) return ''; // Auto in Homey oder Energie je Abfahrt
    var car = (state.shadow && state.shadow.car) || null;
    var sc = carSchedule();
    var lines = [];
    var socTxt = car && car.soc !== null && car.soc !== undefined ? Math.round(car.soc) + ' %' : '-';
    if (car && car.departure) {
      lines.push(S.carNext + ': ' + (car.byEnergy ? c.fallbackKwh + ' kWh' : car.departure.soc + ' %') + ' ' + S.pvUntilShort + ' ' + time(car.departure.at) + ' (' + (car.departure.source === 'override' ? S.carFromOverride : S.carFromCal) + ')');
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
    return !!(c && c.battery && c.battery.deviceId && c.battery.control && c.battery.control.enabled);
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
        // Nur ein Wechsel des Modus zählt
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
    try { return new Date(ms).toLocaleTimeString(LOCALE(), { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }); } catch (e) { return String(ms); }
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
    try { return new Date(ms).toLocaleDateString(LOCALE(), { timeZone: 'Europe/Zurich', weekday: 'short' }).replace(/\.$/, ''); } catch (e) { return ''; }
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
      var axisHtml = function (cls) { return '<div class="pl-axis' + cls + '">' + day.ticks.map(function (t) { return '<span style="left:' + (t.i / n * 100).toFixed(2) + '%">' + esc(t.label) + '</span>'; }).join('') + '</div>'; };
      body += '<div class="pl-w">' + nowLine + axisHtml(' pl-axis-top');
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
      body += axisHtml('');
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
    var ol = outlookCardHtml();
    if (!targets.length) return ol;
    var cur = targets.filter(function (t) { return t.id === d.target; })[0] || targets[0];
    var isCharger = cur.kind === 'charger';
    var opts = targets.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === cur.id ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('');
    var f = function (label, key, type, extra) {
      return '<label class="ems-f"><span>' + esc(label) + '</span><input type="' + type + '" data-ems-draft="' + key + '" value="' + esc(d[key]) + '"' + (extra || '') + '></label>';
    };
    return jobsListHtml() + ol + '<p class="lbl">' + esc(S.pvTitle) + '</p><div class="card" id="ems-preview-form"><p class="ems-why" style="margin-top:0">' + esc(S.pvIntro) + '</p>'
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
    host.innerHTML = styleHtml() + (noDevice() ? '' : carCardHtml()) + planHtml();
  }

  function renderMain() {
    renderPlan();
    var panel = $('ems-view-main');
    if (!panel || !state.cfg) return;
    state.renderedNoDevice = noDevice();
    // Ohne Energiemanagement-Gerät bleibt «Heute» frei davon; die Einladung steht unter «Einrichten» → EMS.
    panel.innerHTML = noDevice() ? '' : mainHtml();
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
        if ($('ems-bp-spread')) bb.minSpreadRp = num('ems-bp-spread', bb.minSpreadRp);
        if ($('ems-bp-bufmode')) bb.bufferMode = String($('ems-bp-bufmode').value || 'auto') === 'fixed' ? 'fixed' : 'auto';
        if (bb.bufferMode === 'fixed' && $('ems-bp-buffer')) bb.bufferPct = num('ems-bp-buffer', bb.bufferPct);
        if ($('ems-bp-backupsoc')) bb.backupReserve = Object.assign({ active: false, soc: 50 }, bb.backupReserve, { soc: num('ems-bp-backupsoc', (bb.backupReserve || {}).soc) });
      }
      if (s.key === 'bat' && state.open['src-bat'] && $('ems-bc-on')) {
        var bcc = state.cfg.battery.control = Object.assign({ enabled: false, live: false, normalDischargeW: 7000, repeatMin: 10 }, state.cfg.battery.control);
        bcc.enabled = chk('ems-bc-on');
        if ($('ems-bc-normal')) {
          bcc.normalDischargeW = num('ems-bc-normal', bcc.normalDischargeW);
          bcc.repeatMin = num('ems-bc-repeat', bcc.repeatMin);
        }
      }
      if (s.key === 'car' && state.open['src-car'] && $('ems-car-cap')) state.cfg.car = Object.assign({ deviceId: '', socCapability: 'measure_battery' }, state.cfg.car, { capacityKwh: num('ems-car-cap', state.cfg.car ? state.cfg.car.capacityKwh : 0) });
      if (s.key === 'car' && state.open['src-car'] && $('ems-car-fb')) state.cfg.car = Object.assign({ deviceId: '', socCapability: 'measure_battery' }, state.cfg.car, { fallbackKwh: Math.min(200, Math.max(0, num('ems-car-fb', state.cfg.car ? state.cfg.car.fallbackKwh || 0 : 0))) });
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
        if ($(p + 'minAmps')) r.minAmps = num(p + 'minAmps', r.minAmps);
        if ($(p + 'phases')) r.phases = Number($(p + 'phases').value) === 1 ? 1 : 3;
        if ($(p + 'phaseSwitch')) r.phaseSwitch = chk(p + 'phaseSwitch');
        if ($(p + 'autoOff')) r.autoOff = chk(p + 'autoOff');
        return;
      }
      r.controlKind = val(p + 'kind', r.controlKind || 'device');
      if (r.controlKind === 'flow') {
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
          waitForCheap: chk(p + 'humWait'), criticalAbove: num(p + 'humCrit', r.humidity.criticalAbove === undefined ? 75 : r.humidity.criticalAbove),
        };
      }
      if ($(p + 'pgSurplus')) {
        var pg0 = r.program || newConsumerRow().program;
        r.program = {
          minSurplusW: num(p + 'pgSurplus', pg0.minSurplusW), startSustainS: num(p + 'pgSustain', pg0.startSustainS), windowFrom: String(($(p + 'pgFrom') || { value: pg0.windowFrom }).value || ''), maxWaitH: num(p + 'pgWait', pg0.maxWaitH), durationH: num(p + 'pgDuration', pg0.durationH), startCapability: val(p + 'pgStartCap', pg0.startCapability), startValue: val(p + 'pgStartVal', pg0.startValue), remoteCapability: val(p + 'pgRemoteCap', pg0.remoteCapability), remoteOkValue: val(p + 'pgRemoteVal', pg0.remoteOkValue), doorCapability: val(p + 'pgDoorCap', pg0.doorCapability), doorOkValue: val(p + 'pgDoorVal', pg0.doorOkValue), stateCapability: val(p + 'pgStateCap', pg0.stateCapability), stateIdleValue: val(p + 'pgStateVal', pg0.stateIdleValue),
        };
      }
    });
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
      return r.kind === 'consumer' && r.control !== false && r.deviceId;
    }).map(function (r) {
      return {
        controlKind: r.controlKind === 'flow' ? 'flow' : 'device', flowOn: r.flowOn, flowOff: r.flowOff, assumedW: r.assumedW || 0,
        id: r.deviceId, name: r.name || 'Verbraucher', enabled: true, live: r.live === true, type: r.type, mode: r.mode,
        fullSoc: r.fullSoc, socOn: r.socOn, hysteresis: r.hysteresis, minSurplusW: r.minSurplusW, startSustainS: r.startSustainS, stopGraceS: r.stopGraceS,
        minRunMin: r.minRunMin, minOffMin: r.minOffMin, protectSoc: r.protectSoc, useForecastGate: r.useForecastGate, icon: r.icon || '', batteryFirstSoc: r.batteryFirstSoc === undefined ? null : r.batteryFirstSoc, humidity: r.humidity, accu: r.accu, program: r.program,
      };
    });
    var ems = {
      devices: { meter: c.devices.meter, house: c.devices.house, inverter: c.devices.inverter },
      battery: {
        deviceId: c.battery.deviceId, socCapability: c.battery.socCapability, targetSoc: c.battery.targetSoc, reserveHours: c.battery.reserveHours, solarLimitKwh: c.battery.solarLimitKwh, chargePowerKw: c.battery.chargePowerKw, bridge: c.battery.bridge !== false, bridgeLoadKw: c.battery.bridgeLoadKw, bridgeLoadMode: c.battery.bridgeLoadMode || 'auto', reserveMode: c.battery.reserveMode === 'fixed' ? 'fixed' : 'auto', floorSoc: c.battery.floorSoc, bufferMode: c.battery.bufferMode === 'fixed' ? 'fixed' : 'auto', bufferPct: c.battery.bufferPct !== undefined ? c.battery.bufferPct : 3,
        backupReserve: { soc: c.battery.backupReserve ? c.battery.backupReserve.soc : 50 }, // active geht nur über «Heute» oder einen Flow, nie über diesen Speichern-Knopf
        control: { enabled: !!(c.battery.control && c.battery.control.enabled), normalDischargeW: c.battery.control ? c.battery.control.normalDischargeW : 7000, repeatMin: c.battery.control ? c.battery.control.repeatMin : 10 },
      },
      charger: { id: charger ? charger.deviceId : c.charger.id, costName: charger ? charger.name : c.charger.costName, maxAmps: charger ? charger.maxAmps : c.charger.maxAmps, stepHoldS: charger ? charger.stepHoldS : c.charger.stepHoldS, minAmps: charger ? charger.minAmps : c.charger.minAmps, phases: charger ? charger.phases : c.charger.phases, phaseSwitch: charger ? charger.phaseSwitch === true : c.charger.phaseSwitch === true, chargeNowAutoOff: charger ? charger.autoOff !== false : c.charger.chargeNowAutoOff !== false, stateCapability: c.charger.stateCapability, powerCapability: c.charger.powerCapability, phaseCapability: c.charger.phaseCapability },
      pv: { factor: c.pv ? c.pv.factor : 1, factorAuto: !!(c.pv && c.pv.factorAuto), source: (c.pv && c.pv.source) || 'auto', device: (c.pv && c.pv.device) || { id: '', today: '', tomorrow: '' } },
      car: { schedule: c.car && c.car.schedule ? c.car.schedule : undefined, deviceId: c.car ? c.car.deviceId : '', socCapability: c.car ? c.car.socCapability : 'measure_battery', capacityKwh: c.car ? Number(c.car.capacityKwh) || 0 : 0, fallbackKwh: c.car ? Number(c.car.fallbackKwh) || 0 : 0 },
      share: shareCollect(c.share),
      refreshS: Number(c.refreshS) || 0,
      notify: c.notify !== false,
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
      return load();
    }).then(function () {
      state.dirty = false;
      state.suggested = {};
      setMsg(S.saved);
      render();
    }).catch(function (e) { setMsg(S.error + ': ' + (e && e.message || e)); });
  }

  // Bewusst kein Auto-Speichern: die Einstellungen steuern echte Geräte, ein halb getippter Wert (z. B. «4» auf dem Weg zu «45»)
  // darf nie gespeichert werden. Stattdessen zeigt der Knopf unübersehbar an, dass noch Änderungen offen sind.
  var AUTOSAVE_SKIP = ['data-ems-enable', 'data-ems-toggle', 'data-ems-silent', 'data-ems-draft', 'data-ems-carf', 'data-ems-carcal', 'data-ems-cnlim', 'data-ems-calc', 'data-ems-notify'];
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
    var refClear = up(t, 'data-ems-refclear');
    if (refClear) {
      api('POST', '/ems/ref-clear', { key: refClear }).then(function (r) {
        state.refs = (r && r.issues) || [];
        state.cfg = null; state.built = false; // Konfiguration neu vom Homey holen
        return load();
      }).then(function () { state.dirty = false; render(); }).catch(function (e) {
        var m = $('ems-ref-msg'); if (m) m.textContent = (e && e.message) || S.error;
      });
      return;
    }
    if (up(t, 'data-ems-refcheck')) {
      var rm = $('ems-ref-msg'); if (rm) rm.textContent = S.refChecking;
      loadRefs(true).then(function () { render(); });
      return;
    }
    if (up(t, 'data-ems-cmdcheck')) {
      cmdNote('_check', S.cmdChecking, 'muted');
      loadCmdFlows().then(function (okc) {
        cmdNote('_check', okc ? S.cmdChecked : S.cmdCheckFail, okc ? 'ok' : 'bad', 6000);
      });
      return;
    }
    var cmdTest = up(t, 'data-ems-cmdtest');
    if (cmdTest) {
      cmdNote(cmdTest, S.cmdSending, 'muted');
      api('POST', '/ems/command-test', { id: cmdTest }).then(function () {
        cmdNote(cmdTest, '✓ ' + S.cmdSent, 'ok', 20000);
      }).catch(function (e) {
        cmdNote(cmdTest, '✗ ' + S.cmdTestFail + ' ' + ((e && e.message) || ''), 'bad', 30000);
      });
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
      if (state.open[open]) refreshDevices();
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
    if (g('data-ems-notify') !== null) {
      var notifyOn = !!t.checked;
      api('PUT', '/ems/config', { notify: notifyOn }).then(function () { state.cfg.notify = notifyOn; }).catch(function () { t.checked = !notifyOn; });
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
      if (fzk) fzk.offFlow = t.value === 'flow' ? { id: 'command', advanced: false, name: '' } : null;
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
    if (g('data-ems-bploadmode') !== null || g('data-ems-bpmode') !== null || g('data-ems-bpbufmode') !== null) { sync(); renderSetup(); return; }
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
    if (main) main.hidden = which !== 'main';
    [[$('ems-sub-main'), which === 'main']].forEach(function (p) {
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
    LANG = ['de', 'fr', 'it'].indexOf(lang) >= 0 ? lang : 'en';
    S = STR[LANG];
    var btn = $('t-ems');
    if (btn) btn.textContent = S.tab;
    var sm = $('ems-sub-main'); if (sm) sm.textContent = S.subMain;
    var sub = $('ems-sub'); if (sub) sub.addEventListener('click', onSubClick);
    ['ems-view-main', 'ems-view-plan', 'ems-view-devices'].forEach(function (id) {
      var host = $(id);
      if (host) { host.addEventListener('click', onClick); host.addEventListener('change', id === 'ems-view-devices' ? function (ev) { onChange(ev); onEdit(ev); } : onChange); }
      if (host && id === 'ems-view-devices') host.addEventListener('input', onEdit);
    });
    return Promise.all([
      load(),
      api('GET', '/ems/devices').then(function (r) { state.devices = r.devices || []; state.devicesAt = Date.now(); }).catch(function () { state.devices = []; }),
      api('GET', '/ems/flows').then(function (r) { state.flows = (r && r.flows) || []; }).catch(function () { state.flows = []; }),
      loadCmdFlows(),
      loadRefs(true),
    ]).then(function () {
      render(); startTimer();
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
