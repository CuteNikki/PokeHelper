import { ApplicationIntegrationType, type AutocompleteInteraction, InteractionContextType, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { DiscordLimits } from 'utility/discordLimits';
import { SECOND } from 'utility/duration';
import { getTranslate, resolveLanguage, type Translate } from 'utility/i18next';
import { answerPokeApiError } from 'utility/pokedex/api';
import { findNamed, loadPokedexData, MAX_NAME_INPUT, nameOf, type NameTable, searchNamed } from 'utility/pokedex/names';
import { renderPage, withPreferredView } from 'utility/pokedex/pageRender';
import type { DexPage, PageKind } from 'utility/pokedex/pages';
import { replaceWithError, sendResponse } from 'utility/response';

/**
 * How long suggestions wait for the names. Discord drops an answer after 3 seconds, and loading the names can take far longer when
 * PokéAPI is slow, so the load carries on and the suggestions come with a later keystroke.
 */
export const AUTOCOMPLETE_WAIT = 2 * SECOND;

/** Whether the names are there for suggestions, waiting for them no longer than Discord does. */
export const namesForSuggestions = () =>
  Promise.race([loadPokedexData().catch(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), AUTOCOMPLETE_WAIT))]);

/**
 * A command that looks something up by name, like /item: suggestions in every language while typing, and the page of what's typed,
 * found by any of its names.
 */
export function lookupCommand(options: {
  name: string;
  description: string;
  /** What's looked up, like `items`. */
  table: NameTable;
  /** The page it opens, like `item`. */
  kind: PageKind;
  option: { name: string; description: string; required?: boolean };
  /** Which of the table can be looked up, like only the items that are berries. */
  only?: (slug: string) => boolean;
  /** What tells suggestions with the same name apart, after it, like the region of a place. */
  suggestionDetail?: (slug: string, language: string) => string | null;
  /** The page when nothing was given, for an option that isn't required. */
  empty?: DexPage;
  notFound: (input: string, t: Translate) => string;
}): Command {
  const required = options.option.required ?? true;
  return new Command({
    data: new SlashCommandBuilder()
      .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
      .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
      .setName(options.name)
      .setDescription(options.description)
      .addStringOption((option) =>
        option.setName(options.option.name).setDescription(options.option.description).setAutocomplete(true).setMaxLength(MAX_NAME_INPUT).setRequired(required),
      ),

    async autocomplete(interaction: AutocompleteInteraction) {
      const language = resolveLanguage(interaction.locale);
      // Without the names there's nothing to suggest, but what's typed can still be looked up once they're back
      if (!(await namesForSuggestions())) return interaction.respond([]);
      const slugs = searchNamed(options.table, interaction.options.getFocused(), DiscordLimits.autocompleteChoices, options.only);
      return interaction.respond(
        slugs.map((slug) => {
          const detail = options.suggestionDetail?.(slug, language);
          const name = nameOf(options.table, slug, language);
          return { name: (detail ? `${name} · ${detail}` : name).slice(0, DiscordLimits.optionLabelLength), value: slug };
        }),
      );
    },

    async execute(interaction) {
      const t = getTranslate(interaction.locale);
      const language = resolveLanguage(interaction.locale);
      const input = interaction.options.getString(options.option.name, required);

      // PokéAPI can take a moment the first time something is looked up
      await interaction.deferReply();
      try {
        await loadPokedexData();
        // What's typed doesn't have to be one of the suggestions, so it's looked up by any name
        const slug = input ? findNamed(options.table, input, options.only) : null;
        const page = slug ? { kind: options.kind, slug } : input ? null : (options.empty ?? null);
        const answer = page ? await renderPage(withPreferredView({ page, back: null }, interaction.user.id), language, t) : null;
        if (!answer) return await replaceWithError(interaction, options.notFound(input ?? '', t));
        return await sendResponse(interaction, answer);
      } catch (error) {
        return answerPokeApiError(interaction, error, t, { replace: true });
      }
    },
  });
}
