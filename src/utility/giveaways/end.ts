import {
  ActionRowBuilder,
  bold,
  ButtonBuilder,
  ButtonStyle,
  type Client,
  ContainerBuilder,
  type Guild,
  hyperlink,
  MessageFlags,
  messageLink,
  TextDisplayBuilder,
  time,
  TimestampStyles,
  userMention,
} from 'discord.js';

import {
  finishGiveaway,
  getAllEntries,
  getAllWinners,
  getDueGiveaways,
  getGiveaway,
  getMissedClaims,
  getXpOf,
  type Giveaway,
  replaceWinners,
} from 'database/giveaways';
import { getLevelFromXP } from 'database/leveling';

import { MINUTE } from 'utility/duration';
import { buttonIcon } from 'utility/emojis';
import { type Candidate, drawWinners } from 'utility/giveaways/draw';
import { GIVEAWAY_CUSTOM_ID } from 'utility/giveaways/post';
import { bonusRolesOf, checkRules, countEntries, rulesOf } from 'utility/giveaways/rules';
import { syncPost } from 'utility/giveaways/sync';
import { getTranslate, type Translate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { createResponse } from 'utility/response';
import { canGiveRole } from 'utility/roles';
import { ThemeColors } from 'utility/theme';

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

/** Until when new winners can claim their prize, or null when they don't have to. */
export const claimDeadline = (giveaway: Giveaway, now = new Date()) =>
  giveaway.claimMinutes ? new Date(now.getTime() + giveaway.claimMinutes * MINUTE) : null;

/** The line telling winners until when to claim their prize. */
const claimLine = (claimBy: Date, key: 'giveaway.claim.announce' | 'giveaway.claim.dm', t: Translate) =>
  t(key, { date: time(claimBy, TimestampStyles.LongDateShortTime), relative: time(claimBy, TimestampStyles.RelativeTime) });

/**
 * Say who won under the giveaway's post, pinging them, or in its channel if the post is gone.
 * When winners have to claim their prize, it says until when, with the button to claim it.
 */
async function announceWinners(guild: Guild, giveaway: Giveaway, winnerIds: string[], claimBy: Date | null, key: WinnersKey) {
  const channel = guild.channels.cache.get(giveaway.channelId);
  if (!channel?.isTextBased()) return;
  const t = getTranslate(giveaway.locale);
  const lines =
    winnerIds.length > 0
      ? [t(key, { winners: winnerIds.map(userMention).join(', '), prize: giveaway.prize, count: winnerIds.length })]
      : [t(key === 'giveaway.end.announce' ? 'giveaway.end.none' : 'giveaway.end.noneLeft', { prize: giveaway.prize })];
  if (claimBy && winnerIds.length > 0) lines.push(claimLine(claimBy, 'giveaway.claim.announce', t));

  const container = new ContainerBuilder()
    .setAccentColor(winnerIds.length > 0 ? ThemeColors.success : ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
  if (claimBy && winnerIds.length > 0) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${GIVEAWAY_CUSTOM_ID.claim}${giveaway.id}`)
          .setLabel(t('giveaway.claim.button'))
          .setEmoji(buttonIcon('gift'))
          .setStyle(ButtonStyle.Success),
      ),
    );
  }
  try {
    await channel.send({
      components: [container],
      flags: [MessageFlags.IsComponentsV2],
      // Only the winners are pinged, not roles or everyone the prize might mention
      allowedMentions: { users: winnerIds },
      reply: giveaway.messageId ? { messageReference: giveaway.messageId, failIfNotExists: false } : undefined,
    });
  } catch (error) {
    logger.warn(error, `Failed to announce the winners of giveaway ${giveaway.id} in guild ${guild.id}`);
  }
}

/** Tell winners in a DM that they won, with a link to the giveaway. Winners with closed DMs still see it under the post. */
async function dmWinners(guild: Guild, giveaway: Giveaway, winnerIds: string[], claimBy: Date | null) {
  if (!giveaway.dmWinners) return;
  const t = getTranslate(giveaway.locale);
  const link = giveaway.messageId ? messageLink(giveaway.channelId, giveaway.messageId, guild.id) : null;
  const text = [
    t('giveaway.end.dm', { prize: giveaway.prize, server: bold(guild.name), host: giveaway.host ?? userMention(giveaway.hostId) }),
    ...(claimBy ? [claimLine(claimBy, 'giveaway.claim.dm', t)] : []),
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

type WinnersKey = 'giveaway.end.announce' | 'giveaway.end.reroll';

/**
 * Let new winners know: under the post and in a DM. They get the winner role right away, or when they claim their prize if they have to,
 * so winners who never claim don't keep it.
 */
async function welcomeWinners(guild: Guild, giveaway: Giveaway, winnerIds: string[], claimBy: Date | null, key: WinnersKey) {
  await announceWinners(guild, giveaway, winnerIds, claimBy, key);
  if (!claimBy) await giveWinnerRole(guild, giveaway, winnerIds);
  await dmWinners(guild, giveaway, winnerIds, claimBy);
}

/** End a giveaway: draw its winners, show them on the post, and let them know. */
export async function endGiveaway(guild: Guild, giveaway: Giveaway) {
  const winnerIds = drawWinners(await findCandidates(guild, giveaway), giveaway.winnerCount);
  const now = new Date();
  const claimBy = claimDeadline(giveaway, now);
  // Someone may have ended it meanwhile, who then drew the winners already
  if (!(await finishGiveaway(giveaway.id, winnerIds, claimBy, now))) return;
  const ended: Giveaway = { ...giveaway, status: 'ended', endedAt: now };
  await syncPost(guild, giveaway.id);
  await welcomeWinners(guild, ended, winnerIds, claimBy, 'giveaway.end.announce');
}

/**
 * Draw new winners in place of some, from everyone who entered and hasn't won it yet.
 * @param winnerIds The IDs of the winners to replace, not their user IDs.
 * @returns The new winners' user IDs. Fewer than replaced when there's nobody left to draw, and then those places stay empty.
 */
export async function rerollWinners(guild: Guild, giveaway: Giveaway, winnerIds: string[]): Promise<string[]> {
  const everyWinner = new Set((await getAllWinners(giveaway.id)).flatMap((winner) => winner.userId ?? []));
  const drawn = drawWinners(await findCandidates(guild, giveaway, everyWinner), winnerIds.length);
  const now = new Date();
  const claimBy = claimDeadline(giveaway, now);
  const replaced = await replaceWinners(giveaway.id, winnerIds, drawn, claimBy, now);
  // Replaced meanwhile by someone else
  if (replaced === 0) return [];
  const newWinners = drawn.slice(0, replaced);
  await syncPost(guild, giveaway.id);
  await welcomeWinners(guild, giveaway, newWinners, claimBy, 'giveaway.end.reroll');
  return newWinners;
}

/** Winners who didn't claim in time and couldn't be replaced, so the logs say so once and not on every run. */
const warnedClaims = new Set<string>();

/** Give the prizes of winners who didn't claim them in time to someone else. Giveaways in servers the bot isn't in wait for it. */
export async function runClaimJob(client: Client) {
  const missed = Map.groupBy(await getMissedClaims(), (winner) => winner.giveawayId);
  for (const [giveawayId, winners] of missed) {
    const guild = client.guilds.cache.get(winners[0]!.giveaway.guildId);
    if (!guild) continue;
    try {
      const giveaway = await getGiveaway(guild.id, giveawayId);
      if (giveaway)
        await rerollWinners(
          guild,
          giveaway,
          winners.map((winner) => winner.id),
        );
      warnedClaims.delete(giveawayId);
    } catch (error) {
      if (!warnedClaims.has(giveawayId)) {
        warnedClaims.add(giveawayId);
        logger.warn(error, `Failed to replace the winners of giveaway ${giveawayId} who didn't claim in time`);
      }
    }
  }
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
