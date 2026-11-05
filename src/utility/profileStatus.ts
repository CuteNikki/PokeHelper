import { ActivityType, type Client } from 'discord.js';

import type { ThemeName } from 'art/themes';

/**
 * The bot's custom status, to go with the theme it wears, like "Happy Pride Month!" in June. One text for everyone, as a status
 * can't be in each server's language, so it's in English. At most 128 characters, Discord's limit.
 */

/** What the bot says in each theme. With more than one, they take turns. */
export const STATUSES: Record<ThemeName, string[]> = {
  standard: ['Ready when you are 👋', 'Here to help ✨', 'Hanging out in the tall grass 🌿'],
  spring: ['Spring is here! 🌸', 'Stopping to smell the flowers 🌷', 'Watching the cherry blossoms fall 🌸'],
  summer: ['Soaking up the sun ☀️', 'Happy summer! 🏖️', 'Too hot for anything but ice cream 🍦'],
  autumn: ['Happy autumn! 🍂', 'Jumping into leaf piles 🍁', 'Cozy season is here ☕'],
  winter: ['Stay warm out there ❄️', 'Building a snowman ⛄', 'Hot cocoa weather ☕'],
  halloween: ['Happy Halloween! 🎃', 'Trick or treat? 👻', 'Carving pumpkins 🎃'],
  christmas: ['Happy holidays! 🎄', 'Wrapping presents 🎁', 'Merry Christmas! 🎄'],
  newYear: ['Happy New Year! 🎆'],
  valentines: ["Happy Valentine's Day! 💖", 'Spreading the love 💕'],
  easter: ['Happy Easter! 🐣', 'Hunting for eggs 🥚'],
  pride: ['Happy Pride Month! 🏳️‍🌈', 'Love is love 🌈'],
  birthday: ["It's my birthday! 🎂", 'Another year of helping out 🎉'],
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * How long the bot says each sentence of a theme before the next: a day, counted in UTC days like the themes, so over a season it
 * goes through them all. The birthday lasts only a day, so its sentences take turns every few hours instead, or only one would ever
 * be said.
 */
const SAY_FOR: Partial<Record<ThemeName, number>> = { birthday: 6 * HOUR };

/** What the bot says in a theme at a moment, going through its sentences one after the other. */
export function statusFor(theme: ThemeName, now = new Date()): string {
  const sentences = STATUSES[theme];
  return sentences[Math.floor(now.getTime() / (SAY_FOR[theme] ?? DAY)) % sentences.length]!;
}

/**
 * Put the status of a theme on the bot. Cheap, and not limited like the avatar, so it's simply set again on every run, which also
 * brings it back if Discord ever drops it.
 */
export function setThemeStatus(client: Client<true>, theme: ThemeName, now = new Date()): string {
  const status = statusFor(theme, now);
  client.user.setPresence({ activities: [{ name: 'Custom Status', state: status, type: ActivityType.Custom }] });
  return status;
}
