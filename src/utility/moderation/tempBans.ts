import { type Client, DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';

import { endCase, getExpiredBans, reopenCase } from 'database/moderation';

import { getTranslate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { caseNumber } from 'utility/moderation/run';

/** Temporary bans that couldn't be lifted, so the logs say so once and not on every run. */
const warned = new Set<string>();

/**
 * Lift the temporary bans that ran out. Runs regularly, so bans that ran out while the bot was offline are lifted once it's back.
 * Bans in servers the bot isn't in right now wait for it to come back, and ones lifted meanwhile only end.
 */
export async function runTempBanJob(client: Client) {
  for (const modCase of await getExpiredBans(new Date())) {
    const guild = client.guilds.cache.get(modCase.guildId);
    if (!guild) continue;
    // Ended before it's lifted, so a new ban made meanwhile, which ends this one, is never lifted in its place
    const endedAt = new Date();
    if (!(await endCase(modCase.id, endedAt))) continue;
    try {
      const t = getTranslate(guild.preferredLocale);
      await guild.members.unban(modCase.userId, t('moderation.tempBanEnded', { number: caseNumber(modCase, t) }));
      warned.delete(modCase.id);
    } catch (error) {
      // Lifted meanwhile, so it stays ended
      if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownBan) continue;
      await reopenCase(modCase.id, endedAt);
      if (!warned.has(modCase.id)) {
        // Like when the bot can't ban anymore. Tried again on every run, so it's lifted once it can
        warned.add(modCase.id);
        logger.warn(error, `Failed to lift the temporary ban of ${modCase.userId} in ${modCase.guildId}`);
      }
    }
  }
}
