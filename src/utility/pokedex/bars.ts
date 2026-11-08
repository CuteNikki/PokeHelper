import { type BarPiece, statBarEmoji } from 'utility/emojis';

/** The square emoji closest to each type's color, for bars in text when the bot's own bar emojis aren't there. */
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

/** How many pieces a bar is made of, like the card's bars. */
export const BAR_PIECES = 10;

/**
 * A value as a bar in a type's color, full at `max`, made of the bot's bar emojis, or of squares like 🟩🟩🟩⬛⬛ if they aren't there.
 * `atLeastOne` fills one piece even for the smallest values, like for base stats, so none looks empty.
 */
export function emojiBar(value: number, max: number, type: string, { atLeastOne = false } = {}): string {
  const filled = Math.max(atLeastOne ? 1 : 0, Math.min(BAR_PIECES, Math.round((value / max) * BAR_PIECES)));
  const pieces = Array.from({ length: BAR_PIECES }, (_, index) => {
    const piece: BarPiece = index === 0 ? 'start' : index === BAR_PIECES - 1 ? 'end' : 'middle';
    return statBarEmoji(index < filled ? type : 'empty', piece);
  });
  if (pieces.every(Boolean)) return pieces.join('');
  return (TYPE_SQUARES[type] ?? '⬜').repeat(filled) + '⬛'.repeat(BAR_PIECES - filled);
}

/**
 * The type whose color goes with a contest condition or a berry flavor, which the games give the same colors: Cool and Spicy are
 * red, Beauty and Dry blue, Cute and Sweet pink, Clever and Bitter green, Tough and Sour yellow.
 */
export const CONDITION_TYPES: Record<string, string> = {
  cool: 'fire',
  spicy: 'fire',
  beauty: 'water',
  dry: 'water',
  cute: 'fairy',
  sweet: 'fairy',
  smart: 'grass',
  bitter: 'grass',
  tough: 'electric',
  sour: 'electric',
};
