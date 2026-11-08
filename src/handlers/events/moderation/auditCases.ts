import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { createCase } from 'database/moderation';

import { fetchMember } from 'utility/discord';
import { logger } from 'utility/logger';

/** The change in an audit log entry that gives or takes away a timeout. */
const TIMEOUT_CHANGE = 'communication_disabled_until';

/** Moderation done through Discord itself, and timeouts by AutoMod, become cases too, so a case history is complete. The bot's own doing already has its case. */
export default new Event({
  name: Events.GuildAuditLogEntryCreate,
  once: false,
  async execute(client, entry, guild) {
    const userId = entry.targetId;
    if (!userId || entry.executorId === client.user?.id) return;
    const outside = { guildId: guild.id, userId, moderatorId: entry.executorId, reason: entry.reason };

    try {
      switch (entry.action) {
        case AuditLogEvent.MemberBanAdd:
          await createCase({ ...outside, type: 'ban' });
          break;
        case AuditLogEvent.MemberBanRemove:
          await createCase({ ...outside, type: 'unban' });
          break;
        case AuditLogEvent.MemberKick:
          await createCase({ ...outside, type: 'kick' });
          break;
        case AuditLogEvent.MemberUpdate: {
          const change = entry.changes.find((change) => change.key === TIMEOUT_CHANGE);
          if (!change) break;
          const until = typeof change.new === 'string' ? new Date(change.new) : null;
          // Taken away before it ran out, which ends the timeout's case
          if (!until || until.getTime() <= Date.now()) await createCase({ ...outside, type: 'untimeout' });
          else await createCase({ ...outside, type: 'timeout', expiresAt: until });
          break;
        }
        case AuditLogEvent.AutoModerationUserCommunicationDisabled: {
          // The entry doesn't say until when, so that's asked of Discord. Without it, the case only says it happened
          const member = await fetchMember(guild, userId);
          const until = member?.communicationDisabledUntil ?? null;
          const rule = entry.extra && 'autoModerationRuleName' in entry.extra ? entry.extra.autoModerationRuleName : null;
          await createCase({ ...outside, type: 'timeout', moderatorId: null, reason: rule ? `AutoMod: ${rule}` : 'AutoMod', expiresAt: until });
          break;
        }
      }
    } catch (error) {
      logger.error(error, `Failed to make a case from audit log entry ${entry.id} in ${guild.id}`);
    }
  },
});
