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
import type { Translate } from 'utility/i18next';

import type { ResponsePayload } from 'utility/response';
import { createResponse } from 'utility/response';
import { getRoleProblem } from 'utility/roles';
import { ThemeColors } from 'utility/theme';

/**
 * Custom IDs of settings components are `settings:<panel>:<page>:<setting>:<argument>:<shown>`.
 * The argument says which entry a button belongs to or what a select does, and `-` when there's none.
 * Buttons carry the value they showed, so a click on a panel that's out of date can be detected.
 */
export const SETTINGS_CUSTOM_ID_PREFIX = 'settings:';
/** The page of panels without categories. */
const SINGLE_PAGE = '_';
/** The key of the select that switches between categories. */
const PAGE_KEY = '_page';
/** Placeholder in custom IDs for a missing argument or shown value. */
const NONE = '-';
/** In place of the shown value, marks the custom ID of a popup. */
const MODAL_MARK = 'modal';
/** Discord shows at most 25 options in a select. */
const MAX_SELECT_OPTIONS = 25;
/** How much of a text setting is shown in the panel. */
const TEXT_PREVIEW_LENGTH = 300;

interface BaseSetting<C, V> {
  /** Identifies the setting within its panel, used in the custom ID. */
  key: string;
  /** The category the setting is shown in, for panels with categories. */
  category?: string;
  label: (t: Translate) => string;
  description: (t: Translate) => string;
  /** The value a new configuration starts with, shown under the description. */
  defaultValue?: V;
  /** Read the current value from the configuration. */
  get: (config: C) => V;
  /** Save a new value. The guild is there for settings that change more than the database, like moving a posted message. */
  set: (guildId: string, value: V, guild: Guild) => Promise<unknown>;
}

/** A boolean, toggled with a button. */
export type BooleanSetting<C> = BaseSetting<C, boolean> & { type: 'boolean' };
/** One of a few options, cycled through with a button. */
export type ChoiceSetting<C> = BaseSetting<C, string> & { type: 'choice'; options: { value: string; label: (t: Translate) => string }[] };
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
export type RoleSetting<C> = BaseSetting<C, string | null> & {
  type: 'role';
  required?: boolean;
  /** Whether the bot has to be able to give the role to members, which refuses roles it can't and warns about saved ones. */
  assignable?: boolean;
};
/** Several channels, picked at once with a channel select. */
export type ChannelsSetting<C> = BaseSetting<C, string[]> & { type: 'channels'; channelTypes: ChannelType[]; max: number };
/** Several roles, picked at once with a role select. */
export type RolesSetting<C> = BaseSetting<C, string[]> & { type: 'roles'; max: number };
/** A text, typed into a popup with a button. Submitting it empty clears it, which uses the default instead. */
export type TextSetting<C> = Omit<BaseSetting<C, string | null>, 'defaultValue'> & {
  type: 'text';
  maxLength: number;
  /** Whether the text can have several lines. */
  paragraph?: boolean;
  placeholder?: (t: Translate) => string;
  /** The text used while none is set, shown in the popup to start from. */
  defaultText?: (t: Translate) => string;
};

/** A channel or role with a value, like a multiplier, the level a reward role is given at, or the emoji of a role. */
export interface Entry<V extends number | string = number> {
  targetId: string;
  value: V;
}

/**
 * A list of channels or roles that each have a value. Entries are added and removed with selects.
 *
 * With presets, every entry gets a row with a button that cycles through them, and after the last preset asks for a custom value.
 * Without presets, the entries are listed compactly, and adding an entry asks for its value, which also changes the value of an existing entry.
 *
 * The functions are written as methods, which TypeScript checks loosely enough that settings with number and text values fit in one list.
 */
interface EntriesSettingBase<C, V extends number | string> {
  type: 'entries' | 'textEntries';
  key: string;
  category?: string;
  label: (t: Translate) => string;
  description: (t: Translate) => string;
  target: 'channel' | 'role';
  /** The channel types that can be added, for channel entries. */
  channelTypes?: ChannelType[];
  /** Whether the bot has to be able to give the roles to members, for role entries. */
  assignable?: boolean;
  /** The most entries there can be. With presets, keep it at 10 at most, as a message can only have 40 components. */
  max: number;
  /** The values the button of an entry cycles through. */
  presets?: V[];
  /** The value new entries start with, with presets. */
  defaultValue?: V;
  formatValue(value: V, t: Translate): string;
  /** How an entry is listed without presets, like `Level 5: @Role`. */
  formatEntry?(target: string, value: string): string;
  /** The popup that asks for a value. */
  input: {
    label: (t: Translate) => string;
    placeholder?: (t: Translate) => string;
    /** The most characters that can be typed. Defaults to 20. */
    maxLength?: number;
    /** Turn what was typed into a value, or null if it isn't valid. */
    parse(input: string, guild: Guild): V | null;
    invalid: (t: Translate) => string;
  };
  get(config: C): Entry<V>[];
  /** Save the value of an entry, or remove it with null. */
  set(guildId: string, targetId: string, value: V | null): Promise<unknown>;
  /** Runs after an entry was saved, for follow-up work like giving a new reward role to everyone who already qualifies. */
  onSaved?(guild: Guild, targetId: string, value: V | null): void;
}

/** An entries setting with number values, like multipliers, or with text values, like emoji, which is a `textEntries` setting. */
export type EntriesSetting<C, V extends number | string = number> = EntriesSettingBase<C, V> & { type: V extends string ? 'textEntries' : 'entries' };

export type Setting<C> =
  | BooleanSetting<C>
  | ChoiceSetting<C>
  | ChannelSetting<C>
  | RoleSetting<C>
  | ChannelsSetting<C>
  | RolesSetting<C>
  | TextSetting<C>
  | EntriesSetting<C, number>
  | EntriesSetting<C, string>;

/** Any entries setting, as the panel handles them the same whatever their values are. */
type AnyEntriesSetting<C> = EntriesSettingBase<C, number | string>;

const isEntries = <C>(setting: Setting<C> | AnyEntriesSetting<C>): setting is AnyEntriesSetting<C> =>
  setting.type === 'entries' || setting.type === 'textEntries';

export interface SettingsCategory {
  id: string;
  label: (t: Translate) => string;
  emoji?: string;
}

export interface SettingsPanelDefinition<C> {
  /** Identifies the panel, used in the custom IDs. */
  id: string;
  title: (t: Translate) => string;
  /** Permissions needed to change the settings. */
  permissions: PermissionsString[];
  /** Pages the settings are split into, switched with a select. Without categories, all settings are on one page. */
  categories?: SettingsCategory[];
  /** Load the configuration, or null if the feature isn't set up in the guild. */
  load: (guildId: string) => Promise<C | null>;
  /** Shown instead of the settings when the feature isn't set up. */
  notConfigured: (t: Translate) => string;
  /** Text shown under the title, like where a role menu is posted. */
  header?: (config: C, guild: Guild, t: Translate) => string | null;
  /** Buttons shown under the settings, for actions that aren't settings, like deleting a role menu. */
  footer?: (config: C, t: Translate) => ButtonBuilder[];
  /** Runs after any setting was saved, before the panel is shown again, like to update a posted role menu. */
  onSaved?: (guild: Guild) => Promise<unknown>;
  settings: Setting<C>[];
}

/** A popup asking for a value, which the settings handler shows. */
export interface SettingsModal {
  /** Says what the popup is for, so it can be handled whenever it's submitted, like a button. */
  customId: string;
  title: string;
  label: string;
  placeholder?: string;
  value?: string;
  /** The most characters that can be typed. Defaults to 20. */
  maxLength?: number;
  /** Whether the text can have several lines. */
  paragraph?: boolean;
  /** Whether it can be submitted empty, like to go back to a default text. */
  optional?: boolean;
  /** Check what was typed. Returns an error to show, or how to save it. */
  submit: (input: string) => { error: string } | { save: () => Promise<unknown> };
}

/**
 * What should happen after a settings component was used. Working this out doesn't save anything yet,
 * so the handler can show a popup first when one is needed, as a popup has to be the first answer to an interaction.
 */
export interface SettingsResult {
  /** The page to show. */
  page: string;
  /** A popup to show, for values that have to be typed. */
  modal?: SettingsModal;
  /** Why the change can't be made, to show the user. */
  error?: string;
  /** Saves the change. Run after the interaction was deferred, as saving can take a moment. */
  save?: () => Promise<unknown>;
  /** The button showed a value that has changed since, so nothing is saved and the panel is refreshed instead. */
  outdated?: boolean;
}

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
  render: (guild: Guild, t: Translate, page?: string) => Promise<ResponsePayload>;
  /** Work out what a button or select of the panel should do. */
  handle: (guild: Guild, id: ParsedSettingsCustomId, input: SettingsInput, t: Translate) => Promise<SettingsResult>;
  /** Work out what a submitted popup should do, with what was typed into it. */
  submitModal: (guild: Guild, id: ParsedSettingsCustomId, input: string, t: Translate) => Promise<Omit<SettingsResult, 'modal' | 'outdated'>>;
  /** Runs after any setting was saved. */
  onSaved?: (guild: Guild) => Promise<unknown>;
}

export interface ParsedSettingsCustomId {
  panelId: string;
  page: string;
  key: string;
  /** Which entry a button belongs to, or what a select does, for entries settings. */
  argument?: string;
  /** The value a button showed. */
  shown?: string;
}

const customId = (panelId: string, page: string, key: string, argument?: string, shown?: string) =>
  `${SETTINGS_CUSTOM_ID_PREFIX}${panelId}:${page}:${key}:${argument ?? NONE}:${shown ?? NONE}`;

/**
 * Parse the custom ID of a settings component.
 * @returns The panel, page and setting it belongs to, or null if it isn't a settings custom ID.
 */
export function parseSettingsCustomId(id: string): ParsedSettingsCustomId | null {
  if (!id.startsWith(SETTINGS_CUSTOM_ID_PREFIX)) return null;
  const [panelId, page, key, argument, shown] = id.slice(SETTINGS_CUSTOM_ID_PREFIX.length).split(':');
  if (!panelId || !page || !key) return null;
  return {
    panelId,
    page,
    key,
    argument: argument && argument !== NONE ? argument : undefined,
    shown: shown && shown !== NONE ? shown : undefined,
  };
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

export const formatPermissions = (permissions: PermissionsString[], t: Translate) => permissions.map((permission) => t(`permission.${permission}`)).join(', ');

/**
 * Why the bot can't give a role to members, or null if it can.
 * Unknown when the bot's member or the role isn't cached, in which case null is returned.
 */
export function unassignableReason(guild: Guild, roleId: string, t: Translate): string | null {
  const problem = getRoleProblem(guild, roleId);
  return problem ? t(`settings.role.${problem}`) : null;
}

/** How a value is shown as a default, or in a choice button. */
function formatValue<C>(setting: Exclude<Setting<C>, { type: 'entries' | 'textEntries' }>, value: boolean | string | string[] | null, t: Translate): string {
  switch (setting.type) {
    case 'text':
      return typeof value === 'string' ? value : t('settings.none');
    case 'boolean':
      return value ? t('state.on') : t('state.off');
    case 'choice':
      return setting.options.find((option) => option.value === value)?.label(t) ?? String(value);
    case 'channel':
      return typeof value === 'string' ? channelMention(value) : t('settings.none');
    case 'role':
      return typeof value === 'string' ? roleMention(value) : t('settings.none');
    case 'channels':
    case 'roles':
      return Array.isArray(value) && value.length > 0 ? value.join(', ') : t('settings.none');
  }
}

function describe<C>(setting: Setting<C> | AnyEntriesSetting<C>, t: Translate, extra: string[] = []): string {
  const lines = [`**${setting.label(t)}**`, `-# ${setting.description(t)}`];
  // A default text is shown in place of the value instead, as it can be long
  if (!isEntries(setting) && setting.type !== 'text' && setting.defaultValue !== undefined) {
    lines.push(`-# ${t('settings.default', { value: formatValue(setting, setting.defaultValue, t) })}`);
  }
  return [...lines, ...extra].join('\n');
}

const mention = (target: 'channel' | 'role', id: string) => (target === 'channel' ? channelMention(id) : roleMention(id));
const exists = (guild: Guild, target: 'channel' | 'role', id: string) => (target === 'channel' ? guild.channels.cache.has(id) : guild.roles.cache.has(id));
/** A name for a select option, which can't show mentions. */
function targetName(guild: Guild, target: 'channel' | 'role', id: string, t: Translate): string {
  const name = target === 'channel' ? guild.channels.cache.get(id)?.name : guild.roles.cache.get(id)?.name;
  return name ? `${target === 'channel' ? '#' : '@'}${name}` : t('settings.unknown', { id });
}

/** Add one setting to the panel. */
function addSetting<C>(container: ContainerBuilder, guild: Guild, panelId: string, page: string, setting: Setting<C>, config: C, t: Translate) {
  switch (setting.type) {
    case 'boolean': {
      const value = setting.get(config);
      container.addSectionComponents(
        new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(describe(setting, t))).setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(customId(panelId, page, setting.key, undefined, value ? '1' : '0'))
            .setLabel(formatValue(setting, value, t))
            .setEmoji(value ? '✅' : '✖️')
            .setStyle(value ? ButtonStyle.Success : ButtonStyle.Secondary),
        ),
      );
      return;
    }
    case 'choice': {
      const value = setting.get(config);
      container.addSectionComponents(
        new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(describe(setting, t))).setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(customId(panelId, page, setting.key, undefined, value))
            .setLabel(formatValue(setting, value, t))
            .setEmoji('🔁')
            .setStyle(ButtonStyle.Primary),
        ),
      );
      return;
    }
    case 'channel':
    case 'channels': {
      const saved = setting.type === 'channel' ? [setting.get(config)].filter((value) => value !== null) : setting.get(config);
      // Only preselect channels that still exist, so a deleted one doesn't break the panel that's needed to replace it
      const existing = saved.filter((value) => guild.channels.cache.has(value));
      const select = new ChannelSelectMenuBuilder()
        .setCustomId(customId(panelId, page, setting.key))
        .setChannelTypes(setting.channelTypes)
        .setPlaceholder(t(setting.type === 'channel' ? 'settings.channel.placeholder' : 'settings.channels.placeholder'))
        .setMinValues(setting.type === 'channel' && setting.required ? 1 : 0)
        .setMaxValues(setting.type === 'channel' ? 1 : Math.min(setting.max, MAX_SELECT_OPTIONS));
      if (existing.length > 0) select.setDefaultChannels(existing);
      const warning = existing.length < saved.length ? [`⚠️ ${t(setting.type === 'channel' ? 'settings.channel.missing' : 'settings.channels.missing')}`] : [];
      // Permissions can be taken away after the channel was picked
      const missing = setting.type === 'channel' && existing[0] ? missingBotPermissions(guild, existing[0], setting.botPermissions) : [];
      if (missing.length > 0) warning.push(`⚠️ ${t('settings.channel.botPermissions', { permissions: formatPermissions(missing, t) })}`);
      container
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(describe(setting, t, warning)))
        .addActionRowComponents(new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select));
      return;
    }
    case 'role':
    case 'roles': {
      const saved = setting.type === 'role' ? [setting.get(config)].filter((value) => value !== null) : setting.get(config);
      // Only preselect roles that still exist, like with channels
      const existing = saved.filter((value) => guild.roles.cache.has(value));
      const select = new RoleSelectMenuBuilder()
        .setCustomId(customId(panelId, page, setting.key))
        .setPlaceholder(t(setting.type === 'role' ? 'settings.role.placeholder' : 'settings.roles.placeholder'))
        .setMinValues(setting.type === 'role' && setting.required ? 1 : 0)
        .setMaxValues(setting.type === 'role' ? 1 : Math.min(setting.max, MAX_SELECT_OPTIONS));
      if (existing.length > 0) select.setDefaultRoles(existing);
      const warning = existing.length < saved.length ? [`⚠️ ${t(setting.type === 'role' ? 'settings.role.missing' : 'settings.roles.missing')}`] : [];
      // The role or the bot's own roles can change after the role was picked
      const reason = setting.type === 'role' && setting.assignable && existing[0] ? unassignableReason(guild, existing[0], t) : null;
      if (reason) warning.push(`⚠️ ${t('settings.role.cantAssign', { reason })}`);
      container
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(describe(setting, t, warning)))
        .addActionRowComponents(new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(select));
      return;
    }
    case 'text': {
      const value = setting.get(config);
      const shown = value ?? setting.defaultText?.(t) ?? null;
      // Quoted, so the text stands apart from the setting's description, and cut short so long texts don't take over the panel
      const preview = shown === null ? t('settings.none') : quote(shown.length > TEXT_PREVIEW_LENGTH ? `${shown.slice(0, TEXT_PREVIEW_LENGTH)}…` : shown);
      const extra = [value === null && setting.defaultText ? `-# ${t('settings.text.usingDefault')}` : null, preview].filter((line) => line !== null);
      container.addSectionComponents(
        new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(describe(setting, t, extra))).setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(customId(panelId, page, setting.key))
            .setLabel(t('settings.text.edit'))
            .setEmoji('✏️')
            .setStyle(ButtonStyle.Primary),
        ),
      );
      return;
    }
    case 'entries':
    case 'textEntries':
      addEntries(container, guild, panelId, page, setting, config, t);
      return;
  }
}

/** Quote every line of a text. */
const quote = (text: string) =>
  text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

/** A warning for an entry whose channel or role was deleted, or whose role the bot can't give. */
function entryWarning<C>(guild: Guild, setting: AnyEntriesSetting<C>, targetId: string, t: Translate): string {
  if (!exists(guild, setting.target, targetId)) return ` ⚠️ ${t('settings.entries.missing')}`;
  const reason = setting.target === 'role' && setting.assignable ? unassignableReason(guild, targetId, t) : null;
  return reason ? ` ⚠️ ${reason}` : '';
}

function addEntries<C>(container: ContainerBuilder, guild: Guild, panelId: string, page: string, setting: AnyEntriesSetting<C>, config: C, t: Translate) {
  const entries = setting.get(config);
  const count = t('settings.entries.count', { count: entries.length, max: setting.max });

  if (setting.presets) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(describe(setting, t, [`-# ${count}`])));
    for (const entry of entries) {
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${mention(setting.target, entry.targetId)}${entryWarning(guild, setting, entry.targetId, t)}`),
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId(customId(panelId, page, setting.key, entry.targetId, String(entry.value)))
              .setLabel(setting.formatValue(entry.value, t))
              .setStyle(ButtonStyle.Primary),
          ),
      );
    }
  } else {
    const format = (target: string, value: string) => (setting.formatEntry ? setting.formatEntry(target, value) : `${target}: ${value}`);
    const list =
      entries.length > 0
        ? entries.map(
            (entry) =>
              `- ${format(mention(setting.target, entry.targetId), setting.formatValue(entry.value, t))}${entryWarning(guild, setting, entry.targetId, t)}`,
          )
        : [t('settings.none')];
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(describe(setting, t, [`-# ${count}`, ...list])));
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
                .setLabel(targetName(guild, setting.target, entry.targetId, t))
                .setDescription(setting.formatValue(entry.value, t))
                .setValue(entry.targetId),
            ),
          ),
      ),
    );
  }
}

/** Save an entry and run its follow-up work. */
async function saveEntry<C>(guild: Guild, setting: AnyEntriesSetting<C>, targetId: string, value: number | string | null) {
  await setting.set(guild.id, targetId, value);
  setting.onSaved?.(guild, targetId, value);
}

/** The popup asking for the value of an entry. */
function entryModal<C>(
  guild: Guild,
  setting: AnyEntriesSetting<C>,
  id: ParsedSettingsCustomId,
  targetId: string,
  t: Translate,
  current?: number | string,
): SettingsModal {
  return {
    customId: customId(id.panelId, id.page, setting.key, targetId, MODAL_MARK),
    title: t('settings.entries.modalTitle', { target: targetName(guild, setting.target, targetId, t) }).slice(0, 45),
    label: setting.input.label(t),
    placeholder: setting.input.placeholder?.(t),
    value: current === undefined ? undefined : String(current),
    maxLength: setting.input.maxLength,
    submit(input) {
      const value = setting.input.parse(input.trim(), guild);
      if (value === null) return { error: setting.input.invalid(t) };
      return { save: () => saveEntry(guild, setting, targetId, value) };
    },
  };
}

/** The popup asking for a text. */
function textModal<C>(guild: Guild, setting: TextSetting<C>, id: ParsedSettingsCustomId, t: Translate, current: string | null): SettingsModal {
  return {
    customId: customId(id.panelId, id.page, setting.key, undefined, MODAL_MARK),
    title: setting.label(t).slice(0, 45),
    label: setting.label(t).slice(0, 45),
    placeholder: setting.placeholder?.(t),
    value: current ?? setting.defaultText?.(t),
    maxLength: setting.maxLength,
    paragraph: setting.paragraph,
    optional: true,
    submit(input) {
      // Left empty, or the same as the default, it keeps following the default, like when that's translated
      const text = input.trim();
      return { save: () => setting.set(guild.id, text && text !== setting.defaultText?.(t) ? text : null, guild) };
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

    async render(guild, t, requestedPage) {
      const config = await definition.load(guild.id);
      if (!config) return createResponse(definition.notConfigured(t), 'error');

      const page = resolvePage(requestedPage);
      const container = new ContainerBuilder()
        .setAccentColor(ThemeColors.info)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(definition.title(t)));
      const header = definition.header?.(config, guild, t);
      if (header) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(header));

      if (definition.categories?.length) {
        container.addActionRowComponents(
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder().setCustomId(customId(definition.id, page, PAGE_KEY)).addOptions(
              definition.categories.map((category) => {
                const option = new StringSelectMenuOptionBuilder()
                  .setLabel(category.label(t))
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
        addSetting(container, guild, definition.id, page, setting, config, t);
      });

      const footer = definition.footer?.(config, t) ?? [];
      if (footer.length > 0) {
        container
          .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
          .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(footer));
      }

      return { components: [container], flags: [MessageFlags.IsComponentsV2] };
    },

    async handle(guild, id, input, t) {
      const page = resolvePage(id.page);
      if (id.key === PAGE_KEY) return { page: resolvePage(input.type === 'select' ? input.values[0] : undefined) };

      const setting = findSetting(id.key);
      const config = await definition.load(guild.id);
      if (!setting || !config) return { page };

      switch (setting.type) {
        case 'boolean': {
          const value = setting.get(config);
          if (id.shown !== (value ? '1' : '0')) return { page, outdated: true };
          return { page, save: () => setting.set(guild.id, !value, guild) };
        }
        case 'choice': {
          const value = setting.get(config);
          if (id.shown !== value) return { page, outdated: true };
          const index = setting.options.findIndex((option) => option.value === value);
          const next = setting.options[(index + 1) % setting.options.length];
          return next ? { page, save: () => setting.set(guild.id, next.value, guild) } : { page };
        }
        case 'channel':
        case 'role': {
          const value = input.type === 'select' ? (input.values[0] ?? null) : null;
          // Discord enforces the minimum, but don't rely on it for required settings
          if (value === null && setting.required) return { page };

          if (value !== null && setting.type === 'channel') {
            const missing = missingBotPermissions(guild, value, setting.botPermissions);
            if (missing.length > 0) {
              return {
                page,
                error: t('settings.channel.botPermissionsRefused', { channel: channelMention(value), permissions: formatPermissions(missing, t) }),
              };
            }
          }
          if (value !== null && setting.type === 'role' && setting.assignable) {
            const reason = unassignableReason(guild, value, t);
            if (reason) return { page, error: t('settings.role.refused', { role: roleMention(value), reason }) };
          }
          return { page, save: () => setting.set(guild.id, value, guild) };
        }
        case 'channels':
        case 'roles': {
          if (input.type !== 'select') return { page };
          const values = input.values.slice(0, setting.max);
          return { page, save: () => setting.set(guild.id, values, guild) };
        }
        case 'text':
          return { page, modal: textModal(guild, setting, id, t, setting.get(config)) };
        case 'entries':
        case 'textEntries':
          return { page, ...handleEntries(guild, setting, config, id, input, t) };
      }
    },

    async submitModal(guild, id, input, t) {
      const page = resolvePage(id.page);
      const setting = findSetting(id.key);
      const config = await definition.load(guild.id);
      if (!setting || !config) return { page };

      const modal =
        setting.type === 'text'
          ? textModal(guild, setting, id, t, setting.get(config))
          : (setting.type === 'entries' || setting.type === 'textEntries') && id.argument
            ? entryModal(guild, setting, id, id.argument, t)
            : null;
      if (!modal) return { page };
      const result = modal.submit(input);
      return 'error' in result ? { page, error: result.error } : { page, save: result.save };
    },

    onSaved: definition.onSaved,
  };
}

/** Work out what a button or select of an entries setting should do. */
function handleEntries<C>(
  guild: Guild,
  setting: AnyEntriesSetting<C>,
  config: C,
  id: ParsedSettingsCustomId,
  input: SettingsInput,
  t: Translate,
): Omit<SettingsResult, 'page'> {
  const entries = setting.get(config);

  if (id.argument === 'remove') {
    const targetId = input.type === 'select' ? input.values[0] : undefined;
    return targetId ? { save: () => saveEntry(guild, setting, targetId, null) } : {};
  }

  if (id.argument === 'add') {
    const targetId = input.type === 'select' ? input.values[0] : undefined;
    if (!targetId) return {};
    const existing = entries.find((entry) => entry.targetId === targetId);
    if (!existing && entries.length >= setting.max) return {};

    if (!existing && setting.target === 'role' && setting.assignable) {
      const reason = unassignableReason(guild, targetId, t);
      if (reason) return { error: t('settings.role.refused', { role: roleMention(targetId), reason }) };
    }

    // Without presets, the value is always typed, also to change it for an existing entry
    if (!setting.presets) return { modal: entryModal(guild, setting, id, targetId, t, existing?.value) };
    if (existing) return {};
    const value = setting.defaultValue ?? setting.presets[0] ?? 1;
    return { save: () => saveEntry(guild, setting, targetId, value) };
  }

  // A button of an entry: move to the next preset, and after the last one ask for a custom value
  const entry = entries.find((candidate) => candidate.targetId === id.argument);
  if (!entry || !setting.presets) return { outdated: true };
  if (id.shown !== String(entry.value)) return { outdated: true };

  const index = setting.presets.indexOf(entry.value);
  if (index === setting.presets.length - 1) return { modal: entryModal(guild, setting, id, entry.targetId, t, entry.value) };
  // A custom value starts over at the first preset
  const next = setting.presets[index + 1] ?? setting.presets[0]!;
  return { save: () => saveEntry(guild, setting, entry.targetId, next) };
}
