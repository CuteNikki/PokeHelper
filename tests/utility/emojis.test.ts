import { expect, test } from 'bun:test';

import { emojiName, MAX_EMOJI_NAME, wantedEmojis } from 'utility/emojis';

test("every emoji's name fits what Discord takes, fingerprint included", () => {
  const tooLong = [...wantedEmojis().keys()].map((key) => emojiName(key, Buffer.from('picture'))).filter((name) => name.length > MAX_EMOJI_NAME);
  expect(tooLong).toEqual([]);
});

test('only letters, numbers and underscores, as Discord wants', () => {
  for (const key of wantedEmojis().keys()) expect(emojiName(key, Buffer.from('picture'))).toMatch(/^\w+$/);
});

test('a changed picture gets a new name, and the same picture the same one', () => {
  expect(emojiName('txt_trophy', Buffer.from('a'))).toBe(emojiName('txt_trophy', Buffer.from('a')));
  expect(emojiName('txt_trophy', Buffer.from('a'))).not.toBe(emojiName('txt_trophy', Buffer.from('b')));
});
