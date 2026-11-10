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

  test("a case's buttons carry the case and the page they came from", () => {
    expect(parseCasesId(`cases:view:abc123:${userId}:type:0`)).toEqual({ action: 'view', caseId: 'abc123', state: { userId, sort: 'type', page: 0 } });
    expect(parseCasesId(`cases:deleteYes:abc123:${userId}:oldest:4`)).toEqual({
      action: 'deleteYes',
      caseId: 'abc123',
      state: { userId, sort: 'oldest', page: 4 },
    });
  });

  test('the selects and the page popup', () => {
    expect(parseCasesId(`cases:sort:${userId}`)).toEqual({ action: 'sort', userId });
    expect(parseCasesId(`cases:pick:${userId}:newest:2`)).toEqual({ action: 'pick', state });
    expect(parseCasesId(`cases:goto:${userId}:type`)).toEqual({ action: 'goto', userId, sort: 'type' });
  });

  test('keep that they came from the moderation panel', () => {
    const fromPanel = { ...state, panel: true as const };
    expect(parseCasesId(listId(fromPanel))).toEqual({ action: 'list', state: fromPanel, goto: false });
    expect(parseCasesId(listId(fromPanel, 'goto'))).toEqual({ action: 'list', state: fromPanel, goto: true });
    expect(parseCasesId(`cases:view:abc123:${userId}:newest:2:p`)).toEqual({ action: 'view', caseId: 'abc123', state: fromPanel });
    expect(parseCasesId(`cases:sort:${userId}:p`)).toEqual({ action: 'sort', userId, panel: true });
    expect(parseCasesId(`cases:goto:${userId}:type:p`)).toEqual({ action: 'goto', userId, sort: 'type', panel: true });
    expect(parseCasesId(listId(state))).not.toHaveProperty('state.panel');
  });

  test("aren't anything else", () => {
    expect(parseCasesId('cases:list:nope:newest:0')).toBeNull();
    expect(parseCasesId(`cases:list:${userId}:sideways:0`)).toBeNull();
    expect(parseCasesId(`cases:list:${userId}:newest:0:extra`)).toBeNull();
    expect(parseCasesId(`cases:explode:${userId}`)).toBeNull();
    expect(parseCasesId(`sticky:${userId}`)).toBeNull();
  });
});
