import { loadImage, type Image } from '@napi-rs/canvas';

export const API_URL = 'https://pokeapi.co/api/v2';
const TIMEOUT = 10_000;

type Named = { name: string; url: string };

export interface ApiPokemon {
  id: number;
  name: string;
  /** In decimeters. */
  height: number;
  /** In hectograms. */
  weight: number;
  types: { slot: number; type: Named }[];
  stats: { base_stat: number; stat: Named }[];
  abilities: { is_hidden: boolean; slot: number; ability: Named }[];
  sprites: {
    front_default: string | null;
    front_shiny: string | null;
    other?: { 'official-artwork'?: { front_default: string | null; front_shiny: string | null } };
  };
  species: Named;
}

export interface ApiSpecies {
  id: number;
  name: string;
  is_legendary: boolean;
  is_mythical: boolean;
  genera: { genus: string; language: Named }[];
  flavor_text_entries: { flavor_text: string; language: Named; version: Named }[];
  evolution_chain: { url: string } | null;
}

export interface ApiEvolutionLink {
  species: Named;
  evolves_to: ApiEvolutionLink[];
}

export interface ApiEvolutionChain {
  id: number;
  chain: ApiEvolutionLink;
}

/** How much damage a type takes from others, as it is in the newest games. */
export interface ApiDamageRelations {
  double_damage_from: Named[];
  half_damage_from: Named[];
  no_damage_from: Named[];
}

export interface ApiType {
  id: number;
  name: string;
  damage_relations: ApiDamageRelations;
}

export interface ApiMove {
  id: number;
  name: string;
  names: { name: string; language: Named }[];
}

/** Thrown when PokéAPI can't be reached or answers with an error, but not when something doesn't exist. */
export class PokeApiError extends Error {}

/** A cache that keeps the most recently used, up to a limit. Waiting answers are kept too, so asking twice at once fetches once. */
class RecentCache {
  private readonly entries = new Map<string, Promise<unknown>>();

  constructor(private readonly limit: number) {}

  get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    // Moved to the end, so the ones asked for least recently are first in line to go
    this.entries.delete(key);
    if (cached) {
      this.entries.set(key, cached);
      return cached as Promise<T>;
    }

    const request = load();
    this.entries.set(key, request);
    // Failures aren't kept, so the next try asks again
    request.catch(() => this.entries.delete(key));
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.limit) break;
      this.entries.delete(oldest);
    }
    return request;
  }
}

/** Answers never change, so this only has to stop the cache from growing forever. */
const answers = new RecentCache(500);
/** Pictures take about 1 MB each once loaded, so fewer are kept. Enough for Eevee and all its evolutions a few times over. */
const images = new RecentCache(60);

/**
 * An answer from PokéAPI, cached so each Pokémon is only fetched once.
 * @returns The answer, or null if it doesn't exist.
 */
function get<T>(path: string): Promise<T | null> {
  return answers.get(path, async () => {
    const response = await fetch(`${API_URL}/${path}`, { signal: AbortSignal.timeout(TIMEOUT) }).catch((error: unknown) => {
      throw new PokeApiError(`PokéAPI couldn't be reached for ${path}`, { cause: error });
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new PokeApiError(`PokéAPI answered ${response.status} for ${path}`);
    return (await response.json()) as T;
  });
}

export const getPokemon = (slug: string) => get<ApiPokemon>(`pokemon/${encodeURIComponent(slug)}`);
export const getSpecies = (id: number) => get<ApiSpecies>(`pokemon-species/${id}`);
export const getMove = (slug: string) => get<ApiMove>(`move/${encodeURIComponent(slug)}`);
export const getType = (name: string) => get<ApiType>(`type/${encodeURIComponent(name)}`);

/** The evolution chain at a URL from {@link ApiSpecies.evolution_chain}. */
export function getEvolutionChain(url: string) {
  const id = url.match(/evolution-chain\/(\d+)/)?.[1];
  return id ? get<ApiEvolutionChain>(`evolution-chain/${id}`) : Promise.resolve(null);
}

/** The Pokédex number in a species URL, like the ones in evolution chains. */
export const speciesIdFromUrl = (url: string) => Number(url.match(/pokemon-species\/(\d+)/)?.[1]) || null;

const ARTWORK_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';

/** The official artwork of a species by its Pokédex number, without asking PokéAPI where it is. */
export const artworkUrl = (id: number, shiny: boolean) => `${ARTWORK_URL}/${shiny ? 'shiny/' : ''}${id}.png`;

/** Load a picture, with a timeout, as loading it from its URL directly would wait forever on a connection that hangs. */
async function fetchImage(url: string): Promise<Image> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!response.ok) throw new PokeApiError(`The picture at ${url} answered ${response.status}`);
  return loadImage(Buffer.from(await response.arrayBuffer()));
}

/** A picture, cached. Null if it can't be loaded, so a missing picture leaves a gap instead of failing. */
export const getImage = (url: string): Promise<Image | null> => images.get(url, () => fetchImage(url)).catch(() => null);
