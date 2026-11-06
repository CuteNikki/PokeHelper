import { bold, ContainerBuilder, MessageFlags, SeparatorBuilder, subtext, TextDisplayBuilder } from 'discord.js';

import { formatNumber } from 'utility/duration';
import { withTypeEmoji } from 'utility/emojis';
import type { Translate } from 'utility/i18next';
import { getContestEffect, getMove, idFromUrl } from 'utility/pokedex/api';
import { CONDITION_TYPES, emojiBar } from 'utility/pokedex/bars';
import { apiName, newestText, textIn } from 'utility/pokedex/lookup';
import { nameOf } from 'utility/pokedex/names';
import { TYPE_COLORS } from 'utility/pokedex/types';
import type { ResponsePayload } from 'utility/response';
import { quote } from 'utility/text';
import { ThemeColors } from 'utility/theme';

const DAMAGE_CLASSES = ['physical', 'special', 'status'] as const;
const CONTEST_TYPES = ['cool', 'beauty', 'cute', 'smart', 'tough'] as const;
const isOneOf = <T extends string>(list: readonly T[], value: string): value is T => (list as readonly string[]).includes(value);

/** Where the bars are full: strong moves go past 150, but filling at that keeps the usual ones apart. No move has more than 40 PP. */
const BAR_MAX = { power: 150, accuracy: 100, pp: 40 };
/** The most hearts a move appeals or jams with in contests. */
const CONTEST_MAX = 8;

/**
 * A move: its type, class and description from the games, its numbers as bars, its effect, how it does in contests, and how many
 * Pokémon learn it.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 * @returns The answer, or null when PokéAPI doesn't know the move.
 */
export async function buildMove(slug: string, language: string, t: Translate): Promise<ResponsePayload | null> {
  const move = await getMove(slug);
  if (!move) return null;
  const contest = move.contest_effect ? await getContestEffect(idFromUrl(move.contest_effect.url)) : null;

  const name = apiName(move.names, language) ?? nameOf('moves', slug, language);
  const type = move.type.name;
  const damageClass = isOneOf(DAMAGE_CLASSES, move.damage_class.name) ? t(`moves.classes.${move.damage_class.name}`) : move.damage_class.name;
  const description = newestText(move.flavor_text_entries, 'flavor_text', language);
  const effect = textIn(move.effect_entries, 'short_effect', language)?.replaceAll('$effect_chance', String(move.effect_chance ?? ''));

  // A bar with the value and what it is after it, like the base stats in the Pokédex. Moves without one, like status moves without power, get an empty bar
  const bar = (value: number | null, max: number, label: string, shown = value === null ? t('moves.none') : formatNumber(value, t)) =>
    `${emojiBar(value ?? 0, max, type)} ${bold(shown)} ${label}`;
  const numbers = [
    bar(move.power, BAR_MAX.power, t('moves.power')),
    bar(
      move.accuracy,
      BAR_MAX.accuracy,
      t('moves.accuracy'),
      move.accuracy === null ? t('moves.none') : formatNumber(move.accuracy / 100, t, { style: 'percent' }),
    ),
    bar(move.pp, BAR_MAX.pp, t('moves.pp')),
    ...(move.priority === 0 ? [] : [`${bold(t('moves.priority'))} ${formatNumber(move.priority, t, { signDisplay: 'always' })}`]),
  ];

  const container = new ContainerBuilder()
    .setAccentColor(TYPE_COLORS[type] ?? ThemeColors.info)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          t('moves.title', { name }),
          subtext(
            [withTypeEmoji(type, nameOf('types', type, language)), damageClass, t('lookup.generation', { number: idFromUrl(move.generation.url) })].join(' · '),
          ),
          description ? quote(description) : null,
        ]
          .filter(Boolean)
          .join('\n'),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(numbers.join('\n')));

  if (effect) {
    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${bold(t('moves.effect'))}\n${effect}`));
  }
  if (move.contest_type) {
    const condition = move.contest_type.name;
    const conditionName = isOneOf(CONTEST_TYPES, condition) ? t(`moves.contestTypes.${condition}`) : condition;
    const color = CONDITION_TYPES[condition] ?? type;
    const lines = [`${bold(t('moves.contest'))} · ${conditionName}`];
    if (contest) {
      lines.push(
        `${emojiBar(contest.appeal, CONTEST_MAX, color)} ${bold(formatNumber(contest.appeal, t))} ${t('moves.appeal')}`,
        `${emojiBar(contest.jam, CONTEST_MAX, color)} ${bold(formatNumber(contest.jam, t))} ${t('moves.jam')}`,
      );
    }
    container.addSeparatorComponents(new SeparatorBuilder()).addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
  }
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(subtext(t('moves.learnedBy', { count: move.learned_by_pokemon.length }))));
  return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}
