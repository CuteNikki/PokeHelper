import type { GuildLeveling } from 'generated/prisma/client';

/** Where a message was sent and who sent it, which decides whether it earns XP and how much. */
export interface XpContext {
  /**
   * The channel the message was sent in, followed by its parents: for a thread its channel and that channel's category,
   * for a channel its category. Filters and multipliers on any of them apply.
   */
  channelIds: string[];
  /** The roles of the member who sent it. */
  roleIds: string[];
}

export interface Multiplier {
  targetId: string;
  multiplier: number;
}

/**
 * Whether a message earns XP, by the ignored and only-these channel and role lists.
 * Ignoring always wins, and the only-these lists only apply when they aren't empty.
 */
export function earnsXp(config: Pick<GuildLeveling, 'ignoredChannels' | 'enabledChannels' | 'ignoredRoles' | 'enabledRoles'>, context: XpContext): boolean {
  const inChannels = (list: string[]) => context.channelIds.some((id) => list.includes(id));
  const hasRoles = (list: string[]) => context.roleIds.some((id) => list.includes(id));

  if (inChannels(config.ignoredChannels) || hasRoles(config.ignoredRoles)) return false;
  if (config.enabledChannels.length > 0 && !inChannels(config.enabledChannels)) return false;
  if (config.enabledRoles.length > 0 && !hasRoles(config.enabledRoles)) return false;
  return true;
}

/**
 * The multiplier for a message: the highest one of its channel, the channel's parents and the member's roles.
 * They never stack, and without any that apply it's 1.
 */
export function getMultiplier(multipliers: Multiplier[], context: XpContext): number {
  const applying = multipliers.filter((entry) => context.channelIds.includes(entry.targetId) || context.roleIds.includes(entry.targetId));
  return applying.length > 0 ? Math.max(...applying.map((entry) => entry.multiplier)) : 1;
}

/** The XP a message earns: the base amount times the multiplier, rounded to a whole number. */
export const applyMultiplier = (baseXp: number, multiplier: number) => Math.round(baseXp * multiplier);

/** The reward roles a member at a level should have: every reward up to and including that level. */
export const getEarnedRewardRoles = (rewards: { level: number; roleId: string }[], level: number) =>
  rewards.filter((reward) => reward.level <= level).map((reward) => reward.roleId);
