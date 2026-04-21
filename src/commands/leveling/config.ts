import {
  ApplicationIntegrationType,
  channelMention,
  ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  roleMention,
  SlashCommandBuilder,
} from 'discord.js';
import { t } from 'i18next';

import { Command } from 'classes/base/command';
import {
  addEnabledChannel,
  addEnabledRole,
  addGuildLevelingReward,
  addIgnoredChannel,
  addIgnoredRole,
  createGuildLevelingConfiguration,
  deleteGuildLevelingConfiguration,
  deleteGuildLevelingReward,
  getGuildLevelingConfiguration,
  updateGuildLevelingConfiguration,
} from 'database/leveling';

const MAX_REWARDS = 20;
const MAX_IGNORED_CHANNELS = 20;
const MAX_ENABLED_CHANNELS = 20;
const MAX_IGNORED_ROLES = 20;
const MAX_ENABLED_ROLES = 20;

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setName('leveling')
    .setDescription('Manage the leveling system for this server.')
    .addSubcommand((cmd) => cmd.setName('info').setDescription('Get information about the current leveling configuration.'))
    .addSubcommand((cmd) => cmd.setName('reset').setDescription('Reset the leveling system for this server.'))
    .addSubcommand((cmd) => cmd.setName('toggle').setDescription('Toggle the leveling system on or off for this server.'))
    .addSubcommand((cmd) =>
      cmd
        .setName('set-channel')
        .setDescription('Set the channel where level up messages will be sent.')
        .addChannelOption((opt) =>
          opt.setName('channel').setDescription('The channel to send level up messages in (leave empty to remove).').setRequired(false),
        ),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName('add-reward')
        .setDescription('Add a new reward to the leveling system.')
        .addIntegerOption((opt) => opt.setName('level').setDescription('The level at which the reward is given.').setRequired(true))
        .addRoleOption((opt) => opt.setName('role').setDescription('The role to be awarded at the specified level.').setRequired(true)),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName('remove-reward')
        .setDescription('Remove an existing reward from the leveling system.')
        .addIntegerOption((opt) => opt.setName('level').setDescription('The level of the reward to remove.').setRequired(false))
        .addStringOption((opt) => opt.setName('role-id').setDescription('The ID of the role to remove.').setRequired(false)),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName('add-ignored-channel')
        .setDescription('Add a channel to the list of channels ignored by the leveling system.')
        .addChannelOption((opt) => opt.setName('channel').setDescription('The channel to ignore.').setRequired(true)),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName('remove-ignored-channel')
        .setDescription('Remove a channel from the list of channels ignored by the leveling system.')
        .addStringOption((opt) => opt.setName('channel-id').setDescription('The ID of the channel to remove from the ignored list.').setRequired(true)),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName('add-enabled-channel')
        .setDescription('Add a channel to the list of channels enabled for the leveling system.')
        .addChannelOption((opt) => opt.setName('channel').setDescription('The channel to enable.').setRequired(true)),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName('remove-enabled-channel')
        .setDescription('Remove a channel from the list of channels enabled for the leveling system.')
        .addStringOption((opt) => opt.setName('channel-id').setDescription('The ID of the channel to remove from the enabled list.').setRequired(true)),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName('add-ignored-role')
        .setDescription('Add a role to the list of roles ignored by the leveling system.')
        .addRoleOption((opt) => opt.setName('role').setDescription('The role to ignore.').setRequired(true)),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName('remove-ignored-role')
        .setDescription('Remove a role from the list of roles ignored by the leveling system.')
        .addStringOption((opt) => opt.setName('role-id').setDescription('The ID of the role to remove from the ignored list.').setRequired(true)),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName('add-enabled-role')
        .setDescription('Add a role to the list of roles enabled for the leveling system (only these roles will be tracked).')
        .addRoleOption((opt) => opt.setName('role').setDescription('The role to enable.').setRequired(true)),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName('remove-enabled-role')
        .setDescription('Remove a role from the list of roles enabled for the leveling system.')
        .addStringOption((opt) => opt.setName('role-id').setDescription('The ID of the role to remove from the enabled list.').setRequired(true)),
    ),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      return interaction.reply({ content: 'This command can only be used in a server.', flags: [MessageFlags.Ephemeral] });
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'info':
        handleInfo(interaction);
        break;
      case 'reset':
        handleReset(interaction);
        break;
      case 'toggle':
        handleToggle(interaction);
        break;
      case 'set-channel':
        handleSetChannel(interaction);
        break;
      case 'add-reward':
        handleAddReward(interaction);
        break;
      case 'remove-reward':
        handleRemoveReward(interaction);
        break;
      case 'add-ignored-channel':
        handleAddIgnoredChannel(interaction);
        break;
      case 'remove-ignored-channel':
        handleRemoveIgnoredChannel(interaction);
        break;
      case 'add-enabled-channel':
        handleAddEnabledChannel(interaction);
        break;
      case 'remove-enabled-channel':
        handleRemoveEnabledChannel(interaction);
        break;
      case 'add-ignored-role':
        handleAddIgnoredRole(interaction);
        break;
      case 'remove-ignored-role':
        handleRemoveIgnoredRole(interaction);
        break;
      case 'add-enabled-role':
        handleAddEnabledRole(interaction);
        break;
      case 'remove-enabled-role':
        handleRemoveEnabledRole(interaction);
        break;
      default:
        return;
    }
  },
});

async function handleInfo(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    return interaction.editReply({ content: t('leveling.disabled') });
  }

  const { enabled, channelId, rewards, ignoredChannels, enabledChannels, ignoredRoles, enabledRoles } = levelingConfig;

  const levelUpChannel = channelId ? channelMention(channelId) : t('leveling.info.noChannel');
  const rewardsList =
    rewards.length > 0
      ? rewards.map((r) => t('leveling.info.rewardEntry', { level: r.level, reward: roleMention(r.roleId) })).join('\n')
      : t('leveling.info.noRewards');
  const ignoredChannelsList = ignoredChannels.length > 0 ? ignoredChannels.map((id) => channelMention(id)).join(', ') : t('leveling.info.noIgnoredChannels');
  const enabledChannelsList = enabledChannels.length > 0 ? enabledChannels.map((id) => channelMention(id)).join(', ') : t('leveling.info.noEnabledChannels');
  const ignoredRolesList = ignoredRoles.length > 0 ? ignoredRoles.map((id) => roleMention(id)).join(', ') : t('leveling.info.noIgnoredRoles');
  const enabledRolesList = enabledRoles.length > 0 ? enabledRoles.map((id) => roleMention(id)).join(', ') : t('leveling.info.noEnabledRoles');

  const infoMessage = [
    t('leveling.info.title'),
    t('leveling.info.status', { state: enabled ? t('state.enabled') : t('state.disabled') }),
    t('leveling.info.channel', { channel: levelUpChannel }),
    t('leveling.info.rewards', { rewards: rewardsList, count: rewards.length, total: MAX_REWARDS }),
    t('leveling.info.ignoredChannels', { channels: ignoredChannelsList, count: ignoredChannels.length, total: MAX_IGNORED_CHANNELS }),
    t('leveling.info.enabledChannels', { channels: enabledChannelsList, count: enabledChannels.length, total: MAX_ENABLED_CHANNELS }),
    t('leveling.info.ignoredRoles', { roles: ignoredRolesList, count: ignoredRoles.length, total: MAX_IGNORED_ROLES }),
    t('leveling.info.enabledRoles', { roles: enabledRolesList, count: enabledRoles.length, total: MAX_ENABLED_ROLES }),
  ].join('\n');

  return interaction.editReply({ content: infoMessage });
}

async function handleReset(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    return interaction.editReply({ content: t('leveling.disabled') });
  }

  await deleteGuildLevelingConfiguration(interaction.guildId);

  return interaction.editReply({ content: t('leveling.reset.success') });
}

async function handleToggle(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);

  const newStatus = levelingConfig ? !levelingConfig.enabled : true;
  await updateGuildLevelingConfiguration(interaction.guildId, { enabled: newStatus });

  return interaction.editReply({ content: t('leveling.toggle.success', { state: newStatus ? t('state.enabled') : t('state.disabled') }) });
}

async function handleSetChannel(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  const channel = interaction.options.getChannel('channel', false);

  if (!channel) {
    if (!levelingConfig?.channelId) {
      return interaction.editReply({ content: t('leveling.channel.none') });
    }

    await updateGuildLevelingConfiguration(interaction.guildId, { channelId: undefined });
    return interaction.editReply({ content: t('leveling.channel.removed') });
  }

  if (channel.id === levelingConfig?.channelId) {
    return interaction.editReply({ content: t('leveling.channel.already', { channel: channelMention(channel.id) }) });
  }

  await updateGuildLevelingConfiguration(interaction.guildId, { channelId: channel ? channel.id : undefined });
  return interaction.editReply({
    content: t('leveling.channel.set', { channel: channelMention(channel.id) }),
  });
}

async function handleAddReward(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  let levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    levelingConfig = await createGuildLevelingConfiguration(interaction.guildId);
  }

  if (levelingConfig.rewards.length >= MAX_REWARDS) {
    return interaction.editReply({ content: t('leveling.reward.limit', { limit: MAX_REWARDS }) });
  }

  const level = interaction.options.getInteger('level', true);
  const role = interaction.options.getRole('role', true);

  const existingReward = levelingConfig?.rewards.find((reward) => reward.roleId === role.id);
  if (existingReward) {
    return interaction.editReply({ content: t('leveling.reward.exists') });
  }

  await addGuildLevelingReward(interaction.guildId, level, role.id);
  return interaction.editReply({
    content: t('leveling.reward.added', { entry: t('leveling.info.rewardEntry', { level, reward: roleMention(role.id) }) }),
    allowedMentions: { roles: [] },
  });
}

async function handleRemoveReward(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    return interaction.editReply({ content: t('leveling.disabled') });
  }

  const level = interaction.options.getInteger('level', false);
  const roleId = interaction.options.getString('role-id', false);

  let rewardToRemove;
  if (level !== null) {
    rewardToRemove = levelingConfig.rewards.find((reward) => reward.level === level);
  } else if (roleId !== null) {
    rewardToRemove = levelingConfig.rewards.find((reward) => reward.roleId === roleId);
  } else {
    return interaction.editReply({ content: t('leveling.reward.none') });
  }

  if (!rewardToRemove) {
    return interaction.editReply({ content: t('leveling.reward.notFound', { level, role: roleId }) });
  }

  await deleteGuildLevelingReward(rewardToRemove.id);
  return interaction.editReply({
    content: t('leveling.reward.removed', {
      entry: t('leveling.info.rewardEntry', { level: rewardToRemove.level, reward: roleMention(rewardToRemove.roleId) }),
    }),
    allowedMentions: { roles: [] },
  });
}

async function handleAddIgnoredChannel(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    return interaction.editReply({ content: t('leveling.disabled') });
  }

  if (levelingConfig.ignoredChannels.length >= MAX_IGNORED_CHANNELS) {
    return interaction.editReply({ content: t('leveling.channel.ignoredLimit', { limit: MAX_IGNORED_CHANNELS }) });
  }

  const channel = interaction.options.getChannel('channel', true);
  if (levelingConfig.ignoredChannels.includes(channel.id)) {
    return interaction.editReply({ content: t('leveling.channel.alreadyIgnored', { channel: channelMention(channel.id) }) });
  }

  await addIgnoredChannel(interaction.guildId, channel.id);
  return interaction.editReply({ content: t('leveling.channel.addIgnored', { channel: channelMention(channel.id) }) });
}

async function handleRemoveIgnoredChannel(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    return interaction.editReply({ content: t('leveling.disabled') });
  }

  const channelId = interaction.options.getString('channel-id', true);
  if (!levelingConfig.ignoredChannels.includes(channelId)) {
    return interaction.editReply({ content: t('leveling.channel.notIgnored', { channel: channelMention(channelId) }) });
  }

  const updatedIgnoredChannels = levelingConfig.ignoredChannels.filter((id) => id !== channelId);
  await updateGuildLevelingConfiguration(interaction.guildId, { ignoredChannels: updatedIgnoredChannels });
  return interaction.editReply({ content: t('leveling.channel.removedIgnored', { channel: channelMention(channelId) }) });
}

async function handleAddEnabledChannel(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    return interaction.editReply({ content: t('leveling.disabled') });
  }

  if (levelingConfig.enabledChannels.length >= MAX_ENABLED_CHANNELS) {
    return interaction.editReply({ content: t('leveling.channel.enabledLimit', { limit: MAX_ENABLED_CHANNELS }) });
  }

  const channel = interaction.options.getChannel('channel', true);
  if (levelingConfig.enabledChannels.includes(channel.id)) {
    return interaction.editReply({ content: t('leveling.channel.alreadyEnabled', { channel: channelMention(channel.id) }) });
  }

  await addEnabledChannel(interaction.guildId, channel.id);
  return interaction.editReply({ content: t('leveling.channel.addEnabled', { channel: channelMention(channel.id) }) });
}

async function handleRemoveEnabledChannel(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    return interaction.editReply({ content: t('leveling.disabled') });
  }

  const channelId = interaction.options.getString('channel-id', true);
  if (!levelingConfig.enabledChannels.includes(channelId)) {
    return interaction.editReply({ content: t('leveling.channel.notEnabled', { channel: channelMention(channelId) }) });
  }

  const updatedEnabledChannels = levelingConfig.enabledChannels.filter((id) => id !== channelId);
  await updateGuildLevelingConfiguration(interaction.guildId, { enabledChannels: updatedEnabledChannels });
  return interaction.editReply({ content: t('leveling.channel.removedEnabled', { channel: channelMention(channelId) }) });
}

async function handleAddIgnoredRole(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    return interaction.editReply({ content: t('leveling.disabled') });
  }

  if (levelingConfig.ignoredRoles.length >= MAX_IGNORED_ROLES) {
    return interaction.editReply({ content: t('leveling.role.ignoredLimit', { limit: MAX_IGNORED_ROLES }) });
  }

  const role = interaction.options.getRole('role', true);
  if (levelingConfig.ignoredRoles.includes(role.id)) {
    return interaction.editReply({ content: t('leveling.role.alreadyIgnored', { role: roleMention(role.id) }) });
  }

  await addIgnoredRole(interaction.guildId, role.id);
  return interaction.editReply({ content: t('leveling.role.addIgnored', { role: roleMention(role.id) }) });
}

async function handleRemoveIgnoredRole(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    return interaction.editReply({ content: t('leveling.disabled') });
  }

  const roleId = interaction.options.getString('role-id', true);
  if (!levelingConfig.ignoredRoles.includes(roleId)) {
    return interaction.editReply({ content: t('leveling.role.notIgnored', { role: roleMention(roleId) }) });
  }

  const updatedIgnoredRoles = levelingConfig.ignoredRoles.filter((id) => id !== roleId);
  await updateGuildLevelingConfiguration(interaction.guildId, { ignoredRoles: updatedIgnoredRoles });
  return interaction.editReply({ content: t('leveling.role.removedIgnored', { role: roleMention(roleId) }) });
}

async function handleAddEnabledRole(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    return interaction.editReply({ content: t('leveling.disabled') });
  }

  if (levelingConfig.enabledRoles.length >= MAX_ENABLED_ROLES) {
    return interaction.editReply({ content: t('leveling.role.enabledLimit', { limit: MAX_ENABLED_ROLES }) });
  }

  const role = interaction.options.getRole('role', true);
  if (levelingConfig.enabledRoles.includes(role.id)) {
    return interaction.editReply({ content: t('leveling.role.alreadyEnabled', { role: roleMention(role.id) }) });
  }

  await addEnabledRole(interaction.guildId, role.id);
  return interaction.editReply({ content: t('leveling.role.addEnabled', { role: roleMention(role.id) }) });
}

async function handleRemoveEnabledRole(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    return interaction.editReply({ content: t('leveling.disabled') });
  }

  const roleId = interaction.options.getString('role-id', true);
  if (!levelingConfig.enabledRoles.includes(roleId)) {
    return interaction.editReply({ content: t('leveling.role.notEnabled', { role: roleMention(roleId) }) });
  }

  const updatedEnabledRoles = levelingConfig.enabledRoles.filter((id) => id !== roleId);
  await updateGuildLevelingConfiguration(interaction.guildId, { enabledRoles: updatedEnabledRoles });
  return interaction.editReply({ content: t('leveling.role.removedEnabled', { role: roleMention(roleId) }) });
}
