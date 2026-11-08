import { readdirSync } from 'node:fs';

import i18next, { use, type TFunction } from 'i18next';
import i18NextFsBackend from 'i18next-fs-backend';
import { textIcons } from 'utility/icons';
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
      // Icons in the texts, like {{icon.trophy}}, which become the bot's own emojis once they're there
      defaultVariables: { icon: textIcons },
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

/** The supported language closest to a Discord locale, like `pt` for `pt-BR`, or English for languages the bot doesn't have. */
export function resolveLanguage(locale: string | null | undefined): string {
  if (!locale) return FALLBACK_LANGUAGE;
  if (supportedLanguages.includes(locale)) return locale;
  const base = locale.split('-')[0]!;
  return supportedLanguages.includes(base) ? base : FALLBACK_LANGUAGE;
}

/**
 * A translation function for a Discord locale. Use the interaction's locale for replies, and the server's for messages that aren't
 * replies. Developer logs stay in English through the global `t`.
 */
export const getTranslate = (locale: string | null | undefined): Translate => i18next.getFixedT(resolveLanguage(locale));

/** A translation function for a server's language, for messages everyone there sees, like announcements and logs. */
export const guildTranslate = (guild: Guild | null | undefined): Translate => getTranslate(guild?.preferredLocale);
