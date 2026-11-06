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
import { exitAfterLogging, logger, table } from 'utility/logger';
import { measure } from 'utility/measure';
import { isRenameLimit } from 'utility/tempVoice/channel';

const client = new ExtendedClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    // Who joins and leaves voice channels, for temporary voice channels and the voice logs
    GatewayIntentBits.GuildVoiceStates,
    // For the logs: members joining, leaving and changing, which is privileged and has to be turned on in the developer portal,
    // bans and the audit log, emojis and stickers, and invites
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildExpressions,
    GatewayIntentBits.GuildInvites,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.User, Partials.GuildMember, Partials.Channel],
  // Renaming a channel too often is answered right away with a time to try again, instead of waiting minutes
  rest: { rejectOnRateLimit: isRenameLimit },
});

await initI18Next();

// Last line of defense: anything not caught elsewhere is logged here instead of going unnoticed
// Passed as err, so anything thrown is written out readably, also when it isn't an error
process.on('unhandledRejection', (reason) => logger.error({ err: reason }, t('system.process.unhandledRejection')));
process.on('uncaughtException', (error) => {
  // The process is in an unknown state after an uncaught exception, so exit and let the container restart it
  logger.fatal({ err: error }, t('system.process.uncaughtException'));
  exitAfterLogging(1);
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
