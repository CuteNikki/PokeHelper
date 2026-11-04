import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { ago, avatarOf, userSubject } from 'utility/logs/format';
import { sendLog } from 'utility/logs/send';

/** Someone joined, with how old their account is, as new accounts can be worth a look. */
export default new Event({
  name: Events.GuildMemberAdd,
  once: false,
  async execute(_client, member) {
    await sendLog(member.guild, 'memberJoined', (t) => ({
      kind: 'created',
      label: t('logs.labels.memberJoined'),
      subject: userSubject(member.user),
      thumbnail: avatarOf(member),
      details: [
        `**${t('logs.accountCreated')}** ${ago(member.user.createdTimestamp)}\n**${t('logs.memberCount')}** ${member.guild.memberCount.toLocaleString(t('locale'))}`,
      ],
      ids: { user: member.id },
    }));
  },
});
