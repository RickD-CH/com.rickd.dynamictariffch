# Innostrom API v2 – Referenz & beobachtetes Verhalten

Stand: 25.09.2026. Quelle: offizielle Swagger-Spec (`docs/innostrom-swagger.json`) und eigene Tests
gegen die Testumgebung.

Innostrom ist das Tool von **Swisspower**, mit dem Schweizer Netzbetreiber dynamische Tarife berechnen
und ausliefern. Die **AEW Energie AG** nutzt es ab 1.1.2027 für *AEW Classic Dynamic* und *AEW Power
Dynamic*. Andere Werke, die mit Innostrom arbeiten, nutzen dieselbe API. Die App ist also nicht nur
für die AEW brauchbar.

## Umgebungen

| | Basis-URL | Doku |
|---|---|---|
| Produktiv | `https://portal.dynamische-stromtarife.ch/api` | https://portal.dynamische-stromtarife.ch/docs/apiv2 |
| Test | `https://portal-test.dynamische-stromtarife.ch/api` | https://portal-test.dynamische-stromtarife.ch/docs/apiv2 |

Die Spec selbst liegt unter `…/api/v2/swagger_doc.json`. Die Doku-Seite lädt sie per JavaScript,
deshalb zeigen einfache Fetch-Tools eine leere Seite.

**Öffentliche Test-Zugangsdaten** (stehen so in der Test-Doku):

- Messpunktnummer: `CH1018601234500000000000000011642`
- Bearer-Token: `19d6ca0bb9bf4d8b6525440eead80da6`

Die Testumgebung liefert **konstante** Preise (electricity 0.1, grid 0.1, dso 0.1, integrated 0.2,
feed_in 0.0 CHF/kWh). Damit lässt sich die Verbindung testen, aber keine Logik wie „günstigste
Stunden“. Dafür gibt es `test/fixtures/synthetic-aew-day.json`.

**Produktiv-Zugangsdaten:** Token und Messpunktnummer kommen vom Netzbetreiber. Bei der AEW ist der
Ablauf noch nicht öffentlich beschrieben. Der dynamische Tarif ist ab Januar 2027 im Kundenportal
bestellbar, den Token muss man vermutlich über den Kundendienst anfragen (**offen**).

## Endpunkt

```
GET /v2/metering_code
Authorization: Bearer <token>
```

| Parameter | Pflicht | Beschreibung |
|---|---|---|
| `metering_code` | ja | Messpunktnummer (CH…, 33 Zeichen). Bestimmt den Tarif automatisch. |
| `start_timestamp` | ja | RFC3339, beliebige Zeitzone, **URL-codiert** (`+` → `%2B`) |
| `end_timestamp` | ja | RFC3339, siehe Hinweis zum Ende unten |
| `tariff_type` | nein | `integrated` (Standard), `electricity`, `grid`, `dso`, `feed_in`, `all` |

### Bedeutung von `tariff_type`

| Feld | Inhalt |
|---|---|
| `electricity` | Energiepreis (folgt dem Day-Ahead-Spotpreis EPEX CH) |
| `grid` | Netznutzung (Arbeits-, Leistungs-, Grundpreis, Messtarif). Der dynamische Teil folgt der Netzlast. |
| `dso` | grid + SDL + Netzzuschlag + Abgaben |
| `integrated` | dso + electricity = **Gesamtpreis**. Das ist der Wert, der für Entscheidungen zählt. |
| `feed_in` | Rückliefervergütung |
| `all` | alle Felder einzeln (empfohlen, eine Abfrage für alles) |

Jedes Feld ist ein **Array** von `{ value, unit, component }`:

- `unit`: `CHF_kWh` | `CHF_kW` | `CHF_kW_max_d`
- `component`: `work` (Arbeitspreis) | `power` (Leistung) | `fix_price`

Für die App zählt nur die **Summe aller `work`-Komponenten mit `CHF_kWh`**. Andere Komponenten
sind in der Testumgebung nicht vorgekommen, laut Spec aber möglich. Sie werden ignoriert.

AEW-Preise verstehen sich **exklusiv MWST**.

### Antwort (echt, Testumgebung)

```json
{
  "status": "ok",
  "publication_timestamp": "2026-09-24T14:00:55.846+02:00",
  "prices": [
    {
      "start_timestamp": "2026-09-25T12:00:00+02:00",
      "end_timestamp": "2026-09-25T12:15:00+02:00",
      "integrated": [{ "value": 0.2, "unit": "CHF_kWh", "component": "work" }]
    }
  ]
}
```

### Fehler (echt, Testumgebung)

| HTTP | `message` | Ursache |
|---|---|---|
| 400 | `start_timestamp fehlt, start_timestamp ist ungültig, end_timestamp fehlt, …` | Parameter fehlen oder sind ungültig |
| 400 | `tariff_type hat keinen gültigen Wert` | falscher `tariff_type` |
| 401 | `Authorization header must be set.` | Header fehlt |
| 403 | `API token invalid for this request.` | falscher Token **oder** falsche Messpunktnummer (nicht unterscheidbar!) |
| 500 | (laut Spec) `TariffError` | Serverfehler |

## Beobachtetes Verhalten (wichtig, steht so nicht in der Spec)

1. **Ende ist inklusiv, Filter nach Slot-Start.** Geliefert werden Slots, deren `start_timestamp` im
   Bereich `[start, end]` liegt.
   - `10:00`–`10:15` liefert **2** Slots (10:00 und 10:15)
   - `10:07`–`10:20` liefert nur den Slot 10:15. Der angebrochene Slot 10:00 fehlt!
   - Deshalb: Start auf die Viertelstunde abrunden, als Ende `to − 1 s` senden (so macht es auch das
     Spec-Beispiel mit `23:59:59`) und clientseitig filtern. `lib/InnostromClient.js` macht das.
2. **Zeitzone der Antwort:** Laut Spec kommt die Antwort in der Zeitzone der Anfrage. Beobachtet: Eine
   Anfrage in UTC (`…Z`) kam in `+02:00` zurück. Timestamps also immer mit `new Date()` parsen, nie
   als String vergleichen.
3. **Folgetag vor der Berechnung:** `200` mit `"prices": []`. Das ist kein Fehler.
   `publication_timestamp` ist dann „jetzt“.
4. **Berechnungszeit:** laut Spec täglich zwischen 14:00 und 18:00 für den Folgetag. Die AEW
   garantiert „bis spätestens 16:00“. Bis Mitternacht nichts da → es gilt der Einheitstarif des
   Standardprodukts.
5. **Historie:** in der Testumgebung nur einige Wochen zurück. Abfragen über 10 Tage (961 Slots)
   funktionierten, ein Limit wurde nicht gefunden. Trotzdem nur so viel abfragen wie nötig
   (heute + morgen).
6. **Zeitumstellung:** Ein Tag hat 92 (März), 96 oder 100 (Oktober) Viertelstunden. Nicht mit 96
   rechnen.

## AEW-spezifisch (Tarif 2027, aus dem technischen Beschrieb)

- Energie: 5.19–15.56 Rp./kWh, Netz: 1.00–25.60 Rp./kWh, kombiniert 6.19–41.16 Rp./kWh (exkl.
  MWST und Abgaben)
- Preise mit 3 Nachkommastellen in Rp. (also 5 in CHF)
- Nicht dynamisch (kommen auf der Rechnung dazu): Grundpreis, Messtarif, Gemeindeabgabe,
  Netzzuschlag, SDL, Stromreserve, Tarifzuschlag
- Einsparpotenzial laut AEW-Pilot: ca. 5 % mit guter Steuerung

Quellen: [AEW Dynamischer Wahltarif](https://www.aew.ch/privatkunden/strom/strom-beziehen/dynamischer-wahltarif),
[Technischer Beschrieb AEW Classic Dynamic](https://www.aew.ch/sites/default/files/2026-09/Technischer%20Beschrieb_dynamischer_Tarif_AEW_Classic_Dynamic_0.pdf)
