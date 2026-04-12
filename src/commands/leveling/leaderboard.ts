import {
  ActionRowBuilder,
  ApplicationIntegrationType,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  ComponentType,
  EmbedBuilder,
  InteractionContextType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  userMention,
} from 'discord.js';
import { t } from 'i18next';

import { Command } from 'classes/base/command';

import { getGuildLevelingConfiguration, getLevelFromXP, getTopUsersByXP, getTotalUsersWithXP } from 'database/leveling';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setName('leaderboard')
    .setDescription('Check the server leaderboard for levels and XP.')
    .addIntegerOption((option) => option.setName('page').setDescription('The page number of the leaderboard to view.').setRequired(false).setMinValue(1)),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      return;
    }

    await interaction.deferReply();

    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig || !levelingConfig.enabled) {
      return interaction.editReply({ content: t('leveling.disabled') });
    }

    const itemsPerPage = 10;
    const totalUsers = await getTotalUsersWithXP(interaction.guildId);

    if (totalUsers === 0) {
      return interaction.editReply({ content: t('leveling.leaderboard.noUsers') });
    }

    const maxPages = Math.ceil(totalUsers / itemsPerPage);
    let currentPage = interaction.options.getInteger('page') || 1;

    if (currentPage > maxPages) currentPage = maxPages;

    const generateLeaderboardPage = async (page: number) => {
      const offset = (page - 1) * itemsPerPage;
      const topUsers = await getTopUsersByXP(interaction.guildId, itemsPerPage, offset);

      const leaderboardText = topUsers
        .map((user, index) => {
          const level = getLevelFromXP(user.xp);
          return t('leveling.leaderboard.entry', {
            position: index + 1 + offset,
            user: userMention(user.userId),
            level,
            xp: user.xp,
          });
        })
        .join('\n');

      const embed = new EmbedBuilder()
        .setTitle(t('leveling.leaderboard.title', { guild: interaction.guild.name }))
        .setDescription(leaderboardText)
        .setColor(Colors.Gold);

      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('lb_first')
          // .setLabel(t('pagination.first.label'))
          .setEmoji(t('pagination.first.icon'))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 1),
        new ButtonBuilder()
          .setCustomId('lb_prev')
          // .setLabel(t('pagination.previous.label'))
          .setEmoji(t('pagination.previous.icon'))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(maxPages === 1),
        new ButtonBuilder()
          .setCustomId('lb_custom')
          .setLabel(t('pagination.page.label', { current: page, total: maxPages }))
          // .setEmoji(t('pagination.page.icon'))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(false),
        new ButtonBuilder()
          .setCustomId('lb_next')
          // .setLabel(t('pagination.next.label'))
          .setEmoji(t('pagination.next.icon'))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(maxPages === 1),
        new ButtonBuilder()
          .setCustomId('lb_last')
          // .setLabel(t('pagination.last.label'))
          .setEmoji(t('pagination.last.icon'))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === maxPages),
      );
      return { embeds: [embed], components: [actionRow] };
    };

    const initialUI = await generateLeaderboardPage(currentPage);
    const message = await interaction.editReply(initialUI);

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === interaction.user.id,
      time: 300_000,
      idle: 120_000,
    });

    collector.on('collect', async (i) => {
      if (i.customId === 'lb_custom') {
        await i.showModal(
          new ModalBuilder()
            .setCustomId('lb_page_select')
            .setTitle(t('pagination.modal.title'))
            .addLabelComponents(
              new LabelBuilder()
                .setLabel(t('pagination.modal.label'))
                .setTextInputComponent(
                  new TextInputBuilder()
                    .setCustomId('page_input')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(t('pagination.modal.placeholder', { maxPages }))
                    .setValue(currentPage.toString())
                    .setMinLength(1)
                    .setMaxLength(maxPages.toString().length)
                    .setRequired(true),
                ),
            ),
        );

        const modalSubmit = await i
          .awaitModalSubmit({ time: 60_000, filter: (submit) => submit.customId === 'lb_page_select' && submit.user.id === interaction.user.id })
          .catch(() => null);
        if (!modalSubmit) {
          return i.followUp({ content: t('pagination.modal.timeout'), flags: [MessageFlags.Ephemeral] });
        }
        const requestedPage = parseInt(modalSubmit.fields.getTextInputValue('page_input'), 10);

        if (isNaN(requestedPage) || requestedPage < 1 || requestedPage > maxPages) {
          return modalSubmit.reply({ content: t('pagination.modal.invalid', { maxPages }), flags: [MessageFlags.Ephemeral] });
        }

        await modalSubmit.deferUpdate();
        currentPage = requestedPage;
        const updatedPage = await generateLeaderboardPage(currentPage);
        await modalSubmit.editReply(updatedPage);
        return;
      }
      if (i.customId === 'lb_first') currentPage = 1;
      if (i.customId === 'lb_last') currentPage = maxPages;
      if (i.customId === 'lb_prev') currentPage = currentPage === 1 ? maxPages : currentPage - 1;
      if (i.customId === 'lb_next') currentPage = currentPage === maxPages ? 1 : currentPage + 1;

      const updatedPage = await generateLeaderboardPage(currentPage);
      await i.update(updatedPage);
    });

    collector.on('end', () => {
      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('lb_first')
          // .setLabel(t('pagination.first.label'))
          .setEmoji(t('pagination.first.icon'))
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('lb_prev')
          // .setLabel(t('pagination.previous.label'))
          .setEmoji(t('pagination.previous.icon'))
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('lb_custom')
          .setLabel(t('pagination.page.label', { current: currentPage, total: maxPages }))
          // .setEmoji(t('pagination.page.icon'))
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('lb_next')
          // .setLabel(t('pagination.next.label'))
          .setEmoji(t('pagination.next.icon'))
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('lb_last')
          // .setLabel(t('pagination.last.label'))
          .setEmoji(t('pagination.last.icon'))
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
      );

      interaction.editReply({ components: [disabledRow.toJSON()] }).catch(() => null);
    });
  },
});
