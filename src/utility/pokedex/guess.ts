import { createCanvas, type Image } from '@napi-rs/canvas';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  bold,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MessageFlags,
  type ModalSubmitInteraction,
  SeparatorBuilder,
  SeparatorSpacingSize,
  subtext,
  TextDisplayBuilder,
} from 'discord.js';

import { getTranslate, resolveLanguage, type Translate } from 'utility/i18next';
import { buildTextModal } from 'utility/modal';
import { answerPokeApiError, artworkUrl, getImage, getPokemon } from 'utility/pokedex/api';
import { buildPokedexEntry } from 'utility/pokedex/entry';
import {
  findPokemon,
  getPokedexData,
  isNameOf,
  loadPokedexData,
  matchName,
  MAX_NAME_INPUT,
  nameIn,
  type PokedexSpecies,
  speciesById,
} from 'utility/pokedex/names';
import { sendError, sendResponse, type ResponsePayload } from 'utility/response';
import { escapeCode, shorten } from 'utility/text';
import { ThemeColors } from 'utility/theme';

/**
 * Who's that Pokémon: a silhouette to guess, for whoever started it. Everything about a game is in its buttons, like
 * `guess:hint:6:1:2:0`, so it needs nothing saved and works however old it is.
 */

export const GUESS_CUSTOM_ID_PREFIX = 'guess:';
/** The popup to type a guess in, followed by the game. */
export const GUESS_MODAL_PREFIX = 'guess-modal:';
const GUESS_INPUT_ID = 'name';

/** The last Pokédex number of each generation, in order. */
const GENERATION_ENDS = [151, 251, 386, 493, 649, 721, 809, 905, 1025];
export const GENERATIONS = GENERATION_ENDS.length;

/** The generation a Pokémon is from, by its number. Ones newer than the list count as the latest. */
export const generationOf = (id: number) => {
  const index = GENERATION_ENDS.findIndex((end) => id <= end);
  return index === -1 ? GENERATIONS : index + 1;
};

export interface GuessGame {
  speciesId: number;
  /** The generation it was picked from, kept for the next game, or null for any. */
  generation: number | null;
  guesses: number;
  hints: number;
}

export type GuessAction = 'guess' | 'hint' | 'giveup' | 'again' | 'dex';
const ACTIONS: GuessAction[] = ['guess', 'hint', 'giveup', 'again', 'dex'];

const encodeGame = (game: GuessGame) => `${game.speciesId}:${game.generation ?? 0}:${game.guesses}:${game.hints}`;

function decodeGame(parts: string[]): GuessGame | null {
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const [speciesId, generation, guesses, hints] = parts.map(Number) as [number, number, number, number];
  if (speciesId < 1 || generation > GENERATIONS) return null;
  return { speciesId, generation: generation || null, guesses, hints };
}

export const guessCustomId = (action: GuessAction, game: GuessGame) => `${GUESS_CUSTOM_ID_PREFIX}${action}:${encodeGame(game)}`;

/** What a button of a game does and the game, or null if it isn't one. */
export function parseGuessCustomId(customId: string): { action: GuessAction; game: GuessGame } | null {
  if (!customId.startsWith(GUESS_CUSTOM_ID_PREFIX)) return null;
  const [action, ...parts] = customId.slice(GUESS_CUSTOM_ID_PREFIX.length).split(':');
  if (!ACTIONS.includes(action as GuessAction)) return null;
  const game = decodeGame(parts);
  return game ? { action: action as GuessAction, game } : null;
}

/** A new game, with a random Pokémon from the generation, or from all of them. Never the one just played, when there's another. */
export function newGame(generation: number | null, notId?: number): GuessGame | null {
  const all = getPokedexData().species.filter((species) => !generation || generationOf(species.id) === generation);
  const pool = all.length > 1 ? all.filter((species) => species.id !== notId) : all;
  const species = pool[Math.floor(Math.random() * pool.length)];
  return species ? { speciesId: species.id, generation, guesses: 0, hints: 0 } : null;
}

type Hint = 'types' | 'generation' | 'name';

/** The hints a game can give, in the order they're given. The generation isn't one when the game was picked from it. */
export const hintsOf = (game: GuessGame): Hint[] => (game.generation ? ['types', 'name'] : ['types', 'generation', 'name']);

/** A name with only its first letter shown, and a blank for every other letter, like `P _ _ _ _ _ _`. Spaces and dots stay. */
export const nameHint = (name: string) => [...name].map((character, index) => (index === 0 || !/[\p{L}\p{N}]/u.test(character) ? character : '_')).join(' ');

const SIZE = 512;
const PADDING = 40;
const BACKGROUND = '#e6e9f8';
const SILHOUETTE = '#1f2342';

/** The picture of a game: the Pokémon as a dark shape on a light card while it's guessed, and as itself once it's over. */
export function renderGuessPicture(artwork: Image | null, hidden: boolean): Buffer {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = BACKGROUND;
  ctx.beginPath();
  ctx.roundRect(0, 0, SIZE, SIZE, 32);
  ctx.fill();

  if (artwork) {
    // Drawn on its own first, so filling it in only colors the Pokémon and not the card
    const layer = createCanvas(SIZE, SIZE);
    const layerCtx = layer.getContext('2d');
    layerCtx.drawImage(artwork, PADDING, PADDING, SIZE - PADDING * 2, SIZE - PADDING * 2);
    if (hidden) {
      layerCtx.globalCompositeOperation = 'source-in';
      layerCtx.fillStyle = SILHOUETTE;
      layerCtx.fillRect(0, 0, SIZE, SIZE);
    }
    ctx.drawImage(layer, 0, 0);
  }
  return canvas.toBuffer('image/png');
}

type Outcome = 'playing' | 'solved' | 'gaveUp';

/** The hints given so far, as lines like the Pokédex's, like `**Type** Fire, Flying`. */
async function hintLines(game: GuessGame, species: PokedexSpecies, language: string, t: Translate): Promise<string[]> {
  const given = hintsOf(game).slice(0, game.hints);
  const lines: string[] = [];
  for (const hint of given) {
    if (hint === 'types') {
      const pokemon = await getPokemon(species.slug);
      const types = [...(pokemon?.types ?? [])]
        .sort((a, b) => a.slot - b.slot)
        .map((entry) => nameIn(getPokedexData().types[entry.type.name], language) || entry.type.name);
      if (types.length > 0) lines.push(`${bold(t('pokedex.details.type'))} ${types.join(', ')}`);
    } else if (hint === 'generation') {
      lines.push(`${bold(t('guess.hints.generation'))} ${generationOf(species.id)}`);
    } else {
      lines.push(`${bold(t('guess.hints.name'))} \`${nameHint(nameIn(species.names, language))}\``);
    }
  }
  return lines;
}

/**
 * A game as a message: the picture, the hints and the last wrong guess, with buttons to guess, get a hint or give up.
 * Once it's over, the Pokémon itself, with buttons to play again and to see its Pokédex entry.
 * @param lastGuess The name of the last wrong guess, to say it wasn't that.
 * @throws {PokeApiError} When PokéAPI can't be reached for a hint.
 */
export async function buildGuessGame(game: GuessGame, outcome: Outcome, language: string, t: Translate, lastGuess?: string): Promise<ResponsePayload | null> {
  const species = speciesById(game.speciesId);
  if (!species) return null;
  const name = nameIn(species.names, language);
  const over = outcome !== 'playing';

  const artwork = await getImage(artworkUrl(species.id, false));
  const picture = new AttachmentBuilder(renderGuessPicture(artwork, !over), { name: 'pokemon.png' });

  const accent = outcome === 'solved' ? ThemeColors.success : ThemeColors.info;
  const container = new ContainerBuilder().setAccentColor(accent);

  if (outcome === 'playing') {
    const intro = game.generation ? t('guess.fromGeneration', { generation: game.generation }) : t('guess.anyLanguage');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${t('guess.title')}\n${subtext(intro)}`));
  } else if (outcome === 'solved') {
    const solved = t('guess.solvedIn', { count: game.guesses }) + (game.hints > 0 ? t('guess.withHints', { count: game.hints }) : '');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${t('guess.solved', { name })}\n${subtext(solved)}`));
  } else {
    const after = game.guesses > 0 ? t('guess.gaveUpAfter', { count: game.guesses }) : t('guess.gaveUpEarly');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${t('guess.gaveUp', { name })}\n${subtext(after)}`));
  }

  // Described for screen readers, without saying who it is while it's guessed
  const description = over ? t('pokedex.picture', { name }) : t('guess.silhouette');
  container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems((item) => item.setURL('attachment://pokemon.png').setDescription(description)));

  if (outcome === 'playing') {
    const status = [
      ...(await hintLines(game, species, language, t)),
      lastGuess ? t('guess.notIt', { name: lastGuess }) : null,
      game.guesses > 0 ? subtext(t('guess.guesses', { count: game.guesses })) : null,
    ].filter((line): line is string => line !== null);
    if (status.length > 0) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(status.join('\n')));

    const hintsLeft = hintsOf(game).length - game.hints;
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)).addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(guessCustomId('guess', game)).setLabel(t('guess.buttons.guess')).setEmoji('✏️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(guessCustomId('hint', game))
          .setLabel(hintsLeft > 0 ? t('guess.buttons.hintsLeft', { count: hintsLeft }) : t('guess.buttons.hint'))
          .setEmoji('💡')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(hintsLeft <= 0),
        new ButtonBuilder().setCustomId(guessCustomId('giveup', game)).setLabel(t('guess.buttons.giveUp')).setStyle(ButtonStyle.Secondary),
      ),
    );
  } else {
    container
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(guessCustomId('again', game)).setLabel(t('guess.buttons.again')).setEmoji('🔁').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(guessCustomId('dex', game)).setLabel(t('guess.buttons.pokedex')).setEmoji('📖').setStyle(ButtonStyle.Secondary),
        ),
      );
  }

  return { components: [container], files: [picture], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}

/** The popup to type a guess in. */
function buildGuessModal(game: GuessGame, t: Translate) {
  return buildTextModal({
    customId: `${GUESS_MODAL_PREFIX}${encodeGame(game)}`,
    title: t('guess.modal.title'),
    label: t('guess.modal.label'),
    inputId: GUESS_INPUT_ID,
    placeholder: t('guess.modal.placeholder'),
    maxLength: MAX_NAME_INPUT,
  });
}

/** Show a game on the message the button or popup is on, in place of what was there, picture included. */
async function showGame(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  game: GuessGame,
  outcome: Outcome,
  t: Translate,
  lastGuess?: string,
): Promise<unknown> {
  await interaction.deferUpdate();
  try {
    const payload = await buildGuessGame(game, outcome, resolveLanguage(interaction.locale), t, lastGuess);
    if (!payload) return sendError(interaction, t('system.outdated'));
    // The old picture goes, so the message only has the new one
    return await interaction.editReply({ ...payload, attachments: [] });
  } catch (error) {
    return answerPokeApiError(interaction, error, t);
  }
}

/** The buttons of a game: guess, hint, give up, play again and its Pokédex entry. */
export async function handleGuessButton(interaction: ButtonInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const parsed = parseGuessCustomId(interaction.customId);
  if (!parsed) return sendError(interaction, t('system.outdated'));
  const { action, game } = parsed;

  // The popup has to be the first answer, before anything is loaded
  if (action === 'guess') return interaction.showModal(buildGuessModal(game, t));

  try {
    await loadPokedexData();
  } catch (error) {
    return answerPokeApiError(interaction, error, t);
  }

  switch (action) {
    case 'hint':
      return showGame(interaction, { ...game, hints: Math.min(game.hints + 1, hintsOf(game).length) }, 'playing', t);
    case 'giveup':
      return showGame(interaction, game, 'gaveUp', t);
    case 'again': {
      const next = newGame(game.generation, game.speciesId);
      return next ? showGame(interaction, next, 'playing', t) : sendError(interaction, t('system.outdated'));
    }
    case 'dex': {
      // As a message of its own, so the game stays to look back at
      const species = speciesById(game.speciesId);
      if (!species) return sendError(interaction, t('system.outdated'));
      await interaction.deferReply();
      try {
        const entry = await buildPokedexEntry({ species, form: null }, { shiny: false, text: false }, resolveLanguage(interaction.locale), t);
        if (!entry) return sendError(interaction, t('system.outdated'));
        return await sendResponse(interaction, entry);
      } catch (error) {
        return answerPokeApiError(interaction, error, t);
      }
    }
  }
}

/** A guess typed into the popup: right, wrong, or not a Pokémon at all, which doesn't count. */
export async function handleGuessModal(interaction: ModalSubmitInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const game = decodeGame(interaction.customId.slice(GUESS_MODAL_PREFIX.length).split(':'));
  if (!game || !interaction.isFromMessage()) return sendError(interaction, t('system.outdated'));

  try {
    await loadPokedexData();
  } catch (error) {
    return answerPokeApiError(interaction, error, t);
  }
  const species = speciesById(game.speciesId);
  if (!species) return sendError(interaction, t('system.outdated'));

  const input = interaction.fields.getTextInputValue(GUESS_INPUT_ID);
  const guessed = { ...game, guesses: game.guesses + 1 };
  if (isNameOf(species, input)) return showGame(interaction, guessed, 'solved', t);

  // Numbers aren't names, and a typo shouldn't cost a guess
  const match = /^\s*#?\d+\s*$/.test(input) ? null : findPokemon(input);
  if (!match) return sendError(interaction, t('guess.unknown', { name: shorten(escapeCode(input.trim()), 100) }));
  return showGame(interaction, guessed, 'playing', t, matchName(match, resolveLanguage(interaction.locale)));
}
