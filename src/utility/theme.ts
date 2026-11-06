import { Colors } from 'discord.js';

/** The accent colors of the bot's messages, by what they say. */
export const ThemeColors = {
  success: Colors.Green,
  error: Colors.Red,
  warning: Colors.Gold,
  // The blue of the Pokémon logo. Red stays reserved for errors
  info: 0x3b4cca,
} as const;

export type ResponseKind = keyof typeof ThemeColors;
