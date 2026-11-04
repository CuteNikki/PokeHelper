import { channelMention, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { who } from 'utility/logs/format';
import { isIgnoredChannel, isIgnoredMember, sendLog, shouldLog } from 'utility/logs/send';

/** Someone joining, leaving or moving between voice channels. Muting and the like isn't logged, only where they are. */
export default new Event({
  name: Events.VoiceStateUpdate,
  once: false,
  async execute(_client, before, after) {
    const member = after.member ?? before.member;
    if (before.channelId === after.channelId || !member || member.user.bot) return;
    const { guild } = after;
    const event = !before.channelId ? 'voiceJoined' : !after.channelId ? 'voiceLeft' : 'voiceMoved';

    const config = await shouldLog(guild, event);
    if (!config || isIgnoredMember(config, member)) return;
    // Moving between an ignored channel and one that isn't is still logged, for the one that isn't
    if ([before.channelId, after.channelId].every((id) => !id || isIgnoredChannel(config, guild, id))) return;

    await sendLog(guild, event, (t) => ({
      kind: event === 'voiceJoined' ? 'created' : event === 'voiceLeft' ? 'deleted' : 'info',
      title: t(`logs.${event}.title`),
      about:
        event === 'voiceMoved'
          ? t('logs.voiceMoved.about', { user: who(member.user), from: channelMention(before.channelId!), to: channelMention(after.channelId!) })
          : t('logs.inChannel', { user: who(member.user), channel: channelMention((after.channelId ?? before.channelId)!) }),
      ids: t('logs.ids.user', { user: member.id }),
    }));
  },
});
