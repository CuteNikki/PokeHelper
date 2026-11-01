import { Events } from 'discord.js';
import { t } from 'i18next';

import { Event } from 'classes/base/event';

import { logger } from 'utility/logger';

export default new Event({
  name: Events.Warn,
  once: false,
  execute(_, message) {
    logger.warn(t('system.client.warn', { message }));
  },
});
