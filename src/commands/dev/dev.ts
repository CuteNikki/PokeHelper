import {
  ApplicationIntegrationType,
  ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { t } from 'i18next';

import type { ExtendedClient } from 'classes/base/client';
import { Command } from 'classes/base/command';

import { prisma } from 'database/index';

import { registerCommands } from 'utility/commandRegistration';
import { logger } from 'utility/logger';
import { changedSinceStart, reload, RELOAD_TARGETS, type ReloadTarget } from 'utility/reload';
import { createResponse } from 'utility/response';

export default new Command({
  devOnly: true,
  cooldown: 0,
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    // Hidden from everyone but administrators in the developer server, on top of the developer check
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setName('dev')
    .setDescription('Tools for the bot developers')
    .addSubcommand((cmd) =>
      cmd
        .setName('reload')
        .setDescription('Reload commands, buttons, selects, events and text without restarting')
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('What to reload. Defaults to everything')
            .addChoices({ name: 'everything', value: 'all' }, ...RELOAD_TARGETS.map((target) => ({ name: target, value: target }))),
        ),
    )
    .addSubcommand((cmd) => cmd.setName('register').setDescription('Reload the commands and register them with Discord'))
    .addSubcommand((cmd) => cmd.setName('restart').setDescription('Restart the bot, for changes a reload does not pick up')),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;

    switch (interaction.options.getSubcommand()) {
      case 'reload':
        return handleReload(interaction);
      case 'register':
        return handleRegister(interaction);
      case 'restart':
        return handleRestart(interaction);
    }
  },
});

async function handleReload(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const target = interaction.options.getString('target') ?? 'all';
  const targets = target === 'all' ? RELOAD_TARGETS : [target as ReloadTarget];
  const results = await reload(interaction.client as ExtendedClient, targets);
  const changed = await changedSinceStart();

  const lines = [
    t('dev.reload.title'),
    ...results.map((result) =>
      result.count === null
        ? t('dev.reload.locales', { duration: result.duration.toFixed(2) })
        : t('dev.reload.line', { target: result.target, count: result.count, duration: result.duration.toFixed(2) }),
    ),
    ...(changed.length > 0 ? ['', t('dev.reload.needsRestart', { files: changed.map((file) => `- \`${file}\``).join('\n') })] : []),
    t('dev.reload.registerHint'),
  ];
  return interaction.editReply(createResponse(lines.join('\n'), changed.length > 0 ? 'warning' : 'success'));
}

async function handleRegister(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  // Reload first, so the latest command definitions are the ones registered
  const client = interaction.client as ExtendedClient;
  await reload(client, ['commands']);
  const result = await registerCommands(interaction.client.rest, interaction.client.application.id, [...client.commands.values()], process.env.DEV_GUILD_ID);

  const lines = [
    t('dev.register.success', { count: result.global }),
    result.dev === null ? t('dev.register.devSkipped') : t('dev.register.dev', { count: result.dev }),
  ];
  return interaction.editReply(createResponse(lines.join('\n'), 'success'));
}

/**
 * Restart the bot, for changes to shared code that a reload doesn't pick up.
 * The bot shuts down cleanly and relies on something starting it again, like Docker with `restart: unless-stopped`.
 * Whatever happens while it's away is caught up on, like counting and scheduled jobs.
 */
async function handleRestart(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.reply({ ...createResponse(t('dev.restart.message'), 'warning'), flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
  logger.info(`Restarting, as asked by ${interaction.user.tag} (${interaction.user.id})`);

  await interaction.client.destroy();
  await prisma.$disconnect();
  process.exit(0);
}
