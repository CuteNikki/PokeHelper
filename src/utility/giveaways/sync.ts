import { type Client, DiscordAPIError, type Guild, RESTJSONErrorCodes } from 'discord.js';

import { countParticipants, getGiveaway, getWinners, setGiveawayMessage } from 'database/giveaways';

import { renderPost } from 'utility/giveaways/publish';
import { logger } from 'utility/logger';
import { KeyedQueue } from 'utility/queue';

/** Edits of the same post one at a time, so an older one never lands after a newer one. */
const queue = new KeyedQueue();
/** Giveaways whose post is out of date, by server, to be updated on the next flush. */
const changed = new Map<string, string>();

const isGone = (error: unknown) =>
  error instanceof DiscordAPIError && (error.code === RESTJSONErrorCodes.UnknownMessage || error.code === RESTJSONErrorCodes.UnknownChannel);

/**
 * Bring a giveaway's post up to date, like its number of participants or its winners.
 * A post that's gone is forgotten, and the giveaway goes on without it.
 */
export const syncPost = (guild: Guild, giveawayId: string) =>
  queue.run(giveawayId, async () => {
    const giveaway = await getGiveaway(guild.id, giveawayId);
    if (!giveaway?.messageId) return;
    const channel = guild.channels.cache.get(giveaway.channelId);
    // The channel was deleted, and the post with it
    if (!channel?.isTextBased()) return setGiveawayMessage(giveaway.id, null);
    const [participants, winners] = await Promise.all([countParticipants(giveaway.id), getWinners(giveaway.id)]);
    try {
      await channel.messages.edit(giveaway.messageId, renderPost(guild, giveaway, { participants, winnerIds: winners.map((winner) => winner.userId) }));
    } catch (error) {
      if (isGone(error)) await setGiveawayMessage(giveaway.id, null);
      else logger.warn(error, `Failed to update the post of giveaway ${giveaway.id} in guild ${guild.id}`);
    }
  });

/**
 * Mark a giveaway's post as out of date, like when someone joined. It's updated on the next flush, so a busy giveaway's post
 * is edited every few seconds at most, not with every click, which Discord would slow down.
 */
export const markPostChanged = (guildId: string, giveawayId: string) => changed.set(giveawayId, guildId);

/** Update every post marked as out of date. Run regularly. */
export async function flushPosts(client: Client) {
  const due = [...changed];
  changed.clear();
  await Promise.all(
    due.map(async ([giveawayId, guildId]) => {
      const guild = client.guilds.cache.get(guildId);
      if (guild) await syncPost(guild, giveawayId);
    }),
  );
}
