# Spezifikation: Homey-App „Dynamischer Stromtarif CH“

## Ziel

Die 15-Minuten-Preise aus dem dynamischen Tarif (AEW Classic Dynamic ab 1.1.2027, und jedes andere
Werk mit Innostrom/Swisspower) kommen nach Homey. Mit Flows lassen sich damit Verbraucher
verschieben: E-Auto, Boiler, Wärmepumpe, Waschmaschine.

Homeys eingebaute Funktion „Dynamic Electricity Prices“ unterstützt die Schweiz nicht. Sie könnte
auch den dynamischen **Netz**-Anteil nicht abbilden. Deshalb braucht es eine eigene App.

## Eckdaten

| | |
|---|---|
| App-ID | `com.rickd.dynamictariffch` (fix, nach Veröffentlichung nicht mehr änderbar; bewusst ohne „Innostrom“, damit später auch andere Schnittstellen wie EKZ/CKW/Groupe E Platz haben) |
| Name | DE: „Dynamischer Stromtarif CH“, EN: „Swiss Dynamic Electricity Tariff“. „Innostrom“/„Swisspower“ nur in der Beschreibung („für AEW und weitere Werke mit dem Swisspower-Standard“), nicht im Namen (fremde Marken) |
| SDK | Homey Apps SDK v3, Homey Compose, JavaScript (CommonJS), keine Laufzeit-Abhängigkeiten |
| Plattform | `local` (Homey Pro 2023 / mini). Cloud optional später. |
| Sprachen | de (primär), en |
| Kategorie | `energy` |

## Architektur

```
app.js                      ─ minimal (Flow-Karten registrieren, die auf das Gerät zeigen)
drivers/innostrom/driver.js ─ Pairing (Messpunktnummer + Token, Verbindung testen)
drivers/innostrom/device.js ─ Abruf-Planung, Capabilities setzen, Trigger feuern
lib/InnostromClient.js      ─ FERTIG + getestet: API-Zugriff
lib/PriceStore.js           ─ FERTIG + getestet: Auswertungen (günstigste N, Block, Rang, Niveau)
lib/time.js                 ─ FERTIG + getestet: Europe/Zurich, Zeitfenster, Zeitumstellung
```

Driver-ID `innostrom` (ein Driver pro Schnittstellen-Typ; später z. B. `ekz`, `ckw` als weitere Driver). Ein **Gerät pro Messpunkt** (Gerätetyp `other` oder `sensor`, Klasse prüfen). Es spricht nichts
dagegen, mehrere Messpunkte als mehrere Geräte zu führen.

## Pairing

- Template `login_credentials` mit angepassten Labels: „Messpunktnummer“ / „API-Token“. Alternativ
  eine eigene View mit drei Feldern (inkl. Umgebung Produktiv/Test).
- Vor dem Anlegen `client.testConnection()` aufrufen. Bei `InnostromError.code === 'AUTH'` eine klare
  Meldung zeigen: „Token oder Messpunktnummer ungültig“. Die API unterscheidet die beiden Fälle nicht.
- Geräte-ID = Messpunktnummer. Token in `settings` (Typ `password`), nicht in `data`.
- Hilfetext mit Link auf die Test-Zugangsdaten. Mit denen lässt sich die App ohne Vertrag
  ausprobieren.

## Geräte-Einstellungen

| Key | Typ | Default | Zweck |
|---|---|---|---|
| `metering_code` | text | – | Messpunktnummer |
| `token` | password | – | Bearer-Token |
| `environment` | dropdown | `production` | `production` / `test` |
| `price_field` | dropdown | `integrated` | Wonach Flows bewerten: Gesamt / nur Energie / nur Netz inkl. Abgaben |
| `vat_percent` | number | `8.1` | MWST, die auf die angezeigten Preise addiert wird (0 = exkl.) |
| `fallback_price` | number | leer | Einheitstarif (CHF/kWh), gilt, wenn keine Daten da sind |
| `level_thresholds` | – | – | optional: Grenzen für günstig/teuer (Default ±10 % / ±25 % vom Tagesmittel) |

Wichtig: MWST nur für die **Anzeige** und Token-Werte addieren. Für Vergleiche ist es egal, solange es
konsistent ist.

## Capabilities (eigene, in `.homeycompose/capabilities/`)

| ID | Einheit | Inhalt |
|---|---|---|
| `measure_price_total` | CHF/kWh | aktueller Gesamtpreis (`integrated`) |
| `measure_price_energy` | CHF/kWh | Energieanteil |
| `measure_price_grid` | CHF/kWh | Netz inkl. Abgaben (`dso`) |
| `measure_price_next` | CHF/kWh | Preis der nächsten Viertelstunde |
| `measure_price_min_today` / `max_today` / `avg_today` | CHF/kWh | Tagesstatistik |
| `price_rank_today` | – | 1 = günstigste Viertelstunde des Tages |
| `price_level` | enum | `very_cheap` … `very_expensive` |
| `alarm_no_tomorrow` | bool | `true`, wenn um 18:30 noch keine Preise für morgen da sind |

Anzeige mit 4 Nachkommastellen (CHF) oder umgerechnet in Rp. (Entscheid bei der Umsetzung: vermutlich
Rp./kWh mit 2 Dezimalen, weil das in der Schweiz üblich ist).

## Abruf-Planung (device.js)

1. **onInit:** Store aus `this.getStoreValue('slots')` laden (`PriceStore.fromJSON`), dann sofort
   heute + morgen abrufen (`getPrices` mit `from = lokale Mitternacht heute`,
   `to = lokale Mitternacht übermorgen`, `tariffType = 'all'`).
2. **Täglich ab 16:05:** Folgetag abrufen. Wenn nicht vollständig (`hasFullDay(morgen) === false`),
   alle 15 Min wiederholen bis 23:45. Danach `alarm_no_tomorrow = true` → Fallback-Preis.
3. **Viertelstunden-Tick:** mit `this.homey.setTimeout` genau auf die nächste Viertelstunde
   (+ 2 s) planen, nicht mit `setInterval` (Drift). Bei jedem Tick Capabilities aktualisieren und
   Trigger feuern.
4. **Fehler:** `retryable` → exponentielles Backoff (1, 2, 5, 10, 15 Min), `AUTH` → Gerät
   `setUnavailable('Zugangsdaten ungültig')`, keine Wiederholung bis zur Änderung der Settings.
5. **Persistenz:** nach jedem erfolgreichen Abruf `prune(gestern 00:00)` und `setStoreValue('slots', …)`.
6. **onDeleted / onUninit:** alle Timer löschen (`this.homey.clearTimeout`).
7. Niemals öfter als nötig abfragen: normalerweise nur 1–2 Aufrufe pro Tag.

## Flow-Karten

### Trigger (`when`)

| ID | Titel | Tokens |
|---|---|---|
| `price_changed` | Der Strompreis hat sich geändert (jede Viertelstunde) | `price`, `level`, `rank` |
| `tomorrow_available` | Die Preise für morgen sind verfügbar | `min`, `max`, `avg`, `cheapest_start` (HH:MM) |
| `price_below` | Der Preis fällt unter [x] Rp./kWh (feuert nur beim Unterschreiten) | `price` |
| `price_above` | Der Preis steigt über [x] Rp./kWh | `price` |
| `cheapest_block_starts` | Der günstigste Block von [n] Stunden zwischen [von] und [bis] beginnt | `avg`, `end` |
| `no_prices_for_tomorrow` | Um 18:30 sind noch keine Preise für morgen da | – |

`price_below` / `price_above` / `cheapest_block_starts` brauchen Argumente → `registerRunListener`,
der pro Flow-Argument prüft (Zustand „vorher/nachher“ im Device merken).

### Bedingungen (`and`)

| ID | Titel |
|---|---|
| `is_among_cheapest` | Die aktuelle Viertelstunde gehört zu den [n] günstigsten zwischen [von] und [bis] |
| `is_among_most_expensive` | … zu den [n] teuersten zwischen [von] und [bis] |
| `is_in_cheapest_block` | Jetzt ist der günstigste zusammenhängende Block von [n] Stunden zwischen [von] und [bis] |
| `price_below` | Der Preis ist unter [x] Rp./kWh |
| `level_is` | Das Preisniveau ist [günstig/normal/teuer …] |

`n` bei den Bedingungen: Anzahl **Viertelstunden** oder **Stunden** (Dropdown-Argument). Stunden sind
für Nutzer intuitiver, intern gilt ×4.

Wenn `isAmongCheapest` `null` liefert (Daten für das Fenster unvollständig) → Bedingung `false` und
ins Log schreiben. **Nicht** raten.

### Aktionen (`then`)

| ID | Titel |
|---|---|
| `refresh` | Preise jetzt neu laden |
| `find_cheapest_block` | Finde den günstigsten Block von [n] Stunden zwischen [von] und [bis] → gibt Tokens `start`, `end`, `avg` zurück (Advanced-Flow-Rückgabewerte) |

## Insights

Capabilities mit `insights: true` für Gesamtpreis und Energie/Netz. So entsteht in Homey Insights
automatisch ein Preisverlauf.

## Nicht-Ziele (v1)

- Keine eigene Gerätesteuerung (das machen Flows)
- Keine Kostenberechnung pro Gerät (das kann später über Homey Energy oder die App „Power by the
  Hour“ laufen). **Zu prüfen:** Kann eine App den Preis an Homey Energy übergeben? Das SDK dazu
  recherchieren, nicht raten.
- Keine Web-Scraping-Variante der AEW-Webseite

## Offene Punkte

- [ ] Wie kommt man bei der AEW an Token + Messpunktnummer? (Kundendienst anfragen)
- [ ] Echte AEW-Produktivdaten ab Januar 2027 mit den synthetischen Fixtures vergleichen (Aufbau
      der Komponenten, `power`-/`fix_price`-Einträge?)
- [ ] Homey-Energy-Integration möglich?
- [ ] Veröffentlichung im Homey App Store (Community) nach einer Testphase
