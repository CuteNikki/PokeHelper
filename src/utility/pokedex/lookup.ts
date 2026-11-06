import { ApplicationIntegrationType, type AutocompleteInteraction, InteractionContextType, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { DiscordLimits } from 'utility/discordLimits';
import { SECOND } from 'utility/duration';
import { FALLBACK_LANGUAGE, getTranslate, resolveLanguage, type Translate } from 'utility/i18next';
import { answerPokeApiError } from 'utility/pokedex/api';
import { findNamed, loadPokedexData, MAX_NAME_INPUT, nameOf, type NameTable, searchNamed } from 'utility/pokedex/names';
import { replaceWithError, type ResponsePayload, sendResponse } from 'utility/response';

/**
 * How long suggestions wait for the names. Discord drops an answer after 3 seconds, and loading the names can take far longer when
 * PokéAPI is slow, so the load carries on and the suggestions come with a later keystroke.
 */
const AUTOCOMPLETE_WAIT = 2 * SECOND;

/** Text from the games, which has hard line breaks, and hyphens from breaking words in the old ones, joined into one line. */
export const cleanGameText = (text: string) =>
  text
    .replace(/\u00ad\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Texts in several languages, as PokéAPI has them, like Pokédex entries or an item's descriptions. */
type InLanguages<K extends string> = ({ language: { name: string } } & Record<K, string>)[];

/**
 * The newest of the texts in the language, or English, as the newest games' texts come last.
 * @param key Where the text is, like `flavor_text`.
 */
export function newestText<K extends string>(entries: InLanguages<K>, key: K, language: string): string | null {
  const newest = (lang: string) => entries.findLast((entry) => entry.language.name === lang)?.[key];
  const text = newest(language) ?? newest(FALLBACK_LANGUAGE);
  return text ? cleanGameText(text) : null;
}

/** The text in the language only, like an effect, which PokéAPI mostly has in English. Null when it isn't in the language. */
export function textIn<K extends string>(entries: InLanguages<K>, key: K, language: string): string | null {
  const text = entries.find((entry) => entry.language.name === language)?.[key];
  return text ? cleanGameText(text) : null;
}

/** A name from PokéAPI's names in the language, or English. */
export const apiName = (names: { name: string; language: { name: string } }[], language: string) =>
  names.find((entry) => entry.language.name === language)?.name ?? names.find((entry) => entry.language.name === FALLBACK_LANGUAGE)?.name ?? null;

/**
 * A command that looks something up by name, like /item: suggestions in every language while typing, and the answer for
 * what's typed, found by any of its names.
 */
export function lookupCommand(options: {
  name: string;
  description: string;
  /** What's looked up, like `items`. */
  table: NameTable;
  option: { name: string; description: string; required?: boolean };
  /** Which of the table can be looked up, like only the items that are berries. */
  only?: (slug: string) => boolean;
  /** What tells suggestions with the same name apart, after it, like the region of a place. */
  suggestionDetail?: (slug: string, language: string) => string | null;
  /** The answer when nothing was given, for an option that isn't required. */
  empty?: (language: string, t: Translate) => Promise<ResponsePayload> | ResponsePayload;
  /** Not found is null, when PokéAPI doesn't know it after all. */
  build: (slug: string, language: string, t: Translate) => Promise<ResponsePayload | null>;
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
      const loaded = await Promise.race([
        loadPokedexData().catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), AUTOCOMPLETE_WAIT)),
      ]);
      if (!loaded) return interaction.respond([]);
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
        if (!input && options.empty) return await sendResponse(interaction, await options.empty(language, t));
        // What's typed doesn't have to be one of the suggestions, so it's looked up by any name
        const slug = input ? findNamed(options.table, input, options.only) : null;
        const answer = slug ? await options.build(slug, language, t) : null;
        if (!answer) return await replaceWithError(interaction, options.notFound(input ?? '', t));
        return await sendResponse(interaction, answer);
      } catch (error) {
        return answerPokeApiError(interaction, error, t, { replace: true });
      }
    },
  });
}
