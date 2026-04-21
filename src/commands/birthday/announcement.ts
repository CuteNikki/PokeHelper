import {
  ApplicationIntegrationType,
  ChannelType,
  ChatInputCommandInteraction,
  Colors,
  ContainerBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextDisplayBuilder,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
} from 'discord.js';

import { Command } from 'classes/base/command';

import {
  createGuildBirthdayConfiguration,
  deleteGuildBirthdayConfiguration,
  getGuildBirthdayConfiguration,
  updateGuildBirthdayConfiguration,
} from 'database/birthday';

import type { GuildBirthday } from 'generated/prisma/client';

const createResponse = (content: string, color: number): InteractionEditReplyOptions & InteractionReplyOptions => ({
  components: [new ContainerBuilder().setAccentColor(color).addTextDisplayComponents(new TextDisplayBuilder().setContent(content))],
  flags: [MessageFlags.IsComponentsV2],
});

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setName('birthday-announcement')
    .setDescription('Manage the birthday configuration for this server.')
    .addSubcommand((cmd) =>
      cmd
        .setName('setup')
        .setDescription('Set up the birthday configuration for this server.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('The channel to set for birthday announcements.')
            .setRequired(true)
            .addChannelTypes([ChannelType.GuildText, ChannelType.GuildAnnouncement]),
        )
        .addRoleOption((option) => option.setName('role').setDescription('The role to assign members on their birthday.').setRequired(false)),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName('edit')
        .setDescription('Edit the birthday configuration for this server.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('The channel to set for birthday announcements.')
            .setRequired(false)
            .addChannelTypes([ChannelType.GuildText, ChannelType.GuildAnnouncement]),
        )
        .addRoleOption((option) => option.setName('role').setDescription('The role to assign members on their birthday.').setRequired(false)),
    )
    .addSubcommand((cmd) => cmd.setName('remove-channel').setDescription('Remove the birthday announcement channel.'))
    .addSubcommand((cmd) => cmd.setName('remove-role').setDescription('Remove the birthday role.'))
    .addSubcommand((cmd) => cmd.setName('toggle').setDescription('Toggle the birthday configuration for this server.'))
    .addSubcommand((cmd) => cmd.setName('info').setDescription('Get information about the birthday configuration.'))
    .addSubcommand((cmd) => cmd.setName('reset').setDescription('Disable the birthday configuration for this server.')),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      return interaction.reply({ content: 'This command can only be used in a server.', flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const subcommand = interaction.options.getSubcommand();
    const currentConfig = await getGuildBirthdayConfiguration(interaction.guildId);

    if (!currentConfig && subcommand !== 'setup') {
      return interaction.editReply(
        createResponse('No birthday configuration is set up in this server yet.\nPlease use the setup command to create a configuration first.', Colors.Yellow),
      );
    }

    if (currentConfig && subcommand === 'setup') {
      return interaction.editReply(
        createResponse(
          'A birthday configuration is already set up in this server.\nPlease use the edit command to change the settings. Or reset the settings if you want to start over.',
          Colors.Yellow,
        ),
      );
    }

    switch (subcommand) {
      case 'setup':
        return handleSetup(interaction);
      case 'edit':
        return handleEdit(interaction, currentConfig!);
      case 'remove-channel':
        return handleEdit(interaction, currentConfig!, { channel: 'remove' });
      case 'remove-role':
        return handleEdit(interaction, currentConfig!, { role: 'remove' });
      case 'info':
        return handleInfo(interaction, currentConfig!);
      case 'toggle':
        return handleToggle(interaction, currentConfig!);
      case 'reset':
        return handleReset(interaction);
      default:
        return interaction.editReply(createResponse('### Unknown subcommand\nPlease use one of the following: `setup`, `edit`, `info`, `reset`.', Colors.Red));
    }
  },
});

async function handleSetup(interaction: ChatInputCommandInteraction<'cached'>) {
  const channel = interaction.options.getChannel('channel', true, [ChannelType.GuildText, ChannelType.GuildAnnouncement]);
  const role = interaction.options.getRole('role', false);

  if (!channel.isTextBased()) {
    return interaction.editReply(createResponse('The provided channel is not a text channel. Please try again.', Colors.Red));
  }

  await createGuildBirthdayConfiguration(interaction.guildId, channel.id, role?.id);

  return interaction.editReply(
    createResponse(
      `Successfully set up the birthday configuration!\nBirthday announcements will be made in ${channel?.toString()}.\n\nYou can change this later using the edit command.`,
      Colors.Green,
    ),
  );
}

async function handleEdit(
  interaction: ChatInputCommandInteraction<'cached'>,
  currentConfig: GuildBirthday,
  options: { channel?: 'remove'; role?: 'remove' } = {},
) {
  const channel = interaction.options.getChannel('channel', false, [ChannelType.GuildText, ChannelType.GuildAnnouncement]);
  const role = interaction.options.getRole('role', false);

  const isRemovingChannel = options.channel === 'remove';
  const isRemovingRole = options.role === 'remove';

  if (!channel && !role && !isRemovingChannel && !isRemovingRole) {
    return interaction.editReply(createResponse('Please provide at least one option to edit: `channel` and/or `role`.', Colors.Yellow));
  }

  if (channel && !channel.isTextBased()) {
    return interaction.editReply(createResponse('The provided channel is not a text channel. Please try again.', Colors.Red));
  }

  const updates: { channelId?: string | null; roleId?: string | null } = {};

  if (isRemovingChannel) {
    if (currentConfig.channelId !== null) updates.channelId = null;
  } else if (channel && currentConfig.channelId !== channel.id) {
    updates.channelId = channel.id;
  }

  if (isRemovingRole) {
    if (currentConfig.roleId !== null) updates.roleId = null;
  } else if (role && currentConfig.roleId !== role.id) {
    updates.roleId = role.id;
  }

  if (Object.keys(updates).length === 0) {
    return interaction.editReply(
      createResponse('The provided values are already set in the birthday configuration. Please provide different values.', Colors.Yellow),
    );
  }

  await updateGuildBirthdayConfiguration(interaction.guildId, updates);

  const responseTextParts = ['Successfully updated the birthday configuration!'];

  if ('channelId' in updates) {
    if (updates.channelId === null) {
      responseTextParts.push('Birthday announcement channel has been removed.');
    } else {
      responseTextParts.push(`Birthday announcements will now be made in ${channel?.toString()}.`);
    }
  }

  if ('roleId' in updates) {
    if (updates.roleId === null) {
      responseTextParts.push('Birthday role has been removed.');
    } else {
      responseTextParts.push(`Birthday role is now set to ${role?.toString()}.`);
    }
  }

  return interaction.editReply(createResponse(responseTextParts.join('\n'), Colors.Green));
}

async function handleInfo(interaction: ChatInputCommandInteraction<'cached'>, currentConfig: GuildBirthday) {
  const channel = currentConfig.channelId ? interaction.guild.channels.cache.get(currentConfig.channelId) : null;
  const role = currentConfig.roleId ? interaction.guild.roles.cache.get(currentConfig.roleId) : null;

  const content =
    `### Birthday Configuration Info\n\n` +
    `**Status:** ${currentConfig.enabled ? 'Enabled' : 'Disabled'}\n` +
    `**Announcement Channel:** ${currentConfig.channelId ? (channel ? `${channel?.toString()}` : `Channel ID: ${currentConfig.channelId} (channel not found)`) : 'Not set'}\n` +
    `**Birthday Role:** ${currentConfig.roleId ? (role ? `${role?.toString()}` : `Role ID: ${currentConfig.roleId} (role not found)`) : 'Not set'}\n\n` +
    `You can change this using the edit command, or reset the configuration.`;

  return interaction.editReply(createResponse(content, Colors.Blue));
}

async function handleToggle(interaction: ChatInputCommandInteraction<'cached'>, currentConfig: GuildBirthday) {
  const newStatus = !currentConfig.enabled;
  await updateGuildBirthdayConfiguration(interaction.guildId, { enabled: newStatus });

  const content =
    `Birthday announcements have been **${newStatus ? 'enabled' : 'disabled'}** for this server!` +
    (!newStatus ? '\nMembers will no longer receive birthday announcements or roles.' : '');

  return interaction.editReply(createResponse(content, newStatus ? Colors.Green : Colors.Red));
}

async function handleReset(interaction: ChatInputCommandInteraction<'cached'>) {
  await deleteGuildBirthdayConfiguration(interaction.guildId);
  return interaction.editReply(
    createResponse('Successfully reset the birthday configuration!\nYou can set it up again using the setup command.', Colors.Green),
  );
}
