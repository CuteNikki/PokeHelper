import {
  ActionRowBuilder,
  AttachmentBuilder,
  bold,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  ContainerBuilder,
  heading,
  HeadingLevel,
  MessageFlags,
  type ModalMessageModalSubmitInteraction,
  type ModalSubmitInteraction,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
  subtext,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';

import { DiscordLimits } from 'utility/discordLimits';
import { formatNumber } from 'utility/duration';
import { FALLBACK_LANGUAGE, getTranslate, resolveLanguage, type Translate } from 'utility/i18next';
import { buildTextModal } from 'utility/modal';
import {
  answerPokeApiError,
  type ApiEvolutionLink,
  type ApiSpecies,
  artworkUrl,
  getEvolutionChain,
  getImage,
  getPokemon,
  getSpecies,
  speciesIdFromUrl,
} from 'utility/pokedex/api';
import { renderPokedexCard, STAT_BAR_MAX } from 'utility/pokedex/card';
import { evolutionCondition } from 'utility/pokedex/evolution';
import { newestText } from 'utility/pokedex/lookup';
import { matchupsButton } from 'utility/pokedex/matchups';
import { linkSelect, pageButton } from 'utility/pokedex/pages';
import { TYPE_COLORS } from 'utility/pokedex/types';
import { buttonIcon, withTypeEmoji } from 'utility/emojis';
import { emojiBar } from 'utility/pokedex/bars';
import { typeSymbol } from 'utility/pokedex/typeIcons';
import {
  findBySlug,
  findPokemon,
  formatDexNumber,
  getPokedexData,
  loadPokedexData,
  matchName,
  matchSlug,
  MAX_NAME_INPUT,
  nameIn,
  nameOf,
  fromSlug,
  type PokedexMatch,
  speciesById,
} from 'utility/pokedex/names';
import { imageWithDescription, type ResponsePayload, sendError } from 'utility/response';
import { quote } from 'utility/text';
import { ThemeColors } from 'utility/theme';

/** How an entry is shown. Its buttons and select keep it, so paging through stays the same. */
export interface PokedexView {
  shiny: boolean;
  /** Shown as text instead of a card, like for screen readers. */
  text: boolean;
}

/**
 * Custom IDs of the entry's buttons are `pokedex:<action>:<slug>:<s|n>:<i|t>`, like `prev` or `shiny`, with the Pokémon they lead to and the view,
 * so they work however old the message is. The forms select is `pokedex:form:<s|n>:<i|t>`, with the form as its value.
 */
export const POKEDEX_CUSTOM_ID_PREFIX = 'pokedex:';
export const POKEDEX_FORM_SELECT_ID = `${POKEDEX_CUSTOM_ID_PREFIX}form:`;

const STATS = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'] as const;

/** Two rows of evolutions, more than any Pokémon has: Eevee has nine with itself. */
const MAX_EVOLUTION_BUTTONS = 10;

export type PokedexAction = 'prev' | 'next' | 'shiny' | 'evo' | 'search' | 'mode';
const ACTIONS: PokedexAction[] = ['prev', 'next', 'shiny', 'evo', 'search', 'mode'];

/** Custom IDs of the popup asking which Pokémon to show are this, followed by the view of the entry it was opened on. */
export const POKEDEX_SEARCH_MODAL_PREFIX = 'pokedex-search:';
const SEARCH_INPUT_ID = 'pokemon';

const encodeView = (view: PokedexView) => `${view.shiny ? 's' : 'n'}:${view.text ? 't' : 'i'}`;

/** The view in a custom ID. Buttons from before the text mode have no mode and showed the card. */
function decodeView(shiny: string | undefined, mode: string | undefined): PokedexView | null {
  if ((shiny !== 's' && shiny !== 'n') || (mode !== undefined && mode !== 'i' && mode !== 't')) return null;
  return { shiny: shiny === 's', text: mode === 't' };
}

export const pokedexCustomId = (action: PokedexAction, slug: string, view: PokedexView) => `${POKEDEX_CUSTOM_ID_PREFIX}${action}:${slug}:${encodeView(view)}`;

/** What a button does, the Pokémon it leads to and the view, or null if it isn't one. */
export function parsePokedexCustomId(customId: string): { action: PokedexAction; slug: string; view: PokedexView } | null {
  const [prefix, action, slug, shiny, mode, ...rest] = customId.split(':');
  if (`${prefix}:` !== POKEDEX_CUSTOM_ID_PREFIX || !ACTIONS.includes(action as PokedexAction) || !slug || rest.length > 0) return null;
  const view = decodeView(shiny, mode);
  return view ? { action: action as PokedexAction, slug, view } : null;
}

/** The view of the entry the forms select is on, or null if it isn't one. */
export function parsePokedexFormSelectId(customId: string): PokedexView | null {
  if (!customId.startsWith(POKEDEX_FORM_SELECT_ID)) return null;
  const [shiny, mode, ...rest] = customId.slice(POKEDEX_FORM_SELECT_ID.length).split(':');
  return rest.length > 0 ? null : decodeView(shiny, mode);
}

/** How many are male and female, like `87.5% male, 12.5% female`, from the chance of being female in eighths, or that it has no gender. */
export function genderRatio(femaleEighths: number, t: Translate): string {
  if (femaleEighths < 0) return t('pokedex.gender.none');
  const percent = (eighths: number) => formatNumber(eighths / 8, t, { style: 'percent', maximumFractionDigits: 1 });
  if (femaleEighths === 0) return t('pokedex.gender.male', { percent: percent(8) });
  if (femaleEighths === 8) return t('pokedex.gender.female', { percent: percent(8) });
  return t('pokedex.gender.both', { male: percent(8 - femaleEighths), female: percent(femaleEighths) });
}

const GROWTH_RATES = ['slow', 'medium', 'fast', 'medium-slow', 'slow-then-very-fast', 'fast-then-very-slow'] as const;

/** How fast it levels up, like `Medium Fast`, as the games call it. */
const growthRate = (slug: string, t: Translate) =>
  (GROWTH_RATES as readonly string[]).includes(slug) ? t(`pokedex.growth.${slug as (typeof GROWTH_RATES)[number]}`) : fromSlug(slug);

/** A species' kind in the language, or English, like "Mouse Pokémon". */
function genus(species: ApiSpecies, language: string): string | null {
  const find = (lang: string) => species.genera.find((entry) => entry.language.name === lang)?.genus;
  return find(language) ?? find(FALLBACK_LANGUAGE) ?? null;
}

/** A species in an evolution chain, with the one it evolves from and how, unless it's the first. */
interface EvolutionMember {
  id: number;
  slug: string;
  from: { id: number; slug: string } | null;
  how: string | null;
}

/** The species of an evolution chain by stage, branches side by side: Eevee, then all eight of its evolutions. */
function evolutionStages(chain: ApiEvolutionLink, language: string, t: Translate): EvolutionMember[][] {
  const stages: EvolutionMember[][] = [];
  const species = (link: ApiEvolutionLink) => ({ id: speciesIdFromUrl(link.species.url) ?? 0, slug: link.species.name });
  let stage: { link: ApiEvolutionLink; from: EvolutionMember['from'] }[] = [{ link: chain, from: null }];
  while (stage.length > 0) {
    stages.push(stage.map(({ link, from }) => ({ ...species(link), from, how: from ? evolutionCondition(link.evolution_details, language, t) : null })));
    stage = stage.flatMap(({ link }) => link.evolves_to.map((next) => ({ link: next, from: species(link) })));
  }
  return stages;
}

/** The buttons to the previous and next Pokémon, to the shiny pictures and to the matchups, and the forms select if there are forms. */
function buildControls(match: PokedexMatch, view: PokedexView, hasShiny: boolean, language: string, t: Translate) {
  const { species } = match;
  const previous = speciesById(species.id - 1);
  const next = speciesById(species.id + 1);
  const slug = matchSlug(match);

  const buttons = [
    new ButtonBuilder()
      .setCustomId(pokedexCustomId('prev', previous?.slug ?? slug, view))
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(buttonIcon('chevron-left'))
      .setLabel(formatDexNumber(previous?.id ?? species.id))
      .setDisabled(!previous),
    new ButtonBuilder()
      .setCustomId(pokedexCustomId('next', next?.slug ?? slug, view))
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(buttonIcon('chevron-right'))
      .setLabel(formatDexNumber(next?.id ?? species.id))
      .setDisabled(!next),
    new ButtonBuilder()
      .setCustomId(pokedexCustomId('search', slug, view))
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(buttonIcon('search'))
      .setLabel(t('pokedex.search.button')),
    new ButtonBuilder()
      .setCustomId(pokedexCustomId('shiny', slug, { ...view, shiny: !view.shiny }))
      .setStyle(view.shiny ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji(buttonIcon('sparkles'))
      .setLabel(t(view.shiny ? 'pokedex.shiny.hide' : 'pokedex.shiny.show'))
      .setDisabled(!hasShiny),
    matchupsButton(slug, view.text, t),
    pageButton({ kind: 'where', slug }, { kind: 'pokemon', slug }).setEmoji(buttonIcon('map-pin')).setLabel(t('pokedex.where.button')),
  ];
  // Switches between the card and text, like for screen readers, keeping the Pokémon and whether it's shiny
  const mode = new ButtonBuilder()
    .setCustomId(pokedexCustomId('mode', slug, { ...view, text: !view.text }))
    .setStyle(ButtonStyle.Secondary)
    .setEmoji(view.text ? buttonIcon('image') : buttonIcon('file-text'))
    .setLabel(t(view.text ? 'pokedex.view.image' : 'pokedex.view.text'));
  // Getting around on one row, and how it's shown on the next, the same for the card and text
  const groups = [buttons.slice(0, 3), [...buttons.slice(3), mode]];
  const navigation = groups.map((group) => new ActionRowBuilder<ButtonBuilder>().addComponents(group));
  if (species.forms.length === 0) return { navigation, forms: [] };

  const options = [
    { slug: species.slug, name: nameIn(species.names, language) },
    ...species.forms.map((form) => ({ slug: form.slug, name: nameIn(form.names, language) })),
  ];
  const forms = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${POKEDEX_FORM_SELECT_ID}${encodeView(view)}`)
      .setPlaceholder(t('pokedex.forms'))
      .addOptions(
        options
          .slice(0, DiscordLimits.selectOptions)
          .map((option) => ({ label: option.name.slice(0, DiscordLimits.optionLabelLength), value: option.slug, default: option.slug === slug })),
      ),
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
  for (let index = 0; index < buttons.length; index += DiscordLimits.buttonsPerRow) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(index, index + DiscordLimits.buttonsPerRow)));
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
  const format = (value: number) => formatNumber(value, t, { maximumFractionDigits: 1 });
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
    .map((entry) => ({
      slug: entry.type.name,
      name: nameIn(data.types[entry.type.name], language) || entry.type.name,
      color: TYPE_COLORS[entry.type.name] ?? ThemeColors.info,
    }));
  const stats = STATS.map((stat) => ({ label: t(`pokedex.stats.${stat}`), value: pokemon.stats.find((entry) => entry.stat.name === stat)?.base_stat ?? 0 }));
  const total = stats.reduce((sum, stat) => sum + stat.value, 0);

  const stages = chain ? evolutionStages(chain.chain, language, t) : [];
  const evolves = stages.length > 1;
  const speciesName = (entry: { id: number; slug: string }) => nameIn(speciesById(entry.id)?.names, language) || entry.slug;

  const kind = [genus(species, language), species.is_mythical ? t('pokedex.mythical') : species.is_legendary ? t('pokedex.legendary') : null]
    .filter(Boolean)
    .join(' · ');
  const entry = newestText(species.flavor_text_entries, 'flavor_text', language);
  const abilities = [...pokemon.abilities]
    .sort((a, b) => a.slot - b.slot)
    .map((ability) => {
      const abilityName = nameIn(data.abilities[ability.ability.name], language) || ability.ability.name;
      return ability.is_hidden ? t('pokedex.hiddenAbility', { name: abilityName }) : abilityName;
    });
  const details = [
    { label: t('pokedex.details.height'), value: `${format(pokemon.height / 10)} m` },
    { label: t('pokedex.details.weight'), value: `${format(pokemon.weight / 10)} kg` },
    // Last, as it's the longest and gets the space that's left
    { label: t('pokedex.details.abilities'), value: abilities.join(', ') },
  ];
  // How it's caught, raised and bred, in a row of its own, with the egg groups last as there can be two
  const breeding = [
    { label: t('pokedex.details.gender'), value: genderRatio(species.gender_rate, t) },
    { label: t('pokedex.details.catchRate'), value: format(species.capture_rate) },
    { label: t('pokedex.details.growth'), value: growthRate(species.growth_rate.name, t) },
    ...(species.hatch_counter === null ? [] : [{ label: t('pokedex.details.eggCycles'), value: format(species.hatch_counter) }]),
    { label: t('pokedex.details.eggGroups'), value: species.egg_groups.map((group) => nameOf('eggGroups', group.name, language)).join(', ') },
  ];
  const statsText = [...stats.map((stat) => `${stat.label} ${stat.value}`), `${t('pokedex.stats.total')} ${total}`];
  const evolutionText = evolves
    ? stages.map((stage) => stage.map((member) => (member.how ? `${speciesName(member)} (${member.how})` : speciesName(member))).join(' / ')).join(' → ')
    : t('pokedex.evolution.none');

  // The accent is the color of its first type, like the games' Pokédex
  const container = new ContainerBuilder().setAccentColor(types[0]?.color ?? ThemeColors.info);
  const files: AttachmentBuilder[] = [];

  if (view.text) {
    const header = new TextDisplayBuilder().setContent(
      [heading(`${shownName} ${number}`, HeadingLevel.Two), kind ? subtext(kind) : null, entry ? quote(entry) : null].filter(Boolean).join('\n'),
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

    const firstType = pokemon.types.find((entry) => entry.slot === 1)?.type.name ?? 'normal';
    const about = [
      `${bold(t('pokedex.details.type'))} ${types.map((type) => withTypeEmoji(type.slug, type.name)).join(', ')}`,
      ...[...details, ...breeding].map((detail) => `${bold(detail.label)} ${detail.value}`),
    ];
    const statLines = [
      heading(t('pokedex.stats.heading', { total: format(total) }), HeadingLevel.Three),
      ...stats.map((stat) => `${emojiBar(stat.value, STAT_BAR_MAX, firstType, { atLeastOne: true })} ${bold(format(stat.value))} ${stat.label}`),
    ];
    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(about.join('\n')))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(statLines.join('\n')));
    // How each one evolves, then their buttons, in order, with the one shown highlighted. Left out when it doesn't evolve, like on the card
    if (evolves) {
      const steps = stages
        .flat()
        .flatMap(({ from, how, ...member }) =>
          from && how ? [t('pokedex.evolution.step', { from: speciesName(from), to: bold(speciesName(member)), how })] : [],
        );
      container
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([heading(t('pokedex.evolution.title'), HeadingLevel.Three), ...steps].join('\n')))
        .addActionRowComponents(buildEvolutionButtons(stages.flat(), match, shownView, speciesName));
    }
  } else {
    // All pictures are loaded at the same time, from the cache when they were shown before
    const [artwork, evolution] = await Promise.all([
      picture ? getImage(picture) : null,
      Promise.all(
        (evolves ? stages : []).map((stage) =>
          Promise.all(
            stage.map(async (member) => ({
              name: speciesName(member),
              how: member.how,
              image: await getImage(artworkUrl(member.id, shownView.shiny)),
              current: member.id === match.species.id,
            })),
          ),
        ),
      ),
    ]);

    const toHex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
    const icons = await Promise.all(types.map((type) => typeSymbol(type.slug)));
    const card = renderPokedexCard({
      name: shownName,
      number,
      genus: kind || null,
      artwork,
      types: types.map((type, index) => ({ name: type.name, color: toHex(type.color), icon: icons[index] })),
      stats,
      totalLabel: t('pokedex.stats.total'),
      entry,
      details: [details, breeding],
      evolution,
      evolutionLabel: t('pokedex.evolution.title'),
    });
    // The card is only pixels, so its description has everything on it for screen readers
    const description = t('pokedex.altText', {
      name: `${shownName} ${number}`,
      genus: kind,
      types: types.map((type) => type.name).join(', '),
      stats: statsText.join(', '),
      details: [...details, ...breeding].map((detail) => `${detail.label} ${detail.value}`).join(', '),
      evolution: evolutionText,
      entry: entry ?? '',
    });
    const { gallery, file } = imageWithDescription('pokedex.png', card, description);
    files.push(file);
    container.addMediaGalleryComponents(gallery);
  }

  const { navigation, forms } = buildControls(match, shownView, Boolean(shinyPicture), language, t);
  // The text has them under its evolution heading already
  const evolutionButtons = evolves && !view.text ? buildEvolutionButtons(stages.flat(), match, shownView, speciesName) : [];
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)).addActionRowComponents(...navigation, ...evolutionButtons);
  if (forms.length > 0) container.addActionRowComponents(...forms);
  // Its abilities and the items wild ones hold, each with a page of its own
  const entryPage = { kind: 'pokemon' as const, slug: matchSlug(match) };
  const links = linkSelect(
    entryPage,
    [
      ...[...pokemon.abilities]
        .sort((a, b) => a.slot - b.slot)
        .map((ability) => ({
          page: { kind: 'ability' as const, slug: ability.ability.name },
          label: nameIn(data.abilities[ability.ability.name], language) || ability.ability.name,
          description: ability.is_hidden ? t('abilities.hidden') : t('pages.ability'),
        })),
      ...pokemon.held_items.map((held) => ({
        page: { kind: 'item' as const, slug: held.item.name },
        label: nameOf('items', held.item.name, language),
        description: t('pages.heldItem'),
      })),
    ],
    t('pages.links.entry', { name }),
  );
  if (links) container.addActionRowComponents(links);

  return { components: [container], files, flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}

/**
 * Show another entry on the message a button or select is on, for its buttons and select.
 * Errors are sent to only whoever pressed, so the entry stays as it was.
 */
export async function updatePokedexEntry(
  interaction: ButtonInteraction | StringSelectMenuInteraction | ModalMessageModalSubmitInteraction,
  slug: string,
  view: PokedexView,
): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  if (!interaction.deferred) await interaction.deferUpdate();
  try {
    await loadPokedexData();
    const match = findBySlug(slug);
    if (!match) return sendError(interaction, t('system.outdated'));
    const entry = await buildPokedexEntry(match, view, resolveLanguage(interaction.locale), t);
    if (!entry) return sendError(interaction, t('system.outdated'));
    return await interaction.editReply(entry);
  } catch (error) {
    return answerPokeApiError(interaction, error, t);
  }
}

/** The popup asking which Pokémon to show next, opened on an entry with the view it keeps. */
export function buildPokedexSearchModal(view: PokedexView, t: Translate) {
  return buildTextModal({
    customId: `${POKEDEX_SEARCH_MODAL_PREFIX}${encodeView(view)}`,
    title: t('pokedex.search.title'),
    label: t('pokedex.search.label'),
    inputId: SEARCH_INPUT_ID,
    placeholder: t('pokedex.search.placeholder'),
    maxLength: MAX_NAME_INPUT,
  });
}

/** Show the Pokémon typed into the popup, by any name or number, on the entry it was opened from. */
export async function handlePokedexSearchModal(interaction: ModalSubmitInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const view = decodeView(...(interaction.customId.slice(POKEDEX_SEARCH_MODAL_PREFIX.length).split(':') as [string, string]));
  if (!view || !interaction.isFromMessage()) return sendError(interaction, t('system.outdated'));

  const input = interaction.fields.getTextInputValue(SEARCH_INPUT_ID);
  // Answered before the names are loaded, which takes a while after a restart
  await interaction.deferUpdate();
  try {
    await loadPokedexData();
  } catch (error) {
    return answerPokeApiError(interaction, error, t);
  }
  const match = findPokemon(input);
  if (!match) return sendError(interaction, t('pokedex.notFound', { name: input }));
  return updatePokedexEntry(interaction, matchSlug(match), view);
}
