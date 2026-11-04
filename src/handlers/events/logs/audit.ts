import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { rememberAuditEntry } from 'utility/logs/audit';
import { byLine, reasonPart, who } from 'utility/logs/format';
import { sendLog } from 'utility/logs/send';

/**
 * Discord's audit log, which says who did what. Every entry is kept for a moment, so the other logs can say who made a change.
 * Kicks are only in the audit log, as being kicked looks like leaving otherwise, so they're logged from here.
 */
export default new Event({
  name: Events.GuildAuditLogEntryCreate,
  once: false,
  async execute(client, entry, guild) {
    rememberAuditEntry(guild.id, entry);
    const targetId = entry.targetId;
    if (entry.action !== AuditLogEvent.MemberKick || !targetId) return;

    const target = await client.users.fetch(targetId).catch(() => null);
    const doer = entry.executorId ? { id: entry.executorId, reason: entry.reason } : null;
    await sendLog(guild, 'memberKicked', (t) => ({
      kind: 'deleted',
      title: t('logs.memberKicked.title'),
      about: who(target, targetId) + byLine(doer, t),
      details: [reasonPart(doer, t)],
      ids: t('logs.ids.user', { user: targetId }),
    }));
  },
});
