import { EmbedBuilder, SlashCommandBuilder, Team, TimestampStyles, version as discordJsVersion, time, userMention } from 'discord.js';
import os from 'node:os';

import { Command } from 'classes/base/command';

import { getDatabaseLatency } from 'database/index';

const formatDuration = (seconds: number) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);

  return parts.join(' ');
};

export default new Command({
  data: new SlashCommandBuilder().setName('botinfo').setDescription('Displays current status, host metrics, and statistics.'),

  async execute(interaction) {
    const dbLatency = await getDatabaseLatency();
    const wsPing = interaction.client.ws.ping;
    const pingText = wsPing >= 0 ? `${wsPing} ms` : '...';

    // Application & Guild statistics
    const totalGuilds = interaction.client.guilds.cache.size;
    const totalUsers = interaction.client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0);

    // Bot Application Info
    const app = await interaction.client.application.fetch();
    const owner = app.owner ? (app.owner instanceof Team ? userMention(app.owner.ownerId!) : userMention(app.owner.id)) : 'N/A';
    const createdTimestamp = Math.floor((interaction.client.user.createdTimestamp || 0) / 1000);

    // Memory stats
    const processMem = process.memoryUsage();
    const processMb = (processMem.heapUsed / 1024 / 1024).toFixed(1);
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    const usedMemBytes = totalMemBytes - freeMemBytes;

    const totalGb = (totalMemBytes / 1024 / 1024 / 1024).toFixed(1);
    const usedGb = (usedMemBytes / 1024 / 1024 / 1024).toFixed(1);
    const ramPercent = Math.round((usedMemBytes / totalMemBytes) * 100);

    // Host stats
    const cpuName =
      os
        .cpus()[0]
        ?.model.replace(/\(R\)|\(TM\)/gi, '')
        .trim() || 'Processor';
    const cores = os.cpus().length;
    const loadAvgRaw = os.loadavg()[0] || 0;
    const loadAvg = loadAvgRaw.toFixed(2);
    const cpuPercent = Math.min(Math.round((loadAvgRaw / cores) * 100), 100);
    const runtimeVersion = process.versions.bun ? `Bun v${process.versions.bun}` : `Node ${process.version}`;

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setAuthor({
        name: `${interaction.client.user.username} Status`,
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .addFields(
        {
          name: '⚙️ General',
          value: `> **Owner:** ${owner}\n> **Created:** ${time(createdTimestamp, TimestampStyles.RelativeTime)}\n> **Servers:** ${totalGuilds.toLocaleString()}\n> **Users:** ${totalUsers.toLocaleString()}`,
          inline: false,
        },
        {
          name: '⚡ Network',
          value: `> **Gateway:** ${pingText}\n> **Database:** ${dbLatency} ms`,
          inline: true,
        },
        {
          name: '⏱️ Uptime',
          value: `> **Process:** ${formatDuration(process.uptime())}\n> **System:** ${formatDuration(os.uptime())}`,
          inline: true,
        },
        {
          name: '💾 Memory',
          value: `> **Process:** ${processMb} MB\n> **System:** ${usedGb}/${totalGb}GB (${ramPercent}%)`,
          inline: true,
        },
        {
          name: '🖥️ Host Environment',
          value: `> **CPU:** ${cpuName} (${cores} cores)\n> **CPU Load:** ${cpuPercent}% (${loadAvg} load avg)\n> **Runtime:** ${runtimeVersion} on ${os.type()} (${os.arch()})\n> **Node API:** ${process.version}\n> **Discord.JS:** v${discordJsVersion}`,
          inline: false,
        },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
});
