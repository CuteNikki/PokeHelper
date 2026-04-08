import { GatewayIntentBits, Partials } from 'discord.js';

import { ExtendedClient } from 'classes/base/client';

import { prisma } from 'database/index';

import { loadButtons } from 'utility/buttons';
import { loadCommands } from 'utility/commands';
import { loadEvents } from 'utility/events';
import { measure } from 'utility/measure';

const client = new ExtendedClient({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions],
  partials: [Partials.Message, Partials.Reaction, Partials.User, Partials.GuildMember, Partials.Channel],
});

await Promise.all([
  measure('Database connected', () => prisma.$connect()),
  measure('Events loaded', () => loadEvents(client)),
  measure('Commands loaded', () => loadCommands(client)),
  measure('Buttons loaded', () => loadButtons(client)),
]);

await client.login(process.env.DISCORD_TOKEN);
