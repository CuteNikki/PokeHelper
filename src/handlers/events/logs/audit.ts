import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { rememberAuditEntry } from 'utility/logs/audit';
import { avatarOf, reasonPart, userSubject } from 'utility/logs/format';
import { sendLog, shouldLog } from 'utility/logs/send';
import { casePart, findLoggedCase } from 'utility/moderation/logs';

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
    if (entry.action !== AuditLogEvent.MemberKick || !targetId || !(await shouldLog(guild, 'memberKicked'))) return;

    const [target, number] = await Promise.all([client.users.fetch(targetId).catch(() => null), findLoggedCase(guild.id, targetId, 'kick')]);
    const doer = entry.executorId ? { id: entry.executorId, reason: entry.reason } : null;
    await sendLog(guild, 'memberKicked', (t) => ({
      kind: 'deleted',
      label: t('logs.labels.kicked'),
      about: 'user',
      subject: userSubject(target, targetId),
      thumbnail: avatarOf(target),
      by: doer,
      details: [casePart(number, t), reasonPart(doer, t)],
      ids: { user: targetId },
    }));
  },
});
