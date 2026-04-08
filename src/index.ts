import { GatewayIntentBits, Partials } from 'discord.js';
import { t } from 'i18next';

import { ExtendedClient } from 'classes/base/client';

import { prisma } from 'database/index';

import { startBirthdayCron } from 'utility/birthday';
import { loadButtons } from 'utility/buttons';
import { loadCommands } from 'utility/commands';
import { loadEvents } from 'utility/events';
import { initI18Next } from 'utility/i18next';
import { measure } from 'utility/measure';

const client = new ExtendedClient({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions],
  partials: [Partials.Message, Partials.Reaction, Partials.User, Partials.GuildMember, Partials.Channel],
});

await initI18Next();
await Promise.all([
  measure(t('system.database.loaded'), () => prisma.$connect()),
  measure(t('system.event.loaded'), () => loadEvents(client)),
  measure(t('system.command.loaded'), () => loadCommands(client)),
  measure(t('system.button.loaded'), () => loadButtons(client)),
  measure(t('system.cron.loaded'), () => startBirthdayCron(client)),
]);

await client.login(process.env.DISCORD_TOKEN);
