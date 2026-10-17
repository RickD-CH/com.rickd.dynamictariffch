<!--
Draft: extra FAQ entries for the settings guide (post 2). Same [details] format as the existing FAQ.
Not posted yet. Pick the ones you want.
-->

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
