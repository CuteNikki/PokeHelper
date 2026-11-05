import { DiscordAPIError, SnowflakeUtil, type Client } from 'discord.js';

import { themeOn } from 'art/calendar';
import { THEMES, type ThemeName } from 'art/themes';
import { drawGif } from 'art/workers';

import { getBotProfile, updateBotProfile } from 'database/botProfile';

import { logger } from 'utility/logger';
import { setThemeStatus } from 'utility/profileStatus';

/**
 * The bot wears a theme on its avatar, banner and custom status by the calendar, like Halloween in October, and changes them itself
 * when a new one starts. The pictures are only uploaded when their theme changes, as Discord allows only a couple of changes an hour,
 * and one Discord turns down as too soon is tried again on the next run.
 *
 * Only on with `PROFILE_THEMES=on`, so a second copy of the bot, like one run while developing with the same token, doesn't fight
 * the first over the profile.
 */

export const profileThemesEnabled = () => process.env.PROFILE_THEMES === 'on';

export const isThemeName = (name: string | null | undefined): name is ThemeName => !!name && name in THEMES;

/** When the bot was made, from its ID, whose day is its birthday each year. */
export const madeOn = (client: Client<true>) => new Date(SnowflakeUtil.timestampFrom(client.user.id));

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
  /** The custom status it says now. */
  status: string;
}

/**
 * Put the wanted theme on the avatar and banner, those not wearing it yet, and its custom status. The pictures are drawn only when
 * one has to change, which takes a second or two.
 * @param force Upload them again even when they wear it already, like after the artwork changed.
 */
export async function syncProfileTheme(client: Client<true>, force = false): Promise<ProfileSync> {
  const profile = await getBotProfile();
  const theme = wantedTheme(client, profile?.override ?? null);
  const result: ProfileSync = { theme, avatar: 'unchanged', banner: 'unchanged', status: setThemeStatus(client, theme) };

  for (const part of ['avatar', 'banner'] as const) {
    if (!force && profile?.[`${part}Theme`] === theme) continue;
    try {
      // In a thread of its own, as it takes a few seconds, which the bot would otherwise spend not answering anyone
      const image = Buffer.from(await drawGif({ kind: part, theme }));
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

let overview: Promise<Uint8Array> | null = null;

/**
 * Every theme in one GIF, like `art/themes.gif`. Drawn in a thread of its own the first time, which takes a few seconds, and
 * kept after that, as the themes only change with a new version of the bot.
 */
export function themeOverview(): Promise<Uint8Array> {
  overview ??= drawGif({ kind: 'overview', themes: Object.keys(THEMES) as ThemeName[] }).catch((error: unknown) => {
    // Tried again next time
    overview = null;
    throw error;
  });
  return overview;
}
