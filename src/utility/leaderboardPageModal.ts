import { LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, type ModalSubmitInteraction } from 'discord.js';

import { getTranslate, type Translate } from 'utility/i18next';
import { buildLeaderboard } from 'utility/leaderboard';
import { getLeaderboardState, saveLeaderboardState } from 'utility/leaderboardState';
import { sendError } from 'utility/response';

/** Custom IDs of the popup are this, followed by the number of pages, so it can be handled whenever it's submitted. */
export const LEADERBOARD_PAGE_MODAL_PREFIX = 'lb_page:';
const PAGE_INPUT_ID = 'page_input';

/** The popup asking which page of the leaderboard to go to. */
export function buildLeaderboardPageModal(currentPage: number, totalPages: number, t: Translate) {
  return new ModalBuilder()
    .setCustomId(`${LEADERBOARD_PAGE_MODAL_PREFIX}${totalPages}`)
    .setTitle(t('pagination.modal.title'))
    .addLabelComponents(
      new LabelBuilder().setLabel(t('pagination.modal.label')).setTextInputComponent(
        new TextInputBuilder()
          .setCustomId(PAGE_INPUT_ID)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(t('pagination.modal.placeholder', { maxPages: totalPages }))
          .setValue(isNaN(currentPage) ? '' : currentPage.toString())
          .setMaxLength(totalPages.toString().length)
          .setMinLength(1)
          .setRequired(true),
      ),
    );
}

/** Go to the page typed into the popup, on the leaderboard the popup was opened from. */
export async function handleLeaderboardPageModal(interaction: ModalSubmitInteraction) {
  if (!interaction.inCachedGuild() || !interaction.isFromMessage()) return;
  const t = getTranslate(interaction.locale);

  const totalPages = parseInt(interaction.customId.slice(LEADERBOARD_PAGE_MODAL_PREFIX.length), 10) || 1;
  const requested = parseInt(interaction.fields.getTextInputValue(PAGE_INPUT_ID), 10);
  if (isNaN(requested)) return sendError(interaction, t('pagination.modal.invalid', { maxPages: totalPages }));

  await interaction.deferUpdate();
  const state = await getLeaderboardState(interaction.message.id);
  const newState = {
    messageId: interaction.message.id,
    page: Math.max(1, Math.min(requested, totalPages)),
    sortOrder: state?.sortOrder ?? 'desc',
    weekly: state?.weekly ?? false,
    text: state?.text ?? false,
  };
  await saveLeaderboardState(newState);
  await interaction.editReply(await buildLeaderboard({ ...newState, guild: interaction.guild, t }));
}
