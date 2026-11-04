import { beforeAll, describe, expect, test } from 'bun:test';

import { getTranslate, initI18Next } from 'utility/i18next';
import { markChanges } from 'utility/logs/diff';
import { transcriptFile } from 'utility/logs/files';
import { deletedText, editedText } from 'utility/logs/messages';
import { fitDetails } from 'utility/logs/send';

beforeAll(() => initI18Next());

describe('markChanges', () => {
  test('crosses out what was taken out and underlines what was added', () => {
    expect(markChanges('i founf the command', 'i found the command')).toEqual({ before: 'i ~~founf~~ the command', after: 'i __found__ the command' });
  });

  test('marks words next to each other together', () => {
    expect(markChanges('hello there friend', 'hello my dear friend').after).toBe('hello __my dear__ friend');
  });

  test("doesn't mark across lines, which Discord can't show", () => {
    expect(markChanges('a\nb', 'x\ny').after).toBe('__x__\n__y__');
  });
});

describe('long messages', () => {
  const t = () => getTranslate('en');
  const long = 'word '.repeat(800).trim();
  const manyLines = Array.from({ length: 40 }, (_, index) => `line ${index}`).join('\n');

  test('a short edit is marked and has no file', () => {
    const text = editedText('abc', 'abc123', '1', t());
    expect(text.files).toHaveLength(0);
    expect(text.details.join('\n')).toContain('__abc123__');
  });

  test('a long edit is shortened without marks, and is in a file in full', () => {
    const text = editedText(long, `${long}!`, '1', t());
    expect(text.files).toHaveLength(1);
    expect(text.details.join('\n')).not.toContain('~~');
    expect(text.details.join('\n\n').length).toBeLessThan(2_500);
  });

  test('a message of many lines counts as long, so its quote stays short', () => {
    expect(editedText(manyLines, `${manyLines}!`, '1', t()).files).toHaveLength(1);
    expect(deletedText(manyLines, '1', t()).details[0]!.split('\n').length).toBeLessThanOrEqual(16);
  });

  test('a long deleted message is in a file too', () => {
    expect(deletedText(long, '1', t()).files).toHaveLength(1);
    expect(deletedText('short', '1', t()).files).toHaveLength(0);
  });
});

test('fitDetails keeps what fits and cuts the rest, so an entry is never too long for Discord', () => {
  expect(fitDetails(['a'.repeat(50), 'b'.repeat(50)], 1_000)).toBe(`${'a'.repeat(50)}\n\n${'b'.repeat(50)}`);
  expect(fitDetails(['a'.repeat(500), 'b'.repeat(500)], 700)!.length).toBeLessThanOrEqual(700);
  expect(fitDetails([], 100)).toBeNull();
});

test('transcriptFile lists the messages oldest first, with who, when and what was attached', () => {
  const file = transcriptFile(
    [
      { createdAt: new Date('2026-11-04T21:05:00Z'), username: 'b', userId: '2', bot: false, content: 'second', attachments: [], stickers: [], embeds: 0 },
      {
        createdAt: new Date('2026-11-04T21:04:00Z'),
        username: 'a',
        userId: '1',
        bot: true,
        content: 'first\nline two',
        attachments: [{ name: 'cat.png', url: 'https://cdn/cat.png' }],
        stickers: [],
        embeds: 1,
      },
    ],
    'Heading',
    'file.txt',
  );
  const text = (file.attachment as Buffer).toString('utf8');
  expect(text.indexOf('first')).toBeLessThan(text.indexOf('second'));
  expect(text).toContain('[2026-11-04 21:04:00 UTC] a (1) [bot]');
  expect(text).toContain('    line two');
  expect(text).toContain('    Attachment: cat.png https://cdn/cat.png');
  expect(text).toContain('    1 embed');
});
