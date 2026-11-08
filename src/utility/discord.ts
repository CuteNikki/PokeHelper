import { type Channel, type Client, DiscordAPIError, type Guild, type GuildMember, type PermissionsString, RESTJSONErrorCodes } from 'discord.js';

import type { Translate } from 'utility/i18next';

/** Whether an error is Discord answering with one of these codes, like UnknownMessage for a message that was deleted. */
export const isDiscordError = (error: unknown, ...codes: RESTJSONErrorCodes[]) =>
  error instanceof DiscordAPIError && codes.includes(error.code as RESTJSONErrorCodes);

/** Whether an error says a message is gone, deleted itself or with its channel. */
export const isMessageGone = (error: unknown) => isDiscordError(error, RESTJSONErrorCodes.UnknownMessage, RESTJSONErrorCodes.UnknownChannel);

/** Whether Discord answered no, unlike when it didn't answer in time or had a problem itself, after which a request may have worked anyway. */
export const isRefused = (error: unknown) => error instanceof DiscordAPIError && error.status < 500;

/** A member fetched from Discord even when cached, for when it has to be right. Null if not on the server, undefined if Discord couldn't be asked. */
export async function fetchMember(guild: Guild, userId: string): Promise<GuildMember | null | undefined> {
  try {
    return await guild.members.fetch({ user: userId, force: true });
  } catch (error) {
    return isDiscordError(error, RESTJSONErrorCodes.UnknownMember, RESTJSONErrorCodes.UnknownUser) ? null : undefined;
  }
}

/** Someone as a member of a server, from the cache or else Discord, or null if they're not on it or Discord couldn't be asked. */
export const findMember = (guild: Guild, userId: string): Promise<GuildMember | null> => guild.members.fetch(userId).catch(() => null);

/** A channel from the cache or else Discord, as threads aren't always cached. Null if gone, undefined if Discord couldn't be asked or refused. */
export async function fetchChannel(client: Client, channelId: string): Promise<Channel | null | undefined> {
  const cached = client.channels.cache.get(channelId);
  if (cached) return cached;
  try {
    return await client.channels.fetch(channelId);
  } catch (error) {
    return isDiscordError(error, RESTJSONErrorCodes.UnknownChannel) ? null : undefined;
  }
}

/** Permissions by their names in a language, in a line, like `View Channel, Send Messages`. */
export const formatPermissions = (permissions: PermissionsString[], t: Translate) => permissions.map((permission) => t(`permission.${permission}`)).join(', ');
