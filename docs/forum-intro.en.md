<!--
Draft to replace the text of post 1 in the community thread (keeps the title and the structure). Version 0.2.3.
Not posted yet. Add a screenshot of the three widgets where marked.
-->

Swiss dynamic electricity tariffs change their price every 15 minutes instead of once a year. This app brings those prices into Homey, using the Innostrom API from Swisspower, so your heat pump, EV, boiler or battery can run when electricity is cheapest. AEW is introducing its "Classic Dynamic" tariff in 2027 and the app was built for it. It works with any Swiss utility on the same Innostrom platform.

## What can it do?

**Prices**
- Fetches today's and tomorrow's quarter-hourly prices automatically (tomorrow's as soon as they are published).
- Current price, next price, today's low/high/average, rank of the current slot, and a price level (very cheap ... very expensive).
- Prices survive app restarts; the last update time is shown on the device.

**Three dashboard widgets**
- **Price:** current price and level, the cheapest 2-hour block and today's/tomorrow's curve with your old tariff as a reference line. One tap overlays your grid import.
- **Price list:** all 24 hours in a grid, color-coded, with the cheapest and most expensive block marked and quarter-hours on tap.
- **Costs:** your accumulated cost against your old tariff.

[SCREENSHOT: the three widgets]

**Cost comparison (optional)**
Report cumulative meter readings from a Flow (grid import/export, battery, single consumers like an EV or heat pump) and the app shows costs, savings and the battery benefit against your old tariff, which you enter directly or calculate from your bill. No extra permissions are needed.
- A read-only **battery analysis** shows what an optimal charging plan would have brought, within a charge range you set, and an **efficiency score** (how much of that best case your real days achieved).
- Optional **device values** for the tile and for Flows: cost today, cost with your old tariff, savings today / this month, average import price, feed-in price, battery efficiency. You choose which ones appear in the device settings ("Displayed values").
- A daily **"The day has been summarised"** trigger gives you yesterday's numbers for a notification.

**Keeping an eye on things**
- A **Status card** in the app overview shows when prices were last fetched, how many quarter-hours you have for today and tomorrow, the last error and when each meter reading last arrived.
- If meter readings that you report from a Flow stop arriving, the app warns you (threshold in hours, default 1 h): an alarm value on the device, Flow cards, and optionally one timeline message per incident. Only meters you have reported at least once are watched; if you report nothing, you never get a warning.
- Your cost data is **backed up automatically** every night and survives removing and re-adding the device. You can also export and import the backup as text.

**App settings page**
Overview with live values and status, curve or hourly table, a Costs tab (page through the last 14 days), setup checklist, VAT, reference tariff, battery, monitoring, backup and data tools, and buttons to test your Flows. English, German, French and Italian, light and dark.

### Flow cards (26)
- **When (9):** the price changed; the day has been summarised (yesterday's costs and savings); meter readings stopped arriving / are arriving again; the price rises above / drops below a threshold (only fires when crossing it); tomorrow's prices are available; no prices for tomorrow at 18:30; the cheapest block begins.
- **And (6):** meter readings are missing; price below X; price level is X; the current slot is among the N cheapest / most expensive hours of a window; the current slot is in the cheapest contiguous block.
- **Then (11):** find the cheapest block in a fixed daily window, from now until a time, or within the next N hours; get today's / tomorrow's 24 hourly prices as a JSON array for EMS apps (unit Rp. or CHF per kWh, VAT and decimals are configurable in the app settings); reload prices now; report meter counters (grid import/export, battery charge/discharge, single consumers) for the cost comparison.

## Setup
You need the **metering point number** (EAN) and the **API token** from your grid operator. Both are entered when you add the device; the token stays on your Homey and is never logged. The settings guide further down this thread explains every setting, with example Flows.

## About this app
Homey Pro only, no special permissions, no cloud beyond the Innostrom API. The app only provides prices, Flow cards and calculations; it does not control any device by itself. Source code and issues: [GitHub](https://github.com/RickD-CH/com.rickd.dynamictariffch). Feedback and questions are welcome right here in the thread.
