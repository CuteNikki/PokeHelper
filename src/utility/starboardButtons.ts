import { ContainerBuilder, MessageFlags, TextDisplayBuilder, userMention, type ButtonInteraction } from 'discord.js';

import { getStarboardEntryByPost, type StarboardEntry } from 'database/starboard';

import { getTranslate, type Translate } from 'utility/i18next';
import { buildPageRow, clampPage, type PageButton } from 'utility/pagination';
import { sendError, sendResponse, type ResponsePayload } from 'utility/response';
import { STAR_BUTTON_ID, STARBOARD_BUTTON_PREFIX, STARRED_BY_BUTTON_ID, toggleStar } from 'utility/starboard';
import { ThemeColors } from 'utility/theme';

/** People named on a page of who starred, which stays readable and well within a message. */
const STARRED_BY_PAGE_SIZE = 50;
/**
 * The pages of who starred are `starpost:page:<post>:<page>`. They're on the reply only the presser sees, not on the post, so they
 * carry which post they're for, and work however old the reply is.
 */
const PAGE_PREFIX = `${STARBOARD_BUTTON_PREFIX}page:`;

/** A page of who starred a post, with buttons to the other pages when there's more than one. */
function buildStarredBy(entry: StarboardEntry, postId: string, requested: number, t: Translate): ResponsePayload {
  const { page, pages } = clampPage(requested, entry.starredBy.length, STARRED_BY_PAGE_SIZE);
  const names = entry.starredBy.slice(page * STARRED_BY_PAGE_SIZE, (page + 1) * STARRED_BY_PAGE_SIZE).map((userId) => userMention(userId));
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${t('starboard.post.whoTitle')}\n${names.join(', ') || t('starboard.post.nobody')}`));

  if (pages > 1) {
    // The page only shows where you are, as these lists are short
    const customId = (button: PageButton, target: number) => `${PAGE_PREFIX}${postId}:${button === 'goto' ? 'current' : target}`;
    container.addActionRowComponents(buildPageRow(page, pages, customId, t, { goto: false, short: true }));
  }
  // The names are mentions to see who they are, which never ping anyone
  return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}

/** Star or unstar the post's message, or show who starred it, a page at a time, only to whoever pressed. In their language. */
export async function handleStarboardButton(interaction: ButtonInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  // Each is answered before the post is looked up, which can take a moment, as Discord gives up after 3 seconds.
  // Errors still only go to whoever pressed

  if (interaction.customId.startsWith(PAGE_PREFIX)) {
    const [postId, page] = interaction.customId.slice(PAGE_PREFIX.length).split(':');
    await interaction.deferUpdate();
    const entry = postId ? await getStarboardEntryByPost(postId) : null;
    if (!postId || !entry) return sendError(interaction, t('starboard.post.gone'));
    return interaction.editReply(buildStarredBy(entry, postId, Number(page) || 0, t));
  }

  if (interaction.customId === STARRED_BY_BUTTON_ID) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const entry = interaction.inCachedGuild() ? await getStarboardEntryByPost(interaction.message.id) : null;
    if (!entry) return sendError(interaction, t('starboard.post.gone'));
    return sendResponse(interaction, buildStarredBy(entry, interaction.message.id, 0, t));
  }

  if (interaction.customId !== STAR_BUTTON_ID) return sendError(interaction, t('system.outdated'));

  // The post is updated with the new count, so the press only needs an answer
  await interaction.deferUpdate();
  const entry = interaction.inCachedGuild() ? await getStarboardEntryByPost(interaction.message.id) : null;
  if (!entry || !interaction.inCachedGuild()) return sendError(interaction, t('starboard.post.gone'));
  if (interaction.user.id === entry.authorId) return sendError(interaction, t('starboard.post.own'));

  const result = await toggleStar(interaction.guild, entry, interaction.user.id);
  if (result !== 'changed') return sendError(interaction, t(`starboard.post.${result}`));
}
