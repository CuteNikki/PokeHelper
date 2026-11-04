import { DiscordAPIError, SnowflakeUtil, type Client } from 'discord.js';

import { avatarGif, bannerGif } from 'art/assets';
import { themeOn } from 'art/calendar';
import { THEMES, type ThemeName } from 'art/themes';

import { getBotProfile, updateBotProfile } from 'database/botProfile';

import { logger } from 'utility/logger';

/**
 * The bot wears a theme on its avatar and banner by the calendar, like Halloween in October, and changes them itself when a new one
 * starts. Each is only uploaded when its theme changes, as Discord allows only a couple of changes an hour, and one Discord turns
 * down as too soon is tried again on the next run.
 *
 * Only on with `PROFILE_THEMES=on`, so a second copy of the bot, like one run while developing with the same token, doesn't fight
 * the first over the profile.
 */

export const profileThemesEnabled = () => process.env.PROFILE_THEMES === 'on';

export const isThemeName = (name: string | null | undefined): name is ThemeName => !!name && name in THEMES;

/** When the bot was made, from its ID, whose day is its birthday each year. */
const madeOn = (client: Client<true>) => new Date(SnowflakeUtil.timestampFrom(client.user.id));

/** The theme the bot should wear now: the one picked by hand, or else the one of the day. */
export function wantedTheme(client: Client<true>, override: string | null, now = new Date()): ThemeName {
  return isThemeName(override) ? override : themeOn(now, madeOn(client));
}

/** Whether Discord turned an avatar or banner down because it was changed too recently. */
const isTooSoon = (error: unknown) => error instanceof DiscordAPIError && JSON.stringify(error.rawError).includes('RATE_LIMIT');

export interface ProfileSync {
  theme: ThemeName;
  /** What happened to each: changed, already wearing it, or turned down as too soon. */
  avatar: 'changed' | 'unchanged' | 'tooSoon';
  banner: 'changed' | 'unchanged' | 'tooSoon';
}

/**
 * Put the wanted theme on the avatar and banner, those not wearing it yet. The pictures are drawn only when one has to change, which
 * takes a second or two.
 */
export async function syncProfileTheme(client: Client<true>): Promise<ProfileSync> {
  const profile = await getBotProfile();
  const theme = wantedTheme(client, profile?.override ?? null);
  const result: ProfileSync = { theme, avatar: 'unchanged', banner: 'unchanged' };

  for (const part of ['avatar', 'banner'] as const) {
    if (profile?.[`${part}Theme`] === theme) continue;
    try {
      const image = Buffer.from(part === 'avatar' ? avatarGif(THEMES[theme]) : bannerGif(THEMES[theme]));
      await (part === 'avatar' ? client.user.setAvatar(image) : client.user.setBanner(image));
      await updateBotProfile({ [`${part}Theme`]: theme });
      result[part] = 'changed';
      logger.info(`Changed the bot's ${part} to the ${theme} theme`);
    } catch (error) {
      if (!isTooSoon(error)) throw error;
      result[part] = 'tooSoon';
      logger.info(`Discord says the bot's ${part} was changed too recently, the ${theme} theme is tried again later`);
    }
  }
  return result;
}

/** The scheduled job: keeps the profile on the theme of the day, when it's turned on. */
export async function runProfileThemeJob(client: Client<true>) {
  if (profileThemesEnabled()) await syncProfileTheme(client);
}
