import {
  ApplicationIntegrationType,
  channelMention,
  ChannelType,
  ChatInputCommandInteraction,
  Colors,
  ContainerBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  roleMention,
  SlashCommandBuilder,
  TextDisplayBuilder,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
} from 'discord.js';
import { t } from 'i18next';

import { Command } from 'classes/base/command';

import {
  createGuildBirthdayConfiguration,
  deleteGuildBirthdayConfiguration,
  getGuildBirthdayConfiguration,
  updateGuildBirthdayConfiguration,
} from 'database/birthday';
import type { GuildBirthday } from 'generated/prisma/client';

import { logger } from 'utility/logger';

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
    if (!interaction.inCachedGuild()) return;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const subcommand = interaction.options.getSubcommand();
    const currentConfig = await getGuildBirthdayConfiguration(interaction.guildId);

    if (!currentConfig && subcommand !== 'setup') {
      return interaction.editReply(createResponse(t('birthday.announce.none'), Colors.Yellow));
    }

    if (currentConfig && subcommand === 'setup') {
      return interaction.editReply(createResponse(t('birthday.announce.already'), Colors.Yellow));
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
        logger.warn(`Unknown subcommand: ${subcommand} in birthday-announcement command`);
        return;
    }
  },
});

async function handleSetup(interaction: ChatInputCommandInteraction<'cached'>) {
  const channel = interaction.options.getChannel('channel', true, [ChannelType.GuildText, ChannelType.GuildAnnouncement]);
  const role = interaction.options.getRole('role', false);

  if (!channel.isTextBased()) {
    return interaction.editReply(createResponse(t('birthday.announce.setup.invalidChannel'), Colors.Red));
  }

  await createGuildBirthdayConfiguration(interaction.guildId, channel.id, role?.id);

  return interaction.editReply(createResponse(t('birthday.announce.setup.success', { channel: channel.toString() }), Colors.Green));
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
    return interaction.editReply(createResponse(t('birthday.announce.edit.none'), Colors.Yellow));
  }

  if (channel && !channel.isTextBased()) {
    return interaction.editReply(createResponse(t('birthday.announce.edit.invalidChannel'), Colors.Red));
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
    return interaction.editReply(createResponse(t('birthday.announce.edit.none'), Colors.Yellow));
  }

  await updateGuildBirthdayConfiguration(interaction.guildId, updates);

  const responseTextParts = ['Successfully updated the birthday configuration!'];

  if ('channelId' in updates) {
    if (updates.channelId === null) {
      responseTextParts.push(t('birthday.announce.edit.channelRemoved'));
    } else {
      responseTextParts.push(t('birthday.announce.edit.channelUpdated', { channel: channel?.toString() }));
    }
  }

  if ('roleId' in updates) {
    if (updates.roleId === null) {
      responseTextParts.push(t('birthday.announce.edit.roleRemoved'));
    } else {
      responseTextParts.push(t('birthday.announce.edit.roleUpdated', { role: role?.toString() }));
    }
  }

  return interaction.editReply(createResponse(responseTextParts.join('\n'), Colors.Green));
}

async function handleInfo(interaction: ChatInputCommandInteraction<'cached'>, currentConfig: GuildBirthday) {
  return interaction.editReply(
    createResponse(
      [
        t('birthday.announce.info.title'),
        t('birthday.announce.info.state', { state: currentConfig.enabled ? t('state.enabled') : t('state.disabled') }),
        currentConfig.channelId
          ? t('birthday.announce.info.channel', { channel: channelMention(currentConfig.channelId) })
          : t('birthday.announce.info.noChannel'),
        currentConfig.roleId ? t('birthday.announce.info.role', { role: roleMention(currentConfig.roleId) }) : t('birthday.announce.info.noRole'),
      ].join('\n'),
      Colors.Blue,
    ),
  );
}

async function handleToggle(interaction: ChatInputCommandInteraction<'cached'>, currentConfig: GuildBirthday) {
  const newStatus = !currentConfig.enabled;
  await updateGuildBirthdayConfiguration(interaction.guildId, { enabled: newStatus });

  return interaction.editReply(
    createResponse(
      t(`birthday.announce.toggle.success`, { state: newStatus ? t('state.enabled') : t('state.disabled') }),
      newStatus ? Colors.Green : Colors.Red,
    ),
  );
}

async function handleReset(interaction: ChatInputCommandInteraction<'cached'>) {
  await deleteGuildBirthdayConfiguration(interaction.guildId);
  return interaction.editReply(createResponse(t('birthday.announce.reset.success'), Colors.Green));
}
