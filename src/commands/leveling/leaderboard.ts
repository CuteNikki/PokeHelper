import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { getGuildLevelingConfiguration } from 'database/leveling';

import { getTranslate } from 'utility/i18next';
import { buildLeaderboard } from 'utility/leveling/leaderboard';
import { sendError } from 'utility/response';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setName('leaderboard')
    .setDescription('Check the server leaderboard for levels and XP.')
    .addIntegerOption((option) => option.setName('page').setDescription('The page number of the leaderboard to view.').setRequired(false).setMinValue(1))
    .addBooleanOption((option) => option.setName('weekly').setDescription('Whether to view the weekly leaderboard.').setRequired(false))
    .addBooleanOption((option) =>
      option.setName('text').setDescription('Show the leaderboard as text instead of an image, like for screen readers.').setRequired(false),
    ),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      return;
    }

    const t = getTranslate(interaction.locale);

    // Checked before answering, so this only goes to whoever asked instead of everyone
    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig?.enabled) return sendError(interaction, t('leveling.disabled'));

    await interaction.deferReply();
    // The buttons carry this view, so they work however old the message gets
    const view = {
      page: interaction.options.getInteger('page') || 1,
      sortOrder: 'desc' as const,
      weekly: interaction.options.getBoolean('weekly') || false,
      text: interaction.options.getBoolean('text') || false,
    };
    await interaction.editReply(await buildLeaderboard(view, interaction.guild, t));
  },
});
