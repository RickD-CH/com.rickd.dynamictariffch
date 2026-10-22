<!--
Complete FAQ for post 2 (replaces the whole "FAQ" section at the end, from the heading on). Version 0.2.3.
Every entry is a collapsible block ([details]). Copy everything below this comment into the post.
-->

## FAQ

### Getting started

[details="Which utilities does the app work with?"]
Any Swiss utility that offers its dynamic tariff via the Innostrom platform (Swisspower). AEW Classic Dynamic, which starts on 1 January 2027, is the first target.
[/details]

[details="Where do I get the metering point number and the token?"]
Your grid operator provides both when you sign up for its dynamic tariff. If you only want to try the app, use the public test credentials (see "Pairing"); you then get constant dummy prices.
[/details]

[details="Why are my prices constant?"]
You are on the Innostrom test environment, which delivers constant dummy prices. It is selected automatically when you pair with the public test metering point and token. Production credentials do not work there, and real prices only appear with your operator's credentials.
[/details]

[details="The app says the credentials are rejected (HTTP 403). What now?"]
A wrong token and a wrong metering point number both come back as 403, so check both. If the token was renewed later, open the device and use **Repair** with the same metering point number. A different metering point needs a new device.
[/details]

[details="What does the app need? Is anything sent to a cloud?"]
Homey Pro, no special permissions, and no cloud access beyond the Innostrom API. The token stays on your Homey and is never logged or included in a backup.
[/details]

[details="Is the app available in other languages?"]
English, German, French and Italian: the app, its Flow cards and the app settings page follow the language of your Homey or browser. The settings page also follows light and dark mode, or you can choose in "Appearance".
[/details]

### Prices

[details="When are tomorrow's prices available?"]
Normally around 16:00. The app fetches them from 16:05 and retries every 15 minutes until 23:45 if they are incomplete. If they are still missing at 18:30, the device value "No prices for tomorrow" switches on, the trigger "No prices for tomorrow yet at 18:30" fires and the fallback price (device setting) applies.
[/details]

[details="Why does the total differ from my bill?"]
Fixed fees such as the base fee and the metering fee are not part of the 15-minute price. The app also shows prices excluding or including VAT depending on the setting (default 8.1 %, set once in the app settings).
[/details]

[details="Which price do the Flow cards use: total, energy or grid?"]
The device setting "Price used for Flows" decides: **Total** (energy + grid, the one that matters for decisions), Energy only, or Grid only.
[/details]

[details="How is the price level (very cheap ... very expensive) calculated?"]
As a percentage of the average price of the day. Defaults: very cheap below 75 %, cheap below 90 %, expensive above 110 %, very expensive above 125 %. You can change the four thresholds in the device settings.
[/details]

[details="What happens on the daylight saving days?"]
Those days have 92 or 100 quarter-hours instead of 96, and the app handles that. On the spring-forward day the 02:00 hour does not exist, so the card "Get hourly prices" fails that day instead of returning an incomplete list.
[/details]

[details="What happens with negative prices?"]
They are handled like any other price: the price shows as negative, the Flow cards and thresholds work with them, and the cost comparison counts import at a negative price as income and export at a negative price as a cost (shown in a separate note).
[/details]

[details="Can I feed the hourly prices to an energy management system (EMS)?"]
Yes, with the cards "Get today's / tomorrow's hourly prices". They return a JSON list of 24 values. In the app settings (section "Hourly prices for an EMS") you choose Rp./kWh or CHF/kWh, with or without VAT, and the number of decimals, so you do not need a script in between. If you already convert the list with a script, change the setting and remove the script step at the same time, otherwise the values are divided twice.
[/details]

[details="Where is the refresh button?"]
It is gone. Use the Flow card "Reload prices now". The app also reloads missing prices by itself when you open its settings (at most every 5 minutes).
[/details]

[details="The widget does not update."]
Widgets poll the app once a minute. A new price shows up at the start of the next quarter-hour. If a widget stays empty, open the app settings once: the app reloads missing prices by itself.
[/details]

### Cost comparison

[details="The Costs tab or the cost widget shows nothing. Why?"]
The app does not read your meters by itself. It needs a Flow that reports cumulative kWh counters (see "Cost comparison: how the numbers get in"), and a reference tariff must be entered. The first report only sets the baseline, so costs appear from the second report on.
[/details]

[details="Which counter do I pick for the grid, the battery and the consumers?"]
Always a cumulative value in kWh that keeps counting up: total energy imported from and exported to the grid, total charged and total discharged energy for the battery, and the total energy counter for a consumer such as an EV or a heat pump. Not the power in W and not a "today" value, which resets at midnight.
[/details]

[details="How often should I report the meter readings?"]
Every 15 minutes is ideal, at least hourly. After a long pause the increase is attributed to the last hour, so the quarter-hour prices are only used for that one hour.
[/details]

[details="Is the feed-in paid dynamically?"]
That depends on your grid operator. By default the cost comparison values feed-in like your reference tariff. Under "Advanced" in the app settings you can use the API's feed-in price instead.
[/details]

[details="Where do I see the cost numbers on the device, and how do I choose which ones?"]
In the device settings, group "Displayed values": cost values (cost today, cost with your old tariff, savings today and this month, average import price), battery analysis values, and the feed-in price. Each can be automatic, always or never (the feed-in price is a checkbox). They are the same numbers as in the Costs tab, available for the tile and for Flows.
[/details]

[details="How do I get yesterday's numbers as a message?"]
Use the trigger "The day has been summarised". It fires shortly after midnight and gives you yesterday's import/export kWh, cost with the dynamic and the old tariff, savings, average import price, battery benefit, battery efficiency and the value of grid charging as tokens. The very first night after updating to 0.2.3 stays silent. In the app settings, "Test Flows", a button fires the trigger right away so you can build the Flow.
[/details]

[details="How do I start over with the cost data?"]
App settings, Settings tab, "Manage data": delete single days or a consumer, reset the meter baselines (for example after replacing a meter) or delete all cost data. Every delete needs a second click, and price data and the reference tariff are always kept.
[/details]

### Battery

[details="Does the app control my battery or my EV?"]
No. The app only provides prices, Flow cards and the cost comparison. The battery analysis is a read-only calculation of what an optimal charging plan would have brought, with perfect foresight inside the charge range you set (default 5 to 90 %). Treat it as an upper bound, not a promise.
[/details]

[details="What does the battery efficiency mean?"]
For every full day the app computes the best possible battery benefit (an optimal charging plan with perfect foresight, inside your battery's charge range) and compares it with what your real day achieved. Efficiency is the share you reached, from 0 to 100 %. Days with almost nothing to gain are ignored. It is an estimate: the meters change coarsely, so a day can even beat the plan. The app only shows the numbers and controls nothing. You can also get them as device values (device settings, "Displayed values") and in the daily summary trigger.
[/details]

[details="What is the value of grid charging?"]
It is what an optimal plan that may also charge from the grid at cheap prices would have gained on top of a plan that uses solar surplus only, in CHF. It is shown per day and overall in the battery analysis and is only an estimate.
[/details]

[details="How do I set my battery's limits?"]
App settings, Settings tab, section "Battery": usable capacity (kWh), maximum charge and discharge power (one value in kW, the same for both), round-trip efficiency (%), and the minimum and maximum charge level (default 5 to 90 %). The analysis only works inside these limits.
[/details]

### Monitoring and backup

[details="What does the Status card show? When does the app warn me?"]
The Status card (under the live values in the app overview) shows when prices were last fetched and when the next fetch is planned, how many quarter-hours you have for today and tomorrow, the last error, the environment (production or test) and when each reported meter reading last arrived. If you report meter readings from a Flow and they stop arriving for longer than the threshold (App settings, "Monitoring", default 1 hour), the card turns amber, the device value "Meter readings missing" switches on and, if enabled, one message goes to the timeline per incident. Only meters you have reported at least once are monitored; if you do not report any, you never get a warning. Set the threshold to 0 to switch monitoring off.
[/details]

[details="How do I get a notification when my meter readings stop?"]
Build a Flow with the trigger "Meter readings stopped arriving" (tokens: minutes since the last reading, affected meters) and, for the all-clear, "Meter readings are arriving again". The condition "Meter readings are missing" can be used in any other Flow. The settings page has a test button for the trigger.
[/details]

[details="Which meters and consumers are monitored?"]
App settings, "Monitoring": you tick the meters (grid import/export, battery charge/discharge) that you report and want watched. Consumers such as an EV or a heat pump are off by default, because they are not running all the time; tick them if they should also raise a warning.
[/details]

[details="How is my cost data backed up? What happens if I remove the device?"]
The app saves your cost data every night at 03:30 and when you remove the device. The backup lives in the app settings, so it survives re-adding the device. If the new device has no cost data, the Costs tab offers to restore it. You can also save a backup right now, export it as text (to keep or to use on another Homey) and import it with a preview that shows the period, the days and the totals, and lets you choose between merge and replace. The token is never part of a backup.
[/details]

### Devices and widgets

[details="Can I use several metering points?"]
You can add several devices and use them in Flows. The widgets, the app settings page and the cost comparison show the first device only.
[/details]

[details="I am not on the dynamic tariff yet. Can I already try the app?"]
Yes, with the public test credentials, or with your own credentials once you have them. To keep price Flows from running before your start date, put a Logic yes/no variable ("dynamic tariff active") in front of them and switch it on at the start date.
[/details]
