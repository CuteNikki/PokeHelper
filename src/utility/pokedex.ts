import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';

import { getTranslate, resolveLanguage, type Translate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { getEvolutionChain, getPokemon, getSpecies, PokeApiError, speciesIdFromUrl, type ApiEvolutionLink, type ApiSpecies } from 'utility/pokeapi';
import {
  findBySlug,
  formatDexNumber,
  getPokedexData,
  loadPokedexData,
  matchName,
  matchSlug,
  nameIn,
  speciesById,
  type PokedexMatch,
} from 'utility/pokedexData';
import { sendError, type ResponsePayload } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/**
 * Custom IDs of the entry's buttons are `pokedex:<prev|next|shiny>:<slug>:<s|n>`, with the Pokémon they lead to and whether it's shiny,
 * so they work however old the message is. The forms select is `pokedex:form:<s|n>`, with the form as its value.
 */
export const POKEDEX_CUSTOM_ID_PREFIX = 'pokedex:';
export const POKEDEX_FORM_SELECT_ID = `${POKEDEX_CUSTOM_ID_PREFIX}form:`;

/** Discord shows at most 25 options in a select. */
const MAX_FORMS = 25;
/** The highest a base stat can be, which a full bar stands for. */
const MAX_STAT = 255;
const STAT_BAR_LENGTH = 12;

const TYPE_STYLE: Record<string, { emoji: string; color: number }> = {
  normal: { emoji: '⚪', color: 0xa8a77a },
  fire: { emoji: '🔥', color: 0xee8130 },
  water: { emoji: '💧', color: 0x6390f0 },
  electric: { emoji: '⚡', color: 0xf7d02c },
  grass: { emoji: '🌿', color: 0x7ac74c },
  ice: { emoji: '❄️', color: 0x96d9d6 },
  fighting: { emoji: '🥊', color: 0xc22e28 },
  poison: { emoji: '☠️', color: 0xa33ea1 },
  ground: { emoji: '⛰️', color: 0xe2bf65 },
  flying: { emoji: '🪶', color: 0xa98ff3 },
  psychic: { emoji: '🔮', color: 0xf95587 },
  bug: { emoji: '🐛', color: 0xa6b91a },
  rock: { emoji: '🪨', color: 0xb6a136 },
  ghost: { emoji: '👻', color: 0x735797 },
  dragon: { emoji: '🐉', color: 0x6f35fc },
  dark: { emoji: '🌑', color: 0x705746 },
  steel: { emoji: '⚙️', color: 0xb7b7ce },
  fairy: { emoji: '🧚', color: 0xd685ad },
};

const STATS = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'] as const;

export type PokedexAction = 'prev' | 'next' | 'shiny';

export const pokedexCustomId = (action: PokedexAction, slug: string, shiny: boolean) => `${POKEDEX_CUSTOM_ID_PREFIX}${action}:${slug}:${shiny ? 's' : 'n'}`;

/** The Pokémon and shininess a button leads to, or null if it isn't one. */
export function parsePokedexCustomId(customId: string): { slug: string; shiny: boolean } | null {
  const [prefix, action, slug, shiny, ...rest] = customId.split(':');
  if (`${prefix}:` !== POKEDEX_CUSTOM_ID_PREFIX || !['prev', 'next', 'shiny'].includes(action ?? '') || !slug || rest.length > 0) return null;
  if (shiny !== 's' && shiny !== 'n') return null;
  return { slug, shiny: shiny === 's' };
}

/** Whether the forms select it's from shows shiny pictures, or null if it isn't one. */
export function parsePokedexFormSelectId(customId: string): { shiny: boolean } | null {
  if (!customId.startsWith(POKEDEX_FORM_SELECT_ID)) return null;
  const shiny = customId.slice(POKEDEX_FORM_SELECT_ID.length);
  return shiny === 's' || shiny === 'n' ? { shiny: shiny === 's' } : null;
}

/** The newest Pokédex entry in the language, or English. Text from the old games has hard line breaks and hyphens, which are joined. */
function flavorText(species: ApiSpecies, language: string): string | null {
  const latest = (lang: string) => species.flavor_text_entries.findLast((entry) => entry.language.name === lang)?.flavor_text;
  const text = latest(language) ?? latest('en');
  return text ? text.replace(/\u00ad\s+/g, '').replace(/\s+/g, ' ').trim() : null;
}

/** A species' kind in the language, or English, like "Mouse Pokémon". */
function genus(species: ApiSpecies, language: string): string | null {
  const find = (lang: string) => species.genera.find((entry) => entry.language.name === lang)?.genus;
  return find(language) ?? find('en') ?? null;
}

/** The evolution chain, a stage per line position: `Pichu → **Pikachu** → Raichu`. Branches share their stage: `Eevee → Vaporeon / Jolteon / ...`. */
function formatEvolution(chain: ApiEvolutionLink, currentId: number, language: string): string | null {
  const stages: ApiEvolutionLink[][] = [];
  let stage = [chain];
  while (stage.length > 0) {
    stages.push(stage);
    stage = stage.flatMap((link) => link.evolves_to);
  }
  if (stages.length < 2) return null;

  const name = (link: ApiEvolutionLink) => {
    const id = speciesIdFromUrl(link.species.url);
    const species = id ? speciesById(id) : null;
    const text = species ? nameIn(species.names, language) : link.species.name;
    return id === currentId ? `**${text}**` : text;
  };
  return stages.map((links) => links.map(name).join(' / ')).join(' → ');
}

/** A base stat as a bar, out of the highest any Pokémon can have. */
const statBar = (value: number) => {
  const filled = Math.max(1, Math.round((value / MAX_STAT) * STAT_BAR_LENGTH));
  return '█'.repeat(filled) + '░'.repeat(STAT_BAR_LENGTH - filled);
};

/** The buttons to the previous and next Pokémon and to the shiny picture, and the forms select if there are forms. */
function buildControls(match: PokedexMatch, shiny: boolean, hasShiny: boolean, language: string, t: Translate): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  const { species } = match;
  const previous = speciesById(species.id - 1);
  const next = speciesById(species.id + 1);
  const slug = matchSlug(match);

  const buttons = new ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(pokedexCustomId('prev', previous?.slug ?? slug, shiny))
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(t('pagination.previous.icon'))
      .setLabel(previous ? formatDexNumber(previous.id) : formatDexNumber(species.id))
      .setDisabled(!previous),
    new ButtonBuilder()
      .setCustomId(pokedexCustomId('shiny', slug, !shiny))
      .setStyle(shiny ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji('✨')
      .setLabel(t(shiny ? 'pokedex.shiny.hide' : 'pokedex.shiny.show'))
      .setDisabled(!hasShiny),
    new ButtonBuilder()
      .setCustomId(pokedexCustomId('next', next?.slug ?? slug, shiny))
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(t('pagination.next.icon'))
      .setLabel(next ? formatDexNumber(next.id) : formatDexNumber(species.id))
      .setDisabled(!next),
  );
  if (species.forms.length === 0) return [buttons];

  const options = [{ slug: species.slug, name: nameIn(species.names, language) }, ...species.forms.map((form) => ({ slug: form.slug, name: nameIn(form.names, language) }))];
  const forms = new ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${POKEDEX_FORM_SELECT_ID}${shiny ? 's' : 'n'}`)
      .setPlaceholder(t('pokedex.forms'))
      .addOptions(
        options.slice(0, MAX_FORMS).map((option) => ({ label: option.name.slice(0, 100), value: option.slug, default: option.slug === slug })),
      ),
  );
  return [buttons, forms];
}

/**
 * Build a Pokédex entry: picture, kind, types and entry text, height, weight and abilities, base stats, evolutions, and the controls.
 * @param match The species or form to show.
 * @param shiny Whether to show the shiny picture.
 * @param language The language of the names and entry text, like `de`.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 * @returns The entry, or null when PokéAPI doesn't know the Pokémon.
 */
export async function buildPokedexEntry(match: PokedexMatch, shiny: boolean, language: string, t: Translate): Promise<ResponsePayload | null> {
  const [pokemon, species] = await Promise.all([getPokemon(matchSlug(match)), getSpecies(match.species.id)]);
  if (!pokemon || !species) return null;
  const chain = species.evolution_chain ? await getEvolutionChain(species.evolution_chain.url) : null;

  const data = getPokedexData();
  const format = (value: number) => value.toLocaleString(t('locale'), { maximumFractionDigits: 1 });
  const name = matchName(match, language);

  const types = [...pokemon.types].sort((a, b) => a.slot - b.slot).map((entry) => entry.type.name);
  const typeText = types.map((type) => `${TYPE_STYLE[type]?.emoji ?? ''} ${nameIn(data.types[type], language) || type}`.trim()).join('  ');

  const kind = genus(species, language);
  const rarity = species.is_mythical ? t('pokedex.mythical') : species.is_legendary ? t('pokedex.legendary') : null;
  const entry = flavorText(species, language);
  const header = [
    t('pokedex.title', { name, number: formatDexNumber(match.species.id) }),
    [kind, rarity].filter(Boolean).length > 0 ? `-# ${[kind, rarity].filter(Boolean).join(' · ')}` : null,
    typeText,
    entry ? `> ${entry}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const abilities = [...pokemon.abilities]
    .sort((a, b) => a.slot - b.slot)
    .map((entry) => {
      const abilityName = nameIn(data.abilities[entry.ability.name], language) || entry.ability.name;
      return entry.is_hidden ? t('pokedex.hiddenAbility', { name: abilityName }) : abilityName;
    });
  const details = [
    t('pokedex.size', { height: format(pokemon.height / 10), weight: format(pokemon.weight / 10) }),
    t('pokedex.abilities', { abilities: abilities.join(', ') }),
  ].join('\n');

  const stats = STATS.map((stat) => ({ label: t(`pokedex.stats.${stat}`), value: pokemon.stats.find((entry) => entry.stat.name === stat)?.base_stat ?? 0 }));
  const labelWidth = Math.max(...stats.map((stat) => stat.label.length), t('pokedex.stats.total').length);
  const statLines = stats.map((stat) => `${stat.label.padEnd(labelWidth)} ${String(stat.value).padStart(3)} ${statBar(stat.value)}`);
  statLines.push(`${t('pokedex.stats.total').padEnd(labelWidth)} ${String(stats.reduce((sum, stat) => sum + stat.value, 0)).padStart(3)}`);
  const statsText = `${t('pokedex.stats.title')}\n\`\`\`\n${statLines.join('\n')}\n\`\`\``;

  const evolution = chain ? formatEvolution(chain.chain, match.species.id, language) : null;
  const evolutionText = `${t('pokedex.evolution.title')}\n${evolution ?? t('pokedex.evolution.none')}`;

  const artwork = pokemon.sprites.other?.['official-artwork'];
  const normalPicture = artwork?.front_default ?? pokemon.sprites.front_default;
  const shinyPicture = artwork?.front_shiny ?? pokemon.sprites.front_shiny;
  const picture = shiny ? (shinyPicture ?? normalPicture) : normalPicture;

  // The accent is the color of its first type, like the games' Pokédex
  const container = new ContainerBuilder().setAccentColor(TYPE_STYLE[types[0] ?? '']?.color ?? ThemeColors.info);
  const headerText = new TextDisplayBuilder().setContent(header);
  if (picture) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(headerText)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(picture).setDescription(t(shiny ? 'pokedex.pictureShiny' : 'pokedex.picture', { name }))),
    );
  } else {
    container.addTextDisplayComponents(headerText);
  }

  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(details))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(statsText))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(evolutionText))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addActionRowComponents(...buildControls(match, shiny && Boolean(shinyPicture), Boolean(shinyPicture), language, t));

  return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}


/**
 * Show another entry on the message a button or select is on, for its buttons and select.
 * Errors are sent to only whoever pressed, so the entry stays as it was.
 */
export async function updatePokedexEntry(interaction: ButtonInteraction | StringSelectMenuInteraction, slug: string, shiny: boolean): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  await interaction.deferUpdate();
  try {
    await loadPokedexData();
    const match = findBySlug(slug);
    if (!match) return sendError(interaction, t('system.outdated'));
    const entry = await buildPokedexEntry(match, shiny, resolveLanguage(interaction.locale), t);
    if (!entry) return sendError(interaction, t('system.outdated'));
    return await interaction.editReply(entry);
  } catch (error) {
    if (!(error instanceof PokeApiError)) throw error;
    logger.warn(error, error.message);
    return sendError(interaction, t('pokedex.unavailable'));
  }
}
