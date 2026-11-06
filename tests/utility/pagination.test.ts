import { beforeAll, expect, test } from 'bun:test';

import { getTranslate, initI18Next } from 'utility/i18next';
import { buildPageRow, clampPage } from 'utility/pagination';

beforeAll(() => initI18Next());

test('the page shown stays within the pages there are, also when the list shrank', () => {
  expect(clampPage(0, 0, 10)).toEqual({ page: 0, pages: 1 });
  expect(clampPage(0, 10, 10)).toEqual({ page: 0, pages: 1 });
  expect(clampPage(1, 11, 10)).toEqual({ page: 1, pages: 2 });
  expect(clampPage(7, 25, 10)).toEqual({ page: 2, pages: 3 });
  expect(clampPage(-1, 25, 10)).toEqual({ page: 0, pages: 3 });
});

const row = (page: number, pages: number, options?: { goto?: boolean; short?: boolean }) =>
  buildPageRow(page, pages, (button, target) => `${button}:${target}`, getTranslate('en'), options).components.map(
    (button) => button.toJSON() as { custom_id: string; disabled?: boolean },
  );

test('buttons that would go nowhere are disabled, and every custom ID is its own', () => {
  const first = row(0, 3);
  expect(first.map((button) => button.custom_id)).toEqual(['first:0', 'prev:-1', 'goto:0', 'next:1', 'last:2']);
  expect(first.map((button) => Boolean(button.disabled))).toEqual([true, true, false, false, false]);
  expect(row(2, 3).map((button) => Boolean(button.disabled))).toEqual([false, false, false, true, true]);
});

test('short rows only go back and forth, and the page can be only shown', () => {
  const short = row(1, 3, { short: true, goto: false });
  expect(short.map((button) => button.custom_id)).toEqual(['prev:0', 'goto:1', 'next:2']);
  expect(short[1]!.disabled).toBe(true);
});
