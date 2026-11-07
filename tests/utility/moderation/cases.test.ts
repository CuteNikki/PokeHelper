import { describe, expect, test } from 'bun:test';

import { listId, parseCasesId } from 'utility/moderation/cases';

const userId = '123456789012345678';
const state = { userId, sort: 'newest' as const, page: 2 };

describe('case history custom IDs', () => {
  test('pages lead back to where they were', () => {
    expect(parseCasesId(listId(state))).toEqual({ action: 'list', state, goto: false });
    expect(parseCasesId(listId(state, 'first'))).toEqual({ action: 'list', state, goto: false });
    expect(parseCasesId(listId(state, 'goto'))).toEqual({ action: 'list', state, goto: true });
  });

  test('the page popup', () => {
    expect(parseCasesId(`cases:goto:${userId}:type`)).toEqual({ action: 'goto', userId, sort: 'type' });
  });

  test("aren't anything else", () => {
    expect(parseCasesId('cases:list:nope:newest:0')).toBeNull();
    expect(parseCasesId(`cases:list:${userId}:sideways:0`)).toBeNull();
    expect(parseCasesId(`cases:list:${userId}:newest:0:extra`)).toBeNull();
    expect(parseCasesId(`cases:explode:${userId}`)).toBeNull();
    expect(parseCasesId(`sticky:${userId}`)).toBeNull();
  });
});
