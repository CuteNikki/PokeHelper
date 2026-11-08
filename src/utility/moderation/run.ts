import {
  bold,
  type ChatInputCommandInteraction,
  ContainerBuilder,
  type Guild,
  type GuildMember,
  MessageFlags,
  RESTJSONErrorCodes,
  type PermissionsString,
  subtext,
  TextDisplayBuilder,
  time,
  TimestampStyles,
  type User,
} from 'discord.js';

import { createCase, undoCase } from 'database/moderation';

import type { ModCase, ModCaseType } from 'generated/prisma/client';
import { fetchMember, isDiscordError, isRefused } from 'utility/discord';
import { DAY, formatNumber, MINUTE } from 'utility/duration';
import { textIcon } from 'utility/emojis';
import type { IconName } from 'utility/icons';
import { getTranslate, type Translate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { userSubject } from 'utility/logs/format';
import { KeyedQueue } from 'utility/queue';
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

/** The icon of each type of case. */
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

/** The reason for Discord's audit log, with who gave it in front, as the audit log names the bot as who did it. */
export const auditReason = (moderator: User, reason: string | null) =>
  (reason ? `${moderator.username}: ${reason}` : moderator.username).slice(0, MAX_AUDIT_REASON);

/** When a timeout or temporary ban of the typed length, like `2h 30m`, ends, or why it can't: it isn't a duration, or it's longer than maxDays. */
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
 * What a moderator needs to be allowed to do each, for the commands and the panel alike. The commands are hidden from those without it,
 * but a server can show them to others in its settings, which doesn't let them do more than they could through Discord itself.
 */
export const MODERATOR_PERMISSIONS: Record<ModCaseType, PermissionsString> = {
  warn: 'ModerateMembers',
  timeout: 'ModerateMembers',
  untimeout: 'ModerateMembers',
  kick: 'KickMembers',
  ban: 'BanMembers',
  unban: 'BanMembers',
};

/** Why a moderator isn't allowed to do something, or null if they are. */
export const permissionProblem = (moderator: GuildMember, permission: PermissionsString, t: Translate) =>
  moderator.permissions.has(permission) ? null : t('moderation.panel.noPermission', { permission: t(`permission.${permission}`) });

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
  // Discord never lets admins be timed out, wherever the bot's role is, so moving it wouldn't help
  if ((type === 'timeout' || type === 'untimeout') && member.permissions.has('Administrator')) return t('moderation.problems.admin', { user: mention });
  if (rules.canAct && !rules.canAct(member)) return t('moderation.problems.aboveMe', { user: mention });
  return null;
}

/** Whether someone is banned from a server, asked of Discord, or undefined if it couldn't be asked. */
export async function fetchBanned(guild: Guild, userId: string): Promise<boolean | undefined> {
  try {
    await guild.bans.fetch({ user: userId, force: true });
    return true;
  } catch (error) {
    return isDiscordError(error, RESTJSONErrorCodes.UnknownBan) ? false : undefined;
  }
}

/**
 * Whether a moderation action happened on Discord although asking for it failed, like when the answer didn't arrive in time. Discord
 * saying no means it didn't, everything else is checked by asking Discord how things are now.
 * @param expiresAt When a timeout ends, to tell it apart from one that was there before.
 */
export async function happenedAnyway(error: unknown, guild: Guild, userId: string, type: ModCaseType, expiresAt: Date | null): Promise<boolean> {
  if (isRefused(error)) return false;
  switch (type) {
    case 'warn':
      return false;
    case 'timeout': {
      const member = await fetchMember(guild, userId);
      return !!member && !!expiresAt && Math.abs((member.communicationDisabledUntilTimestamp ?? 0) - expiresAt.getTime()) < MINUTE;
    }
    case 'untimeout': {
      const member = await fetchMember(guild, userId);
      return !!member && !member.isCommunicationDisabled();
    }
    case 'kick':
      return (await fetchMember(guild, userId)) === null;
    case 'ban':
      return (await fetchBanned(guild, userId)) === true;
    case 'unban':
      return (await fetchBanned(guild, userId)) === false;
  }
}

/** The DM telling someone what happened to them on a server, in the server's language, as theirs isn't known. */
export function buildCaseDm(guild: Guild, modCase: ModCase, t: Translate): ResponsePayload {
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

/** What a moderator asked for, from a command or a popup of the moderation panel. */
export interface ModerationRequest {
  type: ModCaseType;
  user: User;
  reason: string | null;
  /** How long, as typed, which a timeout needs and a ban can have, for a temporary one. */
  duration?: string | null;
  /** How far back to delete their messages when banning them, in seconds. */
  deleteMessageSeconds?: number;
  /** Whether to tell them by DM. Sent before the action, as after a kick or ban they may not share a server with the bot anymore. */
  dm: boolean;
}

/** How a moderation action went, as said to who asked for it. */
export interface ModerationResult {
  ok: boolean;
  content: string;
}

type ModerationContext = Pick<ChatInputCommandInteraction<'cached'>, 'guild' | 'member' | 'user' | 'locale'>;

/** The checks a request needs before it can be done, and how it's done on Discord, or why it can't be done. */
async function prepareModeration(
  { guild, member: moderator }: ModerationContext,
  request: ModerationRequest,
  t: Translate,
): Promise<string | { expiresAt: Date | null; act: (auditReason: string) => Promise<unknown> }> {
  const { type, user } = request;
  const notAllowed = permissionProblem(moderator, MODERATOR_PERMISSIONS[type], t);
  if (notAllowed) return notAllowed;
  // Asked of Discord each time, as who's on the server and their roles may have changed since. If that can't be asked, nothing is done,
  // as it would skip the checks of their roles
  const member = await fetchMember(guild, user.id);
  if (member === undefined) return t('moderation.problems.memberUnknown');
  if (!member && type !== 'ban' && type !== 'unban') return t('moderation.problems.notMember');
  if (type === 'untimeout' && !member?.isCommunicationDisabled()) return t('moderation.problems.notTimedOut', { user: userSubject(user) });
  const problem = moderationProblem(guild, moderator, user, member, type, t);
  if (problem) return problem;

  let expiresAt: Date | null = null;
  if (type === 'timeout' || (type === 'ban' && request.duration)) {
    const parsed = parseModerationDuration(request.duration ?? '', type === 'timeout' ? MAX_TIMEOUT_DAYS : MAX_BAN_DAYS);
    if (parsed === 'invalid') return t('moderation.problems.duration');
    if (parsed === 'tooLong')
      return type === 'timeout' ? t('moderation.problems.timeoutTooLong', { max: MAX_TIMEOUT_DAYS }) : t('moderation.problems.banTooLong');
    expiresAt = parsed;
  }
  if (type === 'ban' || type === 'unban') {
    const banned = await fetchBanned(guild, user.id);
    if (banned === undefined) return t('moderation.problems.banUnknown');
    if (type === 'ban' && banned) return t('moderation.problems.alreadyBanned', { user: userSubject(user) });
    if (type === 'unban' && !banned) return t('moderation.problems.notBanned', { user: userSubject(user) });
  }

  const actions: Record<ModCaseType, (reason: string) => Promise<unknown>> = {
    warn: () => Promise.resolve(),
    timeout: (reason) => member!.disableCommunicationUntil(expiresAt, reason),
    untimeout: (reason) => member!.timeout(null, reason),
    kick: (reason) => member!.kick(reason),
    ban: (reason) => guild.members.ban(user.id, { reason, deleteMessageSeconds: request.deleteMessageSeconds ?? 0 }),
    unban: (reason) => guild.members.unban(user.id, reason),
  };
  return { expiresAt, act: actions[type] };
}

const queue = new KeyedQueue();

/**
 * Run an action on someone once the ones before it on them are done, so two at once, like a ban sent twice, don't both pass the checks
 * and make two cases and DMs. The second one is checked after the first, which finds them banned already.
 */
export const oneAtATime = <T>(guildId: string, userId: string, task: () => Promise<T>) => queue.run(`${guildId}:${userId}`, task);

/**
 * Do what a moderator asked for: make its case, DM them if wanted, do it on Discord, and say how it went. The case is made first, so the
 * logs find it, and it's taken back with the DM if the action fails. Only call it once the interaction is answered, as the checks ask Discord.
 */
export const moderate = (context: ModerationContext, request: ModerationRequest) =>
  oneAtATime(context.guild.id, request.user.id, () => moderateNow(context, request));

async function moderateNow(context: ModerationContext, request: ModerationRequest): Promise<ModerationResult> {
  const t = getTranslate(context.locale);
  const { guild } = context;
  const prepared = await prepareModeration(context, request, t);
  if (typeof prepared === 'string') return { ok: false, content: prepared };

  const { type, user, reason } = request;
  const modCase = await createCase({
    guildId: guild.id,
    type,
    userId: user.id,
    moderatorId: context.user.id,
    reason,
    expiresAt: prepared.expiresAt,
  });

  const wantsDm = request.dm && type !== 'unban';
  const dm = wantsDm ? await user.send(buildCaseDm(guild, modCase, getTranslate(guild.preferredLocale))).catch(() => null) : null;
  try {
    await prepared.act(auditReason(context.user, reason));
  } catch (error) {
    // Kept when it happened anyway, as the audit log skips what the bot does, so nothing else would make its case
    if (await happenedAnyway(error, guild, user.id, type, prepared.expiresAt)) {
      logger.warn(error, `Asking to ${type} ${user.id} in ${guild.id} failed, but it happened`);
    } else {
      logger.warn(error, `Failed to ${type} ${user.id} in ${guild.id}`);
      await Promise.all([undoCase(modCase), dm?.delete().catch(() => null)]);
      return { ok: false, content: t('moderation.failed') };
    }
  }

  const key = type === 'ban' && modCase.expiresAt ? 'banUntil' : type;
  const done = t(`moderation.done.${key}`, { user: userSubject(user), until: modCase.expiresAt ? formatUntil(modCase.expiresAt) : '' });
  const notes = [t('moderation.done.case', { number: caseNumber(modCase, t) })];
  if (wantsDm) notes.push(dm ? t('moderation.done.dmSent') : t('moderation.done.dmFailed'));
  return { ok: true, content: `${textIcon(CASE_ICONS[type])} ${done}\n${subtext(notes.join(' · '))}` };
}

/** Run a moderation command. Only who used it sees the answer, the logs are where others see it. */
export async function runModeration(interaction: ChatInputCommandInteraction<'cached'>, request: ModerationRequest): Promise<unknown> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const result = await moderate(interaction, request);
  return sendResponse(interaction, { ...createResponse(result.content, result.ok ? 'success' : 'error'), allowedMentions: { parse: [] } });
}
