import { LabelBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { t } from 'i18next';

import { Button } from 'classes/base/button';

import { getGuildLevelingConfiguration } from 'database/leveling';

import { buildLeaderboard } from 'utility/leaderboard';
import { getLeaderboardState, saveLeaderboardState } from 'utility/leaderboardState';

export default new Button({
  customId: 'lb_custom',
  includesCustomId: true,
  isAuthorOnly: true,
  async execute(interaction) {
    const [, , pagesStr, totalPagesStr] = interaction.customId.split('_');
    const totalPages = parseInt(totalPagesStr ?? '1', 10);
    const currentPage = parseInt(pagesStr ?? '1', 10);

    if (!interaction.inCachedGuild()) return;

    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig || !levelingConfig.enabled) return interaction.reply({ content: t('leveling.disabled'), flags: MessageFlags.Ephemeral });

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
              .setValue(currentPage.toString())
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
      return interaction.followUp({ content: t('pagination.modal.timeout'), flags: [MessageFlags.Ephemeral] });
    }
    await modalSubmit.deferUpdate();
    const rawRequestedPage = parseInt(modalSubmit.fields.getTextInputValue('page_input'), 10);

    if (isNaN(rawRequestedPage)) {
      return modalSubmit.followUp({ content: t('pagination.modal.invalid'), flags: [MessageFlags.Ephemeral] });
    }

    const requestedPage = Math.max(1, Math.min(rawRequestedPage, totalPages));

    const state = await getLeaderboardState(interaction.message.id);
    const newState = {
      messageId: interaction.message.id,
      page: requestedPage,
      sortOrder: state?.sortOrder ?? 'desc',
      weekly: state?.weekly ?? false,
    };
    await saveLeaderboardState(newState);
    await buildLeaderboard({ ...newState, guild: interaction.guild }).then((response) => modalSubmit.editReply(response));
  },
});
