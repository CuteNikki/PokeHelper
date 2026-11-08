import { AuditLogEvent, type Client, DiscordAPIError, type Guild, RESTJSONErrorCodes } from 'discord.js';

import { endCase, getExpiredBans, reopenCase } from 'database/moderation';

import { getTranslate } from 'utility/i18next';
import { logger } from 'utility/logger';
import type { ModCase } from 'generated/prisma/client';
import { caseNumber, oneAtATime } from 'utility/moderation/run';

/** How many of a server's newest bans in the audit log are looked through for a newer one. */
const AUDIT_LIMIT = 100;

/**
 * Whether someone was banned again after a temporary ban, outside the bot, like through Discord while the bot was offline, which it didn't
 * see. Then the ban on them is that one, which mustn't be lifted. Without the right to view the audit log, that can't be known.
 */
export async function bannedAgain(guild: Guild, modCase: ModCase): Promise<boolean> {
  if (!guild.members.me?.permissions.has('ViewAuditLog')) return false;
  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: AUDIT_LIMIT }).catch(() => null);
  const latest = logs?.entries.find((entry) => entry.targetId === modCase.userId);
  return !!latest && latest.executorId !== guild.client.user.id && latest.createdTimestamp > modCase.createdAt.getTime();
}

/** Temporary bans that couldn't be lifted, so the logs say so once and not on every run. */
const warned = new Set<string>();

/**
 * Lift the temporary bans that ran out. Runs regularly, so bans that ran out while the bot was offline are lifted once it's back.
 * Bans in servers the bot isn't in right now wait for it to come back, and ones lifted meanwhile only end.
 */
export async function runTempBanJob(client: Client) {
  // Only those of servers the bot is in, so the ones of servers it left aren't looked at on every run
  for (const modCase of await getExpiredBans(new Date(), [...client.guilds.cache.keys()])) {
    const guild = client.guilds.cache.get(modCase.guildId);
    // Like the moderators' actions on them, so one like /unban at the same moment can't run alongside
    if (guild) await oneAtATime(guild.id, modCase.userId, () => liftTempBan(guild, modCase));
  }
}

/** Lift a temporary ban that ran out, unless it ended meanwhile or they were banned again since. */
async function liftTempBan(guild: Guild, modCase: ModCase) {
  // Ended before it's lifted, so a new ban made meanwhile, which ends this one, is never lifted in its place
  const endedAt = new Date();
  if (!(await endCase(modCase.id, endedAt))) return;
  // Banned again since, so this one only ends
  if (await bannedAgain(guild, modCase)) return;
  try {
    const t = getTranslate(guild.preferredLocale);
    await guild.members.unban(modCase.userId, t('moderation.tempBanEnded', { number: caseNumber(modCase, t) }));
    warned.delete(modCase.id);
  } catch (error) {
    // Lifted meanwhile, or their account was deleted, so there's nothing to lift and it stays ended
    if (error instanceof DiscordAPIError && (error.code === RESTJSONErrorCodes.UnknownBan || error.code === RESTJSONErrorCodes.UnknownUser)) return;
    await reopenCase(modCase.id, endedAt);
    if (!warned.has(modCase.id)) {
      // Like when the bot can't ban anymore. Tried again on every run, so it's lifted once it can
      warned.add(modCase.id);
      logger.warn(error, `Failed to lift the temporary ban of ${modCase.userId} in ${modCase.guildId}`);
    }
  }
}
