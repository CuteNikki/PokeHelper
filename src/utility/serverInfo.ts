import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  ChannelType,
  type ModalSubmitInteraction,
  roleMention,
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
import { getTranslate, type Translate } from 'utility/i18next';
import type { IconName } from 'utility/icons';
import { userRef, when } from 'utility/logs/format';
import { buildPageModal, buildPageRow, clampPage, type PageButton, readPageInput } from 'utility/pagination';
import { quietMessageOf, type ResponsePayload, sendError } from 'utility/response';
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
    t('serverinfo.boostLevel', { level: number(guild.premiumTier) }),
    t('serverinfo.boosts', { count: number(guild.premiumSubscriptionCount ?? 0) }),
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
  const view = (list: ServerList, icon: IconName) =>
    new ButtonBuilder()
      .setCustomId(serverInfoId(list, 0))
      .setLabel(t(`serverinfo.${list}.button`))
      .setEmoji(buttonIcon(icon))
      .setStyle(ButtonStyle.Secondary);
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(view('roles', 'tag'), view('emojis', 'smile').setDisabled(emojis.size === 0)),
  );
  if (buttons.length > 0) container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons));

  return quietMessageOf(container);
}

/**
 * The buttons of /serverinfo are `serverinfo:<view>:<page>`, for the overview or a list in its place, so they work however old the message is.
 * The first and last page buttons and the one asking for a page end in what they are, as they can lead to the same page as others.
 * The popup asking for a page is `serverinfo-goto:<list>`.
 */
export const SERVER_INFO_PREFIX = 'serverinfo:';
export const SERVER_INFO_PAGE_MODAL_PREFIX = 'serverinfo-goto:';

type ServerList = 'roles' | 'emojis';
type ServerView = 'overview' | ServerList;
const VIEWS: ServerView[] = ['overview', 'roles', 'emojis'];
/** Roles are a line each, emojis only a few characters, so many fit on a page. */
const PAGE_SIZES: Record<ServerList, number> = { roles: 20, emojis: 50 };

const serverInfoId = (view: ServerView, page: number, suffix?: PageButton) => `${SERVER_INFO_PREFIX}${view}:${page}${suffix ? `:${suffix}` : ''}`;

export function parseServerInfoId(customId: string): { view: ServerView; page: number; goto: boolean } | null {
  const [view, page, suffix, ...rest] = customId.slice(SERVER_INFO_PREFIX.length).split(':');
  if (!VIEWS.includes(view as ServerView) || !/^\d{1,6}$/.test(page ?? '') || rest.length > 0) return null;
  if (suffix !== undefined && !['first', 'last', 'goto'].includes(suffix)) return null;
  return { view: view as ServerView, page: Number(page), goto: suffix === 'goto' };
}

/** A page of the server's roles, highest first, or its emojis, the still ones first, with page buttons and the way back to the overview. */
export function buildServerList(guild: Guild, list: ServerList, requested: number, t: Translate): ResponsePayload {
  const number = (value: number) => formatNumber(value, t);
  const roles = guild.roles.cache.filter((role) => role.id !== guild.id).sort((a, b) => b.position - a.position);
  const emojis = guild.emojis.cache.sort((a, b) => Number(a.animated) - Number(b.animated) || (a.name ?? '').localeCompare(b.name ?? ''));
  const total = list === 'roles' ? roles.size : emojis.size;
  const { page, pages } = clampPage(requested, total, PAGE_SIZES[list]);
  const start = page * PAGE_SIZES[list];

  let count: string;
  let content: string;
  if (list === 'roles') {
    // With @everyone, as Discord's limit counts it
    count = t('serverinfo.roles.count', { count: number(guild.roles.cache.size), max: number(MAX_ROLES) });
    const shown = [...roles.values()].slice(start, start + PAGE_SIZES.roles);
    content = shown.length > 0 ? shown.map((role, index) => `${number(start + index + 1)}. ${roleMention(role.id)}`).join('\n') : t('serverinfo.roles.none');
  } else {
    const animated = emojis.filter((emoji) => emoji.animated).size;
    const max = number(MAX_EMOJIS[guild.premiumTier]);
    count = t('serverinfo.emojis.count', { still: number(emojis.size - animated), animated: number(animated), max });
    const shown = [...emojis.values()].slice(start, start + PAGE_SIZES.emojis);
    content = shown.length > 0 ? shown.map((emoji) => emoji.toString()).join(' ') : t('serverinfo.emojis.none');
  }

  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${t(`serverinfo.${list}.title`)}\n${subtext(count)}`))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
  if (pages > 1) {
    const customId = (button: PageButton, target: number) => serverInfoId(list, target, button === 'prev' || button === 'next' ? undefined : button);
    container.addActionRowComponents(buildPageRow(page, pages, customId, t));
  }
  // Under everything else, like the other ways back
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(serverInfoId('overview', 0))
        .setLabel(t('serverinfo.back'))
        .setEmoji(buttonIcon('chevron-left'))
        .setStyle(ButtonStyle.Secondary),
    ),
  );
  return quietMessageOf(container);
}

/** The buttons of /serverinfo: a list or the overview in the message's place, or the popup asking which page. */
export async function handleServerInfoButton(interaction: ButtonInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const parsed = parseServerInfoId(interaction.customId);
  if (!parsed) return sendError(interaction, t('system.outdated'));
  const { view, page, goto } = parsed;

  // Asks which page in a popup, which has to be the first answer
  if (goto && view !== 'overview') return interaction.showModal(buildPageModal(`${SERVER_INFO_PAGE_MODAL_PREFIX}${view}`, page + 1, t));
  if (view !== 'overview') return interaction.update(buildServerList(interaction.guild, view, page, t));
  // Answered first, as the overview asks Discord and the database
  await interaction.deferUpdate();
  return interaction.editReply(await buildServerInfo(interaction.guild, t));
}

/** Go to the page typed into the popup. A page past the end shows the last one. */
export async function handleServerInfoModal(interaction: ModalSubmitInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const list = interaction.customId.slice(SERVER_INFO_PAGE_MODAL_PREFIX.length);
  if ((list !== 'roles' && list !== 'emojis') || !interaction.inCachedGuild() || !interaction.isFromMessage())
    return sendError(interaction, t('system.outdated'));
  const page = readPageInput(interaction);
  if (page === null) return sendError(interaction, t('pagination.modal.invalid'));
  return interaction.update(buildServerList(interaction.guild, list, page - 1, t));
}
