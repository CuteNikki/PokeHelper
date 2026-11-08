import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { endRunningBans } from 'database/moderation';

import { logger } from 'utility/logger';

/**
 * Someone unbanned ends the ban cases still running for them, so a temporary one isn't lifted later, when it may be a new ban for good
 * by then. When the bot can view the audit log, the unban's case does that, which then shows it ended the ban. Without, this does.
 */
export default new Event({
  name: Events.GuildBanRemove,
  once: false,
  async execute(_client, ban) {
    if (ban.guild.members.me?.permissions.has('ViewAuditLog')) return;
    await endRunningBans(ban.guild.id, ban.user.id).catch((error: unknown) =>
      logger.error(error, `Failed to end the ban cases of ${ban.user.id} in ${ban.guild.id}`),
    );
  },
});
