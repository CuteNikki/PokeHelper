import { ApplicationCommandType, ApplicationIntegrationType, ContextMenuCommandBuilder, InteractionContextType } from 'discord.js';

import { Command } from 'classes/base/command';

import { buildFriendCodes } from 'utility/friendCodeView';
import { getTranslate } from 'utility/i18next';
import { sendResponse } from 'utility/response';

/** Someone's friend codes from the menu of their name, shown only to who asked. */
export default new Command<ApplicationCommandType.User>({
  data: new ContextMenuCommandBuilder()
    .setType(ApplicationCommandType.User)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setName('Friend codes'),

  async execute(interaction) {
    const t = getTranslate(interaction.locale);
    const member = interaction.inCachedGuild() ? interaction.targetMember : null;
    const self = interaction.targetId === interaction.user.id;
    return sendResponse(interaction, await buildFriendCodes(interaction.targetUser, member, self, t), { ephemeral: true });
  },
});
