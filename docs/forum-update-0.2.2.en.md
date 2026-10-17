<!--
Draft for a new post in the community thread. Not posted yet.
-->

# Update 0.2.2: hourly prices exactly as your EMS expects them

A small update for everyone who feeds an energy management system (EMS) with the hourly prices.

The cards **"Get today's hourly prices"** and **"Get tomorrow's hourly prices"** return a JSON list of 24 values. Until now it was always Rp./kWh including VAT. Many EMS apps expect CHF/kWh, so you needed a HomeyScript in between that divided by 100.

You can now set the format in the app settings, section **"Hourly prices for an EMS"**:
- **Unit:** Rp./kWh or CHF/kWh
- **VAT:** including or excluding
- **Decimals:** 0 to 6, or empty for automatic (2 for Rp., 4 for CHF)

A preview underneath shows what the list will look like, for example `[0.198, 0.189, 0.184, ...]` for CHF/kWh incl. VAT with 3 decimals.

**Nothing changes if you do not touch it.** The default is still Rp./kWh incl. VAT.

If you already convert the list with a script, change the setting and remove the script step in the same moment, otherwise the values are divided twice.

The settings guide in this thread is updated for 0.2.2.
