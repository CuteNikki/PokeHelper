import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { whoDid } from 'utility/logs/audit';
import { avatarOf, reasonPart, userSubject } from 'utility/logs/format';
import { sendLog, shouldLog } from 'utility/logs/send';
import { casePart, findLoggedCase } from 'utility/moderation/logs';

/** Someone banned, by whom and why, with the case it made. */
export default new Event({
  name: Events.GuildBanAdd,
  once: false,
  async execute(_client, ban) {
    if (!(await shouldLog(ban.guild, 'memberBanned'))) return;
    const [doer, number] = await Promise.all([whoDid(ban.guild.id, AuditLogEvent.MemberBanAdd, ban.user.id), findLoggedCase(ban.guild.id, ban.user.id, 'ban')]);
    await sendLog(ban.guild, 'memberBanned', (t) => ({
      kind: 'deleted',
      label: t('logs.labels.banned'),
      about: 'user',
      subject: userSubject(ban.user),
      thumbnail: avatarOf(ban.user),
      by: doer,
      details: [casePart(number, t), reasonPart(doer, t)],
      ids: { user: ban.user.id },
    }));
  },
});
