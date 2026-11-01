import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { getGuildLevelingConfiguration } from 'database/leveling';

import { getTranslate } from 'utility/i18next';
import { buildLeaderboard } from 'utility/leaderboard';
import { saveLeaderboardState } from 'utility/leaderboardState';
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
    await interaction.deferReply();

    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig || !levelingConfig.enabled) {
      return sendError(interaction, t('leveling.disabled'));
    }

    const state = {
      page: interaction.options.getInteger('page') || 1,
      sortOrder: 'desc' as const,
      weekly: interaction.options.getBoolean('weekly') || false,
      text: interaction.options.getBoolean('text') || false,
    };

    const message = await interaction.editReply(await buildLeaderboard({ ...state, guild: interaction.guild, t }));
    // The buttons rebuild the page from this, including whether it's shown as text
    await saveLeaderboardState({ ...state, messageId: message.id });
  },
});
