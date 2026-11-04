import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { whoDid } from 'utility/logs/audit';
import { byLine, reasonPart, who } from 'utility/logs/format';
import { sendLog } from 'utility/logs/send';

/** Someone unbanned, by whom and why. */
export default new Event({
  name: Events.GuildBanRemove,
  once: false,
  async execute(_client, ban) {
    const doer = await whoDid(ban.guild.id, AuditLogEvent.MemberBanRemove, ban.user.id);
    await sendLog(ban.guild, 'memberUnbanned', (t) => ({
      kind: 'created',
      title: t('logs.memberUnbanned.title'),
      about: who(ban.user) + byLine(doer, t),
      details: [reasonPart(doer, t)],
      ids: t('logs.ids.user', { user: ban.user.id }),
    }));
  },
});
