# Fixtures

| Datei | Herkunft |
|---|---|
| `test-env-integrated-5slots.json` | **Echte Antwort** der Testumgebung (25.09.2026, Abfrage 10:00Z–11:00Z, Antwort kam in +02:00 zurück!) |
| `test-env-all-day.json` | Aus echter Testumgebungs-Struktur erzeugt (96 Slots, Testumgebung liefert konstante Werte 0.1/0.1/0.1/0.2/0.0) |
| `synthetic-aew-day.json` | **Synthetisch**: realistischer Tagesverlauf innerhalb der AEW-Grenzen 2027 (Energie 5.19–15.56 Rp., Netz 1.00–25.60 Rp.) + fixe Abgaben. Für Logik-Tests (günstigste N Slots usw.) |
| `synthetic-dst-spring.json` | **Synthetisch**: 29.03.2026 (Umstellung auf Sommerzeit), 92 Slots |
| `synthetic-dst-autumn.json` | **Synthetisch**: 25.10.2026 (Umstellung auf Winterzeit), 100 Slots |
| `empty-tomorrow.json` | **Echte Antwort**: Folgetag vor der Berechnung (`prices: []`) |
| `error-401-no-auth.json` | **Echte Antwort** ohne Authorization-Header (HTTP 401) |
| `error-403-invalid-token.json` | **Echte Antwort** bei falschem Token ODER falscher Messpunktnummer (HTTP 403) |
| `error-400-missing-params.json` | **Echte Antwort** ohne Zeitstempel (HTTP 400) |
| `error-400-bad-tariff-type.json` | **Echte Antwort** bei ungültigem tariff_type (HTTP 400) |

Neu erzeugen: `node scripts/make-fixtures.mjs`
