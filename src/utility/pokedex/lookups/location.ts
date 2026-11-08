import { ContainerBuilder, SeparatorBuilder, subtext, TextDisplayBuilder } from 'discord.js';

import type { Translate } from 'utility/i18next';
import { getLocation, getLocationArea } from 'utility/pokedex/api';
import { gameSelect, sightingLines, sightingsByGame } from 'utility/pokedex/encounters';
import { apiName } from 'utility/pokedex/lookup';
import { pokemonNames } from 'utility/pokedex/lookups/item';
import { nameOf } from 'utility/pokedex/names';
import { gameSelectId, linkSelect, type PageContext, pokemonLinks } from 'utility/pokedex/pages';
import { messageOf, quietMessageOf, type ResponsePayload } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/** The most Pokémon listed for a game, so the answer stays well within what a message can hold. Those with the best chances first. */
const MAX_POKEMON = 25;

/**
 * A place: its region, and the wild Pokémon met there in one game, by area when it has several, with links to them and a select for
 * the other games.
 * @param context The page, with the game, or none for the newest anything is met there in.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 * @returns The answer, or null when PokéAPI doesn't know the place.
 */
export async function buildLocation(slug: string, language: string, t: Translate, context: PageContext): Promise<ResponsePayload | null> {
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
  const game = games.find((entry) => entry.version === context.page.game) ?? games[0];
  const region = location.region ? nameOf('regions', location.region.name, language) : null;

  const header = [t('locations.title', { name }), region ? subtext(t('locations.region', { region })) : null];
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(header.filter(Boolean).join('\n')))
    .addSeparatorComponents(new SeparatorBuilder());
  if (!game) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('locations.none')));
    return messageOf(container);
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
  const links = linkSelect(
    { ...context.page, game: game.version },
    pokemonLinks(
      game.sightings.map((sighting) => sighting.name),
      language,
    ),
    t('pages.links.pokemon'),
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
  return quietMessageOf(container);
}
