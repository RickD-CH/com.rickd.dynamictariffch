'use strict';

const Homey = require('homey');
const { InnostromClient, InnostromError, TEST_CREDENTIALS } = require('../../lib/InnostromClient');

class InnostromDriver extends Homey.Driver {

  async onPair(session) {
    let credentials = null;

    // Built-in login_credentials template (username/password) instead of a custom pair
    // view - see drivers/innostrom/driver.compose.json. Proven pattern, mirrors
    // com.rickd.huum's drivers/uku/driver.js.
    session.setHandler('login', async ({ username, password }) => {
      const meteringCode = String(username || '').trim();
      const token = String(password || '').trim();
      // The public test metering code is a fixed, known constant, so pairing with it
      // auto-detects the test environment - no separate environment picker needed.
      const environment = meteringCode === TEST_CREDENTIALS.meteringCode ? 'test' : 'production';

      const client = new InnostromClient({ meteringCode, token, environment });
      try {
        await client.testConnection();
      } catch (err) {
        if (err instanceof InnostromError && err.code === 'AUTH') return false;
        throw err;
      }

      credentials = { meteringCode, token, environment };
      return true;
    });

    session.setHandler('list_devices', async () => {
      if (!credentials) throw new Error('Not logged in');
      const { meteringCode, token, environment } = credentials;
      return [{
        name: `Innostrom ${meteringCode.slice(-8)}`,
        data: { id: meteringCode },
        settings: {
          metering_code: meteringCode,
          token,
          environment,
        },
      }];
    });
  }

  async onRepair(session, device) {
    session.setHandler('login', async ({ username, password }) => {
      const meteringCode = String(username || '').trim();
      const token = String(password || '').trim();

      // data.id (the metering point) is immutable once paired - a mismatch here means the
      // user is trying to repoint this device at a different metering point, which needs a
      // fresh pairing (a new device) instead, since Flow cards etc. already reference this
      // device's id.
      if (meteringCode !== device.getData().id) {
        throw new Error(this.homey.__('repair.meteringCodeMismatch'));
      }

      const environment = meteringCode === TEST_CREDENTIALS.meteringCode ? 'test' : device.getSetting('environment');
      const client = new InnostromClient({ meteringCode, token, environment });
      try {
        await client.testConnection();
      } catch (err) {
        if (err instanceof InnostromError && err.code === 'AUTH') return false;
        throw err;
      }

      // setSettings() does not trigger the device's onSettings() (see Homey SDK docs), so
      // the device has to be told explicitly to pick up the new token - mirrors
      // com.rickd.huum's onCredentialsUpdated() convention.
      await device.setSettings({ token, environment });
      await device.onCredentialsUpdated();

      return true;
    });
  }

}

module.exports = InnostromDriver;
