import { describe, expect, test } from 'bun:test';

import { checkRules, countEntries, hasRules, type GiveawayRules, type Participant } from 'utility/giveaways/rules';

const now = new Date('2026-11-08T12:00:00Z');
const noRules: GiveawayRules = {
  requiredRoleIds: [],
  requireAllRoles: false,
  blockedRoleIds: [],
  minLevel: null,
  minMemberMinutes: null,
  minAccountMinutes: null,
};
const member: Participant = {
  bot: false,
  roleIds: ['a', 'b'],
  joinedAt: new Date('2026-11-01T12:00:00Z'),
  createdAt: new Date('2025-01-01T00:00:00Z'),
  level: 5,
};

describe('who can enter a giveaway', () => {
  test('anyone without rules, but never bots', () => {
    expect(hasRules(noRules)).toBe(false);
    expect(checkRules(noRules, member, now)).toEqual([]);
    expect(checkRules(noRules, { ...member, bot: true }, now)).toEqual([{ rule: 'bot' }]);
  });

  test('blocked roles keep out, and say which ones they have', () => {
    expect(checkRules({ ...noRules, blockedRoleIds: ['b', 'c'] }, member, now)).toEqual([{ rule: 'blocked', roleIds: ['b'] }]);
  });

  test('any one required role is enough', () => {
    const rules = { ...noRules, requiredRoleIds: ['b', 'c'] };
    expect(checkRules(rules, member, now)).toEqual([]);
    expect(checkRules(rules, { ...member, roleIds: [] }, now)).toEqual([{ rule: 'required', roleIds: ['b', 'c'], all: false }]);
  });

  test('all required roles, when asked, says the missing ones', () => {
    const rules = { ...noRules, requiredRoleIds: ['a', 'c', 'd'], requireAllRoles: true };
    expect(checkRules(rules, member, now)).toEqual([{ rule: 'required', roleIds: ['c', 'd'], all: true }]);
    expect(checkRules(rules, { ...member, roleIds: ['a', 'c', 'd'] }, now)).toEqual([]);
  });

  test('a level', () => {
    expect(checkRules({ ...noRules, minLevel: 5 }, member, now)).toEqual([]);
    expect(checkRules({ ...noRules, minLevel: 6 }, member, now)).toEqual([{ rule: 'level', level: 6 }]);
  });

  test('time on the server says from when', () => {
    expect(checkRules({ ...noRules, minMemberMinutes: 7 * 24 * 60 }, member, now)).toEqual([]);
    expect(checkRules({ ...noRules, minMemberMinutes: 8 * 24 * 60 }, member, now)).toEqual([{ rule: 'memberAge', from: new Date('2026-11-09T12:00:00Z') }]);
    // Not knowing when they joined doesn't let them in
    expect(checkRules({ ...noRules, minMemberMinutes: 1 }, { ...member, joinedAt: null }, now)).toEqual([{ rule: 'memberAge', from: null }]);
  });

  test('account age says from when', () => {
    const young = { ...member, createdAt: new Date('2026-11-08T11:00:00Z') };
    expect(checkRules({ ...noRules, minAccountMinutes: 60 }, young, now)).toEqual([]);
    expect(checkRules({ ...noRules, minAccountMinutes: 120 }, young, now)).toEqual([{ rule: 'accountAge', from: new Date('2026-11-08T13:00:00Z') }]);
  });

  test('says every rule that is not met at once', () => {
    const rules = { ...noRules, blockedRoleIds: ['a'], minLevel: 10 };
    expect(checkRules(rules, member, now).map((problem) => problem.rule)).toEqual(['blocked', 'level']);
  });
});

describe('entries', () => {
  test('1, plus the bonus of every bonus role someone has', () => {
    const bonusRoles = [
      { roleId: 'a', bonus: 2 },
      { roleId: 'b', bonus: 3 },
      { roleId: 'c', bonus: 5 },
    ];
    expect(countEntries([], bonusRoles)).toBe(1);
    expect(countEntries(['a'], bonusRoles)).toBe(3);
    expect(countEntries(['a', 'b'], bonusRoles)).toBe(6);
  });
});
