import type { UserFriendCodes } from 'generated/prisma/client';

/** The games friend codes can be saved for, in the order they're shown, by their column in the database. */
export const FRIEND_CODE_GAMES = ['nintendoSwitch', 'pokemonGo', 'pokemonSleep', 'tcgPocket'] as const;
export type FriendCodeGame = (typeof FRIEND_CODE_GAMES)[number];
export type FriendCodes = Record<FriendCodeGame, string | null>;

interface GameFormat {
  /** How many digits a code has. */
  digits: number;
  /** The digits per group, joined by the separator, the way the game shows them. */
  group: number;
  separator: string;
  /** What comes before the code, like `SW-` on the Switch. Optional when typed. */
  prefix?: string;
}

const FORMATS: Record<FriendCodeGame, GameFormat> = {
  nintendoSwitch: { digits: 12, group: 4, separator: '-', prefix: 'SW-' },
  pokemonGo: { digits: 12, group: 4, separator: ' ' },
  pokemonSleep: { digits: 12, group: 4, separator: '-' },
  tcgPocket: { digits: 16, group: 4, separator: '-' },
};

/** The most characters typed for a code: the digits with a separator between every one, and the prefix. */
export const MAX_FRIEND_CODE_INPUT = 40;

/**
 * The digits of a typed code, or null if it isn't one for the game. Spaces, dashes and the game's prefix are fine, as codes are
 * often copied the way they're shown.
 */
export function parseFriendCode(game: FriendCodeGame, text: string): string | null {
  const { digits, prefix } = FORMATS[game];
  let rest = text.trim();
  if (prefix && rest.toUpperCase().startsWith(prefix.slice(0, -1))) rest = rest.slice(prefix.length - 1);
  if (!/^[\d\s\-.]+$/.test(rest)) return null;
  const code = rest.replace(/\D/g, '');
  return code.length === digits ? code : null;
}

/** A code the way the game shows it, like `SW-1234-5678-9012`. */
export function formatFriendCode(game: FriendCodeGame, code: string): string {
  const { group, separator, prefix = '' } = FORMATS[game];
  const groups = code.match(new RegExp(`.{1,${group}}`, 'g')) ?? [code];
  return `${prefix}${groups.join(separator)}`;
}

/** A made-up code the way the game shows it, to show how one is typed. */
export const exampleFriendCode = (game: FriendCodeGame) => formatFriendCode(game, '1234567890123456'.slice(0, FORMATS[game].digits));

/** The codes someone saved, in the order they're shown. */
export const savedFriendCodes = (codes: Pick<UserFriendCodes, FriendCodeGame> | null) =>
  FRIEND_CODE_GAMES.flatMap((game) => (codes?.[game] ? [{ game, code: codes[game] }] : []));
