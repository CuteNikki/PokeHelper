import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { whoDid } from 'utility/logs/audit';
import { byLine, reasonPart, who } from 'utility/logs/format';
import { sendLog } from 'utility/logs/send';

/** Someone banned, by whom and why. */
export default new Event({
  name: Events.GuildBanAdd,
  once: false,
  async execute(_client, ban) {
    const doer = await whoDid(ban.guild.id, AuditLogEvent.MemberBanAdd, ban.user.id);
    await sendLog(ban.guild, 'memberBanned', (t) => ({
      kind: 'deleted',
      title: t('logs.memberBanned.title'),
      about: who(ban.user) + byLine(doer, t),
      details: [reasonPart(doer, t)],
      ids: t('logs.ids.user', { user: ban.user.id }),
    }));
  },
});
