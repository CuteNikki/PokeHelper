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
        return interaction.reply({ content: 'Unknown subcommand!', flags: [MessageFlags.Ephemeral] });
    }
  },
});

async function handleInfo(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    return interaction.editReply({ content: 'The leveling system is not configured for this server yet!' });
  }

  const { enabled, channelId, rewards, ignoredChannels, enabledChannels, ignoredRoles, enabledRoles } = levelingConfig;

  const levelUpChannelMention = channelId ? channelMention(channelId) : 'No channel set';
  const rewardsList = rewards.length > 0 ? rewards.map((r) => `Level ${r.level}: ${roleMention(r.roleId)}`).join('\n') : 'No rewards configured';
  const ignoredChannelsList = ignoredChannels.length > 0 ? ignoredChannels.map((id) => channelMention(id)).join(', ') : 'None';
  const enabledChannelsList = enabledChannels.length > 0 ? enabledChannels.map((id) => channelMention(id)).join(', ') : 'All channels';
  const ignoredRolesList = ignoredRoles.length > 0 ? ignoredRoles.map((id) => roleMention(id)).join(', ') : 'None';
  const enabledRolesList = enabledRoles.length > 0 ? enabledRoles.map((id) => roleMention(id)).join(', ') : 'All roles';

  const infoMessage = `**Leveling System Configuration:**
- **Status:** ${enabled ? 'Enabled' : 'Disabled'}
- **Channel:** ${levelUpChannelMention}
- **Rewards:**
${rewardsList}
- **Ignored Channels:** ${ignoredChannelsList}
- **Enabled Channels:** ${enabledChannelsList}
- **Ignored Roles:** ${ignoredRolesList}
- **Enabled Roles:** ${enabledRolesList}`;

  return interaction.editReply({ content: infoMessage });
}

async function handleReset(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    return interaction.editReply({ content: 'The leveling system is not configured for this server yet!' });
  }

  await deleteGuildLevelingConfiguration(interaction.guildId);

  return interaction.editReply({ content: 'The leveling system has been reset to default settings!' });
}

async function handleToggle(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);

  const newStatus = levelingConfig ? !levelingConfig.enabled : true;
  await updateGuildLevelingConfiguration(interaction.guildId, { enabled: newStatus });

  return interaction.editReply({ content: `The leveling system has been ${newStatus ? 'enabled' : 'disabled'}!` });
}

async function handleSetChannel(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  const channel = interaction.options.getChannel('channel', false);

  if (!channel) {
    if (!levelingConfig?.channelId) {
      return interaction.editReply({ content: 'No channel was set for level up messages!' });
    }

    await updateGuildLevelingConfiguration(interaction.guildId, { channelId: undefined });
    return interaction.editReply({ content: 'Level up messages will now be sent where the user levels up!' });
  }

  if (channel.id === levelingConfig?.channelId) {
    return interaction.editReply({ content: 'This channel is already set for level up messages!' });
  }

  await updateGuildLevelingConfiguration(interaction.guildId, { channelId: channel ? channel.id : undefined });
  return interaction.editReply({
    content: `Level up messages will now be sent ${channel ? `in ${channelMention(channel.id)}` : 'where the user levels up'}!`,
  });
}

async function handleAddReward(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  let levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    levelingConfig = await createGuildLevelingConfiguration(interaction.guildId);
  }

  const level = interaction.options.getInteger('level', true);
  const role = interaction.options.getRole('role', true);

  const existingReward = levelingConfig?.rewards.find((reward) => reward.roleId === role.id);
  if (existingReward) {
    return interaction.editReply({ content: 'This role is already a reward for leveling up!' });
  }

  await addGuildLevelingReward(interaction.guildId, level, role.id);
  return interaction.editReply({ content: `Added a new reward: Level ${level} - ${roleMention(role.id)}!`, allowedMentions: { roles: [] } });
}

async function handleRemoveReward(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    return interaction.editReply({ content: 'The leveling system is not configured for this server yet!' });
  }

  const level = interaction.options.getInteger('level', false);
  const roleId = interaction.options.getString('role-id', false);

  let rewardToRemove;
  if (level !== null) {
    rewardToRemove = levelingConfig.rewards.find((reward) => reward.level === level);
  } else if (roleId !== null) {
    rewardToRemove = levelingConfig.rewards.find((reward) => reward.roleId === roleId);
  } else {
    return interaction.editReply({ content: 'Please specify either a level or a role ID to remove a reward!' });
  }

  if (!rewardToRemove) {
    return interaction.editReply({ content: 'No matching reward found to remove!' });
  }

  await deleteGuildLevelingReward(rewardToRemove.id);
  return interaction.editReply({
    content: `Removed the reward for Level ${rewardToRemove.level} - ${roleMention(rewardToRemove.roleId)}!`,
    allowedMentions: { roles: [] },
  });
}

async function handleAddIgnoredChannel(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    return interaction.editReply({ content: 'The leveling system is not configured for this server yet!' });
  }

  const channel = interaction.options.getChannel('channel', true);
  if (levelingConfig.ignoredChannels.includes(channel.id)) {
    return interaction.editReply({ content: 'This channel is already in the ignored channels list!' });
  }

  await addIgnoredChannel(interaction.guildId, channel.id);
  return interaction.editReply({ content: `Added ${channel} to the ignored channels list!` });
}

async function handleRemoveIgnoredChannel(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    return interaction.editReply({ content: 'The leveling system is not configured for this server yet!' });
  }

  const channelId = interaction.options.getString('channel-id', true);
  if (!levelingConfig.ignoredChannels.includes(channelId)) {
    return interaction.editReply({ content: 'This channel is not in the ignored channels list!' });
  }

  const updatedIgnoredChannels = levelingConfig.ignoredChannels.filter((id) => id !== channelId);
  await updateGuildLevelingConfiguration(interaction.guildId, { ignoredChannels: updatedIgnoredChannels });
  return interaction.editReply({ content: `Removed ${channelMention(channelId)} from the ignored channels list!` });
}

async function handleAddEnabledChannel(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    return interaction.editReply({ content: 'The leveling system is not configured for this server yet!' });
  }

  const channel = interaction.options.getChannel('channel', true);
  if (levelingConfig.enabledChannels.includes(channel.id)) {
    return interaction.editReply({ content: 'This channel is already in the enabled channels list!' });
  }

  await addEnabledChannel(interaction.guildId, channel.id);
  return interaction.editReply({ content: `Added ${channel} to the enabled channels list!` });
}

async function handleRemoveEnabledChannel(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    return interaction.editReply({ content: 'The leveling system is not configured for this server yet!' });
  }

  const channelId = interaction.options.getString('channel-id', true);
  if (!levelingConfig.enabledChannels.includes(channelId)) {
    return interaction.editReply({ content: 'This channel is not in the enabled channels list!' });
  }

  const updatedEnabledChannels = levelingConfig.enabledChannels.filter((id) => id !== channelId);
  await updateGuildLevelingConfiguration(interaction.guildId, { enabledChannels: updatedEnabledChannels });
  return interaction.editReply({ content: `Removed ${channelMention(channelId)} from the enabled channels list!` });
}

async function handleAddIgnoredRole(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    return interaction.editReply({ content: 'The leveling system is not configured for this server yet!' });
  }

  const role = interaction.options.getRole('role', true);
  if (levelingConfig.ignoredRoles.includes(role.id)) {
    return interaction.editReply({ content: 'This role is already in the ignored roles list!' });
  }

  await addIgnoredRole(interaction.guildId, role.id);
  return interaction.editReply({ content: `Added ${role} to the ignored roles list!` });
}

async function handleRemoveIgnoredRole(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    return interaction.editReply({ content: 'The leveling system is not configured for this server yet!' });
  }

  const roleId = interaction.options.getString('role-id', true);
  if (!levelingConfig.ignoredRoles.includes(roleId)) {
    return interaction.editReply({ content: 'This role is not in the ignored roles list!' });
  }

  const updatedIgnoredRoles = levelingConfig.ignoredRoles.filter((id) => id !== roleId);
  await updateGuildLevelingConfiguration(interaction.guildId, { ignoredRoles: updatedIgnoredRoles });
  return interaction.editReply({ content: `Removed ${roleMention(roleId)} from the ignored roles list!` });
}

async function handleAddEnabledRole(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    return interaction.editReply({ content: 'The leveling system is not configured for this server yet!' });
  }

  const role = interaction.options.getRole('role', true);
  if (levelingConfig.enabledRoles.includes(role.id)) {
    return interaction.editReply({ content: 'This role is already in the enabled roles list!' });
  }

  await addEnabledRole(interaction.guildId, role.id);
  return interaction.editReply({ content: `Added ${role} to the enabled roles list!` });
}

async function handleRemoveEnabledRole(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
  if (!levelingConfig) {
    return interaction.editReply({ content: 'The leveling system is not configured for this server yet!' });
  }

  const roleId = interaction.options.getString('role-id', true);
  if (!levelingConfig.enabledRoles.includes(roleId)) {
    return interaction.editReply({ content: 'This role is not in the enabled roles list!' });
  }

  const updatedEnabledRoles = levelingConfig.enabledRoles.filter((id) => id !== roleId);
  await updateGuildLevelingConfiguration(interaction.guildId, { enabledRoles: updatedEnabledRoles });
  return interaction.editReply({ content: `Removed ${roleMention(roleId)} from the enabled roles list!` });
}
