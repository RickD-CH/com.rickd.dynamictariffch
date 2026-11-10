# EMS (Energiemanagement) in dieser App

Ab 0.3.0 (noch nicht veröffentlicht) enthält die App ein **Energiemanagement-Modul** (`lib/ems/`). Es ist
standardmässig **aus**: ohne Häkchen unter Einstellungen → "Energiemanagement" gibt es keine Zugriffe und keine Timer.

## Was es tut

| Bereich | Verhalten | Steuerung |
|---|---|---|
| **Wallbox (go-e)** | Solar-Überschuss laden in Ampere-Stufen (6-16 A), Phasenumschaltung, Haltezeiten, Schutz vor Netzbezug, Batterie-Schutz (Rampe 50-80 %), "Akku voll"-Regel, Prognose-Sperre, Sofortladen, Hauptsicherungsgrenze | live (`charger.live`) oder Trockenlauf |
| **Verbraucher** (z. B. Luftentfeuchter, bis 5) | Einschalten bei voller Batterie, ab gewähltem SoC oder bei Überschuss (wie Andis EMS); Mindestlaufzeit, Mindest-Pause, Schutz-SoC, Prognose-Sperre | live (je Verbraucher `live`) oder Trockenlauf |
| **Batterie** | Planer für Laden/Halten/Normal auf 15-Minuten-Slots, nur zum Vergleich mit Andis EMS | nur Schattenmodus (Andis EMS steuert die Batterie weiter) |

Trockenlauf = es wird gerechnet und protokolliert, **kein Gerät wird geschaltet**.

## Aufbau

```
lib/ems/
  planner/        reine Entscheidungslogik, ohne Homey, ohne feste IDs (getestet)
    slots.js battery.js charger.js consumer.js forecastGate.js
  Config.js       Standardwerte (Richards Haus) + Prüfung der Konfiguration
  PriceFeed.js    15-min-Preise aus dem eigenen PriceStore
  PvFeed.js       PV-Prognose (zurzeit von Andis EMS, GET /ems/pv-forecast)
  Inputs.js       Messwerte lesen (homey-api); Andis EMS nur zum Vergleich
  Actuators.js    EINZIGE Stelle, die Geräte schaltet (go-e Flow-Karten, onoff)
  EmsRunner.js    ein Durchlauf: lesen -> entscheiden -> protokollieren -> (live) senden
  EmsController.js  Zeitplanung, Konfiguration, Anbindung an App und API
  ShadowLog.js    Protokoll und Vergleich mit Andis EMS
settings/ems.js  Reiter "Energiemanagement"
```

Wallbox-Befehle sind dieselben Flow-Karten, die Andis EMS über Richards Flows auslöste:
`evcharger_charging_start` und `target_power_set` (Watt = A × Phasen × 230, Stopp = 0 W).

## Regeln

- **Nie zwei Steuerungen auf demselben Gerät.** Vor `charger.live`: in Andis EMS die Wallbox ausschalten
  (Schalter "EMS steuert dieses Gerät"). Der Reiter warnt, wenn Andis EMS die Wallbox trotzdem steuert.
- Erster Lauf nach dem Start oder Umschalten auf live: nur beobachten, nichts senden.
- Fehlt der Netzzähler oder die Wallbox ist nicht lesbar: nichts senden.
- Fremdgesteuerte Verbraucher (von Hand eingeschaltet) werden nicht angefasst.
- Die Berechtigung `homey:manager:api` ist nötig (Messwerte und Schalten fremder Geräte). Im Store bedeutet
  das eine strengere Prüfung. Offen: ob eine Store-Version ohne sie auskommt.
- Andis MIT-Code (Algorithmen) ist in den Dateiköpfen genannt. Vor einer Veröffentlichung die Lizenz klären
  (sein Repo hat keine LICENSE-Datei).

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
