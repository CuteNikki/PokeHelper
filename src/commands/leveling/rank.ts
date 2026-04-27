import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
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
    // Minimalist canvas size, perfectly hugging the two modules
    const canvas = createCanvas(800, 220);
    const ctx = canvas.getContext('2d');

    const colors = {
      bg: '#1e1e2e',
      moduleBg: '#313244',
      moduleTrack: '#181825',
      accent: '#ff1b1b',
      textWhite: '#cdd6f4',
      textGray: '#a6adc8',
    };

    // 1. Background
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // --- STAT BLOCK RENDERER ---
    const drawStatBlock = (x: number, title: string, level: number, rank: number, currentXP: number, totalXP: number) => {
      const blockWidth = 370;
      const blockHeight = 170;
      const y = 25; // Centered vertically

      // Module Background
      ctx.fillStyle = colors.moduleBg;
      ctx.beginPath();
      ctx.roundRect(x, y, blockWidth, blockHeight, 15);
      ctx.fill();

      const centerX = x + blockWidth / 2;

      // Title
      ctx.textAlign = 'center';
      ctx.font = 'bold 16px "Roboto"';
      ctx.fillStyle = colors.textGray;
      ctx.fillText(title.toUpperCase(), centerX, y + 25);

      // Level Area
      ctx.font = 'bold 14px "Roboto"';
      ctx.fillText(t('leveling.rank.level'), centerX - 60, y + 60);
      ctx.font = 'bold 40px "Roboto"';
      ctx.fillStyle = colors.accent;
      ctx.fillText(level.toString(), centerX - 60, y + 95);

      // Rank Area
      ctx.fillStyle = colors.textGray;
      ctx.font = 'bold 14px "Roboto"';
      ctx.fillText(t('leveling.rank.rank'), centerX + 60, y + 60);
      ctx.font = 'bold 40px "Roboto"';
      ctx.fillStyle = colors.accent;
      ctx.fillText(`#${rank}`, centerX + 60, y + 95);

      // XP Text
      ctx.font = 'bold 16px "Roboto"';
      ctx.fillStyle = colors.textWhite;
      ctx.fillText(`${currentXP.toLocaleString()} / ${totalXP.toLocaleString()} ${t('leveling.rank.exp')}`, centerX, y + 130);

      // Progress Bar
      const barW = 310;
      const barH = 10;
      const barX = centerX - barW / 2;
      const barY = y + 140;

      ctx.fillStyle = colors.moduleTrack;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, 5);
      ctx.fill();

      const progress = Math.max(0, Math.min(currentXP / totalXP, 1));
      if (progress > 0) {
        ctx.fillStyle = colors.accent;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW * progress, barH, 5);
        ctx.fill();
      }
    };

    // Draw Section 1: All Time (Left side)
    drawStatBlock(20, t('leveling.rank.all'), allTime.level, rankAllTime, allTime.xpIntoLevel, allTime.xpRequired);

    // Draw Section 2: Weekly (Right side)
    drawStatBlock(410, t('leveling.rank.weekly'), weekly.level, rankWeekly, weekly.xpIntoLevel, weekly.xpRequired);

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
      allowedMentions: { users: [] }, // Disable pings if user is mentioned
    });
  },
});
