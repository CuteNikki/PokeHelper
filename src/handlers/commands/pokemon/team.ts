import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { DiscordLimits } from 'utility/discordLimits';
import { getTranslate, resolveLanguage } from 'utility/i18next';
import { answerPokeApiError } from 'utility/pokedex/api';
import { namesForSuggestions } from 'utility/pokedex/lookupCommand';
import { findPokemon, formatDexNumber, loadPokedexData, matchName, matchSlug, MAX_NAME_INPUT, searchPokemon } from 'utility/pokedex/names';
import { renderPage } from 'utility/pokedex/pageRender';
import { MAX_TEAM, TEAM_SEPARATOR } from 'utility/pokedex/team';
import { replaceWithError, sendResponse } from 'utility/response';

/** The options of the team's Pokémon, `pokemon`, then `pokemon2` to `pokemon6`. */
const OPTIONS = Array.from({ length: MAX_TEAM }, (_, index) => (index === 0 ? 'pokemon' : `pokemon${index + 1}`));

const data = new SlashCommandBuilder()
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
  .setName('team')
  .setDescription('See which types your team is weak to')
  .addStringOption((option) =>
    option.setName('pokemon').setDescription('Pokémon 1 of your team').setAutocomplete(true).setMaxLength(MAX_NAME_INPUT).setRequired(true),
  );
for (const [index, name] of OPTIONS.slice(1).entries()) {
  data.addStringOption((option) =>
    option
      .setName(name)
      .setDescription(`Pokémon ${index + 2} of your team`)
      .setAutocomplete(true)
      .setMaxLength(MAX_NAME_INPUT)
      .setRequired(false),
  );
}

export default new Command({
  data,

  async autocomplete(interaction) {
    const language = resolveLanguage(interaction.locale);
    // Without the names there's nothing to suggest, but what's typed can still be looked up once they're back
    if (!(await namesForSuggestions())) return interaction.respond([]);
    const choices = searchPokemon(interaction.options.getFocused(), DiscordLimits.autocompleteChoices).map((match) => ({
      name: `${formatDexNumber(match.species.id)} ${matchName(match, language)}`.slice(0, DiscordLimits.optionLabelLength),
      value: matchSlug(match),
    }));
    return interaction.respond(choices);
  },

  async execute(interaction) {
    const t = getTranslate(interaction.locale);
    const inputs = OPTIONS.map((name) => interaction.options.getString(name)).filter((input): input is string => Boolean(input));

    await interaction.deferReply();
    try {
      await loadPokedexData();
      // What's typed doesn't have to be one of the suggestions, so each is looked up by any name or number
      const slugs: string[] = [];
      for (const input of inputs) {
        const match = findPokemon(input);
        if (!match) return await replaceWithError(interaction, t('team.notFound', { name: input }));
        slugs.push(matchSlug(match));
      }
      const answer = await renderPage({ page: { kind: 'team', slug: slugs.join(TEAM_SEPARATOR) }, back: null }, resolveLanguage(interaction.locale), t);
      if (!answer) return await replaceWithError(interaction, t('team.notFound', { name: inputs.join(', ') }));
      return await sendResponse(interaction, answer);
    } catch (error) {
      return answerPokeApiError(interaction, error, t, { replace: true });
    }
  },
});
