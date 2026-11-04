import { Events } from 'discord.js';
import { t } from 'i18next';

import { Event } from 'classes/base/event';

import { logger } from 'utility/logger';

export default new Event({
  name: Events.Error,
  once: false,
  execute(_, error) {
    logger.error(error, t('system.client.error'));
  },
});
