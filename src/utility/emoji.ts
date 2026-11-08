import { formatEmoji } from 'discord.js';

/** Long enough for a server emoji typed in full, like `<a:name:id>`. */
export const MAX_EMOJI_LENGTH = 64;

/** A custom emoji, as much of it as the bot needs. */
export interface CustomEmoji {
  id: string;
  name: string | null;
  animated: boolean | null;
}

// A single emoji, with its skin tone and joined emoji like 👩‍🚀, a flag, or a keycap like 1️⃣
const UNICODE_EMOJI = /^(?:\p{RI}\p{RI}|[#*0-9]️?⃣|\p{Extended_Pictographic}️?\p{EMod}?(?:‍\p{Extended_Pictographic}️?\p{EMod}?)*)$/u;
const CUSTOM_EMOJI = /^<a?:\w{2,32}:(\d{17,20})>$/;

/** The ID of a custom emoji written in full, like `<a:name:id>`, or null if it isn't one. */
export const customEmojiId = (text: string) => CUSTOM_EMOJI.exec(text)?.[1] ?? null;

/**
 * Turn what was typed into an emoji: a normal one like 🔴, or one of the server's by name, like `:valor:` or `valor`, or null.
 * Emoji from other servers aren't accepted, as they can't be typed in a popup and the bot may not be able to use them.
 */
export function parseEmoji(input: string, emojis: Iterable<CustomEmoji>): string | null {
  const text = input.trim();
  if (UNICODE_EMOJI.test(text)) return text;

  const list = [...emojis];
  const format = (emoji: CustomEmoji) => formatEmoji({ id: emoji.id, name: emoji.name ?? undefined, animated: Boolean(emoji.animated) });

  const id = customEmojiId(text);
  if (id) {
    const emoji = list.find((candidate) => candidate.id === id);
    return emoji ? format(emoji) : null;
  }

  const name = text.replace(/^:|:$/g, '');
  const emoji = list.find((candidate) => candidate.name === name) ?? list.find((candidate) => candidate.name?.toLowerCase() === name.toLowerCase());
  return emoji ? format(emoji) : null;
}
