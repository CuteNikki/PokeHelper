import { createCanvas, loadImage } from '@napi-rs/canvas';
import { ApplicationIntegrationType, AttachmentBuilder, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { t } from 'i18next';

import { Command } from 'classes/base/command';

import { getGuildLevelingConfiguration, getLevelFromXP, getUserLevelingData, getXPForLevel } from 'database/leveling';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setName('rank')
    .setDescription('Check your current level and XP in the server.'),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig || !levelingConfig.enabled) {
      return interaction.editReply({ content: t('leveling.disabled') });
    }

    const userLevelingData = await getUserLevelingData(interaction.guildId, interaction.user.id);
    const xp = userLevelingData?.xp || 0;
    const level = getLevelFromXP(xp);
    const xpForNextLevel = getXPForLevel(level + 1);
    const xpForCurrentLevel = getXPForLevel(level);
    const xpIntoCurrentLevel = xp - xpForCurrentLevel;
    const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel;

    const canvas = createCanvas(700, 200);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1e1e2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.fillStyle = '#313244';
    ctx.roundRect(180, 130, 480, 20, 10);
    ctx.fill();

    const progress = Math.max(0, Math.min(xpIntoCurrentLevel / xpNeededForNextLevel, 1));
    const progressWidth = 480 * progress;

    if (progressWidth > 0) {
      ctx.beginPath();
      ctx.fillStyle = '#cba6f7';
      const safeWidth = Math.max(progressWidth, 20);
      ctx.roundRect(180, 130, safeWidth, 20, 10);
      ctx.fill();
    }

    ctx.fillStyle = '#cdd6f4';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(interaction.user.displayName, 180, 80);

    ctx.fillStyle = '#a6adc8';
    ctx.font = '24px sans-serif';
    ctx.fillText(`Level ${level}`, 180, 110);

    ctx.font = '18px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${xpIntoCurrentLevel} / ${xpNeededForNextLevel} XP`, 660, 110);

    ctx.beginPath();
    ctx.arc(90, 100, 60, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();

    const avatarURL = interaction.user.displayAvatarURL({ extension: 'png', size: 256 });
    const avatar = await loadImage(avatarURL);
    ctx.drawImage(avatar, 30, 40, 120, 120);

    const attachment = new AttachmentBuilder(await canvas.encode('png'), { name: 'rank-card.png' });

    return interaction.editReply({
      content: t('leveling.rank.state', {
        level,
        xp,
        remaining: xpIntoCurrentLevel,
        total: xpNeededForNextLevel,
      }),
      files: [attachment],
    });
  },
});
