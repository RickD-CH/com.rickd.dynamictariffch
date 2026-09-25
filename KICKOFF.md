# Start-Prompt für Claude Code

Im Projektordner `claude` starten und den folgenden Text einfügen. Claude Code liest `CLAUDE.md`
automatisch.

---

Lies CLAUDE.md, docs/SPEC.md und docs/innostrom-api.md. Schau dir die fertigen Module in lib/ und
die Tests an und führe `npm test` aus.

Baue dann die Homey-App gemäss SPEC fertig, in dieser Reihenfolge, und halte nach jedem Schritt kurz
an, damit ich testen kann:

1. Homey-Compose-Gerüst (SDK 3, App-ID com.rickd.innostrom, de/en), Driver „tariff“ mit Pairing über
   Messpunktnummer + Token inkl. Verbindungstest. Umgebung Test/Produktiv wählbar, damit ich es jetzt
   schon mit den öffentlichen Test-Zugangsdaten auf meinem Homey ausprobieren kann.
2. Device: Abruf heute+morgen, täglicher Abruf ab 16:05 mit Wiederholungen, Viertelstunden-Tick,
   Capabilities, Persistenz im Store, sauberes Aufräumen der Timer.
3. Flow-Karten gemäss SPEC (zuerst `is_among_cheapest`, `price_changed`, `tomorrow_available`,
   `find_cheapest_block`, dann der Rest).
4. `homey app validate --level publish` fehlerfrei.

Verwende lib/InnostromClient.js, lib/PriceStore.js und lib/time.js. Nicht neu schreiben, bei Bedarf
erweitern und Tests ergänzen. Recherchiere, ob eine App Preise an Homey Energy übergeben kann, und
sag mir das Ergebnis, statt es anzunehmen.
