import { ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, TextDisplayBuilder, type ButtonInteraction } from 'discord.js';

import { getTranslate, resolveLanguage, type Translate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { getPokemon, getType, PokeApiError, type ApiDamageRelations } from 'utility/pokedex/api';
import { findBySlug, getPokedexData, loadPokedexData, matchName, nameIn } from 'utility/pokedex/names';
import { TYPE_COLORS } from 'utility/pokedex/types';
import { sendError, sendResponse, type ResponsePayload } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/** The Matchups button of a Pokédex entry is `pokedex-matchups:<slug>`, with the Pokémon or form it's for, so it works however old the entry is. */
export const POKEDEX_MATCHUPS_PREFIX = 'pokedex-matchups:';

/** The types attacks can have, in the order the games list them. */
const ATTACKING_TYPES = Object.keys(TYPE_COLORS);

/** The groups of how much damage a Pokémon takes, from most to least, each with how it's written. Neutral damage isn't listed. */
const GROUPS = [
  { multiplier: 4, label: '×4' },
  { multiplier: 2, label: '×2' },
  { multiplier: 0.5, label: '×½' },
  { multiplier: 0.25, label: '×¼' },
  { multiplier: 0, label: '×0' },
] as const;

/** How much damage a Pokémon of these types takes from an attack of each type: the multipliers of its types, multiplied. */
export function damageTaken(types: ApiDamageRelations[]): Record<string, number> {
  const multipliers: Record<string, number> = Object.fromEntries(ATTACKING_TYPES.map((type) => [type, 1]));
  for (const relations of types) {
    for (const { name } of relations.double_damage_from) if (name in multipliers) multipliers[name] = (multipliers[name] ?? 1) * 2;
    for (const { name } of relations.half_damage_from) if (name in multipliers) multipliers[name] = (multipliers[name] ?? 1) / 2;
    for (const { name } of relations.no_damage_from) if (name in multipliers) multipliers[name] = 0;
  }
  return multipliers;
}

/** The attacking types in each group, leaving out empty groups and neutral damage. */
export function matchupGroups(taken: Record<string, number>) {
  return GROUPS.map((group) => ({ ...group, types: ATTACKING_TYPES.filter((type) => taken[type] === group.multiplier) })).filter(
    (group) => group.types.length > 0,
  );
}

/** The Matchups button for a Pokémon or form, which anyone who sees the entry can press. */
export const matchupsButton = (slug: string, t: Translate) =>
  new ButtonBuilder().setCustomId(`${POKEDEX_MATCHUPS_PREFIX}${slug}`).setStyle(ButtonStyle.Secondary).setEmoji('🛡️').setLabel(t('pokedex.matchups.button'));

/**
 * What a Pokémon is weak to, resists and can't be hurt by, from its types.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 * @returns The matchups, or null when PokéAPI doesn't know the Pokémon.
 */
async function buildMatchups(slug: string, language: string, t: Translate): Promise<ResponsePayload | null> {
  const match = findBySlug(slug);
  const pokemon = match && (await getPokemon(slug));
  if (!match || !pokemon) return null;

  const typeNames = [...pokemon.types].sort((a, b) => a.slot - b.slot).map((entry) => entry.type.name);
  const relations = await Promise.all(typeNames.map((name) => getType(name)));
  if (relations.some((type) => !type)) return null;

  const data = getPokedexData();
  const typeName = (type: string) => nameIn(data.types[type], language) || type;
  const groups = matchupGroups(damageTaken(relations.map((type) => type!.damage_relations)));

  const heading = (multiplier: number) => (multiplier > 1 ? 'weak' : multiplier > 0 ? 'resists' : 'immune');
  const lines: string[] = [];
  for (const group of groups) {
    const title = t(`pokedex.matchups.${heading(group.multiplier)}`);
    if (!lines.includes(`**${title}**`)) lines.push(`**${title}**`);
    lines.push(`${group.label} ${group.types.map(typeName).join(', ')}`);
  }

  const container = new ContainerBuilder()
    .setAccentColor(TYPE_COLORS[typeNames[0] ?? ''] ?? ThemeColors.info)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          t('pokedex.matchups.title', { name: matchName(match, language) }),
          `-# ${typeNames.map(typeName).join(' / ')}`,
          ...lines,
          `-# ${t('pokedex.matchups.note')}`,
        ].join('\n'),
      ),
    );
  return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}

/** Show the matchups of the entry's Pokémon to whoever pressed the button, in their language, so the entry stays as it is for everyone. */
export async function showMatchups(interaction: ButtonInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  try {
    await loadPokedexData();
    const matchups = await buildMatchups(interaction.customId.slice(POKEDEX_MATCHUPS_PREFIX.length), resolveLanguage(interaction.locale), t);
    if (!matchups) return sendError(interaction, t('system.outdated'));
    return sendResponse(interaction, matchups);
  } catch (error) {
    if (!(error instanceof PokeApiError)) throw error;
    logger.warn(error, error.message);
    return sendError(interaction, t('pokedex.unavailable'));
  }
}
