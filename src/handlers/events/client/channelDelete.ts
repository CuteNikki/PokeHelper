import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { forgetDeletedChannel } from 'database/channels';

import { logger } from 'utility/logger';
import { forgetLogConfig } from 'utility/logs/send';

/** A deleted channel is taken out of the settings that point at it, like where level-ups or logs go. */
export default new Event({
  name: Events.ChannelDelete,
  once: false,
  async execute(_client, channel) {
    if (channel.isDMBased()) return;
    try {
      await forgetDeletedChannel(channel.guildId, channel.id);
      forgetLogConfig(channel.guildId);
    } catch (error) {
      logger.error(error, `Failed to forget the deleted channel ${channel.id} in the settings of guild ${channel.guildId}`);
    }
  },
});
