import { createCanvas, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { ApplicationIntegrationType, AttachmentBuilder, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { t } from 'i18next';

import { Command } from 'classes/base/command';

import {
  getGuildLevelingConfiguration,
  getLevelFromXP,
  getUserLevelingData,
  getUserRank,
  getWeeklyUserLevelingData,
  getWeeklyUserRank,
  getXPForLevel,
} from 'database/leveling';

interface RankColors {
  cardBg: string;
  trackBg: string;
  accent: string;
  textWhite: string;
  textGray: string;
}

function truncateText(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (ctx.measureText(`${truncated}...`).width > maxWidth && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}...`;
}

function drawAvatar(ctx: SKRSContext2D, avatarImage: Image | null, x: number, y: number, radius: number, borderColor?: string) {
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

  if (avatarImage) {
    ctx.drawImage(avatarImage, x - radius, y - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = '#45475a';
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  ctx.restore();
}

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setName('rank')
    .setDescription('Check current all-time and weekly level and XP in the server.')
    .addUserOption((option) => option.setName('user').setDescription('The user to check the rank of. Defaults to yourself.').setRequired(false))
    .addBooleanOption((option) => option.setName('ephemeral').setDescription('Whether the response should be ephemeral. Defaults to true.').setRequired(false)),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      return;
    }

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const targetMember = interaction.guild.members.cache.get(targetUser.id);
    const ephemeral = interaction.options.getBoolean('ephemeral') ?? true;

    await interaction.deferReply({ flags: ephemeral ? [MessageFlags.Ephemeral] : undefined });

    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig || !levelingConfig.enabled) {
      return interaction.editReply({ content: t('leveling.disabled') });
    }

    // Data Fetching
    const [allTimeData, weeklyData] = await Promise.all([
      getUserLevelingData(interaction.guildId, targetUser.id),
      getWeeklyUserLevelingData(interaction.guildId, targetUser.id),
    ]);

    const xpAllTime = allTimeData?.xp || 0;
    const xpWeekly = weeklyData?.xp || 0;

    const [rankAllTime, rankWeekly, avatarImage] = await Promise.all([
      getUserRank(interaction.guildId, xpAllTime),
      getWeeklyUserRank(interaction.guildId, xpWeekly),
      loadImage(targetUser.displayAvatarURL({ extension: 'png', size: 256 })).catch(() => null),
    ]);

    // Stats Calculation Helper
    const getStats = (xp: number) => {
      const level = getLevelFromXP(xp);
      const currentLevelXP = getXPForLevel(level);
      const nextLevelXP = getXPForLevel(level + 1);
      return {
        level,
        xpIntoLevel: xp - currentLevelXP,
        xpRequired: nextLevelXP - currentLevelXP,
      };
    };

    const allTime = getStats(xpAllTime);
    const weekly = getStats(xpWeekly);

    // Canvas Generation
    const width = 880;
    const height = 190;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const colors: RankColors = {
      cardBg: 'rgba(42, 43, 60, 0.85)',
      trackBg: '#1e1e2e',
      accent: '#ff0000',
      textWhite: '#ffffff',
      textGray: '#a6adc8',
    };

    // Base Card Container
    ctx.fillStyle = colors.cardBg;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 16);
    ctx.fill();

    // Avatar
    const avatarRadius = 60;
    const avatarX = 35 + avatarRadius; // 95
    const avatarY = height / 2; // 95
    drawAvatar(ctx, avatarImage, avatarX, avatarY, avatarRadius);

    // Content Boundaries
    const contentX = avatarX + avatarRadius + 28; // 183
    const rightX = width - 35; // 845

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Display Name & Username
    const displayNameStr = targetMember?.displayName || targetUser.displayName || targetUser.username;

    ctx.font = 'bold 20px "Roboto", "EmojiFallback"';
    ctx.fillStyle = colors.textWhite;
    const displayName = truncateText(ctx, displayNameStr, 380);
    ctx.fillText(displayName, contentX, 55);

    ctx.font = '14px "Roboto"';
    ctx.fillStyle = colors.textGray;
    const username = truncateText(ctx, `@${targetUser.username}`, 380);
    ctx.fillText(username, contentX, 77);

    // Rank Columns
    const allTimeColX = rightX;
    const weeklyColX = rightX - 110;

    ctx.textAlign = 'right';

    // All-Time Rank Column
    ctx.font = 'bold 11px "Roboto"';
    ctx.fillStyle = colors.textGray;
    ctx.fillText(t('leveling.rank.all').toUpperCase(), allTimeColX, 44);

    ctx.font = 'bold 28px "Roboto"';
    ctx.fillStyle = colors.textWhite;
    ctx.fillText(`#${rankAllTime}`, allTimeColX, 76);

    // Weekly Rank Column
    ctx.font = 'bold 11px "Roboto"';
    ctx.fillStyle = colors.textGray;
    ctx.fillText(t('leveling.rank.weekly').toUpperCase(), weeklyColX, 44);

    ctx.font = 'bold 22px "Roboto"';
    ctx.fillStyle = colors.textGray;
    ctx.fillText(`#${rankWeekly}`, weeklyColX, 76);

    // Progress Bar
    const barX = contentX;
    const barY = 104;
    const barW = rightX - barX;
    const barH = 16;

    ctx.fillStyle = colors.trackBg;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 8);
    ctx.fill();

    const progress = Math.max(0, Math.min(allTime.xpIntoLevel / allTime.xpRequired, 1));
    if (progress > 0) {
      ctx.fillStyle = colors.accent;
      ctx.beginPath();
      ctx.roundRect(barX, barY, Math.max(barH, barW * progress), barH, 8);
      ctx.fill();
    }

    // Stats Row
    const statsY = 152;
    const levelLabel = t('leveling.rank.level').toUpperCase();
    const xpLabel = t('leveling.rank.exp').toUpperCase();

    ctx.font = '14px "Roboto"';
    ctx.fillStyle = colors.textGray;

    // All-Time Stats
    ctx.textAlign = 'left';
    const allTimeLabel = t('leveling.rank.all').toUpperCase();
    const allTimeStatsText = `${allTimeLabel}: ${levelLabel} ${allTime.level}  |  ${allTime.xpIntoLevel.toLocaleString()}/${allTime.xpRequired.toLocaleString()} ${xpLabel}`;
    ctx.fillText(allTimeStatsText, barX, statsY);

    // Weekly Stats
    ctx.textAlign = 'right';
    const weeklyLabel = t('leveling.rank.weekly').toUpperCase();
    const weeklyStatsText = `${weeklyLabel}: ${levelLabel} ${weekly.level}  |  ${weekly.xpIntoLevel.toLocaleString()}/${weekly.xpRequired.toLocaleString()} ${xpLabel}`;
    ctx.fillText(weeklyStatsText, rightX, statsY);

    // Finalization
    const imageBuffer = canvas.toBuffer('image/png');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'rank-card.png' });

    return interaction.editReply({
      content: t('leveling.rank.state', {
        user: targetUser.toString(),
        Level: allTime.level,
        rank: rankAllTime,
        xp: xpAllTime.toLocaleString(),
        xpIntoLevel: allTime.xpIntoLevel.toLocaleString(),
        total: allTime.xpRequired.toLocaleString(),
        weeklyLevel: weekly.level,
        weeklyRank: rankWeekly,
        weeklyXP: xpWeekly.toLocaleString(),
        xpIntoWeeklyLevel: weekly.xpIntoLevel.toLocaleString(),
        weeklyTotal: weekly.xpRequired.toLocaleString(),
      }),
      files: [attachment],
      allowedMentions: { users: [] },
    });
  },
});
