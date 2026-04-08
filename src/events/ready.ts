import { Events } from 'discord.js';
import { t } from 'i18next';

import { Event } from 'classes/base/event';

export default new Event({
  name: Events.ClientReady,
  once: true,
  execute: (_, client) => {
    console.log(t('system.ready.message', { user: client.user.tag, id: client.user.id }));
  },
});
