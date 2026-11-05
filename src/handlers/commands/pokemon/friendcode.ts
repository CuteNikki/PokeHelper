import { ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { friendCodeSettings } from 'settings/friendCodes';

import { buildFriendCodes } from 'utility/friendCodeView';
import { getTranslate } from 'utility/i18next';
import { sendResponse } from 'utility/response';
import { settingsContext } from 'utility/settings';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setName('friendcode')
    .setDescription('Share your friend codes for the Switch and Pokémon games')
    .addSubcommand((cmd) => cmd.setName('set').setDescription('Add or change your friend codes'))
    .addSubcommand((cmd) =>
      cmd
        .setName('view')
        .setDescription("Show your friend codes or someone else's")
        .addUserOption((option) => option.setName('user').setDescription('Whose friend codes to show. Defaults to yourself.').setRequired(false))
        .addBooleanOption((option) => option.setName('ephemeral').setDescription('Whether only you see the answer. Defaults to false.').setRequired(false)),
    ),

  async execute(interaction) {
    switch (interaction.options.getSubcommand()) {
      case 'set':
        return handleSet(interaction);
      case 'view':
        return handleView(interaction);
    }
  },
});

/** Your own codes in a panel, which only you see, so it's in your language. */
async function handleSet(interaction: ChatInputCommandInteraction) {
  const t = getTranslate(interaction.locale);
  return sendResponse(interaction, await friendCodeSettings.render(settingsContext(interaction), t), { ephemeral: true });
}

/** Someone's codes, sent in the chat to share them unless asked otherwise. */
async function handleView(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser('user') ?? interaction.user;
  const ephemeral = interaction.options.getBoolean('ephemeral') ?? false;
  const t = getTranslate(interaction.locale);
  const member = interaction.inCachedGuild() ? (interaction.options.getMember('user') ?? (user.id === interaction.user.id ? interaction.member : null)) : null;
  return sendResponse(interaction, await buildFriendCodes(user, member, user.id === interaction.user.id, t), { ephemeral });
}
