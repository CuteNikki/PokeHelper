import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { whoDid } from 'utility/logs/audit';
import { avatarOf, reasonPart, userSubject } from 'utility/logs/format';
import { sendLog, shouldLog } from 'utility/logs/send';

/** Someone unbanned, by whom and why. */
export default new Event({
  name: Events.GuildBanRemove,
  once: false,
  async execute(_client, ban) {
    if (!(await shouldLog(ban.guild, 'memberUnbanned'))) return;
    const doer = await whoDid(ban.guild.id, AuditLogEvent.MemberBanRemove, ban.user.id);
    await sendLog(ban.guild, 'memberUnbanned', (t) => ({
      kind: 'created',
      label: t('logs.labels.unbanned'),
      about: 'user',
      subject: userSubject(ban.user),
      thumbnail: avatarOf(ban.user),
      by: doer,
      details: [reasonPart(doer, t)],
      ids: { user: ban.user.id },
    }));
  },
});
