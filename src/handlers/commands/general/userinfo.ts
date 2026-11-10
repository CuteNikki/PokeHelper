import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { getTranslate } from 'utility/i18next';
import { buildUserInfo } from 'utility/userInfo';

/** Someone's profile as this server knows it, which only who asked sees. */
export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setName('userinfo')
    .setDescription("See someone's account, when they joined, their roles and badges")
    .addUserOption((option) => option.setName('user').setDescription('Who to see. Defaults to yourself')),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);
    // Answered first, as asking Discord for them can take a moment
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const user = interaction.options.getUser('user') ?? interaction.user;
    return interaction.editReply(await buildUserInfo(interaction.guild, user.id, interaction.member, t));
  },
});
