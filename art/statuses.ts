import type { ThemeName } from './themes';

/**
 * The bot's custom status, to go with the theme it wears, like "Happy Pride Month!" in June. One text for everyone, as a status
 * can't be in each server's language, so it's in English. At most 128 characters, Discord's limit. Kept with the art, as the
 * overview of every theme shows them too.
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
