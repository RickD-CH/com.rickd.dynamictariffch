# CLAUDE.md – Homey-App „Dynamischer Stromtarif CH“

## Worum es geht

Eine Homey-Pro-App, die die 15-Minuten-Preise des dynamischen Stromtarifs über die **Innostrom API
v2** (Swisspower) abruft und für Flows bereitstellt. Erster Anwendungsfall: **AEW Classic Dynamic**
(AEW Energie AG, Kanton Aargau, ab 1.1.2027).

Entwickler: Richard Dubs (GitHub/Homey-Namespace `com.rickd`, siehe auch die App `com.rickd.devicewatchdog`).
Kommunikation und UI-Texte: **Deutsch (Schweiz, ohne ß)**, zusätzlich Englisch.

## Zuerst lesen

1. `docs/SPEC.md` – was gebaut wird (Pairing, Settings, Capabilities, Flow-Karten, Abruf-Planung)
2. `docs/innostrom-api.md` – API plus **beobachtetes Verhalten** (Ende inklusiv, Zeitzonen, leere
   Folgetage)
3. `docs/innostrom-swagger.json` – offizielle Spec
4. `lib/` – fertige, getestete Bausteine. **Nicht neu schreiben, sondern verwenden und erweitern.**

## Was schon fertig ist

| Datei | Inhalt | Tests |
|---|---|---|
| `lib/InnostromClient.js` | API-Client, Fehlerklassen (`AUTH`, `BAD_REQUEST`, `SERVER`, `NETWORK`, `TIMEOUT`), Normalisierung | ✅ |
| `lib/PriceStore.js` | Slots speichern, aktueller/nächster Preis, Tagesstatistik, günstigste N, günstigster Block, Rang, Niveau, JSON-Persistenz | ✅ |
| `lib/time.js` | Europe/Zurich ohne Abhängigkeiten, Zeitfenster über Mitternacht, Zeitumstellung (92/100 Slots) | ✅ |
| `test/fixtures/` | echte Antworten der Testumgebung + synthetischer AEW-Tag + Zeitumstellungstage | – |

## Was noch fehlt (Reihenfolge)

1. Homey-Compose-Gerüst: `.homeycompose/app.json`, `app.js`, `drivers/innostrom/`, Locales `de`/`en`,
   Icons/Bilder (Platzhalter reichen zunächst)
2. Eigene Capabilities (`.homeycompose/capabilities/`)
3. Driver mit Pairing + `testConnection`
4. Device: Abruf-Planung, Viertelstunden-Tick, Capabilities, Persistenz
5. Flow-Karten (Trigger, Bedingungen, Aktionen) laut SPEC
6. `homey app validate --level publish` ohne Fehler

## Befehle

```bash
npm test                         # Unit-Tests (node:test, keine Abhängigkeiten)
npm run probe                    # Live-Abfrage gegen die TEST-Umgebung (öffentliche Zugangsdaten)
npm run probe -- --prod          # Live gegen Produktiv (braucht INNOSTROM_TOKEN + INNOSTROM_METERING_CODE)
node scripts/make-fixtures.mjs   # synthetische Fixtures neu erzeugen

npm i -g homey                   # Homey CLI (einmalig)
homey login
homey app run                    # auf dem Homey starten (Logs im Terminal)
homey app validate --level publish
homey app install
```

## Regeln und Stolperfallen

- **Zeit:** Homey läuft in UTC. Lokale Zeiten („16:05“, „22:00–06:00“, „heute“) immer über
  `lib/time.js` mit `Europe/Zurich` rechnen (oder `this.homey.clock.getTimezone()`). Nie
  `new Date().getHours()`.
- **Nie mit 96 Slots pro Tag rechnen.** Es gibt 92/96/100.
- **API-Ende ist inklusiv**, angebrochene Slots werden nicht geliefert. Der Client behandelt das
  bereits. Nicht „reparieren“.
- **403 = Token ODER Messpunktnummer falsch.** In der UI beides nennen.
- **Leerer Folgetag** (`prices: []`) ist normal vor ca. 16:00. Kein Fehler, später nochmals abfragen.
- **Timer** nur über `this.homey.setTimeout` / `clearTimeout`, damit sie beim Entladen aufgeräumt
  werden. Viertelstunden-Tick jeweils neu auf die nächste Grenze planen (kein `setInterval`).
- **Keine Laufzeit-Abhängigkeiten** (Node ≥ 18 hat `fetch` global). Dev-Dependencies sind ok.
- **Token ist geheim:** Settings-Typ `password`, nie loggen (höchstens die letzten 4 Zeichen).
- Preise von der API sind **CHF/kWh exkl. MWST**. Die Anzeige in Rp./kWh ist Schweizer Standard.
- Die Testumgebung liefert **konstante** Preise. Logik deshalb mit `synthetic-aew-day.json` testen.
- Neue Logik → Tests in `test/` ergänzen. `npm test` muss grün bleiben.
- Commits klein halten, Nachrichten auf Englisch.

## Bekannte Kosmetik-Probleme (nächste Version anschauen)

- **Doppelte Flow-Karte "Preise neu laden":** Die eigene Aktionskarte `refresh`
  ("Preise jetzt neu laden") und Homeys automatisch generierte Karte für die `button`-Capability
  ("Knopf drücken"/"Press the button") machen exakt dasselbe (`device.actionRefresh()`). Die
  Auto-Karte lässt sich nicht umbenennen oder unterdrücken, solange die `button`-Capability für den
  manuellen Refresh-Knopf auf der Geräte-Kachel existiert. Für v0.1.x bewusst so gelassen (User-
  Entscheidung 2026-09-26). Vor dem nächsten Release nochmals anschauen: entweder akzeptieren,
  oder Button-Capability entfernen und Kachel-Knopf anders lösen.

## Referenzen

- [EWHGOF/SwisspowerDynPreis](https://github.com/EWHGOF/SwisspowerDynPreis): Home-Assistant-Integration
  für dieselbe Swisspower-API. Gut zum Abgleich von Ideen (Sensoren, günstigste Zeitfenster).
- [gruijter/com.gruijter.powerhour](https://github.com/gruijter/com.gruijter.powerhour): Homey-App
  „Power by the Hour“ mit 15-Minuten-Preisen, gutes Vorbild für Flow-Karten rund um Preise. Hat eine
  API für andere Apps (`README.dap-api.md`), kann aber keine fremden Preise übernehmen.
- Die App-ID `com.rickd.dynamictariffch` ist bewusst generisch gewählt. Später können weitere
  Schweizer Schnittstellen (EKZ, CKW, Groupe E) als eigene Driver dazukommen.
