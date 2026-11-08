import { ContainerBuilder, subtext, TextDisplayBuilder } from 'discord.js';

import { formatNumber } from 'utility/duration';
import type { Translate } from 'utility/i18next';
import { getAbility, idFromUrl } from 'utility/pokedex/api';
import { addBlocks, apiName, labeled, newestText, textIn } from 'utility/pokedex/lookup';
import { listWithMore, pokemonNames } from 'utility/pokedex/lookups/item';
import { nameOf } from 'utility/pokedex/names';
import { linkSelect, type PageContext, pokemonLinks } from 'utility/pokedex/pages';
import { messageOf, type ResponsePayload } from 'utility/response';
import { quote } from 'utility/text';
import { ThemeColors } from 'utility/theme';

/** The most Pokémon listed with an ability, so a common one doesn't make a wall of names. */
const MAX_POKEMON = 30;

/**
 * An ability: its description from the games and its effect, and the Pokémon that can have it, with the ones that only have it as
 * their hidden ability marked. Null when PokéAPI doesn't know it.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 */
export async function buildAbility(slug: string, language: string, t: Translate, context: PageContext): Promise<ResponsePayload | null> {
  const ability = await getAbility(slug);
  if (!ability) return null;

  const name = apiName(ability.names, language) ?? nameOf('abilities', slug, language);
  const description = newestText(ability.flavor_text_entries, 'flavor_text', language);
  const effect = textIn(ability.effect_entries, 'short_effect', language);
  const names = pokemonNames(
    ability.pokemon.map((entry) => entry.pokemon.name),
    language,
  );
  // Those that have it as their hidden ability apart, as they're harder to get with it
  const usual = names.filter((_, index) => !ability.pokemon[index]?.is_hidden);
  const hidden = names.filter((_, index) => ability.pokemon[index]?.is_hidden);
  const list = (label: string, pokemon: string[]) =>
    pokemon.length > 0 ? labeled(`${label} · ${formatNumber(pokemon.length, t)}`, listWithMore(pokemon, MAX_POKEMON, t)) : null;

  const header = [
    t('abilities.title', { name }),
    subtext(t('lookup.generation', { number: idFromUrl(ability.generation.url) })),
    description ? quote(description) : null,
  ];
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(header.filter(Boolean).join('\n')));
  addBlocks(container, [
    effect && labeled(t('abilities.effect'), effect),
    [list(t('abilities.pokemon'), usual), list(t('abilities.hidden'), hidden)].filter(Boolean).join('\n\n'),
  ]);
  const hiddenSlugs = new Set(ability.pokemon.filter((entry) => entry.is_hidden).map((entry) => entry.pokemon.name));
  const links = linkSelect(
    context.page,
    pokemonLinks(
      ability.pokemon.map((entry) => entry.pokemon.name),
      language,
      (pokemon) => (hiddenSlugs.has(pokemon) ? t('abilities.hidden') : null),
    ),
    t('pages.links.pokemon'),
  );
  if (links) container.addActionRowComponents(links);
  return messageOf(container);
}
