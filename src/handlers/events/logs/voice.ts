import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { avatarOf, channelRef, userSubject } from 'utility/logs/format';
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
      kind: event === 'voiceJoined' ? 'created' : event === 'voiceLeft' ? 'deleted' : 'updated',
      label: t(`logs.labels.${event}`),
      where: event === 'voiceMoved' ? null : channelRef(guild, (after.channelId ?? before.channelId)!),
      subject: userSubject(member.user),
      thumbnail: avatarOf(member),
      details: [
        event === 'voiceMoved' ? `${t('logs.from')}: ${channelRef(guild, before.channelId!)}\n${t('logs.to')}: ${channelRef(guild, after.channelId!)}` : null,
      ],
      ids: { user: member.id, channel: (after.channelId ?? before.channelId)! },
    }));
  },
});
