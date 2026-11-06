import { bold, ContainerBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, subtext, TextDisplayBuilder, ThumbnailBuilder } from 'discord.js';

import { formatNumber } from 'utility/duration';
import type { Translate } from 'utility/i18next';
import { getItem, getItemCategory } from 'utility/pokedex/api';
import { apiName, newestText, textIn } from 'utility/pokedex/lookup';
import { findBySlug, fromSlug, matchName, nameOf } from 'utility/pokedex/names';
import type { ResponsePayload } from 'utility/response';
import { quote } from 'utility/text';
import { ThemeColors } from 'utility/theme';

/** The most wild Pokémon listed that hold an item, so a common one doesn't make a wall of names. */
const MAX_HOLDERS = 15;

/** A list of names, with how many more there are after the most that are listed. */
export function listWithMore(names: string[], max: number, t: Translate): string {
  const listed = names.slice(0, max).join(', ');
  return names.length > max ? `${listed} ${t('lookup.more', { count: names.length - max })}` : listed;
}

/** The names of Pokémon by their slugs, in the language. */
export const pokemonNames = (slugs: string[], language: string) =>
  slugs.map((slug) => {
    const match = findBySlug(slug);
    return match ? matchName(match, language) : fromSlug(slug);
  });

/**
 * An item: its picture, its kind, its description from the games and its effect, and which wild Pokémon hold it.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 * @returns The answer, or null when PokéAPI doesn't know the item.
 */
export async function buildItem(slug: string, language: string, t: Translate): Promise<ResponsePayload | null> {
  const item = await getItem(slug);
  if (!item) return null;
  const category = await getItemCategory(item.category.name);

  const name = apiName(item.names, language) ?? nameOf('items', slug, language);
  // Only in the language, as most kinds have no name but the English one
  const kind = category?.names.find((entry) => entry.language.name === language)?.name ?? null;
  const description = newestText(item.flavor_text_entries, 'text', language);
  const effect = textIn(item.effect_entries, 'short_effect', language);
  const holders = pokemonNames(
    item.held_by_pokemon.map((holder) => holder.pokemon.name),
    language,
  );

  const header = new TextDisplayBuilder().setContent(
    [t('items.title', { name }), kind ? subtext(kind) : null, description ? quote(description) : null].filter(Boolean).join('\n'),
  );
  const container = new ContainerBuilder().setAccentColor(ThemeColors.info);
  if (item.sprites.default) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(header)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(item.sprites.default).setDescription(t('items.picture', { name }))),
    );
  } else {
    container.addTextDisplayComponents(header);
  }

  const details = [
    effect ? `${bold(t('items.effect'))} ${effect}` : null,
    item.fling_power ? `${bold(t('items.fling'))} ${formatNumber(item.fling_power, t)}` : null,
    holders.length > 0 ? `${bold(t('items.heldBy'))} ${listWithMore(holders, MAX_HOLDERS, t)}` : null,
  ].filter(Boolean);
  if (details.length > 0) {
    container.addSeparatorComponents(new SeparatorBuilder()).addTextDisplayComponents(new TextDisplayBuilder().setContent(details.join('\n')));
  }
  return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}
