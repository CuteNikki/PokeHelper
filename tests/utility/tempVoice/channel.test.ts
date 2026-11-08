import { beforeAll, describe, expect, test } from 'bun:test';
import type { RateLimitData } from 'discord.js';

import { getTranslate, initI18Next } from 'utility/i18next';
import { announceChanges, channelLabel, channelName, describeChanges, isRenameLimit, maxLabelLength } from 'utility/tempVoice/channel';
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
  const base = { name: 'Nikki', userLimit: 0, namePrefix: '', locked: false, hidden: false, allowed: [], blocked: [], moderators: [] };
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

  test('says who became a moderator and who stopped being one', () => {
    expect(describeChanges(base, { ...base, moderators: ['3'] }, t())).toEqual(['made <@3> a moderator']);
    expect(describeChanges({ ...base, moderators: ['3'] }, base, t())).toEqual(['made <@3> not a moderator anymore']);
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

describe('announceChanges', () => {
  type Channel = Parameters<typeof announceChanges>[0];
  const base: Channel = { name: 'Nikki', userLimit: 0, namePrefix: '', locked: false, hidden: false, allowed: [], blocked: [], moderators: [] };
  const t = () => getTranslate('en');
  const title = () => String(t()('tempVoice.announce.title'));

  test('says nothing when nothing changed', () => {
    expect(announceChanges(base, base, '<@9>', t())).toBeNull();
  });

  test('one change is a sentence of its own, under the title', () => {
    const said = (after: Channel, before = base) => announceChanges(before, after, '<@9>', t());
    expect(said({ ...base, locked: true })).toBe(`${title()}\n<@9> locked the channel.`);
    expect(said(base, { ...base, hidden: true })).toBe(`${title()}\n<@9> made the channel visible again.`);
    expect(said({ ...base, userLimit: 99 })).toBe(`${title()}\n<@9> set the limit to 99 people.`);
    expect(said({ ...base, name: 'meowy' })).toBe(`${title()}\n<@9> renamed the channel to **meowy**.`);
    expect(said({ ...base, moderators: ['3', '4'] })).toBe(`${title()}\n<@9> made <@3>, <@4> moderators.`);
  });

  test('several changes at once are a list under the title and who made them', () => {
    expect(announceChanges(base, { ...base, allowed: ['1'], blocked: ['2'] }, '<@9>', t())).toBe(
      `${title()}\n<@9> made these changes:\n- let in <@1>\n- kept out <@2>`,
    );
  });

  test('every change has a sentence in every language', () => {
    for (const language of ['en', 'de']) {
      const translate = getTranslate(language);
      const changed = { ...base, name: 'x', userLimit: 2, locked: true, hidden: true, allowed: ['1'], blocked: ['2'], moderators: ['3'] };
      for (const line of [...describeChanges(base, changed, translate), ...describeChanges(changed, base, translate)]) expect(line).not.toContain('tempVoice.');
      const singles = [{ name: 'x' }, { userLimit: 2 }, { locked: true }, { hidden: true }, { allowed: ['1'] }, { blocked: ['2'] }, { moderators: ['3'] }];
      for (const change of singles) {
        expect(announceChanges(base, { ...base, ...change }, '<@9>', translate)).toStartWith(`${String(translate('tempVoice.announce.title'))}\n<@9>`);
        expect(announceChanges({ ...base, ...change }, base, '<@9>', translate)).not.toContain('tempVoice.');
      }
    }
  });
});
