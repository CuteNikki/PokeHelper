import { Events, roleMention } from 'discord.js';

import { Event } from 'classes/base/event';

import { ago, avatarOf, userSubject } from 'utility/logs/format';
import { sendLog } from 'utility/logs/send';

/** Someone left, or was kicked or banned, which the moderation logs say too, with how long they were here and their roles. */
export default new Event({
  name: Events.GuildMemberRemove,
  once: false,
  async execute(_client, member) {
    const roles = member.partial ? [] : member.roles.cache.filter((role) => role.id !== member.guild.id).map((role) => roleMention(role.id));
    await sendLog(member.guild, 'memberLeft', (t) => ({
      kind: 'deleted',
      label: t('logs.labels.memberLeft'),
      subject: userSubject(member.user),
      thumbnail: avatarOf(member.user),
      details: [
        [
          member.joinedTimestamp ? `**${t('logs.joined')}** ${ago(member.joinedTimestamp)}` : null,
          roles.length > 0 ? `**${t('logs.roles')}** ${roles.join(' ')}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      ],
      ids: { user: member.id },
    }));
  },
});
