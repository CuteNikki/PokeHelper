import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { whoDid } from 'utility/logs/audit';
import { avatarOf, reasonPart, userSubject } from 'utility/logs/format';
import { sendLog } from 'utility/logs/send';

/** Someone banned, by whom and why. */
export default new Event({
  name: Events.GuildBanAdd,
  once: false,
  async execute(_client, ban) {
    const doer = await whoDid(ban.guild.id, AuditLogEvent.MemberBanAdd, ban.user.id);
    await sendLog(ban.guild, 'memberBanned', (t) => ({
      kind: 'deleted',
      label: t('logs.labels.banned'),
      about: 'user',
      subject: userSubject(ban.user),
      thumbnail: avatarOf(ban.user),
      by: doer,
      details: [reasonPart(doer, t)],
      ids: { user: ban.user.id },
    }));
  },
});
