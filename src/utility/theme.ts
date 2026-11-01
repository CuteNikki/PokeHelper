import { Colors } from 'discord.js';

/**
 * Accent colors used across all bot messages.
 * Change these to restyle every container the bot sends.
 */
export const ThemeColors = {
  success: Colors.Green,
  error: Colors.Red,
  warning: Colors.Gold,
  // The blue of the Pokémon logo. Red stays reserved for errors
  info: 0x3b4cca,
} as const;

export type ResponseKind = keyof typeof ThemeColors;
