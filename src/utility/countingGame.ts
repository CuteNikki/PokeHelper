import {
  DiscordAPIError,
  RESTJSONErrorCodes,
  SnowflakeUtil,
  userMention,
  type Client,
  type GuildTextBasedChannel,
  type Message,
  type PartialMessage,
} from 'discord.js';
import { t } from 'i18next';

import { getAllCountings, getCounting, saveCountingProgress, updateCounting } from 'database/counting';

import type { GuildCounting } from 'generated/prisma/client';
import {
  formatLives,
  isAtOrBefore,
  isMilestone,
  processCount,
  replayCounts,
  toCountingState,
  type CountingEvent,
  type CountingState,
  type CountMessage,
} from 'utility/counting';
import { parseCount } from 'utility/countingParse';
import { logger } from 'utility/logger';
import { KeyedQueue } from 'utility/queue';
import { createResponse, logFailure } from 'utility/response';

/** Most messages checked when catching up after downtime, after which the rest is skipped. */
const SYNC_MESSAGE_LIMIT = 1000;
/** How long warnings stay before they're deleted along with the invalid message, in milliseconds. */
const WARNING_DURATION = 3_000;
/** How long the message about a lost life stays, in milliseconds. */
const LIFE_LOST_DURATION = 6_000;

/** Everything that reads or changes a guild's counting game runs through here, one task at a time per guild. */
const queue = new KeyedQueue();
/** Guilds whose counting channel was caught up since the bot last connected. */
const syncedGuilds = new Set<string>();

/**
 * Run a task that reads or changes a guild's counting game, after the ones already queued for that guild.
 * Changes to the configuration should go through here too, so they can't interleave with a message being checked.
 */
export const runCountingTask = <T>(guildId: string, task: () => Promise<T>) => queue.run(guildId, task);

const toCountMessage = (message: Message): CountMessage => ({
  id: message.id,
  content: message.content,
  authorId: message.author.id,
  createdAt: message.createdAt,
});

/** Delete a message, ignoring that it's already gone. */
const deleteMessage = (message: Message) =>
  message.delete().catch((error: unknown) => {
    if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMessage) return;
    logger.error(error, `Failed to delete counting message ${message.id}`);
  });

/**
 * Check a message sent in a counting channel. Must run inside {@link runCountingTask}.
 */
export async function handleCountingMessage(client: Client, message: Message<true>) {
  let counting = await getCounting(message.guildId);
  if (!counting || counting.channelId !== message.channelId) return;

  counting = await ensureCountingSynced(client, counting);
  // Catching up may have checked this message already, if it was sent before the catch-up fetched the channel
  if (counting.lastCheckedMessageId && isAtOrBefore(message.id, counting.lastCheckedMessageId)) return;

  const processed = processCount(toCountingState(counting), counting, toCountMessage(message));
  if (!(await saveProgress(counting, processed.state, processed.events))) return;

  if (processed.outcome === 'valid') {
    if (counting.milestoneReactions && isMilestone(processed.state.lastNumber)) {
      await message.react('🎉').catch(logFailure('Failed to react to counting milestone'));
    }
    if (processed.lifeGained) {
      await message.react('❤️').catch(logFailure('Failed to react to regenerated counting life'));
    }
    return;
  }

  if (processed.outcome === 'reset') {
    // With more than one life, say that they ran out, as the count didn't reset on the first mistake
    const content =
      counting.maxLives !== null && counting.maxLives > 1
        ? t('counting.outOfLives', { number: counting.lastNumber, lives: formatLives(counting.maxLives, counting.maxLives) })
        : t('counting.reset', { number: counting.lastNumber });
    await message
      .reply({ ...createResponse(content, 'error'), allowedMentions: { repliedUser: false } })
      .catch(logFailure('Failed to send counting reset message'));
    return;
  }

  let content: string;
  if (processed.outcome === 'lifeLost' && counting.maxLives !== null) {
    const livesLeft = processed.state.livesLeft;
    content = t('counting.lifeLost', { number: counting.lastNumber, lives: formatLives(livesLeft, counting.maxLives), count: livesLeft });
  } else if (processed.check?.result === 'consecutive') {
    content = t('counting.noConsecutive');
  } else {
    content = t('counting.wrongNumber', { number: counting.lastNumber });
  }

  const warning = await message
    .reply({ ...createResponse(content, 'error'), allowedMentions: { repliedUser: false } })
    .catch(logFailure('Failed to send counting warning'));

  // Losing a life is worth reading, so it stays a bit longer
  setTimeout(
    () => {
      void deleteMessage(message);
      if (warning) void deleteMessage(warning);
    },
    processed.outcome === 'lifeLost' ? LIFE_LOST_DURATION : WARNING_DURATION,
  );
}

async function saveProgress(counting: GuildCounting, state: CountingState, events: CountingEvent[]) {
  // Everything for a guild runs through the queue, so this only fails if something bypassed it
  const saved = await saveCountingProgress(counting.guildId, counting.lastCheckedMessageId, state, events);
  if (!saved) logger.warn(`Counting state for guild ${counting.guildId} changed while a message was checked, the check was not saved`);
  return saved;
}

/**
 * Forget which guilds were caught up and catch up all of them, for when the bot (re)connects and may have missed messages.
 */
export async function syncAllCountings(client: Client) {
  syncedGuilds.clear();

  const countings = await getAllCountings();
  await Promise.all(
    countings
      .filter((counting) => client.guilds.cache.has(counting.guildId))
      .map((counting) =>
        runCountingTask(counting.guildId, async () => {
          // Read again inside the queue, the configuration may have changed while waiting
          const current = await getCounting(counting.guildId);
          if (current) await ensureCountingSynced(client, current);
        }).catch(logFailure(`Failed to catch up on counting in guild ${counting.guildId}`)),
      ),
  );
}

/**
 * Catch up on the guild's counting channel if that hasn't happened since the bot connected. Must run inside {@link runCountingTask}.
 * @returns The counting configuration after catching up.
 */
async function ensureCountingSynced(client: Client, counting: GuildCounting): Promise<GuildCounting> {
  if (syncedGuilds.has(counting.guildId)) return counting;
  // Marked before trying, so a channel that can't be read doesn't get retried with every message
  syncedGuilds.add(counting.guildId);

  try {
    return await syncCounting(client, counting);
  } catch (error) {
    logger.error(error, `Failed to catch up on counting in guild ${counting.guildId}`);
    // Part of it may have been saved, so continue from what's in the database
    return (await getCounting(counting.guildId)) ?? counting;
  }
}

/**
 * Check the messages sent in the counting channel after the last checked one, in order, with the same rules as live counting.
 * Valid numbers count, invalid messages are deleted and a single summary is posted instead of a warning for each.
 */
async function syncCounting(client: Client, counting: GuildCounting): Promise<GuildCounting> {
  const channel = await client.channels.fetch(counting.channelId).catch(() => null);
  if (!channel?.isTextBased() || channel.isDMBased()) return counting;

  // Games from before this was tracked fall back to the last counted message, or to when the game last changed
  const startAfter = counting.lastCheckedMessageId ?? counting.lastNumberMessageId ?? SnowflakeUtil.generate({ timestamp: counting.updatedAt }).toString();

  // Fetch everything sent since, oldest first
  const messages: Message[] = [];
  let after = startAfter;
  while (messages.length < SYNC_MESSAGE_LIMIT) {
    const batch = await channel.messages.fetch({ after, limit: 100, cache: false });
    // Discord returns them newest first
    messages.push(...[...batch.values()].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1)));
    if (batch.size < 100) break;
    after = messages.at(-1)!.id;
  }
  if (messages.length === 0) return counting;

  const replay = replayCounts(
    toCountingState(counting),
    counting,
    messages.map((message) => ({ ...toCountMessage(message), isBot: message.author.bot })),
  );
  const { counted, resets } = replay;
  let { state } = replay;
  const invalid = messages.filter((message) => replay.invalidIds.includes(message.id));

  if (messages.length >= SYNC_MESSAGE_LIMIT) {
    // Skip what's left, so live counting continues from now instead of from somewhere in the backlog
    logger.warn(`Counting in guild ${counting.guildId} had more than ${SYNC_MESSAGE_LIMIT} messages to catch up on, the rest were skipped`);
    state = { ...state, lastCheckedMessageId: SnowflakeUtil.generate().toString() };
  }

  // Without the state saved, nothing was really caught up, so leave the messages alone and continue from what's saved
  if (!(await saveProgress(counting, state, replay.events))) return (await getCounting(counting.guildId)) ?? counting;
  await deleteMessages(channel, invalid);

  if (invalid.length > 0 || resets.length > 0) {
    const lines = [
      t('counting.sync.title'),
      t('counting.sync.description'),
      '',
      ...(counted > 0 ? [t('counting.sync.counted', { count: counted })] : []),
      ...(invalid.length > 0 ? [t('counting.sync.removed', { count: invalid.length })] : []),
      ...(replay.livesLost > 0 ? [t('counting.sync.livesLost', { count: replay.livesLost })] : []),
      ...(replay.livesGained > 0 ? [t('counting.sync.livesGained', { count: replay.livesGained })] : []),
      ...resets.map((reset) => t('counting.sync.reset', { number: reset.number, user: userMention(reset.userId) })),
      t('counting.sync.next', { number: state.lastNumber + 1 }),
      ...(counting.maxLives !== null && counting.maxLives > 1 ? [t('counting.sync.lives', { lives: formatLives(state.livesLeft, counting.maxLives) })] : []),
    ];
    await channel
      .send({ ...createResponse(lines.join('\n'), 'warning'), allowedMentions: { parse: [] } })
      .catch(logFailure(`Failed to send counting catch-up summary in guild ${counting.guildId}`));
  }

  logger.info(
    `Caught up on counting in guild ${counting.guildId}: ${messages.length} checked, ${counted} counted, ${invalid.length} removed, ${resets.length} resets`,
  );
  return { ...counting, ...state };
}

/** Delete messages, in bulk where Discord allows it, which is for messages up to 14 days old. */
async function deleteMessages(channel: GuildTextBasedChannel, messages: Message[]) {
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const deleted = await channel.bulkDelete(chunk, true).catch(logFailure('Failed to bulk delete counting messages'));
    const remaining = chunk.filter((message) => !deleted?.has(message.id));
    for (const message of remaining) await deleteMessage(message);
  }
}

/**
 * Repost the last number if its message was deleted, or edited so it no longer shows that number, so everyone still knows where the count is.
 * Must run inside {@link runCountingTask}.
 * @param message The deleted or edited message.
 * @param edited Whether the message was edited rather than deleted.
 */
export async function handleChangedCount(message: Message | PartialMessage, edited: boolean) {
  if (!message.guildId) return;

  const counting = await getCounting(message.guildId);
  if (!counting || counting.lastNumberMessageId !== message.id || !counting.lastNumberByUserId) return;

  if (edited) {
    const current = message.partial ? await message.fetch().catch(() => null) : message;
    // Edits that keep the number, like an embed loading, are fine
    if (!current || parseCount(current.content, counting.allowMath) === counting.lastNumber) return;
  }

  const channel = message.channel;
  if (!channel.isSendable()) return;

  const repost = await channel
    .send({
      ...createResponse(
        t('counting.removed', { number: counting.lastNumber, user: userMention(counting.lastNumberByUserId), next: counting.lastNumber + 1 }),
        'warning',
      ),
      allowedMentions: { parse: [] },
    })
    .catch(logFailure(`Failed to repost removed counting number in guild ${counting.guildId}`));
  if (!repost) return;

  // Point the jump links at the repost, which also means it gets reposted again if that is deleted
  await updateCounting(counting.guildId, {
    lastNumberMessageId: repost.id,
    ...(counting.highestNumberMessageId === message.id && { highestNumberMessageId: repost.id }),
  });
}
