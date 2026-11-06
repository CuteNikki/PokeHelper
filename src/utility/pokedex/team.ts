import { bold, ContainerBuilder, MessageFlags, subtext, TextDisplayBuilder } from 'discord.js';

import { statChangeIcon, withTypeEmoji } from 'utility/emojis';
import { formatNumber } from 'utility/duration';
import type { Translate } from 'utility/i18next';
import { getPokemon } from 'utility/pokedex/api';
import { addBlocks } from 'utility/pokedex/lookup';
import { damageTaken } from 'utility/pokedex/matchups';
import { findBySlug, matchName, nameOf } from 'utility/pokedex/names';
import { linkSelect, type PageContext, pokemonLinks } from 'utility/pokedex/pages';
import { allTypeRelations, TYPES } from 'utility/pokedex/typeChart';
import type { ResponsePayload } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/** The most Pokémon in a team, like in the games. */
export const MAX_TEAM = 6;
/** How the Pokémon of a team are written in its page, like `pikachu+charizard`. */
export const TEAM_SEPARATOR = '+';

/** How an attacking type does against a team: who's weak to it, and who resists it or can't be hurt by it. */
export interface TeamMatchup {
  type: string;
  weak: number;
  resists: number;
}

/**
 * How each attacking type does against a team, from the damage each of them takes, the ones most of them are weak to first.
 * @param taken What each Pokémon of the team takes from each type, like 2 for super effective.
 */
export function teamMatchups(taken: Record<string, number>[]): TeamMatchup[] {
  return TYPES.map((type) => ({
    type,
    weak: taken.filter((member) => (member[type] ?? 1) > 1).length,
    resists: taken.filter((member) => (member[type] ?? 1) < 1).length,
  })).sort((a, b) => b.weak - b.resists - (a.weak - a.resists) || b.weak - a.weak);
}

/** The types that are a danger to a team: more than one of them is weak to it, and more are weak than resist it. */
export const dangers = (matchups: TeamMatchup[]) => matchups.filter((matchup) => matchup.weak >= 2 && matchup.weak > matchup.resists);

/**
 * A team's weak spots: the types more of them are weak to than resist, then how every type does against them, with links to them.
 * @param slug The team's Pokémon, joined by {@link TEAM_SEPARATOR}.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 * @returns The page, or null when none of them are known.
 */
export async function buildTeam(slug: string, language: string, t: Translate, context: PageContext): Promise<ResponsePayload | null> {
  const slugs = slug.split(TEAM_SEPARATOR).slice(0, MAX_TEAM);
  const [relations, pokemon] = await Promise.all([allTypeRelations(), Promise.all(slugs.map((member) => getPokemon(member)))]);
  const members = slugs.flatMap((member, index) => {
    const match = findBySlug(member);
    const data = pokemon[index];
    return match && data ? [{ slug: member, name: matchName(match, language), types: data.types.map((entry) => entry.type.name) }] : [];
  });
  if (members.length === 0) return null;

  const matchups = teamMatchups(members.map((member) => damageTaken(member.types.flatMap((type) => relations[type] ?? []))));
  const typeName = (type: string) => withTypeEmoji(type, bold(nameOf('types', type, language)));
  const count = (matchup: TeamMatchup) =>
    `${statChangeIcon(false)} ${t('team.weak', { count: matchup.weak, shown: formatNumber(matchup.weak, t) })} · ${statChangeIcon(true)} ${t('team.resist', { count: matchup.resists, shown: formatNumber(matchup.resists, t) })}`;
  const risky = dangers(matchups);

  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${t('team.title')}\n${subtext(members.map((member) => member.name).join(' · '))}`));
  addBlocks(container, [
    [
      bold(t('team.dangers').toUpperCase()),
      ...(risky.length > 0 ? risky.map((matchup) => `${typeName(matchup.type)} · ${count(matchup)}`) : [t('team.noDangers')]),
    ].join('\n'),
    // The rest, where at least one of them is weak or resists, as types none of them care about say nothing
    [
      bold(t('team.others').toUpperCase()),
      ...matchups
        .filter((matchup) => !risky.includes(matchup) && (matchup.weak > 0 || matchup.resists > 0))
        .map((matchup) => `${typeName(matchup.type)} · ${count(matchup)}`),
    ].join('\n'),
  ]);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(subtext(t('team.note'))));

  const links = linkSelect(
    context.page,
    pokemonLinks(
      members.map((member) => member.slug),
      language,
    ),
    t('pages.links.pokemon'),
  );
  if (links) container.addActionRowComponents(links);
  return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}
