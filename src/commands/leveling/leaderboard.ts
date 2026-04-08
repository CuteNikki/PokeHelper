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
} from 'discord.js';

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
      return interaction.reply({ content: 'This command can only be used in a server.', flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferReply();

    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig || !levelingConfig.enabled) {
      return interaction.editReply({ content: 'The leveling system is not configured or enabled for this server!' });
    }

    const itemsPerPage = 10;
    const totalUsers = await getTotalUsersWithXP(interaction.guildId);

    if (totalUsers === 0) {
      return interaction.editReply({ content: 'No users have gained XP in this server yet! Start chatting!' });
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
          return `**${index + 1 + offset}.** <@${user.userId}> — Level **${level}** (${user.xp} XP)`;
        })
        .join('\n\n');

      const embed = new EmbedBuilder()
        .setTitle(`🏆 Leveling Leaderboard | ${interaction.guild.name}`)
        .setDescription(leaderboardText)
        .setColor(Colors.Gold)
        .setFooter({ text: `Page ${page} of ${maxPages} • ${totalUsers} total users` });

      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('lb_first')
          .setLabel('First')
          .setEmoji('⏮️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 1),
        new ButtonBuilder()
          .setCustomId('lb_prev')
          .setLabel('Previous')
          .setEmoji('◀️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(maxPages === 1),
        new ButtonBuilder().setCustomId('lb_custom').setLabel(`Page ${page}/${maxPages}`).setEmoji('⏸️').setStyle(ButtonStyle.Secondary).setDisabled(false),
        new ButtonBuilder()
          .setCustomId('lb_next')
          .setLabel('Next')
          .setEmoji('▶️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(maxPages === 1),
        new ButtonBuilder()
          .setCustomId('lb_last')
          .setLabel('Last')
          .setEmoji('⏭️')
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
            .setTitle('Select Page')
            .addLabelComponents(
              new LabelBuilder()
                .setLabel('Page Number')
                .setTextInputComponent(
                  new TextInputBuilder()
                    .setCustomId('page_input')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(`Enter a page number (1-${maxPages})`)
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
          return i.followUp({ content: 'You did not submit a page number in time!', flags: [MessageFlags.Ephemeral] });
        }
        const requestedPage = parseInt(modalSubmit.fields.getTextInputValue('page_input'), 10);

        if (isNaN(requestedPage) || requestedPage < 1 || requestedPage > maxPages) {
          return modalSubmit.reply({ content: `Please enter a valid page number between 1 and ${maxPages}.`, flags: [MessageFlags.Ephemeral] });
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
        new ButtonBuilder().setCustomId('lb_first').setLabel('First').setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId('lb_prev').setLabel('Previous').setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId('lb_custom').setLabel(`Page ${currentPage}/${maxPages}`).setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId('lb_next').setLabel('Next').setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId('lb_last').setLabel('Last').setStyle(ButtonStyle.Primary).setDisabled(true),
      );

      interaction.editReply({ components: [disabledRow.toJSON()] }).catch(() => null);
    });
  },
});
