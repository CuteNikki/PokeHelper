import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { formatNumber } from 'utility/duration';
import { when, avatarOf, userSubject } from 'utility/logs/format';
import { sendLog } from 'utility/logs/send';

/** Someone joined, with how old their account is, as new accounts can be worth a look. */
export default new Event({
  name: Events.GuildMemberAdd,
  once: false,
  async execute(_client, member) {
    await sendLog(member.guild, 'memberJoined', (t) => ({
      kind: 'created',
      label: t('logs.labels.memberJoined'),
      about: 'user',
      subject: userSubject(member.user),
      thumbnail: avatarOf(member),
      details: [
        `**${t('logs.accountCreated')}** ${when(member.user.createdTimestamp)}\n**${t('logs.memberCount')}** ${formatNumber(member.guild.memberCount, t)}`,
      ],
      ids: { user: member.id },
    }));
  },
});
