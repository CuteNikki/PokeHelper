import {
  ActionRowBuilder,
  bold,
  ButtonBuilder,
  ButtonStyle,
  channelMention,
  ChannelType,
  ContainerBuilder,
  type Guild,
  MessageFlags,
  messageLink,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  subtext,
  TextDisplayBuilder,
} from 'discord.js';

import { getFeatureSwitches } from 'database/features';
import { getRoleMenu, getRoleMenus, setRoleMenuRole, updateRoleMenu, type RoleMenu } from 'database/roleMenu';

import { buttonIcon } from 'utility/emojis';
import type { Translate } from 'utility/i18next';
import { formatNumber } from 'utility/duration';
import type { ResponsePayload } from 'utility/response';
import { DiscordLimits } from 'utility/discordLimits';
import { MAX_EMOJI_LENGTH, parseEmoji } from 'utility/emoji';
import { MAX_MENU_ROLES, MAX_ROLE_MENUS, moveRoleMenu, ROLE_MENU_CHANNEL_PERMISSIONS, syncRoleMenuMessage } from 'utility/roleMenu';
import { buildSwitchSection, createSettingsPanel, formatPermissions, missingBotPermissions, type SettingsPanel } from 'utility/settings';
import { ThemeColors } from 'utility/theme';

/** Each menu has its own panel, with the menu's ID after this. */
export const ROLE_MENU_PANEL_PREFIX = 'rolemenu-';
/** Custom IDs of the buttons and selects around the panels, like `rolemenu:delete:<menu>`. */
export const ROLE_MENU_CUSTOM_ID = {
  open: 'rolemenu:open',
  list: 'rolemenu:list',
  /** Turns all menus on or off at once. */
  toggle: 'rolemenu:toggle',
  repost: 'rolemenu:repost:',
  delete: 'rolemenu:delete:',
  confirmDelete: 'rolemenu:confirm-delete:',
  back: 'rolemenu:back:',
} as const;

export const MAX_NAME_LENGTH = 50;
const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 1000;
/** How many roles name a menu that has no name or title. */
const ROLES_IN_NAME = 3;
const SINGLE = 'single';
const MULTIPLE = 'multiple';

/** How a menu is called for admins: by its name, or for menus from before names, by its title or its first roles. */
export function roleMenuName(menu: RoleMenu, guild: Guild, t: Translate): string {
  if (menu.name) return menu.name;
  if (menu.title) return menu.title;

  const roles = menu.roles.map((role) => guild.roles.cache.get(role.roleId)?.name).filter((name) => name !== undefined);
  if (roles.length === 0) return t('roleMenu.list.unnamed');
  const shown = roles.slice(0, ROLES_IN_NAME).join(', ');
  return roles.length > ROLES_IN_NAME ? t('roleMenu.list.moreRoles', { roles: shown, count: roles.length - ROLES_IN_NAME }) : shown;
}

/** Where the menu is posted, or why it isn't. */
function status(menu: RoleMenu, guild: Guild, t: Translate): string {
  const channel = channelMention(menu.channelId);
  if (menu.roles.length === 0) return t('roleMenu.settings.status.noRoles', { channel });
  if (menu.messageId) return t('roleMenu.settings.status.posted', { link: messageLink(menu.channelId, menu.messageId, guild.id) });
  if (!guild.channels.cache.has(menu.channelId)) return t('settings.warning', { warning: t('roleMenu.settings.status.missingChannel') });
  const missing = missingBotPermissions(guild, menu.channelId, ROLE_MENU_CHANNEL_PERMISSIONS);
  if (missing.length > 0) {
    return t('settings.warning', { warning: t('roleMenu.settings.status.missingPermissions', { channel, permissions: formatPermissions(missing, t) }) });
  }
  return t('settings.warning', { warning: t('roleMenu.settings.status.notPosted', { channel }) });
}

/** The settings panel of one role menu. Every change is also made to the posted message right away. */
export function getRoleMenuSettings(menuId: string): SettingsPanel {
  return createSettingsPanel<RoleMenu>({
    id: `${ROLE_MENU_PANEL_PREFIX}${menuId}`,
    title: (t) => t('roleMenu.settings.title'),
    permissions: ['ManageGuild'],
    categories: [
      { id: 'roles', label: (t) => t('roleMenu.settings.categories.roles'), icon: 'drama' },
      { id: 'text', label: (t) => t('roleMenu.settings.categories.text'), icon: 'file-text' },
      { id: 'general', label: (t) => t('roleMenu.settings.categories.general'), icon: 'settings' },
    ],
    // The panel's custom IDs carry the menu's ID, so make sure it's a menu of this server
    load: async (guildId) => {
      const menu = await getRoleMenu(menuId);
      return menu?.guildId === guildId ? menu : null;
    },
    notConfigured: (t) => t('roleMenu.notFound'),
    // Role menus are server settings, so there's always a server
    header: (menu, { guild }, t) => (guild ? `${bold(roleMenuName(menu, guild, t))}\n${status(menu, guild, t)}` : null),
    footer: (menu, t) => [
      new ButtonBuilder()
        .setCustomId(`${ROLE_MENU_CUSTOM_ID.repost}${menu.id}`)
        .setLabel(t('roleMenu.settings.repost'))
        .setEmoji(buttonIcon('send'))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(menu.roles.length === 0),
      new ButtonBuilder()
        .setCustomId(`${ROLE_MENU_CUSTOM_ID.delete}${menu.id}`)
        .setLabel(t('roleMenu.settings.delete'))
        .setEmoji(buttonIcon('trash-2'))
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(ROLE_MENU_CUSTOM_ID.list).setLabel(t('roleMenu.settings.back')).setStyle(ButtonStyle.Secondary),
    ],
    onSaved: async ({ guild }) => {
      if (guild) await syncRoleMenuMessage(guild, menuId);
    },
    tips: (t) => t('roleMenu.tips', { returnObjects: true }),
    settings: [
      {
        type: 'textEntries',
        key: 'roles',
        category: 'roles',
        target: 'role',
        assignable: true,
        max: MAX_MENU_ROLES,
        label: (t) => t('roleMenu.settings.roles.label'),
        description: (t) => t('roleMenu.settings.roles.description'),
        formatValue: (emoji: string) => emoji,
        formatEntry: (role, emoji) => `${emoji} ${role}`,
        input: {
          label: (t) => t('roleMenu.settings.roles.input'),
          placeholder: (t) => t('roleMenu.settings.roles.placeholder'),
          maxLength: MAX_EMOJI_LENGTH,
          parse: (input, guild) => parseEmoji(input, guild.emojis.cache.values()),
          invalid: (t) => t('roleMenu.settings.roles.invalid'),
        },
        get: (menu) => menu.roles.map((role) => ({ targetId: role.roleId, value: role.emoji })),
        set: (_guildId, roleId, emoji) => setRoleMenuRole(menuId, roleId, emoji),
      },
      {
        type: 'text',
        key: 'title',
        category: 'text',
        maxLength: MAX_TITLE_LENGTH,
        label: (t) => t('roleMenu.settings.messageTitle.label'),
        description: (t) => t('roleMenu.settings.messageTitle.description'),
        defaultText: (t) => t('roleMenu.message.title'),
        get: (menu) => menu.title,
        set: (_guildId, title) => updateRoleMenu(menuId, { title }),
      },
      {
        type: 'text',
        key: 'description',
        category: 'text',
        maxLength: MAX_DESCRIPTION_LENGTH,
        paragraph: true,
        label: (t) => t('roleMenu.settings.messageDescription.label'),
        description: (t) => t('roleMenu.settings.messageDescription.description'),
        defaultText: (t) => t('roleMenu.message.description'),
        get: (menu) => menu.description,
        set: (_guildId, description) => updateRoleMenu(menuId, { description }),
      },
      {
        type: 'text',
        key: 'name',
        category: 'general',
        maxLength: MAX_NAME_LENGTH,
        label: (t) => t('roleMenu.settings.name.label'),
        description: (t) => t('roleMenu.settings.name.description'),
        get: (menu) => menu.name,
        set: (_guildId, name) => updateRoleMenu(menuId, { name }),
      },
      {
        type: 'channel',
        key: 'channel',
        category: 'general',
        channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
        required: true,
        botPermissions: ROLE_MENU_CHANNEL_PERMISSIONS,
        label: (t) => t('roleMenu.settings.channel.label'),
        description: (t) => t('roleMenu.settings.channel.description'),
        get: (menu) => menu.channelId,
        set: async (_guildId, channelId, { guild }) => {
          if (channelId && guild) await moveRoleMenu(guild, menuId, channelId);
        },
      },
      {
        type: 'choice',
        key: 'mode',
        category: 'general',
        defaultValue: MULTIPLE,
        options: [
          { value: MULTIPLE, label: (t) => t('choice.multiple') },
          { value: SINGLE, label: (t) => t('choice.single') },
        ],
        label: (t) => t('roleMenu.settings.mode.label'),
        description: (t) => t('roleMenu.settings.mode.description'),
        get: (menu) => (menu.singleChoice ? SINGLE : MULTIPLE),
        set: (_guildId, mode) => updateRoleMenu(menuId, { singleChoice: mode === SINGLE }),
      },
      {
        type: 'boolean',
        key: 'enabled',
        category: 'general',
        defaultValue: true,
        label: (t) => t('roleMenu.settings.enabled.label'),
        description: (t) => t('roleMenu.settings.enabled.description'),
        get: (menu) => menu.enabled,
        set: (_guildId, enabled) => updateRoleMenu(menuId, { enabled }),
      },
      {
        type: 'roles',
        key: 'requiredRoles',
        category: 'general',
        max: MAX_MENU_ROLES,
        label: (t) => t('roleMenu.settings.requiredRoles.label'),
        description: (t) => t('roleMenu.settings.requiredRoles.description'),
        get: (menu) => menu.requiredRoleIds,
        set: (_guildId, requiredRoleIds) => updateRoleMenu(menuId, { requiredRoleIds }),
      },
    ],
  });
}

/** The list of a server's role menus, with a select to open one. */
export async function renderRoleMenuList(guild: Guild, t: Translate): Promise<ResponsePayload> {
  const [menus, { roleMenusEnabled }] = await Promise.all([getRoleMenus(guild.id), getFeatureSwitches(guild.id)]);
  // The switch for all menus at once, above the list, as each menu has its own too
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('roleMenu.list.title')))
    // Large, so the title, the switch and the list stand apart, like in the settings panels
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addSectionComponents(
      buildSwitchSection(t('roleMenu.list.enabled.label'), t('roleMenu.list.enabled.description'), roleMenusEnabled, ROLE_MENU_CUSTOM_ID.toggle, t),
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));

  if (menus.length === 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('roleMenu.list.none')));
    return { components: [container], flags: [MessageFlags.IsComponentsV2] };
  }

  const lines = menus.map((menu, index) =>
    t('roleMenu.list.item', {
      position: index + 1,
      name: roleMenuName(menu, guild, t),
      channel: channelMention(menu.channelId),
      roles: t('roleMenu.list.roles', { count: menu.roles.length }),
    }),
  );
  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [subtext(t('roleMenu.list.count', { count: menus.length, max: formatNumber(MAX_ROLE_MENUS, t) })), ...lines].join('\n'),
      ),
    )
    // Large, like before the buttons at the bottom of the settings panels
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(ROLE_MENU_CUSTOM_ID.open)
          .setPlaceholder(t('roleMenu.list.placeholder'))
          .addOptions(
            menus.map((menu) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(roleMenuName(menu, guild, t).slice(0, DiscordLimits.optionLabelLength))
                .setDescription(
                  t('roleMenu.list.optionDescription', {
                    channel: `#${guild.channels.cache.get(menu.channelId)?.name ?? '?'}`,
                    roles: t('roleMenu.list.roles', { count: menu.roles.length }),
                  }).slice(0, DiscordLimits.optionLabelLength),
                )
                .setValue(menu.id),
            ),
          ),
      ),
    );

  // Menus are listed with their channel, which mustn't ping anyone
  return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}
