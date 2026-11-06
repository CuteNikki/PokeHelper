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
import { buttonIcon } from 'utility/emojis';
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
  'wanderer',
  'max-raid',
  'dynamax-adventure',
] as const;
type Method = (typeof METHODS)[number];
const isMethod = (slug: string): slug is Method => (METHODS as readonly string[]).includes(slug);

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

/**
 * The sightings by game, newest first, and in each game the ones with the best chances first.
 * @returns Each game's slug with its sightings.
 */
export function sightingsByGame(entries: Sightings): { version: string; sightings: Sighting[] }[] {
  const order = getPokedexData().versionOrder;
  const games = new Map<string, { order: number; sightings: Sighting[] }>();
  for (const entry of entries) {
    for (const detail of entry.version_details) {
      const game = games.get(detail.version.name) ?? { order: order[detail.version.name] ?? idFromUrl(detail.version.url), sightings: [] };
      games.set(detail.version.name, game);
      const levels = detail.encounter_details.flatMap((encounter) => [encounter.min_level, encounter.max_level]);
      game.sightings.push({
        name: entry.name,
        ...(entry.group === undefined ? {} : { group: entry.group }),
        methods: [...new Set(detail.encounter_details.map((encounter) => encounter.method.name))],
        minLevel: Math.min(...levels),
        maxLevel: Math.max(...levels),
        // Pokémon walking around add up to more than 100
        chance: Math.min(detail.max_chance, 100),
      });
    }
  }
  return [...games]
    .sort(([, a], [, b]) => b.order - a.order)
    .map(([version, game]) => ({ version, sightings: game.sightings.sort((a, b) => b.chance - a.chance) }));
}

/** Where a Pokémon is found by game, from PokéAPI's places by area. */
export const placesByGame = (encounters: ApiEncounter[]) =>
  sightingsByGame(encounters.map((encounter) => ({ name: encounter.location_area.name, version_details: encounter.version_details })));

/** A sighting as a line, like `**Route 1** · Lv. 2–5 · Grass or cave · 50%`, with what it's about already named. */
export function sightingLine(sighting: Sighting, name: string, t: Translate): string {
  const method = (slug: string) => (isMethod(slug) ? t(`pokedex.where.methods.${slug}`) : fromSlug(slug));
  const levels =
    sighting.minLevel === sighting.maxLevel
      ? t('pokedex.where.level', { level: formatNumber(sighting.minLevel, t) })
      : t('pokedex.where.levels', { min: formatNumber(sighting.minLevel, t), max: formatNumber(sighting.maxLevel, t) });
  const chance = formatNumber(sighting.chance / 100, t, { style: 'percent' });
  return [bold(name), levels, [...new Set(sighting.methods.map(method))].join(', '), chance].join(' · ');
}

/** A game's name, with the ones only out in Japan marked, as they're called like the others, like Red. */
export const gameName = (version: string, language: string, t: Translate) =>
  version.endsWith('-japan') ? t('pokedex.where.japan', { game: nameOf('versions', version, language) }) : nameOf('versions', version, language);

/** A select of games, with the one shown picked, that has the game as its value. */
export function gameSelect(customId: string, versions: string[], shown: string, language: string, t: Translate) {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(t('pokedex.where.select'))
      .addOptions(
        versions.slice(0, DiscordLimits.selectOptions).map((version) => ({
          label: gameName(version, language, t).slice(0, DiscordLimits.optionLabelLength),
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
  const header = new TextDisplayBuilder().setContent(
    [t('pokedex.where.title', { name }), game ? subtext(gameName(game.version, language, t)) : null].filter(Boolean).join('\n'),
  );
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(header)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(artworkUrl(match.species.id, false)).setDescription(t('pokedex.picture', { name }))),
    )
    .addSeparatorComponents(new SeparatorBuilder());

  if (!game) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('pokedex.where.none', { name })));
    return { components: [container], flags: [MessageFlags.IsComponentsV2] };
  }

  const lines = game.sightings.slice(0, MAX_PLACES).map((place) => sightingLine(place, nameOf('areas', place.name, language), t));
  const more = game.sightings.length - MAX_PLACES;
  if (more > 0) lines.push(subtext(t('pokedex.where.more', { count: more })));
  container
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(subtext(t('pokedex.where.note'))))
    .addActionRowComponents(
      gameSelect(
        `${POKEDEX_WHERE_GAME_PREFIX}${slug}`,
        games.map((entry) => entry.version),
        game.version,
        language,
        t,
      ),
    );
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
