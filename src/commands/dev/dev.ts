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

import { registerCommands } from 'utility/commandRegistration';
import { reload, RELOAD_TARGETS, type ReloadTarget } from 'utility/reload';
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
    .addSubcommand((cmd) => cmd.setName('register').setDescription('Reload the commands and register them with Discord')),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;

    switch (interaction.options.getSubcommand()) {
      case 'reload':
        return handleReload(interaction);
      case 'register':
        return handleRegister(interaction);
    }
  },
});

async function handleReload(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const target = interaction.options.getString('target') ?? 'all';
  const targets = target === 'all' ? RELOAD_TARGETS : [target as ReloadTarget];
  const results = await reload(interaction.client as ExtendedClient, targets);

  const lines = [
    t('dev.reload.title'),
    ...results.map((result) =>
      result.count === null
        ? t('dev.reload.locales', { duration: result.duration.toFixed(2) })
        : t('dev.reload.line', { target: result.target, count: result.count, duration: result.duration.toFixed(2) }),
    ),
    t('dev.reload.note'),
  ];
  return interaction.editReply(createResponse(lines.join('\n'), 'success'));
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
