import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  channelMention,
  ChannelType,
  ContainerBuilder,
  type Guild,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  subtext,
  TextDisplayBuilder,
} from 'discord.js';

import { getFeatureSwitches } from 'database/features';
import {
  getTempVoiceChannel,
  getTempVoiceCreator,
  getTempVoiceCreatorByChannel,
  getTempVoiceCreators,
  updateTempVoiceCreator,
  type TempVoiceCreator,
} from 'database/tempVoice';

import { buttonIcon } from 'utility/emojis';
import type { Translate } from 'utility/i18next';
import { formatNumber } from 'utility/duration';
import type { ResponsePayload } from 'utility/response';
import { DiscordLimits } from 'utility/discordLimits';
import { buildSwitchSection, createSettingsPanel, formatPermissions, type SettingsPanel } from 'utility/settings';
import { creatorCategory, missingCreatorPermissions, TEMP_VOICE_PERMISSIONS } from 'utility/tempVoice/channel';
import { ThemeColors } from 'utility/theme';

/** Each join channel has its own panel, with its ID after this. */
export const TEMP_VOICE_PANEL_PREFIX = 'voice-';
/** Custom IDs of the buttons and selects around the panels, like `voicecfg:delete:<join channel>`. */
export const TEMP_VOICE_CONFIG_ID = {
  open: 'voicecfg:open',
  list: 'voicecfg:list',
  /** Turns all join channels on or off at once. */
  toggle: 'voicecfg:toggle',
  delete: 'voicecfg:delete:',
  confirmDelete: 'voicecfg:confirm-delete:',
  back: 'voicecfg:back:',
} as const;

/** The most join channels a server can have. */
export const MAX_TEMP_VOICE_CREATORS = 10;
const MAX_PREFIX_LENGTH = 20;

/** How a join channel is called for admins: by its channel's name. */
export const creatorName = (creator: TempVoiceCreator, guild: Guild, t: Translate) => {
  const channel = guild.channels.cache.get(creator.channelId);
  return channel ? channel.name : t('tempVoice.config.missingChannel');
};

/** Where its channels go and whether the bot can make them there, or what's wrong. */
function status(creator: TempVoiceCreator, guild: Guild, t: Translate): string {
  if (!guild.channels.cache.has(creator.channelId)) return t('settings.warning', { warning: t('tempVoice.config.status.missingChannel') });
  const category = creatorCategory(guild, creator);
  const where = category ? t('tempVoice.config.status.category', { category: channelMention(category.id) }) : t('tempVoice.config.status.noCategory');
  const missing = missingCreatorPermissions(guild, creator);
  if (missing.length > 0) {
    return `${where}\n${t('settings.warning', { warning: t('tempVoice.config.status.missingPermissions', { permissions: formatPermissions(missing, t) }) })}`;
  }
  if (!creator.enabled) return `${where}\n${t('tempVoice.config.status.off')}`;
  return `${where}\n${t('tempVoice.config.status.ready', { channel: channelMention(creator.channelId) })}`;
}

/** The settings panel of one join channel. */
export function getTempVoiceSettings(creatorId: string): SettingsPanel {
  return createSettingsPanel<TempVoiceCreator>({
    id: `${TEMP_VOICE_PANEL_PREFIX}${creatorId}`,
    title: (t) => t('tempVoice.config.title'),
    permissions: ['ManageChannels'],
    // The panel's custom IDs carry the join channel's ID, so make sure it's one of this server
    load: async (guildId) => {
      const creator = await getTempVoiceCreator(creatorId);
      return creator?.guildId === guildId ? creator : null;
    },
    notConfigured: (t) => t('tempVoice.config.notFound'),
    // Only how it is right now, which already names the channel
    header: (creator, { guild }, t) => (guild ? status(creator, guild, t) : null),
    footer: (creator, t) => [
      new ButtonBuilder()
        .setCustomId(`${TEMP_VOICE_CONFIG_ID.delete}${creator.id}`)
        .setLabel(t('tempVoice.config.delete'))
        .setEmoji(buttonIcon('trash-2'))
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(TEMP_VOICE_CONFIG_ID.list).setLabel(t('tempVoice.config.back')).setStyle(ButtonStyle.Secondary),
    ],
    tips: (t) => t('tempVoice.tips', { returnObjects: true }),
    settings: [
      {
        type: 'boolean',
        key: 'enabled',
        defaultValue: true,
        label: (t) => t('tempVoice.config.enabled.label'),
        description: (t) => t('tempVoice.config.enabled.description'),
        get: (creator) => creator.enabled,
        set: (_guildId, enabled) => updateTempVoiceCreator(creatorId, { enabled }),
      },
      {
        type: 'channel',
        key: 'channel',
        channelTypes: [ChannelType.GuildVoice],
        required: true,
        // To move people out of it into their channel
        botPermissions: ['ViewChannel', 'MoveMembers'],
        label: (t) => t('tempVoice.config.channel.label'),
        description: (t) => t('tempVoice.config.channel.description'),
        get: (creator) => creator.channelId,
        // A channel can only be one join channel, and a temporary channel can't become one
        refusal: async (channelId, t) => {
          const [other, temporary] = await Promise.all([getTempVoiceCreatorByChannel(channelId), getTempVoiceChannel(channelId)]);
          if (other && other.id !== creatorId) return t('tempVoice.config.alreadyJoin', { channel: channelMention(channelId) });
          return temporary ? t('tempVoice.config.isTemporary') : null;
        },
        set: async (_guildId, channelId) => {
          if (channelId) await updateTempVoiceCreator(creatorId, { channelId });
        },
      },
      {
        type: 'channel',
        key: 'category',
        channelTypes: [ChannelType.GuildCategory],
        botPermissions: TEMP_VOICE_PERMISSIONS,
        label: (t) => t('tempVoice.config.category.label'),
        description: (t) => t('tempVoice.config.category.description'),
        get: (creator) => creator.categoryId,
        set: (_guildId, categoryId) => updateTempVoiceCreator(creatorId, { categoryId }),
      },
      {
        type: 'text',
        key: 'prefix',
        maxLength: MAX_PREFIX_LENGTH,
        label: (t) => t('tempVoice.config.prefix.label'),
        description: (t) => t('tempVoice.config.prefix.description'),
        placeholder: (t) => t('tempVoice.config.prefix.placeholder'),
        get: (creator) => creator.namePrefix || null,
        // Kept as typed, so a space at the end separates it from the name
        set: (_guildId, prefix) => updateTempVoiceCreator(creatorId, { namePrefix: prefix ?? '' }),
      },
    ],
  });
}

/** The list of a server's join channels, with a select to open one. */
export async function renderTempVoiceList(guild: Guild, t: Translate): Promise<ResponsePayload> {
  const [creators, { tempVoiceEnabled }] = await Promise.all([getTempVoiceCreators(guild.id), getFeatureSwitches(guild.id)]);
  // The switch for all join channels at once, above the list, as each has its own too
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    // What join channels are, as the list is where admins start
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${t('tempVoice.config.list.title')}\n${t('tempVoice.config.list.description')}`))
    // Large, so the title, the switch and the list stand apart, like in the settings panels
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addSectionComponents(
      buildSwitchSection(
        t('tempVoice.config.list.enabled.label'),
        t('tempVoice.config.list.enabled.description'),
        tempVoiceEnabled,
        TEMP_VOICE_CONFIG_ID.toggle,
        t,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));

  if (creators.length === 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('tempVoice.config.list.none')));
    return { components: [container], flags: [MessageFlags.IsComponentsV2] };
  }

  const lines = creators.map((creator, index) => {
    const category = creatorCategory(guild, creator);
    const line = t('tempVoice.config.list.item', {
      position: index + 1,
      channel: channelMention(creator.channelId),
      category: category ? channelMention(category.id) : t('tempVoice.config.status.noCategoryShort'),
    });
    // So it's seen without opening it
    return creator.enabled ? line : `${line} · ${t('tempVoice.config.list.off')}`;
  });
  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [subtext(t('tempVoice.config.list.count', { count: creators.length, max: formatNumber(MAX_TEMP_VOICE_CREATORS, t) })), ...lines].join('\n'),
      ),
    )
    // Large, like before the buttons at the bottom of the settings panels
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(TEMP_VOICE_CONFIG_ID.open)
          .setPlaceholder(t('tempVoice.config.list.placeholder'))
          .addOptions(
            creators.map((creator) =>
              new StringSelectMenuOptionBuilder().setLabel(creatorName(creator, guild, t).slice(0, DiscordLimits.optionLabelLength)).setValue(creator.id),
            ),
          ),
      ),
    );

  return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}
