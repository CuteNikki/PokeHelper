import { isBerryItem } from 'utility/pokedex/lookups/item';
import {
  findNamed,
  findPokemon,
  getPokedexData,
  matchName,
  matchSlug,
  nameOf,
  type NameTable,
  normalize,
  searchNamed,
  searchPokemon,
} from 'utility/pokedex/names';
import type { DexPage, PageKind } from 'utility/pokedex/pages';
import { isType } from 'utility/pokedex/typeChart';

/** What /dex finds besides Pokémon, in the order it looks, with the page each opens. Berries are items too, and open as berries. */
const TABLES: { table: NameTable; kind: PageKind; only?: (slug: string) => boolean }[] = [
  { table: 'types', kind: 'type', only: isType },
  { table: 'moves', kind: 'move' },
  { table: 'abilities', kind: 'ability' },
  { table: 'items', kind: 'item' },
  { table: 'natures', kind: 'nature' },
  { table: 'locations', kind: 'location' },
];

/** The page of an item, which is its berry's for berries. */
const itemPage = (kind: PageKind, slug: string): DexPage => ({ kind: kind === 'item' && isBerryItem(slug) ? 'berry' : kind, slug });

/** A suggestion of /dex: the page, its name, and what tells it apart from others of the same name, like a place's region. */
export interface SearchResult {
  page: DexPage;
  name: string;
  detail: string | null;
}

/**
 * Everything matching what's typed so far, for /dex's suggestions: names starting with it first, Pokémon before moves, abilities,
 * items, natures and places, then names containing it.
 * @returns At most `limit`.
 */
export function searchEverything(input: string, language: string, limit: number): SearchResult[] {
  const key = normalize(input);
  const startsWith = (names: string[]) => names.some((name) => normalize(name).startsWith(key));
  const { locationRegions } = getPokedexData();

  const found: (SearchResult & { starts: boolean })[] = searchPokemon(input, limit).map((match) => {
    const own = match.form ?? match.species;
    return {
      page: { kind: 'pokemon', slug: matchSlug(match) },
      name: matchName(match, language),
      detail: null,
      starts: startsWith([own.slug, ...Object.values(own.names)]),
    };
  });
  // Numbers only find Pokémon
  if (!/^#?\d+$/.test(input.trim())) {
    for (const { table, kind, only } of TABLES) {
      for (const slug of searchNamed(table, input, limit, only)) {
        const region = kind === 'location' ? locationRegions[slug] : undefined;
        found.push({
          page: itemPage(kind, slug),
          name: nameOf(table, slug, language),
          detail: region ? nameOf('regions', region, language) : null,
          starts: startsWith([slug, ...Object.values(getPokedexData()[table][slug] ?? {})]),
        });
      }
    }
  }
  // Sorting keeps the order within each, so Pokémon stay ahead of moves of the same kind of match
  return found
    .sort((a, b) => Number(b.starts) - Number(a.starts))
    .slice(0, limit)
    .map(({ page, name, detail }) => ({ page, name, detail }));
}

/** The page of what's typed, by its number or exact name in any language: a Pokémon first, then a move, an ability and so on. */
export function findAnything(input: string): DexPage | null {
  const match = findPokemon(input);
  if (match) return { kind: 'pokemon', slug: matchSlug(match) };
  for (const { table, kind, only } of TABLES) {
    const slug = findNamed(table, input, only);
    if (slug) return itemPage(kind, slug);
  }
  return null;
}
