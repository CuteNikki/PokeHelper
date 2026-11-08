import {
  ActionRowBuilder,
  bold,
  ButtonBuilder,
  ButtonStyle,
  type Client,
  ContainerBuilder,
  type Guild,
  type GuildMember,
  hyperlink,
  MessageFlags,
  messageLink,
  TextDisplayBuilder,
  time,
  TimestampStyles,
  userMention,
} from 'discord.js';

import { getFeatureSwitches } from 'database/features';
import {
  dropClaims,
  finishGiveaway,
  getAllEntries,
  getAllWinners,
  getDueGiveaways,
  getGiveaway,
  getMissedClaims,
  getOtherRoleWinners,
  getXpOf,
  type Giveaway,
  replaceWinners,
  setEntriesOf,
} from 'database/giveaways';
import { getLevelFromXP } from 'database/leveling';

import { DiscordLimits } from 'utility/discordLimits';
import { MINUTE, SECOND } from 'utility/duration';
import { buttonIcon } from 'utility/emojis';
import { type Candidate, drawWinners } from 'utility/giveaways/draw';
import { logGiveaway, winnersDetail } from 'utility/giveaways/logs';
import { GIVEAWAY_CUSTOM_ID } from 'utility/giveaways/post';
import { bonusRolesOf, checkRules, countEntries, rulesOf } from 'utility/giveaways/rules';
import { giveawayChannel, syncPost } from 'utility/giveaways/sync';
import { getTranslate, type Translate } from 'utility/i18next';
import { logger, WarnOnce } from 'utility/logger';
import { quietMessageOf } from 'utility/response';
import { canGiveRole } from 'utility/roles';
import { KeyedQueue } from 'utility/queue';
import { ThemeColors } from 'utility/theme';

/** How many members are fetched from Discord at once, the most it sends back for one request. */
const FETCH_CHUNK = DiscordLimits.membersPerRequest;
/** How often a chunk of members is asked for when Discord says to wait, before giving up until the next try. */
const FETCH_TRIES = 5;

/** How long Discord said to wait before asking for members again, or null if the error isn't that. */
function retryAfter(error: unknown): number | null {
  const seconds = (error as { data?: { retry_after?: unknown } } | null)?.data?.retry_after;
  return typeof seconds === 'number' ? seconds * SECOND : null;
}

/**
 * Members of a server, from the cache, which Discord keeps up to date, or else asked of Discord a chunk at a time. When Discord says to
 * slow down, that chunk is asked for again after waiting, so a big giveaway isn't started over. Those who left aren't in it.
 */
async function fetchMembers(guild: Guild, userIds: string[]): Promise<Map<string, GuildMember>> {
  const members = new Map<string, GuildMember>();
  const missing: string[] = [];
  for (const userId of userIds) {
    const cached = guild.members.cache.get(userId);
    if (cached) members.set(userId, cached);
    else missing.push(userId);
  }
  for (let start = 0; start < missing.length; start += FETCH_CHUNK) {
    const chunk = missing.slice(start, start + FETCH_CHUNK);
    for (let tried = 1; ; tried++) {
      try {
        for (const [userId, member] of await guild.members.fetch({ user: chunk })) members.set(userId, member);
        break;
      } catch (error) {
        const wait = retryAfter(error);
        if (wait === null || tried >= FETCH_TRIES) throw error;
        await Bun.sleep(wait);
      }
    }
  }
  return members;
}

/**
 * Work out everyone's entries in a running giveaway again, like after its bonus roles changed, which keeps the participants list right.
 * Members who left keep theirs, as they can't win anyway. Everyone with the same new number is saved at once, a chunk at a time.
 */
async function refreshAllEntries(guild: Guild, giveaway: Giveaway) {
  const entries = await getAllEntries(giveaway.id);
  const bonusRoles = bonusRolesOf(giveaway);
  for (let start = 0; start < entries.length; start += FETCH_CHUNK) {
    const chunk = entries.slice(start, start + FETCH_CHUNK);
    const members = await fetchMembers(
      guild,
      chunk.map((entry) => entry.userId),
    );
    const changed = new Map<number, string[]>();
    for (const entry of chunk) {
      const member = members.get(entry.userId);
      const count = member ? countEntries([...member.roles.cache.keys()], bonusRoles) : entry.entries;
      if (count !== entry.entries) changed.set(count, [...(changed.get(count) ?? []), entry.userId]);
    }
    for (const [count, userIds] of changed) await setEntriesOf(giveaway.id, userIds, count);
  }
}

/** Refreshes of entries one at a time per giveaway, so two never write the same entries at once. */
const refreshes = new KeyedQueue();
/** Giveaways with a refresh waiting to start, which covers every change made until it does. */
const waitingRefreshes = new Set<string>();

/**
 * Work out everyone's entries in a running giveaway again, in the background, as it can take a while. Changes in a row, like several
 * bonus roles set one after another, share one refresh that hasn't started yet, which loads the giveaway as it is by then.
 */
export function refreshEntriesSoon(guild: Guild, giveawayId: string) {
  if (waitingRefreshes.has(giveawayId)) return;
  waitingRefreshes.add(giveawayId);
  void refreshes
    .run(giveawayId, async () => {
      waitingRefreshes.delete(giveawayId);
      const giveaway = await getGiveaway(guild.id, giveawayId);
      if (giveaway?.status === 'active') await refreshAllEntries(guild, giveaway);
    })
    .catch((error: unknown) => logger.error(error, `Failed to update the entries of giveaway ${giveawayId}`));
}

/**
 * Who can win a giveaway: everyone who entered, is still on the server and still meets the rules, with their entries worked out again
 * from the roles they have now, in case a change was missed while the bot was offline.
 * @param exclude Who can't win again, like the winners before a reroll.
 */
export async function findCandidates(guild: Guild, giveaway: Giveaway, exclude: ReadonlySet<string> = new Set()): Promise<Candidate[]> {
  const entries = (await getAllEntries(giveaway.id)).filter((entry) => !exclude.has(entry.userId));
  const rules = rulesOf(giveaway, (roleId) => guild.roles.cache.has(roleId));
  const bonusRoles = bonusRolesOf(giveaway);
  const now = new Date();

  const candidates: Candidate[] = [];
  for (let start = 0; start < entries.length; start += FETCH_CHUNK) {
    const chunk = entries.slice(start, start + FETCH_CHUNK);
    const userIds = chunk.map((entry) => entry.userId);
    // Members who left aren't sent back. XP a chunk at a time too, so the query stays small however many entered
    const [members, xp] = await Promise.all([
      fetchMembers(guild, userIds),
      rules.minLevel ? getXpOf(guild.id, userIds) : Promise.resolve(new Map<string, number>()),
    ]);
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

/** The button winners claim their prize with. */
const claimRow = (giveaway: Giveaway, t: Translate) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${GIVEAWAY_CUSTOM_ID.claim}${giveaway.id}`)
      .setLabel(t('giveaway.claim.button'))
      .setEmoji(buttonIcon('gift'))
      .setStyle(ButtonStyle.Success),
  );

/**
 * Say who won under the giveaway's post, pinging them, or in its channel if the post is gone.
 * When winners have to claim their prize, it says until when, with the button to claim it.
 * @returns Whether it was posted.
 */
async function announceWinners(guild: Guild, giveaway: Giveaway, winnerIds: string[], claimBy: Date | null, key: WinnersKey): Promise<boolean> {
  const channel = await giveawayChannel(guild, giveaway.channelId);
  if (!channel) return false;
  const t = getTranslate(giveaway.locale);
  const lines =
    winnerIds.length > 0
      ? [t(key, { winners: winnerIds.map(userMention).join(', '), prize: giveaway.prize, count: winnerIds.length })]
      : [t(key === 'giveaway.end.announce' ? 'giveaway.end.none' : 'giveaway.end.noneLeft', { prize: giveaway.prize })];
  if (claimBy && winnerIds.length > 0) lines.push(claimLine(claimBy, 'giveaway.claim.announce', t));

  const container = new ContainerBuilder()
    .setAccentColor(winnerIds.length > 0 ? ThemeColors.success : ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
  if (claimBy && winnerIds.length > 0) container.addActionRowComponents(claimRow(giveaway, t));
  try {
    await channel.send({
      components: [container],
      flags: [MessageFlags.IsComponentsV2],
      // Only the winners are pinged, not roles or everyone the prize might mention
      allowedMentions: { users: winnerIds },
      reply: giveaway.messageId ? { messageReference: giveaway.messageId, failIfNotExists: false } : undefined,
    });
    return true;
  } catch (error) {
    logger.warn(error, `Failed to announce the winners of giveaway ${giveaway.id} in guild ${guild.id}`);
    return false;
  }
}

/**
 * Tell winners in a DM that they won, with a link to the giveaway. Winners with closed DMs still see it under the post.
 * When they have to claim their prize, the DM has the button too, so they can claim it without finding the announcement.
 */
async function dmWinners(guild: Guild, giveaway: Giveaway, winnerIds: string[], claimBy: Date | null) {
  if (!giveaway.dmWinners) return;
  const t = getTranslate(giveaway.locale);
  const link = giveaway.messageId ? messageLink(giveaway.channelId, giveaway.messageId, guild.id) : null;
  const text = [
    t('giveaway.end.dm', { prize: giveaway.prize, server: bold(guild.name), host: giveaway.host ?? userMention(giveaway.hostId) }),
    ...(claimBy ? [claimLine(claimBy, 'giveaway.claim.dm', t)] : []),
    ...(link ? [hyperlink(t('giveaway.end.dmLink'), link)] : []),
  ].join('\n');
  const container = new ContainerBuilder().setAccentColor(ThemeColors.success).addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  if (claimBy) container.addActionRowComponents(claimRow(giveaway, t));
  for (const userId of winnerIds) {
    await guild.client.users.send(userId, quietMessageOf(container)).catch(() => null);
  }
}

/**
 * Give winners the giveaway's winner role, if it has one the bot can give. It stays with them, like a reward role, unless they're replaced.
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

/**
 * Take the winner role away from winners who were replaced, unless they still won another giveaway that gives it.
 * Failures are only logged, like when they left meanwhile.
 */
async function takeWinnerRole(guild: Guild, giveaway: Giveaway, userIds: string[]) {
  const roleId = giveaway.winnerRoleId;
  if (!roleId || userIds.length === 0 || !canGiveRole(guild, roleId)) return;
  const keep = await getOtherRoleWinners(guild.id, giveaway.id, roleId, userIds);
  const t = getTranslate(giveaway.locale);
  for (const userId of userIds) {
    if (keep.has(userId)) continue;
    await guild.members
      .removeRole({ user: userId, role: roleId, reason: t('giveaway.end.roleTakenReason', { prize: giveaway.prize }) })
      .catch((error: unknown) => logger.warn(error, `Failed to take back the winner role of giveaway ${giveaway.id} from ${userId}`));
  }
}

type WinnersKey = 'giveaway.end.announce' | 'giveaway.end.reroll';

/**
 * Let new winners know: under the post and in a DM. They get the winner role right away, or when they claim their prize if they have to,
 * so winners who never claim don't keep it. When the announcement couldn't be posted, like when the channel is gone, winners with closed
 * DMs would have nowhere to claim it, so then nobody has to.
 */
async function welcomeWinners(guild: Guild, giveaway: Giveaway, winnerIds: string[], claimBy: Date | null, key: WinnersKey) {
  if (winnerIds.length === 0) {
    await announceWinners(guild, giveaway, winnerIds, null, key);
    return;
  }
  const posted = await announceWinners(guild, giveaway, winnerIds, claimBy, key);
  const mustClaim = posted ? claimBy : null;
  if (claimBy && !mustClaim) await dropClaims(giveaway.id, winnerIds);
  if (!mustClaim) await giveWinnerRole(guild, giveaway, winnerIds);
  await dmWinners(guild, giveaway, winnerIds, mustClaim);
}

/**
 * Draws of the same giveaway one at a time, its end and its rerolls, so two at once, like a moderator's reroll while the claim job replaces
 * someone, can't both draw the same person, and each draws from the winners the one before it left.
 */
const draws = new KeyedQueue();

/**
 * End a giveaway: draw its winners, show them on the post, and let them know.
 * @param byId Who ended it early, for the logs. Null when its time ran out.
 */
export const endGiveaway = (guild: Guild, giveaway: Giveaway, byId: string | null = null) =>
  draws.run(giveaway.id, async () => {
    // As it is by now, as it may have been ended or changed while waiting, like its end moved later after the job found it
    const current = await getGiveaway(guild.id, giveaway.id);
    if (current?.status !== 'active') return;
    if (!byId && current.endsAt && current.endsAt > new Date()) return;
    await drawAndEnd(guild, current, byId);
  });

async function drawAndEnd(guild: Guild, giveaway: Giveaway, byId: string | null) {
  const drawn = drawWinners(await findCandidates(guild, giveaway), giveaway.winnerCount);
  const now = new Date();
  const claimBy = claimDeadline(giveaway, now);
  const winnerIds = await finishGiveaway(giveaway.id, drawn, claimBy, now);
  // Someone may have ended it meanwhile, who then drew the winners already
  if (!winnerIds) return;
  const ended: Giveaway = { ...giveaway, status: 'ended', endedAt: now };
  await syncPost(guild, giveaway.id);
  await welcomeWinners(guild, ended, winnerIds, claimBy, 'giveaway.end.announce');
  await logGiveaway(guild, 'giveawayEnded', ended, byId, (t) => [winnersDetail(winnerIds, t)]);
}

/**
 * Draw new winners in place of some, from everyone who entered and hasn't won it yet.
 * @param winnerIds The IDs of the winners to replace, not their user IDs.
 * @param byId Who rerolled them, for the logs. Null when they're replaced for not claiming in time.
 * @returns The new winners' user IDs. Fewer than replaced when there's nobody left to draw, and then those places stay empty.
 */
export const rerollWinners = (guild: Guild, giveaway: Giveaway, winnerIds: string[], byId: string | null = null): Promise<string[]> =>
  draws.run(giveaway.id, () => reroll(guild, giveaway, winnerIds, byId));

async function reroll(guild: Guild, giveaway: Giveaway, winnerIds: string[], byId: string | null): Promise<string[]> {
  const winners = await getAllWinners(giveaway.id);
  const everyWinner = new Set(winners.flatMap((winner) => winner.userId ?? []));
  const replacedUsers = winners.filter((winner) => winnerIds.includes(winner.id) && !winner.replacedAt).flatMap((winner) => winner.userId ?? []);
  const drawn = drawWinners(await findCandidates(guild, giveaway, everyWinner), winnerIds.length);
  const now = new Date();
  const claimBy = claimDeadline(giveaway, now);
  const newWinners = await replaceWinners(giveaway.id, winnerIds, drawn, claimBy, now);
  // Replaced meanwhile by someone else
  if (!newWinners) return [];
  await takeWinnerRole(guild, giveaway, replacedUsers);
  await syncPost(guild, giveaway.id);
  await welcomeWinners(guild, giveaway, newWinners, claimBy, 'giveaway.end.reroll');
  await logGiveaway(guild, 'giveawayRerolled', giveaway, byId, (t) => [
    t('logs.giveaways.replaced', { users: replacedUsers.map(userMention).join(', ') || '-' }),
    byId ? null : t('logs.giveaways.missedClaim'),
    winnersDetail(newWinners, t),
  ]);
  return newWinners;
}

/**
 * Whether giveaways are on in a server, each looked up once per run. While they're off, giveaways wait with their draw, and winners who
 * missed their claim with being replaced, until they're on again.
 */
function switchCheck() {
  const known = new Map<string, Promise<boolean>>();
  return (guildId: string) => {
    let on = known.get(guildId);
    if (!on) known.set(guildId, (on = getFeatureSwitches(guildId).then((switches) => switches.giveawaysEnabled)));
    return on;
  };
}

/** Winners who didn't claim in time and couldn't be replaced. */
const claimWarnings = new WarnOnce();

/** Give the prizes of winners who didn't claim them in time to someone else. Giveaways in servers the bot isn't in wait for it. */
export async function runClaimJob(client: Client) {
  const isOn = switchCheck();
  const missed = Map.groupBy(await getMissedClaims(), (winner) => winner.giveawayId);
  for (const [giveawayId, winners] of missed) {
    const guild = client.guilds.cache.get(winners[0]!.giveaway.guildId);
    if (!guild || !(await isOn(guild.id))) continue;
    try {
      const giveaway = await getGiveaway(guild.id, giveawayId);
      if (giveaway)
        await rerollWinners(
          guild,
          giveaway,
          winners.map((winner) => winner.id),
        );
      claimWarnings.worked(giveawayId);
    } catch (error) {
      claimWarnings.warn(giveawayId, error, `Failed to replace the winners of giveaway ${giveawayId} who didn't claim in time`);
    }
  }
}

/** Giveaways that couldn't be ended. */
const endWarnings = new WarnOnce();

/**
 * End the giveaways whose time is up. Runs regularly, so ones that ended while the bot was offline are drawn once it's back.
 * Giveaways in servers the bot isn't in right now wait for it to come back.
 */
export async function runGiveawayJob(client: Client) {
  const isOn = switchCheck();
  for (const giveaway of await getDueGiveaways()) {
    const guild = client.guilds.cache.get(giveaway.guildId);
    if (!guild || !(await isOn(guild.id))) continue;
    try {
      await endGiveaway(guild, giveaway);
      endWarnings.worked(giveaway.id);
    } catch (error) {
      // Like when Discord didn't send the members in time. Tried again on the next run
      endWarnings.warn(giveaway.id, error, `Failed to end giveaway ${giveaway.id} in guild ${guild.id}`);
    }
  }
}
