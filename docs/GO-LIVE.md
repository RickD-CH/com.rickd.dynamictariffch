# Go-live-Checkliste (eigenes Energiemanagement übernimmt)

Reihenfolge einhalten. Alles läuft bis dahin im Testmodus (Silent), es wird nichts geschaltet.

## A. Umstellen

1. **Vergleichstest abschliessen** (läuft bis 22.11.2026). Erst umstellen, wenn genug Vergleichsdaten da sind.
2. **Hysterese der Wärmepumpe** (P32) am Gerät prüfen. Die App rechnet mit dem in den Einstellungen eingetragenen Wert (Standard 0, bei Richard 4).
3. **Warmwasser-Ausgabe testen** (Einstellungen → Warmwasser-Programm → «Warmwasser-Programm setzen über», bei Richard: Aktionskarte des Modbus-Geräts, Register 1012):
   1. Im Trockenlauf prüfen, dass die Anzeige den Soll zeigt (Programm 52 °C, zurück auf den gelesenen normalen Soll, ersatzweise «Normaler Soll»).
   2. Einmal von Hand live: Warmwasser-Programm mit «Befehle senden» starten, im Log «Register 1012 = 520» bzw. beim Ende den normalen Soll kontrollieren.
   3. Prüfen, dass die WW-Schaltzeiten der Wärmepumpe die günstigen Stunden abdecken (der WW-Soll Tag gilt nur innerhalb der Schaltzeiten).
   4. Andere Wärmepumpen: Ausgabe «Auslöser mit Wert» und ein einziger Flow *Wenn «Der Warmwasser-Soll soll gesetzt werden», dann Soll (Token) an die Wärmepumpe schreiben*.
4. **SG-Ready-Relais prüfen:** «Eingang 1» von Hand ein, die Wärmepumpe meldet Zustand 3.
5. **Alte Flows ausschalten**, sobald die App übernimmt: «Wärmepumpe SGReady + Überwachung» und «WW Bereitung dynamisch» (beide schreiben/schalten dasselbe wie die App).
   Danach, erst nach dem ersten erfolgreichen Live-Lauf der Karten-Ausgabe, die nicht mehr gebrauchten Flows löschen: «WP WW-Soll: Programm ein (extern)», «WP WW-Soll: verzögern (extern)», «WP WW-Soll: zurück auf Normal (extern)» und «WP WW-Soll: Normalwert merken (04:00)» (samt Variable `WW_Dyn_WW-CONSTSOLLTAG`, wenn nichts anderes sie braucht).
6. **«Warmwasser verzögern» einschalten** (Option im Warmwasser-Programm, standardmässig aus). Erst nach ein paar Tagen Beobachtung im Trockenlauf (Anzeige «Verzögert bis …» im Widget):
   1. Die Schwellen für die Jahreszeit prüfen: «Genug Sonne ab Prognose» (Standard 15 kWh stammt aus dem April, im Winter tiefer ansetzen) und die Freigabezeiten (Mo–Fr 16:00, Wochenende 15:00, bei wenig Sonne 10:00).
   2. Komfortgrenze (32 °C) und Startschwelle (Soll minus Hysterese plus Marge) kontrollieren.
   3. Dann «Warmwasser verzögern» einschalten. Das Absenken schreibt 30 °C, die Freigabe den vorher gelesenen normalen Soll.
7. **Geräte mit Programm** (Geschirrspüler, Waschmaschine, Tumbler): Fernbedienung an der Maschine einschalten, Dauer prüfen (Standard 3 h).
8. **Live schalten, vorsichtig:**
   1. Batterie-Steuerung auf «nicht live» stellen (sonst streitet die App mit dem Vergleichs-EMS um die Batterie).
   2. Wallbox erst live, wenn ein Auto eingesteckt ist.
   3. Dann den Silent-Modus ausschalten. Danach erscheinen die Start-Knöpfe im Widget.
9. **Vergleichs-EMS (FusionSolar) abbauen:** Konfiguration dort entfernen, **inklusive Solcast**, und den **Account dort löschen**. Erst nachdem das eigene Energiemanagement sich bewährt hat. Danach in dieser App die Berechtigung `homey:app:com.huawei.fusionsolar` und die Vergleichsansicht entfernen (siehe B).

## Preis-Test im Dezember (vor dem echten dynamischen Tarif)

Die Preislogik soll schon im Dezember so laufen, als gäbe es den dynamischen Tarif. Darum gibt es in der App und in den dafür gebauten Flows **keine Datumsprüfung**:
- Das Feld «Preisoptimierung ab (Datum, optional)» im Warmwasser-Programm **leer lassen** (leer = sofort).
- Die Flows und Auslöser der App («Warmwasser-Soll soll gesetzt werden» usw.) prüfen kein Datum.
- Der alte Flow «WW Bereitung dynamisch» hat dagegen noch sein Datum-Tor (01.01.2027) für den Preis-Fallback. Er wird mit A5 abgelöst, wenn die App übernimmt.

## B. Vor der Veröffentlichung von 0.3.0

- Knopf «Ansicht ohne Energiemanagement testen» für Kunden ausblenden (nur Entwickler-Werkzeug).
- Vergleichsansicht samt Code und die Berechtigung `homey:app:com.huawei.fusionsolar` entfernen (nach A9).
- Store-Text und Doku final machen.
- Übersetzungen Französisch und Italienisch ganz zum Schluss (neue Widget- und Einstellungstexte fehlen dort noch). **Die Vergleichsansicht wird nicht übersetzt** (sie wird vor der Veröffentlichung entfernt, Deutsch reicht).
- Übrige Widgets (noch offen).
- Versionsnummer bleibt unverändert, bis veröffentlicht wird.
