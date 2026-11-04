import { LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, type ModalSubmitInteraction } from 'discord.js';

import { getTranslate, type Translate } from 'utility/i18next';
import { buildLeaderboard } from 'utility/leveling/leaderboard';
import { leaderboardPageModalId, parseLeaderboardPageModalId, type LeaderboardView } from 'utility/leveling/leaderboardView';
import { sendError } from 'utility/response';

const PAGE_INPUT_ID = 'page_input';
/** Enough for any page number, which is checked against the pages there are once submitted. */
const MAX_PAGE_LENGTH = 6;

/** The popup asking which page of the leaderboard to go to, from the view it's opened on. */
export function buildLeaderboardPageModal(view: LeaderboardView, t: Translate) {
  return new ModalBuilder()
    .setCustomId(leaderboardPageModalId(view))
    .setTitle(t('pagination.modal.title'))
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(t('pagination.modal.label'))
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(PAGE_INPUT_ID)
            .setStyle(TextInputStyle.Short)
            .setValue(view.page.toString())
            .setMaxLength(MAX_PAGE_LENGTH)
            .setMinLength(1)
            .setRequired(true),
        ),
    );
}

/** Go to the page typed into the popup, on the leaderboard it was opened from. A page past the end shows the last one. */
export async function handleLeaderboardPageModal(interaction: ModalSubmitInteraction) {
  if (!interaction.inCachedGuild() || !interaction.isFromMessage()) return;
  const t = getTranslate(interaction.locale);

  const view = parseLeaderboardPageModalId(interaction.customId);
  if (!view) return sendError(interaction, t('system.outdated'));

  const page = Number(interaction.fields.getTextInputValue(PAGE_INPUT_ID).trim());
  if (!Number.isInteger(page) || page < 1) return sendError(interaction, t('pagination.modal.invalid'));

  await interaction.deferUpdate();
  await interaction.editReply(await buildLeaderboard({ ...view, page }, interaction.guild, t));
}
