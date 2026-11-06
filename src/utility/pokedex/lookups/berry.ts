import { bold, ContainerBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, TextDisplayBuilder, ThumbnailBuilder } from 'discord.js';

import { formatNumber } from 'utility/duration';
import { withTypeEmoji } from 'utility/emojis';
import type { Translate } from 'utility/i18next';
import { getBerry, getItem } from 'utility/pokedex/api';
import { apiName, newestText } from 'utility/pokedex/lookup';
import { getPokedexData, nameOf } from 'utility/pokedex/names';
import { TYPE_COLORS } from 'utility/pokedex/types';
import type { ResponsePayload } from 'utility/response';
import { quote } from 'utility/text';
import { ThemeColors } from 'utility/theme';

const FLAVORS = ['spicy', 'dry', 'sweet', 'bitter', 'sour'] as const;
const FIRMNESSES = ['very-soft', 'soft', 'hard', 'very-hard', 'super-hard'] as const;
const isOneOf = <T extends string>(list: readonly T[], value: string): value is T => (list as readonly string[]).includes(value);

/** Whether an item is a berry, for suggesting only those. */
export const isBerryItem = (slug: string) => Object.values(getPokedexData().berries).includes(slug);

/** A berry flavor's name, like Spicy. */
export const flavorName = (slug: string, t: Translate) => (isOneOf(FLAVORS, slug) ? t(`berries.flavors.${slug}`) : slug);

/**
 * A berry, by its item: its picture and description, its flavors, how it grows, and what Natural Gift does with it.
 * @param itemSlug The berry's item, like `cheri-berry`.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 * @returns The answer, or null when PokéAPI doesn't know the berry.
 */
export async function buildBerry(itemSlug: string, language: string, t: Translate): Promise<ResponsePayload | null> {
  const berrySlug = Object.entries(getPokedexData().berries).find(([, item]) => item === itemSlug)?.[0];
  if (!berrySlug) return null;
  const [berry, item] = await Promise.all([getBerry(berrySlug), getItem(itemSlug)]);
  if (!berry || !item) return null;

  const name = apiName(item.names, language) ?? nameOf('items', itemSlug, language);
  const description = newestText(item.flavor_text_entries, 'text', language);
  const flavors = berry.flavors
    .filter((flavor) => flavor.potency > 0)
    .sort((a, b) => b.potency - a.potency)
    .map((flavor) => `${flavorName(flavor.flavor.name, t)} ${formatNumber(flavor.potency, t)}`);
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
    flavors.length > 0 ? `${bold(t('berries.flavor'))} ${flavors.join(' · ')}` : null,
    `${bold(t('berries.firmnessLabel'))} ${firmness} · ${bold(t('berries.size'))} ${formatNumber(berry.size / 10, t, { maximumFractionDigits: 1 })} cm`,
    // The games count the time to grow in stages, which are this many hours each
    `${bold(t('berries.growth'))} ${t('berries.growthTime', { hours: formatNumber(berry.growth_time, t) })} · ${bold(t('berries.harvest'))} ${t('berries.harvestCount', { count: formatNumber(berry.max_harvest, t) })}`,
    `${bold(t('berries.naturalGift'))} ${withTypeEmoji(giftType, nameOf('types', giftType, language))} · ${formatNumber(berry.natural_gift_power, t)}`,
  ].filter(Boolean);
  container.addSeparatorComponents(new SeparatorBuilder()).addTextDisplayComponents(new TextDisplayBuilder().setContent(details.join('\n')));
  return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}
