import { ChannelType, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { findTempVoiceChannelIds } from 'database/tempVoice';

import { logger } from 'utility/logger';
import { createTempChannel, findCreator, settleTempChannel } from 'utility/tempVoice/channel';

/** Someone joining, leaving or moving between voice channels: makes, settles or updates temporary channels. */
export default new Event({
  name: Events.VoiceStateUpdate,
  once: false,
  async execute(_client, oldState, newState) {
    if (oldState.channelId === newState.channelId) return;
    const ids = [oldState.channelId, newState.channelId].filter((id): id is string => id !== null);
    const temporary = await findTempVoiceChannelIds(ids);

    // Left, or moved out of, a temporary channel: it may be empty now, or its owner gone
    const left = oldState.channel;
    if (left?.type === ChannelType.GuildVoice && temporary.has(left.id)) {
      await settleTempChannel(left).catch((error: unknown) => logger.error(error, 'Failed to settle a temporary voice channel'));
    }

    const joined = newState.channel;
    const member = newState.member;
    if (!joined || !member || member.user.bot) return;
    // Joined a temporary channel: its owner may be back, and the panel shows who's here
    if (joined.type === ChannelType.GuildVoice && temporary.has(joined.id)) {
      await settleTempChannel(joined).catch((error: unknown) => logger.error(error, 'Failed to settle a temporary voice channel'));
      return;
    }
    const creator = await findCreator(joined.id);
    if (creator) await createTempChannel(member, creator).catch((error: unknown) => logger.error(error, 'Failed to create a temporary voice channel'));
  },
});
