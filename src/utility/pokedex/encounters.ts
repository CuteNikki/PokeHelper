import { ActionRowBuilder, bold, ContainerBuilder, MessageFlags, SeparatorBuilder, StringSelectMenuBuilder, subtext, TextDisplayBuilder } from 'discord.js';

import { DiscordLimits } from 'utility/discordLimits';
import { formatNumber } from 'utility/duration';
import { buttonIcon } from 'utility/emojis';
import type { Translate } from 'utility/i18next';
import { type ApiEncounter, getEncounters, getPokemon, idFromUrl } from 'utility/pokedex/api';
import { findBySlug, fromSlug, getPokedexData, matchName, nameOf } from 'utility/pokedex/names';
import { gameSelectId, linkSelect, type PageContext } from 'utility/pokedex/pages';
import { pokemonHeader } from 'utility/pokedex/pokemonHeader';
import type { ResponsePayload } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/** The most places listed for a game, so the answer stays well within what a message can hold. Those with the best chances first. */
const MAX_PLACES = 20;

/** The ways of meeting Pokémon that have short names of their own. The rest are named like their slug. */
const METHODS = [
  'walk',
  'surf',
  'old-rod',
  'good-rod',
  'super-rod',
  'rock-smash',
  'headbutt',
  'gift',
  'gift-egg',
  'static',
  'dark-grass',
  'grass-spots',
  'cave-spots',
  'surf-spots',
  'super-rod-spots',
  'sos',
  'roaming-grass',
  'roaming-water',
  'npc-trade',
  'overworld',
  'overworld-water',
  'overworld-flying',
  'horde',
  'overworld-special',
  'overworld-flying-special',
  'overworld-water-special',
  'honey-tree',
  'bubbling-spots',
  'wanderer',
  'max-raid',
  'dynamax-adventure',
] as const;
type Method = (typeof METHODS)[number];
const isMethod = (slug: string): slug is Method => (METHODS as readonly string[]).includes(slug);

/** Where a way of meeting Pokémon goes when they're listed by it: grass first, then water and the rods, like the games. Others last. */
export const methodOrder = (slug: string) => (isMethod(slug) ? METHODS.indexOf(slug) : METHODS.length);

/**
 * One way a Pokémon is met in one game: the area it's in, or the Pokémon met in an area, how, at which levels, and the best chance.
 * `group` is what it's listed under, like the area of a place with several.
 */
export interface Sighting {
  name: string;
  group?: string;
  methods: string[];
  minLevel: number;
  maxLevel: number;
  chance: number;
}

/** What PokéAPI says about meeting a Pokémon in an area, in each game, with what it's about. */
type Sightings = { name: string; group?: string; version_details: ApiEncounter['version_details'] }[];

/** The levels a Pokémon is met at in some of its encounters. */
const levelRange = (encounters: ApiEncounter['version_details'][number]['encounter_details']) => {
  const levels = encounters.flatMap((encounter) => [encounter.min_level, encounter.max_level]);
  return { minLevel: Math.min(...levels), maxLevel: Math.max(...levels) };
};

/**
 * The sightings by game, newest first, and in each game the ones with the best chances first.
 * @param options.byMethod One sighting for each way it's met, with that way's levels and chance, like grass and surfing apart.
 * @returns Each game's slug with its sightings.
 */
export function sightingsByGame(entries: Sightings, { byMethod = false } = {}): { version: string; sightings: Sighting[] }[] {
  const order = getPokedexData().versionOrder;
  const games = new Map<string, { order: number; sightings: Sighting[] }>();
  for (const entry of entries) {
    for (const detail of entry.version_details) {
      const game = games.get(detail.version.name) ?? { order: order[detail.version.name] ?? idFromUrl(detail.version.url), sightings: [] };
      games.set(detail.version.name, game);
      const group = entry.group === undefined ? {} : { group: entry.group };
      const methods = [...new Set(detail.encounter_details.map((encounter) => encounter.method.name))];
      if (!byMethod) {
        // Pokémon walking around add up to more than 100
        game.sightings.push({ name: entry.name, ...group, methods, ...levelRange(detail.encounter_details), chance: Math.min(detail.max_chance, 100) });
        continue;
      }
      for (const method of methods) {
        const encounters = detail.encounter_details.filter((encounter) => encounter.method.name === method);
        // The chances of its slots for that way, together
        const chance = Math.min(
          encounters.reduce((sum, encounter) => sum + encounter.chance, 0),
          100,
        );
        game.sightings.push({ name: entry.name, ...group, methods: [method], ...levelRange(encounters), chance });
      }
    }
  }
  return [...games]
    .sort(([, a], [, b]) => b.order - a.order)
    .map(([version, game]) => ({ version, sightings: game.sightings.sort((a, b) => b.chance - a.chance) }));
}

/** Where a Pokémon is found by game, from PokéAPI's places by area, once for each way it's met there. */
export const placesByGame = (encounters: ApiEncounter[]) =>
  sightingsByGame(
    encounters.map((encounter) => ({ name: encounter.location_area.name, version_details: encounter.version_details })),
    { byMethod: true },
  );

/** The way of meeting Pokémon of a sighting by way, like `surf`. */
const methodOf = (sighting: Sighting) => sighting.methods[0] ?? '';

/**
 * Sightings by way as lines under a bold heading of how they're met, like `**Old Rod**`, the way the games list them: by group in
 * its order, with its name in the heading when there are several, like `**Pokémon Tower (2F) · Wandering around**`, then by way in
 * the games' order, grass before water and the rods, then by chance. What doesn't fit is cut from the end.
 * @param name What a sighting is about, already named, like the place or the Pokémon.
 * @param groups The groups in their order, like the areas of a place, with their names.
 */
export function sightingLines(
  sightings: Sighting[],
  max: number,
  name: (sightings: Sighting[]) => string[],
  t: Translate,
  groups: { slug: string; name: string }[] = [],
): string[] {
  const groupOrder = groups.map((group) => group.slug);
  const sorted = [...sightings].sort(
    (a, b) =>
      groupOrder.indexOf(a.group ?? '') - groupOrder.indexOf(b.group ?? '') || methodOrder(methodOf(a)) - methodOrder(methodOf(b)) || b.chance - a.chance,
  );
  const shown = sorted.slice(0, max);
  const names = name(shown);
  const severalGroups = new Set(shown.map((sighting) => sighting.group)).size > 1;
  const lines: string[] = [];
  shown.forEach((sighting, index) => {
    const previous = shown[index - 1];
    if (!previous || sighting.group !== previous.group || methodOf(sighting) !== methodOf(previous)) {
      const group = severalGroups ? (groups.find((entry) => entry.slug === sighting.group)?.name ?? sighting.group) : null;
      // A blank line between the headings' lists, so they stand apart
      if (previous) lines.push('');
      lines.push(bold([group, methodNames(sighting, t)].filter(Boolean).join(' · ')));
    }
    lines.push(sightingLine(sighting, names[index] ?? sighting.name, t));
  });
  if (sightings.length > shown.length) lines.push('', subtext(t('lookup.more', { count: sightings.length - shown.length })));
  return lines;
}

/** A sighting as a line under the heading of how it's met, like `Route 1 · Lv. 2-5 · 50%`, with what it's about already named. */
function sightingLine(sighting: Sighting, name: string, t: Translate): string {
  const levels =
    sighting.minLevel === sighting.maxLevel
      ? t('pokedex.where.level', { level: formatNumber(sighting.minLevel, t) })
      : t('pokedex.where.levels', { min: formatNumber(sighting.minLevel, t), max: formatNumber(sighting.maxLevel, t) });
  return [name, levels, formatNumber(sighting.chance / 100, t, { style: 'percent' })].join(' · ');
}

/** How a Pokémon is met, like `Old Rod, Good Rod`, with ways that are called the same only once. */
export function methodNames(sighting: Sighting, t: Translate): string {
  const method = (slug: string) => (isMethod(slug) ? t(`pokedex.where.methods.${slug}`) : fromSlug(slug));
  return [...new Set(sighting.methods.map(method))].join(', ');
}

/** A game's name, with the ones only out in Japan marked, as they're called like the others, like Red. */
export const gameName = (version: string, language: string, t: Translate) =>
  version.endsWith('-japan') ? t('pokedex.where.japan', { game: nameOf('versions', version, language) }) : nameOf('versions', version, language);

/** A select of games, with the one shown picked, that has the game as its value. Each has a gamepad, so it's clear they're games. */
export function gameSelect(
  customId: string,
  versions: string[],
  shown: string,
  language: string,
  t: Translate,
  /** The name of each, for games that aren't a version, like the version groups of the moves a Pokémon learns. */
  label = (version: string) => gameName(version, language, t),
) {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(t('pokedex.where.select'))
      .addOptions(
        versions.slice(0, DiscordLimits.selectOptions).map((version) => ({
          label: label(version).slice(0, DiscordLimits.optionLabelLength),
          emoji: buttonIcon('gamepad-2'),
          value: version,
          default: version === shown,
        })),
      ),
  );
}

/**
 * Where a Pokémon or form is found in the wild in one game, with links to the places and a select for the other games.
 * @param context The page, with the game, or none for the newest it's found in.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 * @returns The answer, or null when the Pokémon isn't known.
 */
export async function buildWhereToFind(slug: string, language: string, t: Translate, context: PageContext): Promise<ResponsePayload | null> {
  const match = findBySlug(slug);
  const [encounters, pokemon] = match ? await Promise.all([getEncounters(slug), getPokemon(slug)]) : [null, null];
  if (!match || !encounters || !pokemon) return null;

  const name = matchName(match, language);
  const games = placesByGame(encounters);
  const game = games.find((entry) => entry.version === context.page.game) ?? games[0];
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addSectionComponents(await pokemonHeader(t('pokedex.where.title', { name }), match, pokemon, language, t))
    .addSeparatorComponents(new SeparatorBuilder());

  if (!game) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('pokedex.where.none', { name })));
    return { components: [container], flags: [MessageFlags.IsComponentsV2] };
  }

  const lines = sightingLines(game.sightings, MAX_PLACES, (shown) => shown.map((place) => nameOf('areas', place.name, language)), t);
  // The places, once each, as several areas can be parts of one, like the floors of a tower
  const { areaLocations } = getPokedexData();
  const places = [...new Set(game.sightings.flatMap((sighting) => areaLocations[sighting.name] ?? []))];
  const links = linkSelect(
    { ...context.page, game: game.version },
    places.map((place) => ({ page: { kind: 'location', slug: place, game: game.version }, label: nameOf('locations', place, language) })),
    t('pages.links.places'),
  );
  container
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      gameSelect(
        gameSelectId(context.page, context.back),
        games.map((entry) => entry.version),
        game.version,
        language,
        t,
      ),
    );
  if (links) container.addActionRowComponents(links);
  return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}
