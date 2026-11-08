import { bold, ContainerBuilder, SectionBuilder, SeparatorBuilder, TextDisplayBuilder, ThumbnailBuilder } from 'discord.js';

import { formatNumber } from 'utility/duration';
import { withTypeEmoji } from 'utility/emojis';
import type { Translate } from 'utility/i18next';
import { type ApiNature, getBerry, getItem, getNature } from 'utility/pokedex/api';
import { CONDITION_TYPES, emojiBar } from 'utility/pokedex/bars';
import { apiName, newestText } from 'utility/pokedex/lookup';
import { getPokedexData, nameOf } from 'utility/pokedex/names';
import { linkSelect, type PageContext } from 'utility/pokedex/pages';
import { TYPE_COLORS } from 'utility/pokedex/types';
import { messageOf, type ResponsePayload } from 'utility/response';
import { quote } from 'utility/text';
import { ThemeColors } from 'utility/theme';

const FLAVORS = ['spicy', 'dry', 'sweet', 'bitter', 'sour'] as const;
/** The strongest a berry's flavor is, which fills its bar. */
const MAX_POTENCY = 40;
const FIRMNESSES = ['very-soft', 'soft', 'hard', 'very-hard', 'super-hard'] as const;
const isOneOf = <T extends string>(list: readonly T[], value: string): value is T => (list as readonly string[]).includes(value);

/** The natures whose Pokémon like a flavor, like Adamant ones Spicy. */
export async function naturesLiking(flavor: string): Promise<ApiNature[]> {
  const natures = await Promise.all(Object.keys(getPokedexData().natures).map((slug) => getNature(slug)));
  return natures.filter((nature) => nature !== null && nature.likes_flavor?.name === flavor) as ApiNature[];
}

/** A berry flavor's name, like Spicy. */
export const flavorName = (slug: string, t: Translate) => (isOneOf(FLAVORS, slug) ? t(`berries.flavors.${slug}`) : slug);

/**
 * A berry, by its item: its picture and description, its flavors, how it grows, and what Natural Gift does with it.
 * @param itemSlug The berry's item, like `cheri-berry`.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 * @returns The answer, or null when PokéAPI doesn't know the berry.
 */
export async function buildBerry(itemSlug: string, language: string, t: Translate, context: PageContext): Promise<ResponsePayload | null> {
  const berrySlug = Object.entries(getPokedexData().berries).find(([, item]) => item === itemSlug)?.[0];
  if (!berrySlug) return null;
  const [berry, item] = await Promise.all([getBerry(berrySlug), getItem(itemSlug)]);
  if (!berry || !item) return null;

  const name = apiName(item.names, language) ?? nameOf('items', itemSlug, language);
  const description = newestText(item.flavor_text_entries, 'text', language);
  // Every flavor, in the games' order, as a bar in its Pokéblock's color, so berries can be told apart at a glance
  const potency = (flavor: string) => berry.flavors.find((entry) => entry.flavor.name === flavor)?.potency ?? 0;
  const flavors = FLAVORS.map(
    (flavor) =>
      `${emojiBar(potency(flavor), MAX_POTENCY, CONDITION_TYPES[flavor] ?? 'normal')} ${bold(formatNumber(potency(flavor), t))} ${flavorName(flavor, t)}`,
  );
  const firmness = isOneOf(FIRMNESSES, berry.firmness.name) ? t(`berries.firmness.${berry.firmness.name}`) : berry.firmness.name;
  const giftType = berry.natural_gift_type.name;

  const header = new TextDisplayBuilder().setContent([t('berries.title', { name }), description ? quote(description) : null].filter(Boolean).join('\n'));
  const container = new ContainerBuilder().setAccentColor(TYPE_COLORS[giftType] ?? ThemeColors.info);
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
    `${bold(t('berries.firmnessLabel'))} ${firmness}`,
    `${bold(t('berries.size'))} ${formatNumber(berry.size / 10, t, { maximumFractionDigits: 1 })} cm`,
    // The games count the time to grow in stages, which are this many hours each
    `${bold(t('berries.growth'))} ${t('berries.growthTime', { hours: formatNumber(berry.growth_time, t) })}`,
    `${bold(t('berries.harvest'))} ${t('berries.harvestCount', { count: formatNumber(berry.max_harvest, t) })}`,
    `${bold(t('berries.naturalGift'))} ${t('berries.giftPower', { type: withTypeEmoji(giftType, nameOf('types', giftType, language)), power: formatNumber(berry.natural_gift_power, t) })}`,
  ];
  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([bold(t('berries.flavor')), ...flavors].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(details.join('\n')));
  // Its item's page, and the natures that like its strongest flavor, as Pokémon of those like it best
  const strongest = [...berry.flavors].sort((a, b) => b.potency - a.potency)[0];
  const natures = strongest && strongest.potency > 0 ? await naturesLiking(strongest.flavor.name) : [];
  const links = linkSelect(
    context.page,
    [
      { page: { kind: 'item', slug: itemSlug }, label: t('pages.itemOf', { name }) },
      ...natures.map((nature) => ({
        page: { kind: 'nature' as const, slug: nature.name },
        label: apiName(nature.names, language) ?? nameOf('natures', nature.name, language),
        description: t('pages.likes', { flavor: flavorName(strongest?.flavor.name ?? '', t) }),
      })),
    ],
    t('pages.links.berry'),
  );
  if (links) container.addActionRowComponents(links);
  return messageOf(container);
}
