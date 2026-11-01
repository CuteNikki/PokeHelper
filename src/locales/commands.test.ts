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

/** Every translated description and choice by the path it belongs to. */
function translatedPaths(name: string, translation: CommandTranslation, prefix = ''): Map<string, string> {
  const path = `${prefix}${name}`;
  const result = new Map<string, string>();
  if (translation.description) result.set(path, translation.description);
  for (const [value, text] of Object.entries(translation.choices ?? {})) result.set(`${path} [${value}]`, text);
  for (const [option, nested] of Object.entries(translation.options ?? {}))
    for (const entry of translatedPaths(option, nested, `${path} `)) result.set(...entry);
  return result;
}

/** The translated names of commands and options, grouped by what they're in, as Discord wants them to be different there. */
function nameGroups(nodes: CommandNode[], translations: Record<string, CommandTranslation> = {}, prefix = ''): { path: string; name?: string }[][] {
  const group = nodes.map((node) => ({ path: `${prefix}${node.name}`, name: translations[node.name]?.name }));
  return [group, ...nodes.flatMap((node) => nameGroups(node.options ?? [], translations[node.name]?.options, `${prefix}${node.name} `))];
}

// Lowercase letters, numbers, - and _, as Discord wants for slash command and option names
const validName = (name: string) => /^[-_\p{L}\p{N}]{1,32}$/u.test(name) && name === name.toLowerCase();

const existing = new Set(commands.flatMap((command) => commandPaths(command)));

describe.each(Object.entries(loadCommandTranslations()))('%s command translations', (_language, translations) => {
  const translated = new Map(Object.entries(translations).flatMap(([name, translation]) => [...translatedPaths(name, translation)]));

  test('only translate commands and options that exist', () => {
    expect([...translated.keys()].filter((path) => !existing.has(path))).toEqual([]);
  });

  test('translate every command and option', () => {
    expect([...existing].filter((path) => !translated.has(path))).toEqual([]);
  });

  const names = nameGroups(commands, translations);

  test('name every command and option', () => {
    expect(
      names
        .flat()
        .filter((entry) => !entry.name)
        .map((entry) => entry.path),
    ).toEqual([]);
  });

  test('use names Discord allows', () => {
    expect(names.flat().filter((entry) => entry.name && !validName(entry.name))).toEqual([]);
  });

  test('give commands and options next to each other different names', () => {
    const duplicates = names.flatMap((group) => group.filter((entry, index) => entry.name && group.findIndex((other) => other.name === entry.name) !== index));
    expect(duplicates).toEqual([]);
  });

  test('fit within the 100 characters Discord allows', () => {
    expect([...translated].filter(([, text]) => text.length > 100).map(([path]) => path)).toEqual([]);
  });
});

test('localizeCommand adds the names, descriptions and choice names for each language', () => {
  const command: Parameters<typeof localizeCommand>[0] = {
    name: 'demo',
    description: 'A demo',
    options: [{ name: 'mode', description: 'The mode', choices: [{ name: 'fast', value: 'fast' }] }],
  };

  localizeCommand(command, {
    de: { demo: { name: 'demo', description: 'Eine Demo', options: { mode: { name: 'modus', description: 'Der Modus', choices: { fast: 'schnell' } } } } },
  });

  expect(command).toEqual({
    name: 'demo',
    name_localizations: { de: 'demo' },
    description: 'A demo',
    description_localizations: { de: 'Eine Demo' },
    options: [
      {
        name: 'mode',
        name_localizations: { de: 'modus' },
        description: 'The mode',
        description_localizations: { de: 'Der Modus' },
        choices: [{ name: 'fast', value: 'fast', name_localizations: { de: 'schnell' } }],
      },
    ],
  });
});
