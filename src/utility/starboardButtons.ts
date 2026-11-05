import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
  userMention,
  type ButtonInteraction,
} from 'discord.js';

import { getStarboardEntryByPost, type StarboardEntry } from 'database/starboard';

import { getTranslate, type Translate } from 'utility/i18next';
import { sendError, sendResponse, type ResponsePayload } from 'utility/response';
import { STAR_BUTTON_ID, STARBOARD_BUTTON_PREFIX, STARRED_BY_BUTTON_ID, toggleStar } from 'utility/starboard';
import { ThemeColors } from 'utility/theme';

/** People named on a page of who starred, which stays readable and well within a message. */
export const STARRED_BY_PAGE_SIZE = 50;
/**
 * The pages of who starred are `starpost:page:<post>:<page>`. They're on the reply only the presser sees, not on the post, so they
 * carry which post they're for, and work however old the reply is.
 */
const PAGE_PREFIX = `${STARBOARD_BUTTON_PREFIX}page:`;

/** The page to show, kept within the pages there are, as stars can change between presses. */
export function clampPage(page: number, count: number): { page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(count / STARRED_BY_PAGE_SIZE));
  return { page: Math.min(Math.max(0, page), pages - 1), pages };
}

/** A page of who starred a post, with buttons to the other pages when there's more than one. */
function buildStarredBy(entry: StarboardEntry, postId: string, requested: number, t: Translate): ResponsePayload {
  const { page, pages } = clampPage(requested, entry.starredBy.length);
  const names = entry.starredBy.slice(page * STARRED_BY_PAGE_SIZE, (page + 1) * STARRED_BY_PAGE_SIZE).map((userId) => userMention(userId));
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${t('starboard.post.whoTitle')}\n${names.join(', ') || t('starboard.post.nobody')}`));

  if (pages > 1) {
    const button = (target: number, emoji: string) =>
      new ButtonBuilder()
        .setCustomId(`${PAGE_PREFIX}${postId}:${target}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(emoji)
        .setDisabled(target < 0 || target >= pages);
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(page - 1, t('pagination.previous.icon')),
        new ButtonBuilder()
          .setCustomId(`${PAGE_PREFIX}${postId}:current`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel(t('pagination.page.label', { current: (page + 1).toLocaleString(t('locale')), total: pages.toLocaleString(t('locale')) }))
          .setDisabled(true),
        button(page + 1, t('pagination.next.icon')),
      ),
    );
  }
  // The names are mentions to see who they are, which never ping anyone
  return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}

/** Star or unstar the post's message, or show who starred it, a page at a time, only to whoever pressed. In their language. */
export async function handleStarboardButton(interaction: ButtonInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);

  if (interaction.customId.startsWith(PAGE_PREFIX)) {
    const [postId, page] = interaction.customId.slice(PAGE_PREFIX.length).split(':');
    const entry = postId ? await getStarboardEntryByPost(postId) : null;
    if (!postId || !entry) return sendError(interaction, t('starboard.post.gone'));
    return interaction.update(buildStarredBy(entry, postId, Number(page) || 0, t));
  }

  const entry = interaction.inCachedGuild() ? await getStarboardEntryByPost(interaction.message.id) : null;
  if (!entry || !interaction.inCachedGuild()) return sendError(interaction, t('starboard.post.gone'));

  if (interaction.customId === STARRED_BY_BUTTON_ID) {
    return sendResponse(interaction, buildStarredBy(entry, interaction.message.id, 0, t), { ephemeral: true });
  }

  if (interaction.customId !== STAR_BUTTON_ID) return sendError(interaction, t('system.outdated'));
  if (interaction.user.id === entry.authorId) return sendError(interaction, t('starboard.post.own'));

  // The post is updated with the new count, so the press only needs an answer
  await interaction.deferUpdate();
  const starred = await toggleStar(interaction.guild, entry, interaction.user.id);
  if (starred === null) return sendError(interaction, t('starboard.post.gone'));
}
