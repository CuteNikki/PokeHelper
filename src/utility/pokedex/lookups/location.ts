import { ContainerBuilder, MessageFlags, SeparatorBuilder, type StringSelectMenuInteraction, subtext, TextDisplayBuilder } from 'discord.js';

import { getTranslate, resolveLanguage, type Translate } from 'utility/i18next';
import { answerPokeApiError, getLocation, getLocationArea } from 'utility/pokedex/api';
import { gameName, gameSelect, sightingLine, sightingsByGame } from 'utility/pokedex/encounters';
import { apiName } from 'utility/pokedex/lookup';
import { pokemonNames } from 'utility/pokedex/lookups/item';
import { loadPokedexData, nameOf } from 'utility/pokedex/names';
import { type ResponsePayload, sendError } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/** The select of games on a place is `location-game:<slug>`, with the game as its value, so it works however old it is. */
export const LOCATION_GAME_PREFIX = 'location-game:';

/** The most Pokémon listed for a game, so the answer stays well within what a message can hold. Those with the best chances first. */
const MAX_POKEMON = 25;

/**
 * A place: its region, and the wild Pokémon met there in one game, by area when it has several, with a select for the other games.
 * @param version The game, or the newest anything is met there in.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 * @returns The answer, or null when PokéAPI doesn't know the place.
 */
export async function buildLocation(slug: string, language: string, t: Translate, version: string | null = null): Promise<ResponsePayload | null> {
  const location = await getLocation(slug);
  if (!location) return null;
  const areas = (await Promise.all(location.areas.map((area) => getLocationArea(area.name)))).filter((area) => area !== null);

  const name = apiName(location.names, language) ?? nameOf('locations', slug, language);
  const games = sightingsByGame(
    areas.flatMap((area) =>
      area.pokemon_encounters.map((encounter) => ({ name: encounter.pokemon.name, group: area.name, version_details: encounter.version_details })),
    ),
  );
  const game = games.find((entry) => entry.version === version) ?? games[0];
  const region = location.region ? nameOf('regions', location.region.name, language) : null;

  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [t('locations.title', { name }), subtext([region, game ? gameName(game.version, language, t) : null].filter(Boolean).join(' · '))].join('\n'),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder());
  if (!game) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('locations.none')));
    return { components: [container], flags: [MessageFlags.IsComponentsV2] };
  }

  // By area, in the place's order, when there's more than one, each with its Pokémon by their chances
  const shown = game.sightings.slice(0, MAX_POKEMON);
  const names = pokemonNames(
    shown.map((sighting) => sighting.name),
    language,
  );
  const groups = [...new Set(areas.map((area) => area.name))].filter((area) => shown.some((sighting) => sighting.group === area));
  const lines = groups.flatMap((area) => [
    ...(groups.length > 1 ? [subtext(nameOf('areas', area, language))] : []),
    ...shown.flatMap((sighting, index) => (sighting.group === area ? [sightingLine(sighting, names[index] ?? sighting.name, t)] : [])),
  ]);
  const more = game.sightings.length - shown.length;
  if (more > 0) lines.push(subtext(t('lookup.more', { count: more })));

  container
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(subtext(t('pokedex.where.note'))))
    .addActionRowComponents(
      gameSelect(
        `${LOCATION_GAME_PREFIX}${slug}`,
        games.map((entry) => entry.version),
        game.version,
        language,
        t,
      ),
    );
  return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}

/** Show another game of the place the select is on. */
export async function updateLocation(interaction: StringSelectMenuInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const slug = interaction.customId.slice(LOCATION_GAME_PREFIX.length);
  if (!slug) return sendError(interaction, t('system.outdated'));
  await interaction.deferUpdate();
  try {
    await loadPokedexData();
    const answer = await buildLocation(slug, resolveLanguage(interaction.locale), t, interaction.values[0] ?? null);
    if (!answer) return sendError(interaction, t('system.outdated'));
    return interaction.editReply(answer);
  } catch (error) {
    return answerPokeApiError(interaction, error, t);
  }
}
