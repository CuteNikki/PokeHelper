import {
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { Command } from 'classes/base/command';

import { getGuildLogs } from 'database/logs';

import { logSettings } from 'settings/logs';

import { buildConfirmation } from 'utility/confirm';
import { getTranslate } from 'utility/i18next';
import { createResponse, sendResponse } from 'utility/response';
import { settingsContext } from 'utility/settings';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setName('logs-config')
    .setDescription('Set up where messages, members and changes to the server are logged')
    .addSubcommand((cmd) => cmd.setName('settings').setDescription('Change the log channels, which events are logged, and what to leave out'))
    .addSubcommand((cmd) => cmd.setName('reset').setDescription('Reset the log settings of this server')),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    switch (interaction.options.getSubcommand()) {
      case 'settings':
        return handleSettings(interaction);
      case 'reset':
        return handleReset(interaction);
    }
  },
});

async function handleSettings(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  // Loading the panel can create the configuration, so defer in case that takes a moment
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  return sendResponse(interaction, await logSettings.render(settingsContext(interaction), t));
}

/** Remove the server's log settings after a confirmation. What was already logged stays in the channels. */
async function handleReset(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  if (!(await getGuildLogs(interaction.guildId))) return interaction.editReply(createResponse(t('logs.resetConfiguration.nothing'), 'info'));
  return interaction.editReply(
    buildConfirmation('logs-reset', {
      question: t('logs.resetConfiguration.confirm'),
      confirm: t('logs.resetConfiguration.confirmButton'),
      cancel: t('logs.resetConfiguration.cancelButton'),
    }),
  );
}
