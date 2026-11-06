import { supportedLanguages } from 'utility/i18next';
import { logger } from 'utility/logger';
import { API_URL, PokeApiError } from 'utility/pokedex/api';

const GRAPHQL_URL = 'https://beta.pokeapi.co/graphql/v1beta';
const TIMEOUT = 30_000;
/** How long to wait before asking again after the names couldn't be loaded, so a PokéAPI outage isn't asked about on every keystroke. */
const RETRY_AFTER = 60_000;

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

export interface PokedexData {
  species: PokedexSpecies[];
  abilities: Record<string, TranslatedName>;
  types: Record<string, TranslatedName>;
}

/** A species, or one of its forms. */
export interface PokedexMatch {
  species: PokedexSpecies;
  form: PokedexForm | null;
}

type Names = { name: string; pokemon_v2_language: { name: string } }[];

interface NamesQuery {
  pokemon_v2_pokemonspecies: {
    id: number;
    name: string;
    pokemon_v2_pokemonspeciesnames: Names;
    pokemon_v2_pokemons: {
      name: string;
      is_default: boolean;
      pokemon_v2_pokemonforms: { is_default: boolean; pokemon_v2_pokemonformnames: { pokemon_name: string; pokemon_v2_language: { name: string } }[] }[];
    }[];
  }[];
  pokemon_v2_ability: { name: string; pokemon_v2_abilitynames: Names }[];
  pokemon_v2_type: { name: string; pokemon_v2_typenames: Names }[];
}

/** The names of every species, form, ability and type in the bot's languages, in one request. */
function namesQuery(languages: string[]) {
  const names = `(where: { pokemon_v2_language: { name: { _in: ${JSON.stringify(languages)} } } }) { name pokemon_v2_language { name } }`;
  return `{
    pokemon_v2_pokemonspecies(order_by: { id: asc }) {
      id
      name
      pokemon_v2_pokemonspeciesnames${names}
      pokemon_v2_pokemons(order_by: { id: asc }) {
        name
        is_default
        pokemon_v2_pokemonforms {
          is_default
          pokemon_v2_pokemonformnames(where: { pokemon_v2_language: { name: { _in: ${JSON.stringify(languages)} } } }) { pokemon_name pokemon_v2_language { name } }
        }
      }
    }
    pokemon_v2_ability { name pokemon_v2_abilitynames${names} }
    pokemon_v2_type { name pokemon_v2_typenames${names} }
  }`;
}

/** `raichu-alola` as `Raichu Alola`, for the rare one without a name. */
const fromSlug = (slug: string) => slug.replace(/(^|-)(\w)/g, (_, dash: string, letter: string) => `${dash ? ' ' : ''}${letter.toUpperCase()}`);

/** The names by language, with English, or else the slug, for languages that have none. */
function toNames(names: Names, slug: string, languages: string[]): TranslatedName {
  const byLanguage = Object.fromEntries(names.map((entry) => [entry.pokemon_v2_language.name, entry.name]));
  return Object.fromEntries(languages.map((language) => [language, byLanguage[language] ?? byLanguage.en ?? fromSlug(slug)]));
}

/** Turn PokéAPI's answer into the names by species, ability and type. */
export function parseNames(result: NamesQuery, languages: string[]): PokedexData {
  const byName = (rows: { name: string; names: Names }[]) => Object.fromEntries(rows.map((row) => [row.name, toNames(row.names, row.name, languages)]));
  return {
    species: result.pokemon_v2_pokemonspecies.map((entry) => ({
      id: entry.id,
      slug: entry.name,
      names: toNames(entry.pokemon_v2_pokemonspeciesnames, entry.name, languages),
      forms: entry.pokemon_v2_pokemons
        .filter((pokemon) => !pokemon.is_default)
        .map((pokemon) => {
          const form = pokemon.pokemon_v2_pokemonforms.find((candidate) => candidate.is_default) ?? pokemon.pokemon_v2_pokemonforms[0];
          const names = (form?.pokemon_v2_pokemonformnames ?? []).map((name) => ({ name: name.pokemon_name, pokemon_v2_language: name.pokemon_v2_language }));
          return { slug: pokemon.name, names: toNames(names, pokemon.name, languages) };
        }),
    })),
    abilities: byName(result.pokemon_v2_ability.map((row) => ({ name: row.name, names: row.pokemon_v2_abilitynames }))),
    types: byName(result.pokemon_v2_type.map((row) => ({ name: row.name, names: row.pokemon_v2_typenames }))),
  };
}

type Listed = { name: string; url: string }[];

/** The number at the end of a PokéAPI URL, like 25 in `.../pokemon-species/25/`. */
const idFromUrl = (url: string) => Number(url.match(/\/(\d+)\/?$/)?.[1]) || 0;

/**
 * Names from PokéAPI's lists, for when its GraphQL, which has the real names, is down. The lists only have slugs, so the names are
 * made from them, like `Mr Mime`, the same in every language. Forms are put with the species their slug starts with, like
 * `raichu-alola` with Raichu.
 */
export function namesFromLists(lists: { species: Listed; pokemon: Listed; types: Listed; abilities: Listed }, languages: string[]): PokedexData {
  const species = lists.species.map((entry) => ({ id: idFromUrl(entry.url), slug: entry.name, forms: [] as string[] }));
  // The longest first, so a form goes with the species whose whole slug it starts with
  const byLength = [...species].sort((a, b) => b.slug.length - a.slug.length);
  const speciesSlugs = new Set(species.map((entry) => entry.slug));
  for (const { name } of lists.pokemon) {
    if (speciesSlugs.has(name)) continue;
    byLength.find((entry) => name.startsWith(`${entry.slug}-`))?.forms.push(name);
  }

  const noNames: Names = [];
  return parseNames(
    {
      pokemon_v2_pokemonspecies: species
        .sort((a, b) => a.id - b.id)
        .map((entry) => ({
          id: entry.id,
          name: entry.slug,
          pokemon_v2_pokemonspeciesnames: noNames,
          pokemon_v2_pokemons: entry.forms.map((form) => ({ name: form, is_default: false, pokemon_v2_pokemonforms: [] })),
        })),
      pokemon_v2_ability: lists.abilities.map((entry) => ({ name: entry.name, pokemon_v2_abilitynames: noNames })),
      pokemon_v2_type: lists.types.map((entry) => ({ name: entry.name, pokemon_v2_typenames: noNames })),
    },
    languages,
  );
}

const EMPTY: PokedexData = { species: [], abilities: {}, types: {} };
let data: PokedexData = EMPTY;
/** Whether the names are the real ones from GraphQL, and not the ones made from slugs. */
let complete = false;
let loading: Promise<PokedexData> | null = null;
let loadingComplete: Promise<PokedexData> | null = null;
let failedAt = 0;

/** A PokéAPI answer, as JSON. */
async function fetchJson<T>(url: string, what: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) }).catch((error: unknown) => {
    throw new PokeApiError(`PokéAPI couldn't be reached for ${what}`, { cause: error });
  });
  if (!response.ok) throw new PokeApiError(`PokéAPI answered ${response.status} for ${what}`);
  return (await response.json()) as T;
}

/** The real names, in every language, from GraphQL. They replace the ones made from slugs when those came first. */
function loadCompleteNames(): Promise<PokedexData> {
  loadingComplete ??= (async () => {
    try {
      const body = await fetchJson<{ data?: NamesQuery; errors?: unknown }>(GRAPHQL_URL, 'the Pokémon names', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: namesQuery(supportedLanguages) }),
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
  const list = (path: string) => fetchJson<{ results: Listed }>(`${API_URL}/${path}?limit=100000`, `the list of ${path}`).then((body) => body.results);
  const [species, pokemon, types, abilities] = await Promise.all([list('pokemon-species'), list('pokemon'), list('type'), list('ability')]);
  if (complete) return data;
  data = namesFromLists({ species, pokemon, types, abilities }, supportedLanguages);
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

/** Use other names, like in tests. */
export const setPokedexData = (value: PokedexData) => {
  data = value;
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
