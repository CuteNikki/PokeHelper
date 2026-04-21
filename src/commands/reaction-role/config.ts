import {
  ActionRowBuilder,
  ApplicationIntegrationType,
  ButtonBuilder,
  ButtonStyle,
  channelMention,
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

import { Command } from 'classes/base/command';

import {
  createReactionRoleMenuConfiguration,
  deleteReactionRoleMenuConfiguration,
  getAllReactionRoleMenusForGuild,
  getReactionRoleMenuConfiguration,
  updateReactionRoleMenuConfiguration,
} from 'database/reaction-role';
import { t } from 'i18next';

interface SetupState {
  step: 'MODE' | 'REQUIRED_ROLES' | 'CHANNEL' | 'MENU_ROLES' | 'EMOJI_PAIRING' | 'CONFIRM';
  singleChoice: boolean;
  requiredRoleIds: string[];
  channelId: string | null;
  menuRoleIds: string[];
  pairingIndex: number;
  roles: { emoji: string; roleId: string }[];
}

const MAX_MENUS_PER_GUILD = 20;
const MAX_ROLES_PER_MENU = 20;
const CHANNEL_NAME_LIMIT = 20;

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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
        const channelName = interaction.guild?.channels.cache.get(menu.channelId)?.name || '???';
        const displayChannelName = channelName.length > CHANNEL_NAME_LIMIT ? `${channelName.slice(0, CHANNEL_NAME_LIMIT)}...` : channelName;

        return {
          name: t('reactionRole.info.selectItem', {
            channel: displayChannelName,
            roles: menu.roles.length,
            total: MAX_MENUS_PER_GUILD,
            id: menu.id,
          }),

          value: menu.id,
        };
      });

      const filtered = choices.filter((choice) => choice.name.toLowerCase().includes(focusedOption.value.toLowerCase()));
      await interaction.respond(filtered.slice(0, 25));
    }
  },

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      return;
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
        await interaction.reply({
          components: [
            new ContainerBuilder().setAccentColor(Colors.Red).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('reactionRole.subcommand'))),
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

  if (existingMenus.length >= MAX_MENUS_PER_GUILD) {
    return interaction.editReply({
      content: t('reactionRole.setup.maximum', { total: MAX_MENUS_PER_GUILD }),
      components: [],
    });
  }

  function generateReactionRoleView(): InteractionReplyOptions & InteractionEditReplyOptions {
    const container = new ContainerBuilder().setAccentColor(Colors.Blurple);
    const components: (ContainerBuilder | ActionRowBuilder)[] = [container];

    switch (state.step) {
      case 'MODE':
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('reactionRole.setup.step1')));
        components.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('setup_single').setLabel(t('choice.single')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('setup_multi').setLabel(t('choice.multiple')).setStyle(ButtonStyle.Secondary),
          ),
        );
        break;

      case 'REQUIRED_ROLES':
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('reactionRole.setup.step2', { total: MAX_ROLES_PER_MENU })));
        components.push(
          new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
            new RoleSelectMenuBuilder()
              .setCustomId('setup_req_roles')
              .setMinValues(1)
              .setMaxValues(MAX_ROLES_PER_MENU)
              .setPlaceholder(t('reactionRole.setup.requiredPlaceholder')),
          ),
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('setup_skip_req_roles').setLabel(t('reactionRole.setup.skipRequired')).setStyle(ButtonStyle.Secondary),
          ),
        );
        break;

      case 'CHANNEL':
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('reactionRole.setup.step3')));
        components.push(
          new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
            new ChannelSelectMenuBuilder()
              .setCustomId('setup_channel')
              .setChannelTypes(ChannelType.GuildText)
              .setPlaceholder(t('reactionRole.setup.channelPlaceholder')),
          ),
        );
        break;

      case 'MENU_ROLES':
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('reactionRole.setup.step4', { total: MAX_ROLES_PER_MENU })));
        components.push(
          new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
            new RoleSelectMenuBuilder()
              .setCustomId('setup_menu_roles')
              .setMinValues(1)
              .setMaxValues(MAX_ROLES_PER_MENU)
              .setPlaceholder(t('reactionRole.setup.rolePlaceholder')),
          ),
        );
        break;

      case 'EMOJI_PAIRING': {
        const currentRole = state.menuRoleIds[state.pairingIndex];
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            t('reactionRole.setup.step5', {
              current: state.pairingIndex + 1,
              total: state.menuRoleIds.length,
              role: roleMention(currentRole!),
            }),
          ),
        );
        break;
      }

      case 'CONFIRM':
        container.setAccentColor(Colors.Green).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            t('reactionRole.setup.step6', {
              details: [
                t('reactionRole.info.channel', { channel: channelMention(state.channelId!) }),
                t('reactionRole.info.choice', { choice: state.singleChoice ? t('choice.single') : t('choice.multiple') }),
                state.requiredRoleIds.length > 0
                  ? t('reactionRole.info.required', {
                      roles: state.requiredRoleIds.map((roleId) => roleMention(roleId)).join(', '),
                      count: state.requiredRoleIds.length,
                      total: MAX_ROLES_PER_MENU,
                    })
                  : t('reactionRole.info.noRequired', { total: MAX_ROLES_PER_MENU }),
                state.roles.length > 0
                  ? t('reactionRole.info.roles', {
                      roles: state.roles.map((role) => t('reactionRole.info.roleItem', { emoji: role.emoji, role: roleMention(role.roleId) })).join(', '),
                      count: state.roles.length,
                      total: MAX_ROLES_PER_MENU,
                    })
                  : t('reactionRole.info.noRoles', { total: MAX_ROLES_PER_MENU }),
              ].join('\n'),
            }),
          ),
        );
        components.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('setup_save').setLabel(t('reactionRole.setup.save')).setStyle(ButtonStyle.Success),
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

  componentCollector.on('collect', (componentInteraction) => {
    void (async () => {
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
            await componentInteraction.followUp({ content: t('reactionRole.setup.invalidChannel'), flags: [MessageFlags.Ephemeral] });
            isSaving = false;
            return;
          }

          const embed = new EmbedBuilder()
            .setTitle(t('reactionRole.message.title'))
            .setDescription(
              `${t('reactionRole.message.description')}\n\n${state.roles.map((r) => t('reactionRole.message.item', { emoji: r.emoji, role: roleMention(r.roleId) })).join('\n')}`,
            )
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
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('reactionRole.setup.complete', { channel: channelMention(state.channelId!) })));

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
    })().catch(() => null);
  });

  reactionCollector.on('collect', (reaction) => {
    if (state.step !== 'EMOJI_PAIRING') return;

    const roleId = state.menuRoleIds[state.pairingIndex];

    const emoji = reaction.emoji.toString();
    if (!emoji || !roleId) return;
    state.roles.push({ emoji, roleId });
    state.pairingIndex++;

    void reaction.message.reactions.removeAll().catch(() => null);

    if (state.pairingIndex >= state.menuRoleIds.length) {
      state.step = 'CONFIRM';
    }

    void interaction.editReply(generateReactionRoleView()).catch(() => null);
  });

  componentCollector.on('end', (_, reason) => {
    if (reason !== 'COMPLETED') {
      void interaction.editReply({ content: t('reactionRole.setup.timeout'), components: [] }).catch(() => null);
    }
  });
}

async function handleInfo(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const providedMenuId = interaction.options.getString('menu-id');
  const menus = await getAllReactionRoleMenusForGuild(interaction.guildId);

  if (menus.length === 0) {
    return interaction.editReply(t('reactionRole.none'));
  }

  const generateMenuDetails = (menu: (typeof menus)[0]) => {
    const isEnabled = menu.enabled ?? true;

    return new ContainerBuilder()
      .setAccentColor(Colors.Blurple)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('reactionRole.info.title', { id: menu.id })))
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              [
                t('reactionRole.info.status', { state: isEnabled ? t('state.enabled') : t('state.disabled') }),
                t('reactionRole.info.channel', { channel: channelMention(menu.channelId) }),
                t('reactionRole.info.messageId', { id: menu.messageId }),
                t('reactionRole.info.choice', { choice: menu.singleChoice ? t('choice.single') : t('choice.multiple') }),
                menu.requiredRoleIds.length > 0
                  ? t('reactionRole.info.required', {
                      roles: menu.requiredRoleIds.map((roleId) => roleMention(roleId)).join(', '),
                      count: menu.requiredRoleIds.length,
                      total: MAX_ROLES_PER_MENU,
                    })
                  : t('reactionRole.info.noRequired', { total: MAX_ROLES_PER_MENU }),
                menu.roles.length > 0
                  ? t('reactionRole.info.roles', {
                      roles: menu.roles.map((role) => t('reactionRole.info.roleItem', { emoji: role.emoji, role: roleMention(role.roleId) })).join(', '),
                      count: menu.roles.length,
                      total: MAX_ROLES_PER_MENU,
                    })
                  : t('reactionRole.info.noRoles', { total: MAX_ROLES_PER_MENU }),
              ].join('\n'),
            ),
          )
          .setButtonAccessory(new ButtonBuilder().setLabel(t('reactionRole.info.deleteMenu')).setCustomId(`rr_del_${menu.id}`).setStyle(ButtonStyle.Danger)),
      );
  };

  if (providedMenuId) {
    const targetMenu = menus.find((m) => m.id === providedMenuId);
    if (!targetMenu) {
      return interaction.editReply(t('reactionRole.notFound'));
    }
    return interaction.editReply({
      components: [generateMenuDetails(targetMenu).toJSON()],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  const overviewContainer = new ContainerBuilder().setAccentColor(Colors.Blurple).addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      t('reactionRole.info.overview', {
        count: menus.length,
        total: MAX_MENUS_PER_GUILD,
      }),
    ),
  );

  let currentDisplay = overviewContainer.toJSON();

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('info_menu_select')
    .setPlaceholder(t('reactionRole.info.selectPlaceholder'))
    .addOptions(
      menus.map((m) => {
        const channelName = interaction.guild?.channels.cache.get(m.channelId)?.name || '???';
        const displayChannelName = channelName.length > CHANNEL_NAME_LIMIT ? `${channelName.slice(0, CHANNEL_NAME_LIMIT)}...` : channelName;

        return new StringSelectMenuOptionBuilder()
          .setLabel(
            t('reactionRole.info.selectItem', {
              channel: displayChannelName,
              roles: m.roles.length,
              total: MAX_ROLES_PER_MENU,
              id: m.id,
            }),
          )
          .setValue(m.id);
      }),
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

  collector.on('collect', (i) => {
    if (i.customId === 'info_menu_select') {
      const selectedMenu = menus.find((m) => m.id === i.values[0]);
      if (selectedMenu) {
        currentDisplay = generateMenuDetails(selectedMenu).toJSON();

        void i
          .update({
            components: [currentDisplay, actionRow.toJSON()],
            flags: [MessageFlags.IsComponentsV2],
          })
          .catch(() => null);
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
      interaction.followUp({ content: t('reactionRole.info.timeout'), flags: [MessageFlags.Ephemeral] }).catch(() => null);
    }
  });
}

async function handleResend(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const menuId = interaction.options.getString('menu-id', true);
  const targetChannelOption = interaction.options.getChannel('target-channel');

  const menu = await getReactionRoleMenuConfiguration(menuId);
  if (!menu) {
    return interaction.editReply({ content: t('reactionRole.notFound') });
  }

  const targetChannelId = targetChannelOption ? targetChannelOption.id : menu.channelId;
  const targetChannel = await interaction.guild?.channels.fetch(targetChannelId).catch(() => null);
  if (!targetChannel || !targetChannel.isTextBased()) {
    return interaction.editReply({ content: t('reactionRole.resend.channel') });
  }

  const embed = new EmbedBuilder()
    .setTitle(t('reactionRole.message.title'))
    .setDescription(
      `${t('reactionRole.message.description')}\n\n${menu.roles.map((r) => t('reactionRole.message.item', { emoji: r.emoji, role: roleMention(r.roleId) })).join('\n')}`,
    )
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
    return interaction.editReply({ content: t('reactionRole.resend.failed', { channel: channelMention(targetChannel.id) }) });
  });
  if (!sentMessage) return;

  await updateReactionRoleMenuConfiguration(menuId, { channelId: targetChannel.id, messageId: sentMessage.id });
  await interaction.editReply({
    content: t('reactionRole.resend.success', { channel: channelMention(targetChannel.id) }),
  });
}

async function handleDelete(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const menuId = interaction.options.getString('menu-id', true);

  const menu = await getReactionRoleMenuConfiguration(menuId);

  if (!menu) {
    return interaction.editReply({ content: t('reactionRole.notFound') });
  }

  await deleteReactionRoleMenuConfiguration(menuId);

  await interaction.editReply({
    content: t('reactionRole.delete.success'),
  });
}

async function handleToggle(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const menuId = interaction.options.getString('menu-id', false);
  const enabledOption = interaction.options.getBoolean('enabled', false);

  if (!menuId) {
    const menus = await getAllReactionRoleMenusForGuild(interaction.guildId);

    if (menus.length === 0) {
      return interaction.editReply({ content: t('reactionRole.none') });
    }

    await Promise.all(
      menus.map(async (menu) => {
        const newState = enabledOption !== null ? enabledOption : !menu.enabled;
        await updateReactionRoleMenuConfiguration(menu.id, { enabled: newState });
      }),
    );

    return interaction.editReply({
      content: t('reactionRole.toggle.all', {
        state: enabledOption !== null ? (enabledOption ? t('state.enabled') : t('state.disabled')) : t('state.toggled'),
      }),
    });
  }

  const menu = await getReactionRoleMenuConfiguration(menuId);
  if (!menu) {
    return interaction.editReply({ content: t('reactionRole.notFound') });
  }

  const newState = enabledOption !== null ? enabledOption : !menu.enabled;
  await updateReactionRoleMenuConfiguration(menuId, { enabled: newState });

  await interaction.editReply({
    content:
      t('reactionRole.toggle.single', { state: newState ? t('state.enabled') : t('state.disabled') }) +
      '\n' +
      t(`reactionRole.toggle.${newState ? 'function' : 'noFunction'}`),
  });
}
