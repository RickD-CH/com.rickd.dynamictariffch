<!--
Draft for the community thread (replaces the old "Settings guide and FAQ" post). Not posted yet.
Replace every [SCREENSHOT: ...] with an image before posting.
-->

# Settings guide and FAQ (v0.2.1)

## 1. Pairing

You need two things from your grid operator: the **metering point number** (33 characters, starts with `CH...`) and the **API token**. Enter both when you add the device. A wrong token or a wrong number both come back as HTTP 403, so the app names both in the error message.

If the token is rejected later, open the device and use **Repair** with the same metering point.

**Test environment:** Innostrom has a public test environment with constant dummy prices. If you pair with the published test metering point and token, the device switches to test automatically. Production credentials do not work there. Constant prices therefore mean you are on the test environment.

[SCREENSHOT: pairing screen]

## 2. The app settings page (Settings → Apps → this app)

The page has four tabs.

**Overview.** Live values (current price, level, next price, rank, low/average/high) and the price curve with your reference tariff as a dashed line. "Chart | Table" switches to an hourly grid: tap an hour to see its four quarter-hours. The green/red edge marks the cheapest/most expensive 2-hour block, and "from now" shows the cheapest block that is still ahead.

[SCREENSHOT: overview, chart]
[SCREENSHOT: overview, table with a tapped hour]

**Costs.** Costs and savings against your reference tariff for today, week, month and total, consumers (EV, heat pump), the battery analysis and the curves. Use the arrows to page through the last 14 days. The 30-day view unlocks once seven days of data exist.

[SCREENSHOT: costs tab with curves and the day arrows]

**Settings.** Collapsible sections: Setup (a 3-step checklist that folds away when done), General (VAT, and under "Advanced" how feed-in is valued), Appearance (automatic / light / dark), Reference tariff, Battery, Meter readings, Manage data.

[SCREENSHOT: settings tab with the setup checklist]

**Help.** Features, recommended settings and the link to this thread.

## 3. Device settings (gear icon on the device)

| Setting | What it does |
|---|---|
| Price used for Flows | **Total** (energy + grid), Energy only, or Grid only. Total is the one that matters for decisions. |
| Fallback price | Used when a day has no prices; 0 turns it off. |
| Price level thresholds | Percent of the daily average. Defaults: very cheap below 75, cheap below 90, expensive above 110, very expensive above 125. |

VAT (default 8.1 %, added to the API prices, which are excluding VAT) is set once in the app settings, not per device.

## 4. When prices are fetched

- On app start: today and tomorrow.
- Daily from 16:05: tomorrow's prices, retried every 15 minutes until 23:45 if incomplete.
- At 18:30 without tomorrow's prices: the alarm turns on and the fallback price applies.
- Network or server errors: retries after 1, 2, 5, 10 and 15 minutes.
- If today's price is missing when you open the app settings, the app reloads it by itself (at most every 5 minutes).

## 5. Dashboard widgets

Add them from the Homey dashboard editor.

- **Innostrom price:** current price, level, next price, rank, low/average/high, the cheapest 2-hour block and today's and tomorrow's curve with the reference line. The **Grid import** button overlays the kWh you bought from the grid.
- **Innostrom price list:** 24 hours as a grid with day tabs, cheapest and most expensive block, tap an hour for its quarter-hours.
- **Innostrom costs:** accumulated cost with the dynamic tariff against the reference tariff.

[SCREENSHOT: the three widgets on a dashboard]

## 6. Cost comparison: how the numbers get in

The app does not read other devices. You report cumulative meter readings from a Flow:

1. In the app settings, enter your **reference tariff** (your old import and feed-in price), directly or with the calculator from the lines of your bill.
2. Create a Flow: **When** Time: every 15 minutes, **Then** "Report grid import counter" (and export, battery charge/discharge, and "Report consumer counter" for an EV or heat pump). In the counter field pick your meter's cumulative kWh value (the one that keeps counting up, not W and not "today").
3. The first report only sets the baseline; from the second one on the kWh are priced.

[SCREENSHOT: the reporting Flow]

## 7. Example Flows with prices

**Run a consumer in the cheapest hours** (boiler, heat pump)
- *When* "The cheapest block of 3 hours between 20:00 and 06:00 begins"
- *Then* switch the boiler on, and switch it off again with a delay of 3 hours.
The trigger card gives you the average price and the end time as tokens.

**EV charging only in the cheapest block**
- *When* "The price has changed" (every quarter-hour)
- *And* "Now is in the cheapest block of 4 hours between 18:00 and 07:00"
- *Then* start charging. Make a second Flow with the condition inverted to stop.

**Plan for tomorrow**
- *When* "Tomorrow's prices are available"
- *Then* "Find the cheapest block of 2 hours between 11:00 and 16:00" and use the start/end tokens in a notification or to schedule your consumer.

**Feed an energy management app with hourly prices**
- *When* "Tomorrow's prices are available"
- *Then* "Get tomorrow's hourly prices" and hand the token to your EMS card. The token is a JSON array of 24 values (Rp./kWh incl. VAT, index 0 = 00:00-01:00), for example `[19.8,18.2,17.5,...]`.
- On the spring-forward day the 02:00 hour does not exist, so this card fails that day instead of returning an incomplete array.

**Not on the dynamic tariff yet?** Put a Logic yes/no variable ("dynamic tariff active") in front of your price Flows, so they only run from your start date.

[SCREENSHOT: one of the example Flows]

## 8. FAQ

- **Which utilities?** Any utility that offers dynamic tariffs via Innostrom. AEW Classic Dynamic (from 1 January 2027) is the first target.
- **Why are my prices constant?** You are on the test environment (see Pairing).
- **When are tomorrow's prices there?** Normally around 16:00.
- **Why does the total differ from my bill?** Fixed fees (base fee, metering fee) are not part of the 15-minute price.
- **Daylight saving?** Days have 92 or 100 quarter-hours, the app handles that.
- **Is feed-in paid dynamically?** That depends on your grid operator. By default the cost comparison values feed-in like your reference tariff; "Advanced" lets you use the API's feed-in price instead.
- **Requirements?** Homey Pro, no special permissions, no cloud access beyond the Innostrom API. The token stays on your Homey and is never logged.
- **Where is the refresh button?** Gone. Use the Flow card "Reload prices now"; the app reloads missing prices when you open its settings.
