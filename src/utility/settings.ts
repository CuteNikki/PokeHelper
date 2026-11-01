import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  channelMention,
  ChannelSelectMenuBuilder,
  ContainerBuilder,
  MessageFlags,
  roleMention,
  RoleSelectMenuBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type ChannelType,
  type Guild,
  type PermissionsString,
} from 'discord.js';
import { t } from 'i18next';

import type { ResponsePayload } from 'utility/response';
import { createResponse } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/** Custom IDs of settings components are `settings:<panel>:<setting>`. */
export const SETTINGS_CUSTOM_ID_PREFIX = 'settings:';

interface BaseSetting<C, V> {
  /** Identifies the setting within its panel, used in the custom ID. */
  key: string;
  label: () => string;
  description: () => string;
  /** The value a new configuration starts with, shown under the description. */
  defaultValue?: V;
  /** Read the current value from the configuration. */
  get: (config: C) => V;
  /** Save a new value. */
  set: (guildId: string, value: V) => Promise<unknown>;
}

/** A boolean, toggled with a button. */
export type BooleanSetting<C> = BaseSetting<C, boolean> & { type: 'boolean' };
/** One of a few options, cycled through with a button. */
export type ChoiceSetting<C> = BaseSetting<C, string> & { type: 'choice'; options: { value: string; label: () => string }[] };
/** A channel, picked with a channel select. Without `required`, the selection can be cleared. */
export type ChannelSetting<C> = BaseSetting<C, string | null> & { type: 'channel'; channelTypes: ChannelType[]; required?: boolean };
/** A role, picked with a role select. Without `required`, the selection can be cleared. */
export type RoleSetting<C> = BaseSetting<C, string | null> & { type: 'role'; required?: boolean };

export type Setting<C> = BooleanSetting<C> | ChoiceSetting<C> | ChannelSetting<C> | RoleSetting<C>;

export interface SettingsPanelDefinition<C> {
  /** Identifies the panel, used in the custom IDs. */
  id: string;
  title: () => string;
  /** Permissions needed to change the settings. */
  permissions: PermissionsString[];
  /** Load the configuration, or null if the feature isn't set up in the guild. */
  load: (guildId: string) => Promise<C | null>;
  /** Shown instead of the settings when the feature isn't set up. */
  notConfigured: () => string;
  settings: Setting<C>[];
}

/** A settings panel with its configuration type hidden, so panels of different features can be kept together. */
export interface SettingsPanel {
  id: string;
  permissions: PermissionsString[];
  /** Render the panel with the guild's current settings. The guild is needed to check that saved channels and roles still exist. */
  render: (guild: Guild) => Promise<ResponsePayload>;
  /** Handle a button press: toggles a boolean or moves a choice to its next option. */
  press: (guildId: string, key: string) => Promise<void>;
  /** Handle a channel or role selection. */
  select: (guildId: string, key: string, values: string[]) => Promise<void>;
}

const customId = (panelId: string, key: string) => `${SETTINGS_CUSTOM_ID_PREFIX}${panelId}:${key}`;

/**
 * Parse the custom ID of a settings component.
 * @returns The panel and setting it belongs to, or null if it isn't a settings custom ID.
 */
export function parseSettingsCustomId(id: string): { panelId: string; key: string } | null {
  if (!id.startsWith(SETTINGS_CUSTOM_ID_PREFIX)) return null;
  const [panelId, key] = id.slice(SETTINGS_CUSTOM_ID_PREFIX.length).split(':');
  return panelId && key ? { panelId, key } : null;
}

/** How a value is shown as a default, or in a choice button. */
function formatValue<C>(setting: Setting<C>, value: boolean | string | null): string {
  switch (setting.type) {
    case 'boolean':
      return value ? t('state.on') : t('state.off');
    case 'choice':
      return setting.options.find((option) => option.value === value)?.label() ?? String(value);
    case 'channel':
      return typeof value === 'string' ? channelMention(value) : t('settings.none');
    case 'role':
      return typeof value === 'string' ? roleMention(value) : t('settings.none');
  }
}

function describe<C>(setting: Setting<C>, warning?: string): string {
  const lines = [`**${setting.label()}**`, `-# ${setting.description()}`];
  if (setting.defaultValue !== undefined) lines.push(`-# ${t('settings.default', { value: formatValue(setting, setting.defaultValue) })}`);
  if (warning) lines.push(`⚠️ ${warning}`);
  return lines.join('\n');
}

/** Add one setting to the panel: a section with a button for booleans and choices, or text with a select below for channels and roles. */
function addSetting<C>(container: ContainerBuilder, guild: Guild, panelId: string, setting: Setting<C>, config: C) {
  const id = customId(panelId, setting.key);

  switch (setting.type) {
    case 'boolean': {
      const value = setting.get(config);
      container.addSectionComponents(
        new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(describe(setting))).setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(id)
            .setLabel(formatValue(setting, value))
            .setEmoji(value ? '✅' : '✖️')
            .setStyle(value ? ButtonStyle.Success : ButtonStyle.Secondary),
        ),
      );
      return;
    }
    case 'choice': {
      const value = setting.get(config);
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(describe(setting)))
          .setButtonAccessory(new ButtonBuilder().setCustomId(id).setLabel(formatValue(setting, value)).setEmoji('🔁').setStyle(ButtonStyle.Primary)),
      );
      return;
    }
    case 'channel': {
      const value = setting.get(config);
      const select = new ChannelSelectMenuBuilder()
        .setCustomId(id)
        .setChannelTypes(setting.channelTypes)
        .setPlaceholder(t('settings.channel.placeholder'))
        .setMinValues(setting.required ? 1 : 0)
        .setMaxValues(1);
      // Only preselect a channel that still exists, so a deleted one doesn't break the panel that's needed to replace it
      const exists = value !== null && guild.channels.cache.has(value);
      if (exists) select.setDefaultChannels(value);
      container
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(describe(setting, value && !exists ? t('settings.channel.missing') : undefined)))
        .addActionRowComponents(new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select));
      return;
    }
    case 'role': {
      const value = setting.get(config);
      const select = new RoleSelectMenuBuilder()
        .setCustomId(id)
        .setPlaceholder(t('settings.role.placeholder'))
        .setMinValues(setting.required ? 1 : 0)
        .setMaxValues(1);
      // Only preselect a role that still exists, like with channels
      const exists = value !== null && guild.roles.cache.has(value);
      if (exists) select.setDefaultRoles(value);
      container
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(describe(setting, value && !exists ? t('settings.role.missing') : undefined)))
        .addActionRowComponents(new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(select));
      return;
    }
  }
}

/**
 * Create a settings panel: an interactive message where each setting can be changed in place,
 * with buttons that toggle booleans or cycle choices, and selects for channels and roles.
 *
 * The panel's buttons and selects are handled by `buttons/settings` and `selects/settings`,
 * which find the panel through `settings/index`, so new panels must be added there.
 */
export function createSettingsPanel<C>(definition: SettingsPanelDefinition<C>): SettingsPanel {
  const findSetting = (key: string) => definition.settings.find((setting) => setting.key === key);

  return {
    id: definition.id,
    permissions: definition.permissions,

    async render(guild) {
      const config = await definition.load(guild.id);
      if (!config) return createResponse(definition.notConfigured(), 'error');

      const container = new ContainerBuilder()
        .setAccentColor(ThemeColors.info)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(definition.title()))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

      definition.settings.forEach((setting, index) => {
        if (index > 0) container.addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small));
        addSetting(container, guild, definition.id, setting, config);
      });

      return { components: [container], flags: [MessageFlags.IsComponentsV2] };
    },

    async press(guildId, key) {
      const setting = findSetting(key);
      const config = await definition.load(guildId);
      if (!setting || !config) return;

      if (setting.type === 'boolean') {
        await setting.set(guildId, !setting.get(config));
      } else if (setting.type === 'choice') {
        const index = setting.options.findIndex((option) => option.value === setting.get(config));
        const next = setting.options[(index + 1) % setting.options.length];
        if (next) await setting.set(guildId, next.value);
      }
    },

    async select(guildId, key, values) {
      const setting = findSetting(key);
      if (!setting || (setting.type !== 'channel' && setting.type !== 'role')) return;

      const value = values[0] ?? null;
      // Discord enforces the minimum, but don't rely on it for required settings
      if (value === null && setting.required) return;
      await setting.set(guildId, value);
    },
  };
}
