import { formatNumber } from 'utility/duration';
import type { Translate } from 'utility/i18next';
import { type ApiEvolutionDetail, speciesIdFromUrl } from 'utility/pokedex/api';
import { fromSlug, nameIn, nameOf, speciesById } from 'utility/pokedex/names';

/** Triggers that are a whole sentence of their own, with what else they need added after. */
const SPECIAL_TRIGGERS = [
  'shed',
  'spin',
  'tower-of-darkness',
  'tower-of-waters',
  'three-critical-hits',
  'take-damage',
  'in-battle-level-up',
  'agile-style-move',
  'strong-style-move',
  'recoil-damage',
  'use-move',
  'three-defeated-bisharp',
  'gimmighoul-coins',
  'meltan-candies',
] as const;
type SpecialTrigger = (typeof SPECIAL_TRIGGERS)[number];
const isSpecialTrigger = (trigger: string): trigger is SpecialTrigger => (SPECIAL_TRIGGERS as readonly string[]).includes(trigger);

/** How its Attack has to compare to its Defense, by PokéAPI's number for it. */
const STAT_COMPARISONS = { '1': 'higher', '0': 'same', '-1': 'lower' } as const;

/** How it evolves in the newest games, which is the one marked so, or else the last one listed. */
export const newestEvolution = (details: ApiEvolutionDetail[]) => details.find((detail) => detail.is_default) ?? details.at(-1) ?? null;

/**
 * How a Pokémon evolves in the newest games, in a few words, like `Level 16`, `Thunder Stone` or `High friendship, during the day`.
 * Null for the first of a chain.
 */
export function evolutionCondition(details: ApiEvolutionDetail[], language: string, t: Translate): string | null {
  const detail = newestEvolution(details);
  if (!detail) return null;
  const item = (slug: string) => nameOf('items', slug, language);
  const move = (slug: string) => nameOf('moves', slug, language);
  const type = (slug: string) => nameOf('types', slug, language);
  const species = (url: string, slug: string) => nameIn(speciesById(speciesIdFromUrl(url) ?? 0)?.names, language) || fromSlug(slug);
  const trigger = detail.trigger.name;

  // What it's done by first, then everything else it needs
  const parts: string[] = [];
  if (trigger === 'level-up') {
    parts.push(detail.min_level ? t('pokedex.evolution.how.level', { level: detail.min_level }) : t('pokedex.evolution.how.levelUp'));
  } else if (trigger === 'use-item' && detail.item) {
    parts.push(item(detail.item.name));
  } else if (trigger === 'trade') {
    parts.push(
      detail.trade_species
        ? t('pokedex.evolution.how.tradeFor', { pokemon: species(detail.trade_species.url, detail.trade_species.name) })
        : t('pokedex.evolution.how.trade'),
    );
  } else if (isSpecialTrigger(trigger)) {
    const usedMove = detail.used_move ?? detail.known_move;
    parts.push(
      t(`pokedex.evolution.how.triggers.${trigger}`, {
        move: usedMove ? move(usedMove.name) : '',
        count: detail.min_move_count ?? 20,
        damage: detail.min_damage_taken ?? 49,
        level: detail.min_level ?? 20,
      }),
    );
  } else {
    parts.push(t('pokedex.evolution.how.other'));
  }

  if (detail.held_item) parts.push(t('pokedex.evolution.how.holding', { item: item(detail.held_item.name) }));
  if (detail.known_move && trigger !== 'use-move' && !trigger.endsWith('-style-move')) {
    parts.push(t('pokedex.evolution.how.knowing', { move: move(detail.known_move.name) }));
  }
  if (detail.known_move_type) parts.push(t('pokedex.evolution.how.knowingType', { type: type(detail.known_move_type.name) }));
  if (detail.min_happiness) parts.push(t('pokedex.evolution.how.happiness'));
  if (detail.min_affection) parts.push(t('pokedex.evolution.how.affection'));
  if (detail.min_beauty) parts.push(t('pokedex.evolution.how.beauty'));
  if (detail.time_of_day === 'day' || detail.time_of_day === 'night' || detail.time_of_day === 'dusk') {
    parts.push(t(`pokedex.evolution.how.time.${detail.time_of_day}`));
  }
  if (detail.gender === 1 || detail.gender === 2) parts.push(t(detail.gender === 1 ? 'pokedex.evolution.how.female' : 'pokedex.evolution.how.male'));
  if (detail.location) parts.push(t('pokedex.evolution.how.location', { location: nameOf('locations', detail.location.name, language) }));
  if (detail.needs_overworld_rain) parts.push(t('pokedex.evolution.how.rain'));
  if (detail.party_species) parts.push(t('pokedex.evolution.how.partySpecies', { pokemon: species(detail.party_species.url, detail.party_species.name) }));
  if (detail.party_type) parts.push(t('pokedex.evolution.how.partyType', { type: type(detail.party_type.name) }));
  const comparison = STAT_COMPARISONS[String(detail.relative_physical_stats) as keyof typeof STAT_COMPARISONS] as
    (typeof STAT_COMPARISONS)[keyof typeof STAT_COMPARISONS] | undefined;
  if (comparison) parts.push(t(`pokedex.evolution.how.stats.${comparison}`));
  if (detail.min_steps) parts.push(t('pokedex.evolution.how.steps', { steps: formatNumber(detail.min_steps, t) }));
  if (detail.turn_upside_down) parts.push(t('pokedex.evolution.how.upsideDown'));

  // Leveling up without a level goes without saying when it needs something else, like `High friendship, at night`
  if (trigger === 'level-up' && !detail.min_level && parts.length > 1) parts.shift();
  const text = parts.join(', ');
  return text.charAt(0).toLocaleUpperCase(language) + text.slice(1);
}
