import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { t } from 'i18next';

import { Command } from 'classes/base/command';

import { getGuildLevelingConfiguration } from 'database/leveling';
import { buildLeaderboard } from 'utility/leaderboard';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setName('leaderboard')
    .setDescription('Check the server leaderboard for levels and XP.')
    .addIntegerOption((option) => option.setName('page').setDescription('The page number of the leaderboard to view.').setRequired(false).setMinValue(1))
    .addBooleanOption((option) => option.setName('weekly').setDescription('Whether to view the weekly leaderboard.').setRequired(false)),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      return;
    }

    await interaction.deferReply();

    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig || !levelingConfig.enabled) {
      return interaction.editReply({ content: t('leveling.disabled') });
    }

    await buildLeaderboard({
      page: interaction.options.getInteger('page') || 1,
      guild: interaction.guild,
      weekly: interaction.options.getBoolean('weekly') || false,
    }).then((response) => interaction.editReply(response));
  },
});
