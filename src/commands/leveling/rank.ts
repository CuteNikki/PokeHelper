import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { ApplicationIntegrationType, AttachmentBuilder, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { t } from 'i18next';
import { join } from 'path';

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

GlobalFonts.registerFromPath(join(process.cwd(), 'fonts', 'NotoColorEmoji.ttf'), 'EmojiFallback');
GlobalFonts.registerFromPath(join(process.cwd(), 'fonts', 'Roboto.ttf'), 'Roboto');

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

    // --- DATA FETCHING ---
    const [allTimeData, weeklyData] = await Promise.all([
      getUserLevelingData(interaction.guildId, targetUser.id),
      getWeeklyUserLevelingData(interaction.guildId, targetUser.id),
    ]);

    const xpAllTime = allTimeData?.xp || 0;
    const xpWeekly = weeklyData?.xp || 0;

    const [rankAllTime, rankWeekly] = await Promise.all([getUserRank(interaction.guildId, xpAllTime), getWeeklyUserRank(interaction.guildId, xpWeekly)]);

    // Calculations Helper
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

    // --- CANVAS GENERATION ---
    // Increased height to 220px to give elements more vertical breathing room
    const canvas = createCanvas(900, 220);
    const ctx = canvas.getContext('2d');

    const colors = {
      bg: '#1e1e2e',
      moduleTrack: '#313244',
      accent: '#ff1b1b',
      textWhite: '#cdd6f4',
      textGray: '#a6adc8',
    };

    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const avatarSize = 140;
    const avatarX = 40;
    const avatarY = 40;

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    const avatar = await loadImage(targetUser.displayAvatarURL({ extension: 'png', size: 256 }));
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();

    const contentX = 210;

    let displayName = targetMember?.displayName || targetUser.username;
    ctx.font = `bold 36px "Roboto", "EmojiFallback"`;

    const maxNameWidth = 410;
    if (ctx.measureText(displayName).width > maxNameWidth) {
      while (ctx.measureText(`${displayName}...`).width > maxNameWidth && displayName.length > 0) {
        displayName = displayName.slice(0, -1);
      }
      displayName += '...';
    }

    ctx.fillStyle = colors.textWhite;
    ctx.textAlign = 'left';
    ctx.fillText(displayName, contentX, 75);

    const rightMargin = 860;
    const rankGap = 8;
    const labelGap = 16;

    ctx.font = 'bold 24px "Roboto"';
    const rankAllTimeWidth = ctx.measureText(`#${rankAllTime}`).width;

    ctx.font = 'bold 18px "Roboto"';
    const rankWeeklyWidth = ctx.measureText(`#${rankWeekly}`).width;

    const maxRankWidth = Math.max(rankAllTimeWidth, rankWeeklyWidth);

    const prefixRightEdge = rightMargin - maxRankWidth - rankGap;

    ctx.font = 'bold 18px "Roboto"';
    const maxPrefixWidth = ctx.measureText(t('leveling.rank.rank')).width;
    const allTimeLabelWidth = ctx.measureText(t('leveling.rank.all')).width;

    const prefixLeftEdge = prefixRightEdge - maxPrefixWidth;
    const labelCenterX = prefixLeftEdge - labelGap - allTimeLabelWidth / 2;

    const drawOverviewRow = (y: number, typeLabel: string, rankNumber: number, isSmaller: boolean) => {
      const baseSize = isSmaller ? 16 : 18;
      const rankSize = isSmaller ? 18 : 24;

      const rankStr = `#${rankNumber}`;
      const rankPrefix = t('leveling.rank.rank');

      ctx.textAlign = 'center';
      ctx.font = `bold ${baseSize}px "Roboto"`;
      ctx.fillStyle = colors.textWhite;
      ctx.fillText(typeLabel, labelCenterX, y);

      ctx.textAlign = 'right';
      ctx.font = `bold ${baseSize}px "Roboto"`;
      ctx.fillStyle = colors.textGray;
      ctx.fillText(rankPrefix, prefixRightEdge, y);

      ctx.font = `bold ${rankSize}px "Roboto"`;
      ctx.fillStyle = colors.accent;
      ctx.fillText(rankStr, rightMargin, y);
    };

    drawOverviewRow(55, t('leveling.rank.all'), rankAllTime, false);
    drawOverviewRow(85, t('leveling.rank.weekly'), rankWeekly, true);

    const barY = 115;
    const barW = canvas.width - contentX - 40;
    const barH = 16;

    ctx.fillStyle = colors.moduleTrack;
    ctx.beginPath();
    ctx.roundRect(contentX, barY, barW, barH, 8);
    ctx.fill();

    const progress = Math.max(0, Math.min(allTime.xpIntoLevel / allTime.xpRequired, 1));
    if (progress > 0) {
      ctx.fillStyle = colors.accent;
      ctx.beginPath();
      ctx.roundRect(contentX, barY, barW * progress, barH, 8);
      ctx.fill();
    }

    ctx.textAlign = 'left';
    const statsY = 175;

    const drawStatsColumn = (x: number, label: string, level: number, current: number, total: number) => {
      ctx.font = 'bold 18px "Roboto"';
      ctx.fillStyle = colors.textWhite;
      ctx.fillText(label, x, statsY);

      ctx.fillStyle = colors.textGray;
      const statsText = `${t('leveling.rank.level')}: ${level}  |  ${t('leveling.rank.exp')}: ${current.toLocaleString()} / ${total.toLocaleString()}`;
      ctx.fillText(statsText, x + 85, statsY);
    };

    drawStatsColumn(contentX, t('leveling.rank.all').toUpperCase(), allTime.level, allTime.xpIntoLevel, allTime.xpRequired);
    const column2X = contentX + barW / 2;
    drawStatsColumn(column2X, t('leveling.rank.weekly').toUpperCase(), weekly.level, weekly.xpIntoLevel, weekly.xpRequired);

    // --- FINALIZATION ---
    const attachment = new AttachmentBuilder(await canvas.encode('png'), { name: 'rank-card.png' });

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
