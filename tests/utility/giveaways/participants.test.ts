import { describe, expect, test } from 'bun:test';

import { openParticipantsId, parseParticipantsId } from 'utility/giveaways/participants';

const id = 'cmh8x2k1p0000abcd1234efgh';

describe('custom IDs of the participants list', () => {
  test('the button on the post opens it', () => {
    expect(parseParticipantsId(openParticipantsId(id))).toEqual({ action: 'open', giveawayId: id });
  });

  test('page buttons carry the sort and page', () => {
    expect(parseParticipantsId(`gwp:list:${id}:most:3`)).toEqual({ action: 'list', state: { giveawayId: id, sort: 'most', page: 3 }, goto: false });
    expect(parseParticipantsId(`gwp:list:${id}:joined:0:goto`)).toEqual({ action: 'list', state: { giveawayId: id, sort: 'joined', page: 0 }, goto: true });
  });

  test('find me and the page popup carry the sort', () => {
    expect(parseParticipantsId(`gwp:me:${id}:fewest`)).toEqual({ action: 'me', giveawayId: id, sort: 'fewest' });
    expect(parseParticipantsId(`gwp:goto:${id}:newest`)).toEqual({ action: 'goto', giveawayId: id, sort: 'newest' });
  });

  test('anything else is outdated', () => {
    expect(parseParticipantsId(`gwp:list:${id}:random:1`)).toBeNull();
    expect(parseParticipantsId(`gwp:list:${id}:most:x`)).toBeNull();
    expect(parseParticipantsId('gwp:open:')).toBeNull();
    expect(parseParticipantsId(`gw:join:${id}`)).toBeNull();
  });

  test('stay within the 100 characters Discord allows', () => {
    expect(`gwp:list:${id}:fewest:99999:first`.length).toBeLessThanOrEqual(100);
  });
});
