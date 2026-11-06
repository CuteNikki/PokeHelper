import {
  ActionRowBuilder,
  bold,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
  subtext,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';

import { DiscordLimits } from 'utility/discordLimits';
import { formatNumber } from 'utility/duration';
import { buttonIcon, textIcon } from 'utility/emojis';
import { getTranslate, resolveLanguage, type Translate } from 'utility/i18next';
import { answerPokeApiError, type ApiEncounter, artworkUrl, getEncounters, idFromUrl } from 'utility/pokedex/api';
import { findBySlug, fromSlug, getPokedexData, loadPokedexData, matchName, nameOf } from 'utility/pokedex/names';
import { type ResponsePayload, sendError, sendResponse } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/**
 * The Where to find button of a Pokédex entry is `pokedex-where:<slug>`, and the select of games on its answer is
 * `pokedex-where-game:<slug>` with the game as its value, so they work however old they are.
 */
export const POKEDEX_WHERE_PREFIX = 'pokedex-where:';
export const POKEDEX_WHERE_GAME_PREFIX = 'pokedex-where-game:';

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
 * Sightings by way as lines under headings, like the games list them: by group in its order, with its name when there are several,
 * then by way in the games' order, grass before water and the rods, then by chance. What doesn't fit is cut from the end.
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
    const newGroup = index === 0 || sighting.group !== previous?.group;
    if (newGroup && severalGroups) lines.push(bold(groups.find((group) => group.slug === sighting.group)?.name ?? sighting.group ?? ''));
    if (newGroup || methodOf(sighting) !== (previous && methodOf(previous))) lines.push(subtext(methodNames(sighting, t)));
    lines.push(sightingLine(sighting, names[index] ?? sighting.name, t, { withMethods: false }));
  });
  if (sightings.length > shown.length) lines.push(subtext(t('lookup.more', { count: sightings.length - shown.length })));
  return lines;
}

/** The game an answer is about, as a line of its own with a gamepad, so it's clear what it is. */
export const gameLine = (version: string, language: string, t: Translate) => `${textIcon('gamepad-2')} ${bold(gameName(version, language, t))}`;

/** A sighting as a line, like `**Route 1** · Lv. 2–5 · Grass or cave · 50%`, with what it's about already named. */
export function sightingLine(sighting: Sighting, name: string, t: Translate, { withMethods = true } = {}): string {
  const levels =
    sighting.minLevel === sighting.maxLevel
      ? t('pokedex.where.level', { level: formatNumber(sighting.minLevel, t) })
      : t('pokedex.where.levels', { min: formatNumber(sighting.minLevel, t), max: formatNumber(sighting.maxLevel, t) });
  const chance = formatNumber(sighting.chance / 100, t, { style: 'percent' });
  return [bold(name), levels, withMethods ? methodNames(sighting, t) : null, chance].filter(Boolean).join(' · ');
}

/** How a Pokémon is met, like `Old Rod, Good Rod`, with ways that are called the same only once. */
export function methodNames(sighting: Sighting, t: Translate): string {
  const method = (slug: string) => (isMethod(slug) ? t(`pokedex.where.methods.${slug}`) : fromSlug(slug));
  return [...new Set(sighting.methods.map(method))].join(', ');
}

/** A game's name, with the ones only out in Japan marked, as they're called like the others, like Red. */
const gameName = (version: string, language: string, t: Translate) =>
  version.endsWith('-japan') ? t('pokedex.where.japan', { game: nameOf('versions', version, language) }) : nameOf('versions', version, language);

/** A select of games, with the one shown picked, that has the game as its value. Each has a gamepad, so it's clear they're games. */
export function gameSelect(customId: string, versions: string[], shown: string, language: string, t: Translate) {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(t('pokedex.where.select'))
      .addOptions(
        versions.slice(0, DiscordLimits.selectOptions).map((version) => ({
          label: gameName(version, language, t).slice(0, DiscordLimits.optionLabelLength),
          emoji: buttonIcon('gamepad-2'),
          value: version,
          default: version === shown,
        })),
      ),
  );
}

/**
 * Where a Pokémon or form is found in the wild in one game, with a select for the others.
 * @param version The game, or the newest it's found in.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 * @returns The answer, or null when the Pokémon isn't known.
 */
export async function buildWhereToFind(slug: string, version: string | null, language: string, t: Translate): Promise<ResponsePayload | null> {
  const match = findBySlug(slug);
  const encounters = match && (await getEncounters(slug));
  if (!match || !encounters) return null;

  const name = matchName(match, language);
  const games = placesByGame(encounters);
  const game = games.find((entry) => entry.version === version) ?? games[0];
  const header = [t('pokedex.where.title', { name }), game ? gameLine(game.version, language, t) : null].filter(Boolean).join('\n');
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(header))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(artworkUrl(match.species.id, false)).setDescription(t('pokedex.picture', { name }))),
    )
    .addSeparatorComponents(new SeparatorBuilder());

  if (!game) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('pokedex.where.none', { name })));
    return { components: [container], flags: [MessageFlags.IsComponentsV2] };
  }

  const lines = sightingLines(game.sightings, MAX_PLACES, (shown) => shown.map((place) => nameOf('areas', place.name, language)), t);
  container
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      gameSelect(
        `${POKEDEX_WHERE_GAME_PREFIX}${slug}`,
        games.map((entry) => entry.version),
        game.version,
        language,
        t,
      ),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(subtext(t('locations.note'))));
  return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}

/** The Where to find button of a Pokédex entry. */
export const whereToFindButton = (slug: string, t: Translate) =>
  new ButtonBuilder()
    .setCustomId(`${POKEDEX_WHERE_PREFIX}${slug}`)
    .setStyle(ButtonStyle.Secondary)
    .setEmoji(buttonIcon('map-pin'))
    .setLabel(t('pokedex.where.button'));

/**
 * Show where the entry's Pokémon is found to whoever pressed the button, or another game of it to whoever picked one, so the entry
 * stays as it is for everyone.
 */
export async function showWhereToFind(interaction: ButtonInteraction | StringSelectMenuInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const fromSelect = interaction.isStringSelectMenu();
  const slug = interaction.customId.slice((fromSelect ? POKEDEX_WHERE_GAME_PREFIX : POKEDEX_WHERE_PREFIX).length);
  if (!slug) return sendError(interaction, t('system.outdated'));

  // The select changes the answer it's on, the button on the entry answers with a new one
  if (fromSelect) await interaction.deferUpdate();
  else await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  try {
    await loadPokedexData();
    const answer = await buildWhereToFind(slug, fromSelect ? (interaction.values[0] ?? null) : null, resolveLanguage(interaction.locale), t);
    if (!answer) return sendError(interaction, t('system.outdated'));
    return fromSelect ? interaction.editReply(answer) : sendResponse(interaction, answer);
  } catch (error) {
    return answerPokeApiError(interaction, error, t);
  }
}
