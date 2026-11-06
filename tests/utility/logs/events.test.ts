import { beforeAll, describe, expect, test } from 'bun:test';

import type { GuildLogs } from 'database/logs';

import { getTranslate, initI18Next } from 'utility/i18next';
import { groupOf, LOG_EVENTS, LOG_GROUPS, logChannelOf } from 'utility/logs/events';
import { isLogChannel, quoteText } from 'utility/logs/send';

beforeAll(() => initI18Next());

const config = (changes: Partial<GuildLogs> = {}): GuildLogs => ({
  guildId: '1',
  enabled: true,
  defaultChannelId: null,
  messagesChannelId: '10',
  membersChannelId: null,
  moderationChannelId: '10',
  serverChannelId: null,
  voiceChannelId: null,
  disabledEvents: [],
  ignoredChannelIds: [],
  ignoredRoleIds: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...changes,
});

describe('logChannelOf', () => {
  test("logs an event in its group's channel", () => {
    expect(logChannelOf(config(), 'messageDeleted')).toBe('10');
    expect(logChannelOf(config(), 'memberBanned')).toBe('10');
  });

  test("doesn't log a group without a channel", () => {
    expect(logChannelOf(config(), 'memberJoined')).toBeNull();
  });

  test('logs a group without its own channel in the default one, and one with its own channel there', () => {
    expect(logChannelOf(config({ defaultChannelId: '20' }), 'memberJoined')).toBe('20');
    expect(logChannelOf(config({ defaultChannelId: '20' }), 'messageDeleted')).toBe('10');
  });

  test("doesn't log an event that's turned off, or anything when logs are off", () => {
    expect(logChannelOf(config({ disabledEvents: ['messageDeleted'] }), 'messageDeleted')).toBeNull();
    expect(logChannelOf(config({ disabledEvents: ['messageDeleted'] }), 'messageEdited')).toBe('10');
    expect(logChannelOf(config({ enabled: false }), 'messageEdited')).toBeNull();
  });
});

test('every event is in exactly one group, and has texts for its switch', () => {
  const t = getTranslate('en');
  const events = LOG_GROUPS.flatMap((group) => [...LOG_EVENTS[group]]);
  expect(new Set(events).size).toBe(events.length);
  for (const event of events) {
    expect(LOG_GROUPS).toContain(groupOf(event));
    expect(t(`logs.settings.events.${event}.label`)).not.toContain('logs.settings');
  }
});

test("a log channel's own messages aren't logged", () => {
  expect(isLogChannel(config(), '10')).toBe(true);
  expect(isLogChannel(config(), '11')).toBe(false);
  expect(isLogChannel(config({ defaultChannelId: '20' }), '20')).toBe(true);
});

test('texts are quoted line by line', () => {
  expect(quoteText('one\ntwo')).toBe('> one\n> two');
});
