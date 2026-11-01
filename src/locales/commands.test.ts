import { describe, expect, test } from 'bun:test';

import type { Command } from 'classes/base/command';

import { loadCommandTranslations, localizeCommand, type CommandTranslation } from 'utility/commandLocalization';
import { getFilesFrom } from 'utility/files';

interface CommandNode {
  name: string;
  description?: string;
  options?: CommandNode[];
  choices?: { value: string | number }[];
}

const commands: CommandNode[] = [];
for (const file of await getFilesFrom('src/commands')) {
  const command = ((await import(file)) as { default: Command }).default;
  // Developer commands are only visible in the developer server, so they stay English
  if (!command.options.devOnly) commands.push(command.options.data.toJSON());
}

/** Every path that can have a translated description, like `counting user user`, and every choice, like `dev reload target [all]`. */
function commandPaths(node: CommandNode, prefix = ''): string[] {
  const path = `${prefix}${node.name}`;
  return [
    path,
    ...(node.choices ?? []).map((choice) => `${path} [${choice.value}]`),
    ...(node.options ?? []).flatMap((option) => commandPaths(option, `${path} `)),
  ];
}

/** Every translated text by the path it belongs to. */
function translatedPaths(name: string, translation: CommandTranslation, prefix = ''): Map<string, string> {
  const path = `${prefix}${name}`;
  const result = new Map<string, string>();
  if (translation.description) result.set(path, translation.description);
  for (const [value, text] of Object.entries(translation.choices ?? {})) result.set(`${path} [${value}]`, text);
  for (const [option, nested] of Object.entries(translation.options ?? {}))
    for (const entry of translatedPaths(option, nested, `${path} `)) result.set(...entry);
  return result;
}

const existing = new Set(commands.flatMap((command) => commandPaths(command)));

describe.each(Object.entries(loadCommandTranslations()))('%s command translations', (_language, translations) => {
  const translated = new Map(Object.entries(translations).flatMap(([name, translation]) => [...translatedPaths(name, translation)]));

  test('only translate commands and options that exist', () => {
    expect([...translated.keys()].filter((path) => !existing.has(path))).toEqual([]);
  });

  test('translate every command and option', () => {
    expect([...existing].filter((path) => !translated.has(path))).toEqual([]);
  });

  test('fit within the 100 characters Discord allows', () => {
    expect([...translated].filter(([, text]) => text.length > 100).map(([path]) => path)).toEqual([]);
  });
});

test('localizeCommand adds the descriptions and choice names for each language', () => {
  const command: Parameters<typeof localizeCommand>[0] = {
    name: 'demo',
    description: 'A demo',
    options: [{ name: 'mode', description: 'The mode', choices: [{ name: 'fast', value: 'fast' }] }],
  };

  localizeCommand(command, {
    de: { demo: { description: 'Eine Demo', options: { mode: { description: 'Der Modus', choices: { fast: 'schnell' } } } } },
  });

  expect(command).toEqual({
    name: 'demo',
    description: 'A demo',
    description_localizations: { de: 'Eine Demo' },
    options: [
      {
        name: 'mode',
        description: 'The mode',
        description_localizations: { de: 'Der Modus' },
        choices: [{ name: 'fast', value: 'fast', name_localizations: { de: 'schnell' } }],
      },
    ],
  });
});
