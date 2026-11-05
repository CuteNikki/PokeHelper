import type { ModalSubmitInteraction } from 'discord.js';

import { getTranslate, type Translate } from 'utility/i18next';
import { buildLeaderboard } from 'utility/leveling/leaderboard';
import { leaderboardPageModalId, parseLeaderboardPageModalId, type LeaderboardView } from 'utility/leveling/leaderboardView';
import { buildPageModal, readPageInput } from 'utility/pagination';
import { sendError } from 'utility/response';

/** The popup asking which page of the leaderboard to go to, from the view it's opened on. */
export const buildLeaderboardPageModal = (view: LeaderboardView, t: Translate) => buildPageModal(leaderboardPageModalId(view), view.page, t);

/** Go to the page typed into the popup, on the leaderboard it was opened from. A page past the end shows the last one. */
export async function handleLeaderboardPageModal(interaction: ModalSubmitInteraction) {
  if (!interaction.inCachedGuild() || !interaction.isFromMessage()) return;
  const t = getTranslate(interaction.locale);

  const view = parseLeaderboardPageModalId(interaction.customId);
  if (!view) return sendError(interaction, t('system.outdated'));

  const page = readPageInput(interaction);
  if (page === null) return sendError(interaction, t('pagination.modal.invalid'));

  await interaction.deferUpdate();
  await interaction.editReply(await buildLeaderboard({ ...view, page }, interaction.guild, t));
}
