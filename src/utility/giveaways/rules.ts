import type { Giveaway } from 'database/giveaways';

import { MINUTE } from 'utility/duration';

/** Who can enter a giveaway. */
export interface GiveawayRules {
  requiredRoleIds: string[];
  /** Whether all the required roles are needed, or any one of them. */
  requireAllRoles: boolean;
  blockedRoleIds: string[];
  minLevel: number | null;
  minMemberMinutes: number | null;
  minAccountMinutes: number | null;
}

/** What the rules look at of someone. */
export interface Participant {
  bot: boolean;
  roleIds: readonly string[];
  /** When they joined the server, null if that isn't known. */
  joinedAt: Date | null;
  /** When their account was made. */
  createdAt: Date;
  /** Their all-time level on the server. */
  level: number;
}

/** A rule someone doesn't meet. */
export type RuleProblem =
  | { rule: 'bot' }
  /** The blocked roles they have. */
  | { rule: 'blocked'; roleIds: string[] }
  /** The required roles they're missing when all are needed, or all of them when any one is enough. */
  | { rule: 'required'; roleIds: string[]; all: boolean }
  | { rule: 'level'; level: number }
  /** When they've been on the server long enough, or null if it isn't known when they joined. */
  | { rule: 'memberAge'; from: Date | null }
  /** When their account is old enough. */
  | { rule: 'accountAge'; from: Date };

/** The rules of a giveaway. */
export function rulesOf(giveaway: Giveaway): GiveawayRules {
  const ofKind = (kind: 'required' | 'blocked') => giveaway.roles.filter((role) => role.kind === kind).map((role) => role.roleId);
  return {
    requiredRoleIds: ofKind('required'),
    requireAllRoles: giveaway.requireAllRoles,
    blockedRoleIds: ofKind('blocked'),
    minLevel: giveaway.minLevel,
    minMemberMinutes: giveaway.minMemberMinutes,
    minAccountMinutes: giveaway.minAccountMinutes,
  };
}

/** Whether a giveaway has any rules for who can enter. */
export const hasRules = (rules: GiveawayRules) =>
  rules.requiredRoleIds.length > 0 || rules.blockedRoleIds.length > 0 || !!rules.minLevel || !!rules.minMemberMinutes || !!rules.minAccountMinutes;

/** The bonus roles of a giveaway with their extra entries. */
export const bonusRolesOf = (giveaway: Giveaway) =>
  giveaway.roles.filter((role) => role.kind === 'bonus').map((role) => ({ roleId: role.roleId, bonus: role.bonus }));

/**
 * The rules someone doesn't meet, all of them so they know everything they'd need at once. Empty if they can enter.
 * Bots never can, as they can't win anything.
 */
export function checkRules(rules: GiveawayRules, participant: Participant, now: Date): RuleProblem[] {
  if (participant.bot) return [{ rule: 'bot' }];
  const problems: RuleProblem[] = [];
  const roles = new Set(participant.roleIds);

  const blocked = rules.blockedRoleIds.filter((roleId) => roles.has(roleId));
  if (blocked.length > 0) problems.push({ rule: 'blocked', roleIds: blocked });

  if (rules.requiredRoleIds.length > 0) {
    const missing = rules.requiredRoleIds.filter((roleId) => !roles.has(roleId));
    const met = rules.requireAllRoles ? missing.length === 0 : missing.length < rules.requiredRoleIds.length;
    if (!met) problems.push({ rule: 'required', roleIds: rules.requireAllRoles ? missing : rules.requiredRoleIds, all: rules.requireAllRoles });
  }

  if (rules.minLevel && participant.level < rules.minLevel) problems.push({ rule: 'level', level: rules.minLevel });

  if (rules.minMemberMinutes) {
    const from = participant.joinedAt ? new Date(participant.joinedAt.getTime() + rules.minMemberMinutes * MINUTE) : null;
    if (!from || from > now) problems.push({ rule: 'memberAge', from });
  }

  if (rules.minAccountMinutes) {
    const from = new Date(participant.createdAt.getTime() + rules.minAccountMinutes * MINUTE);
    if (from > now) problems.push({ rule: 'accountAge', from });
  }

  return problems;
}

/** Someone's entries: 1, plus the bonus of each bonus role they have. */
export function countEntries(roleIds: readonly string[], bonusRoles: readonly { roleId: string; bonus: number }[]): number {
  const roles = new Set(roleIds);
  return bonusRoles.reduce((entries, role) => (roles.has(role.roleId) ? entries + role.bonus : entries), 1);
}
