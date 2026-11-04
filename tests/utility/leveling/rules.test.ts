import { describe, expect, test } from 'bun:test';

import { applyMultiplier, earnsXp, getEarnedRewardRoles, getMultiplier, isWeeklyResetDue, startOfWeek } from 'utility/leveling/rules';

const noFilters = { ignoredChannels: [], enabledChannels: [], ignoredRoles: [], enabledRoles: [] };
// A thread in #general, which is in the Chat category
const inThread = { channelIds: ['thread', 'general', 'chat-category'], roleIds: ['member'] };

describe('earnsXp', () => {
  test('without filters everything earns XP', () => {
    expect(earnsXp(noFilters, inThread)).toBe(true);
  });

  test('ignoring a channel also ignores its threads, and ignoring a category its channels', () => {
    expect(earnsXp({ ...noFilters, ignoredChannels: ['general'] }, inThread)).toBe(false);
    expect(earnsXp({ ...noFilters, ignoredChannels: ['chat-category'] }, inThread)).toBe(false);
    expect(earnsXp({ ...noFilters, ignoredChannels: ['other'] }, inThread)).toBe(true);
  });

  test("only-these channels include their threads and a category's channels", () => {
    expect(earnsXp({ ...noFilters, enabledChannels: ['general'] }, inThread)).toBe(true);
    expect(earnsXp({ ...noFilters, enabledChannels: ['chat-category'] }, inThread)).toBe(true);
    expect(earnsXp({ ...noFilters, enabledChannels: ['other'] }, inThread)).toBe(false);
  });

  test('ignored roles win over only-these roles', () => {
    expect(earnsXp({ ...noFilters, ignoredRoles: ['member'] }, inThread)).toBe(false);
    expect(earnsXp({ ...noFilters, enabledRoles: ['member'] }, inThread)).toBe(true);
    expect(earnsXp({ ...noFilters, enabledRoles: ['vip'] }, inThread)).toBe(false);
    expect(earnsXp({ ...noFilters, enabledRoles: ['member'], ignoredRoles: ['member'] }, inThread)).toBe(false);
  });
});

describe('getMultiplier', () => {
  test('is 1 without any that apply', () => {
    expect(getMultiplier([{ targetId: 'other', multiplier: 3 }], inThread)).toBe(1);
  });

  test('takes the highest one and never stacks', () => {
    const multipliers = [
      { targetId: 'member', multiplier: 2 },
      { targetId: 'general', multiplier: 3 },
      { targetId: 'chat-category', multiplier: 1.5 },
    ];
    expect(getMultiplier(multipliers, inThread)).toBe(3);
  });

  test('a lower multiplier only applies when nothing higher does', () => {
    expect(getMultiplier([{ targetId: 'general', multiplier: 0.5 }], inThread)).toBe(0.5);
    expect(
      getMultiplier(
        [
          { targetId: 'general', multiplier: 0.5 },
          { targetId: 'member', multiplier: 2 },
        ],
        inThread,
      ),
    ).toBe(2);
  });
});

test('XP is rounded after multiplying', () => {
  expect(applyMultiplier(15, 1.5)).toBe(23);
  expect(applyMultiplier(25, 0.5)).toBe(13);
});

test('every reward up to the level is earned', () => {
  const rewards = [
    { level: 5, roleId: 'five' },
    { level: 10, roleId: 'ten' },
    { level: 20, roleId: 'twenty' },
  ];
  expect(getEarnedRewardRoles(rewards, 10)).toEqual(['five', 'ten']);
  expect(getEarnedRewardRoles(rewards, 4)).toEqual([]);
});

describe('the weekly reset', () => {
  test('weeks start on Monday 00:00 UTC', () => {
    expect(startOfWeek(new Date('2026-11-04T15:00:00Z'))).toEqual(new Date('2026-11-02T00:00:00Z'));
    expect(startOfWeek(new Date('2026-11-08T23:59:00Z'))).toEqual(new Date('2026-11-02T00:00:00Z'));
    expect(startOfWeek(new Date('2026-11-09T00:00:00Z'))).toEqual(new Date('2026-11-09T00:00:00Z'));
  });

  test('is due once a new week started, also when the bot was offline at Monday 00:00', () => {
    const wednesday = new Date('2026-11-04T15:00:00Z');
    expect(isWeeklyResetDue(new Date('2026-11-02T00:00:05Z'), new Date('2026-01-01'), wednesday)).toBe(false);
    expect(isWeeklyResetDue(new Date('2026-10-26T00:00:05Z'), new Date('2026-01-01'), wednesday)).toBe(true);
  });

  test('without a reset yet, counts from when leveling was set up', () => {
    const wednesday = new Date('2026-11-04T15:00:00Z');
    expect(isWeeklyResetDue(null, new Date('2026-11-03T10:00:00Z'), wednesday)).toBe(false);
    expect(isWeeklyResetDue(null, new Date('2026-10-20T10:00:00Z'), wednesday)).toBe(true);
  });
});
