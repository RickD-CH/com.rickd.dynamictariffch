# Go-live-Checkliste (eigenes Energiemanagement übernimmt)

Reihenfolge einhalten. Alles läuft bis dahin im Testmodus (Silent), es wird nichts geschaltet.

## A. Umstellen

1. **Vergleichstest abschliessen** (läuft bis 22.11.2026). Erst umstellen, wenn genug Vergleichsdaten da sind.
2. **Hysterese der Wärmepumpe** (P32) am Gerät prüfen. Die App rechnet mit dem in den Einstellungen eingetragenen Wert (Standard 0, bei Richard 4).
3. **Warmwasser-Flows von Hand testen:** «WP WW-Soll: Programm ein (extern)» (Register 1012 = 52 °C), dann «WP WW-Soll: zurück auf Normal (extern)». Prüfen, dass die WW-Schaltzeiten der Wärmepumpe die günstigen Stunden abdecken und dass die Variable `WW_Dyn_WW-CONSTSOLLTAG` den normalen Soll enthält.
4. **SG-Ready-Relais prüfen:** «Eingang 1» von Hand ein, die Wärmepumpe meldet Zustand 3.
5. **Alte Flows ausschalten**, sobald die App übernimmt: «Wärmepumpe SGReady + Überwachung» und «WW Bereitung dynamisch» (beide schreiben/schalten dasselbe wie die App).
6. **Geräte mit Programm** (Geschirrspüler, Waschmaschine, Tumbler): Fernbedienung an der Maschine einschalten, Dauer prüfen (Standard 3 h).
7. **Live schalten, vorsichtig:**
   1. Batterie-Steuerung auf «nicht live» stellen (sonst streitet die App mit dem Vergleichs-EMS um die Batterie).
   2. Wallbox erst live, wenn ein Auto eingesteckt ist.
   3. Dann den Silent-Modus ausschalten. Danach erscheinen die Start-Knöpfe im Widget.
8. **Vergleichs-EMS (FusionSolar) abbauen:** Konfiguration dort entfernen, **inklusive Solcast**, und den **Account dort löschen**. Erst nachdem das eigene Energiemanagement sich bewährt hat. Danach in dieser App die Berechtigung `homey:app:com.huawei.fusionsolar` und die Vergleichsansicht entfernen (siehe B).

## B. Vor der Veröffentlichung von 0.3.0

- Knopf «Ansicht ohne Energiemanagement testen» für Kunden ausblenden (nur Entwickler-Werkzeug).
- Vergleichsansicht samt Code und die Berechtigung `homey:app:com.huawei.fusionsolar` entfernen (nach A8).
- Store-Text und Doku final machen.
- Übersetzungen Französisch und Italienisch ganz zum Schluss (neue Widget- und Einstellungstexte fehlen dort noch).
- Übrige Widgets (noch offen).
- Versionsnummer bleibt unverändert, bis veröffentlicht wird.
