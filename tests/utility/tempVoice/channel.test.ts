import { beforeAll, describe, expect, test } from 'bun:test';
import type { RateLimitData } from 'discord.js';

import { getTranslate, initI18Next } from 'utility/i18next';
import { channelLabel, channelName, describeChanges, isRenameLimit, maxLabelLength } from 'utility/tempVoice/channel';
import { parseTempVoiceCustomId, tempVoiceCustomId } from 'utility/tempVoice/panel';

beforeAll(() => initI18Next());

describe('channel names', () => {
  test('start with the join channel prefix, and the label is what comes after it', () => {
    expect(channelName('🔊︱', 'Nikki')).toBe('🔊︱Nikki');
    expect(channelLabel('🔊︱', '🔊︱Nikki')).toBe('Nikki');
  });

  test('a prefix typed again by the owner is taken off', () => {
    expect(channelLabel('🔊︱', '🔊︱🔊︱ Gaming ')).toBe('Gaming');
  });

  test('without a prefix, the name is the label', () => {
    expect(channelName('', 'Gaming')).toBe('Gaming');
    expect(channelLabel('', ' Gaming ')).toBe('Gaming');
  });

  test("stay within Discord's 100 characters", () => {
    expect(channelName('🔊︱', 'x'.repeat(200))).toHaveLength(100);
    expect(maxLabelLength('🔊︱')).toBe(100 - '🔊︱'.length);
  });
});

describe('describeChanges', () => {
  const base = { name: 'Nikki', userLimit: 0, namePrefix: '', locked: false, hidden: false, allowed: [], blocked: [] };
  const t = () => getTranslate('en');

  test('says nothing when nothing changed', () => {
    expect(describeChanges(base, base, t())).toEqual([]);
  });

  test('says each thing that changed', () => {
    const changes = describeChanges(base, { ...base, name: 'Gaming', userLimit: 5, locked: true, hidden: true }, t());
    expect(changes).toEqual(['renamed it to **Gaming**', 'set the limit to 5 people', 'locked it', 'hid it']);
  });

  test('moving someone from one list to the other is said once, as where they went', () => {
    const changes = describeChanges({ ...base, allowed: ['1'] }, { ...base, blocked: ['1'] }, t());
    expect(changes).toEqual(['kept out <@1>']);
  });

  test('taking someone off a list is said too', () => {
    expect(describeChanges({ ...base, allowed: ['1'] }, base, t())).toEqual(['stopped letting in <@1>']);
    expect(describeChanges({ ...base, blocked: ['2'] }, base, t())).toEqual(['stopped keeping out <@2>']);
  });
});

describe('custom IDs', () => {
  test('lead back to the action, channel and member they were made with', () => {
    expect(parseTempVoiceCustomId(tempVoiceCustomId('lock', '123'))).toEqual({ action: 'lock', channelId: '123', memberId: null });
    expect(parseTempVoiceCustomId(tempVoiceCustomId('kick', '123', '456'))).toEqual({ action: 'kick', channelId: '123', memberId: '456' });
  });

  test("other or broken custom IDs aren't taken", () => {
    expect(parseTempVoiceCustomId('tempvoice:explode:123')).toBeNull();
    expect(parseTempVoiceCustomId('tempvoice:lock')).toBeNull();
    expect(parseTempVoiceCustomId('voicecfg:list')).toBeNull();
  });
});

describe('isRenameLimit', () => {
  const limit = (method: string, route: string, timeToReset: number) => ({ method, route, timeToReset }) as RateLimitData;

  test('only answers right away for a long wait on editing a channel', () => {
    expect(isRenameLimit(limit('PATCH', '/channels/123', 300_000))).toBe(true);
    expect(isRenameLimit(limit('PATCH', '/channels/123', 1_000))).toBe(false);
  });

  test('waits as usual for messages in a channel, and anything else', () => {
    expect(isRenameLimit(limit('PATCH', '/channels/123/messages/:id', 300_000))).toBe(false);
    expect(isRenameLimit(limit('POST', '/channels/123', 300_000))).toBe(false);
  });
});
