<!--
Draft for a new post in the community thread. Not posted yet. Replace the screenshot placeholders.
-->

# Update 0.2.1: costs, three widgets, battery analysis

Thanks to everyone who gave early feedback. This update turns the app from "show the price" into "show what the dynamic tariff does for you".

**Three dashboard widgets**
- **Price:** the curve with a reference line and the cheapest 2-hour block. A "Grid import" button overlays what you bought from the grid.
- **Price list:** all 24 hours in a grid, color-coded, with the cheapest and most expensive block marked. Tap an hour for its quarter-hours.
- **Costs:** your accumulated cost against your old tariff.

[SCREENSHOT: the three widgets]

**Cost comparison against your old tariff**
Report cumulative meter readings from a Flow (grid import/export, battery, single consumers like an EV or heat pump) and see costs, savings and the battery benefit, per day, week, month and in total. Enter your old tariff directly or calculate it from the lines of your bill, with validity periods for price changes and an optional fixed-cost difference. No extra permissions are needed.

[SCREENSHOT: costs tab]

**Battery analysis (read-only)**
For every full day the app recomputes what an optimal charging plan would have earned, inside a charge range you set (default 5 to 90 %). Nothing is controlled. It is an upper bound with perfect foresight, so treat it as a guide, not a promise.

**Settings page**
Four tabs (Overview, Costs, Settings, Help). Page through the last 14 days in the Costs tab. The price table shows an hourly grid with the cheapest block of the day and from now on. There is now an appearance option (automatic, light, dark).

**Smaller changes**
- The refresh button on the device tile is gone, which also removes the duplicate "Press the button" Flow card. The Flow card "Reload prices now" stays, and the app reloads missing prices when you open its settings.
- Feed-in in the comparison is valued like your reference tariff by default, because it depends on your grid operator whether it is paid dynamically. "Advanced" switches to the API's feed-in price.
- VAT is now set once in the app settings instead of per device.

**A note on the screenshots**
All screenshots in this thread come from a live test with real data, but only about two days so far. Longer series (weeks of costs, the 30-day view, the battery analysis over many days) are not available yet, so the numbers you see are a first impression, not a result. I will add longer data as it comes in.

**What I would like feedback on**
- Does the comparison match your first dynamic bill?
- Is anything unclear in the settings page or the example Flows in the settings guide above?
- If your grid operator pays dynamic feed-in to PV customers, please tell me which one, so I can verify the default.

The settings guide in this thread is updated for 0.2.1.
