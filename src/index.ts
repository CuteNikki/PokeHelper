import { GatewayIntentBits, Partials } from 'discord.js';
import { t } from 'i18next';

import { ExtendedClient } from 'classes/base/client';

import { prisma } from 'database/index';

import { loadButtons } from 'loading/buttons';
import { loadCommands } from 'loading/commands';
import { loadEvents } from 'loading/events';
import { loadFonts } from 'loading/fonts';
import { loadSelectMenus } from 'loading/selects';

import { initI18Next } from 'utility/i18next';
import { logger, table } from 'utility/logger';
import { measure } from 'utility/measure';

const client = new ExtendedClient({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions],
  partials: [Partials.Message, Partials.Reaction, Partials.User, Partials.GuildMember, Partials.Channel],
});

await initI18Next();

// Last line of defense: anything not caught elsewhere is logged here instead of going unnoticed
process.on('unhandledRejection', (reason) => logger.error(reason, t('system.process.unhandledRejection')));
process.on('uncaughtException', (error) => {
  // The process is in an unknown state after an uncaught exception, so exit and let the container restart it
  logger.fatal(error, t('system.process.uncaughtException'));
  process.exit(1);
});

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
  loadSelectMenus(client).then(({ files, tableData, duration, count }) =>
    logger.info(t('system.selectMenu.loaded', { count, duration: duration.toFixed(2), files: files.length }) + '\n' + table(tableData)),
  ),
  measure(t('system.fonts.loaded'), () => loadFonts()),
]);

await client.login(process.env.DISCORD_TOKEN);
