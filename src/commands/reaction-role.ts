import {
  ActionRowBuilder,
  ApplicationIntegrationType,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ChatInputCommandInteraction,
  Colors,
  ComponentType,
  ContainerBuilder,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  roleMention,
  RoleSelectMenuBuilder,
  SectionBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
} from 'discord.js';

import { Command } from '../classes/base/command';
import {
  createReactionRoleMenuConfiguration,
  deleteReactionRoleMenuConfiguration,
  getAllReactionRoleMenusForGuild,
  getReactionRoleMenuConfiguration,
  updateReactionRoleMenuConfiguration,
} from '../database/reaction-role';

interface SetupState {
  step: 'MODE' | 'REQUIRED_ROLES' | 'CHANNEL' | 'MENU_ROLES' | 'EMOJI_PAIRING' | 'CONFIRM';
  singleChoice: boolean;
  requiredRoleIds: string[];
  channelId: string | null;
  menuRoleIds: string[];
  pairingIndex: number;
  roles: { emoji: string; roleId: string }[];
}

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setName('reaction-role')
    .setDescription('Manage the reaction role menus for this server.')
    .addSubcommand((cmd) => cmd.setName('setup').setDescription('Set up a reaction role menu.'))
    .addSubcommand((cmd) =>
      cmd
        .setName('info')
        .setDescription('Get information about the reaction role configuration.')
        .addStringOption((option) => option.setName('menu-id').setDescription('The ID of the reaction role menu.').setAutocomplete(true).setRequired(false)),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName('re-send')
        .setDescription('Re-send a reaction role menu message to a channel. Use if the message was deleted or lost.')
        .addStringOption((option) =>
          option.setName('menu-id').setDescription('The ID of the reaction role menu to re-send.').setAutocomplete(true).setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName('target-channel')
            .setDescription('Optionally specify a new target channel to send the menu to.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName('toggle')
        .setDescription('Toggle the reaction role menu on or off. When off, message will remain but not function.')
        .addStringOption((option) =>
          option
            .setName('menu-id')
            .setDescription('The ID of the reaction role menu to toggle (or all if left empty).')
            .setAutocomplete(true)
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName('enabled')
            .setDescription('Whether to enable or disable the menu. If not provided, menu will be toggled to opposite state.')
            .setRequired(false),
        ),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName('delete')
        .setDescription('Delete the reaction role configuration for this server.')
        .addStringOption((option) =>
          option.setName('menu-id').setDescription('The ID of the reaction role menu to delete.').setAutocomplete(true).setRequired(true),
        ),
    ),
  async autocomplete(interaction) {
    if (!interaction.inCachedGuild()) return;

    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'menu-id') {
      const menus = await getAllReactionRoleMenusForGuild(interaction.guildId);
      const choices = menus.map((menu) => {
        const channelName = interaction.guild?.channels.cache.get(menu.channelId)?.name || 'unknown-channel';
        const displayChannelName = channelName.length > 20 ? `${channelName.slice(0, 20)}...` : channelName;

        return {
          name: `Menu in #${displayChannelName} - ${menu.roles.length}/20 roles - ID: ${menu.id}`,
          value: menu.id,
        };
      });

      const filtered = choices.filter((choice) => choice.name.toLowerCase().includes(focusedOption.value.toLowerCase()));
      await interaction.respond(filtered.slice(0, 25));
    }
  },

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      return interaction.reply({ content: 'This command can only be used in a server.', flags: [MessageFlags.Ephemeral] });
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'setup':
        await handleSetup(interaction);
        break;
      case 'info':
        await handleInfo(interaction);
        break;
      case 're-send':
        await handleResend(interaction);
        break;
      case 'toggle':
        await handleToggle(interaction);
        break;
      case 'delete':
        await handleDelete(interaction);
        break;
      default:
        interaction.reply({
          components: [
            new ContainerBuilder()
              .setAccentColor(Colors.Red)
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('### Unknown subcommand\nPlease use one of the following: `setup`, `info`, `re-send`, `toggle`, `delete`.'),
              ),
          ],
          flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
        });
        break;
    }
  },
});

export async function handleSetup(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply();

  const state: SetupState = {
    step: 'MODE',
    singleChoice: false,
    requiredRoleIds: [],
    channelId: null,
    menuRoleIds: [],
    pairingIndex: 0,
    roles: [],
  };

  const existingMenus = await getAllReactionRoleMenusForGuild(interaction.guildId);

  if (existingMenus.length >= 20) {
    return interaction.editReply({
      content: 'You have reached the maximum number of reaction role menus (20) for this server. Please delete an existing menu before creating a new one.',
      components: [],
    });
  }

  function generateReactionRoleView(): InteractionReplyOptions & InteractionEditReplyOptions {
    const container = new ContainerBuilder().setAccentColor(Colors.Blurple);
    const components: (ContainerBuilder | ActionRowBuilder)[] = [container];

    switch (state.step) {
      case 'MODE':
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent('### Step 1: Selection Mode\nShould this reaction menu allow users to select only one role, or multiple?'),
        );
        components.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('setup_single').setLabel('Single Choice').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('setup_multi').setLabel('Multiple Choice').setStyle(ButtonStyle.Secondary),
          ),
        );
        break;

      case 'REQUIRED_ROLES':
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            '### Step 2: Required Roles\nSelect any roles a user MUST have to use this menu. If none are required, click Skip.',
          ),
        );
        components.push(
          new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
            new RoleSelectMenuBuilder().setCustomId('setup_req_roles').setMinValues(1).setMaxValues(10).setPlaceholder('Select required roles (Optional)...'),
          ),
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('setup_skip_req_roles').setLabel('Skip / No Requirements').setStyle(ButtonStyle.Secondary),
          ),
        );
        break;

      case 'CHANNEL':
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent('### Step 3: Target Channel\nSelect the text channel where the bot should post the new reaction menu.'),
        );
        components.push(
          new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
            new ChannelSelectMenuBuilder().setCustomId('setup_channel').setChannelTypes(ChannelType.GuildText).setPlaceholder('Select a target channel...'),
          ),
        );
        break;

      case 'MENU_ROLES':
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent('### Step 4: Menu Roles\nSelect the roles you want users to be able to claim (Max 20).'),
        );
        components.push(
          new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
            new RoleSelectMenuBuilder().setCustomId('setup_menu_roles').setMinValues(1).setMaxValues(20).setPlaceholder('Select roles to offer...'),
          ),
        );
        break;

      case 'EMOJI_PAIRING': {
        const currentRole = state.menuRoleIds[state.pairingIndex];
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### Step 5: Emoji Pairing (${state.pairingIndex + 1}/${state.menuRoleIds.length})\n\nPlease react to **this message** with the emoji you want to pair with the role <@&${currentRole}>.`,
          ),
        );
        break;
      }

      case 'CONFIRM':
        container
          .setAccentColor(Colors.Green)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `### Step 6: Confirm Setup\nEverything is ready. The bot will create the message and save the database entry.\n\n- **Target:** <#${state.channelId}>\n- **Mode:** ${state.singleChoice ? 'Single Choice' : 'Multiple Choice'}\n- **Required Roles:** ${state.requiredRoleIds.length}\n- **Menu Roles:** ${state.roles.length}`,
            ),
          );
        components.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('setup_save').setLabel('Deploy Menu').setStyle(ButtonStyle.Success),
          ),
        );
        break;
    }

    return { components: components.map((component) => component.toJSON()), flags: [MessageFlags.IsComponentsV2] };
  }
  const message = await interaction.editReply(generateReactionRoleView());

  let isSaving = false;
  const componentCollector = message.createMessageComponentCollector({
    time: 600_000,
    idle: 180_000,
  });

  const reactionCollector = message.createReactionCollector({
    filter: (_reaction, user) => user.id === interaction.user.id,
    time: 600_000,
    idle: 180_000,
  });

  componentCollector.on('collect', async (componentInteraction) => {
    if (componentInteraction.isButton()) {
      if (componentInteraction.customId === 'setup_single' || componentInteraction.customId === 'setup_multi') {
        state.singleChoice = componentInteraction.customId === 'setup_single';
        state.step = 'REQUIRED_ROLES';
        await componentInteraction.update(generateReactionRoleView());
      }

      if (componentInteraction.customId === 'setup_skip_req_roles') {
        state.requiredRoleIds = [];
        state.step = 'CHANNEL';
        await componentInteraction.update(generateReactionRoleView());
      }

      if (componentInteraction.customId === 'setup_save') {
        if (isSaving) return;
        isSaving = true;
        await componentInteraction.deferUpdate();

        const targetChannel = await interaction.guild?.channels.fetch(state.channelId!).catch(() => null);
        if (!targetChannel || !targetChannel.isTextBased()) {
          return componentInteraction.followUp({ content: 'Error: Could not find or access the target channel.', flags: [MessageFlags.Ephemeral] });
        }

        const embed = new EmbedBuilder()
          .setTitle('Role Menu')
          .setDescription(`Click the buttons below to claim your roles!\n\n${state.roles.map((r) => `${r.emoji} - <@&${r.roleId}>`).join('\n')}`)
          .setColor(Colors.Blurple);

        const buttonRows: ActionRowBuilder<ButtonBuilder>[] = [];

        for (let i = 0; i < state.roles.length; i += 5) {
          const row = new ActionRowBuilder<ButtonBuilder>();
          const chunk = state.roles.slice(i, i + 5);

          for (const role of chunk) {
            row.addComponents(new ButtonBuilder().setCustomId(`rr_sel_${role.roleId}`).setEmoji(role.emoji).setStyle(ButtonStyle.Secondary));
          }
          buttonRows.push(row);
        }

        const sentMessage = await targetChannel.send({ embeds: [embed], components: buttonRows });

        await createReactionRoleMenuConfiguration(
          interaction.guildId,
          state.channelId!,
          sentMessage.id,
          state.roles,
          state.singleChoice,
          state.requiredRoleIds,
        );

        const successContainer = new ContainerBuilder()
          .setAccentColor(Colors.Green)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### Setup Complete\nThe button menu has been successfully posted in <#${state.channelId}> and saved.`),
          );

        await interaction.editReply({ components: [successContainer] });
        componentCollector.stop('COMPLETED');
        reactionCollector.stop('COMPLETED');
      }
    }

    if (componentInteraction.isAnySelectMenu()) {
      if (componentInteraction.customId === 'setup_req_roles' && componentInteraction.isRoleSelectMenu()) {
        state.requiredRoleIds = componentInteraction.roles.sort((a, b) => a.position - b.position).map((role) => role.id);
        state.step = 'CHANNEL';
        await componentInteraction.update(generateReactionRoleView());
      }

      if (componentInteraction.customId === 'setup_channel') {
        state.channelId = componentInteraction.values[0] ?? null;
        state.step = 'MENU_ROLES';
        await componentInteraction.update(generateReactionRoleView());
      }

      if (componentInteraction.customId === 'setup_menu_roles' && componentInteraction.isRoleSelectMenu()) {
        state.menuRoleIds = componentInteraction.roles.sort((a, b) => a.position - b.position).map((role) => role.id);
        state.pairingIndex = 0;
        state.step = 'EMOJI_PAIRING';
        await componentInteraction.update(generateReactionRoleView());
      }
    }
  });

  reactionCollector.on('collect', async (reaction) => {
    if (state.step !== 'EMOJI_PAIRING') return;

    const roleId = state.menuRoleIds[state.pairingIndex];

    const emoji = reaction.emoji.toString();
    if (!emoji || !roleId) return;
    state.roles.push({ emoji, roleId });
    state.pairingIndex++;

    await reaction.users.remove(interaction.user.id).catch(() => null);

    if (state.pairingIndex >= state.menuRoleIds.length) {
      state.step = 'CONFIRM';
    }

    await interaction.editReply(generateReactionRoleView());
  });

  componentCollector.on('end', (_, reason) => {
    if (reason !== 'COMPLETED') {
      interaction.editReply({ content: '⏱️ *This interaction has timed out. Please run the command again to start over.*', components: [] }).catch(() => null);
    }
  });
}

async function handleInfo(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const providedMenuId = interaction.options.getString('menu-id');
  const menus = await getAllReactionRoleMenusForGuild(interaction.guildId);

  if (menus.length === 0) {
    return interaction.editReply('There are no reaction role menus configured for this server.');
  }

  const generateMenuDetails = (menu: (typeof menus)[0]) => {
    const isEnabled = menu.enabled ?? true;

    return new ContainerBuilder()
      .setAccentColor(Colors.Blurple)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Reaction Role Menu Details\n**Menu ID:** \`${menu.id}\``))
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              [
                `**Status:** ${isEnabled ? '🟢 Enabled' : '🔴 Disabled'}`,
                `**Channel:** <#${menu.channelId}>`,
                `**Message ID:** ${menu.messageId}`,
                `**Mode:** ${menu.singleChoice ? 'Single Choice' : 'Multiple Choice'}`,
                `**Required Roles (${menu.requiredRoleIds.length}/20):**${menu.requiredRoleIds.map((roleId) => `\n- ${roleMention(roleId)}`).join('')}`,
                `**Roles (${menu.roles.length}/20):**${menu.roles.map((role) => `\n- ${role.emoji} ${roleMention(role.roleId)}`).join('')}`,
              ].join('\n'),
            ),
          )
          .setButtonAccessory(new ButtonBuilder().setLabel('Delete Menu').setCustomId(`rr_del_${menu.id}`).setStyle(ButtonStyle.Danger)),
      );
  };

  if (providedMenuId) {
    const targetMenu = menus.find((m) => m.id === providedMenuId);
    if (!targetMenu) {
      return interaction.editReply('Could not find a reaction role menu with the provided ID.');
    }
    return interaction.editReply({
      components: [generateMenuDetails(targetMenu).toJSON()],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  const overviewContainer = new ContainerBuilder()
    .setAccentColor(Colors.Blurple)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### Reaction Role Menus\nThere are currently **${menus.length}/20** menus configured for this server.\n\n*Select a menu from the dropdown below to inspect its details.*`,
      ),
    );

  let currentDisplay = overviewContainer.toJSON();

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('info_menu_select')
    .setPlaceholder('Select a menu to inspect...')
    .addOptions(
      menus.map((m) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`Menu in #${interaction.guild.channels.cache.get(m.channelId)?.name || 'unknown-channel'}`)
          .setDescription(`ID: ${m.id} | Roles: ${m.roles.length}`)
          .setValue(m.id),
      ),
    );

  const actionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const response = await interaction.editReply({
    components: [currentDisplay, actionRow.toJSON()],
    flags: [MessageFlags.IsComponentsV2],
  });

  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 600_000,
    idle: 180_000,
  });

  collector.on('collect', async (i) => {
    if (i.customId === 'info_menu_select') {
      const selectedMenu = menus.find((m) => m.id === i.values[0]);
      if (selectedMenu) {
        currentDisplay = generateMenuDetails(selectedMenu).toJSON();

        await i.update({
          components: [currentDisplay, actionRow.toJSON()],
          flags: [MessageFlags.IsComponentsV2],
        });
      }
    }
  });

  collector.on('end', (_, reason) => {
    if (reason === 'time') {
      selectMenu.setDisabled(true);

      const disabledRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

      interaction
        .editReply({
          components: [currentDisplay, disabledRow.toJSON()],
          flags: [MessageFlags.IsComponentsV2],
        })
        .catch(() => null);
      interaction
        .followUp({ content: '⏱️ *This interaction has timed out. Please run the command again to inspect other menus.*', flags: [MessageFlags.Ephemeral] })
        .catch(() => null);
    }
  });
}

async function handleResend(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const menuId = interaction.options.getString('menu-id', true);
  const targetChannelOption = interaction.options.getChannel('target-channel');

  const menu = await getReactionRoleMenuConfiguration(menuId);

  if (!menu) {
    return interaction.editReply({ content: 'Could not find a reaction role menu with the provided ID.' });
  }

  const targetChannelId = targetChannelOption ? targetChannelOption.id : menu.channelId;
  const targetChannel = await interaction.guild?.channels.fetch(targetChannelId).catch(() => null);

  if (!targetChannel || !targetChannel.isTextBased()) {
    return interaction.editReply({ content: 'Could not find or access the target channel.' });
  }

  const embed = new EmbedBuilder()
    .setTitle('Role Menu')
    .setDescription(`Click the buttons below to claim your roles!\n\n${menu.roles.map((r) => `${r.emoji} - <@&${r.roleId}>`).join('\n')}`)
    .setColor(Colors.Blurple);

  const buttonRows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let i = 0; i < menu.roles.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    const chunk = menu.roles.slice(i, i + 5);

    for (const role of chunk) {
      row.addComponents(new ButtonBuilder().setCustomId(`rr_sel_${role.roleId}`).setEmoji(role.emoji).setStyle(ButtonStyle.Secondary));
    }
    buttonRows.push(row);
  }

  const sentMessage = await targetChannel.send({ embeds: [embed], components: buttonRows }).catch(() => {
    interaction.editReply({ content: 'Failed to send the reaction role menu to the target channel. Please check my permissions and try again.' });
    return null;
  });

  if (!sentMessage) return;

  await updateReactionRoleMenuConfiguration(menuId, { channelId: targetChannel.id, messageId: sentMessage.id });

  await interaction.editReply({
    content: `The reaction role menu has been re-sent to <#${targetChannel.id}> with the new message ID ${sentMessage.id}.`,
  });
}

async function handleDelete(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const menuId = interaction.options.getString('menu-id', true);

  const menu = await getReactionRoleMenuConfiguration(menuId);

  if (!menu) {
    return interaction.editReply({ content: 'Could not find a reaction role menu with the provided ID.' });
  }

  await deleteReactionRoleMenuConfiguration(menuId);

  await interaction.editReply({
    content: 'The reaction role menu configuration has been deleted. The message will no longer function as a reaction role menu, but it will not be deleted.',
  });
}

async function handleToggle(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const menuId = interaction.options.getString('menu-id', false);
  const enabledOption = interaction.options.getBoolean('enabled', false);

  if (!menuId) {
    const menus = await getAllReactionRoleMenusForGuild(interaction.guildId);

    if (menus.length === 0) {
      return interaction.editReply('There are no reaction role menus configured for this server.');
    }

    await Promise.all(
      menus.map(async (menu) => {
        const newState = enabledOption !== null ? enabledOption : !menu.enabled;
        await updateReactionRoleMenuConfiguration(menu.id, { enabled: newState });
      }),
    );

    return interaction.editReply(`All reaction role menus have been ${enabledOption !== null ? (enabledOption ? 'enabled' : 'disabled') : 'toggled'}.`);
  }

  const menu = await getReactionRoleMenuConfiguration(menuId);

  if (!menu) {
    return interaction.editReply({ content: 'Could not find a reaction role menu with the provided ID.' });
  }

  const newState = enabledOption !== null ? enabledOption : !menu.enabled;
  await updateReactionRoleMenuConfiguration(menuId, { enabled: newState });

  await interaction.editReply({
    content: `The reaction role menu has been ${newState ? 'enabled' : 'disabled'}. The message will ${newState ? '' : 'no longer'} function as a reaction role menu${newState ? '' : ', but it will not be deleted'}.`,
  });
}
