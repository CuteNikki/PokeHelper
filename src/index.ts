import { GatewayIntentBits, Partials } from 'discord.js';
import { t } from 'i18next';

import { ExtendedClient } from 'classes/base/client';

import { prisma } from 'database/index';

import { loadButtons } from 'loading/buttons';
import { loadCommands } from 'loading/commands';
import { loadEvents } from 'loading/events';

import { startBirthdayCron } from 'utility/birthday';
import { initI18Next } from 'utility/i18next';
import { logger, table } from 'utility/logger';
import { measure } from 'utility/measure';

const client = new ExtendedClient({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions],
  partials: [Partials.Message, Partials.Reaction, Partials.User, Partials.GuildMember, Partials.Channel],
});

await initI18Next();
await Promise.all([
  measure(t('system.database.loaded'), () => prisma.$connect()),
  loadEvents(client).then(({ files, tableData, duration }) =>
    logger.info(t('system.event.loaded', { count: files.length, duration: duration.toFixed(2) }) + '\n' + table(tableData)),
  ),
  loadCommands(client).then(({ files, tableData, duration, count }) =>
    logger.info(t('system.command.loaded', { count, duration: duration.toFixed(2), files: files.length }) + '\n' + table(tableData)),
  ),
  loadButtons(client).then(({ files, tableData, duration, count }) =>
    logger.info(t('system.button.loaded', { count, duration: duration.toFixed(2), files: files.length }) + '\n' + table(tableData)),
  ),
  measure(t('system.cron.loaded'), () => startBirthdayCron(client)),
]);

await client.login(process.env.DISCORD_TOKEN);
