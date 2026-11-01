import {
  ActionRowBuilder,
  ApplicationIntegrationType,
  ButtonBuilder,
  ButtonStyle,
  channelMention,
  ChannelSelectMenuBuilder,
  ChannelType,
  ChatInputCommandInteraction,
  ComponentType,
  ContainerBuilder,
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
  type PermissionsString,
} from 'discord.js';

import { Command } from 'classes/base/command';

import {
  createReactionRoleMenuConfiguration,
  deleteReactionRoleMenuConfiguration,
  getAllReactionRoleMenusForGuild,
  getReactionRoleMenuConfiguration,
  updateReactionRoleMenuConfiguration,
} from 'database/reaction-role';

import { getTranslate, type Translate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { buildRoleMenuMessage } from 'utility/reactionRoleMenu';
import { createResponse, logFailure, sendError, sendResponse } from 'utility/response';
import { canGiveRole } from 'utility/roles';
import { formatPermissions, missingBotPermissions, unassignableReason } from 'utility/settings';
import { ThemeColors } from 'utility/theme';

interface SetupState {
  step: 'MODE' | 'REQUIRED_ROLES' | 'CHANNEL' | 'MENU_ROLES' | 'EMOJI_PAIRING' | 'CONFIRM';
  singleChoice: boolean;
  requiredRoleIds: string[];
  channelId: string | null;
  menuRoleIds: string[];
  pairingIndex: number;
  roles: { emoji: string; roleId: string }[];
}

type Menu = Awaited<ReturnType<typeof getAllReactionRoleMenusForGuild>>[number];

const MAX_MENUS_PER_GUILD = 20;
const MAX_ROLES_PER_MENU = 20;
const CHANNEL_NAME_LIMIT = 20;
/** What the bot needs in the channel a menu is posted in. */
const MENU_CHANNEL_PERMISSIONS: PermissionsString[] = ['ViewChannel', 'SendMessages'];

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

    const t = getTranslate(interaction.locale);
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'menu-id') {
      const menus = await getAllReactionRoleMenusForGuild(interaction.guildId);
      const choices = menus.map((menu) => ({ name: menuLabel(interaction.guild.channels.cache.get(menu.channelId)?.name, menu, t), value: menu.id }));

      const filtered = choices.filter((choice) => choice.name.toLowerCase().includes(focusedOption.value.toLowerCase()));
      await interaction.respond(filtered.slice(0, 25));
    }
  },

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      return;
    }

    const t = getTranslate(interaction.locale);

    switch (interaction.options.getSubcommand()) {
      case 'setup':
        return handleSetup(interaction, t);
      case 'info':
        return handleInfo(interaction, t);
      case 're-send':
        return handleResend(interaction, t);
      case 'toggle':
        return handleToggle(interaction, t);
      case 'delete':
        return handleDelete(interaction, t);
    }
  },
});

/** How a menu is listed in the autocomplete and the info select, like `Menu in roles | 4/20 roles | ID: …`. */
function menuLabel(channelName: string | undefined, menu: Menu, t: Translate) {
  const name = channelName ?? '???';
  return t('reactionRole.info.selectItem', {
    channel: name.length > CHANNEL_NAME_LIMIT ? `${name.slice(0, CHANNEL_NAME_LIMIT)}...` : name,
    roles: menu.roles.length,
    total: MAX_ROLES_PER_MENU,
    id: menu.id,
  });
}

export async function handleSetup(interaction: ChatInputCommandInteraction<'cached'>, t: Translate) {
  // Public, as the emoji are picked by reacting to this message, which ephemeral messages don't allow
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
    return interaction.editReply(createResponse(t('reactionRole.setup.maximum', { total: MAX_MENUS_PER_GUILD }), 'error'));
  }

  function generateReactionRoleView(): InteractionReplyOptions & InteractionEditReplyOptions {
    const container = new ContainerBuilder().setAccentColor(ThemeColors.info);
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
        container.setAccentColor(ThemeColors.success).addTextDisplayComponents(
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

    // Roles are mentioned in the steps, which mustn't ping everyone who has them
    return { components: components.map((component) => component.toJSON()), flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
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
      // The setup message is public, so only the user who started the setup may use it
      if (componentInteraction.user.id !== interaction.user.id) {
        await sendError(componentInteraction, getTranslate(componentInteraction.locale)('system.button.authorOnly'));
        return;
      }

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

          const targetChannel = await interaction.guild.channels.fetch(state.channelId!).catch(() => null);
          if (!targetChannel || !targetChannel.isTextBased()) {
            await sendError(componentInteraction, t('reactionRole.setup.invalidChannel'));
            isSaving = false;
            return;
          }

          // Posted for everyone, so in the server's language
          const sentMessage = await targetChannel.send(buildRoleMenuMessage(state.roles, getTranslate(interaction.guild.preferredLocale)));

          await createReactionRoleMenuConfiguration(
            interaction.guildId,
            state.channelId!,
            sentMessage.id,
            state.roles,
            state.singleChoice,
            state.requiredRoleIds,
          );

          await interaction.editReply(createResponse(t('reactionRole.setup.complete', { channel: channelMention(state.channelId!) }), 'success'));
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
          const channelId = componentInteraction.values[0];
          // The select shows the channels the user can see, which may include ones the bot can't post in
          const missing = channelId ? missingBotPermissions(interaction.guild, channelId, MENU_CHANNEL_PERMISSIONS) : [];
          if (channelId && missing.length > 0) {
            await sendError(
              componentInteraction,
              t('settings.channel.botPermissionsRefused', { channel: channelMention(channelId), permissions: formatPermissions(missing, t) }),
            );
            return;
          }

          state.channelId = channelId ?? null;
          state.step = 'MENU_ROLES';
          await componentInteraction.update(generateReactionRoleView());
        }

        if (componentInteraction.customId === 'setup_menu_roles' && componentInteraction.isRoleSelectMenu()) {
          // Roles the bot can't give would make their buttons fail, so they're refused right away
          const problems = componentInteraction.roles
            .filter((role) => !canGiveRole(interaction.guild, role.id))
            .map((role) =>
              t('reactionRole.setup.roleProblem', { role: roleMention(role.id), reason: unassignableReason(interaction.guild, role.id, t) ?? '' }),
            );
          if (problems.length > 0) {
            await sendError(componentInteraction, t('reactionRole.setup.cantAssign', { roles: problems.join('\n') }));
            return;
          }

          state.menuRoleIds = componentInteraction.roles.sort((a, b) => a.position - b.position).map((role) => role.id);
          state.pairingIndex = 0;
          state.step = 'EMOJI_PAIRING';
          await componentInteraction.update(generateReactionRoleView());
        }
      }
    })().catch(async (error: unknown) => {
      logger.error(error, 'Failed to handle the reaction role setup');
      await sendError(componentInteraction, getTranslate(componentInteraction.locale)('system.button.error'));
    });
  });

  reactionCollector.on('collect', (reaction) => {
    if (state.step !== 'EMOJI_PAIRING') return;

    const roleId = state.menuRoleIds[state.pairingIndex];

    const emoji = reaction.emoji.toString();
    if (!emoji || !roleId) return;
    state.roles.push({ emoji, roleId });
    state.pairingIndex++;

    // Fails without the Manage Messages permission, which only leaves the reaction behind
    void reaction.message.reactions.removeAll().catch(logFailure('Failed to clear reactions on reaction role setup message'));

    if (state.pairingIndex >= state.menuRoleIds.length) {
      state.step = 'CONFIRM';
    }

    void interaction.editReply(generateReactionRoleView()).catch(logFailure('Failed to update reaction role setup message'));
  });

  componentCollector.on('end', (_, reason) => {
    if (reason !== 'COMPLETED') {
      reactionCollector.stop(reason);
      // The setup message uses Components V2, which doesn't allow plain content
      void interaction.editReply(createResponse(t('reactionRole.setup.timeout'), 'warning')).catch(logFailure('Failed to show reaction role setup timeout'));
    }
  });
}

async function handleInfo(interaction: ChatInputCommandInteraction<'cached'>, t: Translate) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const providedMenuId = interaction.options.getString('menu-id');
  const menus = await getAllReactionRoleMenusForGuild(interaction.guildId);

  if (menus.length === 0) {
    return interaction.editReply(createResponse(t('reactionRole.none'), 'info'));
  }

  const generateMenuDetails = (menu: Menu) => {
    const isEnabled = menu.enabled ?? true;

    return new ContainerBuilder()
      .setAccentColor(ThemeColors.info)
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
      return interaction.editReply(createResponse(t('reactionRole.notFound'), 'error'));
    }
    return interaction.editReply({
      components: [generateMenuDetails(targetMenu).toJSON()],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  const overviewContainer = new ContainerBuilder().setAccentColor(ThemeColors.info).addTextDisplayComponents(
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
      menus.map((m) => new StringSelectMenuOptionBuilder().setLabel(menuLabel(interaction.guild.channels.cache.get(m.channelId)?.name, m, t)).setValue(m.id)),
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
          .catch(logFailure('Failed to update reaction role info message'));
      }
    }
  });

  collector.on('end', (_, reason) => {
    // The idle limit is shorter than the time limit, so it's usually the one that ends the collector
    if (reason === 'time' || reason === 'idle') {
      selectMenu.setDisabled(true);
      const disabledRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
      interaction
        .editReply({
          components: [currentDisplay, disabledRow.toJSON()],
          flags: [MessageFlags.IsComponentsV2],
        })
        .catch(logFailure('Failed to disable reaction role info menu'));
      void sendResponse(interaction, createResponse(t('reactionRole.info.timeout'), 'warning'), { ephemeral: true });
    }
  });
}

async function handleResend(interaction: ChatInputCommandInteraction<'cached'>, t: Translate) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const menuId = interaction.options.getString('menu-id', true);
  const targetChannelOption = interaction.options.getChannel('target-channel');

  const menu = await getReactionRoleMenuConfiguration(menuId);
  if (!menu) {
    return interaction.editReply(createResponse(t('reactionRole.notFound'), 'error'));
  }

  const targetChannelId = targetChannelOption ? targetChannelOption.id : menu.channelId;
  const targetChannel = await interaction.guild.channels.fetch(targetChannelId).catch(() => null);
  if (!targetChannel || !targetChannel.isTextBased()) {
    return interaction.editReply(createResponse(t('reactionRole.resend.channel'), 'error'));
  }

  // Posted for everyone, so in the server's language
  const sentMessage = await targetChannel.send(buildRoleMenuMessage(menu.roles, getTranslate(interaction.guild.preferredLocale))).catch(() => null);
  if (!sentMessage) {
    return interaction.editReply(createResponse(t('reactionRole.resend.failed', { channel: channelMention(targetChannel.id) }), 'error'));
  }

  await updateReactionRoleMenuConfiguration(menuId, { channelId: targetChannel.id, messageId: sentMessage.id });
  await interaction.editReply(createResponse(t('reactionRole.resend.success', { channel: channelMention(targetChannel.id) }), 'success'));
}

async function handleDelete(interaction: ChatInputCommandInteraction<'cached'>, t: Translate) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const menuId = interaction.options.getString('menu-id', true);
  const menu = await getReactionRoleMenuConfiguration(menuId);

  if (!menu) {
    return interaction.editReply(createResponse(t('reactionRole.notFound'), 'error'));
  }

  await deleteReactionRoleMenuConfiguration(menuId);
  await interaction.editReply(createResponse(t('reactionRole.delete.success'), 'warning'));
}

async function handleToggle(interaction: ChatInputCommandInteraction<'cached'>, t: Translate) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const menuId = interaction.options.getString('menu-id', false);
  const enabledOption = interaction.options.getBoolean('enabled', false);

  if (!menuId) {
    const menus = await getAllReactionRoleMenusForGuild(interaction.guildId);

    if (menus.length === 0) {
      return interaction.editReply(createResponse(t('reactionRole.none'), 'info'));
    }

    await Promise.all(
      menus.map(async (menu) => {
        const newState = enabledOption !== null ? enabledOption : !menu.enabled;
        await updateReactionRoleMenuConfiguration(menu.id, { enabled: newState });
      }),
    );

    const state = enabledOption !== null ? (enabledOption ? t('state.enabled') : t('state.disabled')) : t('state.toggled');
    return interaction.editReply(createResponse(t('reactionRole.toggle.all', { state }), 'success'));
  }

  const menu = await getReactionRoleMenuConfiguration(menuId);
  if (!menu) {
    return interaction.editReply(createResponse(t('reactionRole.notFound'), 'error'));
  }

  const newState = enabledOption !== null ? enabledOption : !menu.enabled;
  await updateReactionRoleMenuConfiguration(menuId, { enabled: newState });

  const content = [
    t('reactionRole.toggle.single', { id: menu.id, state: newState ? t('state.enabled') : t('state.disabled') }),
    t(newState ? 'reactionRole.toggle.function' : 'reactionRole.toggle.noFunction'),
  ].join('\n');
  await interaction.editReply(createResponse(content, 'success'));
}
