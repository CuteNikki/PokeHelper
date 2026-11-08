import type { Guild, GuildMember, GuildTextBasedChannel } from 'discord.js';

import { getUserIdsWithXp, getXPForLevel } from 'database/leveling';

import { findMember } from 'utility/discord';
import { getEarnedRewardRoles } from 'utility/leveling/rules';
import { logger } from 'utility/logger';
import { canGiveRole } from 'utility/roles';

/**
 * The channel a message was sent in, followed by its parents: a thread's channel and that channel's category, or a channel's category.
 * Leveling filters and multipliers on any of them apply to the message.
 */
export function getChannelChain(channel: GuildTextBasedChannel): string[] {
  const chain = [channel.id];
  let parent = channel.parent;
  while (parent) {
    chain.push(parent.id);
    parent = parent.parent;
  }
  return chain;
}

/**
 * Give a member the reward roles they've earned but don't have, like after a reward was added for a lower level or they came back,
 * and return them. Roles the bot can't give are skipped, the settings panel warns about those.
 */
export async function syncRewardRoles(member: GuildMember, rewards: { level: number; roleId: string }[], level: number): Promise<string[]> {
  const missing = getEarnedRewardRoles(rewards, level).filter((roleId) => !member.roles.cache.has(roleId) && canGiveRole(member.guild, roleId));
  if (missing.length === 0) return [];

  await member.roles.add(missing);
  return missing;
}

/**
 * Give a new reward role to every member who already reached its level, in the background as it can take a while in big servers.
 * Members who left are skipped, they get it from {@link syncRewardRoles} if they come back and earn XP.
 */
export async function grantRewardToQualifiedMembers(guild: Guild, roleId: string, level: number) {
  if (!canGiveRole(guild, roleId)) return;

  const userIds = await getUserIdsWithXp(guild.id, getXPForLevel(level));
  let given = 0;

  // One at a time, so a big server doesn't hit the rate limits all at once
  for (const userId of userIds) {
    const member = await findMember(guild, userId);
    if (!member || member.roles.cache.has(roleId)) continue;
    try {
      await member.roles.add(roleId);
      given++;
    } catch (error) {
      logger.error(error, `Failed to give reward role ${roleId} to ${userId} in guild ${guild.id}`);
    }
  }

  if (given > 0) logger.info(`Gave reward role ${roleId} to ${given} members in guild ${guild.id} who already reached level ${level}`);
}
