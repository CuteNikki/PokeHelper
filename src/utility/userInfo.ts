import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  escapeMarkdown,
  type Client,
  type Guild,
  type GuildMember,
  roleMention,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type UserFlagsString,
} from 'discord.js';

import { getUserCases } from 'database/moderation';

import { fetchMember } from 'utility/discord';
import { buttonIcon } from 'utility/emojis';
import type { Translate } from 'utility/i18next';
import { when } from 'utility/logs/format';
import { code } from 'utility/text';
import { caseCountLine } from 'utility/moderation/cases';
import { fetchBanned, formatUntil } from 'utility/moderation/run';
import { createResponse, quietMessageOf, type ResponsePayload } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/** The flags Discord shows as badges on profiles, in the order it shows them. The others are for its own use, like Spammer. */
const BADGES = [
  'Staff',
  'Partner',
  'CertifiedModerator',
  'Hypesquad',
  'HypeSquadOnlineHouse1',
  'HypeSquadOnlineHouse2',
  'HypeSquadOnlineHouse3',
  'BugHunterLevel1',
  'BugHunterLevel2',
  'ActiveDeveloper',
  'VerifiedDeveloper',
  'PremiumEarlySupporter',
  'VerifiedBot',
] as const satisfies UserFlagsString[];

/** How much of the message the roles can take, as someone can have up to 250 of them, which would be too long for it. */
const ROLES_TEXT_LENGTH = 1500;

/** Roles as mentions, highest first, as many as fit, with how many more there are. */
function roleList(member: GuildMember, t: Translate): { count: number; text: string } {
  const roles = member.roles.cache.filter((role) => role.id !== member.guild.id).sort((a, b) => b.position - a.position);
  const shown: string[] = [];
  let length = 0;
  for (const role of roles.values()) {
    const mention = roleMention(role.id);
    if (length + mention.length + 1 > ROLES_TEXT_LENGTH) break;
    shown.push(mention);
    length += mention.length + 1;
  }
  const more = roles.size - shown.length;
  if (more > 0) shown.push(t('userinfo.roles.more', { count: more }));
  return { count: roles.size, text: shown.join(' ') };
}

/**
 * Someone's profile: who they are and their badges, and in a server, since when they're on it, their roles, and for moderators their cases.
 * Without a server, like in DMs, only what Discord knows of their account.
 * The back button goes on a row of its own at the bottom, under the picture links.
 */
export async function buildUserInfo(
  client: Client,
  userId: string,
  server: { guild: Guild; viewer: GuildMember } | null,
  t: Translate,
  back?: ButtonBuilder,
): Promise<ResponsePayload> {
  // Fetched, as the cache has neither their banner nor their badges
  const [user, member] = await Promise.all([
    client.users.fetch(userId, { force: true }).catch(() => null),
    server ? fetchMember(server.guild, userId) : Promise.resolve(undefined),
  ]);
  if (!user) return createResponse(t('userinfo.notFound'), 'error');

  // Their own name, as the nickname is only this server's, and has a line of its own
  const name = escapeMarkdown(user.displayName);
  const basics = [
    t('userinfo.title', { name }),
    t('userinfo.username', { username: code(user.username) }),
    ...(user.bot ? [t('userinfo.bot')] : []),
    ...(member?.nickname ? [t('userinfo.nickname', { nickname: code(member.nickname) })] : []),
    t('userinfo.id', { id: code(user.id) }),
    t('userinfo.created', { time: when(user.createdTimestamp) }),
  ];
  if (member?.joinedTimestamp) basics.push(t('userinfo.joined', { time: when(member.joinedTimestamp) }));
  if (member?.premiumSinceTimestamp) basics.push(t('userinfo.boosting', { time: when(member.premiumSinceTimestamp) }));
  if (server && member === null) basics.push(t('userinfo.notMember'));

  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(basics.join('\n')))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL((member ?? user).displayAvatarURL({ extension: 'png', size: 256 }))),
    );
  const section = (lines: string[]) =>
    container
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

  if (member) {
    const roles = roleList(member, t);
    const lines = [t('userinfo.roles.title', { count: roles.count }), roles.count > 0 ? `> ${roles.text}` : t('userinfo.roles.none')];
    // Black is what Discord says when no role gives a color
    if (member.displayColor) lines.push(t('userinfo.roles.color', { color: code(member.displayHexColor) }));
    section(lines);
  }

  const badges = BADGES.filter((badge) => user.flags?.has(badge));
  if (badges.length > 0) section([t('userinfo.badges.title'), `> ${badges.map((badge) => t(`userinfo.badges.${badge}`)).join(' · ')}`]);

  if (server?.viewer.permissions.has('ModerateMembers')) {
    const { guild } = server;
    const [{ counts, total }, banned] = await Promise.all([
      getUserCases(guild.id, userId, 'newest', 0, 0),
      member === null ? fetchBanned(guild, userId) : Promise.resolve(false),
    ]);
    const lines: string[] = [];
    if (total > 0) lines.push(`> ${caseCountLine(counts, total, t)}`);
    if (member?.isCommunicationDisabled()) lines.push(`> ${t('moderation.panel.timedOut', { until: formatUntil(member.communicationDisabledUntil) })}`);
    if (banned) lines.push(`> ${t('moderation.panel.banned')}`);
    // Left out for someone with a clean record, who'd only have "0 cases" there
    if (lines.length > 0) section([t('userinfo.moderation.title'), ...lines]);
  }

  // Their own pictures, and the ones they set for this server next to them, each only if they have it
  const pictures = [
    ['avatar', user.displayAvatarURL({ size: 4096 })],
    ['serverAvatar', member?.avatarURL({ size: 4096 }) ?? null],
    ['banner', user.bannerURL({ size: 4096 }) ?? null],
    ['serverBanner', member?.bannerURL({ size: 4096 }) ?? null],
  ] as const;
  const buttons = pictures
    .filter((picture): picture is readonly [(typeof picture)[0], string] => picture[1] !== null)
    .map(([key, url]) =>
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setURL(url)
        .setLabel(t(`userinfo.${key}`))
        .setEmoji(buttonIcon('image')),
    );
  container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons));
  if (back) container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(back));

  return quietMessageOf(container);
}
