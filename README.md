# Swiss Dynamic Tariff & EMS (Homey Pro app)

Homey Pro app for Swiss dynamic 15-minute electricity tariffs on the Innostrom platform of Swisspower
(for example AEW Classic Dynamic from 1 January 2027). It provides the prices to Flows and dashboard
widgets, and has an optional energy management module (EV charger, home battery, heat pump, appliances).
The price part works on its own; the energy management is off by default and starts as a dry run.

App ID: `com.rickd.dynamictariffch` · Support: Homey Community forum, topic 160031 · Issues: GitHub issues

Deutsch: Homey-Pro-App für dynamische Schweizer Stromtarife (Innostrom/Swisspower) mit optionalem
Energiemanagement. Preise für Flows und Widgets funktionieren auch ohne Energiemanagement.

## Development

```bash
npm test                         # unit tests (node:test, no dependencies)
npm run probe                    # live query against the Innostrom test environment
homey app run                    # run on your Homey
homey app validate --level publish
```

## Layout

```
.homeycompose/   app manifest, capabilities, flow cards
drivers/         price device (pairing, capabilities)
lib/             API client, price store, time helpers, EMS module (lib/ems)
settings/        settings pages
widgets/         dashboard widgets
locales/         texts (de, en, fr, it)
docs/            specification, API notes, EMS documentation
test/            unit tests and fixtures
```
