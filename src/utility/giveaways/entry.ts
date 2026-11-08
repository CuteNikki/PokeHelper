import { type GuildMember, time, TimestampStyles } from 'discord.js';

import type { Giveaway } from 'database/giveaways';
import { getLevelFromXP, getUserLevelingData } from 'database/leveling';

import { formatNumber } from 'utility/duration';
import { formatMinutes } from 'utility/giveaways/input';
import { formatRoles } from 'utility/giveaways/post';
import type { Participant, RuleProblem } from 'utility/giveaways/rules';
import type { Translate } from 'utility/i18next';

/**
 * What the rules look at of a member.
 * @param needsLevel Whether their level is needed, which is only looked up then, as it takes a moment.
 */
export async function participantOf(member: GuildMember, needsLevel: boolean): Promise<Participant> {
  const level = needsLevel ? getLevelFromXP((await getUserLevelingData(member.guild.id, member.id))?.xp ?? 0) : 0;
  return {
    bot: member.user.bot,
    roleIds: [...member.roles.cache.keys()],
    joinedAt: member.joinedAt,
    createdAt: member.user.createdAt,
    level,
  };
}

/**
 * The rules someone doesn't meet, each as a line that says what's missing, like when they can enter for rules that only need time.
 * @param endsAt When the giveaway ends, as a time after it doesn't help.
 */
export function describeProblems(problems: RuleProblem[], giveaway: Pick<Giveaway, 'minMemberMinutes' | 'minAccountMinutes'>, endsAt: Date, t: Translate) {
  // Only said for times they can still make it by
  const from = (date: Date | null) => (date && date < endsAt ? ` ${t('giveaway.join.from', { time: time(date, TimestampStyles.RelativeTime) })}` : '');
  return problems.map((problem) => {
    switch (problem.rule) {
      case 'bot':
        return t('giveaway.join.bot');
      case 'blocked':
        return t('giveaway.join.blocked', { roles: formatRoles(problem.roleIds), count: problem.roleIds.length });
      case 'required':
        return t(problem.all && problem.roleIds.length > 1 ? 'giveaway.rules.requiredAll' : 'giveaway.rules.requiredAny', {
          roles: formatRoles(problem.roleIds),
          count: problem.roleIds.length,
        });
      case 'level':
        return t('giveaway.rules.level', { level: formatNumber(problem.level, t) });
      case 'memberAge':
        return `${t('giveaway.rules.memberAge', { duration: formatMinutes(giveaway.minMemberMinutes ?? 0, t) })}${from(problem.from)}`;
      case 'accountAge':
        return `${t('giveaway.rules.accountAge', { duration: formatMinutes(giveaway.minAccountMinutes ?? 0, t) })}${from(problem.from)}`;
    }
  });
}

/** Whether a giveaway is still running, also before the job got to ending it. */
export const isRunning = (giveaway: Giveaway, now = new Date()) => giveaway.status === 'active' && !!giveaway.endsAt && giveaway.endsAt > now;
