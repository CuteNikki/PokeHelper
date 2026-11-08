import { bold, type Client, type Guild, hyperlink, messageLink, userMention } from 'discord.js';

import { finishGiveaway, getAllEntries, getDueGiveaways, getXpOf, type Giveaway } from 'database/giveaways';
import { getLevelFromXP } from 'database/leveling';

import { type Candidate, drawWinners } from 'utility/giveaways/draw';
import { bonusRolesOf, checkRules, countEntries, rulesOf } from 'utility/giveaways/rules';
import { syncPost } from 'utility/giveaways/sync';
import { getTranslate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { createResponse } from 'utility/response';
import { canGiveRole } from 'utility/roles';

/** How many members are fetched from Discord at once, the most it sends back for one request. */
const FETCH_CHUNK = 100;

/**
 * Who can win a giveaway: everyone who entered, is still on the server and still meets the rules, with their entries worked out again
 * from the roles they have now, in case a change was missed while the bot was offline.
 * @param exclude Who can't win again, like the winners before a reroll.
 */
export async function findCandidates(guild: Guild, giveaway: Giveaway, exclude: ReadonlySet<string> = new Set()): Promise<Candidate[]> {
  const entries = (await getAllEntries(giveaway.id)).filter((entry) => !exclude.has(entry.userId));
  const rules = rulesOf(giveaway, (roleId) => guild.roles.cache.has(roleId));
  const bonusRoles = bonusRolesOf(giveaway);
  const xp = rules.minLevel
    ? await getXpOf(
        guild.id,
        entries.map((entry) => entry.userId),
      )
    : new Map<string, number>();
  const now = new Date();

  const candidates: Candidate[] = [];
  for (let start = 0; start < entries.length; start += FETCH_CHUNK) {
    const chunk = entries.slice(start, start + FETCH_CHUNK);
    // Members who left aren't sent back
    const members = await guild.members.fetch({ user: chunk.map((entry) => entry.userId) });
    for (const entry of chunk) {
      const member = members.get(entry.userId);
      if (!member) continue;
      const roleIds = [...member.roles.cache.keys()];
      const participant = {
        bot: member.user.bot,
        roleIds,
        joinedAt: member.joinedAt,
        createdAt: member.user.createdAt,
        level: getLevelFromXP(xp.get(member.id) ?? 0),
      };
      if (checkRules(rules, participant, now).length > 0) continue;
      candidates.push({ userId: member.id, entries: countEntries(roleIds, bonusRoles) });
    }
  }
  return candidates;
}

/** Say who won under the giveaway's post, pinging them, or in its channel if the post is gone. */
export async function announceWinners(guild: Guild, giveaway: Giveaway, winnerIds: string[], key: 'giveaway.end.announce' | 'giveaway.end.reroll') {
  const channel = guild.channels.cache.get(giveaway.channelId);
  if (!channel?.isTextBased()) return;
  const t = getTranslate(giveaway.locale);
  const text =
    winnerIds.length > 0
      ? t(key, { winners: winnerIds.map(userMention).join(', '), prize: giveaway.prize, count: winnerIds.length })
      : t('giveaway.end.none', { prize: giveaway.prize });
  try {
    await channel.send({
      ...createResponse(text, winnerIds.length > 0 ? 'success' : 'info'),
      // Only the winners are pinged, not roles or everyone the prize might mention
      allowedMentions: { users: winnerIds },
      reply: giveaway.messageId ? { messageReference: giveaway.messageId, failIfNotExists: false } : undefined,
    });
  } catch (error) {
    logger.warn(error, `Failed to announce the winners of giveaway ${giveaway.id} in guild ${guild.id}`);
  }
}

/** Tell winners in a DM that they won, with a link to the giveaway. Winners with closed DMs still see it under the post. */
export async function dmWinners(guild: Guild, giveaway: Giveaway, winnerIds: string[]) {
  if (!giveaway.dmWinners) return;
  const t = getTranslate(giveaway.locale);
  const link = giveaway.messageId ? messageLink(giveaway.channelId, giveaway.messageId, guild.id) : null;
  const text = [
    t('giveaway.end.dm', { prize: giveaway.prize, server: bold(guild.name), host: giveaway.host ?? userMention(giveaway.hostId) }),
    ...(link ? [hyperlink(t('giveaway.end.dmLink'), link)] : []),
  ].join('\n');
  for (const userId of winnerIds) {
    await guild.client.users.send(userId, { ...createResponse(text, 'success'), allowedMentions: { parse: [] } }).catch(() => null);
  }
}

/**
 * Give winners the giveaway's winner role, if it has one the bot can give. It stays with them, like a reward role.
 * A winner who left meanwhile is skipped.
 */
export async function giveWinnerRole(guild: Guild, giveaway: Giveaway, winnerIds: string[]) {
  const roleId = giveaway.winnerRoleId;
  if (!roleId || !canGiveRole(guild, roleId)) return;
  const t = getTranslate(giveaway.locale);
  for (const userId of winnerIds) {
    await guild.members
      .addRole({ user: userId, role: roleId, reason: t('giveaway.end.roleReason', { prize: giveaway.prize }) })
      .catch((error: unknown) => logger.warn(error, `Failed to give the winner role of giveaway ${giveaway.id} to ${userId}`));
  }
}

/** End a giveaway: draw its winners, show them on the post, say who won, give them the winner role and tell them. */
export async function endGiveaway(guild: Guild, giveaway: Giveaway) {
  const winnerIds = drawWinners(await findCandidates(guild, giveaway), giveaway.winnerCount);
  // Someone may have ended it meanwhile, who then drew the winners already
  if (!(await finishGiveaway(giveaway.id, winnerIds, null))) return;
  const ended: Giveaway = { ...giveaway, status: 'ended', endedAt: new Date() };
  await syncPost(guild, giveaway.id);
  await announceWinners(guild, ended, winnerIds, 'giveaway.end.announce');
  await giveWinnerRole(guild, ended, winnerIds);
  await dmWinners(guild, ended, winnerIds);
}

/** Giveaways that couldn't be ended, so the logs say so once and not on every run. */
const warned = new Set<string>();

/**
 * End the giveaways whose time is up. Runs regularly, so ones that ended while the bot was offline are drawn once it's back.
 * Giveaways in servers the bot isn't in right now wait for it to come back.
 */
export async function runGiveawayJob(client: Client) {
  for (const giveaway of await getDueGiveaways()) {
    const guild = client.guilds.cache.get(giveaway.guildId);
    if (!guild) continue;
    try {
      await endGiveaway(guild, giveaway);
      warned.delete(giveaway.id);
    } catch (error) {
      // Like when Discord didn't send the members in time. Tried again on the next run
      if (!warned.has(giveaway.id)) {
        warned.add(giveaway.id);
        logger.warn(error, `Failed to end giveaway ${giveaway.id} in guild ${guild.id}`);
      }
    }
  }
}
