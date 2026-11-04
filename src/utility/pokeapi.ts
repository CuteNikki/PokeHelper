const API_URL = 'https://pokeapi.co/api/v2';
/** The most answers kept. They never change, so the cache only has to stop growing forever. */
const CACHE_SIZE = 500;
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

/** Thrown when PokéAPI can't be reached or answers with an error, but not when something doesn't exist. */
export class PokeApiError extends Error {}

const cache = new Map<string, Promise<unknown>>();

/**
 * An answer from PokéAPI, cached so each Pokémon is only fetched once. Asking again while it's on its way waits for the same answer.
 * @returns The answer, or null if it doesn't exist.
 */
async function get<T>(path: string): Promise<T | null> {
  const cached = cache.get(path);
  if (cached) {
    // Moved to the end, so the ones asked for least recently are first in line to go
    cache.delete(path);
    cache.set(path, cached);
    return cached as Promise<T | null>;
  }

  const request = (async () => {
    const response = await fetch(`${API_URL}/${path}`, { signal: AbortSignal.timeout(TIMEOUT) }).catch((error: unknown) => {
      throw new PokeApiError(`PokéAPI couldn't be reached for ${path}`, { cause: error });
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new PokeApiError(`PokéAPI answered ${response.status} for ${path}`);
    return (await response.json()) as T;
  })();

  cache.set(path, request);
  // Failures aren't kept, so the next try asks again
  request.catch(() => cache.delete(path));
  for (const key of cache.keys()) {
    if (cache.size <= CACHE_SIZE) break;
    cache.delete(key);
  }
  return request;
}

export const getPokemon = (slug: string) => get<ApiPokemon>(`pokemon/${encodeURIComponent(slug)}`);
export const getSpecies = (id: number) => get<ApiSpecies>(`pokemon-species/${id}`);

/** The evolution chain at a URL from {@link ApiSpecies.evolution_chain}. */
export function getEvolutionChain(url: string) {
  const id = url.match(/evolution-chain\/(\d+)/)?.[1];
  return id ? get<ApiEvolutionChain>(`evolution-chain/${id}`) : Promise.resolve(null);
}

/** The Pokédex number in a species URL, like the ones in evolution chains. */
export const speciesIdFromUrl = (url: string) => Number(url.match(/pokemon-species\/(\d+)/)?.[1]) || null;
