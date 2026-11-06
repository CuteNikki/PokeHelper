import { readdirSync } from 'node:fs';

import i18next, { use, type TFunction } from 'i18next';
import i18NextFsBackend from 'i18next-fs-backend';
import { logger } from 'utility/logger';

import { type Guild } from 'discord.js';

export const LOCALES_PATH = 'src/locales';
export const FALLBACK_LANGUAGE = 'en';
const nameSpaces = ['messages'];

/** The languages the bot has translations for, one folder each in src/locales. */
export const supportedLanguages = readdirSync(LOCALES_PATH, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

/** A translation function for one language. */
export type Translate = TFunction;

export async function initI18Next() {
  await use(i18NextFsBackend).init({
    debug: process.argv.includes('--debug'),
    ns: nameSpaces,
    defaultNS: nameSpaces[0],
    preload: supportedLanguages,
    // Keys that aren't translated yet use the English text
    fallbackLng: FALLBACK_LANGUAGE,
    interpolation: {
      escapeValue: false,
    },
    backend: {
      loadPath: `${LOCALES_PATH}/{{lng}}/{{ns}}.json`,
    },
    missingInterpolationHandler: (text, value) => {
      logger.error(`Missing interpolation for key: ${text}, value: ${value}`);
      return text;
    },
    missingKeyHandler: (lng, ns, key) => {
      logger.error(`Missing key: ${key} in language: ${lng.join(', ')}, namespace: ${ns}`);
    },
  });
}

/**
 * The supported language closest to a Discord locale: `de` for `de`, `en` for `en-US` and `en-GB`, `pt` for `pt-BR`,
 * and English for languages the bot doesn't have.
 * @param locale A Discord locale, like an interaction's or the server's preferred one.
 */
export function resolveLanguage(locale: string | null | undefined): string {
  if (!locale) return FALLBACK_LANGUAGE;
  if (supportedLanguages.includes(locale)) return locale;
  const base = locale.split('-')[0]!;
  return supportedLanguages.includes(base) ? base : FALLBACK_LANGUAGE;
}

/**
 * A translation function for a Discord locale.
 *
 * Use the interaction's locale for replies to interactions, so people get the bot in their own language,
 * and the server's preferred locale for messages that aren't replies, like counting warnings or announcements.
 * Logs are for developers and stay in English, through the global `t`.
 */
export const getTranslate = (locale: string | null | undefined): Translate => i18next.getFixedT(resolveLanguage(locale));

/** A translation function for a server's language, for messages everyone there sees, like announcements and logs. */
export const guildTranslate = (guild: Guild | null | undefined): Translate => getTranslate(guild?.preferredLocale);
