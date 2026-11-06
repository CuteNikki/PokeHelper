import { bold, type ContainerBuilder, SeparatorBuilder, TextDisplayBuilder } from 'discord.js';

import { FALLBACK_LANGUAGE } from 'utility/i18next';

/** Text from the games, which has hard line breaks, and hyphens from breaking words in the old ones, joined into one line. */
export const cleanGameText = (text: string) =>
  text
    .replace(/\u00ad\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Texts in several languages, as PokéAPI has them, like Pokédex entries or an item's descriptions. */
type InLanguages<K extends string> = ({ language: { name: string } } & Record<K, string>)[];

/**
 * The newest of the texts in the language, or English, as the newest games' texts come last.
 * @param key Where the text is, like `flavor_text`.
 */
export function newestText<K extends string>(entries: InLanguages<K>, key: K, language: string): string | null {
  const newest = (lang: string) => entries.findLast((entry) => entry.language.name === lang)?.[key];
  const text = newest(language) ?? newest(FALLBACK_LANGUAGE);
  return text ? cleanGameText(text) : null;
}

/** The text in the language only, like an effect, which PokéAPI mostly has in English. Null when it isn't in the language. */
export function textIn<K extends string>(entries: InLanguages<K>, key: K, language: string): string | null {
  const text = entries.find((entry) => entry.language.name === language)?.[key];
  return text ? cleanGameText(text) : null;
}

/** A label on its own line with its text below, like an effect, which reads better than both on one line once it's long. */
export const labeled = (label: string, text: string) => `${bold(label)}\n${text}`;

/** Add parts of an answer to its container, each set apart by a line. Empty ones are left out. */
export function addBlocks(container: ContainerBuilder, blocks: (string | null | undefined | false)[]): ContainerBuilder {
  for (const block of blocks) {
    if (block) container.addSeparatorComponents(new SeparatorBuilder()).addTextDisplayComponents(new TextDisplayBuilder().setContent(block));
  }
  return container;
}

/** A name from PokéAPI's names in the language, or English. */
export const apiName = (names: { name: string; language: { name: string } }[], language: string) =>
  names.find((entry) => entry.language.name === language)?.name ?? names.find((entry) => entry.language.name === FALLBACK_LANGUAGE)?.name ?? null;
