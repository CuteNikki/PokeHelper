import {
  ActionRowBuilder,
  bold,
  heading as discordHeading,
  HeadingLevel,
  type ButtonBuilder,
  ContainerBuilder,
  MessageFlags,
  subtext,
  TextDisplayBuilder,
} from 'discord.js';

import { buttonIcon, typeEmoji, withTypeEmoji } from 'utility/emojis';
import type { Translate } from 'utility/i18next';
import { type ApiDamageRelations, getType } from 'utility/pokedex/api';
import { addBlocks, labeled } from 'utility/pokedex/lookup';
import { nameOf } from 'utility/pokedex/names';
import { linkSelect, type PageContext, pageButton, viewButton } from 'utility/pokedex/pages';
import { renderTypeChartCard } from 'utility/pokedex/typeChartCard';
import { typeIcon } from 'utility/pokedex/typeIcons';
import { TYPE_COLORS } from 'utility/pokedex/types';
import { imageWithDescription, messageOf, type ResponsePayload } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/** The types of the games, in their order, without the ones PokéAPI has besides, like Shadow. */
export const TYPES = Object.keys(TYPE_COLORS);
export const isType = (slug: string) => slug in TYPE_COLORS;

const toHex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
/** The types of a list of PokéAPI's, in the games' order. */
const inOrder = (types: { name: string }[]) => TYPES.filter((type) => types.some((entry) => entry.name === type));

/**
 * How every type does against the others, from PokéAPI, which has each on its own page.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 */
export async function allTypeRelations(): Promise<Record<string, ApiDamageRelations>> {
  const types = await Promise.all(TYPES.map(async (type) => [type, (await getType(type))?.damage_relations] as const));
  return Object.fromEntries(types.filter((entry): entry is readonly [string, ApiDamageRelations] => Boolean(entry[1])));
}

/** The button to the chart of all types, unless that's where Back goes already. */
const chartButton = (context: PageContext, t: Translate) =>
  context.back?.kind === 'types'
    ? null
    : pageButton({ kind: 'types', slug: 'all' }, context.page).setEmoji(buttonIcon('chart-column')).setLabel(t('types.chart.button'));

/**
 * A type: what its moves are strong and weak against, and what it's weak to and resists, with links to those types. Null when it
 * isn't one of the games' types.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 */
export async function buildTypePage(slug: string, language: string, t: Translate, context: PageContext): Promise<ResponsePayload | null> {
  if (!isType(slug)) return null;
  const relations = (await getType(slug))?.damage_relations;
  if (!relations) return null;

  const name = nameOf('types', slug, language);
  const list = (types: { name: string }[]) =>
    inOrder(types)
      .map((type) => withTypeEmoji(type, nameOf('types', type, language)))
      .join(', ');
  // Each group only when it has a type, like Normal, which isn't super effective against anything
  const group = (label: string, types: { name: string }[]) => (types.length > 0 ? labeled(label, list(types)) : null);
  const section = (heading: string, groups: (string | null)[]) => [discordHeading(heading, HeadingLevel.Three), ...groups.filter(Boolean)].join('\n\n');

  const container = new ContainerBuilder()
    .setAccentColor(TYPE_COLORS[slug] ?? ThemeColors.info)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${t('types.title', { name, icon: typeEmoji(slug) ?? '' }).trim()}\n${subtext(t('types.subtitle'))}`),
    );
  addBlocks(container, [
    section(t('types.attacking'), [
      group(t('types.superEffective'), relations.double_damage_to),
      group(t('types.notVeryEffective'), relations.half_damage_to),
      group(t('types.noEffect'), relations.no_damage_to),
    ]),
    section(t('types.defending'), [
      group(t('types.weakTo'), relations.double_damage_from),
      group(t('types.resists'), relations.half_damage_from),
      group(t('types.immuneTo'), relations.no_damage_from),
    ]),
  ]);

  const related = inOrder([
    ...relations.double_damage_to,
    ...relations.half_damage_to,
    ...relations.no_damage_to,
    ...relations.double_damage_from,
    ...relations.half_damage_from,
    ...relations.no_damage_from,
  ]).filter((type) => type !== slug);
  const links = linkSelect(
    context.page,
    related.map((type) => ({ page: { kind: 'type' as const, slug: type }, label: nameOf('types', type, language) })),
    t('pages.links.types'),
  );
  if (links) container.addActionRowComponents(links);
  const chart = chartButton(context, t);
  if (chart) container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(chart));
  return messageOf(container);
}

/**
 * The chart of all types: what each is strong against and weak to, as text when the page's slug is `text`, or else as a card like
 * the Pokédex's.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 */
export async function buildTypeChart(language: string, t: Translate, context: PageContext): Promise<ResponsePayload> {
  const relations = await allTypeRelations();
  const text = context.page.slug === 'text';
  const rows = TYPES.filter((type) => relations[type]).map((type) => ({
    type,
    name: nameOf('types', type, language),
    strong: inOrder(relations[type]?.double_damage_to ?? []),
    weak: inOrder(relations[type]?.double_damage_from ?? []),
  }));
  const names = (types: string[]) => types.map((type) => nameOf('types', type, language)).join(', ') || t('types.chart.nothing');

  const container = new ContainerBuilder().setAccentColor(ThemeColors.info);
  const files = [];
  if (text) {
    // The types in a row by name only, as an emoji each would make the chart too long for a message
    const lines = rows.map(
      (row) =>
        `${withTypeEmoji(row.type, bold(row.name))}\n${subtext(`${t('types.chart.strong')}: ${names(row.strong)} · ${t('types.chart.weak')}: ${names(row.weak)}`)}`,
    );
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent([t('types.chart.title'), ...lines].join('\n')));
  } else {
    const icons = Object.fromEntries(await Promise.all(TYPES.map(async (type) => [type, await typeIcon(type)] as const)));
    const card = renderTypeChartCard({
      labels: { type: t('types.chart.type'), strong: t('types.chart.strong'), weak: t('types.chart.weak') },
      rows: rows.map((row) => ({
        name: row.name,
        color: toHex(TYPE_COLORS[row.type] ?? ThemeColors.info),
        icon: icons[row.type] ?? null,
        strong: row.strong.map((type) => icons[type] ?? null),
        weak: row.weak.map((type) => icons[type] ?? null),
      })),
    });
    // The card is only pixels, so its description has the whole chart for screen readers
    const description = rows
      .map((row) => `${row.name}: ${t('types.chart.strong')} ${names(row.strong)}; ${t('types.chart.weak')} ${names(row.weak)}`)
      .join('. ');
    const { gallery, file } = imageWithDescription('types.png', card, description);
    files.push(file);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('types.chart.title'))).addMediaGalleryComponents(gallery);
  }

  const links = linkSelect(
    context.page,
    TYPES.map((type) => ({ page: { kind: 'type' as const, slug: type }, label: nameOf('types', type, language) })),
    t('pages.links.types'),
  );
  if (links) container.addActionRowComponents(links);
  // Between the card and the text, keeping the way back
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      viewButton({ kind: 'types', slug: text ? 'image' : 'text' })
        .setEmoji(buttonIcon(text ? 'image' : 'file-text'))
        .setLabel(t(text ? 'pokedex.view.image' : 'pokedex.view.text')),
    ),
  );
  return { components: [container], files, flags: [MessageFlags.IsComponentsV2] };
}
