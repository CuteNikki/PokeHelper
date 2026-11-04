import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { ago, who } from 'utility/logs/format';
import { sendLog } from 'utility/logs/send';

/** Someone joined, with how old their account is, as new accounts can be worth a look. */
export default new Event({
  name: Events.GuildMemberAdd,
  once: false,
  async execute(_client, member) {
    await sendLog(member.guild, 'memberJoined', (t) => ({
      kind: 'created',
      title: t('logs.memberJoined.title'),
      about: who(member.user),
      details: [
        `**${t('logs.memberJoined.created')}** ${ago(member.user.createdTimestamp)}`,
        `**${t('logs.memberJoined.count')}** ${member.guild.memberCount.toLocaleString(t('locale'))}`,
      ],
      ids: t('logs.ids.user', { user: member.id }),
    }));
  },
});
