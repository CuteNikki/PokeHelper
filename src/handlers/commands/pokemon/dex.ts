import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { DiscordLimits } from 'utility/discordLimits';
import { getTranslate, resolveLanguage } from 'utility/i18next';
import { answerPokeApiError } from 'utility/pokedex/api';
import { namesForSuggestions } from 'utility/pokedex/lookupCommand';
import { loadPokedexData, MAX_NAME_INPUT } from 'utility/pokedex/names';
import { renderPage } from 'utility/pokedex/pageRender';
import { decodePage, encodePage } from 'utility/pokedex/pages';
import { findAnything, searchEverything } from 'utility/pokedex/search';
import { replaceWithError, sendResponse } from 'utility/response';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setName('dex')
    .setDescription('Search everything at once: Pokémon, moves, abilities, items, berries, natures and places')
    .addStringOption((option) =>
      option
        .setName('search')
        .setDescription('A name in any language, or a Pokédex number')
        .setAutocomplete(true)
        .setMaxLength(MAX_NAME_INPUT)
        .setRequired(true),
    ),

  async autocomplete(interaction) {
    const t = getTranslate(interaction.locale);
    const language = resolveLanguage(interaction.locale);
    // Without the names there's nothing to suggest, but what's typed can still be looked up once they're back
    if (!(await namesForSuggestions())) return interaction.respond([]);
    const results = searchEverything(interaction.options.getFocused(), language, DiscordLimits.autocompleteChoices);
    return interaction.respond(
      results.map((result) => ({
        // What it is first, so a move and a Pokémon of the same name, like Psychic, can be told apart
        name: [t(`dex.kinds.${result.page.kind}`), result.name, result.detail].filter(Boolean).join(' · ').slice(0, DiscordLimits.optionLabelLength),
        value: encodePage(result.page),
      })),
    );
  },

  async execute(interaction) {
    const t = getTranslate(interaction.locale);
    const input = interaction.options.getString('search', true);

    // PokéAPI can take a moment the first time something is looked up
    await interaction.deferReply();
    try {
      await loadPokedexData();
      // A suggestion is the page itself, anything else is looked up by its name or number
      const page = decodePage(input) ?? findAnything(input);
      const answer = page ? await renderPage({ page, back: null }, resolveLanguage(interaction.locale), t) : null;
      if (!answer) return await replaceWithError(interaction, t('dex.notFound', { name: input }));
      return await sendResponse(interaction, answer);
    } catch (error) {
      return answerPokeApiError(interaction, error, t, { replace: true });
    }
  },
});
