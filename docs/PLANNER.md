# Spezifikation: Batterieplaner in der App „Dynamischer Stromtarif CH“

Stand: 8.11.2026 (Entwurf, noch nichts gebaut). Ergänzt `docs/SPEC.md`.

**Richtung (8.11.2026):** Das wird ein **Produkt für alle Schweizer Kunden mit dynamischem Tarif**, nicht eine Lösung für ein Haus. Richards Haus ist das Labor und der erste Kunde. Regeln dazu in Abschnitt 14.

## 1. Ziel

Die App kennt schon die 15-Minuten-Preise, rechnet seit 0.2.3 ein rechnerisches Optimum für die
Batterie (`lib/ShadowBattery.js`) und bewertet die echte Batterie damit (Wirkungsgrad-Kennzahl).
Der **Batterieplaner** macht daraus einen **Plan für die Zukunft** und gibt ihn als Flow-Auslöser
heraus, sodass ein Kunde Preise, Kosten, Plan und Steuerung **aus einer App** bekommt.

Er ersetzt **nur die Preissteuerung der Batterie** (Netzladen, Halten, Entladen freigeben). Er ersetzt
nicht: PV-Überschuss-Steuerung von Verbrauchern, E-Auto-Laden, Wärmepumpe, PV-Abregelung (das bleibt bei
Andis EMS, Ultimate EMS, evcc usw. oder bei eigenen Flows).

**Warum, im Vergleich zu bestehenden Planern** (Andis EMS, Ultimate EMS, Smart EMS):

| Schwäche bestehender Planer | Was der Plan anders macht |
|---|---|
| Faustregeln: billigste N Stunden laden, teuerste M Stunden Reserve | Optimierung über den ganzen Horizont (dynamische Programmierung), Kosten in Rp. |
| PV wird nicht vom Ladebedarf abgezogen (Andi: nur Schwelle auf der Tagessumme) | Plan rechnet mit **erwartetem Überschuss** (PV-Prognose minus Verbrauch) pro Viertelstunde |
| Reserve in Stunden (10 Stunden leerten die Batterie vor der Abendspitze) | Es gibt **keine Reservestunden**: die Optimierung bewertet, was die gespeicherte kWh später wert ist |
| Stundenmittel | echte **15-Minuten-Preise** inkl. Einspeisevergütung |
| Kein Preisabstand-Check gegen die Verluste | Wirkungsgrad steckt in der Rechnung (laden nur, wenn es nach Verlusten lohnt) |
| Jeder Befehl nur einmal | Wiederholung, solange Laden oder Halten aktiv ist |
| Kein Nachweis, ob es besser ist | **Schattenmodus** und Vergleich gegen die Realität, Freigabe erst nach Messung |

Ideen aus Ultimate EMS und Smart EMS, die wir übernehmen: Entladen nur, wenn der Preis über den Kosten des
gespeicherten Stroms (durch Wirkungsgrad) liegt (folgt aus der Optimierung), Neuplanung laufend und zu
festen Zeiten, **Testlauf als Standard** (Smart EMS), Rest-PV für Nachladen-Entscheide (Ultimate EMS),
Wiederholen des Befehls (Ultimate EMS, SMA alle 4 Minuten).

**Nicht Ziel:** Batterie ins Netz entladen, Mehrfach-Batterien (später), Leistungspreise/Spitzenkappung
(später prüfen).

## 2. Funktionsprinzip

Rollender Plan (Model Predictive Control), alle **15 Minuten** und bei jedem relevanten Ereignis neu:

1. **Horizont:** ab jetzt bis zum Ende der bekannten Preise (heute Rest; ab etwa 16:00 auch morgen,
   höchstens 48 Stunden). Preise ab Viertelstunde, wie sie `PriceStore` liefert.
2. **Residuum je Viertelstunde** `r = Verbrauch − PV` (positiv = Haus braucht Strom, negativ = PV-Überschuss).
   Genau diese Grösse nutzt `ShadowBattery.optimalCost` schon, dort aus Messwerten. Hier aus
   **Prognosen** (siehe 3).
3. **Optimierung:** DP über den Ladestand (Schritte 0.2 kWh), Aktionen = Laden/Entladen in Schritten bis zur
   Maximalleistung, Wirkungsgrad aufgeteilt auf Laden und Entladen, Grenzen `minSoc`/`maxSoc`, kein Export
   aus der Batterie. Kosten der Viertelstunde: `Netzbezug × Preis − Einspeisung × Vergütung`.
4. **Endwert:** Am Horizontende liegende Energie wird bewertet (Wert = typischer künftiger Preis mal Wirkungsgrad,
   Standard: Medianpreis der letzten 7 Tage). Ohne Endwert würde der Plan die Batterie am Ende immer leeren
   (das ist der Fehler der 24-Stunden-Fenster bei den bestehenden Planern).
5. **Entscheid für JETZT:** Aus der ersten Viertelstunde des optimalen Plans wird ein Modus:

| Modus | Bedeutung | Typische Aktion beim Huawei |
|---|---|---|
| `charge` | Batterie aus dem Netz laden, mit Leistung P | Zwangsladen mit P bis Ziel-SOC |
| `hold` | Entladung sperren (PV-Laden bleibt erlaubt) | Max. Entladeleistung 0 W |
| `normal` | Batterie arbeitet nach eigener Regel (Eigenverbrauch) | Normalmodus, Entladung freigeben |
| `discharge` | gezielt entladen (später, für Peak) | Entladeleistung setzen |

6. **Stabilisierung gegen Flattern:** Mindest-Haltezeit pro Modus (Standard 15 Minuten, ausser Notfall),
   Moduswechsel nur, wenn der Plan über den Horizont mindestens `Mindestgewinn` (Standard 0.5 Rp.) besser
   ist als der Weiterlauf im aktuellen Modus.
7. **Robustheit gegenüber Prognosefehlern:** PV mit Sicherheitsfaktor (Standard 0.9 mal gelernter Faktor),
   Verbrauch mit Aufschlag (Standard +5 %). Es wird laufend neu gerechnet, ein Fehler korrigiert sich im
   nächsten Takt.

Laufzeit: etwa 70 Ladestufen mal 144 Viertelstunden mal 25 Aktionen, rund 250 000 Schritte, wenige
Millisekunden in Node.

## 3. Eingänge

Die App liest **keine fremden Geräte** (keine Zusatzberechtigung). Alles kommt über Flow-Karten, wie die
Zählerstände heute.

| Eingang | Quelle | Neue Flow-Karte (Dann) |
|---|---|---|
| Preise (Bezug, Einspeisung, 15 Min.) | vorhanden (`PriceStore`, `CostTracker.dayPrices`) | nein |
| Ladestand der Batterie (SOC %) | Flow, bei jeder Änderung und mindestens alle 5 Minuten | «Ladestand der Batterie melden» |
| PV-Prognose (Rest heute kWh, morgen kWh, optional Kurve) | Flow aus Homey, Forecast.Solar, Solcast oder dem Prognose-Monitor | «PV-Prognose melden» (heute Rest, morgen, Faktor optional) |
| PV-Produktion (Tageszähler oder Gesamtzähler) | Flow, wie die Netzzähler | «PV-Produktion melden» (neu, neben Netzbezug/-einspeisung/Batterie) |
| Verbrauchsprognose | zuerst **selbst gelernt**: Residuum und PV-Zähler ergeben den Verbrauch je Wochentag und Viertelstunde | optional «Verbrauchsprognose melden» (kWh pro Tag) |
| Batterie-Ladeleistung/Entladeleistung | vorhanden («Batterie-Ladung/-Entladung melden») | nein |

Verbrauchsprofil: Mittel der letzten 4 gleichen Wochentage je Viertelstunde (Fallback: Mittel der letzten
7 Tage). PV-Profil: Tagesform aus einer Glocke zwischen Sonnenauf- und -untergang, skaliert auf Rest-kWh der
Prognose; optional eine stündliche Kurve aus dem Flow (genauer). Die Prognose wird mit dem gelernten Faktor
aus der Treffgenauigkeit korrigiert (Quelle: Prognose-Monitor, später in der App selbst).

**Datenqualität:** Fehlt der Ladestand länger als 30 Minuten oder fehlen Preise, geht der Planer in den
Sicherheitszustand (Abschnitt 5).

### Berechtigungen: keine

Die App behält `permissions: []`. Eingänge kommen über Flow-Karten, Ausgänge über Flow-Auslöser. Sie liest keine
Geräte, keine Logic-Variablen, keine Insights und keine fremden Apps. Das ist bewusst so (Vertrauen von Kunden,
Store-Prüfung).

Was dadurch **nicht** geht, und wie wir es lösen:

| Nicht möglich ohne Berechtigung | Lösung |
|---|---|
| Ladestand, PV-Prognose und PV-Produktion selbst lesen | Der Kunde richtet **einmalig** drei kleine Flows ein («Wenn Ladestand ändert, Dann Ladestand melden» usw.). Dafür gibt es fertige Beispiel-Flows in der Doku (Huawei, allgemein) |
| Rückwirkend füllen (Insights) | Der Planer sammelt ab dem Tag der Einrichtung. Die Profile brauchen 1 bis 2 Wochen, bis sie tragen. In dieser Zeit rechnet er mit Fallbeträgen (Wochenmittel) |
| Andis EMS erkennen, die EMS-Schwelle lesen, Konflikte automatisch finden | Nicht möglich. Es bleibt der Hinweis in den Einstellungen und der Doku («nur ein Steuerer pro Batterie») |
| Flows des Kunden anlegen oder ändern | Nicht möglich. Die Beispiel-Flows importiert der Kunde von Hand |
| Prognosewerte aus fremden Apps automatisch holen | Der Kunde reicht sie per Flow durch. Der Prognose-Monitor (Richards private App) darf das als eigene App, hat aber die starke Berechtigung und gehört nicht in die Store-App |

Die starke Berechtigung `homey:manager:api` bleibt damit in der **privaten** Monitor-App, die Store-App kommt ohne aus.

## 4. Ausgaben

### Flow-Karten (Compose)

| Typ | ID | Inhalt |
|---|---|---|
| Wenn | `battery_plan_changed` | Der Plan verlangt einen neuen Modus. Tokens: `mode` (charge/hold/normal/discharge), `power_w`, **`target_power_w` (vorzeichenbehaftet: positiv laden, negativ entladen, für Batterien mit schreibbarer Leistungs-Fähigkeit wie Victron, Zendure, Marstek)**, `target_soc`, `reason`, `until` (Uhrzeit), `shadow` (ja/nein) |
| Wenn | `battery_plan_refresh` | Wiederholung des aktuellen Modus alle X Minuten, solange `charge` oder `hold` aktiv ist (gleiche Tokens) |
| Wenn | `planner_fault` | Sicherheitszustand eingetreten oder verlassen (Token `reason`) |
| Und | `plan_mode_is` | Plan sagt gerade `charge`/`hold`/`normal`/`discharge` |
| Dann | `recompute_plan` | Plan sofort neu rechnen |
| Dann | `planner_set_mode` | Planer aus / nur rechnen / steuern (für Notaus-Flows) |
| Dann | `report_pv_production`, `report_battery_soc`, `report_pv_forecast` | Eingänge (Abschnitt 3) |

Im **Schattenmodus** feuert `battery_plan_changed` **nicht**, es wird nur protokolliert und angezeigt.

### Capabilities am Gerät (optional, ausblendbar wie `show_battery`)

`plan_mode` (Aufzählung, Text), `plan_next_change` (Zeit), `plan_savings_today` (CHF, geschätzt),
`alarm_planner` (Datenqualität).

### Widget und Seiten

* Widget **«Batterieplan»**: nächste 24 Stunden als Balken (Preis), geplanter Modus als farbiges Band,
  erwartete Ladestand-Kurve, aktueller Modus mit Begründung in Klartext.
* Kosten-Tab: Abschnitt **«Plan gegen Realität»** (siehe 6).

## 5. Sicherheitskonzept

Das ist der wichtigste Teil, denn der Planer wird zum Steuerer.

1. **Standard: aus.** Drei Stufen: `Aus` / `Nur rechnen (Schatten)` / `Steuern`. Neu installierte App = `Aus`.
   Erst ab `Steuern` feuern die Auslöser.
2. **Grenzen:** `minSoc` und `maxSoc` aus `battery_params`, Maximalleistung ebenfalls. Der Plan darf sie nie
   überschreiten (Tests mit Zufallsdaten).
3. **Kein Entladen ins Netz**, kein Laden über dem Hausanschlusslimit (optionale Einstellung «Hausanschluss max.»
   in A, aus Messwerten des Zählers).
4. **Datenausfall = `normal`:** Ladestand älter als 30 Minuten, keine Preise, Planer-Berechnung schlägt fehl →
   Modus `normal`, Auslöser `planner_fault`, Capability `alarm_planner`. Nie in `charge` oder `hold` stehen
   bleiben.
5. **Neustart der App = `normal`**, bis ein neuer Plan gerechnet ist (Auslöser einmal nach dem Start).
6. **Wiederholen:** Solange `charge` oder `hold` gilt, kommt alle `refresh`-Minuten (Standard 5) der Auslöser
   erneut. Bleibt ein Befehl hängen, kommt er nochmals.
7. **Einer steuert:** Läuft Andis EMS mit `price_charge_enabled` auf derselben Batterie, würde man doppelt
   steuern. Die App warnt in den Einstellungen und in der Doku (sie kann das nicht erkennen, die Flows sind
   fremd). Es gibt **keinen** automatischen Eingriff in andere Apps.
8. **Notaus:** Flow-Aktion `planner_set_mode` und Schalter in den Einstellungen. Eine Logic-Variable
   (wie `AEW_Dynamic_Aktiv` bei Richard) kann das aus Flows steuern.
9. **Protokoll:** Jede Entscheidung mit Begründung im Verlauf (letzte 7 Tage), sichtbar auf der Seite und im Log.

## 6. Schattenmodus, Bewertung und Freigabe

Der Schattenplaner läuft ab dem ersten Tag mit, steuert nichts und wird gegen **zwei Dinge** verglichen:

1. **Echte Entscheide** (was die Batterie tatsächlich getan hat, aus den gemeldeten Lade-/Entladezählern): zeigt, wo
   der Plan anders gehandelt hätte und was das gekostet hätte.
2. **Nachträgliche Wahrheit:** `ShadowBattery.optimalCost` mit bekanntem Tagesverlauf (Obergrenze).

Kennzahlen je Tag und über 14/30 Tage:

* Kosten tatsächlich, Kosten Plan (ausgespielt gegen die echten Werte, nicht die Prognose), Kosten Optimum.
* **Planer-Effizienz** = (ohne Batterie − Plan) / (ohne Batterie − Optimum), analog zur bestehenden Kennzahl.
* Anzahl Moduswechsel pro Tag (Flattern), Anteil Tage mit Datenausfall.

**Freigabekriterien** (zum Einschalten von `Steuern`, nicht automatisch):
mindestens **14 Tage** Schattenbetrieb, Planer-Effizienz im Mittel **über** der echten Effizienz, höchstens
**8 Moduswechsel pro Tag**, kein Tag mit Verletzung einer Grenze, kein Datenausfall ohne sauberen Rückfall.

Zeitplan: Bis **Ende 2026** zahlt Richard einen Pauschaltarif, es steht also nichts auf dem Spiel. Ab
1.1.2027 (dynamischer Tarif) soll der Plan bereits geprüft sein.

## 7. Einstellungen in der App (Plan)

Die Einstellungsseite hat heute Laschen *Übersicht*, *Kosten*, *Einstellungen*, *Hilfe*, und in
*Einstellungen* aufklappbare Abschnitte (`<details><summary><h2>`). **Neu:** eine eigene Lasche **«Planer»**
(Batterie-Plan als eigener Bereich, klar getrennt vom Tarif), mit diesen Abschnitten:

| Abschnitt | Felder (Standardwert) |
|---|---|
| **Status und Betrieb** | Betrieb: `Aus` / `Nur rechnen` / `Steuern` (Aus). Aktueller Modus, Begründung, nächster Wechsel, Datenqualität (Ampel), Notaus-Schalter |
| **Batterie** (übernimmt `battery_params`) | Kapazität kWh (13.8), Leistung kW (5), Wirkungsgrad (0.90), `minSoc` % (5), `maxSoc` % (90). Neu: Netzladen erlaubt (ja), Ladeziel beim Netzladen % (90), Notstromreserve % (0) |
| **Preise und Verluste** | Einspeisevergütung: Referenz oder API (übernimmt `feed_in_mode`), Mindestgewinn für Moduswechsel Rp. (0.5), Mindest-Haltezeit Min. (15) |
| **Prognosen** | PV-Korrekturfaktor (1.0, oder «lernen»), PV-Sicherheitsfaktor (0.9), Verbrauchsaufschlag % (5), Verbrauchsprofil: gelernt / fester Tageswert kWh, Endwert der Batterie: automatisch / Rp. |
| **Eingänge prüfen** | Zeigt, wann Ladestand, PV-Prognose, PV-Produktion zuletzt gemeldet wurden (wie «Zähler melden» heute), mit Warnschwelle (30 Min.) |
| **Wiederholen und Rückfall** | Wiederholen alle Min. (5), Rückfallmodus bei Datenausfall: `normal` (fix, nicht änderbar) |
| **Sicherheitsgrenzen** | Hausanschluss max. A (leer = aus), Ladeleistung begrenzen kW (leer = Batterie-Leistung) |
| **Verlauf** | Letzte Entscheide mit Begründung, Tabelle der Tage (Plan, Realität, Optimum), Export als JSON |

**Speicherung:** `homey.settings` Schlüssel `planner_config` (Objekt), Plan und Verlauf in `planner_state`
(Plan der nächsten 48 h, Entscheide, letzte Eingänge, Zähler). Übernimmt die bestehenden Schlüssel
`battery_params`, `feed_in_mode`. Neue Schlüssel nie zwingend, alles mit Standardwerten (wie `getAppConfig`).

**API-Endpunkte** (zu `.homeycompose/app.json`): `GET /planner/config`, `PUT /planner/config`,
`GET /planner/plan` (aktueller Plan mit Zeitreihe), `GET /planner/history`, `POST /planner/recompute`,
`POST /planner/mode`.

**Übersetzungen:** de, en, fr, it, wie die restliche App (Platzhalter in `locales/*.json`, kein Versorgername in App-Texten).

## 8. Code-Aufbau

```
lib/Planner.js          ─ Kern: DP, gibt Aktionsfolge und Modus für die erste Viertelstunde (aus ShadowBattery.js abgeleitet)
lib/PlannerInputs.js    ─ Residuum aus Prognosen: Verbrauchsprofil (Wochentag × Viertelstunde), PV-Profil
lib/PlannerState.js     ─ Betrieb, Haltezeit, Mindestgewinn, Datenqualität, Rückfall, Verlauf
lib/PlannerReport.js    ─ Bewertung gegen Realität und Optimum (nutzt analyzeDay)
drivers/innostrom/device.js ─ Takt (alle 15 Min., im bestehenden Viertelstunden-Tick), Auslöser feuern, Capabilities
api.js, settings/index.html, widgets/plan/ ─ Seite und Widget
test/planner.test.js    ─ siehe unten
```

`ShadowBattery.optimalCost` gibt heute nur die Kosten zurück. Es braucht eine Variante, die den **ersten Schritt
der optimalen Politik** liefert (Rückverfolgung der Entscheide) und einen **Endwert**-Parameter. Das ist die
einzige Änderung an bestehendem Code, mit Regressionstest (heutige Ergebnisse bleiben gleich).

## 9. Tests

* **Eigenschaften** (zufällige Tage, auch Zeitumstellung 92/100 Slots): Plan überschreitet nie die Grenzen,
  exportiert nie aus der Batterie, ist nie schlechter als «nichts tun» und nie besser als das nachträgliche Optimum.
* **Vergleich mit Brute Force** auf kleinen Fällen (4 bis 6 Viertelstunden).
* **Szenarien aus Richards Tagen:** Tag mit Mittagspreis-Mulde und viel PV (kein Netzladen), Tag ohne PV (Nachtladen,
  Abendspitze), Preise nur bis Mitternacht (Nachmittag), Sonntag mit billigem Mittag.
* **Zustand:** Mindest-Haltezeit, Mindestgewinn, Rückfall bei fehlendem Ladestand, Neustart.
* **Fixtures:** `test/fixtures/synthetic-aew-day.json` plus Zeitumstellungstage (vorhanden).

## 10. Etappen

| Etappe | Inhalt | Ergebnis |
|---|---|---|
| **0** | Daten sammeln (läuft): Prognose-Monitor, Rückfüllen, `report_pv_production` und `report_battery_soc` als Karten | Basis für Profile |
| **1** | `Planner.js`, Profile, Schattenmodus, Planer-Lasche und Widget «Batterieplan», Kosten-Tab «Plan gegen Realität» | Plan sichtbar, noch keine Steuerung |
| **2** | Messphase (14+ Tage), Freigabekriterien prüfen, Feintuning (Endwert, Sicherheitsfaktoren) | Entscheid «Steuern ja/nein» |
| **3** | Auslöser `battery_plan_changed`/`battery_plan_refresh` live (opt-in), Beispiel-Flows für Huawei LUNA2000 (Zwangsladen, Max. Entladeleistung, Normal, wie bei Andi), Doku und Forum | Andis Batteriesteuerung abgelöst |
| **4** | Erweiterungen: mehrere Batterien, E-Auto-Laden planen, Leistungspreis, Peak-Entladen | später |

Etappe 1 ist ein klar begrenztes Stück (etwa so gross wie die Batterie-Analyse von 0.2.3), Etappe 3 ist die
sensible. Nach Etappe 1 entscheiden wir anhand der Messung, ob wir weitermachen.

## 11. Abgrenzung zu Andis EMS, Wechselwirkung und Feedback

* Andis EMS bleibt für Überschuss, E-Auto und Verbraucher. Die **Batterie-Preissteuerung** dort
  (`price_charge_enabled`) wird erst in Etappe 3 ausgeschaltet, vorher laufen beide, der Planer nur im Schatten.
* Erkenntnisse aus dem Schattenvergleich (Mittags-Netzladen bei PV, Reserve in Stunden, fehlender Preisabstand-Check)
  gehen weiter als Feature-Wünsche an Andi. Das nützt auch seinen Nutzern und kostet nichts.
* Ultimate EMS und Smart EMS sind junge Apps (Mai/Juni 2026) mit niederländischem Schwerpunkt, Huawei nur im Test.
  Sie werden beobachtet, nicht eingebunden.

## 12. Offene Punkte und Risiken

* **Prognosegüte:** PV und Verbrauch bestimmen die Güte. Der Prognose-Monitor misst das laufend, der Plan ist
  nur so gut wie das. Darum Sicherheitsfaktoren und laufendes Neurechnen.
* **Einspeisevergütung:** Unklar, ob der API-Wert für PV-Kunden gilt (Abschnitt «Feed-in is unconfirmed» in
  `project-live-testing-aew`, offene Frage an AEW). Der Plan nutzt die bestehende Einstellung `feed_in_mode`.
* **Huawei-Register:** «Halten» ist ein Setzen der max. Entladeleistung auf 0 W, nicht ein echter Modus. Der Plan
  gibt nur den Modus aus, die Flows setzen ihn um. Der Rückfall `normal` muss in den Flows die 7000 W wieder setzen
  (wie die heutigen Flows `EMS: LUNA2000 … → Normal Mode`).
* **Wallbox:** Beim Autoladen darf die Batterie das Auto nicht speisen (Schutzverriegelung bleibt in den Flows).
* **Support und Verantwortung:** Eine App, die eine Batterie steuert, braucht klare Texte («experimentell»,
  «auf eigene Verantwortung», Notaus beschreiben) und Rückfall bei jedem Fehler.
* **Store-Prüfung:** Auslöser statt direkter Gerätesteuerung ist unproblematisch (keine Zusatzberechtigung). Zu klären
  bleibt, wie die Prüfer eine App mit Steuerfunktion einstufen.
* **Zeitplan:** Etappe 1 bis Ende November möglich, Messphase im Dezember, Entscheid vor dem 1.1.2027.

## 13. Vollausbau: Energieplaner mit Verbrauchern

Gewünscht ist das **volle Programm**: neben der Batterie auch **Wallbox/E-Auto**, **Wärmepumpe (SG-Ready)**,
**Warmwasser dynamisch** (optional) und schaltbare Lasten (Luftentfeuchter, Geschirrspüler usw.), also das, was
heute Richards Flows `Wärmepumpe SGReady + Überwachung`, `WW Bereitung dynamisch`, `DryFy Luftentfeuchter via PV
Produktion`, `GWA an bei PV Überschuss`, die go-e-Flows und Andis EMS erledigen.

### 13.1 Architektur: die App entscheidet, die Flows führen aus

Das bewährte Muster der Batterie gilt für alle Verbraucher: **Eingänge** über Meldekarten, **Ausgänge** als
Flow-Auslöser mit einer klaren Absicht. Die Gerätedetails (Shelly-Eingänge, Modbus-Sollwerte, Timer wie
`ISG_Delay`) bleiben in den Flows des Kunden. Das hält die App generisch und ohne Zusatzberechtigung und schützt
die heute funktionierenden Flows vor einem Totalumbau.

Zwei Schichten:

1. **Planer** (alle 15 Minuten, siehe Abschnitt 2): entscheidet anhand von Preisen und Prognosen, **welche Last
   wann** laufen soll (Batterie, günstige Blöcke, Wärmepumpe, Warmwasser, E-Auto bis zur Abfahrt).
2. **Echtzeit-Verteiler** (alle 15 bis 60 Sekunden): verteilt den **aktuellen PV-Überschuss** nach Priorität und
   mit Hysterese. Er braucht Momentanwerte (Netzleistung, PV-Leistung, Batterieleistung) über die Karte
   «Leistungen melden» (Flow bei Änderung, höchstens alle 15 Sekunden).

Beide schreiben in dieselben **Auslöser pro Verbraucher**; ein Verbraucher hat nie zwei Besitzer.

### 13.2 Verbraucher-Modell (Einstellungen: Lasche «Planer», Abschnitt «Verbraucher»)

Jeder Verbraucher ist ein Eintrag mit **Typ** und gemeinsamen Eigenschaften:

| Eigenschaft | Bedeutung |
|---|---|
| Name, Typ | `schaltbar`, `wallbox`, `sgready`, `warmwasser`, `batterie` |
| Leistung (W) | gemessen oder fest, für die Verteilung |
| Priorität | Reihenfolge bei knappem Überschuss |
| Mindestlaufzeit / Mindestpause | schützt Geräte (Beispiel Wärmepumpe: 60 Min. an, Wechsel höchstens alle 45 Min.) |
| Zeitfenster | wann überhaupt erlaubt (z. B. PV-Zeit bis 17:00, Nacht für das Auto) |
| Bedarf | Energie oder Dauer bis zu einer Frist (Auto bis Abfahrt, Luftentfeuchter 1 Stunde, Boiler Temperatur) |
| Preisgrenze | nur unter X Rp. oder nur im günstigsten Block |
| Verhältnis zur Batterie | darf die Batterie dafür entladen? (Standard nein, beim Auto sicher nein) |

**Auslöser** (pro Verbraucher, ein Karten-Satz mit Auswahl des Verbrauchers):
`load_command` mit Tokens `load` (Name), `command` (`start`/`stop`/`set`), `power_w`, `mode`, `reason`, `until`.
Dazu Bedingung `load_is_requested`, Aktion `load_report_state` (Läuft/Pausiert, Ist-Leistung) und
`load_override` (von Hand sperren oder erzwingen).

### 13.3 Module und was aus den heutigen Flows hineinfliesst

**Umfang (festgelegt 8.11.2026):** Der Planer übernimmt nur die **Entscheide und Aktionen** der Wärmepumpe
(SG-Ready auslösen) und des Warmwassers (dynamisch). Die **Überwachung** bleibt in Richards Flows
(Zusatzheizung, Gerätefehler, ISG-Zustandsmeldungen, Timer für Schaltpausen, Berechnung der Hysterese).
Ziel ist, dass **Andis EMS nicht mehr gebraucht wird** (Abschnitt 13.7).


| Modul | Aus welchem heutigen Flow | Regeln, die erhalten bleiben müssen |
|---|---|---|
| **Wallbox / E-Auto** | go-e-Flows, Andis EMS (Zielleistung, Start), `Sauna an -> Wallbox pausieren` | Modi: PV-Überschuss, günstig bis Abfahrtszeit (Ziel-SOC), sofort; Mindeststrom, 1 oder 3 Phasen; **Batterie speist das Auto nicht** (Schutzverriegelung, Planer meldet `hold`); Hausanschluss-Schutz (Abschnitt 13.4) |
| **Wärmepumpe SG-Ready** | `Wärmepumpe SGReady + Überwachung` | Forcierter Betrieb nur bei **Batterie voll und Überschuss**, nur im PV-Fenster (bis 17:00), Mindestlaufzeit 60 Min., Schalten höchstens alle 45 Min., Abbruch bei Warmwasser über 58 bis 60 °C (Kühlung geht bei SG-Ready nicht), Überwachung der Zusatzheizung bleibt im Flow |
| **Warmwasser dynamisch** (optional) | `WW Bereitung dynamisch` | Start später in die PV-Zeit schieben (Soll senken bis 14:00, Komfortgrenze 30/32 °C), PV-Prognose über 15 kWh als Chance für SG-Ready (Wochenende 15:00, Werktag 16:00), **Preis-Fallback**: günstigster 1.5-Stunden-Block bis 16:00 |
| **Schaltbare Lasten** | `DryFy Luftentfeuchter via PV Produktion`, `GWA an bei PV Überschuss` | Überschussschwelle (z. B. 1200 W), Feuchte über 65 % erzwingt Lauf, **günstigster Block** für den erzwungenen Lauf, Reset um Mitternacht |
| **Batterie** | Andis EMS, `LUNA`-Flows | Abschnitte 2 bis 6 |

Die Module sind **optional** und einzeln einschaltbar. Jedes hat einen eigenen **Schattenmodus** wie der
Batterieplaner (Abschnitt 6): Befehle werden nur protokolliert, bis der Kunde freigibt.

### 13.4 Hausanschluss und Prioritäten

Eine **gemeinsame Sicherung** statt Einzelflows: Einstellung «Hausanschluss max. (A pro Phase)» und eine
**Lastabwurf-Reihenfolge** (z. B. Sauna vor Wallbox vor Warmwasser). Überschreitet die Netzleistung die Grenze
(heute der Flow `Hausanschluss 40A Warnung und Aktionen`), kommen Befehle `stop` an die Verbraucher in dieser
Reihenfolge, mit Wiedereinschalten nach Wartezeit. Der Notaus gilt vor jedem Plan.

### 13.5 Zusätzliche Eingänge (Meldekarten, alle ohne Berechtigung)

`Leistungen melden` (Netz, PV, Batterie in W), `Wallbox-Zustand melden` (eingesteckt, lädt, Leistung, Strom),
`Fahrzeug-Ladestand melden` (optional), `Temperatur melden` (Warmwasser Ist/Soll, optional),
`Verbraucher-Zustand melden`. Alles mit Frischeüberwachung wie in Abschnitt 3.

### 13.6 Ehrlicher Umfang und Reihenfolge

Das ist ein vollständiges EMS, vergleichbar mit Andis EMS, Ultimate EMS und Smart EMS, nur mit Schweizer Tarifen,
Planer statt Faustregeln und Messung gegen die Realität. Es ist **ein Programm über Monate**, kein einzelnes
Stück. Die Reihenfolge richtet sich nach Nutzen und Risiko:

| Etappe | Inhalt |
|---|---|
| 1 bis 3 | Batterieplaner (Abschnitt 10) |
| 4 | **Wallbox / E-Auto** (go-e): PV-Überschuss, günstig bis Abfahrt, sofort, Strom und Phasen, Batterie speist das Auto nicht. Danach ist **Andis EMS ablösbar** (Abschnitt 13.7) |
| 5 | **Schaltbare Lasten**: PV-Überschuss und günstigster Block (ersetzt `DryFy` und `GWA`) |
| 6 | **Warmwasser dynamisch** (Aktionen: Soll verschieben, günstigster Block, Wiederherstellen) |
| 7 | **Wärmepumpe SG-Ready** (Aktion: forcierten Betrieb auslösen und beenden, Mindestzeiten und Hysterese) |
| 8 | Hausanschluss-Sicherung mit Lastabwurf, Zusammenführen in **einen** Verteiler und Aufräumen der alten Flows |

Jede Etappe: Schattenmodus, Freigabe nach Messung, erst dann Steuern, und die alten Flows laufen unverändert
weiter, bis das Modul freigegeben und der alte Flow ausgeschaltet ist (es steuert immer nur einer).

### 13.7 Andis EMS ablösen

Was Andis EMS bei Richard **heute tatsächlich tut**, und was es in der App dafür gibt:

| Funktion bei Andi (heute genutzt) | Ersatz in der App | Etappe |
|---|---|---|
| Preise einspeisen (`EMS - Strompreis Fütterung`) | entfällt, der Planer hat die 15-Minuten-Preise selbst | 1 |
| Batterie: Netzladen, Halten, Normal (`EMS: LUNA2000 … → Force Charge / Max Discharge Power / Normal Mode`) | Batterieplaner, Auslöser `battery_plan_changed` und `battery_plan_refresh` | 3 |
| Sperre «Netzladen aus ab Sonnenprognose», Reserve in Stunden, Faktor | entfällt, der Plan rechnet mit erwartetem Überschuss und Wert der gespeicherten kWh | 3 |
| go-e: Zielleistung und Start (`EMS: go-echarger → Zielleistung festlegen`, `… → Start`) | Modul Wallbox, Auslöser `load_command` für den Verbraucher «Wallbox» | 4 |
| Geräte für die EMS freigeben/sperren (`ems_set_device_enabled`, Sauna-Flow) | `load_override` (von Hand sperren) und Lastabwurf | 4 und 8 |
| Preisgesteuertes E-Auto-Laden | Modul Wallbox, Modus «günstig bis Abfahrt» | 4 |
| Verlauf und Widget der EMS | Verlauf und Widget «Batterieplan» der App | 1 |

**Reihenfolge der Abschaltung** (immer erst Schatten, dann Wechsel, dann alten Flow aus):

1. Nach Etappe 3: in Andis EMS `price_charge_enabled` für die Batterie aus. Die drei Batterie-Flows hängen dann an
   den Auslösern der App. Andi bleibt für go-e.
2. Nach Etappe 4: go-e hängt an der App. Andis EMS wird in `Ausschalten` gesetzt, seine Flows werden deaktiviert.
3. Die Flows `EMS Test 24h`, `EMS Protokoll`, `EMS Normal Mode: Entladung freigeben` und die Hilfsvariablen
   (`EMS_Halten_aktiv` usw.) werden durch Aufrufe der App ersetzt oder entfernt.

**Was nach der Ablösung bei Andi wegfällt:** seine Planer-Schwächen (Reserve in Stunden, PV nicht abgezogen, kein
Preisabstand-Check, Einmal-Befehle). **Was verloren geht:** die EMS-Funktionen, die Richard nicht nutzt (Überschuss
für Verbraucher über die EMS, Widgets, E-Auto-Planung mit Profilen). Wer sie braucht, bleibt bei Andi.

### 13.8 Risiken des Vollausbaus

* **Umfang und Pflege:** Je mehr Module, desto mehr Sonderfälle (Anlagenwissen steckt in Richards Flows: ISG-Timer,
  Modbus-Sollwerte, Gerätegrenzen). Darum bleibt die Gerätelogik in den Flows der Kunden.
* **Wettbewerb:** Andis EMS, Ultimate EMS und Smart EMS decken Teile davon schon ab. Der Mehrwert der App liegt bei
  Schweizer Tarifen (15 Minuten), dem Plan statt der Faustregel und dem Nachweis über die Schattenrechnung.
* **Sicherheit:** Wärmepumpe und Wallbox sind riskanter als die Batterie (Verschleiss, Netzanschluss, Auto). Für
  beide gilt: Standard aus, Schattenmodus, Mindestzeiten, Rückfall und Notaus. Kein Modul ohne Messphase.
* **Heutige Flows nicht anfassen**, bevor ein Modul im Schatten bewiesen ist (Richards Flows haben jeweils Jahre
  Erfahrung, die der Planer erst einholen muss).


## 14. Produktanforderungen: für alle, nicht nur für Richards Haus

Ziel: Ein Kunde mit PV, Batterie und dynamischem Tarif bekommt **Preise, Kosten, Plan und Steuerung aus einer App**,
egal welche Batterie, welcher Wechselrichter und welche Wallbox. Damit das stimmt, gelten diese Regeln für alles
ab Etappe 1.

### 14.1 Allgemein statt individuell

* **Keine festen IDs, Namen oder Uhrzeiten** im Code. Alles ist eine Einstellung mit sinnvollem Standard.
* **Zwei Ansteuerungsarten, ein Auslöser:** Modus-Karten (Huawei LUNA2000, SMA: Zwangsladen, Max. Entladeleistung, Normal) und Zielleistung (`target_power_w`, Batterie-Apps mit schreibbarer Fähigkeit). Der Kunde nimmt, was seine Geräte-App kann; jede Marke braucht einen Test (Beta).
* **Geräte-unabhängig:** Der Planer kennt nur Modi (`charge`, `hold`, `normal`, `discharge`) und Leistungen. Wie ein Modus an
  einem bestimmten Gerät aussieht, entscheidet der Flow des Kunden. Dazu gibt es **Vorlagen**, die man importiert:
  Huawei LUNA2000, Sungrow, Victron, Zendure/Marstek, Batterien mit `target_power` (positiv laden, negativ entladen),
  go-e, Easee, Zaptec, Tesla, SG-Ready über Shelly oder Relais, Boiler mit Relais oder Sollwert.
* **Verbraucher-Typen statt Gerätelogik:** `schaltbar`, `stufig` (z. B. SG-Ready mit vier Zuständen), `regelbar`
  (Ladestrom der Wallbox), `sollwert` (Warmwasser-Temperatur verschieben). Richards Regeln (Mindestzeit 60 Min., Wechsel nur alle
  45 Min., PV-Fenster bis 17:00) sind **Einstellungen** dieser Typen, nicht Code.
* **Preisquelle als Schnittstelle:** Der Planer arbeitet mit `PriceStore`. Weitere Werke mit Swisspower/Innostrom laufen
  automatisch mit. Eine andere Preisquelle (z. B. ENTSO-E) wäre später eine zweite Implementierung, kein Umbau.
* **Tarifmodelle:** dynamische Bezugspreise inkl. Netzanteil, Einspeisevergütung als Einstellung (Referenz oder API,
  wie heute), später Leistungspreis.

### 14.2 Einrichtung für Kunden (Assistent in der Lasche «Planer»)

1. Batterie angeben (Kapazität, Leistung, Wirkungsgrad, Grenzen) – schon vorhanden.
2. **Eingänge einrichten:** Die Seite zeigt, welche Meldekarten fehlen oder veraltet sind (Ladestand, PV-Prognose,
   PV-Produktion, Leistungen) mit Knopf «Beispiel-Flow anzeigen» (Anleitung und importierbarer Flow-Text).
3. **Ausgänge einrichten:** Vorlage für das eigene Gerät wählen und die drei Flows (Laden, Halten, Normal) kopieren.
4. **Schattenmodus** einschalten, nach 14 Tagen Bericht «was hätte der Plan gebracht» anschauen, erst dann freigeben.

Ohne Berechtigung kann die App die Flows nicht selbst anlegen. Die Vorlagen und die Prüfung der Eingänge ersetzen das.

### 14.3 Sicherheit und Verantwortung

* **Standard aus**, Schattenmodus zuerst, Rückfall auf `normal`, Notaus (Abschnitt 5) – für jeden Kunden, nicht nur Richard.
* Klare Texte: «experimentell», «auf eigene Verantwortung», was passiert bei Datenausfall, wie man abschaltet.
* Kein Eingriff in andere Apps. Hinweis in der Einrichtung: pro Batterie darf nur ein Steuerer laufen (Andis EMS, Ultimate EMS,
  Smart EMS und eigene Flows zuerst ausschalten).
* **Datenschutz:** Alles bleibt auf dem Homey. Keine Cloud, keine Telemetrie.

### 14.4 Veröffentlichung in Stufen

| Stufe | Inhalt | Kanal |
|---|---|---|
| Alpha | Schattenplaner, nur Anzeige (Etappe 1) | Richards Homey (Test-App) |
| Beta | Batterie steuern, opt-in (Etappe 3) | Test-Kanal im Store, Freiwillige aus dem Forum (Thread existiert) |
| Allgemein | Batterie stabil, danach Module nach Etappe 4 und folgende | Store, Version mit Hinweis «experimentell» in der Beschreibung |

Vorher: Beschreibung und Tags prüfen (keine Versorgernamen in App-Texten, Namen nur in Store-Beschreibung/Tags), alle Texte in de, en, fr, it.

### 14.5 Tests über Richards Haus hinaus

* Beta-Tester mit **anderen Batterien** (nicht Huawei) und anderen Tarifen (andere Werke): gesucht über das Forum.
* **Testdaten statt Hausdaten:** Synthetische Tage für typische Fälle (PV-reich, PV-arm, Mittagsmulde, Zeitumstellung), damit nichts auf
  Richards Muster passt.
* Messbare Zusagen erst nach Messung: Aussagen wie «spart X» gibt es nur mit Zahlen aus dem Schattenvergleich.

### 14.6 Offene Produktfragen

* Wer unterstützt Kunden bei Fehlern (Forum-Thread, GitHub-Issues)?
* Wie viel Steuerung traut sich ein Kunde ohne Flow-Kenntnisse? Reichen Vorlagen, oder braucht es später die starke Berechtigung für eine
  automatische Einrichtung (bewusst nur als zweite, ausdrücklich freigegebene Stufe)?
* Preis der App: weiter gratis? (Entscheid später, nicht jetzt.)
