import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  Guild,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type InteractionEditReplyOptions,
} from 'discord.js';
import { t } from 'i18next';

import { getLevelFromXP, getTopUsersByXP, getTopWeeklyUsersByXP, getTotalUsersWithXP, getTotalWeeklyUsersWithXP } from 'database/leveling';

const ITEMS_PER_PAGE = 5;

interface LeaderboardEntry {
  userId: string;
  xp: number;
  position: number;
  displayName: string;
  tag: string;
  avatarUrl: string | null;
}

interface LeaderboardColors {
  bg: string;
  cardBg: string;
  podiumCenter: string;
  podiumSides: string;
  accentGold: string;
  accentSilver: string;
  accentBronze: string;
  textWhite: string;
  textGray: string;
}

function formatXP(xp: number): string {
  if (xp >= 1_000_000) return `${(xp / 1_000_000).toFixed(1)}M`;
  if (xp >= 1_000) return `${Math.round(xp / 1000)}K`;
  return xp.toLocaleString();
}

async function drawAvatar(ctx: SKRSContext2D, avatarUrl: string | null, x: number, y: number, radius: number, borderColor?: string) {
  ctx.save();

  if (borderColor) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
    ctx.fillStyle = borderColor;
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (avatarUrl) {
    try {
      const avatar = await loadImage(avatarUrl);
      ctx.drawImage(avatar, x - radius, y - radius, radius * 2, radius * 2);
    } catch {
      ctx.fillStyle = '#45475a';
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  } else {
    ctx.fillStyle = '#45475a';
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  ctx.restore();
}

// Row card matching Image #2 (Large #Rank on the far left)
async function drawRowCard(ctx: SKRSContext2D, entry: LeaderboardEntry, x: number, y: number, w: number, h: number, colors: LeaderboardColors) {
  ctx.fillStyle = colors.cardBg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();

  const centerY = y + h / 2;

  // 1. Rank Number (#4, #5, #6...) on the left
  ctx.font = 'bold 32px "Roboto"';
  ctx.fillStyle = colors.textWhite;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`#${entry.position}`, x + 24, centerY);

  // 2. Avatar
  const avatarX = x + 120;
  await drawAvatar(ctx, entry.avatarUrl, avatarX, centerY, 28);

  // 3. User Name & Tag
  const nameX = avatarX + 44;
  ctx.textAlign = 'left';
  ctx.font = 'bold 20px "Roboto", "EmojiFallback"';
  ctx.fillStyle = colors.textWhite;

  let name = entry.displayName;
  if (ctx.measureText(name).width > 240) {
    name = `${name.slice(0, 14)}...`;
  }
  ctx.fillText(name, nameX, centerY - 10);

  ctx.font = '14px "Roboto"';
  ctx.fillStyle = colors.textGray;
  ctx.fillText(`@${entry.tag}`, nameX, centerY + 14);

  // 4. Stats on the Right
  const rightX = x + w - 24;
  const level = getLevelFromXP(entry.xp);

  ctx.textAlign = 'right';
  ctx.font = 'bold 15px "Roboto"';
  ctx.fillStyle = colors.textGray;
  ctx.fillText(`LEVEL: ${level}`, rightX, centerY - 10);

  ctx.fillText(`XP: ${formatXP(entry.xp)}`, rightX, centerY + 14);
}

async function renderLeaderboardCanvas(entries: LeaderboardEntry[], isTopPodiumView: boolean): Promise<Buffer> {
  const width = 760;
  const height = isTopPodiumView ? 620 : 610;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const colors: LeaderboardColors = {
    bg: '#1e1e2e',
    cardBg: '#2a2b3c',
    podiumCenter: '#212330',
    podiumSides: '#35374a',
    accentGold: '#ffa000',
    accentSilver: '#9e9e9e',
    accentBronze: '#cd7f32',
    textWhite: '#ffffff',
    textGray: '#a6adc8',
  };

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, width, height);

  if (isTopPodiumView && entries.length >= 3) {
    // --- TOP 3 PODIUM LAYOUT ---
    const podiumTopY = 130;
    const podiumHeight = 170;

    const top3 = [
      { entry: entries[1], x: 30, w: 226, h: podiumHeight - 20, y: podiumTopY + 20, color: colors.accentSilver, rank: 2 },
      { entry: entries[0], x: 262, w: 236, h: podiumHeight, y: podiumTopY, color: colors.accentGold, rank: 1 },
      { entry: entries[2], x: 504, w: 226, h: podiumHeight - 20, y: podiumTopY + 20, color: colors.accentBronze, rank: 3 },
    ];

    for (const item of top3) {
      if (!item.entry) continue;

      const isFirst = item.rank === 1;

      // Card Base
      ctx.fillStyle = isFirst ? colors.podiumCenter : colors.podiumSides;
      ctx.beginPath();
      ctx.roundRect(item.x, item.y, item.w, item.h, 12);
      ctx.fill();

      // Avatar & Border
      const avatarX = item.x + item.w / 2;
      const avatarY = item.y - 10;
      const avatarRadius = isFirst ? 42 : 36;

      if (isFirst) {
        ctx.font = '26px "EmojiFallback"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('👑', avatarX, avatarY - avatarRadius - 16);
      }

      await drawAvatar(ctx, item.entry.avatarUrl, avatarX, avatarY, avatarRadius, item.color);

      // Rank Circle Badge
      ctx.beginPath();
      ctx.arc(avatarX, avatarY + avatarRadius, 12, 0, Math.PI * 2);
      ctx.fillStyle = item.color;
      ctx.fill();

      ctx.font = 'bold 13px "Roboto"';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${item.rank}`, avatarX, avatarY + avatarRadius);

      // Name & Tag
      ctx.textBaseline = 'alphabetic';
      ctx.font = 'bold 18px "Roboto", "EmojiFallback"';
      ctx.fillStyle = colors.textWhite;

      let name = item.entry.displayName;
      if (ctx.measureText(name).width > item.w - 20) {
        name = `${name.slice(0, 10)}...`;
      }
      ctx.fillText(name, avatarX, item.y + (isFirst ? 65 : 55));

      ctx.font = '13px "Roboto"';
      ctx.fillStyle = colors.textGray;
      ctx.fillText(`@${item.entry.tag}`, avatarX, item.y + (isFirst ? 85 : 73));

      // Level & XP
      const level = getLevelFromXP(item.entry.xp);
      ctx.font = 'bold 14px "Roboto"';
      ctx.fillStyle = item.color;
      ctx.fillText(`LEVEL: ${level}`, avatarX, item.y + (isFirst ? 118 : 104));

      ctx.font = 'bold 13px "Roboto"';
      ctx.fillStyle = colors.textGray;
      ctx.fillText(`XP: ${formatXP(item.entry.xp)}`, avatarX, item.y + (isFirst ? 138 : 124));
    }

    // --- RANKS #4 AND #5 BELOW PODIUM ---
    const remaining = entries.slice(3);
    let startY = 325;

    for (const entry of remaining) {
      await drawRowCard(ctx, entry, 30, startY, 700, 85, colors);
      startY += 100;
    }
  } else {
    // --- STANDARD LIST VIEW (Page 2+ or Ascending Order) ---
    let startY = 30;
    for (const entry of entries) {
      await drawRowCard(ctx, entry, 30, startY, 700, 95, colors);
      startY += 110;
    }
  }

  return canvas.encode('png');
}

export async function buildLeaderboard({
  page,
  guild,
  weekly = false,
  sortOrder = 'desc',
}: {
  page: number;
  guild: Guild;
  weekly: boolean;
  sortOrder?: 'asc' | 'desc';
}): Promise<InteractionEditReplyOptions> {
  const userCount = weekly ? await getTotalWeeklyUsersWithXP(guild.id) : await getTotalUsersWithXP(guild.id);
  const totalPages = Math.max(1, Math.ceil(userCount / ITEMS_PER_PAGE));

  const pageData = weekly
    ? await getTopWeeklyUsersByXP(guild.id, ITEMS_PER_PAGE, (page - 1) * ITEMS_PER_PAGE, sortOrder)
    : await getTopUsersByXP(guild.id, ITEMS_PER_PAGE, (page - 1) * ITEMS_PER_PAGE, sortOrder);

  const entries: LeaderboardEntry[] = await Promise.all(
    pageData.map(async (entry, index) => {
      const position = (page - 1) * ITEMS_PER_PAGE + index + 1;
      try {
        const user = await guild.client.users.fetch(entry.userId);
        const member = await guild.members.fetch(entry.userId).catch(() => null);
        return {
          userId: entry.userId,
          xp: entry.xp,
          position,
          displayName: member?.displayName || user.displayName || user.username,
          tag: user.username,
          avatarUrl: user.displayAvatarURL({ extension: 'png', size: 128 }),
        };
      } catch {
        return {
          userId: entry.userId,
          xp: entry.xp,
          position,
          displayName: 'Unknown User',
          tag: entry.userId,
          avatarUrl: null,
        };
      }
    }),
  );

  const isTopPodiumView = page === 1 && sortOrder === 'desc';
  const imageBuffer = await renderLeaderboardCanvas(entries, isTopPodiumView);
  const attachment = new AttachmentBuilder(imageBuffer, { name: 'leaderboard.png' });

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

  return {
    allowedMentions: { users: [] },
    files: [attachment],
    components: [rowPageButtons, rowSortOrder],
  };
}
