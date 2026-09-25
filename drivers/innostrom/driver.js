'use strict';

const Homey = require('homey');
const { InnostromClient, InnostromError } = require('../../lib/InnostromClient');

class InnostromDriver extends Homey.Driver {

  async onPair(session) {
    let credentials = null;

    session.setHandler('login', async (data) => {
      const meteringCode = String(data.meteringCode || '').trim();
      const token = String(data.token || '').trim();
      const environment = data.environment === 'test' ? 'test' : 'production';

      if (!meteringCode || !token) throw new Error(this.homey.__('pair.errorGeneric') + this.homey.__('pair.meteringCode'));

      const client = new InnostromClient({ meteringCode, token, environment });
      try {
        await client.testConnection();
      } catch (err) {
        if (err instanceof InnostromError && err.code === 'AUTH') {
          throw new Error(this.homey.__('pair.errorAuth'));
        }
        throw new Error(this.homey.__('pair.errorGeneric') + (err && err.message ? err.message : err));
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

}

module.exports = InnostromDriver;
