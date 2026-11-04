import { Events } from 'discord.js';
import { t } from 'i18next';

import { Event } from 'classes/base/event';

import { logger } from 'utility/logger';

export default new Event({
  name: Events.ClientReady,
  once: true,
  execute: (_, client) => {
    logger.info(t('system.ready.message', { user: client.user.tag, id: client.user.id }));
  },
});
