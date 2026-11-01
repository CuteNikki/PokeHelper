import {
  ApplicationIntegrationType,
  channelMention,
  ChannelType,
  ChatInputCommandInteraction,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

import { Command } from 'classes/base/command';

import { countRoleMenus, createRoleMenu, getRoleMenu, getRoleMenus } from 'database/roleMenu';

import { getRoleMenuSettings, MAX_NAME_LENGTH, renderRoleMenuList, roleMenuName } from 'settings/roleMenu';

import { getTranslate } from 'utility/i18next';
import { createResponse, sendResponse } from 'utility/response';
import { MAX_ROLE_MENUS, ROLE_MENU_CHANNEL_PERMISSIONS } from 'utility/roleMenu';
import { formatPermissions, missingBotPermissions } from 'utility/settings';

/** Discord shows at most 25 autocomplete choices. */
const MAX_CHOICES = 25;

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setName('role-menu-config')
    .setDescription('Set up the menus members pick their roles from')
    .addSubcommand((cmd) =>
      cmd
        .setName('create')
        .setDescription('Create a role menu')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('The channel the menu is posted in')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('What the menu is called in your list of menus, only shown to admins')
            .setMaxLength(MAX_NAME_LENGTH)
            .setRequired(true),
        ),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName('settings')
        .setDescription('Change a role menu, or see them all')
        .addStringOption((option) => option.setName('menu').setDescription('The menu to change. Leave it out to see them all').setAutocomplete(true)),
    ),

  async autocomplete(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);
    const search = interaction.options.getFocused().toLowerCase();

    const menus = await getRoleMenus(interaction.guildId);
    const choices = menus
      .map((menu) => ({ name: roleMenuName(menu, interaction.guild, t).slice(0, 100), value: menu.id }))
      .filter((choice) => choice.name.toLowerCase().includes(search));
    await interaction.respond(choices.slice(0, MAX_CHOICES));
  },

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;

    switch (interaction.options.getSubcommand()) {
      case 'create':
        return handleCreate(interaction);
      case 'settings':
        return handleSettings(interaction);
    }
  },
});

/** Create a menu and show its settings, where its roles are added. It's posted once it has a role. */
async function handleCreate(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const channel = interaction.options.getChannel('channel', true, [ChannelType.GuildText, ChannelType.GuildAnnouncement]);

  if ((await countRoleMenus(interaction.guildId)) >= MAX_ROLE_MENUS) {
    return sendResponse(interaction, createResponse(t('roleMenu.create.maximum', { max: MAX_ROLE_MENUS }), 'error'), { ephemeral: true });
  }

  // The option lists the channels the user can see, which may include ones the bot can't post in
  const missing = missingBotPermissions(interaction.guild, channel.id, ROLE_MENU_CHANNEL_PERMISSIONS);
  if (missing.length > 0) {
    return sendResponse(
      interaction,
      createResponse(t('settings.channel.botPermissionsRefused', { channel: channelMention(channel.id), permissions: formatPermissions(missing, t) }), 'error'),
      { ephemeral: true },
    );
  }

  const menu = await createRoleMenu(interaction.guildId, channel.id, interaction.options.getString('name', true).trim());
  return sendResponse(interaction, await getRoleMenuSettings(menu.id).render(interaction.guild, t), { ephemeral: true });
}

/** Show the settings of a menu, or the list of all menus to pick one from. */
async function handleSettings(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const menuId = interaction.options.getString('menu');
  if (!menuId) return sendResponse(interaction, await renderRoleMenuList(interaction.guild, t), { ephemeral: true });

  // What's typed doesn't have to be one of the suggestions
  const menu = await getRoleMenu(menuId);
  if (menu?.guildId !== interaction.guildId) {
    return sendResponse(interaction, createResponse(t('roleMenu.notFound'), 'error'), { ephemeral: true });
  }
  return sendResponse(interaction, await getRoleMenuSettings(menu.id).render(interaction.guild, t), { ephemeral: true });
}
