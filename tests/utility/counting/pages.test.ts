import { expect, test } from 'bun:test';

import { pageOf, parseCountingPageId } from 'utility/counting/pages';
import { pageOfPosition } from 'utility/pagination';

test('page buttons carry their list and page, and the first and last ones say so', () => {
  expect(parseCountingPageId('countpage:leaderboard:2')).toEqual({ list: 'leaderboard', page: 2, action: 'page' });
  expect(parseCountingPageId('countpage:runs:0:first')).toEqual({ list: 'runs', page: 0, action: 'page' });
  expect(parseCountingPageId('countpage:runs:4:last')).toEqual({ list: 'runs', page: 4, action: 'page' });
  expect(parseCountingPageId('countpage:runs:3:goto')).toEqual({ list: 'runs', page: 3, action: 'goto' });
  expect(parseCountingPageId('countpage:leaderboard:1:me')).toEqual({ list: 'leaderboard', page: 1, action: 'me' });
  for (const id of ['countpage:other:1', 'countpage:runs:-1', 'countpage:runs:current', 'countpage:runs:1:middle']) expect(parseCountingPageId(id)).toBeNull();
});

test('the page shown stays within the pages there are', () => {
  expect(pageOf(0, 0)).toEqual({ page: 0, pages: 1 });
  expect(pageOf(0, 10)).toEqual({ page: 0, pages: 1 });
  expect(pageOf(1, 11)).toEqual({ page: 1, pages: 2 });
  expect(pageOf(7, 25)).toEqual({ page: 2, pages: 3 });
});

test('someone is found on the page their place is on', () => {
  expect(pageOfPosition(1, 10)).toBe(1);
  expect(pageOfPosition(10, 10)).toBe(1);
  expect(pageOfPosition(11, 10)).toBe(2);
  expect(pageOfPosition(26, 5)).toBe(6);
});
