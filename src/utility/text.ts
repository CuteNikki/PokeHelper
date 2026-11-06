import { inlineCode } from 'discord.js';

/** A text that can go in code, with its backticks swapped for a look-alike, as they would end the code. */
export const escapeCode = (text: string) => text.replace(/`/g, 'ˋ');

/** A name in code, so whatever it's called can't turn into formatting, like a name with stars or underscores. */
export const code = (text: string) => inlineCode(escapeCode(text));
