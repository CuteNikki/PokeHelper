import { existsSync, readFileSync } from 'node:fs';

import { Locale, type LocalizationMap } from 'discord.js';

import { FALLBACK_LANGUAGE, LOCALES_PATH, supportedLanguages } from 'utility/i18next';

/** One command's texts in another language, nested like its JSON: subcommands and options by English name, choices by value. */
export interface CommandTranslation {
  name?: string;
  description?: string;
  options?: Record<string, CommandTranslation>;
  choices?: Record<string, string>;
}

/** The part of a command's JSON that gets translated: commands, subcommand groups, subcommands and options. */
interface CommandNode {
  name: string;
  name_localizations?: LocalizationMap | null;
  description?: string;
  description_localizations?: LocalizationMap | null;
  options?: CommandNode[];
  choices?: { name: string; value: string | number; name_localizations?: LocalizationMap | null }[];
}

/** Command translations by language, then by command name. */
export type CommandTranslations = Record<string, Record<string, CommandTranslation>>;

/** The command translations of every language besides English, read from disk each time so registering picks up changes. */
export function loadCommandTranslations(): CommandTranslations {
  const translations: CommandTranslations = {};
  for (const language of supportedLanguages) {
    const path = `${LOCALES_PATH}/${language}/commands.json`;
    if (language === FALLBACK_LANGUAGE || !existsSync(path)) continue;
    translations[language] = JSON.parse(readFileSync(path, 'utf8')) as Record<string, CommandTranslation>;
  }
  return translations;
}

/** The Discord locales a language covers, like `de` for German and `pt-BR` for Portuguese. */
const discordLocalesOf = (language: string) => Object.values(Locale).filter((locale) => locale.split('-')[0] === language);

/** Add the translations to a command's JSON, in place. Interactions still use the English option names. */
export function localizeCommand<T extends CommandNode>(command: T, translations: CommandTranslations): T {
  const apply = (node: CommandNode, byLanguage: Record<string, CommandTranslation | undefined>) => {
    for (const [language, translation] of Object.entries(byLanguage)) {
      if (!translation) continue;
      for (const locale of discordLocalesOf(language)) {
        if (translation.name) node.name_localizations = { ...node.name_localizations, [locale]: translation.name };
        if (translation.description) node.description_localizations = { ...node.description_localizations, [locale]: translation.description };
        for (const choice of node.choices ?? []) {
          const name = translation.choices?.[String(choice.value)];
          if (name) choice.name_localizations = { ...choice.name_localizations, [locale]: name };
        }
      }
    }
    for (const option of node.options ?? []) {
      apply(option, Object.fromEntries(Object.entries(byLanguage).map(([language, translation]) => [language, translation?.options?.[option.name]])));
    }
  };

  apply(command, Object.fromEntries(Object.entries(translations).map(([language, commands]) => [language, commands[command.name]])));
  return command;
}
