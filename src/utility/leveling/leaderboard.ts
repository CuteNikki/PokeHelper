import { createCanvas, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Guild,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  userMention,
  type InteractionEditReplyOptions,
} from 'discord.js';

import { getLevelFromXP, getTopUsersByXP, getTotalUsersWithXP, type LevelPeriod } from 'database/leveling';

import { buttonIcon } from 'utility/emojis';
import { drawAvatar, loadAvatar, truncateText } from 'utility/canvas';
import { formatCompactNumber, formatNumber } from 'utility/duration';
import type { Translate } from 'utility/i18next';
import { leaderboardCustomId, nextPeriod, type LeaderboardView } from 'utility/leveling/leaderboardView';
import { buildPageRow, clampPage, findMeButton, type PageButton } from 'utility/pagination';
import { imageWithDescription } from 'utility/response';

export const ITEMS_PER_PAGE = 5;

/** The title of each period's leaderboard. */
const TITLE_KEYS = {
  allTime: 'leveling.leaderboard.title',
  weekly: 'leveling.leaderboard.titleWeekly',
  monthly: 'leveling.leaderboard.titleMonthly',
} as const satisfies Record<LevelPeriod, string>;

export interface LeaderboardEntry {
  userId: string;
  xp: number;
  position: number;
  displayName: string;
  username: string;
  avatarImage: Image | null;
}

interface LeaderboardColors {
  cardBg: string;
  podiumCenter: string;
  podiumSides: string;
  accentGold: string;
  accentSilver: string;
  accentBronze: string;
  textWhite: string;
  textGray: string;
}

function drawRowCard(ctx: SKRSContext2D, entry: LeaderboardEntry, x: number, y: number, w: number, h: number, colors: LeaderboardColors, t: Translate) {
  ctx.fillStyle = colors.cardBg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();

  const centerY = y + h / 2;

  // Rank Number
  ctx.font = 'bold 32px "Roboto"';
  ctx.fillStyle = colors.textWhite;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`#${formatCompactNumber(entry.position, t)}`, x + 24, centerY);

  // Avatar
  const avatarX = x + 120;
  drawAvatar(ctx, entry.avatarImage, avatarX, centerY, 28);

  // User Name & Username
  const nameX = avatarX + 44;
  ctx.textAlign = 'left';
  ctx.font = 'bold 20px "Roboto", "EmojiFallback"';
  ctx.fillStyle = colors.textWhite;

  const displayName = truncateText(ctx, entry.displayName, 240);
  ctx.fillText(displayName, nameX, centerY - 10);

  ctx.font = '16px "Roboto"';
  ctx.fillStyle = colors.textGray;

  const username = truncateText(ctx, `@${entry.username}`, 240);
  ctx.fillText(username, nameX, centerY + 15);

  // Stats
  const rightX = x + w - 24;
  const level = getLevelFromXP(entry.xp);

  ctx.textAlign = 'right';
  ctx.font = 'bold 17px "Roboto"';
  ctx.fillStyle = colors.textGray;
  ctx.fillText(`${t('leveling.rank.level').toUpperCase()}: ${formatNumber(level, t)}`, rightX, centerY - 10);
  ctx.fillText(`${t('leveling.rank.exp').toUpperCase()}: ${formatCompactNumber(entry.xp, t)}`, rightX, centerY + 14);
}

/**
 * Draw a page of the leaderboard: the top 3 on a podium and the rest in rows on the first page, rows only on the others.
 * @returns The page as a PNG.
 */
function renderLeaderboardCanvas(entries: LeaderboardEntry[], isTopPodiumView: boolean, t: Translate): Buffer {
  const width = 760;
  const margin = 30;
  const podiumTopY = 110;
  const podiumHeight = 170;
  const rowGap = 15;

  // The podium needs the top 3, without them the first page is rows like the others
  const usesPodium = isTopPodiumView && entries.length >= 3;
  const rows = usesPodium ? entries.slice(3) : entries;
  const rowHeight = usesPodium ? 85 : 95;
  const rowsTop = usesPodium ? podiumTopY + podiumHeight + 25 : margin;
  // As tall as the page's content, so a page with fewer people has no empty space below them
  const contentBottom = rows.length > 0 ? rowsTop + rows.length * (rowHeight + rowGap) - rowGap : usesPodium ? podiumTopY + podiumHeight : 0;
  const height = contentBottom + margin;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const colors: LeaderboardColors = {
    cardBg: 'rgba(42, 43, 60, 0.85)',
    podiumCenter: '#35374a',
    podiumSides: '#35374a',
    accentGold: '#ffa000',
    accentSilver: '#9e9e9e',
    accentBronze: '#ac6926',
    textWhite: '#ffffff',
    textGray: '#a6adc8',
  };

  if (usesPodium) {
    const top3 = [
      { entry: entries[1], x: 30, w: 226, h: podiumHeight - 20, y: podiumTopY + 20, color: colors.accentSilver, rank: 2 },
      { entry: entries[0], x: 262, w: 236, h: podiumHeight, y: podiumTopY, color: colors.accentGold, rank: 1 },
      { entry: entries[2], x: 504, w: 226, h: podiumHeight - 20, y: podiumTopY + 20, color: colors.accentBronze, rank: 3 },
    ];

    for (const item of top3) {
      if (!item.entry) continue;

      const isFirst = item.rank === 1;

      ctx.fillStyle = isFirst ? colors.podiumCenter : colors.podiumSides;
      ctx.beginPath();
      ctx.roundRect(item.x, item.y, item.w, item.h, 12);
      ctx.fill();

      const avatarX = item.x + item.w / 2;
      const avatarY = item.y - 10;
      const avatarRadius = isFirst ? 42 : 36;

      drawAvatar(ctx, item.entry.avatarImage, avatarX, avatarY, avatarRadius, item.color);

      if (isFirst) {
        // Tilted on the upper right of the avatar and over its ring, like a crown sitting on a head.
        // Drawn after the avatar, which would cover it otherwise
        const edgeAngle = -Math.PI / 3;
        ctx.save();
        ctx.translate(avatarX + Math.cos(edgeAngle) * avatarRadius, avatarY + Math.sin(edgeAngle) * avatarRadius);
        // Turned to point away from the avatar's center, as its spot on the edge is 30° from the top
        ctx.rotate(Math.PI / 2 + edgeAngle);
        ctx.font = '34px "EmojiFallback"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('👑', 0, -10);
        ctx.restore();
      }

      // Rank Badge
      ctx.beginPath();
      ctx.arc(avatarX, avatarY + avatarRadius, 12, 0, Math.PI * 2);
      ctx.fillStyle = item.color;
      ctx.fill();

      ctx.font = 'bold 13px "Roboto"';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${item.rank}`, avatarX, avatarY + avatarRadius);

      // Display & Username
      ctx.textBaseline = 'alphabetic';
      ctx.font = 'bold 20px "Roboto", "EmojiFallback"';
      ctx.fillStyle = colors.textWhite;

      const displayName = truncateText(ctx, item.entry.displayName, item.w - 20);
      ctx.fillText(displayName, avatarX, item.y + (isFirst ? 68 : 58));

      ctx.font = '15px "Roboto"';
      ctx.fillStyle = colors.textGray;

      const userName = truncateText(ctx, `@${item.entry.username}`, item.w - 20);
      ctx.fillText(userName, avatarX, item.y + (isFirst ? 90 : 80));

      // Level
      const level = getLevelFromXP(item.entry.xp);

      ctx.font = 'bold 16px "Roboto"';
      ctx.fillStyle = item.color;
      ctx.fillText(`${t('leveling.rank.level').toUpperCase()}: ${formatNumber(level, t)}`, avatarX, item.y + (isFirst ? 124 : 112));

      // XP
      ctx.font = 'bold 15px "Roboto"';
      ctx.fillStyle = colors.textGray;
      ctx.fillText(`${t('leveling.rank.exp').toUpperCase()}: ${formatCompactNumber(item.entry.xp, t)}`, avatarX, item.y + (isFirst ? 146 : 134));
    }
  }

  // Ranks #4 and #5 below the podium, or the whole page
  rows.forEach((entry, index) => drawRowCard(ctx, entry, margin, rowsTop + index * (rowHeight + rowGap), width - margin * 2, rowHeight, colors, t));

  return canvas.toBuffer('image/png');
}

/** The button switching to the next of all-time, weekly and monthly, which starts over at the first page. */
function periodButton(view: LeaderboardView, t: Translate) {
  const period = nextPeriod(view.period);
  return new ButtonBuilder()
    .setCustomId(leaderboardCustomId('period', { ...view, period, page: 1 }))
    .setStyle(ButtonStyle.Secondary)
    .setEmoji(buttonIcon('calendar'))
    .setLabel(t(`leveling.leaderboard.showPeriod.${period}`));
}

/** The page buttons and the sort select, which stay the same in image and text mode. Each leads to the view it shows. */
function buildControls(view: LeaderboardView, totalPages: number, t: Translate) {
  // The view counts pages from 1, which its custom IDs keep, so buttons from before still work
  const customId = (button: PageButton, target: number) => leaderboardCustomId(button, { ...view, page: Math.min(Math.max(target, 0), totalPages - 1) + 1 });
  const rowPageButtons = buildPageRow(view.page - 1, totalPages, customId, t);

  // Sorting starts over at the first page
  const rowSortOrder = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(leaderboardCustomId('sort', { ...view, page: 1 })).addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(t('pagination.sort.ascending'))
        .setValue('asc')
        .setEmoji(buttonIcon('arrow-up-narrow-wide'))
        .setDefault(view.sortOrder === 'asc'),
      new StringSelectMenuOptionBuilder()
        .setLabel(t('pagination.sort.descending'))
        .setValue('desc')
        .setEmoji(buttonIcon('arrow-down-wide-narrow'))
        .setDefault(view.sortOrder === 'desc'),
    ),
  );

  // On a row of their own, under the sorting they follow: finding yourself, switching between all-time, weekly and monthly,
  // and switching between the image and text, like for screen readers
  const mode = new ButtonBuilder()
    .setCustomId(leaderboardCustomId('mode', { ...view, text: !view.text }))
    .setStyle(ButtonStyle.Secondary)
    .setEmoji(view.text ? buttonIcon('image') : buttonIcon('file-text'))
    .setLabel(t(view.text ? 'leveling.leaderboard.showImage' : 'leveling.leaderboard.showText'));
  const rowMore = new ActionRowBuilder<ButtonBuilder>().addComponents(findMeButton(leaderboardCustomId('me', view), t), periodButton(view, t), mode);

  return [rowPageButtons, rowSortOrder, rowMore] as const;
}

/**
 * Build a page of the leaderboard as a Components V2 message: the title, the page as an image or as text, and the controls.
 * @param t The translation, for whoever opened or paged the leaderboard.
 */
export async function buildLeaderboard(requested: LeaderboardView, guild: Guild, t: Translate): Promise<InteractionEditReplyOptions> {
  const { period, sortOrder, text } = requested;
  const userCount = await getTotalUsersWithXP(guild.id, period);
  // The list may have shrunk since the buttons were made, or a page that doesn't exist was asked for
  const { page: index, pages: totalPages } = clampPage(requested.page - 1, userCount, ITEMS_PER_PAGE);
  const page = index + 1;
  const title = t(TITLE_KEYS[period], { guild: guild.name });
  // Shown without a container around it, the image already has its own cards
  const heading = new TextDisplayBuilder().setContent(title);

  if (userCount === 0) {
    const none = new TextDisplayBuilder().setContent(t('leveling.leaderboard.none'));
    // Still with the period button, as the weekly or monthly one is empty right after a reset, and without the image of the one switched from
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(periodButton(requested, t));
    return { components: [heading, none, row], attachments: [], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
  }

  const pageData = await getTopUsersByXP(guild.id, period, ITEMS_PER_PAGE, (page - 1) * ITEMS_PER_PAGE, sortOrder);

  const entriesData = await Promise.all(
    pageData.map(async (entry, index) => {
      const position = (page - 1) * ITEMS_PER_PAGE + index + 1;

      const member = guild.members.cache.get(entry.userId) ?? (await guild.members.fetch(entry.userId).catch(() => null));
      const user = member?.user ?? guild.client.users.cache.get(entry.userId) ?? (await guild.client.users.fetch(entry.userId).catch(() => null));

      return {
        userId: entry.userId,
        xp: entry.xp,
        position,
        displayName: member?.displayName || user?.displayName || user?.username || t('settings.unknown', { id: entry.userId }),
        username: user?.username || entry.userId,
        avatarUrl: user?.displayAvatarURL({ extension: 'png', size: 128 }) ?? null,
      };
    }),
  );

  const lines = entriesData.map((entry) =>
    t('leveling.leaderboard.entry', {
      position: formatNumber(entry.position, t),
      user: text ? userMention(entry.userId) : entry.displayName,
      xp: formatNumber(entry.xp, t),
      level: formatNumber(getLevelFromXP(entry.xp), t),
    }),
  );
  const controls = buildControls({ ...requested, page }, totalPages, t);

  if (text) {
    const list = new TextDisplayBuilder().setContent(lines.join('\n'));
    // Without attachments, so the image is taken off when switching to text
    return { components: [heading, list, ...controls], attachments: [], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
  }

  // Avatars are loaded at the same time, from the cache when they were shown recently
  const entries: LeaderboardEntry[] = await Promise.all(
    entriesData.map(async (entry) => ({
      ...entry,
      avatarImage: await loadAvatar(entry.avatarUrl),
    })),
  );

  const isTopPodiumView = page === 1 && sortOrder === 'desc';
  const imageBuffer = renderLeaderboardCanvas(entries, isTopPodiumView, t);

  // Without the heading's #, which a screen reader would read out
  const { gallery, file } = imageWithDescription('leaderboard.png', imageBuffer, `${title.replace(/^#+\s*/, '')}: ${lines.join('; ')}`);

  return {
    components: [heading, gallery, ...controls],
    files: [file],
    flags: [MessageFlags.IsComponentsV2],
    allowedMentions: { parse: [] },
  };
}
