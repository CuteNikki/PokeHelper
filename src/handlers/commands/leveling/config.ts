import {
  ApplicationIntegrationType,
  ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

import { Command } from 'classes/base/command';

import { getGuildLevelingConfiguration } from 'database/leveling';

import { levelingSettings } from 'settings/leveling';

import { buildConfirmation } from 'utility/confirm';
import { getTranslate } from 'utility/i18next';
import { createResponse, sendResponse } from 'utility/response';
import { settingsContext } from 'utility/settings';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setName('leveling-config')
    .setDescription('Set up and configure leveling')
    .addSubcommand((cmd) => cmd.setName('settings').setDescription('Change the leveling settings, rewards and multipliers'))
    .addSubcommand((cmd) => cmd.setName('reset').setDescription('Reset the leveling settings, rewards and multipliers')),
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

/**
 * Handle the settings subcommand, which shows the interactive settings panel.
 * @param interaction {ChatInputCommandInteraction<CacheType>} The interaction object for the command.
 * @returns {Promise<unknown>} A promise that resolves when the panel is shown.
 */
async function handleSettings(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  // Loading the panel can create the configuration, so defer in case that takes a moment
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  return sendResponse(interaction, await levelingSettings.render(settingsContext(interaction), t));
}

/**
 * Handle the reset subcommand, which removes the settings, rewards and multipliers after a confirmation. Everyone's XP is kept.
 * @param interaction {ChatInputCommandInteraction<CacheType>} The interaction object for the command.
 * @returns {Promise<unknown>} A promise that resolves when the reset is complete or cancelled.
 */
async function handleReset(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  if (!(await getGuildLevelingConfiguration(interaction.guildId))) {
    return interaction.editReply(createResponse(t('leveling.resetConfiguration.nothing'), 'info'));
  }

  // The confirm button resets, whenever it's clicked
  return interaction.editReply(
    buildConfirmation('leveling-reset', {
      question: t('leveling.resetConfiguration.confirm'),
      confirm: t('leveling.resetConfiguration.confirmButton'),
      cancel: t('leveling.resetConfiguration.cancelButton'),
    }),
  );
}
