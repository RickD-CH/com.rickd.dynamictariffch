# Dynamischer Stromtarif CH – Homey-App

Homey-Pro-App für dynamische 15-Minuten-Stromtarife von Schweizer Netzbetreibern, die das
Innostrom-Tool von Swisspower verwenden (z. B. **AEW Classic Dynamic** ab 1.1.2027).

**Status:** Vorbereitung. API-Client, Preislogik und Tests sind fertig, die Homey-App selbst wird
mit Claude Code gebaut → siehe `KICKOFF.md`.

## Schnellstart

```bash
npm test          # 19 Unit-Tests
npm run probe     # Live-Test gegen die Innostrom-Testumgebung
```

Danach im Ordner `claude` starten und den Text aus `KICKOFF.md` einfügen.

## Aufbau

```
CLAUDE.md                  Kontext und Regeln für Claude Code
KICKOFF.md                 Start-Prompt
docs/SPEC.md               Funktionsumfang der App
docs/innostrom-api.md      API-Referenz + beobachtetes Verhalten
docs/innostrom-swagger.json  offizielle Spec
lib/                       fertige Bausteine (Client, PriceStore, Zeit)
test/                      Unit-Tests + Fixtures
scripts/                   probe-api.mjs, make-fixtures.mjs
```
