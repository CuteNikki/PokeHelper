import { SectionBuilder, subtext, TextDisplayBuilder, ThumbnailBuilder } from 'discord.js';

import { withTypeEmoji } from 'utility/emojis';
import { FALLBACK_LANGUAGE, type Translate } from 'utility/i18next';
import { type ApiPokemon, type ApiSpecies, artworkUrl, getSpecies } from 'utility/pokedex/api';
import { newestText } from 'utility/pokedex/lookup';
import { formatDexNumber, matchName, nameOf, type PokedexMatch } from 'utility/pokedex/names';
import { quote } from 'utility/text';

/** A species' kind in the language, or English, like "Mouse Pokémon". */
export function genus(species: ApiSpecies, language: string): string | null {
  const find = (lang: string) => species.genera.find((entry) => entry.language.name === lang)?.genus;
  return find(language) ?? find(FALLBACK_LANGUAGE) ?? null;
}

/** A species' kind with whether it's legendary or mythical, like "Genetic Pokémon · Legendary". */
export const kindOf = (species: ApiSpecies, language: string, t: Translate) =>
  [genus(species, language), species.is_mythical ? t('pokedex.mythical') : species.is_legendary ? t('pokedex.legendary') : null].filter(Boolean).join(' · ');

/**
 * The top of a page about a Pokémon, like where it's found or the moves it learns, the same as its Pokédex entry's: the page's
 * title, its number, kind and types in a line, its Pokédex text, and its picture beside them.
 * @param pokemon Its data, for its types.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 */
export async function pokemonHeader(title: string, match: PokedexMatch, pokemon: ApiPokemon, language: string, t: Translate): Promise<SectionBuilder> {
  const species = await getSpecies(match.species.id);
  const name = matchName(match, language);
  const types = [...pokemon.types]
    .sort((a, b) => a.slot - b.slot)
    .map((entry) => withTypeEmoji(entry.type.name, nameOf('types', entry.type.name, language)))
    .join(' / ');
  const kind = species ? kindOf(species, language, t) : '';
  const entry = species ? newestText(species.flavor_text_entries, 'flavor_text', language) : null;
  const lines = [title, subtext([formatDexNumber(match.species.id), kind, types].filter(Boolean).join(' · ')), entry ? quote(entry) : null];
  return new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.filter(Boolean).join('\n'))).setThumbnailAccessory(
    // The form's own picture, like Alolan Raichu's, where it has one
    new ThumbnailBuilder()
      .setURL(pokemon.sprites.other?.['official-artwork']?.front_default ?? artworkUrl(match.species.id, false))
      .setDescription(t('pokedex.picture', { name })),
  );
}
