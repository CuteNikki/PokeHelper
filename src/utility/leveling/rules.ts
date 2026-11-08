import type { ResetPeriod } from 'database/leveling';

import type { GuildLeveling } from 'generated/prisma/client';

/** Where a message was sent and who sent it, which decides whether it earns XP and how much. */
export interface XpContext {
  /** The channel it was sent in, followed by its parents. Filters and multipliers on any of them apply. */
  channelIds: string[];
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

/** The start of the week a time is in: Monday 00:00 UTC. */
export function startOfWeek(now: Date): Date {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // getUTCDay is 0 for Sunday, which belongs to the week that started six days before
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}

/** The start of the month a time is in: the 1st at 00:00 UTC. */
export const startOfMonth = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/** Whether the weekly or monthly XP should be reset: the last reset, or the setup if there was none, was before this week or month started. */
export const isResetDue = (period: ResetPeriod, lastResetAt: Date | null, createdAt: Date, now: Date) =>
  (lastResetAt ?? createdAt) < (period === 'weekly' ? startOfWeek(now) : startOfMonth(now));

/** Someone in a voice channel, for whether they earn XP there. */
export interface VoiceListener {
  id: string;
  bot: boolean;
  /** Deafened by themselves or the server. */
  deafened: boolean;
}

/**
 * Who in a voice channel earns XP for the minute: everyone who can hear, as long as someone else who can hear is there too.
 * So nobody earns XP alone, deafened or only with bots. Being muted is fine, as plenty of people just listen.
 */
export function getVoiceEarners(listeners: VoiceListener[]): string[] {
  const hearing = listeners.filter((listener) => !listener.bot && !listener.deafened);
  return hearing.length >= 2 ? hearing.map((listener) => listener.id) : [];
}
