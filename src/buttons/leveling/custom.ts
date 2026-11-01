import { LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

import { Button } from 'classes/base/button';

import { getGuildLevelingConfiguration } from 'database/leveling';

import { buildLeaderboard } from 'utility/leaderboard';
import { getLeaderboardState, saveLeaderboardState } from 'utility/leaderboardState';
import { getTranslate } from 'utility/i18next';
import { sendError } from 'utility/response';

export default new Button({
  customId: 'lb_custom',
  includesCustomId: true,
  isAuthorOnly: true,
  async execute(interaction) {
    const [, , pagesStr, totalPagesStr] = interaction.customId.split('_');
    const totalPages = parseInt(totalPagesStr ?? '1', 10);
    const currentPage = parseInt(pagesStr ?? '1', 10);

    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);

    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig || !levelingConfig.enabled) return sendError(interaction, t('leveling.disabled'));

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId('lb_page_select')
        .setTitle(t('pagination.modal.title'))
        .addLabelComponents(
          new LabelBuilder().setLabel(t('pagination.modal.label')).setTextInputComponent(
            new TextInputBuilder()
              .setCustomId('page_input')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder(t('pagination.modal.placeholder', { maxPages: totalPages }))
              .setValue(isNaN(currentPage) ? '' : currentPage.toString())
              .setMaxLength(totalPages.toString().length)
              .setMinLength(1)
              .setRequired(true),
          ),
        ),
    );

    const modalSubmit = await interaction
      .awaitModalSubmit({ time: 60_000, filter: (submit) => submit.customId === 'lb_page_select' && submit.user.id === interaction.user.id })
      .catch(() => null);
    if (!modalSubmit) {
      return sendError(interaction, t('pagination.modal.timeout'));
    }
    await modalSubmit.deferUpdate();
    const rawRequestedPage = parseInt(modalSubmit.fields.getTextInputValue('page_input'), 10);

    if (isNaN(rawRequestedPage)) {
      return sendError(modalSubmit, t('pagination.modal.invalid', { maxPages: totalPages }));
    }

    const requestedPage = Math.max(1, Math.min(rawRequestedPage, totalPages));

    const state = await getLeaderboardState(interaction.message.id);
    const newState = {
      messageId: interaction.message.id,
      page: requestedPage,
      sortOrder: state?.sortOrder ?? 'desc',
      weekly: state?.weekly ?? false,
      text: state?.text ?? false,
    };
    await saveLeaderboardState(newState);
    await buildLeaderboard({ ...newState, guild: interaction.guild, t: getTranslate(interaction.locale) }).then((response) => modalSubmit.editReply(response));
  },
});
