import {
  ActionRowBuilder,
  type AttachmentBuilder,
  bold,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  type Guild,
  type GuildMember,
  heading,
  HeadingLevel,
  MessageFlags,
  type PermissionsString,
  SectionBuilder,
  type SendableChannels,
  SeparatorBuilder,
  SeparatorSpacingSize,
  subtext,
  TextDisplayBuilder,
  ThumbnailBuilder,
  time,
  TimestampStyles,
  type User,
} from 'discord.js';

import { getGuildLogs, type GuildLogs } from 'database/logs';

import { MINUTE } from 'utility/duration';
import { guildTranslate, type Translate } from 'utility/i18next';
import { logger } from 'utility/logger';
import type { Doer } from 'utility/logs/audit';
import { copyIdsButton, type LogIds } from 'utility/logs/copyIds';
import { CHANNEL_FIELDS, LOG_GROUPS, logChannelOf, type LogEvent } from 'utility/logs/events';
import { userSubject } from 'utility/logs/format';
import { missingBotPermissions } from 'utility/settings';
import { quote, shorten } from 'utility/text';
import { ThemeColors } from 'utility/theme';

/** What the bot needs in a log channel. */
export const LOG_CHANNEL_PERMISSIONS: PermissionsString[] = ['ViewChannel', 'SendMessages', 'AttachFiles'];

/** How long a server's log settings are kept, so not every message edit reads them. Saving them forgets them right away. */
const CACHE_TTL = MINUTE;
/** The most of a text shown, so long messages leave room for the rest of the entry. */
const MAX_TEXT = 1_500;
/** Discord fits 4000 characters of text in a message made of components, some are left for the buttons and the like. */
const MAX_ENTRY_TEXT = 3_800;

const cache = new Map<string, { config: GuildLogs | null; at: number }>();

async function getLogConfig(guildId: string): Promise<GuildLogs | null> {
  const cached = cache.get(guildId);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.config;
  const config = await getGuildLogs(guildId);
  cache.set(guildId, { config, at: Date.now() });
  return config;
}

/** Forget a server's log settings, after they changed. */
export const forgetLogConfig = (guildId: string) => cache.delete(guildId);

/** What kind of change an entry is about, which decides its color: added in green, removed in red, changed in blue. */
export type LogKind = 'created' | 'deleted' | 'updated';
const KIND_COLORS: Record<LogKind, number> = {
  created: ThemeColors.success,
  deleted: ThemeColors.error,
  updated: ThemeColors.info,
};

/** What an entry can be about. */
export type LogSubject = 'user' | 'channel' | 'thread' | 'role' | 'emoji' | 'sticker' | 'invite' | 'server' | 'giveaway';

/** One log entry. Everything in it is already in the server's language. */
export interface LogEntry {
  kind: LogKind;
  /** Like `Message edited ✏️`, the title at the top. */
  label: string;
  /** Where it happened, like a channel, or where from and to, like a move between voice channels. */
  where?: string | { from: string; to: string } | null;
  /** What the subject is, said in front of it like In and By, so a bare name like an invite code isn't left without context. */
  about: LogSubject;
  /** Who or what it's about, like a member's name, under the title. */
  subject: string;
  /** A picture of who or what it's about, like the member's avatar, on the right. */
  thumbnail?: string | null;
  /** Who did it, from the audit log, next to where it happened. */
  by?: Doer | null;
  /** The details, each its own part, like the message's text, or what changed. Empty ones are left out. */
  details?: (string | null)[];
  /** The IDs the Copy IDs button shows, by what they are. */
  ids: LogIds;
  /** A button to where it happened, like the edited message. */
  link?: { label: string; url: string };
  files?: AttachmentBuilder[];
}

/** The most lines of a text shown, so a message of many short lines doesn't take over the log. */
export const MAX_QUOTE_LINES = 15;

/** A text as a quote, so it stands apart from the entry's own text, cut short if it's long or has many lines. */
export function quoteText(text: string) {
  const lines = shorten(text, MAX_TEXT).split('\n');
  return quote((lines.length > MAX_QUOTE_LINES ? [...lines.slice(0, MAX_QUOTE_LINES), '…'] : lines).join('\n'));
}

/** An entry as a card: the title, who or what it's about with their picture, where and by whom, when, then the details and buttons. */
function buildLogEntry(entry: LogEntry, t: Translate, doer?: User | null) {
  const header = new TextDisplayBuilder().setContent(
    [
      heading(entry.label, HeadingLevel.Three),
      `${bold(t(`logs.about.${entry.about}`))} ${entry.subject}`,
      typeof entry.where === 'string' ? `${bold(t('logs.in'))} ${entry.where}` : null,
      entry.where && typeof entry.where === 'object' ? `${bold(t('logs.from'))} ${entry.where.from}\n${bold(t('logs.to'))} ${entry.where.to}` : null,
      entry.by ? `${bold(t('logs.byLabel'))} ${userSubject(doer, entry.by.id)}` : null,
      // When it happened, as Discord only shows the time of the first of several messages in a row
      subtext(time(new Date(), TimestampStyles.LongDateTime)),
    ]
      .filter(Boolean)
      .join('\n'),
  );
  const space = () => new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small);

  const container = new ContainerBuilder().setAccentColor(KIND_COLORS[entry.kind]);
  if (entry.thumbnail) {
    container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(header).setThumbnailAccessory(new ThumbnailBuilder().setURL(entry.thumbnail)));
  } else {
    container.addTextDisplayComponents(header);
  }

  const details = fitDetails(
    (entry.details ?? []).filter((detail): detail is string => Boolean(detail)),
    MAX_ENTRY_TEXT - header.data.content!.length,
  );
  if (details) container.addSeparatorComponents(space()).addTextDisplayComponents(new TextDisplayBuilder().setContent(details));

  const buttons = [
    entry.link ? new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(entry.link.label).setURL(entry.link.url) : null,
    copyIdsButton(entry.by ? { ...entry.ids, by: entry.by.id } : entry.ids, t),
  ].filter((button): button is ButtonBuilder => button !== null);
  if (buttons.length > 0) {
    container.addSeparatorComponents(space()).addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));
  }

  // Logs mention people and roles to say who it was, but never ping them
  return { components: [container], flags: [MessageFlags.IsComponentsV2] as const, allowedMentions: { parse: [] } };
}

/**
 * The details, as many of their parts as fit the room, the last one cut short if it has to. The entry's own code keeps them short,
 * this is for whatever slips through, as Discord refuses an entry with too much text and it would be lost.
 */
export function fitDetails(parts: string[], room: number): string | null {
  const kept: string[] = [];
  for (const part of parts) {
    const used = kept.join('\n\n').length + (kept.length > 0 ? 2 : 0);
    if (used + part.length <= room) {
      kept.push(part);
      continue;
    }
    if (room - used > 100) kept.push(`${part.slice(0, room - used - 1)}…`);
    break;
  }
  return kept.length > 0 ? kept.join('\n\n') : null;
}

/**
 * Post an entry, and its files as a reply of their own. On a message made of components, a file only shows as a download card,
 * while on a plain message Discord shows a preview of a text file, so it can be read right there.
 */
export async function postLogEntry(channel: SendableChannels, entry: LogEntry, t: Translate, doer?: User | null) {
  const message = await channel.send(buildLogEntry(entry, t, doer));
  if (!entry.files?.length) return;
  // Replying takes Read Message History, which a log channel doesn't need otherwise, so without it they're sent right after instead
  const canReply = !('permissionsFor' in channel) || channel.permissionsFor(channel.client.user)?.has('ReadMessageHistory');
  const files = { files: entry.files, allowedMentions: { parse: [], repliedUser: false } };
  await (canReply ? message.reply(files) : channel.send(files));
}

/** Whether a channel is one of the server's log channels, whose own messages aren't logged. */
export const isLogChannel = (config: GuildLogs, channelId: string) =>
  config.defaultChannelId === channelId || LOG_GROUPS.some((group) => config[CHANNEL_FIELDS[group]] === channelId);

/** Whether things in a channel aren't logged: it, its category, or the channel of its thread is ignored, or it's a log channel. */
export function isIgnoredChannel(config: GuildLogs, guild: Guild, channelId: string | null): boolean {
  if (!channelId) return false;
  if (isLogChannel(config, channelId)) return true;
  const channel = guild.channels.cache.get(channelId);
  const parent = channel?.isThread() ? guild.channels.cache.get(channel.parentId ?? '') : channel;
  return [channelId, parent?.id, parent?.parentId].some((id) => id && config.ignoredChannelIds.includes(id));
}

/** Whether a member's messages aren't logged, as they have an ignored role. */
export const isIgnoredMember = (config: GuildLogs, member: GuildMember | null) =>
  member !== null && config.ignoredRoleIds.some((roleId) => member.roles.cache.has(roleId));

/** A server's log settings if an event is logged there, or null, to check before the work of describing it. */
export async function shouldLog(guild: Guild, event: LogEvent): Promise<GuildLogs | null> {
  const config = await getLogConfig(guild.id);
  return config && logChannelOf(config, event) ? config : null;
}

/**
 * Post a log entry in the channel of its event, if it's logged. Never throws: a log that can't be posted, like when the channel is gone
 * or the bot lost its permissions there, is only noted in the bot's own log.
 */
export async function sendLog(guild: Guild, event: LogEvent, entry: LogEntry | ((t: Translate) => LogEntry | null | Promise<LogEntry | null>)) {
  try {
    const config = await getLogConfig(guild.id);
    const channelId = config && logChannelOf(config, event);
    if (!channelId) return;
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isSendable()) return;
    if (missingBotPermissions(guild, channelId, LOG_CHANNEL_PERMISSIONS).length > 0) return;

    const t = guildTranslate(guild);
    const built = typeof entry === 'function' ? await entry(t) : entry;
    if (!built) return;
    const doer = built.by ? await guild.client.users.fetch(built.by.id).catch(() => null) : null;
    await postLogEntry(channel, built, t, doer);
  } catch (error) {
    logger.warn(error, `Failed to log ${event} in guild ${guild.id}`);
  }
}
