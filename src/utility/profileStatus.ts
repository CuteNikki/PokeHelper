import { ActivityType, type Client } from 'discord.js';

import { STATUSES } from 'art/statuses';
import type { ThemeName } from 'art/themes';

import { DAY, HOUR } from 'utility/duration';

// The bot's custom status, to go with the theme it wears. What it says in each theme is in `art/statuses`

/** How long each status sentence is shown: a UTC day by default. The birthday lasts only a day, so its sentences rotate every few hours. */
const SAY_FOR: Partial<Record<ThemeName, number>> = { birthday: 6 * HOUR };

/** What the bot says in a theme at a moment, going through its sentences one after the other. */
function statusFor(theme: ThemeName, now = new Date()): string {
  const sentences = STATUSES[theme];
  return sentences[Math.floor(now.getTime() / (SAY_FOR[theme] ?? DAY)) % sentences.length]!;
}

/** Put a theme's status on the bot. Not rate limited like the avatar, so it's set on every run, which also restores it if Discord drops it. */
export function setThemeStatus(client: Client<true>, theme: ThemeName, now = new Date()): string {
  const status = statusFor(theme, now);
  client.user.setPresence({ activities: [{ name: 'Custom Status', state: status, type: ActivityType.Custom }] });
  return status;
}
