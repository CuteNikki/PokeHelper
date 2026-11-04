import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';

import { Command } from 'classes/base/command';

import { getTranslate, resolveLanguage } from 'utility/i18next';
import { logger } from 'utility/logger';
import { PokeApiError } from 'utility/pokeapi';
import { buildPokedexEntry } from 'utility/pokedex';
import { findPokemon, formatDexNumber, loadPokedexData, matchName, matchSlug, searchPokemon } from 'utility/pokedexData';
import { createResponse, sendResponse } from 'utility/response';

/** Discord shows at most 25 autocomplete choices. */
const MAX_CHOICES = 25;

/** Replace the "thinking" reply with an error only the user sees, as the entry would have been public. */
async function fail(interaction: ChatInputCommandInteraction, text: string) {
  await interaction.deleteReply().catch(() => null);
  return sendResponse(interaction, createResponse(text, 'error'), { ephemeral: true });
}

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setName('pokedex')
    .setDescription('Look up a Pokémon: its types, stats, abilities and evolutions')
    .addStringOption((option) =>
      option.setName('pokemon').setDescription('The Pokémon, by name or Pokédex number').setAutocomplete(true).setMaxLength(100).setRequired(true),
    ),

  async autocomplete(interaction) {
    const language = resolveLanguage(interaction.locale);
    // Without the names there's nothing to suggest, but what's typed can still be looked up once they're back
    const loaded = await loadPokedexData().catch(() => null);
    if (!loaded) return interaction.respond([]);

    const choices = searchPokemon(interaction.options.getFocused(), MAX_CHOICES).map((match) => ({
      name: `${formatDexNumber(match.species.id)} ${matchName(match, language)}`.slice(0, 100),
      value: matchSlug(match),
    }));
    return interaction.respond(choices);
  },

  async execute(interaction) {
    const t = getTranslate(interaction.locale);
    const input = interaction.options.getString('pokemon', true);

    // PokéAPI can take a moment the first time a Pokémon is looked up
    await interaction.deferReply();
    try {
      await loadPokedexData();
      // What's typed doesn't have to be one of the suggestions, so it's looked up by any name or number
      const match = findPokemon(input);
      const entry = match ? await buildPokedexEntry(match, false, resolveLanguage(interaction.locale), t) : null;
      if (!entry) return fail(interaction, t('pokedex.notFound', { name: input }));
      return sendResponse(interaction, entry);
    } catch (error) {
      if (!(error instanceof PokeApiError)) throw error;
      logger.warn(error, error.message);
      return fail(interaction, t('pokedex.unavailable'));
    }
  },
});
