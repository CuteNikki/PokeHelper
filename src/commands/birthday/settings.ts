import {
  ApplicationIntegrationType,
  ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

import { Command } from 'classes/base/command';

import { deleteGuildBirthdayConfiguration, getGuildBirthdayConfiguration } from 'database/birthday';

import { birthdaySettings } from 'settings/birthday';

import { confirmAction } from 'utility/confirm';
import { getTranslate } from 'utility/i18next';
import { createResponse, sendResponse } from 'utility/response';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setName('birthday-config')
    .setDescription('Set up birthday announcements and the birthday role')
    .addSubcommand((cmd) => cmd.setName('settings').setDescription('Change the birthday announcement channel, role and more'))
    .addSubcommand((cmd) => cmd.setName('reset').setDescription('Reset the birthday settings of this server')),
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
  return sendResponse(interaction, await birthdaySettings.render(interaction.guild, t));
}

/**
 * Handle the reset subcommand, which removes the server's birthday settings after a confirmation. Members' birthdays are kept.
 * @param interaction {ChatInputCommandInteraction<CacheType>} The interaction object for the command.
 * @returns {Promise<unknown>} A promise that resolves when the reset is complete or cancelled.
 */
async function handleReset(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  if (!(await getGuildBirthdayConfiguration(interaction.guildId))) {
    return interaction.editReply(createResponse(t('birthday.resetConfiguration.nothing'), 'info'));
  }

  const confirmed = await confirmAction(interaction, {
    question: t('birthday.resetConfiguration.confirm'),
    confirm: t('birthday.resetConfiguration.confirmButton'),
    cancel: t('birthday.resetConfiguration.cancelButton'),
    cancelled: t('birthday.resetConfiguration.cancelled'),
  });
  if (!confirmed) return;

  await deleteGuildBirthdayConfiguration(interaction.guildId);
  return interaction.editReply(createResponse(t('birthday.resetConfiguration.success'), 'warning'));
}
