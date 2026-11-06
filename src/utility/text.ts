import { inlineCode, quote as quoteLine } from 'discord.js';

/** Cut a text to at most `max` characters, the … included, so it fits a limit exactly. */
export const shorten = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** A text that can go in code, with its backticks swapped for a look-alike, as they would end the code. */
export const escapeCode = (text: string) => text.replace(/`/g, 'ˋ');

/** A name in code, so whatever it's called can't turn into formatting, like a name with stars or underscores. */
export const code = (text: string) => inlineCode(escapeCode(text));

/** A text as a quote, every line of it, as discord.js's quote only quotes the first. */
export const quote = (text: string) =>
  text
    .split('\n')
    .map((line) => quoteLine(line))
    .join('\n');
