import { ContainerBuilder, MessageFlags, SeparatorBuilder, type StringSelectMenuInteraction, subtext, TextDisplayBuilder } from 'discord.js';

import { getTranslate, resolveLanguage, type Translate } from 'utility/i18next';
import { answerPokeApiError, getLocation, getLocationArea } from 'utility/pokedex/api';
import { gameSelect, sightingLines, sightingsByGame } from 'utility/pokedex/encounters';
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
    { byMethod: true },
  );
  const game = games.find((entry) => entry.version === version) ?? games[0];
  const region = location.region ? nameOf('regions', location.region.name, language) : null;

  const header = [t('locations.title', { name }), region ? subtext(t('locations.region', { region })) : null];
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(header.filter(Boolean).join('\n')))
    .addSeparatorComponents(new SeparatorBuilder());
  if (!game) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('locations.none')));
    return { components: [container], flags: [MessageFlags.IsComponentsV2] };
  }

  const lines = sightingLines(
    game.sightings,
    MAX_POKEMON,
    (shown) =>
      pokemonNames(
        shown.map((sighting) => sighting.name),
        language,
      ),
    t,
    areas.map((area) => ({ slug: area.name, name: nameOf('areas', area.name, language) })),
  );
  container
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
    .addSeparatorComponents(new SeparatorBuilder())
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
