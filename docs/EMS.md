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
