# Go-live-Checkliste (eigenes Energiemanagement übernimmt)

Stand 27.11.2026. Ziel: **Ende Dezember 2026 live**. Der Vergleich mit dem anderen Energiemanagement ist entfernt (Ansicht, Code, Berechtigung), der Test läuft mit dem eigenen EMS im Live-Betrieb weiter. Das Gerät des anderen Energiemanagements ist in Homey gelöscht (26.11.2026), die Flows, die davon abhingen, ebenso.

## Stand heute (Live-Betrieb im Test)

- Silent ist **aus**. Live (Befehle senden): Batterie (Mindest-Gewinn 8 Rp./kWh), Wallbox, SG-Ready (Relais, nur Empfehlung 0:1, Zwangsladung aus), Warmwasser-Programm (Auslöser mit Wert), eBike, Luftentfeuchter (Befehle an Flows), Hausanschluss-Schutz (40 A, 90 %), Geschirrspüler/Waschmaschine/Tumbler (Automatik im Widget mit dem Schalter «Auto», sonst «Jetzt starten»).
- Die Befehle laufen über den Auslöser «Das Energiemanagement gibt einen Befehl» und Flows des Nutzers (Rezepte unter Einrichten → EMS → «Flow-Rezepte»). Die Flow-Abzeichen zeigen, ob ein Flow wartet.
- Wird ein Bereich auf Silent, «Befehle senden» aus oder EMS aus gestellt, gibt die App Batterie, Warmwasser-Soll und SG-Ready wieder frei.
- Wichtige Meldungen (Fehler, Abschaltung durch den Hausanschluss-Schutz, Wärmepumpe folgt nicht, gelöschte Verweise) kommen in die Timeline. Für Fehlermeldungen: Reiter «Heute» → «Fehler melden: Diagnose kopieren» (anonymisiert, mit den Ereignissen der letzten 48 Stunden).
- Speicher der App: 56-60 MB (27.11.2026), bei «neue daten?» mitprüfen; über Tage deutlich über 70 MB wäre ein Hinweis auf ein Leck.

## A. Vor dem Go-live (Ende Dezember)

1. **Wallbox mit Auto prüfen** (kommt bald): Anstecken, Ladeplan, Befehle «Leistung setzen / Start / Stopp» über den Wallbox-Flow, Phasenumschaltung. Prüfen, dass der Auto-Plan nur klar günstige Viertelstunden nimmt, wenn die Preise von morgen noch fehlen. Das Auto wird mit Ladestand in Homey eingebunden (sonst «Ohne Ladestand: Energie je Abfahrt» in der Datenquelle E-Auto).
2. **Sauna und Wallbox:** Die Sauna-Flow «Wallbox pausieren» ist gelöscht. Mit ladendem Auto die Sauna einschalten und prüfen, dass der Hausanschluss-Schutz die Wallbox drosselt. Reicht das nicht: Option «Wallbox pausieren» für die Pause-Karte der App bauen.
3. **Batterie-Entladesperre beim Solarladen messen:** Solange die Wallbox mehr als 500 W lädt, ist die Entladung der Batterie gesperrt, auch beim Laden mit Solar-Überschuss. Mit dem Auto messen, dann entscheiden, ob es eine Ausnahme braucht.
4. **Batterie über mehrere Nächte beobachten:** «Laden» (aus dem Netz) real, «Halten», Rückfall auf «Normal»; Protokoll im Reiter «Heute», Entladegrenze am Gerät. Bisher (24.-27.11.) unauffällig, Hauptblock jeweils 03:15-05:00.
5. **Warmwasser:** ein ganzer Zyklus mit Programm, Verzögerung und Soll-Rückstellung (Soll wird nach «Normal» geprüft, das Gerät meldet ihn etwa 4 Minuten später). Statusfeld «WW Bereitung» ist eingetragen.
6. **SG-Ready (Relais):** Empfehlung bei Sonne beobachten; die Preislogik gehört zum Warmwasser-Programm, SG-Ready bedient nur Sonne/Akku.
7. **Geräte mit Programm:** Geschirrspüler läuft. Waschmaschine und Tumbler noch live testen (Fernbedienung an, Automatik einschalten).
8. **Alte Flows** (mit «(OBSOLET EMS)» markiert, alle ausgeschaltet) nach dem ersten erfolgreichen Zyklus löschen: den alten Luftentfeuchter-Flow «… Luftentfeuchter via PV Produktion», «WW Bereitung dynamisch», «GWA an bei PV Überschuss», «Wärmepumpe SGReady + Überwachung». Bereits gelöscht: «EMS Test 24h» und die Flows des anderen Energiemanagements (26.11.2026).
9. **Anderes Energiemanagement abbauen:** Konfiguration dort entfernen und den Account dort löschen, sobald das eigene EMS sich bewährt hat. **Nicht** die Anmeldung der Batterie im Portal des Herstellers löschen und die Batterie nicht länger als 6 Monate vom Internet trennen: Sonst fällt die erweiterte Garantie (Jahre 6-15) weg (Garantiebedingungen des Herstellers für EWR und Schweiz, Version 3.0, Hinweis 4).

## Preis-Test im Dezember (vor dem echten dynamischen Tarif)

Die Preislogik läuft schon im Dezember so, als gäbe es den dynamischen Tarif. In der App und in den Flows gibt es **keine Datumsprüfung**; das Feld «Preisoptimierung ab (Datum, optional)» im Warmwasser-Programm **leer lassen** (leer = sofort).

## B. Veröffentlichung von 0.3.0

**Testversion:** bereit seit 27.11.2026 (Validierung `publish` ohne Fehler, alle Tests grün). Veröffentlichen mit `homey app publish` (Version bleibt 0.3.0), dann im Entwicklerportal als Test freigeben.

Erledigt:

- App-Name bleibt «Dynamischer Stromtarif CH & EMS» (en «Swiss Dynamic Tariff & EMS»). Innostrom, Swisspower und AEW stehen in der Store-Beschreibung (Readme) und in den Tags, nicht im Namen und nicht in der App.
- Store-Text (Readme in vier Sprachen), Beschreibung und Tags (inkl. «HEMS») final; Prüfung gegen die Store-Richtlinien mit `test/store-guidelines.test.js`.
- Changelog 0.3.0 in vier Sprachen.
- Übersetzungen Französisch und Italienisch (23.11.2026); kein Gegenlesen durch Muttersprachler nötig. Der Test `test/translations.test.js` hält alle vier Sprachen vollständig; bei neuen Texten gleich alle vier Sprachen schreiben.
- Widgets fertig (Preise, Preisliste, Kosten, Plan, Hausanschluss, Verbraucher).
- App-Bild bleibt.

Offen für die Einreichung zur Prüfung (Store für alle):

- Begründung für die Berechtigung `homey:manager:api` beim Einreichen schreiben (Argumente liegen bereit).
- Einreichen, sobald die Testversion ein paar Tage ohne Probleme läuft. Wegen der gründlicheren Prüfung und der Feiertage nicht zu spät: spätestens etwa Mitte Dezember.
- Versionsnummer bleibt unverändert, bis veröffentlicht wird; Korrekturen aus dem Auto-Test kommen als 0.3.1.
