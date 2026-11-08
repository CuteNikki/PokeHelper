import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { forgetDeletedGiveawayChannel } from 'database/giveaways';

import { logger } from 'utility/logger';

/**
 * Giveaways in a deleted channel lost their post with it. They go on without one, and still end and draw, and winners still get their DM.
 * Drafts for the channel say it's gone, so another one can be picked.
 */
export default new Event({
  name: Events.ChannelDelete,
  once: false,
  async execute(_client, channel) {
    if (channel.isDMBased()) return;
    try {
      await forgetDeletedGiveawayChannel(channel.guildId, channel.id);
    } catch (error) {
      logger.error(error, `Failed to forget the giveaway posts in the deleted channel ${channel.id} of guild ${channel.guildId}`);
    }
  },
});
