import { type Image } from '@napi-rs/canvas';
import type { RepliableInteraction } from 'discord.js';

import { RecentCache } from 'utility/cache';
import { fetchImage } from 'utility/canvas';
import { SECOND } from 'utility/duration';
import type { Translate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { replaceWithError, sendError } from 'utility/response';

export const API_URL = 'https://pokeapi.co/api/v2';
const TIMEOUT = 10 * SECOND;

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
  /** The chance of being female in eighths, or -1 for no gender. */
  gender_rate: number;
  /** From 3, hardest, to 255, easiest. */
  capture_rate: number;
  /** Egg cycles until its egg hatches. Null for those that can't hatch from one. */
  hatch_counter: number | null;
  growth_rate: Named;
  egg_groups: Named[];
}

/** How a Pokémon evolves in one game. Anything it doesn't need is null, false or empty. */
export interface ApiEvolutionDetail {
  /** Whether it's how it evolves in the newest games, as it's done differently in some older ones. */
  is_default?: boolean;
  trigger: Named;
  min_level: number | null;
  item: Named | null;
  held_item: Named | null;
  known_move: Named | null;
  known_move_type: Named | null;
  location: Named | null;
  min_happiness: number | null;
  min_beauty: number | null;
  min_affection: number | null;
  needs_overworld_rain: boolean;
  party_species: Named | null;
  party_type: Named | null;
  /** 1 when its Attack has to be higher than its Defense, 0 when the same, -1 when lower. */
  relative_physical_stats: number | null;
  /** `day`, `night` or `dusk`, or empty. */
  time_of_day: string;
  trade_species: Named | null;
  turn_upside_down: boolean;
  /** 1 for female, 2 for male. */
  gender: number | null;
  min_steps?: number | null;
  used_move?: Named | null;
  min_move_count?: number | null;
  min_damage_taken?: number | null;
}

export interface ApiEvolutionLink {
  species: Named;
  /** How it evolves from the one before, once for each game it's different in. Empty for the first. */
  evolution_details: ApiEvolutionDetail[];
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

/** What PokéAPI has in several languages, like descriptions, with the text under its own key. */
type InLanguages<K extends string> = ({ language: Named } & Record<K, string>)[];

export interface ApiMove {
  id: number;
  name: string;
  names: { name: string; language: Named }[];
  type: Named;
  damage_class: Named;
  power: number | null;
  /** In percent, or null for moves that always hit. */
  accuracy: number | null;
  pp: number | null;
  priority: number;
  /** The chance of its effect, which its effect text has as `$effect_chance`. */
  effect_chance: number | null;
  generation: Named;
  effect_entries: InLanguages<'effect' | 'short_effect'>;
  flavor_text_entries: InLanguages<'flavor_text'>;
  contest_type: Named | null;
  contest_effect: { url: string } | null;
  learned_by_pokemon: Named[];
}

export interface ApiItem {
  id: number;
  name: string;
  names: { name: string; language: Named }[];
  category: Named;
  sprites: { default: string | null };
  effect_entries: InLanguages<'effect' | 'short_effect'>;
  flavor_text_entries: InLanguages<'text'>;
  /** The power of Fling when the item is thrown, or null when it can't be. */
  fling_power: number | null;
  /** The wild Pokémon that can be holding it. */
  held_by_pokemon: { pokemon: Named }[];
}

export interface ApiAbility {
  id: number;
  name: string;
  names: { name: string; language: Named }[];
  generation: Named;
  effect_entries: InLanguages<'effect' | 'short_effect'>;
  flavor_text_entries: InLanguages<'flavor_text'>;
  /** The Pokémon that can have it, and whether it's their hidden ability. */
  pokemon: { is_hidden: boolean; pokemon: Named }[];
}

export interface ApiBerry {
  id: number;
  name: string;
  item: Named;
  firmness: Named;
  /** How strong each of its flavors is. */
  flavors: { potency: number; flavor: Named }[];
  /** Hours for each of the stages it takes to grow. */
  growth_time: number;
  /** The most that grow on one tree. */
  max_harvest: number;
  /** In millimeters. */
  size: number;
  natural_gift_power: number;
  natural_gift_type: Named;
}

/** A nature, which raises one stat and lowers another, unless both are the same, when it does nothing. */
export interface ApiNature {
  id: number;
  name: string;
  names: { name: string; language: Named }[];
  increased_stat: Named | null;
  decreased_stat: Named | null;
  likes_flavor: Named | null;
  hates_flavor: Named | null;
}

/** A kind of item, like Standard balls. */
export interface ApiItemCategory {
  id: number;
  name: string;
  names: { name: string; language: Named }[];
}

/** How a move does in contests: how much it appeals, and how much it puts off the others. */
export interface ApiContestEffect {
  id: number;
  appeal: number;
  jam: number;
}

/** Thrown when PokéAPI can't be reached or answers with an error, but not when something doesn't exist. */
export class PokeApiError extends Error {}

interface FetchOptions {
  init?: RequestInit;
  /** How long to wait for an answer, in milliseconds. */
  timeout?: number;
}

/**
 * A PokéAPI answer, as JSON.
 * @param what What was asked for, for the error.
 * @param options.allowMissing Null when it doesn't exist, instead of an error.
 * @throws {PokeApiError} When PokéAPI can't be reached or answers with an error.
 */
export async function fetchJson<T>(url: string, what: string, options: FetchOptions & { allowMissing: true }): Promise<T | null>;
export async function fetchJson<T>(url: string, what: string, options?: FetchOptions): Promise<T>;
export async function fetchJson<T>(url: string, what: string, options: FetchOptions & { allowMissing?: boolean } = {}): Promise<T | null> {
  const response = await fetch(url, { ...options.init, signal: AbortSignal.timeout(options.timeout ?? TIMEOUT) }).catch((error: unknown) => {
    throw new PokeApiError(`PokéAPI couldn't be reached for ${what}`, { cause: error });
  });
  if (options.allowMissing && response.status === 404) return null;
  if (!response.ok) throw new PokeApiError(`PokéAPI answered ${response.status} for ${what}`);
  return (await response.json()) as T;
}

/**
 * Tell whoever asked that PokéAPI can't be reached, for an error from asking it. Any other error is thrown on, as it's a bug.
 * @param options.replace Replace a public "thinking" reply with the error only they see, instead of answering only them.
 */
export async function answerPokeApiError(interaction: RepliableInteraction, error: unknown, t: Translate, { replace = false } = {}) {
  if (!(error instanceof PokeApiError)) throw error;
  logger.warn(error, error.message);
  return replace ? replaceWithError(interaction, t('pokedex.unavailable')) : sendError(interaction, t('pokedex.unavailable'));
}

/** Answers never change, so this only has to stop the cache from growing forever. */
const answers = new RecentCache<unknown>(500);
/** Pictures take about 1 MB each once loaded, so fewer are kept. Enough for Eevee and all its evolutions a few times over. */
const images = new RecentCache<Image>(60);

/**
 * An answer from PokéAPI, cached so each Pokémon is only fetched once.
 * @returns The answer, or null if it doesn't exist.
 */
function get<T>(path: string): Promise<T | null> {
  return answers.get(path, () => fetchJson<T>(`${API_URL}/${path}`, path, { allowMissing: true })) as Promise<T | null>;
}

export const getPokemon = (slug: string) => get<ApiPokemon>(`pokemon/${encodeURIComponent(slug)}`);
export const getSpecies = (id: number) => get<ApiSpecies>(`pokemon-species/${id}`);
export const getMove = (slug: string) => get<ApiMove>(`move/${encodeURIComponent(slug)}`);
export const getType = (name: string) => get<ApiType>(`type/${encodeURIComponent(name)}`);
export const getItem = (slug: string) => get<ApiItem>(`item/${encodeURIComponent(slug)}`);
export const getItemCategory = (slug: string) => get<ApiItemCategory>(`item-category/${encodeURIComponent(slug)}`);
export const getAbility = (slug: string) => get<ApiAbility>(`ability/${encodeURIComponent(slug)}`);
export const getBerry = (slug: string) => get<ApiBerry>(`berry/${encodeURIComponent(slug)}`);
export const getNature = (slug: string) => get<ApiNature>(`nature/${encodeURIComponent(slug)}`);
export const getContestEffect = (id: number) => get<ApiContestEffect>(`contest-effect/${id}`);

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

/** A picture, cached. Null if it can't be loaded, so a missing picture leaves a gap instead of failing. */
export const getImage = (url: string): Promise<Image | null> => images.get(url, () => fetchImage(url)).catch(() => null);

/** Where a Pokémon is found in one area, in each game it's there in. */
export interface ApiEncounter {
  location_area: Named;
  version_details: {
    version: Named;
    /** The best chance of meeting it there, in percent. */
    max_chance: number;
    encounter_details: { min_level: number; max_level: number; chance: number; method: Named }[];
  }[];
}

/** Where a Pokémon or form is found in the wild, by its slug. Empty when it isn't. */
export const getEncounters = (slug: string) => get<ApiEncounter[]>(`pokemon/${encodeURIComponent(slug)}/encounters`);

/** The number at the end of a PokéAPI URL, like 25 in `.../version/25/`. */
export const idFromUrl = (url: string) => Number(url.match(/\/(\d+)\/?$/)?.[1]) || 0;
