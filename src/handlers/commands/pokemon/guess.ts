import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { getTranslate, resolveLanguage } from 'utility/i18next';
import { logger } from 'utility/logger';
import { PokeApiError } from 'utility/pokedex/api';
import { buildGuessGame, GENERATIONS, newGame } from 'utility/pokedex/guess';
import { loadPokedexData } from 'utility/pokedex/names';
import { replaceWithError, sendResponse } from 'utility/response';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setName('guess')
    .setDescription('Guess a Pokémon from its silhouette')
    .addIntegerOption((option) =>
      option.setName('generation').setDescription('Only Pokémon from this generation').setMinValue(1).setMaxValue(GENERATIONS).setRequired(false),
    ),

  async execute(interaction) {
    const t = getTranslate(interaction.locale);
    await interaction.deferReply();
    try {
      await loadPokedexData();
      const game = newGame(interaction.options.getInteger('generation'));
      const payload = game ? await buildGuessGame(game, 'playing', resolveLanguage(interaction.locale), t) : null;
      if (!payload) return replaceWithError(interaction, t('pokedex.unavailable'));
      return sendResponse(interaction, payload);
    } catch (error) {
      if (!(error instanceof PokeApiError)) throw error;
      logger.warn(error, error.message);
      return replaceWithError(interaction, t('pokedex.unavailable'));
    }
  },
});
