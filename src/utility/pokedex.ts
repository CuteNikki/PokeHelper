import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  MediaGalleryBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
} from 'discord.js';

import { getTranslate, resolveLanguage, type Translate } from 'utility/i18next';
import { logger } from 'utility/logger';
import {
  artworkUrl,
  getEvolutionChain,
  getImage,
  getPokemon,
  getSpecies,
  PokeApiError,
  speciesIdFromUrl,
  type ApiEvolutionLink,
  type ApiSpecies,
} from 'utility/pokeapi';
import { renderPokedexCard } from 'utility/pokedexCard';
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
 * Custom IDs of the entry's buttons are `pokedex:<prev|next|shiny|evo>:<slug>:<s|n>`, with the Pokémon they lead to and whether it's shiny,
 * so they work however old the message is. The forms select is `pokedex:form:<s|n>`, with the form as its value.
 */
export const POKEDEX_CUSTOM_ID_PREFIX = 'pokedex:';
export const POKEDEX_FORM_SELECT_ID = `${POKEDEX_CUSTOM_ID_PREFIX}form:`;

/** Discord shows at most 25 options in a select. */
const MAX_FORMS = 25;
/** The colors the games use for each type. */
const TYPE_COLORS: Record<string, number> = {
  normal: 0xa8a77a,
  fire: 0xee8130,
  water: 0x6390f0,
  electric: 0xf7d02c,
  grass: 0x7ac74c,
  ice: 0x96d9d6,
  fighting: 0xc22e28,
  poison: 0xa33ea1,
  ground: 0xe2bf65,
  flying: 0xa98ff3,
  psychic: 0xf95587,
  bug: 0xa6b91a,
  rock: 0xb6a136,
  ghost: 0x735797,
  dragon: 0x6f35fc,
  dark: 0x705746,
  steel: 0xb7b7ce,
  fairy: 0xd685ad,
};

const STATS = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'] as const;

const BUTTONS_PER_ROW = 5;
/** Two rows of evolutions, more than any Pokémon has: Eevee has nine with itself. */
const MAX_EVOLUTION_BUTTONS = 10;

export type PokedexAction = 'prev' | 'next' | 'shiny' | 'evo';
const ACTIONS: PokedexAction[] = ['prev', 'next', 'shiny', 'evo'];

export const pokedexCustomId = (action: PokedexAction, slug: string, shiny: boolean) => `${POKEDEX_CUSTOM_ID_PREFIX}${action}:${slug}:${shiny ? 's' : 'n'}`;

/** The Pokémon and shininess a button leads to, or null if it isn't one. */
export function parsePokedexCustomId(customId: string): { slug: string; shiny: boolean } | null {
  const [prefix, action, slug, shiny, ...rest] = customId.split(':');
  if (`${prefix}:` !== POKEDEX_CUSTOM_ID_PREFIX || !ACTIONS.includes(action as PokedexAction) || !slug || rest.length > 0) return null;
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

/** The species of an evolution chain by stage, branches side by side: Eevee, then all eight of its evolutions. */
function evolutionStages(chain: ApiEvolutionLink): { id: number; slug: string }[][] {
  const stages: { id: number; slug: string }[][] = [];
  let stage = [chain];
  while (stage.length > 0) {
    stages.push(stage.map((link) => ({ id: speciesIdFromUrl(link.species.url) ?? 0, slug: link.species.name })));
    stage = stage.flatMap((link) => link.evolves_to);
  }
  return stages;
}

/** The buttons to the previous and next Pokémon and to the shiny picture, and the forms select if there are forms. */
function buildControls(match: PokedexMatch, shiny: boolean, hasShiny: boolean, language: string, t: Translate) {
  const { species } = match;
  const previous = speciesById(species.id - 1);
  const next = speciesById(species.id + 1);
  const slug = matchSlug(match);

  const navigation = new ActionRowBuilder<ButtonBuilder>().addComponents(
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
  if (species.forms.length === 0) return { navigation, forms: [] };

  const options = [{ slug: species.slug, name: nameIn(species.names, language) }, ...species.forms.map((form) => ({ slug: form.slug, name: nameIn(form.names, language) }))];
  const forms = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${POKEDEX_FORM_SELECT_ID}${shiny ? 's' : 'n'}`)
      .setPlaceholder(t('pokedex.forms'))
      .addOptions(
        options.slice(0, MAX_FORMS).map((option) => ({ label: option.name.slice(0, 100), value: option.slug, default: option.slug === slug })),
      ),
  );
  return { navigation, forms: [forms] };
}

/** A button for each Pokémon in the evolution chain, five to a row, with the one shown highlighted. */
function buildEvolutionButtons(
  chain: { id: number; slug: string }[],
  match: PokedexMatch,
  shiny: boolean,
  name: (entry: { id: number; slug: string }) => string,
): ActionRowBuilder<ButtonBuilder>[] {
  const buttons = chain.slice(0, MAX_EVOLUTION_BUTTONS).map((entry) => {
    const current = entry.id === match.species.id && !match.form;
    return new ButtonBuilder()
      .setCustomId(pokedexCustomId('evo', entry.slug, shiny))
      .setStyle(current ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setLabel(name(entry).slice(0, 80))
      .setDisabled(current);
  });
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let index = 0; index < buttons.length; index += BUTTONS_PER_ROW) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(index, index + BUTTONS_PER_ROW)));
  }
  return rows;
}

/**
 * Build a Pokédex entry: a card with everything on it, the buttons to the previous and next Pokémon and to its evolutions, and its forms.
 * @param match The species or form to show.
 * @param shiny Whether to show the shiny pictures.
 * @param language The language of the names and texts, like `de`.
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
  const number = formatDexNumber(match.species.id);

  const artworks = pokemon.sprites.other?.['official-artwork'];
  const normalPicture = artworks?.front_default ?? pokemon.sprites.front_default;
  const shinyPicture = artworks?.front_shiny ?? pokemon.sprites.front_shiny;
  // Not every form has a shiny picture
  const showShiny = shiny && Boolean(shinyPicture);
  const picture = showShiny ? shinyPicture : normalPicture;

  const types = [...pokemon.types]
    .sort((a, b) => a.slot - b.slot)
    .map((entry) => ({ name: nameIn(data.types[entry.type.name], language) || entry.type.name, color: TYPE_COLORS[entry.type.name] ?? ThemeColors.info }));
  const stats = STATS.map((stat) => ({ label: t(`pokedex.stats.${stat}`), value: pokemon.stats.find((entry) => entry.stat.name === stat)?.base_stat ?? 0 }));
  const total = stats.reduce((sum, stat) => sum + stat.value, 0);

  const stages = chain ? evolutionStages(chain.chain) : [];
  const evolves = stages.length > 1;
  const speciesName = (entry: { id: number; slug: string }) => nameIn(speciesById(entry.id)?.names, language) || entry.slug;

  // All pictures are loaded at the same time, from the cache when they were shown before
  const [artwork, evolution] = await Promise.all([
    picture ? getImage(picture) : null,
    Promise.all(
      (evolves ? stages : []).map((stage) =>
        Promise.all(
          stage.map(async (entry) => ({
            name: speciesName(entry),
            image: await getImage(artworkUrl(entry.id, showShiny)),
            current: entry.id === match.species.id,
          })),
        ),
      ),
    ),
  ]);

  const kind = genus(species, language);
  const rarity = species.is_mythical ? t('pokedex.mythical') : species.is_legendary ? t('pokedex.legendary') : null;
  const entry = flavorText(species, language);
  const abilities = [...pokemon.abilities]
    .sort((a, b) => a.slot - b.slot)
    .map((ability) => {
      const abilityName = nameIn(data.abilities[ability.ability.name], language) || ability.ability.name;
      return ability.is_hidden ? t('pokedex.hiddenAbility', { name: abilityName }) : abilityName;
    });
  const details = [
    { label: t('pokedex.details.height'), value: `${format(pokemon.height / 10)} m` },
    { label: t('pokedex.details.weight'), value: `${format(pokemon.weight / 10)} kg` },
    { label: t('pokedex.details.abilities'), value: abilities.join(', ') },
  ];

  const toHex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
  const card = renderPokedexCard({
    name,
    number,
    genus: [kind, rarity].filter(Boolean).join(' · ') || null,
    artwork,
    types: types.map((type) => ({ name: type.name, color: toHex(type.color) })),
    stats,
    totalLabel: t('pokedex.stats.total'),
    entry,
    details,
    evolution,
    evolutionLabel: t('pokedex.evolution.title'),
  });

  // The card is only pixels, so its description has everything on it for screen readers
  const description = t('pokedex.altText', {
    name: `${name} ${number}`,
    genus: kind ?? '',
    types: types.map((type) => type.name).join(', '),
    stats: [...stats.map((stat) => `${stat.label} ${stat.value}`), `${t('pokedex.stats.total')} ${total}`].join(', '),
    details: details.map((detail) => `${detail.label} ${detail.value}`).join(', '),
    evolution: evolves ? stages.map((stage) => stage.map(speciesName).join(' / ')).join(' → ') : t('pokedex.evolution.none'),
    entry: entry ?? '',
  });

  // Shown without a container around it, the card already is one, like the leaderboard
  const image = new MediaGalleryBuilder().addItems((item) => item.setURL('attachment://pokedex.png').setDescription(description.slice(0, 1024)));
  const { navigation, forms } = buildControls(match, showShiny, Boolean(shinyPicture), language, t);
  const evolutionButtons = evolves ? buildEvolutionButtons(stages.flat(), match, showShiny, speciesName) : [];

  return {
    components: [image, navigation, ...evolutionButtons, ...forms],
    files: [new AttachmentBuilder(card, { name: 'pokedex.png' })],
    flags: [MessageFlags.IsComponentsV2],
    allowedMentions: { parse: [] },
  };
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
