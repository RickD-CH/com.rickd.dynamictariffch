# EMS (Energiemanagement) in dieser App

Ab 0.3.0 (noch nicht veröffentlicht) enthält die App ein **Energiemanagement-Modul** (`lib/ems/`). Es ist
standardmässig **aus**: ohne Häkchen unter Einstellungen → "Energiemanagement" gibt es keine Zugriffe und keine Timer.

## Was es tut

| Bereich | Verhalten | Steuerung |
|---|---|---|
| **Wallbox (go-e)** | Solar-Überschuss laden in Ampere-Stufen (6-16 A), Phasenumschaltung, Haltezeiten, Schutz vor Netzbezug, Batterie-Schutz (Rampe 50-80 %), "Akku voll"-Regel, Prognose-Sperre, Sofortladen, Hauptsicherungsgrenze | live (`charger.live`) oder Trockenlauf |
| **Verbraucher** (z. B. Luftentfeuchter, bis 8) | Einschalten bei voller Batterie, ab gewähltem SoC oder bei Überschuss; Mindestlaufzeit, Mindest-Pause, Schutz-SoC, Prognose-Sperre | live (je Verbraucher `live`) oder Trockenlauf |
| **Batterie** | Planer für Laden/Halten/Normal auf 15-Minuten-Slots; Steuerung über die Karten des Batterie-Geräts (siehe unten) | Silent-Modus oder live |

Trockenlauf = es wird gerechnet und protokolliert, **kein Gerät wird geschaltet**.

## Aufbau

```
lib/ems/
  planner/        reine Entscheidungslogik, ohne Homey, ohne feste IDs (getestet)
    slots.js battery.js charger.js consumer.js forecastGate.js
  Config.js       Standardwerte (Richards Haus) + Prüfung der Konfiguration
  PriceFeed.js    15-min-Preise aus dem eigenen PriceStore
  PvFeed.js       PV-Prognose (Homey, Gerät oder eingeliefert)
  Inputs.js       Messwerte lesen (homey-api); ein anderes EMS nur zum Vergleich
  Actuators.js    EINZIGE Stelle, die Geräte schaltet (go-e Flow-Karten, onoff)
  EmsRunner.js    ein Durchlauf: lesen -> entscheiden -> protokollieren -> (live) senden
  EmsController.js  Zeitplanung, Konfiguration, Anbindung an App und API
  ShadowLog.js    Protokoll und Vergleich mit einem anderen EMS
settings/ems.js  Reiter "Energiemanagement"
```

Wallbox-Befehle sind die Flow-Karten der Wallbox:
`evcharger_charging_start` und `target_power_set` (Watt = A × Phasen × 230, Stopp = 0 W).

## Regeln

- **Nie zwei Steuerungen auf demselben Gerät.** Vor `charger.live`: in einem anderen EMS die Wallbox ausschalten.
  Der Reiter warnt, wenn ein anderes EMS die Wallbox trotzdem steuert.
- Erster Lauf nach dem Start oder Umschalten auf live: nur beobachten, nichts senden.
- Fehlt der Netzzähler oder die Wallbox ist nicht lesbar: nichts senden.
- Fremdgesteuerte Verbraucher (von Hand eingeschaltet) werden nicht angefasst.
- Die Berechtigung `homey:manager:api` ist nötig (Messwerte und Schalten fremder Geräte). Im Store bedeutet
  das eine strengere Prüfung. Offen: ob eine Store-Version ohne sie auskommt.

## Add-ons (nach dem Basistest)

Weicher Solar-Tor (`battery.solarMinKwh`, aus), Ladeslot zu Ende laden (an), Reserve nach Energie,
Restliche PV vom Netzladen abziehen, Zielwert-Toleranz, Verbrauchsprognose aus `energyforecast`.
Jedes Add-on: Schalter, Test mit echten Tagen, Kennzahl im Schattenprotokoll, erst dann live.

## Plan-Sicht (Reiter EMS, unten im Betrieb)

`GET /ems/plan` (`EmsController.getPlan`, reine Logik in `lib/ems/PlanView.js`): heute und (sobald Preise da sind)
morgen im Viertelstunden-Raster. Zeilen: Preis (Niveau relativ zum Tagesmittel, günstigster 2-h-Block ab jetzt),
Solar-Prognose, Batterie, Wallbox, Verbraucher.

- **Nur die Batterie hat einen echten Plan** (`planned: true`, gestrichelt): Ladeslots und Reserve-Slots des Planers
  (Vergleichsmodus). Bis jetzt zeigt sie den Verlauf.
- **Wallbox und Verbraucher regeln nach dem aktuellen Überschuss.** Sie zeigen nur den Verlauf aus `PlanLog`
  (je Viertelstunde ein Eintrag, 49 Stunden, höchstens alle 2 Minuten gespeichert). Im Testbetrieb ist das die Simulation.
- Eigene Zeilen für Preislogik der Wallbox/Verbraucher kommen mit den nächsten Etappen (günstig bis Abfahrt,
  günstigster Block bis Frist).

## Aufträge (Plan-Sicht: «Übernehmen»)

Unter dem Plan: Gerät (Wallbox oder Verbraucher), «Fertig bis» (nächstes Mal diese Uhrzeit), Menge (kWh Wallbox, Stunden
Verbraucher), optional Leistung, Höchstpreis und «am Stück». «Vorschau» rechnet nur, «Übernehmen» speichert den Auftrag
(`JobStore`, ein Auftrag je Ziel) und das EMS führt ihn aus.

- **Planung** (`planner/jobs.js`): günstigste Viertelstunden vor der Frist (oder günstigster Block), unter der Preisgrenze.
  `stepJob` plant bei jedem Lauf neu mit den aktuellen Preisen (neue Preise ab ca. 16 Uhr, Auto nicht angesteckt).
  Gezählt werden nur **abgeschlossene Viertelstunden, in denen der Auftrag wirklich lief**; eine begonnene Viertelstunde
  wird zu Ende geführt, ein begonnener Block läuft am Stück weiter.
- **Wallbox:** in der gewählten Viertelstunde wie «Sofort laden» (volle Leistung, Netzbezugsgrenze gilt), nur mit
  angestecktem Auto; ausserhalb der Slots gilt die normale Überschuss-Regel. Die eingegebene Leistung dient der Planung
  (Dauer = kWh / kW), nicht der Begrenzung.
- **Verbraucher:** im Slot EIN (geht vor Batterie- und Überschuss-Regel, der Feuchte-Notlauf geht noch vor);
  ausserhalb gilt die normale Regel.
- **Testbetrieb:** wie überall, `live` je Gerät. Ohne live wird nur simuliert (Plan-Verlauf zeigt es als Lauf).
- Fertige und abgelaufene Aufträge verschwinden selbst. API: `GET/POST /ems/jobs`, `DELETE /ems/jobs/:id`.

## Rechenintervall (Setup → EMS → Berechnung)

`refreshS` (Config): 0 = automatisch (15 s mit Auto an der Wallbox, 30 s mit Verbrauchern, sonst 5 min), oder fest 15/30/60/300 s
für den Lauf von Wallbox und Verbrauchern (`EmsRunner.tickCharger`). `tickMinutes` (1-15) ist der Takt des Batterie-Plans (nur Vergleich).
Jeder Lauf liest jedes gewählte Gerät einmal (Netzzähler, Haus, Wechselrichter, Batterie, Wallbox, Verbraucher, Feuchte-Sensoren): Die Einstellungen
zeigen «N Geräte, ca. M Abfragen pro Stunde». Kürzer = schneller, aber mehr Last auf Homey (Rate-Limit); Halte- und Karenzzeiten wirken nur im Takt des Laufs.

## Plan-Sicht: Legenden, Tabelle, erreichte Solarleistung

- Jede Grafik hat ihre Legende direkt darunter (Preis, Solar, Batterie, Wallbox, Verbraucher, Auftrag).
- Tabelle «Ab jetzt» über beide Tage, solange Preisdaten da sind (unabhängig vom gewählten Tag): neue Zeile bei jedem Wechsel von
  Preisniveau oder Zustand, mit Durchschnittspreis und Preisniveau-Punkt. Vergangenes steht nicht drin (das zeigen die Grafiken).
- Solar: Prognose als blasse graue Balken, die tatsächlich gelieferte Leistung als Linie darüber (`PlanLog.p`, Mittel der gemessenen
  PV-Leistung je Viertelstunde, ab dem Start der Aufzeichnung) und «bisher erreicht x kWh» in der Kennzahl.
- Offen: Quelle der Solarprognose (Favorit: Homey selbst, sonst eingeliefert per Flow-Aktion).

## Solarprognose: Quellen (Setup → EMS → Solarprognose)

`pv.source`: `auto` (Standard), `homey`, `device`, `external`.

- **external:** eingelieferte Prognose per Flow-Aktion «PV-Prognose setzen» (Stundenwerte, am genauesten).
- **homey:** Tageswerte aus den Homey-Energie-Tags `homey:manager:energy:solarForecastTodayKwh` / `...TomorrowKwh` (`Inputs.solarForecast`).
- **device:** zwei Capabilities eines Geräts (z. B. Forecast.Solar: heute, morgen).
- **auto:** eingelieferte Prognose, solange sie frisch ist (12 h), sonst Homey, sonst das gewählte Gerät.

Tageswerte werden höchstens alle 15 Minuten gelesen und mit `SolarCurve.dailyCurve` zu einer Glockenkurve zwischen Sonnenaufgang und
-untergang (sin^1.6, Ort aus den Homey-Einstellungen) verteilt, mit dem Korrekturfaktor multipliziert. Das ist eine Näherung ohne Wolkenverlauf.
Ist die Quelle nicht lesbar, gibt es keine Prognose (die Prognose-Sperre bleibt dann offen, der Plan zeigt keine Solar-Zeile).

## Verbraucher per Homey-Flow schalten

Ein Verbraucher kann statt über ein Gerät (`onoff`) über zwei Flows geschaltet werden (`controlKind: 'flow'`, `flowOn`, `flowOff`, `assumedW`).
Die Flows werden aus allen **startbaren** Flows (Start-Trigger «Dieser Flow wird gestartet», `triggerable`) gewählt, Standard- und erweiterte Flows
(`Inputs.listFlows`, `Actuators._triggerFlow` über `flow.triggerFlow` / `flow.triggerAdvancedFlow`). Der Verbraucher bekommt eine künstliche ID `flow:<id>`.

- Der Ist-Zustand ist unbekannt: die App führt den Zustand selbst (wie im Testbetrieb) und erkennt keine Eingriffe von Hand.
- `assumedW`: Leistung, mit der die Überschussrechnung rechnet, solange der Verbraucher läuft (sonst fiele er nach dem Einschalten wegen des
  gesunkenen Exports wieder aus).
- Aufträge, Modi, Mindestlaufzeit, Plan-Sicht und Testbetrieb (`live` je Verbraucher) gelten gleich. Im Testbetrieb startet kein Flow.

## E-Auto (optional) und Aufträge mit Ziel-Ladestand

Setup → Datenquellen → «E-Auto» (empfohlen, nicht Pflicht): Gerät des Autos mit Ladestand (`car.deviceId`, `car.socCapability`, Standard `measure_battery`)
und Batteriegrösse (`car.capacityKwh`). Der Ladestand steht in der Betriebsansicht («E-Auto 54 %») und im Plan-Formular. Mit Auto kann ein Auftrag
als «Ziel-Ladestand bis Uhrzeit» eingegeben werden: Energie = (Ziel - Ladestand) / 100 x Batteriegrösse, gespeichert als kWh (mit `targetSoc`, `startSoc`).
Ohne Auto bleibt die Eingabe in kWh. Der Ladestand wird beim Speichern einmal gelesen; ein laufender Auftrag zählt Viertelstunden, er rechnet nicht
laufend mit dem Ladestand nach (Ausbau möglich).

## Zählerstände: Weg der Speisung

Die Zählerstände (Netzbezug, Einspeisung, Batterie laden/entladen, Verbraucher) kommen auf zwei Wegen ins Innostrom-Gerät: **Auswahl** (`MeterReader`
liest das gewählte Gerät alle 15 Minuten selbst, meldet mit `via: 'auto'`) oder **Flow-Karten** «Zählerstand melden» (`via: 'flow'`, wie bisher). Beides
gleichzeitig ist erlaubt, der jüngste Wert zählt. Das Gerät merkt sich je Zähler, wann zuletzt über welchen Weg gemeldet wurde (`reportSeen`, im Store,
mit dem Kostenspeicher geschrieben). Die Einstellungen (Preis-App → Zählerstände) zeigen die Übersicht «Wie wird jeder Zähler gespeist?»: Auswahl, Flow,
beides oder nicht gespeist, mit Gerät, Wert und letzter Meldung je Weg. Automatisches Lesen ist standardmässig aus.

Lese-Takt der Zählerstände (`meters.intervalMin`): 5, 10, 15 (Standard), 30 oder 60 Minuten, kurz nach der Grenze. Die App liest einmal ~20 s nach dem Start,
einmal beim Speichern und über den Knopf «Jetzt lesen und aktualisieren» (`POST /meters/run`). Kürzer = aktuellere Kostenwerte, mehr Abfragen an Homey.

## Aufbau der Einstellungsseite (Reiter)

| Reiter | Inhalt | Zweck |
|---|---|---|
| **Heute** | Aktuelle Werte (Preis jetzt), «Heute in Zahlen» (Ist = dynamischer Tarif, Soll = Referenztarif, Ersparnis), Betrieb des EMS (Status, Schalter je Gerät), Status | Alltag: Ist und Soll |
| **Ausblick** | Plan (Preis, Solar, Batterie, Wallbox, Verbraucher, Aufträge), Tabelle «Ab jetzt», aktive Aufträge, Auftrag planen | Look ahead |
| **Kosten** | Verlauf der Kosten und Ersparnis, Verbraucher, Batterie-Potenzial | Rückblick |
| **Einrichten** | Allgemein (Darstellung, Daten, Hilfe), Preis-App (Referenztarif, Zählerstände, ...), EMS (Datenquellen, Verbraucher, Berechnung), Vergleich (nur Testphase) | einmalig |

## Robustheit (10.11.2026)

- **Protokolle:** `ShadowLog` speichert sofort bei einem Wechsel, sonst höchstens alle 5 Minuten (vorher bei jedem Lauf, bis 240-mal pro Stunde).
- **Fehlerfall der Wallbox im Live-Betrieb** (`planner/charger.failSafe`): Netzzähler oder Wallbox nicht lesbar → nach 60 s auf Mindeststrom, nach 5 min
  Stopp. Nur für Laden, das das EMS selbst gestartet hat. Bei ausdrücklich verlangtem Laden (Sofort laden, Auftrag) bleibt es beim Mindeststrom.
- **Verbraucher:** höchstens 8 gesteuerte Verbraucher (`MAX_CONSUMERS`); die Oberfläche lehnt mehr beim Speichern mit einer Meldung ab.
- **Nur Preise:** `homey-api` wird erst beim ersten Lesen oder Schalten geladen; ohne EMS-Gerät und ohne Zähler-Auswahl gibt es keine Timer und keinen Zugriff
  auf andere Geräte (`test/price-only.test.js`).

## Vergleich hinter einem Schalter, Protokoll (11.11.2026)

- `compare` (Config, Standard aus): nur wenn ein, liest das EMS die fremde App (`andiBatteryPlan`, Vergleichs-Gerät, Prognose-Rückfall). Wer schon
  eine Vergleichsquelle gewählt hatte, bleibt eingeschaltet. Schalter in Einrichten → Vergleich. Vor der Veröffentlichung fallen Ansicht, Code und die
  Berechtigung `homey:app:com.huawei.fusionsolar` ganz weg.
- **Protokoll** unter «Heute» (nach dem Betrieb): die letzten 12 Schaltungen der Verbraucher und Moduswechsel der Wallbox mit Grund, ohne Fremdnamen.
  Es bleibt, wenn der Vergleich wegfällt.

## Silent-Modus und Batteriesteuerung (11.11.2026)

**Silent-Modus** (`silent`, Standard **an**): globaler Schalter unter «Heute». Solange er an ist, wird nichts geschaltet, egal wie die Schalter je
Gerät stehen (Wallbox, Verbraucher, Batterie). Alle Entscheide werden berechnet und protokolliert («Protokoll», `batteryEvents`, `consumerEvents`,
Wallbox-Wechsel). Scharf schalten = Silent aus und das Gerät auf live.

**Batteriesteuerung** (`battery.control`, Standard aus; `lib/ems/planner/batteryControl.js`):
- Der Batterie-Planer liefert alle `tickMinutes` einen Modus: `charge` (Netzladen), `hold` (Entladung sperren), `normal`.
- Eine **Vorlage** übersetzt den Modus in Aktionskarten des Batterie-Geräts (über `flow.runFlowCardAction`, `Actuators.battery`). Erkannt wird sie an den
  Karten, die das Gerät anbietet (`GET /ems/battery-cards`). Heute gibt es eine Vorlage (`luna2000`):
  - Laden: «Laden mit {Ladeleistung} W bis {Ziel-SoC} % starten»
  - Halten: Zwangsladen stoppen, maximale Entladeleistung 0 W
  - Normal: Zwangsladen stoppen, Betriebsmodus «Eigenverbrauch maximieren», maximale Entladeleistung {normal, Standard 7000 W}.
    Die Freigabe der Entladung wird ausgelassen, solange das Auto lädt (> 500 W), und danach nachgeholt.
- Gesendet wird bei jedem Moduswechsel, Laden und Halten zusätzlich alle `repeatMin` (Standard 10) Minuten. Erster Lauf nach dem Start oder Umschalten:
  nur beobachten. Ein fehlgeschlagener Befehl gilt als nicht gesendet und wird beim nächsten Lauf wiederholt.
- **Freigabe:** Wird das EMS ausgeschaltet und hat die App zuletzt Laden oder Halten gesendet, sendet sie Normal.
- **Live** nur mit Silent aus **und** Schalter «Batterie» auf live (`/ems/toggle` mit `target: 'battery'`).
- **Nur ein System pro Batterie:** vor live die Batterie-Steuerung im anderen Energiemanagement und eigene Batterie-Flows ausschalten.
- Offen: Vorlagen für andere Batterien (oder freie Karten-Auswahl je Modus).

## E-Auto: Wochenkalender und «Nächste Abfahrt» (11.11.2026)

`car.schedule` (`lib/ems/planner/carSchedule.js`): Wochenkalender Mo bis So (an/aus, Abfahrt, Ziel-SoC), Ferienmodus (pausiert den Kalender),
«Netz nachladen» (Standard an) und «Nächste Abfahrt» (`override`, für heute oder morgen; überschreibt den Kalender an diesem Datum, auch mit «nicht laden»).

- Bei jedem Wallbox-Lauf: nächste Abfahrt bestimmen, mit dem **aktuellen** Ladestand die Energie rechnen ((Ziel - SoC) / 100 x Batteriegrösse) und die
  günstigsten Viertelstunden bis zur Abfahrt wählen (Leistung = Maximalstrom x Phasen). In einer gewählten Viertelstunde lädt die Wallbox mit voller Leistung,
  nur mit angestecktem Auto. Ausserhalb gilt die Überschuss-Regel (Solarstrom). Ziel erreicht = kein Laden mehr.
- «Netz nachladen» aus: kein Plan, nur Solarstrom.
- Anzeige: kurze Auto-Zeile unter «Heute»; unter «Ausblick» die Auto-Karte (Ladestand, nächstes Ziel, Status, «Heute oder morgen anders», einklappbare Wochenvorlage Mo bis So mit eigenem Ziel je Tag, Ferien, «Netz nachladen»), Zeile «E-Auto» im Plan.
- Einrichten → EMS → E-Auto: Gerät, Ladestand-Wert, Batteriegrösse.
- Offen: Solar-Vorrang in der Planung (Viertelstunden mit erwartetem Überschuss bevorzugen), Flow-Karte «Ziel setzen».

## Flow-Karten des Energiemanagements, Sofortladen, Solar fürs Auto (11.11.2026)

- Auslöser **«Ein Fehler ist aufgetreten»** (`ems_error`, Tokens Bereich `charger|battery|data` und Meldung): je neues
  Problem einmal. «Geräte noch nicht gewählt» zählt nicht, Zusätze wie « - Mindeststrom» ergeben kein neues Problem.
- Auslöser **«Das E-Auto hat sein Ziel erreicht»** (`ems_car_target_reached`, Ladestand und Ziel): beim Wechsel auf
  «erreicht», nicht beim Start der App.
- Aktionen **«Silent-Modus setzen»** (`ems_set_silent`), **«Ziel des E-Autos für heute oder morgen setzen»**
  (`ems_car_set_target`, übersteuert die Vorlage an diesem Tag), **«E-Auto: Wochenvorlage gilt wieder»**
  (`ems_car_clear_target`), **«Sofort laden ein- oder ausschalten»** (`ems_charge_now_set`, wie der Schalter am Gerät);
  Bedingungen **«Silent-Modus ist an»** (`ems_silent_is_on`), **«Sofort laden ist ein»** (`ems_charge_now_is_on`). Die
  eigene Capability `ems_charge_now` bekommt von Homey keine automatischen Flow-Karten (nur Standard-Capabilities wie
  `onoff` haben das), darum diese zwei eigenen Karten (13.11.2026).
- **Sofort laden** geht aus, wenn das Auto abgesteckt wird (`charger.chargeNowAutoOff`, Standard an, Einrichten →
  Wallbox → Erweitert). Nur nach einem gesehenen Wechsel angesteckt → abgesteckt, nicht nach einem Neustart.
- **E-Auto: Solarstrom bevorzugen.** Viertelstunden, in denen die frische PV-Prognose minus 0.5 kW Grundlast mindestens
  1.4 kW übrig lässt, zählen bei der Auswahl als kostenlos (`solarAdjusted`). Ohne frische Prognose wie bisher nur Preise.
- **Ferien mit Enddatum** (`schedule.holidayUntil`, bis und mit; leer = bis ausgeschaltet).
- Plan-Sicht: die Batterie-Zeile sagt, ob sie nur **Empfehlung** ist (keine Steuerung eingerichtet), **Test** (Silent
  oder nicht live) oder **gesteuert**.

## Wiederkehrende Aufträge (11.11.2026)

- Formular unter «Ausblick»: **Wiederholen** einmalig (Standard), täglich, Mo bis Fr, Sa und So (`job.repeat`).
- Erledigt oder abgelaufen → nicht gelöscht, sondern auf die nächste Frist gesetzt (`rollJob`). Geplant wird je Lauf
  nur in den 24 Stunden vor der Frist und nie vor der alten Frist (`job.from`), damit ein um 3 Uhr fertiger Auftrag
  nicht gleich nochmals läuft und am Freitag nicht schon für Montag.
- Ziel-Ladestand nur einmalig; jede Woche gleich = Wochenvorlage des E-Autos.
- **Geräte mit Programmstart** (Geschirrspüler, Waschmaschine mit Startverzögerung): als Verbraucher «per Flow»
  einrichten, nur den Ein-Flow wählen (Aus leer lassen, wird übersprungen), Auftrag mit Laufzeit «am Stück».

## Andere Batterien: eigene Zuordnung (11.11.2026)

- Einrichten → Hausbatterie → «Batterie steuern». Ohne erkannte Vorlage (oder mit «Zuordnung: eigene Zuordnung»)
  wählt man je Modus (Laden, Halten, Normal) bis 4 Aktionskarten des Batterie-Geräts und deren Argumente
  (`battery.control.preset = 'custom'`, `battery.control.custom`).
- Zahlenfelder nehmen auch Platzhalter: `{power}` (Ladeleistung W), `{target_soc}` (Ziel-Ladestand %),
  `{normal_discharge}` (normale Entladeleistung W). Bei Normal pro Karte «nicht, solange das Auto lädt».
- Ein Modus ohne Karte sendet nichts. Silent-Modus und der Live-Schalter der Batterie gelten wie bei der Vorlage.
- Bietet das Gerät keine Aktionskarten, kann es nicht gesteuert werden (Hinweis in der Einrichtung).

## Hausanschluss-Schutz (11.11.2026)

- Einrichten → EMS → **Hausanschluss**: Sicherung (Standard 40 A), Reserve (90 % = Grenze 36 A pro Phase), Zähler mit
  Phasenströmen (Standard Netzzähler, `measure_current.phase1-3`), Wartezeit (10 s), Freigabe (5 min).
- **Stufe 1, Drosseln** (`fuse.throttle`, Standard an): bei jedem Lauf bekommt die Wallbox höchstens den freien Strom der
  knappsten Phase, die sie nutzt (Grenze minus Phasenstrom plus eigener Wallbox-Strom; einphasig Phase 1). Unter dem
  Mindeststrom Stopp. Gilt für die Wallbox-Steuerung des EMS (`applyFuseCap`, `chargerCapAmps`).
- **Stufe 2, Abschalten**: liegt eine Phase länger als die Wartezeit über der Grenze, wird der nächste laufende Eintrag
  der Liste ausgeschaltet (Wallbox, Geräte mit onoff oder Thermostat-Modus «off», oder ein Flow), danach jeweils nach
  einer weiteren Wartezeit der nächste. Standard-Liste: Wallbox.
- **Freigabe**: alle Phasen mindestens 2 A unter der Grenze während der Freigabezeit. Die Wallbox darf wieder laden,
  ausgeschaltete Geräte bleiben aus; EMS-Verbraucher in der Liste schaltet das EMS bis zur Freigabe nicht ein.
- **Echtzeit**: das EMS meldet sich auf die drei Phasenströme an (`Inputs.watch`); ab 1 A unter der Grenze wird sofort
  gerechnet (höchstens alle 3 s), bei Überlast alle 5 s, sonst mit Schutz höchstens alle 30 s.
- **Live**: eigener Schalter «Schutz live», der Silent-Modus hat Vorrang. Ohne live wird nur protokolliert.
  Eine Wallbox, die das EMS nicht steuert, wird live direkt gestoppt (wie im bisherigen Flow).
- Auslöser **«Der Hausanschluss ist überlastet»** (`ems_fuse_overload`: Strom, Phase, Aktion, live) bei Überschreiten,
  Drosseln und Abschalten. Heute zeigt eine Zeile (höchste Phase, Grenze, Drosselung, Ausgeschaltetes), das Protokoll
  die Ereignisse.
- Übergang: solange der Schutz nicht live ist, bleibt der eigene Flow «Hausanschluss 40A ...» der Schutz. Beim
  Live-Schalten die entsprechenden Zweige im Flow ausschalten.

## Verbraucher mit Akku (11.11.2026)

- Jeder Verbraucher kann einen **Akku-Block** haben (keine eigene Kategorie): Ladestand von einem Gerät und Wert
  (`consumer.accu`), z. B. eBike an einer Steckdose. Werte 0 bis 1 werden zu Prozent.
- Ab **stopAt** (80 %) aus, auch während Auftrag oder Mindestlaufzeit; wieder frei erst unter **resumeBelow** (75 %).
- Unter **chargeBelow** (20 %) wird auch ohne Überschuss geladen, bis chargeBelow + 10 %.
- **maxRunMin** (240 min) am Stück: aus und gesperrt wie «voll» (Schutz bei ausfallendem Ladestand). Die Sperre endet
  unter resumeBelow, ohne lesbaren Ladestand nach 12 Stunden. 0 = ohne Höchstdauer.
- **Hausbatterie zuerst bis … %** (`consumer.batteryFirstSoc`, nur Modus Überschuss): leer = gemeinsame Regel mit der
  Wallbox (Hartstopp und Rampe). Eine Zahl = eigene Grenze; darüber zählt auch die Ladeleistung der Hausbatterie als
  Überschuss, der Verbraucher kommt also vor der Batterie (sinnvoll für kleine Verbraucher wie das eBike, z. B. 0).

## Solarprognose: echter Verlauf von Homey (12.11.2026)

- Quelle «Homey»: neben den Tagessummen (Flow-Tags) liest das EMS den Energie-Tagesbericht
  (`energy.getReportDay`, Feld `solarForecastMeasurePower`, Watt je Viertelstunde) für heute und morgen.
- Ist ein Verlauf da, wird er verwendet (mit Korrekturfaktor); sonst wie bisher die Tagessumme als Sonnenkurve.
  Den Bericht für morgen legt Homey an, sobald die Prognose vorliegt; vorher gilt für morgen die Kurve.
- `pv.daily.shape` sagt je Tag, ob der Verlauf von Homey (`homey`) oder die Kurve (`curve`) gilt.

## Batterie: Morgen überbrücken, Planung unter Einrichten (13.11.2026)

- **Morgen überbrücken** (`battery.bridge`, Standard an): greift die Solar-Grenze (`solarLimitKwh`), lädt der Planer
  trotzdem so viel, wie die teuren Reserve-Viertelstunden bis zum Moment brauchen, in dem die PV-Prognose den
  Morgenverbrauch deckt (`bridgeLoadKw`, Standard 1 kW). Untergrenze `floorSoc` (10 %), Wirkungsgrad 0.9. Geladen wird
  nur vor der Lücke und nur, wenn Ladepreis / 0.9 unter dem Durchschnitt der Lücke liegt. Grund im Protokoll:
  «Morgen überbrücken: 27 % bis Sonne (09:00)».
- Anlass: Wochentest 13.11. - 23 % Ladung um 06:00 bei 38.8 bis 43 Rp. von 07:00 bis 09:00, Netzladen wegen 24.6 kWh
  Sonne gesperrt (beide EMS gleich).
- **Planung** (Spitzenstunden = `reserveHours`, Ziel, Ladeleistung, Solar-Grenze, Überbrücken) steht unter Einrichten →
  Hausbatterie, nicht mehr in der Vergleichsansicht.
- Batterie-Protokoll: Wiederholungen (alle 10 min bei Laden/Halten) sind keine eigenen Einträge mehr.
- **Gelernter Hausverbrauch** (`lib/ems/LoadProfile.js`): bei jedem Wallbox-Lauf wird der Hausverbrauch (Hausverbrauch-
  Quelle) der lokalen Viertelstunde des Tages zugeordnet; Durchschnitt je Viertelstunde über die letzten 7 Tage
  (mindestens 3 Messungen je Viertelstunde und Tag). `battery.bridgeLoadMode` = `auto` (Standard) nimmt diese Werte,
  `fixed` den festen `bridgeLoadKw`. Ohne Messungen gilt der feste Wert.
- **Vorschau:** der Planer liefert `bridgeInfo` (Status charge/enough/unprofitable/nogap/nosun, Bedarf, vorhanden,
  Nachladen, Zeiten, verwendeter Verbrauch). Angezeigt unter Einrichten → Hausbatterie → Planung und im Ausblick unter
  der Batterie-Zeile.

## Batterie-Fahrplan und Franken-Auswertung (13.11.2026)

- **Fahrplan** (`lib/ems/planner/batterySchedule.js`, `battery.reserveMode = 'auto'`, neuer Standard): Ladung in die
  teuersten Viertelstunden bis zum nächsten Nachladen statt einer festen Anzahl Spitzenstunden. Bedarf je Viertelstunde
  = gelernter Hausverbrauch minus PV-Prognose (bis 36 h). Teure Viertelstunden der Reihe nach decken: zuerst Ladung und
  Solarüberschuss, sonst günstig aus dem Netz laden vor dem Zeitpunkt, an dem die Ladung ausgeht, wenn
  Ladepreis / Wirkungsgrad + verdrängter Solarstrom + Mindestspanne (3 Rp.) unter dem Preis liegt. Untergrenze `floorSoc`,
  Netzladen bis `targetSoc`, Leistung `chargePowerKw` je Viertelstunde; überflüssiges Netzladen wird gestrichen.
- Anlass (Wochentest 12./13.11.): «Halten» am Abend zu 35 Rp. für den Morgen zu 43 Rp., obwohl dazwischen zu 11.9 Rp.
  nachgeladen werden konnte. Der Fahrplan entlädt am Abend, lädt um 04:00 nach und deckt den Morgen.
- `reserveMode = 'fixed'`: bisheriger Planer (feste Spitzenstunden, Solar-Grenze, Morgen überbrücken).
- **Franken-Auswertung** (`lib/ems/DecisionLedger.js`): zwei virtuelle Batterien (dieses EMS, anderes EMS) und ein Haus
  ohne Batterie, mit echtem Hausverbrauch, Solarstrom, Preisen und Einspeisepreis; jeder Tag startet beim echten
  Ladestand, übrige Ladung zählt zum Tagesdurchschnitt. Anzeige in der Vergleichsansicht («Kosten der Entscheide»).
- **Kosten → Batterie-Potenzial** hat mit Energiemanagement die Spalte **«Fahrplan»** (`lib/ShadowPlan.js`): Kosten des
  Fahrplans je Tag aus der Franken-Auswertung und wie viel des möglichen Nutzens er erreicht hätte. So bleibt die
  Auswertung erhalten, wenn die Vergleichsansicht vor der Veröffentlichung entfernt wird. Ohne EMS-Gerät keine Spalte.
- **Einrichten → Allgemein → Daten verwalten → «EMS-Protokolle und Auswertungen löschen»** (`POST /ems/reset-data`):
  löscht Vergleich (Batterie und Wallbox), Franken-Auswertung, Protokoll (Verbraucher, Batterie, Hausanschluss) und
  Plan-Verlauf, z. B. beim Go-live. Gelernter Hausverbrauch, Einstellungen und Aufträge bleiben. Kostendaten werden
  separat gelöscht (Tage im Zeitraum, Verbraucher, alles).

## Notstrom-Reserve (13.11.2026)

- **Zweck:** vor einem erwarteten Stromausfall sicherstellen, dass die Hausbatterie mindestens einen eingestellten
  Ladestand hat - unabhängig von Preis und sonstiger Planung. Übersteuert die übrige Batterie-Planung vollständig,
  solange sie aktiv ist (`lib/ems/planner/battery.js`, ganz am Anfang von `decideBattery`): unter dem Ziel wird
  sofort geladen (egal zu welchem Preis), ab dem Ziel wird gehalten (nicht entladen). Wirkt in beiden Modi
  (`reserveMode` auto/fixed).
- **Nur per Klick oder Flow, nie automatisch.** Eigene Capability `ems_backup_reserve` (Schalter an der
  Geräte-Kachel), Flow-Aktion `ems_backup_reserve_set`, Flow-Bedingung `ems_backup_reserve_is_on`. Zusätzlich ein
  Schalter bei «Heute» im Abschnitt Hausbatterie. Die eigene Capability bekommt von Homey keine automatische
  Flow-Karte (wie schon bei `ems_charge_now`, siehe oben), darum die zwei eigenen Karten.
  Richard hat dafür bereits einen eigenen Advanced Flow (Notstrom) - der schaltet diese Reserve mit ein.
- Die Reserve (%) wird unter Einrichten → EMS → Hausbatterie → Planung eingestellt (`backupReserve.soc`, Standard
  50 %) und bleibt beim Ein-/Ausschalten erhalten; das Speichern der Einrichtung rührt nur die Zahl an, nie den
  Schalter selbst (`EmsController.putConfig` mischt `battery.backupReserve` wie `battery.control` zusammen, statt es
  zu ersetzen).
- Geht über dieselbe Ausführung wie jeder andere Batterie-Modus (`_controlBattery`): live nur, wenn Silent-Modus aus
  und die Batteriesteuerung auf live steht; sonst nur simuliert und im Protokoll sichtbar.
