import { bold, ContainerBuilder, MessageFlags, SeparatorBuilder, subtext, TextDisplayBuilder } from 'discord.js';

import type { Translate } from 'utility/i18next';
import { type ApiNature, getNature } from 'utility/pokedex/api';
import { apiName } from 'utility/pokedex/lookup';
import { flavorName } from 'utility/pokedex/lookups/berry';
import { getPokedexData, nameOf } from 'utility/pokedex/names';
import type { ResponsePayload } from 'utility/response';
import { ThemeColors } from 'utility/theme';

const STATS = ['attack', 'defense', 'special-attack', 'special-defense', 'speed'] as const;
const isStat = (slug: string): slug is (typeof STATS)[number] => (STATS as readonly string[]).includes(slug);
const statName = (slug: string, t: Translate) => (isStat(slug) ? t(`pokedex.stats.${slug}`) : slug);

/** Whether a nature changes the stats. The ones that don't have none, or raise and lower the same one. */
const changesStats = (nature: ApiNature): nature is ApiNature & { increased_stat: { name: string }; decreased_stat: { name: string } } =>
  Boolean(nature.increased_stat && nature.decreased_stat && nature.increased_stat.name !== nature.decreased_stat.name);

/** What a nature does to the stats, like `+Attack −Sp. Atk`, or that it does nothing. */
export function natureEffect(nature: ApiNature, t: Translate): string {
  if (!changesStats(nature)) return t('natures.neutral');
  return t('natures.change', { up: statName(nature.increased_stat.name, t), down: statName(nature.decreased_stat.name, t) });
}

/**
 * A nature: which stat it raises and which it lowers, and the flavors the Pokémon likes and dislikes.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 * @returns The answer, or null when PokéAPI doesn't know the nature.
 */
export async function buildNature(slug: string, language: string, t: Translate): Promise<ResponsePayload | null> {
  const nature = await getNature(slug);
  if (!nature) return null;

  const name = apiName(nature.names, language) ?? nameOf('natures', slug, language);
  const details = [`${bold(t('natures.stats'))} ${natureEffect(nature, t)}`];
  if (nature.likes_flavor && nature.hates_flavor) {
    details.push(
      `${bold(t('natures.likes'))} ${flavorName(nature.likes_flavor.name, t)} · ${bold(t('natures.dislikes'))} ${flavorName(nature.hates_flavor.name, t)}`,
    );
  }
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('natures.title', { name })))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(details.join('\n')));
  return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}

/**
 * Every nature, a line each with what it does to the stats, by the stat it raises. The ones that do nothing come last.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 */
export async function buildNatureList(language: string, t: Translate): Promise<ResponsePayload> {
  const natures = (await Promise.all(Object.keys(getPokedexData().natures).map((slug) => getNature(slug)))).filter((nature) => nature !== null);
  const order = (nature: ApiNature) => (changesStats(nature) && isStat(nature.increased_stat.name) ? STATS.indexOf(nature.increased_stat.name) : STATS.length);
  const lines = natures
    .sort((a, b) => order(a) - order(b) || a.id - b.id)
    .map((nature) => `${bold(apiName(nature.names, language) ?? nameOf('natures', nature.name, language))} ${natureEffect(nature, t)}`);
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${t('natures.listTitle')}\n${subtext(t('natures.listNote'))}`))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
  return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}
