import { bold, ContainerBuilder, MessageFlags, SeparatorBuilder, subtext, TextDisplayBuilder } from 'discord.js';

import { formatNumber } from 'utility/duration';
import { withTypeEmoji } from 'utility/emojis';
import type { Translate } from 'utility/i18next';
import { getContestEffect, getMove, idFromUrl } from 'utility/pokedex/api';
import { apiName, newestText, textIn } from 'utility/pokedex/lookup';
import { nameOf } from 'utility/pokedex/names';
import { TYPE_COLORS } from 'utility/pokedex/types';
import type { ResponsePayload } from 'utility/response';
import { quote } from 'utility/text';
import { ThemeColors } from 'utility/theme';

const DAMAGE_CLASSES = ['physical', 'special', 'status'] as const;
const CONTEST_TYPES = ['cool', 'beauty', 'cute', 'smart', 'tough'] as const;
const isOneOf = <T extends string>(list: readonly T[], value: string): value is T => (list as readonly string[]).includes(value);

/**
 * A move: its type, class and numbers, its description from the games, its effect, how it does in contests, and how many
 * Pokémon learn it.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 * @returns The answer, or null when PokéAPI doesn't know the move.
 */
export async function buildMove(slug: string, language: string, t: Translate): Promise<ResponsePayload | null> {
  const move = await getMove(slug);
  if (!move) return null;
  const contest = move.contest_effect ? await getContestEffect(idFromUrl(move.contest_effect.url)) : null;

  const name = apiName(move.names, language) ?? nameOf('moves', slug, language);
  const type = nameOf('types', move.type.name, language);
  const damageClass = isOneOf(DAMAGE_CLASSES, move.damage_class.name) ? t(`moves.classes.${move.damage_class.name}`) : move.damage_class.name;
  const description = newestText(move.flavor_text_entries, 'flavor_text', language);
  const effect = textIn(move.effect_entries, 'short_effect', language)?.replaceAll('$effect_chance', String(move.effect_chance ?? ''));
  const none = t('moves.none');
  const number = (value: number | null) => (value === null ? none : formatNumber(value, t));

  const header = [
    t('moves.title', { name }),
    subtext([withTypeEmoji(move.type.name, type), damageClass, t('lookup.generation', { number: idFromUrl(move.generation.url) })].join(' · ')),
    description ? quote(description) : null,
  ];
  const numbers = [
    `${bold(t('moves.power'))} ${number(move.power)}`,
    `${bold(t('moves.accuracy'))} ${move.accuracy === null ? none : formatNumber(move.accuracy / 100, t, { style: 'percent' })}`,
    `${bold(t('moves.pp'))} ${number(move.pp)}`,
    ...(move.priority === 0 ? [] : [`${bold(t('moves.priority'))} ${move.priority > 0 ? '+' : ''}${formatNumber(move.priority, t)}`]),
  ];
  const details = [numbers.join(' · '), effect ? `${bold(t('moves.effect'))} ${effect}` : null];
  if (move.contest_type) {
    const contestType = isOneOf(CONTEST_TYPES, move.contest_type.name) ? t(`moves.contestTypes.${move.contest_type.name}`) : move.contest_type.name;
    const scores = contest ? [`${t('moves.appeal')} ${formatNumber(contest.appeal, t)}`, `${t('moves.jam')} ${formatNumber(contest.jam, t)}`] : [];
    details.push(`${bold(t('moves.contest'))} ${[contestType, ...scores].join(' · ')}`);
  }

  const container = new ContainerBuilder()
    .setAccentColor(TYPE_COLORS[move.type.name] ?? ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(header.filter(Boolean).join('\n')))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(details.filter(Boolean).join('\n')))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(subtext(t('moves.learnedBy', { count: move.learned_by_pokemon.length }))));
  return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}
