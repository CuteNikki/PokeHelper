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
    .setDescription('Check current level and XP in the server.')
    .addUserOption((option) => option.setName('user').setDescription('The user to check the rank of. Defaults to yourself.').setRequired(false))
    .addBooleanOption((option) => option.setName('ephemeral').setDescription('Whether the response should be ephemeral. Defaults to true.').setRequired(false))
    .addBooleanOption((option) =>
      option.setName('weekly').setDescription('Whether to view the weekly leaderboard rank. Defaults to false.').setRequired(false),
    ),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      return;
    }

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const targetMember = interaction.guild.members.cache.get(targetUser.id);
    const ephemeral = interaction.options.getBoolean('ephemeral') ?? true;
    const weekly = interaction.options.getBoolean('weekly') ?? false;

    await interaction.deferReply({ flags: ephemeral ? [MessageFlags.Ephemeral] : undefined });

    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig || !levelingConfig.enabled) {
      return interaction.editReply({ content: t('leveling.disabled') });
    }

    const userLevelingData = weekly
      ? await getWeeklyUserLevelingData(interaction.guildId, targetUser.id)
      : await getUserLevelingData(interaction.guildId, targetUser.id);
    const xp = userLevelingData?.xp || 0;
    const level = getLevelFromXP(xp);
    const xpForNextLevel = getXPForLevel(level + 1);
    const xpForCurrentLevel = getXPForLevel(level);
    const xpIntoCurrentLevel = xp - xpForCurrentLevel;
    const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel;

    const rank = weekly ? await getWeeklyUserRank(interaction.guildId, xp) : await getUserRank(interaction.guildId, xp);

    // --- CANVAS GENERATION ---
    const canvas = createCanvas(700, 200);
    const ctx = canvas.getContext('2d');

    // 1. Draw Background
    ctx.fillStyle = '#1e1e2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Draw Progress Bar Background
    ctx.beginPath();
    ctx.fillStyle = '#313244';
    ctx.roundRect(180, 130, 480, 20, 10);
    ctx.fill();

    // 3. Draw Progress Bar Fill
    const progress = Math.max(0, Math.min(xpIntoCurrentLevel / xpNeededForNextLevel, 1));
    const progressWidth = 480 * progress;

    if (progressWidth > 0) {
      ctx.beginPath();
      ctx.fillStyle = '#f34b4b';
      const safeWidth = Math.max(progressWidth, 20);
      ctx.roundRect(180, 130, safeWidth, 20, 10);
      ctx.fill();
    }

    // 4. Draw Username
    ctx.fillStyle = '#cdd6f4';
    let fontSize = 36;
    let username = targetMember?.displayName || targetUser.username;
    const maxNameWidth = 350;

    ctx.font = `bold ${fontSize}px "Roboto", "EmojiFallback"`;

    while (ctx.measureText(username).width > maxNameWidth && fontSize > 16) {
      fontSize -= 1;
      ctx.font = `bold ${fontSize}px "Roboto", "EmojiFallback"`;
    }

    if (ctx.measureText(username).width > maxNameWidth) {
      while (ctx.measureText(`${username}...`).width > maxNameWidth && username.length > 0) {
        username = username.slice(0, -1);
      }
      username += '...';
    }

    ctx.fillText(username, 180, 80);

    // 5. Draw Level Text
    ctx.fillStyle = '#a6adc8';
    ctx.font = '18px "Roboto", "EmojiFallback"';
    ctx.fillText(`Level ${level}`, 180, 115);

    // 6. Draw the Rank
    ctx.fillStyle = '#f34b4b';
    ctx.font = 'bold 36px "Roboto", "EmojiFallback"';
    ctx.textAlign = 'right';
    ctx.fillText(`#${rank}`, 660, 80);

    // 7. Draw XP Text
    ctx.fillStyle = '#a6adc8';
    ctx.font = '18px "Roboto", "EmojiFallback"';
    ctx.fillText(`${xpIntoCurrentLevel} / ${xpNeededForNextLevel} XP`, 660, 115);

    // 8. Draw User Avatar
    ctx.beginPath();
    ctx.arc(90, 100, 60, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();

    const avatarURL = targetUser.displayAvatarURL({ extension: 'png', size: 256 });
    const avatar = await loadImage(avatarURL);
    ctx.drawImage(avatar, 30, 40, 120, 120);
    // --- END CANVAS GENERATION ---

    const attachment = new AttachmentBuilder(await canvas.encode('png'), { name: 'rank-card.png' });

    return interaction.editReply({
      content: t('leveling.rank.state', {
        level,
        xp,
        remaining: xpIntoCurrentLevel,
        total: xpNeededForNextLevel,
        rank,
      }),
      files: [attachment],
    });
  },
});
