import { createCanvas, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  Guild,
  MediaGalleryBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  userMention,
  type InteractionEditReplyOptions,
} from 'discord.js';

import { getLevelFromXP, getTopUsersByXP, getTopWeeklyUsersByXP, getTotalUsersWithXP, getTotalWeeklyUsersWithXP } from 'database/leveling';

import { drawAvatar, truncateText } from 'utility/canvas';
import { formatCompactNumber } from 'utility/duration';
import type { Translate } from 'utility/i18next';
import { ThemeColors } from 'utility/theme';

const ITEMS_PER_PAGE = 5;

// In-Memory Avatar Cache (15 minute TTL)
const avatarCache = new Map<string, { image: Image; expiresAt: number }>();
const CACHE_TTL = 1000 * 60 * 15;

async function getCachedAvatar(url: string | null): Promise<Image | null> {
  if (!url) return null;

  const now = Date.now();
  const cached = avatarCache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.image;
  }

  try {
    const image = await loadImage(url);
    avatarCache.set(url, { image, expiresAt: now + CACHE_TTL });
    return image;
  } catch {
    return null;
  }
}

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
  ctx.fillText(`${t('leveling.rank.level').toUpperCase()}: ${level.toLocaleString(t('locale'))}`, rightX, centerY - 10);
  ctx.fillText(`${t('leveling.rank.exp').toUpperCase()}: ${formatCompactNumber(entry.xp, t)}`, rightX, centerY + 14);
}

/**
 * Draw a page of the leaderboard: the top 3 on a podium and the rest in rows on the first page, rows only on the others.
 * @returns The page as a PNG.
 */
export function renderLeaderboardCanvas(entries: LeaderboardEntry[], isTopPodiumView: boolean, t: Translate): Buffer {
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
      ctx.fillText(`${t('leveling.rank.level').toUpperCase()}: ${level.toLocaleString(t('locale'))}`, avatarX, item.y + (isFirst ? 124 : 112));

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

/** The page buttons and the sort select, which stay the same in image and text mode. */
function buildControls(page: number, totalPages: number, sortOrder: 'asc' | 'desc', t: Translate) {
  const rowPageButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('lb_first')
      .setEmoji(t('pagination.first.icon'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 1),
    new ButtonBuilder()
      .setCustomId('lb_prev')
      .setEmoji(t('pagination.previous.icon'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 1),
    new ButtonBuilder()
      .setCustomId(`lb_custom_${page}_${totalPages}`)
      .setLabel(t('pagination.page.label', { current: page, total: totalPages }))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(false),
    new ButtonBuilder()
      .setCustomId('lb_next')
      .setEmoji(t('pagination.next.icon'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === totalPages),
    new ButtonBuilder()
      .setCustomId(`lb_last_${totalPages}`)
      .setEmoji(t('pagination.last.icon'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === totalPages),
  );

  const rowSortOrder = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`lb_sort`).addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(t('pagination.sort.ascending'))
        .setValue('asc')
        .setEmoji('⬆️')
        .setDefault(sortOrder === 'asc'),
      new StringSelectMenuOptionBuilder()
        .setLabel(t('pagination.sort.descending'))
        .setValue('desc')
        .setEmoji('⬇️')
        .setDefault(sortOrder === 'desc'),
    ),
  );

  return [rowPageButtons, rowSortOrder] as const;
}

/**
 * Build a page of the leaderboard as a Components V2 message: the title, the page as an image or as text, and the controls.
 * @param options.text Whether to show the page as text instead of an image, like for screen readers.
 * @param options.t The translation, for whoever opened or paged the leaderboard.
 */
export async function buildLeaderboard({
  page,
  guild,
  weekly = false,
  sortOrder = 'desc',
  text = false,
  t,
}: {
  page: number;
  guild: Guild;
  weekly: boolean;
  sortOrder?: 'asc' | 'desc';
  text?: boolean;
  t: Translate;
}): Promise<InteractionEditReplyOptions> {
  const userCount = weekly ? await getTotalWeeklyUsersWithXP(guild.id) : await getTotalUsersWithXP(guild.id);
  const totalPages = Math.max(1, Math.ceil(userCount / ITEMS_PER_PAGE));
  const title = t(weekly ? 'leveling.leaderboard.titleWeekly' : 'leveling.leaderboard.title', { guild: guild.name });
  const container = new ContainerBuilder().setAccentColor(ThemeColors.info).addTextDisplayComponents(new TextDisplayBuilder().setContent(title));

  if (userCount === 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('leveling.leaderboard.none')));
    return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
  }

  const pageData = weekly
    ? await getTopWeeklyUsersByXP(guild.id, ITEMS_PER_PAGE, (page - 1) * ITEMS_PER_PAGE, sortOrder)
    : await getTopUsersByXP(guild.id, ITEMS_PER_PAGE, (page - 1) * ITEMS_PER_PAGE, sortOrder);

  // Fetch Discord users/members (Cache First)
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
      position: entry.position.toLocaleString(t('locale')),
      user: text ? userMention(entry.userId) : entry.displayName,
      xp: entry.xp.toLocaleString(t('locale')),
      level: getLevelFromXP(entry.xp).toLocaleString(t('locale')),
    }),
  );
  const controls = buildControls(page, totalPages, sortOrder, t);

  if (text) {
    container
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
      .addActionRowComponents(controls[0])
      .addActionRowComponents(controls[1]);
    return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
  }

  // Fetch avatars in parallel via in-memory LRU cache
  const entries: LeaderboardEntry[] = await Promise.all(
    entriesData.map(async (entry) => ({
      ...entry,
      avatarImage: await getCachedAvatar(entry.avatarUrl),
    })),
  );

  const isTopPodiumView = page === 1 && sortOrder === 'desc';
  const imageBuffer = renderLeaderboardCanvas(entries, isTopPodiumView, t);

  // The image's description is read out by screen readers, as the leaderboard itself is only pixels
  container
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems((item) =>
        item.setURL('attachment://leaderboard.png').setDescription(`${title.replace(/^#+\s*/, '')}: ${lines.join('; ')}`.slice(0, 1024)),
      ),
    )
    .addActionRowComponents(controls[0])
    .addActionRowComponents(controls[1]);

  return {
    components: [container],
    files: [new AttachmentBuilder(imageBuffer, { name: 'leaderboard.png' })],
    flags: [MessageFlags.IsComponentsV2],
    allowedMentions: { parse: [] },
  };
}
