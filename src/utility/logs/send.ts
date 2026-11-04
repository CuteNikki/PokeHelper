import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
  time,
  TimestampStyles,
  userMention,
  type AttachmentBuilder,
  type Guild,
  type GuildMember,
  type PermissionsString,
} from 'discord.js';

import { getGuildLogs, type GuildLogs } from 'database/logs';

import { getTranslate, type Translate } from 'utility/i18next';
import { logger } from 'utility/logger';
import type { Doer } from 'utility/logs/audit';
import { copyIdsButton, type LogIds } from 'utility/logs/copyIds';
import { CHANNEL_FIELDS, LOG_GROUPS, logChannelOf, type LogEvent } from 'utility/logs/events';
import { missingBotPermissions } from 'utility/settings';
import { ThemeColors } from 'utility/theme';

/** What the bot needs in a log channel. */
export const LOG_CHANNEL_PERMISSIONS: PermissionsString[] = ['ViewChannel', 'SendMessages', 'AttachFiles'];

/** How long a server's log settings are kept, so not every message edit reads them. Saving them forgets them right away. */
const CACHE_TTL = 60_000;
/** The most of a text shown, so long messages leave room for the rest of the entry. */
const MAX_TEXT = 1_500;

const cache = new Map<string, { config: GuildLogs | null; at: number }>();

/** A server's log settings, or null if it never set them up. */
export async function getLogConfig(guildId: string): Promise<GuildLogs | null> {
  const cached = cache.get(guildId);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.config;
  const config = await getGuildLogs(guildId);
  cache.set(guildId, { config, at: Date.now() });
  return config;
}

/** Forget a server's log settings, after they changed. */
export const forgetLogConfig = (guildId: string) => cache.delete(guildId);

/** The language of a server's logs, which its staff read. */
export const logTranslate = (guild: Guild): Translate => getTranslate(guild.preferredLocale);

/** What kind of change an entry is about, which decides its color: added in green, removed in red, changed in blue. */
export type LogKind = 'created' | 'deleted' | 'updated';
const KIND_COLORS: Record<LogKind, number> = {
  created: ThemeColors.success,
  deleted: ThemeColors.error,
  updated: ThemeColors.info,
};

/** One log entry. Everything in it is already in the server's language. */
export interface LogEntry {
  kind: LogKind;
  /** Like `Message edited ✏️`, the title at the top. */
  label: string;
  /** Where it happened, after the label, like a channel. */
  where?: string | null;
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

/** Shorten a text so the entry has room for the rest, ending in … when it was cut. */
export const shorten = (text: string, max = MAX_TEXT) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** A text as a quote, so it stands apart from the entry's own text. */
export const quoteText = (text: string) =>
  shorten(text)
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

/**
 * An entry as a card: a title like the bot's other messages, who or what it's about, where and by whom, with their picture next to it,
 * then the details under a line, when it happened, and the buttons.
 */
export function buildLogEntry(entry: LogEntry, t: Translate) {
  const context = [entry.where ? `**${t('logs.in')}** ${entry.where}` : null, entry.by ? `**${t('logs.byLabel')}** ${userMention(entry.by.id)}` : null].filter(
    Boolean,
  );
  const header = new TextDisplayBuilder().setContent(
    [`### ${entry.label}`, entry.subject, context.length > 0 ? context.join('  ·  ') : null].filter(Boolean).join('\n'),
  );

  const container = new ContainerBuilder().setAccentColor(KIND_COLORS[entry.kind]);
  if (entry.thumbnail) {
    container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(header).setThumbnailAccessory(new ThumbnailBuilder().setURL(entry.thumbnail)));
  } else {
    container.addTextDisplayComponents(header);
  }

  const details = (entry.details ?? []).filter((detail): detail is string => Boolean(detail));
  if (details.length > 0) {
    container.addSeparatorComponents(new SeparatorBuilder()).addTextDisplayComponents(new TextDisplayBuilder().setContent(details.join('\n\n')));
  }
  // When it happened, in small print, as Discord only shows the time of the first of several messages in a row
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${time(new Date(), TimestampStyles.LongDateTime)}`));

  const buttons = [
    entry.link ? new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(entry.link.label).setURL(entry.link.url) : null,
    copyIdsButton(entry.ids, t),
  ].filter((button): button is ButtonBuilder => button !== null);
  if (buttons.length > 0) {
    // A little room above the buttons, without another line
    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));
  }

  // Logs mention people and roles to say who it was, but never ping them
  return { components: [container], files: entry.files ?? [], flags: [MessageFlags.IsComponentsV2] as const, allowedMentions: { parse: [] } };
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

/**
 * Whether an event is logged in a server, before the work of describing it is done.
 * @returns The server's settings if it's logged, or null.
 */
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

    const t = logTranslate(guild);
    const built = typeof entry === 'function' ? await entry(t) : entry;
    if (built) await channel.send(buildLogEntry(built, t));
  } catch (error) {
    logger.warn(error, `Failed to log ${event} in guild ${guild.id}`);
  }
}
