import { ActionRowBuilder, bold, type ButtonBuilder, ContainerBuilder, SeparatorBuilder, subtext, TextDisplayBuilder } from 'discord.js';

import { formatNumber } from 'utility/duration';
import { buttonIcon, statChangeIcon } from 'utility/emojis';
import type { Translate } from 'utility/i18next';
import { type ApiNature, getNature } from 'utility/pokedex/api';
import { apiName } from 'utility/pokedex/lookup';
import { flavorName } from 'utility/pokedex/lookups/berry';
import { getPokedexData, nameOf } from 'utility/pokedex/names';
import { linkSelect, type PageContext, pageButton } from 'utility/pokedex/pages';
import { messageOf, type ResponsePayload } from 'utility/response';
import { ThemeColors } from 'utility/theme';

const STATS = ['attack', 'defense', 'special-attack', 'special-defense', 'speed'] as const;
const isStat = (slug: string): slug is (typeof STATS)[number] => (STATS as readonly string[]).includes(slug);
const statName = (slug: string, t: Translate) => (isStat(slug) ? t(`pokedex.stats.${slug}`) : slug);

/** How much a nature raises and lowers its stats. */
const NATURE_CHANGE = 0.1;

type ChangingNature = ApiNature & { increased_stat: { name: string }; decreased_stat: { name: string } };

/** Whether a nature changes the stats. The ones that don't have none, or raise and lower the same one. */
const changesStats = (nature: ApiNature): nature is ChangingNature =>
  Boolean(nature.increased_stat && nature.decreased_stat && nature.increased_stat.name !== nature.decreased_stat.name);

/** A stat going up or down with its icon, like `➕ **Attack** +10%`. */
const statChange = (stat: string, up: boolean, t: Translate) =>
  // With a real minus, as numbers come with a hyphen
  `${statChangeIcon(up)} ${bold(statName(stat, t))} ${formatNumber(up ? NATURE_CHANGE : -NATURE_CHANGE, t, { style: 'percent', signDisplay: 'always' }).replace('-', '−')}`;

/**
 * A nature: the stat it raises and the one it lowers, each on its own line, then the flavors the Pokémon likes and dislikes. Null
 * when PokéAPI doesn't know it.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 */
export async function buildNature(slug: string, language: string, t: Translate, context: PageContext): Promise<ResponsePayload | null> {
  const nature = await getNature(slug);
  if (!nature) return null;

  const name = apiName(nature.names, language) ?? nameOf('natures', slug, language);
  const stats = changesStats(nature)
    ? [statChange(nature.increased_stat.name, true, t), statChange(nature.decreased_stat.name, false, t)]
    : [t('natures.neutral')];
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('natures.title', { name })))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(stats.join('\n')));
  if (nature.likes_flavor && nature.hates_flavor) {
    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            `${bold(t('natures.likes'))} ${flavorName(nature.likes_flavor.name, t)}`,
            `${bold(t('natures.dislikes'))} ${flavorName(nature.hates_flavor.name, t)}`,
          ].join('\n'),
        ),
      );
  }
  // To the others, unless that's where it was opened from and its Back button goes there already
  if (context.back?.kind !== 'natures') {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        pageButton({ kind: 'natures', slug: 'all' }, context.page).setEmoji(buttonIcon('leaf')).setLabel(t('pages.allNatures')),
      ),
    );
  }
  return messageOf(container);
}

/**
 * Every nature, a line each with the stat it raises and the one it lowers, by the stat it raises. The ones that do nothing come last.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 */
export async function buildNatureList(language: string, t: Translate, context: PageContext): Promise<ResponsePayload> {
  const natures = (await Promise.all(Object.keys(getPokedexData().natures).map((slug) => getNature(slug)))).filter((nature) => nature !== null);
  const order = (nature: ApiNature) => (changesStats(nature) && isStat(nature.increased_stat.name) ? STATS.indexOf(nature.increased_stat.name) : STATS.length);
  const sorted = natures.sort((a, b) => order(a) - order(b) || a.id - b.id);
  const natureName = (nature: ApiNature) => apiName(nature.names, language) ?? nameOf('natures', nature.name, language);
  const lines = sorted.map((nature) => {
    const name = bold(natureName(nature));
    if (!changesStats(nature)) return `${name} · ${t('natures.neutralShort')}`;
    const up = `${statChangeIcon(true)} ${statName(nature.increased_stat.name, t)}`;
    const down = `${statChangeIcon(false)} ${statName(nature.decreased_stat.name, t)}`;
    return `${name} · ${up} ${down}`;
  });
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${t('natures.listTitle')}\n${subtext(t('natures.listNote'))}`))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
  // Without icons in the select, which only takes one emoji for each
  const effect = (nature: ApiNature) =>
    changesStats(nature) ? `+${statName(nature.increased_stat.name, t)} −${statName(nature.decreased_stat.name, t)}` : t('natures.neutralShort');
  const links = linkSelect(
    context.page,
    sorted.map((nature) => ({ page: { kind: 'nature' as const, slug: nature.name }, label: natureName(nature), description: effect(nature) })),
    t('pages.links.natures'),
  );
  if (links) container.addActionRowComponents(links);
  return messageOf(container);
}
