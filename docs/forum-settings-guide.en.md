<!--
Draft for the community thread (replaces the old "Settings guide and FAQ" post). Not posted yet.
Replace every [SCREENSHOT: ...] with an image before posting.
-->

# Settings guide and FAQ (v0.2.3)

## 1. Pairing

You need two things from your grid operator: the **metering point number** (33 characters, starts with `CH...`) and the **API token**. Enter both when you add the device. A wrong token or a wrong number both come back as HTTP 403, so the app names both in the error message.

If the token is rejected later, open the device and use **Repair** with the same metering point.

**Test environment:** Innostrom has a public test environment with constant dummy prices. If you pair with the published test metering point and token, the device switches to test automatically. Production credentials do not work there. Constant prices therefore mean you are on the test environment.

[SCREENSHOT: pairing screen]

## 2. The app settings page (Settings → Apps → this app)

The page has four tabs.

**Overview.** Live values (current price, level, next price, rank, low/average/high), a **Status card** (below) and the price curve with your reference tariff as a dashed line. "Chart | Table" switches to an hourly grid: tap an hour to see its four quarter-hours. The green/red edge marks the cheapest/most expensive 2-hour block, and "from now" shows the cheapest block that is still ahead.

The **Status card** sits under the live values. It shows when prices were last fetched and when the next fetch is planned, how many quarter-hours you have for today and tomorrow, the last error, the environment (production or test), and when each reported meter reading last arrived. It turns amber or red when something needs your attention, for example when tomorrow's prices are still missing or when meter readings stop arriving.

[SCREENSHOT: overview, chart]
[SCREENSHOT: status card]
[SCREENSHOT: overview, table with a tapped hour]

**Costs.** Costs and savings against your reference tariff for today, week, month and total, consumers (EV, heat pump), the battery analysis (with the efficiency per day and overall) and the curves. Use the arrows to page through the last 14 days. The 30-day view unlocks once seven days of data exist.

[SCREENSHOT: costs tab with curves and the day arrows]

**Settings.** Collapsible sections: Setup (a 3-step checklist that folds away when done), General (VAT, and under "Advanced" how feed-in is valued), Hourly prices for an EMS (unit, VAT and decimals of the hourly price list), Appearance (automatic / light / dark), Reference tariff, Battery, Meter readings, **Monitoring** (when to warn about missing meter readings), **Test Flows** (buttons that fire the new triggers right away), **Backup** and Manage data.

[SCREENSHOT: settings tab with the setup checklist]

**Help.** Features, recommended settings and the link to this thread.

The page is available in English, German, French and Italian, following the language of your browser or phone.

## 3. Device settings (gear icon on the device)

| Setting | What it does |
|---|---|
| Price used for Flows | **Total** (energy + grid), Energy only, or Grid only. Total is the one that matters for decisions. |
| Fallback price | Used when a day has no prices; 0 turns it off. |
| Price level thresholds | Percent of the daily average. Defaults: very cheap below 75, cheap below 90, expensive above 110, very expensive above 125. |

**Displayed values.** Optional values you can add to the device tile and use in Flows. They are the same numbers as in the Costs tab.

| Setting | What it does |
|---|---|
| Cost values | Cost today, cost with your old tariff, savings today and this month, average import price. Automatic (only once meter readings arrive), always, or never. |
| Battery analysis values | Battery efficiency and the value of grid charging. Automatic (only if you report battery meters), always, or never. |
| Feed-in price | Checkbox, on by default: shows the feed-in price from the API. |

VAT (default 8.1 %, added to the API prices, which are excluding VAT) is set once in the app settings, not per device.

## 4. When prices are fetched

- On app start: today and tomorrow.
- Daily from 16:05: tomorrow's prices, retried every 15 minutes until 23:45 if incomplete.
- At 18:30 without tomorrow's prices: the alarm turns on and the fallback price applies.
- Network or server errors: retries after 1, 2, 5, 10 and 15 minutes.
- If today's price is missing when you open the app settings, the app reloads it by itself (at most every 5 minutes).
- The Status card shows all of this live: last fetch, next planned fetch, failed attempts in a row and the last error.

**Backup:** every night at 03:30 and when the device is removed, the app saves your cost data in the app settings. See "Backup and monitoring" below.

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
- *Then* "Get tomorrow's hourly prices" and hand the token to your EMS card. The token is a JSON array of 24 values, index 0 = 00:00-01:00. By default the values are Rp./kWh incl. VAT, for example `[19.8,18.2,17.5,...]`.
- The format of the list is set in the app settings (section "Hourly prices for an EMS"): Rp./kWh or CHF/kWh, with or without VAT, and the number of decimals. If your EMS expects CHF/kWh (like the Huawei FusionSolar EMS), choose CHF/kWh there and the list comes out as `[0.198,0.182,0.175,...]`, so you do not need a HomeyScript to divide by 100.
- On the spring-forward day the 02:00 hour does not exist, so this card fails that day instead of returning an incomplete array.

**A message with yesterday's numbers**
- *When* "The day has been summarised" (fires shortly after midnight)
- *Then* send a notification with the tokens, for example "Yesterday: [[savings]] CHF saved, battery benefit [[batteryBenefit]] CHF, efficiency [[batteryEfficiency]] %". Further tokens: import/export kWh, cost with the dynamic and the old tariff, average import price, value of grid charging. The very first night after updating to 0.2.3 stays silent, so you do not get a message for a day that was not tracked yet.
- The app settings page has a button "Fire 'day summarised' (for yesterday)" to test the Flow right away.

**Warn me when my meter readings stop**
- *When* "Meter readings stopped arriving"
- *Then* send a notification with the tokens "Minutes since the last reading" and "Affected meters". Add a second Flow *When* "Meter readings are arriving again" for the all-clear.
- Alternatively use the condition "Meter readings are missing" in any Flow. The same state is also a device value ("Meter readings missing") and, if enabled, one message in the timeline per incident.

**Not on the dynamic tariff yet?** Put a Logic yes/no variable ("dynamic tariff active") in front of your price Flows, so they only run from your start date.

[SCREENSHOT: one of the example Flows]

## 8. Backup and monitoring

**Backup.** The app saves your cost data every night at 03:30 and when you remove the device. The backup lives in the app settings, so it survives re-adding the device. If a new device has no cost data, the Costs tab offers to restore it. In App settings, Settings tab, "Backup", you can also save a backup right now, export it as text (to keep or to use on another Homey) and import text with a preview: it shows the period, the days and the totals, and whether you would merge or replace. The token is never part of a backup.

**Monitoring.** If you report meter readings from a Flow and they stop arriving for longer than the threshold (App settings, "Monitoring", default 1 hour, 0 = off), the Status card turns amber, the device value "Meter readings missing" switches on and, if enabled, one timeline message is sent per incident. After 6 hours or six times the threshold (whichever is longer) it escalates to a red alarm. Only meters you have reported at least once are watched, and consumers (EV, heat pump) only if you tick them. If you do not report any meters, you never get a warning.

[SCREENSHOT: monitoring settings]

## 9. FAQ

- **Which utilities?** Any utility that offers dynamic tariffs via Innostrom. AEW Classic Dynamic (from 1 January 2027) is the first target.
- **Why are my prices constant?** You are on the test environment (see Pairing).
- **When are tomorrow's prices there?** Normally around 16:00.
- **Why does the total differ from my bill?** Fixed fees (base fee, metering fee) are not part of the 15-minute price.
- **Daylight saving?** Days have 92 or 100 quarter-hours, the app handles that.
- **Is feed-in paid dynamically?** That depends on your grid operator. By default the cost comparison values feed-in like your reference tariff; "Advanced" lets you use the API's feed-in price instead.
- **Requirements?** Homey Pro, no special permissions, no cloud access beyond the Innostrom API. The token stays on your Homey and is never logged.
- **Where is the refresh button?** Gone. Use the Flow card "Reload prices now"; the app reloads missing prices when you open its settings.

[details="Where do I get the metering point number and the token?"]
Your grid operator provides both when you sign up for its dynamic tariff. If you only want to try the app, use the public test credentials (see Pairing); you then get constant dummy prices.
[/details]

[details="The Costs tab / widget shows nothing, why?"]
The app does not read your meters by itself. It needs a Flow that reports cumulative kWh counters (see "Cost comparison: how the numbers get in"). The first report only sets the baseline, so costs appear from the second report on. Also check that you entered a reference tariff.
[/details]

[details="How often should I report the meter readings?"]
Every 15 minutes is ideal, at least hourly. After a long pause the increase is attributed to the last hour, so the quarter-hour prices are only used for that one hour.
[/details]

[details="Which counter do I pick for the battery and the consumers?"]
Always a cumulative value in kWh that keeps counting up: total charged energy and total discharged energy for the battery, the total energy counter for a consumer such as an EV or a heat pump. Not the power in W and not a "today" value, which resets at midnight.
[/details]

[details="What happens with negative prices?"]
They are handled like any other price: the price shows as negative, the Flow cards and thresholds work with them, and the cost comparison counts import at a negative price as income and export at a negative price as a cost (shown in a separate note).
[/details]

[details="Does the app control my battery or my EV?"]
No. The app only provides prices, Flow cards and the cost comparison. The battery analysis is a read-only calculation of what an optimal charging plan would have brought, with perfect foresight inside the charge range you set (default 5 to 90 %). Treat it as an upper bound, not a promise.
[/details]

[details="Can I use several metering points?"]
You can add several devices and use them in Flows. The widgets, the app settings page and the cost comparison show the first device only for now.
[/details]

[details="How do I start over with the cost data?"]
App settings, Settings tab, "Manage data": delete single days or a consumer, reset the meter baselines (for example after replacing a meter) or delete all cost data. Every delete needs a second click, and price data and the reference tariff are always kept.
[/details]

[details="The widget does not update."]
Widgets poll the app once a minute. A new price shows up at the start of the next quarter-hour. If a widget stays empty, open the app settings once: the app reloads missing prices by itself.
[/details]

[details="How do I back up my cost data? What happens if I remove the device?"]
From version 0.2.3 the app backs up the cost data every night at 03:30 and when you remove the device, in the app settings (it survives re-adding the device). If the new device has no cost data, the Costs tab offers to restore it. You can also export the backup as text (App settings, Settings tab, "Manage data", "Backup") and import it later or on another Homey. The token is never part of a backup.
[/details]

[details="What does the Status card in the app overview show? When does the app warn me?"]
The Status card (under the live values) shows when prices were last fetched and when the next fetch is planned, how many quarter-hours are available for today and tomorrow, the last error, and when each reported meter reading last arrived. If you report meter readings from a Flow and they stop arriving for longer than the threshold (App settings, "Monitoring", default 1 hour), the card turns amber, the capability "Meter readings missing" switches on and, if enabled, a message goes to the timeline (once per incident). Only meters you have reported at least once are monitored; if you do not report any, you never get a warning. Set the threshold to 0 to switch monitoring off.
[/details]

[details="What does the battery efficiency mean?"]
For every full day the app computes the best possible battery benefit (an optimal charging plan with perfect foresight, inside your battery's charge range) and compares it with what your real day achieved. Efficiency is the share you reached, from 0 to 100 %. Days with almost nothing to gain are ignored. It is an estimate: the meters change coarsely, so a day can even beat the plan. The app only shows the numbers, it controls nothing. You can also get them as device values (device settings, "Battery analysis values") and in the daily summary trigger.
[/details]
