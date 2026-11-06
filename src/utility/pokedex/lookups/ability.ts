import { bold, ContainerBuilder, MessageFlags, SeparatorBuilder, subtext, TextDisplayBuilder } from 'discord.js';

import type { Translate } from 'utility/i18next';
import { getAbility, idFromUrl } from 'utility/pokedex/api';
import { apiName, newestText, textIn } from 'utility/pokedex/lookup';
import { listWithMore, pokemonNames } from 'utility/pokedex/lookups/item';
import { nameOf } from 'utility/pokedex/names';
import type { ResponsePayload } from 'utility/response';
import { quote } from 'utility/text';
import { ThemeColors } from 'utility/theme';

/** The most Pokémon listed with an ability, so a common one doesn't make a wall of names. */
const MAX_POKEMON = 30;

/**
 * An ability: its description from the games and its effect, and the Pokémon that can have it, with the ones that only have it as
 * their hidden ability marked.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 * @returns The answer, or null when PokéAPI doesn't know the ability.
 */
export async function buildAbility(slug: string, language: string, t: Translate): Promise<ResponsePayload | null> {
  const ability = await getAbility(slug);
  if (!ability) return null;

  const name = apiName(ability.names, language) ?? nameOf('abilities', slug, language);
  const description = newestText(ability.flavor_text_entries, 'flavor_text', language);
  const effect = textIn(ability.effect_entries, 'short_effect', language);
  const names = pokemonNames(
    ability.pokemon.map((entry) => entry.pokemon.name),
    language,
  );
  const pokemon = names.map((pokemonName, index) => (ability.pokemon[index]?.is_hidden ? t('pokedex.hiddenAbility', { name: pokemonName }) : pokemonName));

  const header = [
    t('abilities.title', { name }),
    subtext(t('lookup.generation', { number: idFromUrl(ability.generation.url) })),
    description ? quote(description) : null,
  ];
  const details = [
    effect ? `${bold(t('abilities.effect'))} ${effect}` : null,
    pokemon.length > 0 ? `${bold(t('abilities.pokemon'))} ${listWithMore(pokemon, MAX_POKEMON, t)}` : null,
  ].filter(Boolean);

  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(header.filter(Boolean).join('\n')));
  if (details.length > 0) {
    container.addSeparatorComponents(new SeparatorBuilder()).addTextDisplayComponents(new TextDisplayBuilder().setContent(details.join('\n')));
  }
  return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}
