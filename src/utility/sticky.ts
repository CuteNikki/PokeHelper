import { type Client, ContainerBuilder, type GuildTextBasedChannel, type Message, MessageFlags, RESTJSONErrorCodes, TextDisplayBuilder } from 'discord.js';

import { getFeatureSwitches, setFeatureSwitch } from 'database/features';
import { deleteSticky, getGuildStickies, getSticky, getStickyChannelIds, setStickyMessageId } from 'database/sticky';

import { fetchChannel, isDiscordError } from 'utility/discord';
import { SECOND } from 'utility/duration';
import { guildTranslate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { markBotDelete } from 'utility/logs/botDeletes';
import { KeyedQueue } from 'utility/queue';
import type { ResponsePayload } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/** The custom ID of the popup a sticky message is written in, followed by its channel's ID. */
export const STICKY_MODAL_PREFIX = 'sticky:';
/** The custom ID of the popup's text field. */
export const STICKY_TEXT_INPUT_ID = 'text';
/** The most characters a sticky message can have, leaving room for its label. */
export const MAX_STICKY_LENGTH = 2000;

/** How long a channel has to be quiet before its sticky message is posted again, so a conversation doesn't move it with every message. */
export const QUIET_DELAY = 10 * SECOND;
/** The longest it waits in a channel that never gets quiet, so it doesn't stay up in the chat for long. */
export const MAX_DELAY = 30 * SECOND;

/** The channels with a sticky message, so other channels' messages don't ask the database. A channel that's in it by mistake only costs a lookup. */
const stickyChannels = new Set<string>();
/** The reposts waiting for their channel to be quiet, and when the first message they wait for came. */
const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; since: number }>();
/** Posting, changing and removing run one at a time per channel, so a repost can't bring back a sticky message that was just removed. */
const queue = new KeyedQueue();

/** Run something on a channel's sticky message, after what's already running on it. */
export const runStickyTask = <T>(channelId: string, task: () => Promise<T>) => queue.run(channelId, task);

export const hasSticky = (channelId: string) => stickyChannels.has(channelId);

/** Note that a channel has a sticky message now, like after it was set. */
export const addStickyChannel = (channelId: string) => stickyChannels.add(channelId);

/** Forget a channel's sticky message, and its repost if one is waiting. */
export function forgetStickyChannel(channelId: string) {
  stickyChannels.delete(channelId);
  const waiting = pending.get(channelId);
  if (waiting) clearTimeout(waiting.timer);
  pending.delete(channelId);
}

/** A sticky message as it's posted: a small label above its text. Nobody is pinged by it, as it's posted again and again. */
export const buildStickyMessage = (text: string, label: string): ResponsePayload => ({
  components: [new ContainerBuilder().setAccentColor(ThemeColors.info).addTextDisplayComponents(new TextDisplayBuilder().setContent(`${label}\n${text}`))],
  flags: [MessageFlags.IsComponentsV2],
  allowedMentions: { parse: [] },
});

/** The channel of a sticky message, or null if it can't be posted in or is gone, in which case its sticky message is removed. */
async function stickyChannel(client: Client, channelId: string): Promise<GuildTextBasedChannel | null> {
  const channel = await fetchChannel(client, channelId);
  if (channel === null) {
    await removeSticky(channelId);
    return null;
  }
  if (!channel?.isTextBased() || channel.isDMBased()) return null;
  return channel;
}

/** Delete a post of a sticky message, leaving it out of the logs. One that's already gone is fine. */
async function deletePost(channel: GuildTextBasedChannel, messageId: string) {
  markBotDelete(messageId);
  await channel.messages.delete(messageId).catch((error: unknown) => {
    if (!isDiscordError(error, RESTJSONErrorCodes.UnknownMessage))
      logger.warn(error, `Failed to delete the old sticky message ${messageId} in channel ${channel.id}`);
  });
}

/**
 * Put a channel's sticky message at the bottom by reposting it, unless it's still the last message (then `changed` only edits its text).
 * Runs in the channel's queue. Returns false if it couldn't be posted, like without permission or with sticky messages turned off.
 */
async function postSticky(client: Client, channelId: string, changed: boolean): Promise<boolean> {
  const sticky = await getSticky(channelId);
  if (!sticky) {
    forgetStickyChannel(channelId);
    return false;
  }
  if (!(await getFeatureSwitches(sticky.guildId)).stickiesEnabled) return false;
  const channel = await stickyChannel(client, channelId);
  if (!channel) return false;
  const payload = buildStickyMessage(sticky.text, guildTranslate(channel.guild)('sticky.label'));

  if (sticky.messageId && channel.lastMessageId === sticky.messageId) {
    if (!changed) return true;
    // Its post is still at the bottom, so it only needs the new text. If it was deleted meanwhile, it's posted again below
    const edited = await channel.messages.edit(sticky.messageId, payload).catch(() => null);
    if (edited) return true;
  }

  let post: Message;
  try {
    post = await channel.send(payload);
  } catch (error) {
    if (isDiscordError(error, RESTJSONErrorCodes.UnknownChannel)) await removeSticky(channelId);
    else logger.warn(error, `Failed to post the sticky message in channel ${channelId} of guild ${sticky.guildId}`);
    return false;
  }

  // Removed while it was being posted, by deleting its channel or server
  if (!(await setStickyMessageId(channelId, post.id))) {
    await deletePost(channel, post.id);
    return false;
  }
  if (sticky.messageId) await deletePost(channel, sticky.messageId);
  return true;
}

/** Put a channel's sticky message at the bottom now, like after it was set. Waits for what's already running on it. */
export const postStickyNow = (client: Client, channelId: string, changed: boolean) => runStickyTask(channelId, () => postSticky(client, channelId, changed));

/**
 * A message came in a channel with a sticky message: repost it once the channel is quiet, or after MAX_DELAY at the latest.
 * The sticky's own post comes in here too, and is left alone as it's still the last message.
 */
export function scheduleRepost(client: Client, channelId: string) {
  const now = Date.now();
  const waiting = pending.get(channelId);
  if (waiting) clearTimeout(waiting.timer);
  const since = waiting?.since ?? now;

  const timer = setTimeout(
    () => {
      pending.delete(channelId);
      void postStickyNow(client, channelId, false).catch((error: unknown) =>
        logger.error(error, `Failed to repost the sticky message in channel ${channelId}`),
      );
    },
    Math.min(QUIET_DELAY, since + MAX_DELAY - now),
  );
  pending.set(channelId, { timer, since });
}

/** Remove a channel's sticky message and delete its post. Returns whether there was one. */
export async function removeSticky(channelId: string, channel?: GuildTextBasedChannel): Promise<boolean> {
  forgetStickyChannel(channelId);
  const sticky = await deleteSticky(channelId);
  if (sticky?.messageId && channel) await deletePost(channel, sticky.messageId);
  return Boolean(sticky);
}

/** Take a sticky message's post out of its channel, keeping the sticky message to post again later. Runs in the channel's queue. */
async function takeDownSticky(client: Client, channelId: string) {
  const sticky = await getSticky(channelId);
  if (!sticky?.messageId) return;
  const channel = await stickyChannel(client, channelId);
  if (channel) await deletePost(channel, sticky.messageId);
  await setStickyMessageId(channelId, null);
}

/** Turn all of a server's sticky messages on or off. Turned off, their posts are taken down but the stickies are kept. */
export async function setStickiesEnabled(client: Client, guildId: string, enabled: boolean) {
  await setFeatureSwitch(guildId, 'stickiesEnabled', enabled);
  const stickies = await getGuildStickies(guildId);
  await Promise.all(
    stickies.map((sticky) =>
      runStickyTask<unknown>(sticky.channelId, () => (enabled ? postSticky(client, sticky.channelId, false) : takeDownSticky(client, sticky.channelId))).catch(
        (error: unknown) => logger.error(error, `Failed to turn the sticky message in channel ${sticky.channelId} ${enabled ? 'on' : 'off'}`),
      ),
    ),
  );
}

/** Load the channels with a sticky message, and move the ones that messages came in above while the bot was offline back down. */
export async function loadStickies(client: Client) {
  const channelIds = await getStickyChannelIds();
  for (const channelId of channelIds) stickyChannels.add(channelId);
  for (const channelId of channelIds) {
    const channel = client.channels.cache.get(channelId);
    // Others, like threads that aren't cached, are moved with the next message in them
    if (channel?.isTextBased() && channel.lastMessageId) scheduleRepost(client, channelId);
  }
}
