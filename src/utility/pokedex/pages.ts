import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';

import { DiscordLimits } from 'utility/discordLimits';
import { buttonIcon } from 'utility/emojis';
import type { IconName } from 'utility/icons';
import type { Translate } from 'utility/i18next';
import { findBySlug, formatDexNumber, matchName } from 'utility/pokedex/names';

/**
 * The pages of the Pokédex, which link to each other: a Pokémon, a move, an item and so on, a list of all natures, where a Pokémon
 * is found, and the moves it learns. Each is written as `<kind>:<slug>`, with the game after it for the pages that show one game.
 */
export const PAGE_KINDS = [
  'pokemon',
  'move',
  'item',
  'ability',
  'berry',
  'nature',
  'natures',
  'location',
  'where',
  'learnset',
  'type',
  'types',
  'team',
] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

export interface DexPage {
  kind: PageKind;
  slug: string;
  /** The game it shows, for where a Pokémon is found, what's at a place and the moves it learns. Berries go by their item, like `cheri-berry`. */
  game?: string | null;
}

/** Where a page is, and the page it was opened from, for its Back button. */
export interface PageContext {
  page: DexPage;
  back: DexPage | null;
}

/** The icon of each kind of page, in front of links to it. */
export const PAGE_ICONS: Record<PageKind, IconName> = {
  pokemon: 'paw-print',
  move: 'swords',
  item: 'backpack',
  ability: 'zap',
  berry: 'cherry',
  nature: 'leaf',
  natures: 'leaf',
  location: 'map',
  where: 'map-pin',
  learnset: 'scroll-text',
  type: 'tag',
  types: 'chart-column',
  team: 'users',
};

/** A button to a page, `dex:<page>`, with the page it's on after `|` for the Back button there. */
export const PAGE_BUTTON_PREFIX = 'dex:';
/** A select of links, `dex-links:<page it's on>`, with the pages as its values. */
export const PAGE_LINKS_PREFIX = 'dex-links:';
/** A select of games, `dex-game:<page>`, with the page it was opened from after `|`, and the games as its values. */
export const PAGE_GAME_PREFIX = 'dex-game:';

const isPageKind = (kind: string): kind is PageKind => (PAGE_KINDS as readonly string[]).includes(kind);

export const encodePage = (page: DexPage) => [page.kind, page.slug, ...(page.game ? [page.game] : [])].join(':');

/** The page written as `<kind>:<slug>[:<game>]`, or null if it isn't one. */
export function decodePage(text: string | undefined): DexPage | null {
  const [kind, slug, game, ...rest] = (text ?? '').split(':');
  if (!kind || !isPageKind(kind) || !slug || rest.length > 0) return null;
  return { kind, slug, game: game || null };
}

/** A custom ID with a page and the one before it, leaving the one before out when both don't fit. */
function withBack(prefix: string, page: DexPage, back: DexPage | null): string {
  const id = `${prefix}${encodePage(page)}`;
  const full = back ? `${id}|${encodePage(back)}` : id;
  return full.length <= DiscordLimits.customIdLength ? full : id;
}

/** The page and the one before it in a custom ID made by {@link withBack}, or null if it isn't one. */
export function parsePageId(customId: string, prefix: string): PageContext | null {
  if (!customId.startsWith(prefix)) return null;
  const [page, back] = customId.slice(prefix.length).split('|');
  const decoded = decodePage(page);
  return decoded ? { page: decoded, back: back ? decodePage(back) : null } : null;
}

/** A button that opens a page, which can go back to the one it's on. */
export const pageButton = (target: DexPage, from: DexPage | null) =>
  new ButtonBuilder().setCustomId(withBack(PAGE_BUTTON_PREFIX, target, from)).setStyle(ButtonStyle.Secondary);

/** The button back to the page this one was opened from. */
export const backButton = (back: DexPage, label: string, t: Translate) =>
  pageButton(back, null)
    .setEmoji(buttonIcon('chevron-left'))
    .setLabel(t('pages.back', { name: label }).slice(0, DiscordLimits.buttonLabelLength));

/** A link to another page, for {@link linkSelect}. */
export interface PageLink {
  page: DexPage;
  label: string;
  /** Like the Pokémon's number, or that it's their hidden ability. */
  description?: string;
}

/**
 * A select of the pages a page links to, like the Pokémon that have an ability, each with its kind's icon. Opening one keeps the
 * way back to this page. Past what a select holds, the rest are left out.
 * @returns The select's row, or null when there's nothing to link to.
 */
export function linkSelect(from: DexPage, links: PageLink[], placeholder: string): ActionRowBuilder<StringSelectMenuBuilder> | null {
  // Pages can be linked twice, like a Pokémon met in two ways, and a select can't have the same value twice
  const unique = links.filter((link, index) => links.findIndex((other) => encodePage(other.page) === encodePage(link.page)) === index);
  if (unique.length === 0) return null;
  const id = `${PAGE_LINKS_PREFIX}${encodePage(from)}`;
  if (id.length > DiscordLimits.customIdLength) return null;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(id)
      .setPlaceholder(placeholder.slice(0, DiscordLimits.selectPlaceholderLength))
      .addOptions(
        unique.slice(0, DiscordLimits.selectOptions).map((link) => ({
          label: link.label.slice(0, DiscordLimits.optionLabelLength),
          value: encodePage(link.page),
          emoji: buttonIcon(PAGE_ICONS[link.page.kind]),
          ...(link.description ? { description: link.description.slice(0, DiscordLimits.optionLabelLength) } : {}),
        })),
      ),
  );
}

/**
 * Links to Pokémon by their slugs, in Pokédex order, each with its number, like `#0025`.
 * @param note Something about one to go after its number, like that it's their hidden ability.
 */
export function pokemonLinks(slugs: string[], language: string, note?: (slug: string) => string | null): PageLink[] {
  return slugs
    .flatMap((slug) => {
      const match = findBySlug(slug);
      return match ? [{ slug, match }] : [];
    })
    .sort((a, b) => a.match.species.id - b.match.species.id || Number(Boolean(a.match.form)) - Number(Boolean(b.match.form)))
    .map(({ slug, match }) => ({
      page: { kind: 'pokemon', slug },
      label: matchName(match, language),
      description: [formatDexNumber(match.species.id), note?.(slug)].filter(Boolean).join(' · '),
    }));
}

/** The custom ID of a page's select of games, which keeps the way back. */
export const gameSelectId = (page: DexPage, back: DexPage | null) => withBack(PAGE_GAME_PREFIX, { ...page, game: null }, back);
