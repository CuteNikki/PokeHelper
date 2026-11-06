import { ContainerBuilder, MessageFlags, subtext, TextDisplayBuilder } from 'discord.js';

import { withTypeEmoji } from 'utility/emojis';
import type { Translate } from 'utility/i18next';
import { getPokemon } from 'utility/pokedex/api';
import { addBlocks, labeled } from 'utility/pokedex/lookup';
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

/** How an attacking type does against a team: which of them are weak to it, and which resist it or can't be hurt by it, by their place. */
export interface TeamMatchup {
  type: string;
  weak: number[];
  resists: number[];
}

/**
 * How each attacking type does against a team, from the damage each of them takes, the ones most of them are weak to first.
 * @param taken What each Pokémon of the team takes from each type, like 2 for super effective.
 */
export function teamMatchups(taken: Record<string, number>[]): TeamMatchup[] {
  const members = (keep: (multiplier: number) => boolean, type: string) => taken.flatMap((member, index) => (keep(member[type] ?? 1) ? [index] : []));
  return TYPES.map((type) => ({ type, weak: members((multiplier) => multiplier > 1, type), resists: members((multiplier) => multiplier < 1, type) })).sort(
    (a, b) => b.weak.length - b.resists.length - (a.weak.length - a.resists.length) || b.weak.length - a.weak.length,
  );
}

/** How a type does against a team: a danger, when more than one of them is weak to it and fewer resist it, a weak spot, when more are weak to it than resist it, covered, when as many or more resist it, or nothing. */
export function teamRisk(matchup: TeamMatchup): 'danger' | 'weakSpot' | 'covered' | null {
  const weak = matchup.weak.length;
  const resists = matchup.resists.length;
  if (weak >= 2 && weak > resists) return 'danger';
  if (weak > resists) return 'weakSpot';
  return resists > 0 ? 'covered' : null;
}

/**
 * A team's weak spots, the way the type pages show a type: the types to watch out for, which more than one of them is weak to and fewer
 * resist, with who's weak, then the types only one is weak to, then the ones the team covers, with links to them.
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
  const typeName = (type: string) => withTypeEmoji(type, nameOf('types', type, language));
  // Who's weak to it, by name, as that's what changes a team
  const weakLine = (matchup: TeamMatchup) => `${typeName(matchup.type)} · ${matchup.weak.map((index) => members[index]?.name ?? '').join(', ')}`;
  const of = (risk: ReturnType<typeof teamRisk>) => matchups.filter((matchup) => teamRisk(matchup) === risk);
  const dangers = of('danger');
  const weakSpots = of('weakSpot');
  const covered = of('covered');

  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${t('team.title')}\n${subtext(members.map((member) => member.name).join(' · '))}`));
  addBlocks(container, [
    labeled(t('team.dangers'), dangers.length > 0 ? dangers.map(weakLine).join('\n') : t('team.noDangers')),
    weakSpots.length > 0 && labeled(t('team.weakSpots'), weakSpots.map(weakLine).join('\n')),
    covered.length > 0 &&
      labeled(
        t('team.covered'),
        covered
          .map((matchup) => matchup.type)
          .sort((a, b) => TYPES.indexOf(a) - TYPES.indexOf(b))
          .map(typeName)
          .join(', '),
      ),
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
