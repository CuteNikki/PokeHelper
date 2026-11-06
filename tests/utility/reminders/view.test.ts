import { beforeAll, expect, test } from 'bun:test';
import { TextDisplayBuilder, type ContainerBuilder } from 'discord.js';

import type { Reminder } from 'generated/prisma/client';
import { DiscordLimits } from 'utility/discordLimits';
import { getTranslate, initI18Next } from 'utility/i18next';
import { buildReminderList } from 'utility/reminders/view';

beforeAll(() => initI18Next());

const reminder = (index: number): Reminder => ({
  id: `reminder${index}`,
  userId: '1',
  text: 'A very long reminder text that goes on and on. '.repeat(25),
  dueAt: new Date('2026-12-24T17:00:00Z'),
  startAt: new Date('2026-12-24T17:00:00Z'),
  repeat: 'weekly',
  timezone: 'Europe/Berlin',
  delivery: 'channel',
  channelId: '2',
  guildId: '3',
  locale: 'de',
  createdAt: new Date(),
  updatedAt: new Date(),
});

test.each(['en', 'de'])('a full list of long reminders fits in a message (%s)', (language) => {
  const list = buildReminderList(
    Array.from({ length: 30 }, (_, index) => reminder(index)),
    getTranslate(language),
  );
  const container = list.components![0] as ContainerBuilder;
  const text = container.components
    .filter((component) => component instanceof TextDisplayBuilder)
    .reduce((sum, component) => sum + (component.data.content?.length ?? 0), 0);
  expect(text).toBeLessThanOrEqual(DiscordLimits.messageTextLength);
  // Builds without throwing, which it would with more than 25 options
  expect(() => (list.components![0] as ContainerBuilder).toJSON()).not.toThrow();
});
