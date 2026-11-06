import {
  ActionRowBuilder,
  bold,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  ContainerBuilder,
  heading,
  HeadingLevel,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  subtext,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';

import { FALLBACK_LANGUAGE, getTranslate, resolveLanguage, type Translate } from 'utility/i18next';
import { answerPokeApiError, type ApiDamageRelations, artworkUrl, getImage, getMove, getPokemon, getType } from 'utility/pokedex/api';
import { renderMatchupCard } from 'utility/pokedex/matchupCard';
import { buttonIcon, withTypeEmoji } from 'utility/emojis';
import { typeSymbol } from 'utility/pokedex/typeIcons';
import { findBySlug, getPokedexData, loadPokedexData, matchName, nameIn, type PokedexMatch } from 'utility/pokedex/names';
import { TYPE_COLORS } from 'utility/pokedex/types';
import { imageWithDescription, type ResponsePayload, sendError, sendResponse } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/**
 * The Matchups button of a Pokédex entry is `pokedex-matchups:<slug>:<i|t>`, with the Pokémon or form it's for and whether the entry is
 * a card or text, so it works however old the entry is. Buttons from before the text mode have none and show the card.
 */
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

/**
 * Well-known Pokémon and strong, common moves of each type, to use against a Pokémon weak to it. Picked by hand, as which are well
 * known can't be worked out, and kept to three each so a row stays readable. Their names come from PokéAPI in each language.
 */
export const TYPE_EXAMPLES: Record<string, { pokemon: string[]; moves: string[] }> = {
  normal: { pokemon: ['snorlax', 'porygon-z', 'staraptor'], moves: ['hyper-voice', 'body-slam', 'double-edge'] },
  fire: { pokemon: ['charizard', 'arcanine', 'volcarona'], moves: ['flamethrower', 'fire-blast', 'flare-blitz'] },
  water: { pokemon: ['blastoise', 'gyarados', 'greninja'], moves: ['surf', 'hydro-pump', 'waterfall'] },
  electric: { pokemon: ['jolteon', 'magnezone', 'zapdos'], moves: ['thunderbolt', 'thunder', 'wild-charge'] },
  grass: { pokemon: ['venusaur', 'sceptile', 'rillaboom'], moves: ['energy-ball', 'giga-drain', 'leaf-blade'] },
  ice: { pokemon: ['lapras', 'weavile', 'glaceon'], moves: ['ice-beam', 'blizzard', 'icicle-crash'] },
  fighting: { pokemon: ['lucario', 'machamp', 'conkeldurr'], moves: ['close-combat', 'aura-sphere', 'drain-punch'] },
  poison: { pokemon: ['gengar', 'toxapex', 'nidoking'], moves: ['sludge-bomb', 'gunk-shot', 'poison-jab'] },
  ground: { pokemon: ['garchomp', 'excadrill', 'landorus'], moves: ['earthquake', 'earth-power', 'high-horsepower'] },
  flying: { pokemon: ['talonflame', 'corviknight', 'pidgeot'], moves: ['brave-bird', 'hurricane', 'air-slash'] },
  psychic: { pokemon: ['alakazam', 'espeon', 'gardevoir'], moves: ['psychic', 'psyshock', 'zen-headbutt'] },
  bug: { pokemon: ['scizor', 'heracross', 'pinsir'], moves: ['bug-buzz', 'x-scissor', 'u-turn'] },
  rock: { pokemon: ['tyranitar', 'aerodactyl', 'rhyperior'], moves: ['stone-edge', 'rock-slide', 'power-gem'] },
  ghost: { pokemon: ['dragapult', 'mimikyu', 'chandelure'], moves: ['shadow-ball', 'poltergeist', 'shadow-claw'] },
  dragon: { pokemon: ['dragonite', 'salamence', 'haxorus'], moves: ['draco-meteor', 'dragon-claw', 'outrage'] },
  dark: { pokemon: ['umbreon', 'hydreigon', 'kingambit'], moves: ['dark-pulse', 'crunch', 'knock-off'] },
  steel: { pokemon: ['metagross', 'aggron', 'steelix'], moves: ['iron-head', 'flash-cannon', 'meteor-mash'] },
  fairy: { pokemon: ['sylveon', 'clefable', 'togekiss'], moves: ['moonblast', 'play-rough', 'dazzling-gleam'] },
};

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
export const matchupsButton = (slug: string, text: boolean, t: Translate) =>
  new ButtonBuilder()
    .setCustomId(`${POKEDEX_MATCHUPS_PREFIX}${slug}:${text ? 't' : 'i'}`)
    .setStyle(ButtonStyle.Secondary)
    .setEmoji(buttonIcon('shield'))
    .setLabel(t('pokedex.matchups.button'));

/** The button on the matchups that switches them between the card and text, ending in `:switch`, as it changes the reply it's on. */
const switchButton = (slug: string, text: boolean, t: Translate) =>
  new ButtonBuilder()
    .setCustomId(`${POKEDEX_MATCHUPS_PREFIX}${slug}:${text ? 'i' : 't'}:switch`)
    .setStyle(ButtonStyle.Secondary)
    .setEmoji(text ? buttonIcon('image') : buttonIcon('file-text'))
    .setLabel(t(text ? 'pokedex.view.image' : 'pokedex.view.text'));

/** The Pokémon, whether to show text, and whether it's the switch on the matchups, from a button's custom ID. */
export function parseMatchupsCustomId(customId: string): { slug: string; text: boolean; switch: boolean } | null {
  const [slug, mode, extra, ...rest] = customId.slice(POKEDEX_MATCHUPS_PREFIX.length).split(':');
  if (!slug || rest.length > 0 || (mode !== undefined && mode !== 'i' && mode !== 't') || (extra !== undefined && extra !== 'switch')) return null;
  return { slug, text: mode === 't', switch: extra === 'switch' };
}

const toHex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

interface MatchupType {
  slug: string;
  name: string;
  color: number;
}

interface Matchups {
  name: string;
  picture: string | null;
  types: MatchupType[];
  weak: { type: MatchupType; label: string; pokemon: { name: string; id: number }[]; moves: string[] }[];
  resists: { type: MatchupType; label: string }[];
  immune: { type: MatchupType; label: string }[];
}

/**
 * Everything about a Pokémon's matchups, in a language.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 * @returns The matchups, or null when PokéAPI doesn't know the Pokémon.
 */
async function getMatchups(slug: string, language: string): Promise<Matchups | null> {
  const match = findBySlug(slug);
  const pokemon = match && (await getPokemon(slug));
  if (!match || !pokemon) return null;

  const ownTypes = [...pokemon.types].sort((a, b) => a.slot - b.slot).map((entry) => entry.type.name);
  const relations = await Promise.all(ownTypes.map((name) => getType(name)));
  if (relations.some((relation) => !relation)) return null;

  const data = getPokedexData();
  const toType = (type: string): MatchupType => ({
    slug: type,
    name: nameIn(data.types[type], language) || type,
    color: TYPE_COLORS[type] ?? ThemeColors.info,
  });
  const groups = matchupGroups(damageTaken(relations.map((relation) => relation!.damage_relations)));
  const entries = (keep: (multiplier: number) => boolean) =>
    groups.filter((group) => keep(group.multiplier)).flatMap((group) => group.types.map((type) => ({ type: toType(type), label: group.label })));

  // The moves' names are asked for together, and one PokéAPI doesn't answer for is left out
  const weak = await Promise.all(
    entries((multiplier) => multiplier > 1).map(async (entry) => {
      const examples = TYPE_EXAMPLES[entry.type.slug] ?? { pokemon: [], moves: [] };
      const moves = await Promise.all(examples.moves.map((move) => getMove(move).catch(() => null)));
      return {
        ...entry,
        pokemon: examples.pokemon
          .map((example) => findBySlug(example))
          .filter((example): example is PokedexMatch => example !== null && example.species.id !== match.species.id)
          .map((example) => ({ name: matchName(example, language), id: example.species.id })),
        moves: moves.flatMap((move) => {
          if (!move) return [];
          const named = (lang: string) => move.names.find((name) => name.language.name === lang)?.name;
          return [named(language) ?? named(FALLBACK_LANGUAGE) ?? move.name];
        }),
      };
    }),
  );

  return {
    name: matchName(match, language),
    picture: pokemon.sprites.other?.['official-artwork']?.front_default ?? pokemon.sprites.front_default,
    types: ownTypes.map(toType),
    weak,
    resists: entries((multiplier) => multiplier > 0 && multiplier < 1),
    immune: entries((multiplier) => multiplier === 0),
  };
}

/** The matchups as a card, like the Pokédex entry, with everything on it in its description for screen readers. */
async function buildCard(matchups: Matchups, slug: string, t: Translate): Promise<ResponsePayload> {
  const cardType = async (type: MatchupType) => ({ name: type.name, color: toHex(type.color), icon: await typeSymbol(type.slug) });
  const [artwork, weak] = await Promise.all([
    matchups.picture ? getImage(matchups.picture) : null,
    Promise.all(
      matchups.weak.map(async (entry) => ({
        type: await cardType(entry.type),
        multiplier: entry.label,
        pokemon: await Promise.all(entry.pokemon.map(async (example) => ({ name: example.name, image: await getImage(artworkUrl(example.id, false)) }))),
        moves: entry.moves,
      })),
    ),
  ]);
  const [types, resists, immune] = await Promise.all([
    Promise.all(matchups.types.map(cardType)),
    Promise.all(matchups.resists.map(async (entry) => ({ type: await cardType(entry.type), multiplier: entry.label }))),
    Promise.all(matchups.immune.map(async (entry) => ({ type: await cardType(entry.type), multiplier: entry.label }))),
  ]);
  const card = renderMatchupCard({
    name: matchups.name,
    artwork,
    types,
    title: t('pokedex.matchups.button'),
    weak,
    resists,
    immune,
    labels: {
      weak: t('pokedex.matchups.weak'),
      resists: t('pokedex.matchups.resists'),
      immune: t('pokedex.matchups.immune'),
      pokemon: t('pokedex.matchups.pokemon'),
      moves: t('pokedex.matchups.moves'),
    },
    note: t('pokedex.matchups.note'),
  });

  const list = (entries: { type: MatchupType; label: string }[]) => entries.map((entry) => `${entry.type.name} ${entry.label}`).join(', ');
  const weakText = matchups.weak
    .map((entry) => `${entry.type.name} ${entry.label} (${[...entry.pokemon.map((example) => example.name), ...entry.moves].join(', ')})`)
    .join('; ');
  const description = [
    t('pokedex.matchups.altText', { name: matchups.name, types: matchups.types.map((type) => type.name).join(', ') }),
    matchups.weak.length > 0 ? `${t('pokedex.matchups.weak')}: ${weakText}.` : null,
    matchups.resists.length > 0 ? `${t('pokedex.matchups.resists')}: ${list(matchups.resists)}.` : null,
    matchups.immune.length > 0 ? `${t('pokedex.matchups.immune')}: ${list(matchups.immune)}.` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const { gallery, file } = imageWithDescription('matchups.png', card, description);
  const container = new ContainerBuilder()
    .setAccentColor(matchups.types[0]?.color ?? ThemeColors.info)
    .addMediaGalleryComponents(gallery)
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(switchButton(slug, false, t)));
  return { components: [container], files: [file], flags: [MessageFlags.IsComponentsV2] };
}

/** The matchups as text, a type to a line, with the Pokémon's picture and one of the Pokémon to use against each weakness. */
function buildText(matchups: Matchups, slug: string, t: Translate): ResponsePayload {
  const header = new TextDisplayBuilder().setContent(
    `${t('pokedex.matchups.title', { name: matchups.name })}\n${subtext(matchups.types.map((type) => withTypeEmoji(type.slug, type.name)).join(' / '))}`,
  );
  const container = new ContainerBuilder().setAccentColor(matchups.types[0]?.color ?? ThemeColors.info);
  if (matchups.picture) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(header)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(matchups.picture).setDescription(t('pokedex.picture', { name: matchups.name }))),
    );
  } else {
    container.addTextDisplayComponents(header);
  }

  if (matchups.weak.length > 0) {
    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(heading(t('pokedex.matchups.weak'), HeadingLevel.Three)));
    for (const entry of matchups.weak) {
      const lines = [
        `${withTypeEmoji(entry.type.slug, bold(entry.type.name))} ${entry.label}`,
        // Labeled like the card
        entry.pokemon.length > 0 ? `${t('pokedex.matchups.pokemon')}: ${entry.pokemon.map((example) => example.name).join(' · ')}` : null,
        entry.moves.length > 0 ? `${t('pokedex.matchups.moves')}: ${entry.moves.join(' · ')}` : null,
      ];
      const text = new TextDisplayBuilder().setContent(lines.filter(Boolean).join('\n'));
      const first = entry.pokemon[0];
      if (first) {
        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(text)
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(artworkUrl(first.id, false)).setDescription(t('pokedex.picture', { name: first.name }))),
        );
      } else {
        container.addTextDisplayComponents(text);
      }
    }
  }

  for (const [key, entries] of [
    ['resists', matchups.resists],
    ['immune', matchups.immune],
  ] as const) {
    if (entries.length === 0) continue;
    const lines = entries.map((entry) => `${withTypeEmoji(entry.type.slug, bold(entry.type.name))} ${entry.label}`);
    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${heading(t(`pokedex.matchups.${key}`), HeadingLevel.Three)}\n${lines.join('\n')}`));
  }

  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(subtext(t('pokedex.matchups.note'))))
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(switchButton(slug, true, t)));
  return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}

/**
 * Show the matchups of the entry's Pokémon to whoever pressed the button, in their language, so the entry stays as it is for everyone.
 * As a card or text, like the entry.
 */
export async function showMatchups(interaction: ButtonInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const parsed = parseMatchupsCustomId(interaction.customId);
  if (!parsed) return sendError(interaction, t('system.outdated'));

  // The switch changes the reply it's on, the button on the entry answers with a new one
  if (parsed.switch) await interaction.deferUpdate();
  else await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  try {
    await loadPokedexData();
    const matchups = await getMatchups(parsed.slug, resolveLanguage(interaction.locale));
    if (!matchups) return sendError(interaction, t('system.outdated'));
    const reply = parsed.text ? buildText(matchups, parsed.slug, t) : await buildCard(matchups, parsed.slug, t);
    // Without the card's picture when switching to text
    if (parsed.switch) return interaction.editReply({ ...reply, attachments: [] });
    return sendResponse(interaction, reply);
  } catch (error) {
    return answerPokeApiError(interaction, error, t);
  }
}
