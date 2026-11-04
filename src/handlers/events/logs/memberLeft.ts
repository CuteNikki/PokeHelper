import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { ago, avatarOf, roleSubject, userSubject } from 'utility/logs/format';
import { sendLog } from 'utility/logs/send';

/** Someone left, or was kicked or banned, which the moderation logs say too, with how long they were here and their roles. */
export default new Event({
  name: Events.GuildMemberRemove,
  once: false,
  async execute(_client, member) {
    const roles = member.partial ? [] : member.roles.cache.filter((role) => role.id !== member.guild.id).map((role) => roleSubject(role.id, role.name));
    await sendLog(member.guild, 'memberLeft', (t) => ({
      kind: 'deleted',
      label: t('logs.labels.memberLeft'),
      subject: userSubject(member.user),
      thumbnail: avatarOf(member.user),
      details: [
        member.joinedTimestamp ? `**${t('logs.joined')}** ${ago(member.joinedTimestamp)}` : null,
        // A block like the other lists: a bold heading, then a role on each line
        roles.length > 0 ? `**${t('logs.roles')}**\n${roles.join('\n')}` : null,
      ],
      ids: { user: member.id },
    }));
  },
});
