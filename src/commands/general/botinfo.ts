import os from 'node:os';

import {
  ContainerBuilder,
  version as discordJsVersion,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  Team,
  TextDisplayBuilder,
  time,
  TimestampStyles,
  userMention,
} from 'discord.js';

import { Command } from 'classes/base/command';

import { getDatabaseLatency } from 'database/index';

import { getTranslate } from 'utility/i18next';
import { ThemeColors } from 'utility/theme';

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
    const t = getTranslate(interaction.locale);
    const format = (value: number) => value.toLocaleString(t('locale'));

    const dbLatency = await getDatabaseLatency();
    const wsPing = interaction.client.ws.ping;
    const pingText = wsPing >= 0 ? `${wsPing} ms` : '...';

    // Application & Guild statistics
    const totalGuilds = interaction.client.guilds.cache.size;
    const totalUsers = interaction.client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0);

    // Bot Application Info
    const app = await interaction.client.application.fetch();
    const developer = app.owner ? (app.owner instanceof Team ? userMention(app.owner.ownerId!) : userMention(app.owner.id)) : t('botinfo.na');
    const createdTimestamp = Math.floor((interaction.client.user.createdTimestamp || 0) / 1000);

    // Memory stats
    const processMem = process.memoryUsage();
    const processMb = (processMem.heapUsed / 1024 / 1024).toFixed(1);
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    const usedMemBytes = totalMemBytes - freeMemBytes;

    // The system reports the usable memory, which is a bit less than what's installed as some is reserved by the hardware,
    // like 31.1 for 32 GB. Rounding up gives the installed amount
    const totalGb = Math.ceil(totalMemBytes / 1024 / 1024 / 1024);
    const usedGb = (usedMemBytes / 1024 / 1024 / 1024).toFixed(1);
    const ramPercent = Math.round((usedMemBytes / totalMemBytes) * 100);

    // Host stats
    const cpuName =
      os
        .cpus()[0]
        ?.model.replace(/\(R\)|\(TM\)/gi, '')
        .trim() || t('botinfo.na');
    const cores = os.cpus().length;
    const loadAvgRaw = os.loadavg()[0] || 0;
    const loadAvg = loadAvgRaw.toFixed(2);
    const cpuPercent = Math.min(Math.round((loadAvgRaw / cores) * 100), 100);
    const runtimeVersion = process.versions.bun ? `Bun v${process.versions.bun}` : `Node ${process.version}`;

    const sections = [
      [
        `**${t('botinfo.general.title')}**`,
        t('botinfo.general.developer', { developer }),
        t('botinfo.general.created', { created: time(createdTimestamp, TimestampStyles.RelativeTime) }),
        t('botinfo.general.servers', { servers: format(totalGuilds) }),
        t('botinfo.general.users', { users: format(totalUsers) }),
      ],
      [`**${t('botinfo.network.title')}**`, t('botinfo.network.gateway', { ping: pingText }), t('botinfo.network.database', { latency: dbLatency })],
      [
        `**${t('botinfo.uptime.title')}**`,
        t('botinfo.uptime.process', { time: formatDuration(process.uptime()) }),
        t('botinfo.uptime.system', { time: formatDuration(os.uptime()) }),
      ],
      [
        `**${t('botinfo.memory.title')}**`,
        t('botinfo.memory.process', { mb: processMb }),
        t('botinfo.memory.system', { used: usedGb, total: totalGb, percent: ramPercent }),
      ],
      [
        `**${t('botinfo.host.title')}**`,
        t('botinfo.host.cpu', { name: cpuName, cores }),
        t('botinfo.host.cpuLoad', { percent: cpuPercent, loadAvg }),
        t('botinfo.host.runtime', { runtime: runtimeVersion, osType: os.type(), arch: os.arch() }),
        t('botinfo.host.nodeApi', { version: process.version }),
        t('botinfo.host.discordJs', { version: discordJsVersion }),
      ],
    ];

    const container = new ContainerBuilder()
      .setAccentColor(ThemeColors.info)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${t('botinfo.author', { username: interaction.client.user.username })}`));
    for (const lines of sections) {
      container
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
    }

    // The developer is mentioned, but shouldn't be pinged whenever someone checks the bot's status
    await interaction.reply({ components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
  },
});
