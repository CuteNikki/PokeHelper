import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { deleteTempVoiceCreatorByChannel } from 'database/tempVoice';

import { logger } from 'utility/logger';
import { forgetTempChannel } from 'utility/tempVoice/channel';

/** A temporary channel or a join channel deleted, by hand or by the bot: nothing left to remember. */
export default new Event({
  name: Events.ChannelDelete,
  once: false,
  async execute(_client, channel) {
    if (channel.isDMBased()) return;
    await Promise.all([forgetTempChannel(channel.id), deleteTempVoiceCreatorByChannel(channel.id)]).catch((error: unknown) =>
      logger.error(error, `Failed to forget the deleted channel ${channel.id}`),
    );
  },
});
