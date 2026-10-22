<!--
Draft for a new post in the community thread. Not posted yet. Version 0.2.3.
Post it when 0.2.3 is live; then replace post 1 and post 2 with the updated drafts.
-->

# Update 0.2.3: backup, status, cost values and battery efficiency

A bigger update, all of it optional. **Nothing changes in your Flows or widgets if you do not touch it.**

**Backup of your cost data**
The cost data is now backed up automatically every night (and when you remove the device), so it survives removing and re-adding the device. If a new device has no cost data, the Costs tab offers to restore the backup. You can also export the backup as text and import it later or on another Homey, with a preview before you merge or replace. The token is never part of a backup.

**Status card and meter monitoring**
A new Status card in the app overview shows when prices were last fetched, the next planned fetch, how many quarter-hours you have for today and tomorrow, the last error, and when each reported meter reading last arrived.
If meter readings that you report from a Flow stop arriving, the app now warns you:
- threshold in hours, default 1 h, 0 = off (App settings, section "Monitoring")
- a new device value "Meter readings missing", two new triggers (stopped arriving / arriving again) and a condition
- optionally one timeline message per incident
- you choose which meters (and optionally which consumers) are watched. Only meters you have reported at least once are watched, so if you do not report any, you never get a warning.

**New values on the device**
In the device settings, under "Displayed values", you can switch on: cost today, cost with your old tariff, savings today and this month, average import price, and the feed-in price. They are the same numbers as in the Costs tab, available for the tile and for Flows.

**"The day has been summarised" trigger**
Fires shortly after midnight with yesterday's numbers as tokens: import/export kWh, cost with the dynamic and the old tariff, savings, average import price, battery benefit, battery efficiency and the value of grid charging. Handy for a daily message. The settings page has buttons to fire this trigger (and the meter-readings warning) right away, so you can build and test your Flows.

**Battery efficiency**
The battery analysis now compares your real day with the best possible plan (perfect foresight, inside your charge range) and shows the share you reached, per day and overall, plus the value of grid charging. It is an estimate and only shown, never used to control anything. The numbers are also available as device values and as tokens of the daily trigger.

**French and Italian**
The app, its Flow cards and the settings page are now also available in French and Italian.

The first post and the settings guide in this thread are updated for 0.2.3.
