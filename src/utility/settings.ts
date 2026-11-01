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
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  type ChannelType,
  type Guild,
  type PermissionsString,
} from 'discord.js';
import { t } from 'i18next';

import type { ResponsePayload } from 'utility/response';
import { createResponse } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/** Custom IDs of settings components are `settings:<panel>:<page>:<setting>[:<argument>]`. */
export const SETTINGS_CUSTOM_ID_PREFIX = 'settings:';
/** The page of panels without categories. */
const SINGLE_PAGE = '_';
/** The key of the select that switches between categories. */
const PAGE_KEY = '_page';
/** Discord shows at most 25 options in a select. */
const MAX_SELECT_OPTIONS = 25;

interface BaseSetting<C, V> {
  /** Identifies the setting within its panel, used in the custom ID. */
  key: string;
  /** The category the setting is shown in, for panels with categories. */
  category?: string;
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
export type ChannelSetting<C> = BaseSetting<C, string | null> & {
  type: 'channel';
  channelTypes: ChannelType[];
  required?: boolean;
  /**
   * Permissions the bot needs in the channel. The select shows the channels the user can see, not the bot,
   * so channels where the bot is missing any of these are refused, and a saved one that lost them gets a warning.
   */
  botPermissions?: PermissionsString[];
};
/** A role, picked with a role select. Without `required`, the selection can be cleared. */
export type RoleSetting<C> = BaseSetting<C, string | null> & { type: 'role'; required?: boolean };
/** Several channels, picked at once with a channel select. */
export type ChannelsSetting<C> = BaseSetting<C, string[]> & { type: 'channels'; channelTypes: ChannelType[]; max: number };
/** Several roles, picked at once with a role select. */
export type RolesSetting<C> = BaseSetting<C, string[]> & { type: 'roles'; max: number };

/** A channel or role with a value, like a multiplier or the level a reward role is given at. */
export interface Entry {
  targetId: string;
  value: number;
}

/**
 * A list of channels or roles that each have a value. Entries are added and removed with selects.
 *
 * With presets, every entry gets a row with a button that cycles through them, and after the last preset asks for a custom value.
 * Without presets, the entries are listed compactly, and adding an entry asks for its value, which also changes the value of an existing entry.
 */
export interface EntriesSetting<C> {
  type: 'entries';
  key: string;
  category?: string;
  label: () => string;
  description: () => string;
  target: 'channel' | 'role';
  /** The channel types that can be added, for channel entries. */
  channelTypes?: ChannelType[];
  /** The most entries there can be. With presets, keep it at 10 at most, as a message can only have 40 components. */
  max: number;
  /** The values the button of an entry cycles through. */
  presets?: number[];
  /** The value new entries start with, with presets. */
  defaultValue?: number;
  formatValue: (value: number) => string;
  /** How an entry is listed without presets, like `Level 5: @Role`. */
  formatEntry?: (target: string, value: string) => string;
  /** The popup that asks for a value. */
  input: {
    label: () => string;
    placeholder?: () => string;
    /** Turn what was typed into a value, or null if it isn't valid. */
    parse: (input: string) => number | null;
    invalid: () => string;
  };
  get: (config: C) => Entry[];
  /** Save the value of an entry, or remove it with null. */
  set: (guildId: string, targetId: string, value: number | null) => Promise<unknown>;
}

export type Setting<C> = BooleanSetting<C> | ChoiceSetting<C> | ChannelSetting<C> | RoleSetting<C> | ChannelsSetting<C> | RolesSetting<C> | EntriesSetting<C>;

export interface SettingsCategory {
  id: string;
  label: () => string;
  emoji?: string;
}

export interface SettingsPanelDefinition<C> {
  /** Identifies the panel, used in the custom IDs. */
  id: string;
  title: () => string;
  /** Permissions needed to change the settings. */
  permissions: PermissionsString[];
  /** Pages the settings are split into, switched with a select. Without categories, all settings are on one page. */
  categories?: SettingsCategory[];
  /** Load the configuration, or null if the feature isn't set up in the guild. */
  load: (guildId: string) => Promise<C | null>;
  /** Shown instead of the settings when the feature isn't set up. */
  notConfigured: () => string;
  settings: Setting<C>[];
}

/** A popup asking for a value, which the settings handler shows. */
export interface SettingsModal {
  title: string;
  label: string;
  placeholder?: string;
  value?: string;
  /** Save what was typed. Returns an error to show, or null when it was saved. */
  submit: (input: string) => Promise<string | null>;
}

/** What should happen after a settings component was used. */
export interface SettingsResult {
  /** The page to show. */
  page: string;
  /** A popup to show, for values that have to be typed. */
  modal?: SettingsModal;
  /** Why the change wasn't saved, to show the user. */
  error?: string;
}

/**
 * The permissions the bot is missing in a channel, out of the given ones.
 * Unknown when the bot's member or the channel isn't cached, in which case nothing is reported missing.
 */
export function missingBotPermissions(guild: Guild, channelId: string, permissions: PermissionsString[] | undefined): PermissionsString[] {
  if (!permissions?.length) return [];
  const me = guild.members?.me;
  const channel = guild.channels.cache.get(channelId);
  if (!me || !channel) return [];
  const granted = channel.permissionsFor(me);
  return permissions.filter((permission) => !granted.has(permission));
}

export const formatPermissions = (permissions: PermissionsString[]) => permissions.map((permission) => t(`permission.${permission}`)).join(', ');

/** What was used: a button, or a select with its selected values. */
export type SettingsInput = { type: 'button' } | { type: 'select'; values: string[] };

/** A settings panel with its configuration type hidden, so panels of different features can be kept together. */
export interface SettingsPanel {
  id: string;
  permissions: PermissionsString[];
  /**
   * Render the panel with the guild's current settings. The guild is needed to check that saved channels and roles still exist.
   * @param page The category to show. Defaults to the first.
   */
  render: (guild: Guild, page?: string) => Promise<ResponsePayload>;
  /** Handle a button or select of the panel. */
  handle: (guild: Guild, id: ParsedSettingsCustomId, input: SettingsInput) => Promise<SettingsResult>;
}

export interface ParsedSettingsCustomId {
  panelId: string;
  page: string;
  key: string;
  /** Which entry a button belongs to, or what a select does, for entries settings. */
  argument?: string;
}

const customId = (panelId: string, page: string, key: string, argument?: string) =>
  `${SETTINGS_CUSTOM_ID_PREFIX}${panelId}:${page}:${key}${argument ? `:${argument}` : ''}`;

/**
 * Parse the custom ID of a settings component.
 * @returns The panel, page and setting it belongs to, or null if it isn't a settings custom ID.
 */
export function parseSettingsCustomId(id: string): ParsedSettingsCustomId | null {
  if (!id.startsWith(SETTINGS_CUSTOM_ID_PREFIX)) return null;
  const [panelId, page, key, argument] = id.slice(SETTINGS_CUSTOM_ID_PREFIX.length).split(':');
  return panelId && page && key ? { panelId, page, key, argument } : null;
}

/** How a value is shown as a default, or in a choice button. */
function formatValue<C>(setting: Exclude<Setting<C>, EntriesSetting<C>>, value: boolean | string | string[] | null): string {
  switch (setting.type) {
    case 'boolean':
      return value ? t('state.on') : t('state.off');
    case 'choice':
      return setting.options.find((option) => option.value === value)?.label() ?? String(value);
    case 'channel':
      return typeof value === 'string' ? channelMention(value) : t('settings.none');
    case 'role':
      return typeof value === 'string' ? roleMention(value) : t('settings.none');
    case 'channels':
    case 'roles':
      return Array.isArray(value) && value.length > 0 ? value.join(', ') : t('settings.none');
  }
}

function describe<C>(setting: Setting<C>, extra: string[] = []): string {
  const lines = [`**${setting.label()}**`, `-# ${setting.description()}`];
  if (setting.type !== 'entries' && setting.defaultValue !== undefined) {
    lines.push(`-# ${t('settings.default', { value: formatValue(setting, setting.defaultValue) })}`);
  }
  return [...lines, ...extra].join('\n');
}

const mention = (target: 'channel' | 'role', id: string) => (target === 'channel' ? channelMention(id) : roleMention(id));
const exists = (guild: Guild, target: 'channel' | 'role', id: string) => (target === 'channel' ? guild.channels.cache.has(id) : guild.roles.cache.has(id));
/** A name for a select option, which can't show mentions. */
function targetName(guild: Guild, target: 'channel' | 'role', id: string): string {
  const name = target === 'channel' ? guild.channels.cache.get(id)?.name : guild.roles.cache.get(id)?.name;
  return name ? `${target === 'channel' ? '#' : '@'}${name}` : t('settings.unknown', { id });
}

/** Add one setting to the panel. */
function addSetting<C>(container: ContainerBuilder, guild: Guild, panelId: string, page: string, setting: Setting<C>, config: C) {
  const id = customId(panelId, page, setting.key);

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
    case 'channel':
    case 'channels': {
      const saved = setting.type === 'channel' ? [setting.get(config)].filter((value) => value !== null) : setting.get(config);
      // Only preselect channels that still exist, so a deleted one doesn't break the panel that's needed to replace it
      const existing = saved.filter((value) => guild.channels.cache.has(value));
      const select = new ChannelSelectMenuBuilder()
        .setCustomId(id)
        .setChannelTypes(setting.channelTypes)
        .setPlaceholder(t(setting.type === 'channel' ? 'settings.channel.placeholder' : 'settings.channels.placeholder'))
        .setMinValues(setting.type === 'channel' && setting.required ? 1 : 0)
        .setMaxValues(setting.type === 'channel' ? 1 : Math.min(setting.max, MAX_SELECT_OPTIONS));
      if (existing.length > 0) select.setDefaultChannels(existing);
      const warning = existing.length < saved.length ? [`⚠️ ${t(setting.type === 'channel' ? 'settings.channel.missing' : 'settings.channels.missing')}`] : [];
      // Permissions can be taken away after the channel was picked
      const missing = setting.type === 'channel' && existing[0] ? missingBotPermissions(guild, existing[0], setting.botPermissions) : [];
      if (missing.length > 0) warning.push(`⚠️ ${t('settings.channel.botPermissions', { permissions: formatPermissions(missing) })}`);
      container
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(describe(setting, warning)))
        .addActionRowComponents(new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select));
      return;
    }
    case 'role':
    case 'roles': {
      const saved = setting.type === 'role' ? [setting.get(config)].filter((value) => value !== null) : setting.get(config);
      // Only preselect roles that still exist, like with channels
      const existing = saved.filter((value) => guild.roles.cache.has(value));
      const select = new RoleSelectMenuBuilder()
        .setCustomId(id)
        .setPlaceholder(t(setting.type === 'role' ? 'settings.role.placeholder' : 'settings.roles.placeholder'))
        .setMinValues(setting.type === 'role' && setting.required ? 1 : 0)
        .setMaxValues(setting.type === 'role' ? 1 : Math.min(setting.max, MAX_SELECT_OPTIONS));
      if (existing.length > 0) select.setDefaultRoles(existing);
      const warning = existing.length < saved.length ? [`⚠️ ${t(setting.type === 'role' ? 'settings.role.missing' : 'settings.roles.missing')}`] : [];
      container
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(describe(setting, warning)))
        .addActionRowComponents(new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(select));
      return;
    }
    case 'entries':
      addEntries(container, guild, panelId, page, setting, config);
      return;
  }
}

function addEntries<C>(container: ContainerBuilder, guild: Guild, panelId: string, page: string, setting: EntriesSetting<C>, config: C) {
  const entries = setting.get(config);
  const count = t('settings.entries.count', { count: entries.length, max: setting.max });

  if (setting.presets) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(describe(setting, [`-# ${count}`])));
    for (const entry of entries) {
      const missing = exists(guild, setting.target, entry.targetId) ? '' : ` ⚠️ ${t('settings.entries.missing')}`;
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${mention(setting.target, entry.targetId)}${missing}`))
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId(customId(panelId, page, setting.key, entry.targetId))
              .setLabel(setting.formatValue(entry.value))
              .setStyle(ButtonStyle.Primary),
          ),
      );
    }
  } else {
    const format = setting.formatEntry ?? ((target: string, value: string) => `${target}: ${value}`);
    const list =
      entries.length > 0
        ? entries.map((entry) => `- ${format(mention(setting.target, entry.targetId), setting.formatValue(entry.value))}`)
        : [t('settings.none')];
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(describe(setting, [`-# ${count}`, ...list])));
  }

  // Without presets, picking an existing entry asks for its new value, so the select stays available to edit when the list is full
  if (entries.length < setting.max || !setting.presets) {
    const addId = customId(panelId, page, setting.key, 'add');
    const select =
      setting.target === 'channel'
        ? new ChannelSelectMenuBuilder()
            .setCustomId(addId)
            .setChannelTypes(setting.channelTypes ?? [])
            .setPlaceholder(t('settings.entries.addChannel'))
        : new RoleSelectMenuBuilder().setCustomId(addId).setPlaceholder(t(setting.presets ? 'settings.entries.addRole' : 'settings.entries.addOrEditRole'));
    container.addActionRowComponents(new ActionRowBuilder<ChannelSelectMenuBuilder | RoleSelectMenuBuilder>().addComponents(select));
  }

  if (entries.length > 0) {
    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(customId(panelId, page, setting.key, 'remove'))
          .setPlaceholder(t('settings.entries.remove'))
          .addOptions(
            entries.slice(0, MAX_SELECT_OPTIONS).map((entry) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(targetName(guild, setting.target, entry.targetId))
                .setDescription(setting.formatValue(entry.value))
                .setValue(entry.targetId),
            ),
          ),
      ),
    );
  }
}

/** The popup asking for the value of an entry. */
function entryModal<C>(guild: Guild, guildId: string, setting: EntriesSetting<C>, targetId: string, current?: number): SettingsModal {
  return {
    title: t('settings.entries.modalTitle', { target: targetName(guild, setting.target, targetId) }).slice(0, 45),
    label: setting.input.label(),
    placeholder: setting.input.placeholder?.(),
    value: current === undefined ? undefined : String(current),
    async submit(input) {
      const value = setting.input.parse(input.trim());
      if (value === null) return setting.input.invalid();
      await setting.set(guildId, targetId, value);
      return null;
    },
  };
}

/**
 * Create a settings panel: an interactive message where each setting can be changed in place,
 * with buttons that toggle booleans or cycle choices, selects for channels and roles, and lists of entries with values.
 *
 * The panel's buttons and selects are handled by `buttons/settings` and `selects/settings`,
 * which find the panel through `settings/index`, so new panels must be added there.
 */
export function createSettingsPanel<C>(definition: SettingsPanelDefinition<C>): SettingsPanel {
  const findSetting = (key: string) => definition.settings.find((setting) => setting.key === key);
  const resolvePage = (page?: string) => {
    if (!definition.categories?.length) return SINGLE_PAGE;
    return definition.categories.some((category) => category.id === page) ? page! : definition.categories[0]!.id;
  };

  return {
    id: definition.id,
    permissions: definition.permissions,

    async render(guild, requestedPage) {
      const config = await definition.load(guild.id);
      if (!config) return createResponse(definition.notConfigured(), 'error');

      const page = resolvePage(requestedPage);
      const container = new ContainerBuilder()
        .setAccentColor(ThemeColors.info)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(definition.title()));

      if (definition.categories?.length) {
        container.addActionRowComponents(
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder().setCustomId(customId(definition.id, page, PAGE_KEY)).addOptions(
              definition.categories.map((category) => {
                const option = new StringSelectMenuOptionBuilder()
                  .setLabel(category.label())
                  .setValue(category.id)
                  .setDefault(category.id === page);
                return category.emoji ? option.setEmoji(category.emoji) : option;
              }),
            ),
          ),
        );
      }
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

      const settings = definition.settings.filter((setting) => page === SINGLE_PAGE || setting.category === page);
      settings.forEach((setting, index) => {
        if (index > 0) container.addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small));
        addSetting(container, guild, definition.id, page, setting, config);
      });

      return { components: [container], flags: [MessageFlags.IsComponentsV2] };
    },

    async handle(guild, id, input) {
      const page = resolvePage(id.page);
      if (id.key === PAGE_KEY) return { page: resolvePage(input.type === 'select' ? input.values[0] : undefined) };

      const setting = findSetting(id.key);
      const config = await definition.load(guild.id);
      if (!setting || !config) return { page };

      switch (setting.type) {
        case 'boolean':
          await setting.set(guild.id, !setting.get(config));
          break;
        case 'choice': {
          const index = setting.options.findIndex((option) => option.value === setting.get(config));
          const next = setting.options[(index + 1) % setting.options.length];
          if (next) await setting.set(guild.id, next.value);
          break;
        }
        case 'channel':
        case 'role': {
          const value = input.type === 'select' ? (input.values[0] ?? null) : null;
          if (setting.type === 'channel' && value !== null) {
            const missing = missingBotPermissions(guild, value, setting.botPermissions);
            if (missing.length > 0) {
              return { page, error: t('settings.channel.botPermissionsRefused', { channel: channelMention(value), permissions: formatPermissions(missing) }) };
            }
          }
          // Discord enforces the minimum, but don't rely on it for required settings
          if (value !== null || !setting.required) await setting.set(guild.id, value);
          break;
        }
        case 'channels':
        case 'roles':
          if (input.type === 'select') await setting.set(guild.id, input.values.slice(0, setting.max));
          break;
        case 'entries':
          return { page, modal: await handleEntries(guild, setting, config, id.argument, input) };
      }

      return { page };
    },
  };
}

/** Handle a button or select of an entries setting. Returns a popup when a value has to be typed. */
async function handleEntries<C>(
  guild: Guild,
  setting: EntriesSetting<C>,
  config: C,
  argument: string | undefined,
  input: SettingsInput,
): Promise<SettingsModal | undefined> {
  const entries = setting.get(config);

  if (argument === 'remove') {
    if (input.type === 'select' && input.values[0]) await setting.set(guild.id, input.values[0], null);
    return;
  }

  if (argument === 'add') {
    const targetId = input.type === 'select' ? input.values[0] : undefined;
    if (!targetId) return;
    const existing = entries.find((entry) => entry.targetId === targetId);

    // Without presets, the value is always typed, also to change it for an existing entry
    if (!setting.presets) {
      if (!existing && entries.length >= setting.max) return;
      return entryModal(guild, guild.id, setting, targetId, existing?.value);
    }
    if (!existing && entries.length < setting.max) await setting.set(guild.id, targetId, setting.defaultValue ?? setting.presets[0] ?? 1);
    return;
  }

  // A button of an entry: move to the next preset, and after the last one ask for a custom value
  const entry = entries.find((candidate) => candidate.targetId === argument);
  if (!entry || !setting.presets) return;
  const index = setting.presets.indexOf(entry.value);
  if (index === setting.presets.length - 1) return entryModal(guild, guild.id, setting, entry.targetId, entry.value);
  // A custom value starts over at the first preset
  await setting.set(guild.id, entry.targetId, setting.presets[index + 1] ?? setting.presets[0]!);
}
