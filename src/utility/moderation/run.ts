import {
  bold,
  type ChatInputCommandInteraction,
  ContainerBuilder,
  type Guild,
  type GuildMember,
  MessageFlags,
  type PermissionsString,
  subtext,
  TextDisplayBuilder,
  time,
  TimestampStyles,
  type User,
} from 'discord.js';

import { createCase, undoCase } from 'database/moderation';

import type { ModCase, ModCaseType } from 'generated/prisma/client';
import { DAY, formatNumber } from 'utility/duration';
import { textIcon } from 'utility/emojis';
import type { IconName } from 'utility/icons';
import { getTranslate, type Translate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { userSubject } from 'utility/logs/format';
import { parseDuration } from 'utility/reminders/time';
import { createResponse, sendResponse, type ResponsePayload } from 'utility/response';
import { quote } from 'utility/text';
import { ThemeColors } from 'utility/theme';

/** The longest timeout Discord allows, in days. */
export const MAX_TIMEOUT_DAYS = 28;
/** The longest temporary ban, in days, which is 5 years. Longer ones can just as well be lifted by hand. */
export const MAX_BAN_DAYS = 5 * 365;

/** The longest reason, short enough to also go in Discord's audit log with who gave it. */
export const MAX_REASON_LENGTH = 400;
/** The longest reason Discord's audit log takes. */
const MAX_AUDIT_REASON = 512;

/** The icon of each type of case, in front of it wherever it's shown. */
export const CASE_ICONS: Record<ModCaseType, IconName> = {
  warn: 'triangle-alert',
  timeout: 'hourglass',
  untimeout: 'timer-off',
  kick: 'door-open',
  ban: 'ban',
  unban: 'rotate-ccw',
};

/** A case's number as it's shown, like `#12`. */
export const caseNumber = (modCase: Pick<ModCase, 'number'>, t: Translate) => `#${formatNumber(modCase.number, t)}`;

/** A date, and how long until then or since, like `7 November 2026 21:14 (in 3 days)`. */
export const formatUntil = (date: Date) => `${time(date, TimestampStyles.LongDateShortTime)} (${time(date, TimestampStyles.RelativeTime)})`;

/**
 * The reason for Discord's audit log, with who gave it in front, as the audit log names the bot as who did it. Just who, without a reason.
 */
export const auditReason = (moderator: User, reason: string | null) =>
  (reason ? `${moderator.username}: ${reason}` : moderator.username).slice(0, MAX_AUDIT_REASON);

/**
 * When a timeout or temporary ban that lasts as long as typed ends, like for `10m`, `2h 30m` or `3d`, in the units of any language.
 * @param maxDays The longest it can be.
 * @returns When it ends, or why it can't: it isn't a duration, or it's longer than allowed.
 */
export function parseModerationDuration(input: string, maxDays: number, now = new Date()): Date | 'invalid' | 'tooLong' {
  const end = parseDuration(input, now);
  if (!end || end.getTime() <= now.getTime()) return 'invalid';
  return end.getTime() - now.getTime() > maxDays * DAY ? 'tooLong' : end;
}

/** What a moderation command does to whom: the bot's permission it needs, and whether the member has to be on the server. */
interface ActionRules {
  permission: PermissionsString | null;
  /** Whether Discord lets the bot do it to the member, which also says whether their highest role is below the bot's. */
  canAct?: (member: GuildMember) => boolean;
}

export const ACTION_RULES: Record<ModCaseType, ActionRules> = {
  warn: { permission: null },
  timeout: { permission: 'ModerateMembers', canAct: (member) => member.moderatable },
  untimeout: { permission: 'ModerateMembers', canAct: (member) => member.moderatable },
  kick: { permission: 'KickMembers', canAct: (member) => member.kickable },
  ban: { permission: 'BanMembers', canAct: (member) => member.bannable },
  unban: { permission: 'BanMembers' },
};

/**
 * Why someone can't do a moderation action to someone, or null if they can: not to themselves, the bot or the server's owner,
 * only to members whose highest role is below theirs, and only what the bot is allowed to do. Those who aren't on the server, like for
 * a ban by ID, only need the bot's permission.
 */
export function moderationProblem(
  guild: Guild,
  moderator: GuildMember,
  user: User,
  member: GuildMember | null,
  type: ModCaseType,
  t: Translate,
): string | null {
  const rules = ACTION_RULES[type];
  const mention = userSubject(user);
  if (user.id === moderator.id) return t('moderation.problems.self');
  if (user.id === guild.client.user.id) return t('moderation.problems.bot');
  if (user.id === guild.ownerId) return t('moderation.problems.owner');
  if (rules.permission && !guild.members.me?.permissions.has(rules.permission)) {
    return t('moderation.problems.missing', { permission: t(`permission.${rules.permission}`) });
  }
  if (!member) return null;
  // The owner is above everyone, whatever their roles
  if (moderator.id !== guild.ownerId && member.roles.highest.comparePositionTo(moderator.roles.highest) >= 0) {
    return t('moderation.problems.aboveYou', { user: mention });
  }
  if (rules.canAct && !rules.canAct(member)) return t('moderation.problems.aboveMe', { user: mention });
  return null;
}

/** Whether someone is banned from a server, asked of Discord. */
export const isBanned = async (guild: Guild, userId: string) => (await guild.bans.fetch({ user: userId, force: true }).catch(() => null)) !== null;

/** The DM telling someone what happened to them on a server, in the server's language, as theirs isn't known. */
function buildCaseDm(guild: Guild, modCase: ModCase, t: Translate): ResponsePayload {
  const lines = [
    t(`moderation.dm.${modCase.type}`, { icon: textIcon(CASE_ICONS[modCase.type]), server: bold(guild.name) }),
    `${bold(t('moderation.reason'))}\n${quote(modCase.reason ?? t('moderation.noReason'))}`,
  ];
  if (modCase.expiresAt) lines.push(t('moderation.dm.until', { until: formatUntil(modCase.expiresAt) }));
  lines.push(subtext(t('moderation.dm.case', { number: caseNumber(modCase, t) })));
  return {
    components: [new ContainerBuilder().setAccentColor(ThemeColors.warning).addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))],
    flags: [MessageFlags.IsComponentsV2],
  };
}

/** What a moderation command does, besides making its case. */
export interface ModerationAction {
  type: ModCaseType;
  user: User;
  reason: string | null;
  expiresAt?: Date | null;
  /** Whether to tell them by DM. Sent before the action, as after a kick or ban they may not share a server with the bot anymore. */
  dm: boolean;
  /** Do it on Discord, with the reason for the audit log. */
  act: (auditReason: string) => Promise<unknown>;
  /** Why it can't be done after all, or null if it can, for checks that ask Discord, which can take longer than it waits for an answer. */
  check?: () => Promise<string | null>;
}

/**
 * Run a moderation command's action, after its checks: make its case, tell them by DM if wanted, do it, and say how it went.
 * The case is made first, so the logs find it when Discord tells them about it. If the action fails, the case and the DM are taken back.
 * Answered first, as Discord gives up after 3 seconds, and only who used it sees the answer, as the logs are where others see it.
 */
export async function runModeration(interaction: ChatInputCommandInteraction<'cached'>, action: ModerationAction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const { guild } = interaction;

  const problem = (await action.check?.()) ?? null;
  if (problem) return sendResponse(interaction, createResponse(problem, 'error'));

  const modCase = await createCase({
    guildId: guild.id,
    type: action.type,
    userId: action.user.id,
    moderatorId: interaction.user.id,
    reason: action.reason,
    expiresAt: action.expiresAt ?? null,
  });

  const dm = action.dm ? await action.user.send(buildCaseDm(guild, modCase, getTranslate(guild.preferredLocale))).catch(() => null) : null;
  try {
    await action.act(auditReason(interaction.user, action.reason));
  } catch (error) {
    logger.warn(error, `Failed to ${action.type} ${action.user.id} in ${guild.id}`);
    await Promise.all([undoCase(modCase), dm?.delete().catch(() => null)]);
    return sendResponse(interaction, createResponse(t('moderation.failed'), 'error'));
  }

  const user = userSubject(action.user);
  // Bans say until when only if they end, timeouts always do
  const key = action.type === 'ban' && modCase.expiresAt ? 'banUntil' : action.type;
  const done = t(`moderation.done.${key}`, { user, until: modCase.expiresAt ? formatUntil(modCase.expiresAt) : '' });
  const notes = [t('moderation.done.case', { number: caseNumber(modCase, t) })];
  if (action.dm) notes.push(dm ? t('moderation.done.dmSent') : t('moderation.done.dmFailed'));
  return sendResponse(interaction, {
    ...createResponse(`${textIcon(CASE_ICONS[action.type])} ${done}\n${subtext(notes.join(' · '))}`, 'success'),
    allowedMentions: { parse: [] },
  });
}
