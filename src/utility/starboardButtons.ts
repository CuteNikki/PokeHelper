import { userMention, type ButtonInteraction } from 'discord.js';

import { getStarboardEntryByPost } from 'database/starboard';

import { getTranslate } from 'utility/i18next';
import { createResponse, sendError, sendResponse } from 'utility/response';
import { STAR_BUTTON_ID, STARRED_BY_BUTTON_ID, toggleStar } from 'utility/starboard';

/** The most people named in the list of who starred, which stays readable and within a message. */
const MAX_LISTED = 50;

/** Star or unstar the post's message, or show who starred it, only to whoever pressed. In their language. */
export async function handleStarboardButton(interaction: ButtonInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const entry = interaction.inCachedGuild() ? await getStarboardEntryByPost(interaction.message.id) : null;
  if (!entry || !interaction.inCachedGuild()) return sendError(interaction, t('starboard.post.gone'));

  if (interaction.customId === STARRED_BY_BUTTON_ID) {
    const listed = entry.starredBy.slice(0, MAX_LISTED).map((userId) => userMention(userId));
    const more = entry.starredBy.length - listed.length;
    const list = more > 0 ? `${listed.join(', ')} ${t('starboard.post.more', { count: more })}` : listed.join(', ');
    return sendResponse(interaction, { ...createResponse(`${t('starboard.post.whoTitle')}\n${list}`), allowedMentions: { parse: [] } }, { ephemeral: true });
  }

  if (interaction.customId !== STAR_BUTTON_ID) return sendError(interaction, t('system.outdated'));
  if (interaction.user.id === entry.authorId) return sendError(interaction, t('starboard.post.own'));

  // The post is updated with the new count, so the press only needs an answer
  await interaction.deferUpdate();
  const starred = await toggleStar(interaction.guild, entry, interaction.user.id);
  if (starred === null) return sendError(interaction, t('starboard.post.gone'));
}
