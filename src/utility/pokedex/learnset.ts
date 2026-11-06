import { bold, ContainerBuilder, MessageFlags, SeparatorBuilder, subtext, TextDisplayBuilder } from 'discord.js';

import { DiscordLimits } from 'utility/discordLimits';
import { formatNumber } from 'utility/duration';
import type { Translate } from 'utility/i18next';
import { type ApiPokemon, getPokemon } from 'utility/pokedex/api';
import { gameName, gameSelect } from 'utility/pokedex/encounters';
import { findBySlug, fromSlug, getPokedexData, matchName, nameOf } from 'utility/pokedex/names';
import { gameSelectId, linkSelect, type PageContext } from 'utility/pokedex/pages';
import { pokemonHeader } from 'utility/pokedex/pokemonHeader';
import type { ResponsePayload } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/** The ways of learning moves, in the order they're listed. The rest come after them, named like their slug. */
const METHODS = ['level-up', 'machine', 'egg', 'tutor', 'train'] as const;
type Method = (typeof METHODS)[number];
const isMethod = (slug: string): slug is Method => (METHODS as readonly string[]).includes(slug);
const methodOrder = (slug: string) => (isMethod(slug) ? METHODS.indexOf(slug) : METHODS.length);

/** The most text a way of learning gets, so all four of a Pokémon that learns nearly everything, like Mew, fit in a message. */
const MAX_SECTION_LENGTH = 800;

/** A move a Pokémon learns in a game, how, and at which level when it's by leveling up. */
export interface LearnedMove {
  move: string;
  method: string;
  level: number;
}

/**
 * The moves a Pokémon learns in each version group, newest first, each by how it's learned, the level-up ones by level.
 * @returns Each version group's slug with its moves.
 */
export function movesByGame(moves: ApiPokemon['moves']): { group: string; moves: LearnedMove[] }[] {
  const { versionGroups } = getPokedexData();
  const groups = new Map<string, LearnedMove[]>();
  for (const { move, version_group_details: details } of moves) {
    for (const detail of details) {
      const list = groups.get(detail.version_group.name) ?? [];
      groups.set(detail.version_group.name, list);
      list.push({ move: move.name, method: detail.move_learn_method.name, level: detail.level_learned_at });
    }
  }
  return [...groups]
    .sort(([a], [b]) => (versionGroups[b]?.order ?? 0) - (versionGroups[a]?.order ?? 0))
    .map(([group, list]) => ({
      group,
      moves: list.sort((a, b) => methodOrder(a.method) - methodOrder(b.method) || a.method.localeCompare(b.method) || a.level - b.level),
    }));
}

/** A version group's name, like `Scarlet / Violet`, from the names of its games. */
export function groupName(group: string, language: string, t: Translate): string {
  const versions = getPokedexData().versionGroups[group]?.versions ?? [];
  return versions.length > 0 ? versions.map((version) => gameName(version, language, t)).join(' / ') : fromSlug(group);
}

/** Names, joined, with how many more there are once they get longer than a way of learning may be. */
function listUpTo(names: string[], t: Translate, separator = ', '): string {
  let text = '';
  for (const [index, name] of names.entries()) {
    const next = text ? `${text}${separator}${name}` : name;
    if (next.length > MAX_SECTION_LENGTH) return `${text}${separator}${t('lookup.more', { count: names.length - index })}`;
    text = next;
  }
  return text;
}

/**
 * The moves a Pokémon or form learns in one game: by leveling up with their levels, then by machine, as egg moves and from tutors,
 * with links to the moves and a select for the other games.
 * @param context The page, with the version group, or none for the newest.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 * @returns The answer, or null when the Pokémon isn't known.
 */
export async function buildLearnset(slug: string, language: string, t: Translate, context: PageContext): Promise<ResponsePayload | null> {
  const match = findBySlug(slug);
  const pokemon = match && (await getPokemon(slug));
  if (!match || !pokemon) return null;

  const name = matchName(match, language);
  const games = movesByGame(pokemon.moves);
  // At first the newest game it learns moves by leveling up in, as some, like Pokémon Champions, only teach them otherwise
  const game =
    games.find((entry) => entry.group === context.page.game) ?? games.find((entry) => entry.moves.some((learned) => learned.method === 'level-up')) ?? games[0];
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addSectionComponents(await pokemonHeader(t('pokedex.moves.title', { name }), match, pokemon, language, t))
    .addSeparatorComponents(new SeparatorBuilder());
  if (!game) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('pokedex.moves.none', { name })));
    return { components: [container], flags: [MessageFlags.IsComponentsV2] };
  }

  const moveName = (move: string) => nameOf('moves', move, language);
  const methods = [...new Set(game.moves.map((entry) => entry.method))];
  const sections = methods.map((method) => {
    const learned = game.moves.filter((entry) => entry.method === method);
    const heading = bold(isMethod(method) ? t(`pokedex.moves.methods.${method}`) : fromSlug(method));
    // Leveling up a line each with the level, as the order matters, the rest as one list
    if (method === 'level-up') {
      const lines = learned.map((entry) =>
        entry.level > 0
          ? `${t('pokedex.where.level', { level: formatNumber(entry.level, t) })} · ${moveName(entry.move)}`
          : `${t('pokedex.moves.evolution')} · ${moveName(entry.move)}`,
      );
      return `${heading}\n${listUpTo(lines, t, '\n')}`;
    }
    return `${heading}\n${listUpTo(
      learned.map((entry) => moveName(entry.move)).sort((a, b) => a.localeCompare(b, language)),
      t,
    )}`;
  });

  // The level-up moves first, as they're the ones most looked for
  const links = linkSelect(
    { ...context.page, game: game.group },
    game.moves.slice(0, DiscordLimits.selectOptions).map((entry) => ({
      page: { kind: 'move' as const, slug: entry.move },
      label: moveName(entry.move),
      description: entry.method === 'level-up' && entry.level > 0 ? t('pokedex.where.level', { level: formatNumber(entry.level, t) }) : undefined,
    })),
    t('pages.links.moves'),
  );
  container
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(sections.join('\n\n')))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(subtext(t('pokedex.moves.count', { count: new Set(game.moves.map((entry) => entry.move)).size }))),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      gameSelect(
        gameSelectId(context.page, context.back),
        games.map((entry) => entry.group),
        game.group,
        language,
        t,
        (group) => groupName(group, language, t),
      ),
    );
  if (links) container.addActionRowComponents(links);
  return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}
