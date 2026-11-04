import { ChannelType, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { getAllTempVoiceChannels, getAllTempVoiceCreators } from 'database/tempVoice';

import { logger } from 'utility/logger';
import { createTempChannel, forgetTempChannel, settleTempChannel } from 'utility/tempVoice/channel';

/** On start: catches up on whatever happened to temporary voice channels while the bot was away. */
export default new Event({
  name: Events.ClientReady,
  once: true,
  async execute(_client, client) {
    for (const { channelId, guildId } of await getAllTempVoiceChannels()) {
      const guild = client.guilds.cache.get(guildId);
      // Servers the bot was removed from are cleaned up with the rest of their data
      if (!guild) continue;
      const channel = guild.channels.cache.get(channelId);
      // Deleted by hand while the bot was away
      if (channel?.type !== ChannelType.GuildVoice) await forgetTempChannel(channelId);
      // Deletes it if it emptied, starts the clock if its owner left, and brings its panel up to date
      else await settleTempChannel(channel).catch((error: unknown) => logger.error(error, 'Failed to settle a temporary voice channel'));
    }

    // Anyone already waiting in a join channel gets their channel
    for (const creator of await getAllTempVoiceCreators()) {
      const channel = client.guilds.cache.get(creator.guildId)?.channels.cache.get(creator.channelId);
      if (channel?.type !== ChannelType.GuildVoice) continue;
      for (const member of channel.members.filter((member) => !member.user.bot).values()) {
        await createTempChannel(member, creator).catch((error: unknown) => logger.error(error, 'Failed to create a temporary voice channel'));
      }
    }
  },
});
