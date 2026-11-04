import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  ContainerBuilder,
  MediaGalleryBuilder,
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
import { renderPokedexCard, STAT_BAR_MAX } from 'utility/pokedexCard';
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

/** How an entry is shown. Its buttons and select keep it, so paging through stays the same. */
export interface PokedexView {
  shiny: boolean;
  /** Shown as text instead of a card, like for screen readers. */
  text: boolean;
}

/**
 * Custom IDs of the entry's buttons are `pokedex:<prev|next|shiny|evo>:<slug>:<s|n>:<i|t>`, with the Pokémon they lead to and the view,
 * so they work however old the message is. The forms select is `pokedex:form:<s|n>:<i|t>`, with the form as its value.
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

/** The square emoji closest to each type's color, for the stat bars in the text. */
const TYPE_SQUARES: Record<string, string> = {
  normal: '⬜',
  fire: '🟧',
  water: '🟦',
  electric: '🟨',
  grass: '🟩',
  ice: '🟦',
  fighting: '🟥',
  poison: '🟪',
  ground: '🟫',
  flying: '🟦',
  psychic: '🟪',
  bug: '🟩',
  rock: '🟫',
  ghost: '🟪',
  dragon: '🟪',
  dark: '🟫',
  steel: '⬜',
  fairy: '🟪',
};
/** Squares in a stat bar, which are all filled at the same value as the card's bars. */
const STAT_SQUARES = 10;

/** A base stat as a bar of squares, like 🟩🟩🟩⬛⬛⬛⬛⬛⬛⬛. */
const statBar = (value: number, square: string) => {
  const filled = Math.max(1, Math.min(STAT_SQUARES, Math.round((value / STAT_BAR_MAX) * STAT_SQUARES)));
  return square.repeat(filled) + '⬛'.repeat(STAT_SQUARES - filled);
};

const STATS = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'] as const;

const BUTTONS_PER_ROW = 5;
/** Two rows of evolutions, more than any Pokémon has: Eevee has nine with itself. */
const MAX_EVOLUTION_BUTTONS = 10;

export type PokedexAction = 'prev' | 'next' | 'shiny' | 'evo';
const ACTIONS: PokedexAction[] = ['prev', 'next', 'shiny', 'evo'];

const encodeView = (view: PokedexView) => `${view.shiny ? 's' : 'n'}:${view.text ? 't' : 'i'}`;

/** The view in a custom ID. Buttons from before the text mode have no mode and showed the card. */
function decodeView(shiny: string | undefined, mode: string | undefined): PokedexView | null {
  if ((shiny !== 's' && shiny !== 'n') || (mode !== undefined && mode !== 'i' && mode !== 't')) return null;
  return { shiny: shiny === 's', text: mode === 't' };
}

export const pokedexCustomId = (action: PokedexAction, slug: string, view: PokedexView) => `${POKEDEX_CUSTOM_ID_PREFIX}${action}:${slug}:${encodeView(view)}`;

/** The Pokémon and view a button leads to, or null if it isn't one. */
export function parsePokedexCustomId(customId: string): { slug: string; view: PokedexView } | null {
  const [prefix, action, slug, shiny, mode, ...rest] = customId.split(':');
  if (`${prefix}:` !== POKEDEX_CUSTOM_ID_PREFIX || !ACTIONS.includes(action as PokedexAction) || !slug || rest.length > 0) return null;
  const view = decodeView(shiny, mode);
  return view ? { slug, view } : null;
}

/** The view of the entry the forms select is on, or null if it isn't one. */
export function parsePokedexFormSelectId(customId: string): PokedexView | null {
  if (!customId.startsWith(POKEDEX_FORM_SELECT_ID)) return null;
  const [shiny, mode, ...rest] = customId.slice(POKEDEX_FORM_SELECT_ID.length).split(':');
  return rest.length > 0 ? null : decodeView(shiny, mode);
}

/** The newest Pokédex entry in the language, or English. Text from the old games has hard line breaks and hyphens, which are joined. */
function flavorText(species: ApiSpecies, language: string): string | null {
  const latest = (lang: string) => species.flavor_text_entries.findLast((entry) => entry.language.name === lang)?.flavor_text;
  const text = latest(language) ?? latest('en');
  return text
    ? text
        .replace(/\u00ad\s+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    : null;
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

/** The buttons to the previous and next Pokémon and to the shiny pictures, and the forms select if there are forms. */
function buildControls(match: PokedexMatch, view: PokedexView, hasShiny: boolean, language: string, t: Translate) {
  const { species } = match;
  const previous = speciesById(species.id - 1);
  const next = speciesById(species.id + 1);
  const slug = matchSlug(match);

  const navigation = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(pokedexCustomId('prev', previous?.slug ?? slug, view))
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(t('pagination.previous.icon'))
      .setLabel(formatDexNumber(previous?.id ?? species.id))
      .setDisabled(!previous),
    new ButtonBuilder()
      .setCustomId(pokedexCustomId('shiny', slug, { ...view, shiny: !view.shiny }))
      .setStyle(view.shiny ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji('✨')
      .setLabel(t(view.shiny ? 'pokedex.shiny.hide' : 'pokedex.shiny.show'))
      .setDisabled(!hasShiny),
    new ButtonBuilder()
      .setCustomId(pokedexCustomId('next', next?.slug ?? slug, view))
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(t('pagination.next.icon'))
      .setLabel(formatDexNumber(next?.id ?? species.id))
      .setDisabled(!next),
  );
  if (species.forms.length === 0) return { navigation, forms: [] };

  const options = [
    { slug: species.slug, name: nameIn(species.names, language) },
    ...species.forms.map((form) => ({ slug: form.slug, name: nameIn(form.names, language) })),
  ];
  const forms = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${POKEDEX_FORM_SELECT_ID}${encodeView(view)}`)
      .setPlaceholder(t('pokedex.forms'))
      .addOptions(options.slice(0, MAX_FORMS).map((option) => ({ label: option.name.slice(0, 100), value: option.slug, default: option.slug === slug }))),
  );
  return { navigation, forms: [forms] };
}

/** A button for each Pokémon in the evolution chain, five to a row, with the one shown highlighted. */
function buildEvolutionButtons(
  chain: { id: number; slug: string }[],
  match: PokedexMatch,
  view: PokedexView,
  name: (entry: { id: number; slug: string }) => string,
): ActionRowBuilder<ButtonBuilder>[] {
  const buttons = chain.slice(0, MAX_EVOLUTION_BUTTONS).map((entry) => {
    const current = entry.id === match.species.id && !match.form;
    return new ButtonBuilder()
      .setCustomId(pokedexCustomId('evo', entry.slug, view))
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
 * Build a Pokédex entry: a card with everything on it, or the same as text, then the buttons to the previous and next Pokémon
 * and to its evolutions, and its forms.
 * @param match The species or form to show.
 * @param view Whether to show the shiny pictures, and whether to show text instead of the card.
 * @param language The language of the names and texts, like `de`.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 * @returns The entry, or null when PokéAPI doesn't know the Pokémon.
 */
export async function buildPokedexEntry(match: PokedexMatch, view: PokedexView, language: string, t: Translate): Promise<ResponsePayload | null> {
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
  const shownView = { ...view, shiny: view.shiny && Boolean(shinyPicture) };
  const picture = shownView.shiny ? shinyPicture : normalPicture;
  const shownName = shownView.shiny ? t('pokedex.shinyName', { name }) : name;

  const types = [...pokemon.types]
    .sort((a, b) => a.slot - b.slot)
    .map((entry) => ({ name: nameIn(data.types[entry.type.name], language) || entry.type.name, color: TYPE_COLORS[entry.type.name] ?? ThemeColors.info }));
  const stats = STATS.map((stat) => ({ label: t(`pokedex.stats.${stat}`), value: pokemon.stats.find((entry) => entry.stat.name === stat)?.base_stat ?? 0 }));
  const total = stats.reduce((sum, stat) => sum + stat.value, 0);

  const stages = chain ? evolutionStages(chain.chain) : [];
  const evolves = stages.length > 1;
  const speciesName = (entry: { id: number; slug: string }) => nameIn(speciesById(entry.id)?.names, language) || entry.slug;

  const kind = [genus(species, language), species.is_mythical ? t('pokedex.mythical') : species.is_legendary ? t('pokedex.legendary') : null]
    .filter(Boolean)
    .join(' · ');
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
  const statsText = [...stats.map((stat) => `${stat.label} ${stat.value}`), `${t('pokedex.stats.total')} ${total}`];
  const evolutionText = evolves ? stages.map((stage) => stage.map(speciesName).join(' / ')).join(' → ') : t('pokedex.evolution.none');

  // The accent is the color of its first type, like the games' Pokédex
  const container = new ContainerBuilder().setAccentColor(types[0]?.color ?? ThemeColors.info);
  const files: AttachmentBuilder[] = [];

  if (view.text) {
    const header = new TextDisplayBuilder().setContent(
      [`## ${shownName} ${number}`, kind ? `-# ${kind}` : null, entry ? `> ${entry}` : null].filter(Boolean).join('\n'),
    );
    if (picture) {
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(header)
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(picture).setDescription(t('pokedex.picture', { name: shownName }))),
      );
    } else {
      container.addTextDisplayComponents(header);
    }

    const square = TYPE_SQUARES[pokemon.types.find((entry) => entry.slot === 1)?.type.name ?? ''] ?? '⬜';
    const about = [
      `**${t('pokedex.details.type')}** ${types.map((type) => type.name).join(', ')}`,
      // Height and weight share a line, the abilities get their own
      details
        .slice(0, 2)
        .map((detail) => `**${detail.label}** ${detail.value}`)
        .join(' · '),
      ...details.slice(2).map((detail) => `**${detail.label}** ${detail.value}`),
    ];
    const statLines = [
      `### ${t('pokedex.stats.title')}`,
      ...stats.map((stat) => `${statBar(stat.value, square)} **${stat.value}** ${stat.label}`),
      `-# ${t('pokedex.stats.total')} ${total}`,
    ];
    // A line per stage, with branches side by side, and the one shown in bold
    const evolutionLines = evolves
      ? stages
          .map((stage) => stage.map((member) => (member.id === match.species.id ? `**${speciesName(member)}**` : speciesName(member))).join(' · '))
          .join('\n')
      : t('pokedex.evolution.noneText');
    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(about.join('\n')))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(statLines.join('\n')))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${t('pokedex.evolution.title')}\n${evolutionLines}`));
  } else {
    // All pictures are loaded at the same time, from the cache when they were shown before
    const [artwork, evolution] = await Promise.all([
      picture ? getImage(picture) : null,
      Promise.all(
        (evolves ? stages : []).map((stage) =>
          Promise.all(
            stage.map(async (member) => ({
              name: speciesName(member),
              image: await getImage(artworkUrl(member.id, shownView.shiny)),
              current: member.id === match.species.id,
            })),
          ),
        ),
      ),
    ]);

    const toHex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
    const card = renderPokedexCard({
      name: shownName,
      number,
      genus: kind || null,
      artwork,
      types: types.map((type) => ({ name: type.name, color: toHex(type.color) })),
      stats,
      totalLabel: t('pokedex.stats.total'),
      entry,
      details,
      evolution,
      evolutionLabel: t('pokedex.evolution.title'),
    });
    files.push(new AttachmentBuilder(card, { name: 'pokedex.png' }));

    // The card is only pixels, so its description has everything on it for screen readers
    const description = t('pokedex.altText', {
      name: `${shownName} ${number}`,
      genus: kind,
      types: types.map((type) => type.name).join(', '),
      stats: statsText.join(', '),
      details: details.map((detail) => `${detail.label} ${detail.value}`).join(', '),
      evolution: evolutionText,
      entry: entry ?? '',
    });
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems((item) => item.setURL('attachment://pokedex.png').setDescription(description.slice(0, 1024))),
    );
  }

  const { navigation, forms } = buildControls(match, shownView, Boolean(shinyPicture), language, t);
  const evolutionButtons = evolves ? buildEvolutionButtons(stages.flat(), match, shownView, speciesName) : [];
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)).addActionRowComponents(navigation, ...evolutionButtons);
  if (forms.length > 0) container.addActionRowComponents(...forms);

  return { components: [container], files, flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}

/**
 * Show another entry on the message a button or select is on, for its buttons and select.
 * Errors are sent to only whoever pressed, so the entry stays as it was.
 */
export async function updatePokedexEntry(interaction: ButtonInteraction | StringSelectMenuInteraction, slug: string, view: PokedexView): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  await interaction.deferUpdate();
  try {
    await loadPokedexData();
    const match = findBySlug(slug);
    if (!match) return sendError(interaction, t('system.outdated'));
    const entry = await buildPokedexEntry(match, view, resolveLanguage(interaction.locale), t);
    if (!entry) return sendError(interaction, t('system.outdated'));
    return await interaction.editReply(entry);
  } catch (error) {
    if (!(error instanceof PokeApiError)) throw error;
    logger.warn(error, error.message);
    return sendError(interaction, t('pokedex.unavailable'));
  }
}
