import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  escapeMarkdown,
  type Guild,
  GuildPremiumTier,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  subtext,
  TextDisplayBuilder,
  ThumbnailBuilder,
  GuildVerificationLevel,
} from 'discord.js';

import { getFeatureOverview } from 'database/features';

import { formatNumber } from 'utility/duration';
import { buttonIcon, switchIcon } from 'utility/emojis';
import type { Translate } from 'utility/i18next';
import { userRef, when } from 'utility/logs/format';
import { quietMessageOf, type ResponsePayload } from 'utility/response';
import { code } from 'utility/text';
import { ThemeColors } from 'utility/theme';

/** Channels a server can have, categories included, and roles, @everyone included. */
const MAX_CHANNELS = 500;
const MAX_ROLES = 250;
/** Emojis a server can have by its boost level, as many still ones as animated ones, and stickers. */
const MAX_EMOJIS: Record<GuildPremiumTier, number> = {
  [GuildPremiumTier.None]: 50,
  [GuildPremiumTier.Tier1]: 100,
  [GuildPremiumTier.Tier2]: 150,
  [GuildPremiumTier.Tier3]: 250,
};
const MAX_STICKERS: Record<GuildPremiumTier, number> = {
  [GuildPremiumTier.None]: 5,
  [GuildPremiumTier.Tier1]: 15,
  [GuildPremiumTier.Tier2]: 30,
  [GuildPremiumTier.Tier3]: 60,
};

const VERIFICATION_LEVELS = {
  [GuildVerificationLevel.None]: 'none',
  [GuildVerificationLevel.Low]: 'low',
  [GuildVerificationLevel.Medium]: 'medium',
  [GuildVerificationLevel.High]: 'high',
  [GuildVerificationLevel.VeryHigh]: 'veryHigh',
} as const satisfies Record<GuildVerificationLevel, string>;

/** The features listed, by their category in /help, whose name they're shown with. */
type FeatureCategory = 'leveling' | 'counting' | 'birthday' | 'starboard' | 'logs' | 'role-menu' | 'temp-voice' | 'sticky' | 'giveaway';

/** Each feature as a line with whether it's on, and how many there are of the ones a server can have several of. */
async function featureLines(guild: Guild, t: Translate): Promise<string[]> {
  const overview = await getFeatureOverview(guild.id);
  const counts = overview?._count;
  const logs = overview?.logs;
  const logChannel =
    logs &&
    [
      logs.defaultChannelId,
      logs.messagesChannelId,
      logs.membersChannelId,
      logs.moderationChannelId,
      logs.serverChannelId,
      logs.voiceChannelId,
      logs.giveawaysChannelId,
    ].some(Boolean);
  // Without a row, the switches are on, as they are until a server turns them off, and nothing else is set up
  const features: [category: FeatureCategory, on: boolean, count?: string][] = [
    ['leveling', overview?.leveling?.enabled ?? false],
    ['counting', overview?.counting?.enabled ?? false],
    ['birthday', Boolean(overview?.birthday?.enabled && overview.birthday.channelId)],
    ['starboard', Boolean(overview?.starboard?.enabled && overview.starboard.channelId)],
    ['logs', Boolean(logs?.enabled && logChannel)],
    [
      'role-menu',
      (overview?.roleMenusEnabled ?? true) && (counts?.reactionRoleMenus ?? 0) > 0,
      t('serverinfo.features.roleMenus', { count: counts?.reactionRoleMenus ?? 0 }),
    ],
    [
      'temp-voice',
      (overview?.tempVoiceEnabled ?? true) && (counts?.tempVoiceCreators ?? 0) > 0,
      t('serverinfo.features.joinChannels', { count: counts?.tempVoiceCreators ?? 0 }),
    ],
    [
      'sticky',
      (overview?.stickiesEnabled ?? true) && (counts?.stickyMessages ?? 0) > 0,
      t('serverinfo.features.stickies', { count: counts?.stickyMessages ?? 0 }),
    ],
    ['giveaway', overview?.giveawaysEnabled ?? true, t('serverinfo.features.giveaways', { count: counts?.giveaways ?? 0 })],
  ];
  return features.map(([category, on, count]) => `> ${switchIcon(on)} ${t(`help.categories.${category}`)}${count ? ` · ${count}` : ''}`);
}

/** The server: who owns it, since when, how many members and boosts, how many channels, roles, emojis and stickers, and what of the bot it uses. */
export async function buildServerInfo(guild: Guild, t: Translate): Promise<ResponsePayload> {
  // The owner is fetched so their name is known, which userRef looks up
  const [, features] = await Promise.all([guild.fetchOwner().catch(() => null), featureLines(guild, t)]);
  const number = (value: number) => formatNumber(value, t);

  // Which members are bots is only known when all of them are cached, which they aren't fetched for, as that's slow on big servers
  const allCached = guild.members.cache.size === guild.memberCount;
  const bots = guild.members.cache.filter((member) => member.user.bot).size;
  const basics = [
    t('serverinfo.title', { name: escapeMarkdown(guild.name) }),
    ...(guild.description ? [subtext(escapeMarkdown(guild.description))] : []),
    t('serverinfo.id', { id: code(guild.id) }),
    t('serverinfo.owner', { owner: userRef(guild, guild.ownerId) }),
    t('serverinfo.created', { time: when(guild.createdTimestamp) }),
    allCached
      ? t('serverinfo.membersBots', { members: number(guild.memberCount), count: bots })
      : t('serverinfo.members', { members: number(guild.memberCount) }),
    t('serverinfo.boosts', { level: number(guild.premiumTier), count: guild.premiumSubscriptionCount ?? 0 }),
    t('serverinfo.verification', { level: t(`serverinfo.verificationLevels.${VERIFICATION_LEVELS[guild.verificationLevel]}`) }),
  ];

  const channels = guild.channels.cache.filter((channel) => !channel.isThread());
  const ofType = (...types: ChannelType[]) => number(channels.filter((channel) => types.includes(channel.type)).size);
  const emojis = guild.emojis.cache;
  const animated = emojis.filter((emoji) => emoji.animated).size;
  const counts = [
    t('serverinfo.counts.title'),
    t('serverinfo.counts.channels', {
      count: number(channels.size),
      max: number(MAX_CHANNELS),
      text: ofType(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      voice: ofType(ChannelType.GuildVoice, ChannelType.GuildStageVoice),
      categories: ofType(ChannelType.GuildCategory),
      forums: ofType(ChannelType.GuildForum, ChannelType.GuildMedia),
    }),
    t('serverinfo.counts.roles', { count: number(guild.roles.cache.size), max: number(MAX_ROLES) }),
    t('serverinfo.counts.emojis', {
      still: number(emojis.size - animated),
      animated: number(animated),
      max: number(MAX_EMOJIS[guild.premiumTier]),
    }),
    t('serverinfo.counts.stickers', { count: number(guild.stickers.cache.size), max: number(MAX_STICKERS[guild.premiumTier]) }),
  ];

  const icon = guild.iconURL({ size: 256 });
  const header = new TextDisplayBuilder().setContent(basics.join('\n'));
  const container = new ContainerBuilder().setAccentColor(ThemeColors.info);
  if (icon) container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(header).setThumbnailAccessory(new ThumbnailBuilder().setURL(icon)));
  else container.addTextDisplayComponents(header);
  container
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(counts.join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([t('serverinfo.features.title', { bot: guild.client.user.username }), ...features].join('\n')),
    );

  const images = [
    ['icon', guild.iconURL({ size: 4096 })],
    ['banner', guild.bannerURL({ size: 4096 })],
    ['splash', guild.splashURL({ size: 4096 })],
  ] as const;
  const buttons = images
    .filter((image): image is readonly [(typeof image)[0], string] => image[1] !== null)
    .map(([key, url]) =>
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setURL(url)
        .setLabel(t(`serverinfo.images.${key}`))
        .setEmoji(buttonIcon('image')),
    );
  if (buttons.length > 0) container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons));

  return quietMessageOf(container);
}
