import { Events, roleMention } from 'discord.js';

import { Event } from 'classes/base/event';

import { ago, who } from 'utility/logs/format';
import { sendLog } from 'utility/logs/send';

/** Someone left, or was kicked or banned, which the moderation logs say too, with how long they were here and their roles. */
export default new Event({
  name: Events.GuildMemberRemove,
  once: false,
  async execute(_client, member) {
    const roles = member.partial ? [] : member.roles.cache.filter((role) => role.id !== member.guild.id).map((role) => roleMention(role.id));
    await sendLog(member.guild, 'memberLeft', (t) => ({
      kind: 'deleted',
      title: t('logs.memberLeft.title'),
      about: who(member.user),
      details: [
        member.joinedTimestamp ? `**${t('logs.memberLeft.joined')}** ${ago(member.joinedTimestamp)}` : null,
        roles.length > 0 ? `**${t('logs.memberLeft.roles')}** ${roles.join(', ')}` : null,
      ],
      ids: t('logs.ids.user', { user: member.id }),
    }));
  },
});
