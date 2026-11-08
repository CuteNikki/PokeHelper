import type { GuildLogs } from 'database/logs';

/** The groups logs are sorted into. Each goes to its own channel, which can be the same for several. */
export const LOG_GROUPS = ['messages', 'members', 'moderation', 'server', 'voice', 'giveaways'] as const;
export type LogGroup = (typeof LOG_GROUPS)[number];

/** Every event that can be logged, by group, in the order they're shown in the settings. */
export const LOG_EVENTS = {
  messages: ['messageEdited', 'messageDeleted', 'messagesBulkDeleted'],
  members: ['memberJoined', 'memberLeft', 'memberNickname', 'memberRoles', 'memberProfile'],
  moderation: ['memberBanned', 'memberUnbanned', 'memberKicked', 'memberTimedOut'],
  server: ['channels', 'roles', 'server', 'emojis', 'threads', 'invites'],
  voice: ['voiceJoined', 'voiceLeft', 'voiceMoved'],
  giveaways: ['giveawayStarted', 'giveawayEnded', 'giveawayRerolled', 'giveawayCancelled', 'giveawayDeleted', 'giveawayRulesChanged'],
} as const satisfies Record<LogGroup, readonly string[]>;

export type LogEvent = (typeof LOG_EVENTS)[LogGroup][number];

/** The group an event is in. */
export const groupOf = (event: LogEvent): LogGroup => LOG_GROUPS.find((group) => (LOG_EVENTS[group] as readonly string[]).includes(event))!;

/** The setting that keeps a group's channel. */
export const CHANNEL_FIELDS = {
  messages: 'messagesChannelId',
  members: 'membersChannelId',
  moderation: 'moderationChannelId',
  server: 'serverChannelId',
  voice: 'voiceChannelId',
  giveaways: 'giveawaysChannelId',
} as const satisfies Record<LogGroup, keyof GuildLogs>;

/** Where a group is logged: its own channel, or the default one. Null if there's neither. */
export const groupChannelOf = (config: GuildLogs, group: LogGroup): string | null => config[CHANNEL_FIELDS[group]] ?? config.defaultChannelId;

/** The channel an event is logged in, or null if it isn't logged: logs are off, its group has no channel and there's no default, or it's off. */
export function logChannelOf(config: GuildLogs, event: LogEvent): string | null {
  if (!config.enabled || config.disabledEvents.includes(event)) return null;
  return groupChannelOf(config, groupOf(event));
}
