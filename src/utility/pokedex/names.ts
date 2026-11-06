import { MINUTE, SECOND } from 'utility/duration';
import { supportedLanguages } from 'utility/i18next';
import { logger } from 'utility/logger';
import { API_URL, fetchJson, idFromUrl, PokeApiError } from 'utility/pokedex/api';

const GRAPHQL_URL = 'https://graphql.pokeapi.co/v1beta2';
/** The names are one big answer, which takes longer than others. */
const TIMEOUT = 30 * SECOND;
/** How long to wait before asking again after the names couldn't be loaded, so a PokéAPI outage isn't asked about on every keystroke. */
const RETRY_AFTER = MINUTE;

/** The longest a typed Pokémon name can be, far more than any name or number needs. */
export const MAX_NAME_INPUT = 100;

/** A name in each of the bot's languages. */
export type TranslatedName = Record<string, string>;

/** A form that is its own Pokémon in PokéAPI, with its own stats and picture, like Alolan Raichu or Mega Charizard X. */
export interface PokedexForm {
  slug: string;
  names: TranslatedName;
}

export interface PokedexSpecies {
  /** The National Pokédex number. */
  id: number;
  slug: string;
  names: TranslatedName;
  /** The forms besides the usual one. */
  forms: PokedexForm[];
}

/**
 * The other things with names, besides Pokémon, by what they're called in the data, with their table in PokéAPI's GraphQL and
 * their list in its REST API.
 */
const NAME_TABLES = {
  abilities: { table: 'ability', list: 'ability' },
  types: { table: 'type', list: 'type' },
  items: { table: 'item', list: 'item' },
  moves: { table: 'move', list: 'move' },
  natures: { table: 'nature', list: 'nature' },
  locations: { table: 'location', list: 'location' },
  areas: { table: 'locationarea', list: 'location-area' },
  regions: { table: 'region', list: 'region' },
  versions: { table: 'version', list: 'version' },
  eggGroups: { table: 'egggroup', list: 'egg-group' },
} as const;

/** What has names, like `items`. */
export type NameTable = keyof typeof NAME_TABLES;
const NAME_TABLE_KEYS = Object.keys(NAME_TABLES) as NameTable[];

/** Names by slug, like `thunder-stone`. */
export type NamesBySlug = Record<string, TranslatedName>;

export type PokedexData = Record<NameTable, NamesBySlug> & {
  species: PokedexSpecies[];
  /** The item of each berry, which has the berry's name, like `cheri-berry` for `cheri`. */
  berries: Record<string, string>;
  /** Where each game goes when they're listed by when they came out, smaller first. Games that aren't in it go by PokéAPI's order. */
  versionOrder: Record<string, number>;
};

/** A species, or one of its forms. */
export interface PokedexMatch {
  species: PokedexSpecies;
  form: PokedexForm | null;
}

type Names = { name: string; language: { name: string } }[];
type NamedRows = { name: string; names: Names }[];

type NamesQuery = Record<NameTable, NamedRows> & {
  species: {
    id: number;
    name: string;
    names: Names;
    pokemons: {
      name: string;
      is_default: boolean;
      pokemonforms: { is_default: boolean; pokemonformnames: { pokemon_name: string; language: { name: string } }[] }[];
    }[];
  }[];
  berries: { name: string; item: { name: string } | null }[];
  versionOrder: { name: string; versiongroup: { id: number; generation_id: number } | null }[];
};

/** The names of every species, form and everything else with a name in the bot's languages, in one request. */
function namesQuery(languages: string[]) {
  const where = `(where: { language: { name: { _in: ${JSON.stringify(languages)} } } })`;
  const names = `${where} { name language { name } }`;
  // Each table is renamed to what it's called in the data, and its names to `names`, so they can all be read the same way
  const tables = NAME_TABLE_KEYS.map((key) => `${key}: ${NAME_TABLES[key].table} { name names: ${NAME_TABLES[key].table}names${names} }`);
  return `{
    species: pokemonspecies(order_by: { id: asc }) {
      id
      name
      names: pokemonspeciesnames${names}
      pokemons(order_by: { id: asc }) {
        name
        is_default
        pokemonforms {
          is_default
          pokemonformnames${where} { pokemon_name language { name } }
        }
      }
    }
    ${tables.join('\n    ')}
    berries: berry { name item { name } }
    versionOrder: version { name versiongroup { id generation_id } }
  }`;
}

/** `raichu-alola` as `Raichu Alola`, for the rare one without a name. */
export const fromSlug = (slug: string) => slug.replace(/(^|-)(\w)/g, (_, dash: string, letter: string) => `${dash ? ' ' : ''}${letter.toUpperCase()}`);

/** The names by language, with English, or else the slug, for languages that have none. */
function toNames(names: Names, slug: string, languages: string[]): TranslatedName {
  const byLanguage = Object.fromEntries(names.map((entry) => [entry.language.name, entry.name]));
  return Object.fromEntries(languages.map((language) => [language, byLanguage[language] ?? byLanguage.en ?? fromSlug(slug)]));
}

/** Turn PokéAPI's answer into the names by species and everything else. */
function parseNames(result: NamesQuery, languages: string[]): PokedexData {
  const byName = (rows: NamedRows) => Object.fromEntries(rows.map((row) => [row.name, toNames(row.names, row.name, languages)]));
  const tables = Object.fromEntries(NAME_TABLE_KEYS.map((key) => [key, byName(result[key])])) as Record<NameTable, NamesBySlug>;
  return {
    ...tables,
    species: result.species.map((entry) => ({
      id: entry.id,
      slug: entry.name,
      names: toNames(entry.names, entry.name, languages),
      forms: entry.pokemons
        .filter((pokemon) => !pokemon.is_default)
        .map((pokemon) => {
          const form = pokemon.pokemonforms.find((candidate) => candidate.is_default) ?? pokemon.pokemonforms[0];
          const names = (form?.pokemonformnames ?? []).map((name) => ({ name: name.pokemon_name, language: name.language }));
          return { slug: pokemon.name, names: toNames(names, pokemon.name, languages) };
        }),
    })),
    berries: Object.fromEntries(result.berries.map((berry) => [berry.name, berry.item?.name ?? `${berry.name}-berry`])),
    // By generation, then by the games of one, which PokéAPI mostly numbers in the order they came out
    versionOrder: Object.fromEntries(
      result.versionOrder.flatMap((version) =>
        version.versiongroup ? [[version.name, version.versiongroup.generation_id * 1000 + version.versiongroup.id]] : [],
      ),
    ),
  };
}

type Listed = { name: string; url: string }[];

/** PokéAPI's lists by their name, with the species and Pokémon for the forms. */
export type PokedexLists = Record<NameTable, Listed> & { species: Listed; pokemon: Listed; berries: Listed };

/**
 * Names from PokéAPI's lists, for when its GraphQL, which has the real names, is down. The lists only have slugs, so the names are
 * made from them, like `Mr Mime`, the same in every language. Forms are put with the species their slug starts with, like
 * `raichu-alola` with Raichu. A berry's item is called like its slug, like `cheri-berry`.
 */
export function namesFromLists(lists: Pick<PokedexLists, 'species' | 'pokemon'> & Partial<PokedexLists>, languages: string[]): PokedexData {
  const species = lists.species.map((entry) => ({ id: idFromUrl(entry.url), slug: entry.name, forms: [] as string[] }));
  // The longest first, so a form goes with the species whose whole slug it starts with
  const byLength = [...species].sort((a, b) => b.slug.length - a.slug.length);
  const speciesSlugs = new Set(species.map((entry) => entry.slug));
  for (const { name } of lists.pokemon) {
    if (speciesSlugs.has(name)) continue;
    byLength.find((entry) => name.startsWith(`${entry.slug}-`))?.forms.push(name);
  }

  const noNames: Names = [];
  const tables = Object.fromEntries(NAME_TABLE_KEYS.map((key) => [key, (lists[key] ?? []).map((entry) => ({ name: entry.name, names: noNames }))]));
  return parseNames(
    {
      ...(tables as Record<NameTable, NamedRows>),
      species: species
        .sort((a, b) => a.id - b.id)
        .map((entry) => ({
          id: entry.id,
          name: entry.slug,
          names: noNames,
          pokemons: entry.forms.map((form) => ({ name: form, is_default: false, pokemonforms: [] })),
        })),
      berries: (lists.berries ?? []).map((entry) => ({ name: entry.name, item: null })),
      versionOrder: [],
    },
    languages,
  );
}

/** No names, with every table there. */
const emptyData = (): PokedexData => ({
  ...(Object.fromEntries(NAME_TABLE_KEYS.map((key) => [key, {}])) as Record<NameTable, NamesBySlug>),
  species: [],
  berries: {},
  versionOrder: {},
});

const EMPTY = emptyData();
let data: PokedexData = EMPTY;
/** Whether the names are the real ones from GraphQL, and not the ones made from slugs. */
let complete = false;
let loading: Promise<PokedexData> | null = null;
let loadingComplete: Promise<PokedexData> | null = null;
let failedAt = 0;

/** The real names, in every language, from GraphQL. They replace the ones made from slugs when those came first. */
function loadCompleteNames(): Promise<PokedexData> {
  loadingComplete ??= (async () => {
    try {
      const body = await fetchJson<{ data?: NamesQuery; errors?: unknown }>(GRAPHQL_URL, 'the Pokémon names', {
        timeout: TIMEOUT,
        init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: namesQuery(supportedLanguages) }) },
      });
      if (!body.data) throw new PokeApiError(`PokéAPI answered the Pokémon names with errors: ${JSON.stringify(body.errors)}`);
      data = parseNames(body.data, supportedLanguages);
      complete = true;
      logger.info(`Loaded the names of ${data.species.length} Pokémon`);
      return data;
    } catch (error) {
      failedAt = Date.now();
      throw error;
    } finally {
      loadingComplete = null;
    }
  })();
  return loadingComplete;
}

/** Names made from PokéAPI's lists, used until the real ones are there. Kept only if the real ones haven't come first. */
async function loadListedNames(): Promise<PokedexData> {
  const list = (path: string) =>
    fetchJson<{ results: Listed }>(`${API_URL}/${path}?limit=100000`, `the list of ${path}`, { timeout: TIMEOUT }).then((body) => body.results);
  const [species, pokemon, berries, ...tables] = await Promise.all([
    list('pokemon-species'),
    list('pokemon'),
    list('berry'),
    ...NAME_TABLE_KEYS.map((key) => list(NAME_TABLES[key].list)),
  ]);
  if (complete) return data;
  data = namesFromLists({ species, pokemon, berries, ...Object.fromEntries(NAME_TABLE_KEYS.map((key, index) => [key, tables[index]])) }, supportedLanguages);
  logger.warn(`PokéAPI's names aren't there yet, so the names of ${data.species.length} Pokémon are made from their slugs for now`);
  return data;
}

/**
 * Load the names from PokéAPI the first time they're needed, and keep them while the bot runs. Asking again while they're on their way
 * waits for the same answer.
 *
 * The real names come from PokéAPI's GraphQL, which is sometimes slow or down. Names made from its lists are loaded at the same time,
 * and used if they're there first, while the real ones are asked for again every minute.
 * @throws {PokeApiError} When PokéAPI can't be reached at all, or couldn't be a minute ago.
 */
export function loadPokedexData(): Promise<PokedexData> {
  const retry = Date.now() - failedAt >= RETRY_AFTER;
  if (data !== EMPTY) {
    if (!complete && retry && !loadingComplete)
      loadCompleteNames().catch((error: unknown) => logger.warn(error, 'The Pokémon names are still made from slugs'));
    return Promise.resolve(data);
  }
  if (!retry) return Promise.reject(new PokeApiError('PokéAPI could not be reached a moment ago'));

  loading ??= Promise.any([loadCompleteNames(), loadListedNames()])
    .catch((error: unknown) => {
      failedAt = Date.now();
      throw error instanceof AggregateError ? (error.errors[0] as Error) : error;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** The names loaded by {@link loadPokedexData}, or none before they are. */
export const getPokedexData = () => data;

/** Use other names, like in tests. What's left out has none. */
export const setPokedexData = (value: Partial<PokedexData>) => {
  data = { ...emptyData(), ...value };
};

/** A name in the language, or English. */
export const nameIn = (names: TranslatedName | undefined, language: string) => names?.[language] ?? names?.en ?? '';

/** The species or form's name in the language. */
export const matchName = (match: PokedexMatch, language: string) => nameIn((match.form ?? match.species).names, language);

/** The slug PokéAPI knows the species or form by. */
export const matchSlug = (match: PokedexMatch) => (match.form ?? match.species).slug;

/** `25` as `#0025`, like the games show it. */
export const formatDexNumber = (id: number) => `#${String(id).padStart(4, '0')}`;

/** Lowercase, without accents and punctuation, so `flabebe` finds Flabébé and `mr mime` finds Mr. Mime. */
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

/** Whether what's typed is a name of the species in any language, or of one of its forms, like `Alolan Raichu` for Raichu. */
export function isNameOf(species: PokedexSpecies, input: string): boolean {
  const key = normalize(input);
  if (!key) return false;
  return [species, ...species.forms].some((entry) => [entry.slug, ...Object.values(entry.names)].some((name) => normalize(name) === key));
}

/** The species with a Pokédex number, or null. */
export function speciesById(id: number): PokedexSpecies | null {
  const species = getPokedexData().species;
  // They're in order, so the number is usually its place
  const guess = species[id - 1];
  return guess?.id === id ? guess : (species.find((entry) => entry.id === id) ?? null);
}

/** The species or form PokéAPI knows by the slug, like `raichu-alola`, or null. */
export function findBySlug(slug: string): PokedexMatch | null {
  for (const species of getPokedexData().species) {
    if (species.slug === slug) return { species, form: null };
    const form = species.forms.find((candidate) => candidate.slug === slug);
    if (form) return { species, form };
  }
  return null;
}

/** Every species and form, with all its names normalized for searching. */
function* everyMatch(): Generator<PokedexMatch & { keys: string[] }> {
  for (const species of getPokedexData().species) {
    yield { species, form: null, keys: [species.slug, ...Object.values(species.names)].map(normalize) };
    for (const form of species.forms) yield { species, form, keys: [form.slug, ...Object.values(form.names)].map(normalize) };
  }
}

/**
 * Find a species or form by what's typed: its slug, its Pokédex number, or its name in any language.
 * @returns The match, or null when nothing has exactly that name.
 */
export function findPokemon(input: string): PokedexMatch | null {
  const text = input.trim().replace(/^#/, '');
  if (/^\d+$/.test(text)) {
    const species = speciesById(Number(text));
    return species ? { species, form: null } : null;
  }
  const key = normalize(text);
  if (!key) return null;
  for (const match of everyMatch()) {
    if (match.keys.includes(key)) return { species: match.species, form: match.form };
  }
  return null;
}

/**
 * The species and forms matching what's typed so far, for autocomplete: names starting with it first, then names containing it.
 * A number finds the species with that number and those whose numbers start with it.
 * @param limit The most to return.
 */
export function searchPokemon(input: string, limit: number): PokedexMatch[] {
  const text = input.trim().replace(/^#/, '');
  const species = getPokedexData().species;
  if (!text) return species.slice(0, limit).map((entry) => ({ species: entry, form: null }));

  if (/^\d+$/.test(text)) {
    return species
      .filter((entry) => String(entry.id).startsWith(String(Number(text))))
      .sort((a, b) => a.id - b.id)
      .slice(0, limit)
      .map((entry) => ({ species: entry, form: null }));
  }

  const key = normalize(text);
  const starts: PokedexMatch[] = [];
  const contains: PokedexMatch[] = [];
  for (const match of everyMatch()) {
    if (match.keys.some((candidate) => candidate.startsWith(key))) starts.push({ species: match.species, form: match.form });
    else if (match.keys.some((candidate) => candidate.includes(key))) contains.push({ species: match.species, form: match.form });
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

/** The name of an item, move, location or anything else in the language, or one made from its slug if PokéAPI has none. */
export const nameOf = (table: NameTable, slug: string, language: string) => nameIn(getPokedexData()[table][slug], language) || fromSlug(slug);

/**
 * Find an item, move or anything else by what's typed: its slug, or its name in any language.
 * @param only Which of them can be found, like only the items that are berries.
 * @returns Its slug, or null when nothing has exactly that name.
 */
export function findNamed(table: NameTable, input: string, only?: (slug: string) => boolean): string | null {
  const key = normalize(input);
  if (!key) return null;
  for (const [slug, names] of Object.entries(getPokedexData()[table])) {
    if (only && !only(slug)) continue;
    if ([slug, ...Object.values(names)].some((name) => normalize(name) === key)) return slug;
  }
  return null;
}

/**
 * The items, moves or anything else matching what's typed so far, for autocomplete: names starting with it first, then names
 * containing it. With nothing typed, the first ones.
 * @param only Which of them can be suggested, like only the items that are berries.
 * @returns Their slugs, at most `limit`.
 */
export function searchNamed(table: NameTable, input: string, limit: number, only?: (slug: string) => boolean): string[] {
  const key = normalize(input);
  const starts: string[] = [];
  const contains: string[] = [];
  for (const [slug, names] of Object.entries(getPokedexData()[table])) {
    if (only && !only(slug)) continue;
    const keys = [slug, ...Object.values(names)].map(normalize);
    if (keys.some((candidate) => candidate.startsWith(key))) starts.push(slug);
    else if (keys.some((candidate) => candidate.includes(key))) contains.push(slug);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}
