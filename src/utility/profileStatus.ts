import { ActivityType, type Client } from 'discord.js';

import { STATUSES } from 'art/statuses';
import type { ThemeName } from 'art/themes';

/** The bot's custom status, to go with the theme it wears. What it says in each theme is in `art/statuses`. */

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
