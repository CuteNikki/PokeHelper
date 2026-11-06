import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  channelMention,
  ContainerBuilder,
  DiscordAPIError,
  type Guild,
  MediaGalleryBuilder,
  type Message,
  MessageFlags,
  type MessageReaction,
  type PartialMessage,
  type PartialMessageReaction,
  type PermissionsString,
  RESTJSONErrorCodes,
  SeparatorBuilder,
  subtext,
  TextDisplayBuilder,
  time,
  TimestampStyles,
  userMention,
} from 'discord.js';

import {
  deleteStarboardEntry,
  getGuildStarboard,
  getStarboardEntry,
  getStarboardEntryByPost,
  saveStarboardEntry,
  updateGuildStarboard,
  updateStarboardEntry,
  type GuildStarboard,
  type StarboardEntry,
} from 'database/starboard';

import { formatNumber, SECOND } from 'utility/duration';
import { customEmojiId } from 'utility/emoji';
import { guildTranslate, type Translate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { KeyedQueue } from 'utility/queue';
import type { ResponsePayload } from 'utility/response';
import { shorten } from 'utility/text';

export const DEFAULT_STAR_EMOJI = '⭐';
export const DEFAULT_THRESHOLD = 3;
export const MAX_THRESHOLD = 100;
/** What the bot needs on the starboard: posting with pictures, and finding its posts again to update them. */
export const STARBOARD_CHANNEL_PERMISSIONS: PermissionsString[] = ['ViewChannel', 'SendMessages', 'AttachFiles', 'ReadMessageHistory'];

/**
 * The buttons on a post: `starpost:star` stars or unstars, `starpost:who` shows who starred. The post is found by the message they're on,
 * so they work however old it is.
 */
export const STARBOARD_BUTTON_PREFIX = 'starpost:';
export const STAR_BUTTON_ID = `${STARBOARD_BUTTON_PREFIX}star`;
export const STARRED_BY_BUTTON_ID = `${STARBOARD_BUTTON_PREFIX}who`;
/** Reactions are read 100 at a time. This many pages is far more than a starboard ever sees. */
const MAX_REACTION_PAGES = 10;

/** The gold of a star. */
const STAR_COLOR = 0xffac33;
/** Pictures are uploaded again, as links to the original's would stop working after a day. Bots can upload 10 MB, so larger ones are left out. */
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_IMAGES = 4;
/** Discord's limit for the text of a message is 4,000 characters, which leaves room for the rest. */
const MAX_TEXT = 3_000;

/** Emoji ending in this are the same as without it, like ⭐ and ⭐️. */
const VARIATION_SELECTOR = /️/g;

/** Whether a reaction is the starboard's emoji: a custom one by its ID, as it can be renamed, a normal one by itself. */
export function isStarEmoji(configured: string, emoji: { id: string | null; name: string | null }): boolean {
  const customId = customEmojiId(configured);
  if (customId) return emoji.id === customId;
  return emoji.id === null && emoji.name?.replace(VARIATION_SELECTOR, '') === configured.replace(VARIATION_SELECTOR, '');
}

/** Whether reactions in a channel don't count: the channel itself, its category, or for a thread, the channel it's in and its category. */
export function isIgnoredChannel(config: Pick<GuildStarboard, 'ignoredChannelIds'>, guild: Guild, channelId: string): boolean {
  const channel = guild.channels.cache.get(channelId);
  const parent = channel?.isThread() ? guild.channels.cache.get(channel.parentId ?? '') : channel;
  return [channelId, parent?.id, parent?.parentId].some((id) => id && config.ignoredChannelIds.includes(id));
}

const emojiOf = (config: Pick<GuildStarboard, 'emoji'>) => config.emoji ?? DEFAULT_STAR_EMOJI;
const thresholdOf = (config: Pick<GuildStarboard, 'threshold'>) => config.threshold ?? DEFAULT_THRESHOLD;

/**
 * The names a picture can be uploaded with, which the post refers to it by. By the picture's ID, so taking one picture off the message
 * doesn't rename the others, and by its place, which posts from before were uploaded with.
 */
const imageNames = (id: string, index: number, name: string) => {
  const safe = name.replace(/[^\w.-]/g, '_');
  return [`star-${id}-${safe}`, `star-${index}-${safe}`];
};

/** The message's pictures that can be uploaded again, in order. */
const imagesOf = (message: Message) =>
  [...message.attachments.values()]
    .filter((file) => file.contentType?.startsWith('image/') && file.size <= MAX_IMAGE_SIZE)
    .slice(0, MAX_IMAGES)
    .map((file, index) => ({ file, names: imageNames(file.id, index, file.name) }));

/**
 * A starboard post: who wrote it, where and when, the text and pictures, and buttons to star, see who starred, and go to the message.
 * @param uploaded The names of the pictures on the post, as one whose upload failed can't be shown.
 */
function buildStarboardPost(message: Message, stars: number, emoji: string, uploaded: string[], t: Translate): ResponsePayload {
  const text = shorten(message.content, MAX_TEXT);

  // Who wrote it on one line with where and when, like an embed's author, as a thumbnail would take a large square beside the text.
  // A mention, which shows their name and profile when clicked, and never pings them, see allowedMentions below
  const container = new ContainerBuilder()
    .setAccentColor(STAR_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${userMention(message.author.id)} · ${channelMention(message.channelId)} · ${time(message.createdAt, TimestampStyles.RelativeTime)}`,
      ),
    );
  if (text) container.addSeparatorComponents(new SeparatorBuilder()).addTextDisplayComponents(new TextDisplayBuilder().setContent(text));

  const images = imagesOf(message).flatMap(({ file, names }) => {
    const name = names.find((candidate) => uploaded.includes(candidate));
    return name ? [{ file, name }] : [];
  });
  // Without pictures of its own, the picture of a link, like a GIF, which isn't on Discord's servers and keeps working
  const linked = images.length === 0 ? (message.embeds.find((embed) => embed.image ?? embed.thumbnail) ?? null) : null;
  const linkedUrl = linked?.image?.url ?? linked?.thumbnail?.url;
  if (images.length > 0) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        images.map(
          ({ file, name }) =>
            (item) =>
              item.setURL(`attachment://${name}`).setSpoiler(file.spoiler),
        ),
      ),
    );
  } else if (linkedUrl) {
    container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems((item) => item.setURL(linkedUrl)));
  }

  const others = [...message.attachments.values()].filter((file) => !images.some((image) => image.file.id === file.id));
  if (others.length > 0) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(subtext(`📎 ${others.map((file) => file.name).join(', ')}`)));

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      // The count on the star button, like a reaction, which pressing adds to
      new ButtonBuilder().setCustomId(STAR_BUTTON_ID).setStyle(ButtonStyle.Secondary).setEmoji(emoji).setLabel(formatNumber(stars, t)),
      new ButtonBuilder().setCustomId(STARRED_BY_BUTTON_ID).setStyle(ButtonStyle.Secondary).setLabel(t('starboard.post.who')),
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(message.url).setLabel(t('starboard.post.jump')),
    ),
  );
  // Nobody is pinged by a message being starred
  return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}

/** The pictures to upload with a new post. */
async function uploadsOf(message: Message): Promise<AttachmentBuilder[]> {
  const files = await Promise.all(
    imagesOf(message).map(async ({ file, names }) => {
      const response = await fetch(file.url, { signal: AbortSignal.timeout(15 * SECOND) }).catch(() => null);
      if (!response?.ok) return null;
      const data = await response.arrayBuffer().catch(() => null);
      return data ? new AttachmentBuilder(Buffer.from(data), { name: names[0] }) : null;
    }),
  );
  return files.filter((file): file is AttachmentBuilder => file !== null);
}

const isUnknownMessage = (error: unknown) => error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMessage;
/** Whether a fetch failed because the message or its channel is gone, and not for a moment, like Discord having trouble. */
const isGone = (error: unknown) =>
  error instanceof DiscordAPIError && (error.code === RESTJSONErrorCodes.UnknownMessage || error.code === RESTJSONErrorCodes.UnknownChannel);

/** Whether a channel is age-restricted. Threads are as their channel is, as they have no setting of their own. */
const isAgeRestricted = (channel: Message['channel']) => (channel.isThread() ? Boolean(channel.parent?.nsfw) : 'nsfw' in channel && channel.nsfw);

/** One message at a time, so quick stars don't post it twice or lose one. */
const queue = new KeyedQueue();

/** A starboard channel, if it's set and there. */
function boardChannel(guild: Guild, channelId: string | null) {
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  return channel?.isSendable() && channel.isTextBased() && !channel.isThread() ? channel : null;
}

/** The channel an entry's post is in, which stays where it was posted when the starboard moves to another channel. */
const postChannelId = (config: GuildStarboard, entry: StarboardEntry) => entry.starboardChannelId ?? config.channelId;

/** Everyone who reacted with the starboard's emoji, without bots, read 100 at a time. */
async function reactorsOf(message: Message, emoji: string): Promise<string[]> {
  const reaction = message.reactions.cache.find((candidate) => isStarEmoji(emoji, candidate.emoji));
  if (!reaction) return [];
  const ids: string[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_REACTION_PAGES; page++) {
    const users = await reaction.users.fetch({ limit: 100, after });
    for (const user of users.values()) if (!user.bot) ids.push(user.id);
    if (users.size < 100) break;
    after = users.lastKey();
  }
  return ids;
}

/** Delete an entry's post, after it's taken off the entry, so its deletion isn't taken for someone removing it by hand. */
async function deletePost(guild: Guild, config: GuildStarboard, entry: StarboardEntry) {
  const postId = entry.starboardMessageId;
  if (!postId) return;
  await boardChannel(guild, postChannelId(config, entry))
    ?.messages.delete(postId)
    .catch((error: unknown) => {
      if (!isUnknownMessage(error)) logger.warn(error, `Couldn't remove the starboard post ${postId}`);
    });
}

/** Forget a message and take its post off the starboard, like when it's deleted. */
async function forget(guild: Guild, config: GuildStarboard, entry: StarboardEntry) {
  await deleteStarboardEntry(entry.messageId);
  await deletePost(guild, config, entry);
}

/** How the stars of a message change: who to add, who to take off, or everyone off, like when a moderator removes the reactions. */
export type StarChange = { add: string } | { remove: string } | { toggle: string } | { clear: true } | null;

/** Who starred after a change, each once and never the author, whose own star doesn't count. */
export function applyStarChange(starredBy: string[], change: StarChange, authorId: string): string[] {
  let next = starredBy;
  if (change && 'add' in change) next = [...next, change.add];
  if (change && 'remove' in change) next = next.filter((userId) => userId !== change.remove);
  if (change && 'toggle' in change) next = next.includes(change.toggle) ? next.filter((userId) => userId !== change.toggle) : [...next, change.toggle];
  if (change && 'clear' in change) next = [];
  return [...new Set(next)].filter((userId) => userId !== authorId);
}

/**
 * Change who starred a message, then bring its post up to date: post it once it has enough stars, update the count and what it says,
 * and take it off again when it falls below. The first time, who starred starts from who already reacted, so stars from while the bot
 * was offline count. Messages on the starboard itself, in ignored channels, and age-restricted ones when the starboard isn't, are left out.
 * @param change Null to only update the post, like after an edit.
 * @returns Who starred it now, or null if it doesn't count.
 */
export function changeStars(guild: Guild, message: Message | PartialMessage, change: StarChange): Promise<string[] | null> {
  return queue.run(message.id, async () => {
    const config = await getGuildStarboard(guild.id);
    const starboard = config?.enabled ? boardChannel(guild, config.channelId) : null;
    if (!config || !starboard || message.channelId === starboard.id || isIgnoredChannel(config, guild, message.channelId)) return null;

    const entry = await getStarboardEntry(message.id);
    let full: Message;
    try {
      full = message.partial ? await message.fetch() : message;
    } catch (error) {
      // Only a message that's really gone is forgotten. Any other failure, like Discord having trouble, leaves it as it is
      if (!isGone(error)) throw error;
      if (entry) await forget(guild, config, entry);
      return null;
    }
    if (entry?.removed) return null;
    if (isAgeRestricted(full.channel) && !starboard.nsfw) return null;

    const emoji = emojiOf(config);
    // An entry is deleted once nobody starred it, so an empty one is from before who starred was kept, and starts from the reactions too
    const known = entry && entry.starredBy.length > 0 ? entry.starredBy : await reactorsOf(full, emoji);
    const starredBy = applyStarChange(known, change, full.author.id);
    const ids = { messageId: full.id, guildId: guild.id, channelId: full.channelId, authorId: full.author.id };

    if (starredBy.length < thresholdOf(config)) {
      // Without stars there's nothing to remember
      if (starredBy.length === 0 && entry) await deleteStarboardEntry(entry.messageId);
      else if (starredBy.length > 0) await saveStarboardEntry({ ...ids, starredBy, starboardMessageId: null, starboardChannelId: null, postImages: [] });
      if (entry) await deletePost(guild, config, entry);
      return starredBy;
    }

    const t = guildTranslate(guild);
    // A post whose channel is gone, like an old starboard that was deleted, is posted anew
    const postChannel = entry?.starboardMessageId ? boardChannel(guild, postChannelId(config, entry)) : null;
    if (entry?.starboardMessageId && postChannel) {
      try {
        // Only the pictures uploaded with the post can be shown. Posts from before they were remembered are looked at once
        const uploaded =
          entry.postImages.length > 0 || imagesOf(full).length === 0
            ? entry.postImages
            : [...(await postChannel.messages.fetch(entry.starboardMessageId)).attachments.values()].map((file) => file.name);
        await postChannel.messages.edit(entry.starboardMessageId, buildStarboardPost(full, starredBy.length, emoji, uploaded, t));
        await saveStarboardEntry({ ...ids, starredBy, starboardChannelId: postChannel.id, postImages: uploaded });
      } catch (error) {
        // Deleted by hand while the bot was offline, so it stays off
        if (!isUnknownMessage(error)) throw error;
        await saveStarboardEntry({ ...ids, starredBy, starboardMessageId: null, starboardChannelId: null, postImages: [], removed: true });
      }
      return starredBy;
    }

    const files = await uploadsOf(full);
    const postImages = files.map((file) => file.name ?? '');
    const sent = await starboard.send({ ...buildStarboardPost(full, starredBy.length, emoji, postImages, t), files });
    await saveStarboardEntry({ ...ids, starredBy, starboardMessageId: sent.id, starboardChannelId: starboard.id, postImages });
    return starredBy;
  });
}

/**
 * Star or unstar a message with the button on its post.
 * @returns Whether they starred it now, or null if the message is gone.
 */
export async function toggleStar(guild: Guild, entry: StarboardEntry, userId: string): Promise<boolean | null> {
  let message: Message | null = null;
  try {
    // Fetched when it isn't cached, like an archived thread after a restart
    const channel = guild.channels.cache.get(entry.channelId) ?? (await guild.client.channels.fetch(entry.channelId));
    if (channel?.isTextBased()) message = await channel.messages.fetch(entry.messageId);
  } catch (error) {
    // Only a message that's really gone is forgotten. Any other failure leaves it as it is
    if (!isGone(error)) throw error;
  }
  if (!message) {
    const config = await getGuildStarboard(guild.id);
    if (config) await queue.run(entry.messageId, () => forget(guild, config, entry));
    return null;
  }
  // Toggled where it runs, so two quick presses undo each other
  const starredBy = await changeStars(guild, message, { toggle: userId });
  return starredBy?.includes(userId) ?? null;
}

/** Whether a reaction could change a starboard, checked before the message is looked at. */
export async function isStarReaction(reaction: MessageReaction | PartialMessageReaction): Promise<boolean> {
  const guildId = reaction.message.guildId;
  if (!guildId) return false;
  const config = await getGuildStarboard(guildId);
  return Boolean(config?.enabled && config.channelId && isStarEmoji(emojiOf(config), reaction.emoji));
}

/** A starred message was deleted: its post goes too. A post deleted by hand is remembered, so it isn't posted again. */
export async function handleDeletedMessage(guild: Guild, messageId: string): Promise<void> {
  const config = await getGuildStarboard(guild.id);
  if (!config) return;

  // A post, also one on a starboard channel from before
  const byPost = await getStarboardEntryByPost(messageId);
  if (byPost) {
    await updateStarboardEntry(byPost.messageId, { starboardMessageId: null, starboardChannelId: null, postImages: [], removed: true });
    return;
  }

  await queue.run(messageId, async () => {
    const entry = await getStarboardEntry(messageId);
    if (entry) await forget(guild, config, entry);
  });
}

/** A deleted custom star goes back to ⭐, as nobody can react with it anymore, and Discord wouldn't take posts with it. */
export async function handleDeletedStarEmoji(guildId: string, emojiId: string) {
  const config = await getGuildStarboard(guildId);
  if (config?.emoji && customEmojiId(config.emoji) === emojiId) await updateGuildStarboard(guildId, { emoji: null });
}
