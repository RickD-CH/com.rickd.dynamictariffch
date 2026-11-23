# Go-live-Checkliste (eigenes Energiemanagement übernimmt)

Stand 23.11.2026. Ziel: **Ende Dezember 2026 live**. Der Vergleich mit dem anderen Energiemanagement ist entfernt (Ansicht, Code, Berechtigung), der Test läuft mit dem eigenen EMS im Live-Betrieb weiter.

## Stand heute (Live-Betrieb im Test)

- Silent ist **aus**. Live (Befehle senden): Batterie, Wallbox, SG-Ready (Relais), Warmwasser-Programm (Auslöser mit Wert), eBike, Luftentfeuchter (Befehle an Flows), Hausanschluss-Schutz, Geschirrspüler/Waschmaschine/Tumbler (ohne Automatik, nur Handstart).
- Die Befehle laufen über den Auslöser «Das Energiemanagement gibt einen Befehl» und Flows des Nutzers (Rezepte unter Einrichten → EMS → «Flow-Rezepte»). Die Flow-Abzeichen zeigen, ob ein Flow wartet.
- Wird ein Bereich auf Silent, «Befehle senden» aus oder EMS aus gestellt, gibt die App Batterie, Warmwasser-Soll und SG-Ready wieder frei.

## A. Vor dem Go-live (Ende Dezember)

1. **Wallbox mit Auto prüfen** (kommt bald): Anstecken, Ladeplan, Hausanschluss-Schutz (Drosselung), Befehle «Leistung setzen / Start / Stopp» über den Wallbox-Flow. Prüfen, dass der Auto-Plan nur klar günstige Viertelstunden nimmt, wenn die Preise von morgen noch fehlen.
2. **Batterie über mehrere Nächte beobachten:** «Laden» (aus dem Netz) real, «Halten», Rückfall auf «Normal»; Protokoll im Reiter «Heute», Entladegrenze am Gerät.
3. **Warmwasser:** ein ganzer Zyklus mit Programm, Verzögerung und Soll-Rückstellung (Soll wird nach «Normal» geprüft, das Gerät meldet ihn etwa 4 Minuten später). Statusfeld «WW Bereitung» ist eingetragen.
4. **SG-Ready (Relais):** Empfehlung bei Sonne beobachten; die Preislogik gehört zum Warmwasser-Programm, SG-Ready bedient nur Sonne/Akku.
5. **Geräte mit Programm** (Geschirrspüler, Waschmaschine, Tumbler): Status-Werte der Maschinen prüfen (die App vergleicht ohne Rücksicht auf Gross-/Kleinschreibung), Fernbedienung an, dann live testen.
6. **Alte Flows** (mit «(OBSOLET EMS)» markiert) nach dem ersten erfolgreichen Zyklus löschen: «Wärmepumpe SGReady + Überwachung», «WW Bereitung dynamisch», Luftentfeuchter via PV, WALLBOX-Schutz-Flows, «EMS Test 24h».
7. **Anderes Energiemanagement abbauen:** Konfiguration dort entfernen und den Account dort löschen, sobald das eigene EMS sich bewährt hat.

## Preis-Test im Dezember (vor dem echten dynamischen Tarif)

Die Preislogik läuft schon im Dezember so, als gäbe es den dynamischen Tarif. In der App und in den Flows gibt es **keine Datumsprüfung**; das Feld «Preisoptimierung ab (Datum, optional)» im Warmwasser-Programm **leer lassen** (leer = sofort).

## B. Vor der Veröffentlichung von 0.3.0

**Termin: Anfang Dezember 2026 (ab 1.12.) Testversion veröffentlichen**, vor dem Go-live Ende Dezember.

- Store-Text, Beschreibung und Tags final machen (Versorgernamen nur dort, nicht in der App).
- Übersetzungen Französisch und Italienisch ganz zum Schluss (neue Widget- und Einstellungstexte fehlen dort noch).
- Übrige Widgets (noch offen).
- Versionsnummer bleibt unverändert, bis veröffentlicht wird.
