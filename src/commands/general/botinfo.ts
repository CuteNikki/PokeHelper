import os from 'node:os';

import { version as discordJsVersion, SlashCommandBuilder, Team, time, TimestampStyles, userMention } from 'discord.js';

import { Command } from 'classes/base/command';

import { getDatabaseLatency } from 'database/index';

import { formatDuration } from 'utility/duration';
import { getTranslate } from 'utility/i18next';
import { createResponse } from 'utility/response';

const GB = 1024 ** 3;

export default new Command({
  data: new SlashCommandBuilder().setName('botinfo').setDescription('Displays current status, host metrics, and statistics.'),

  async execute(interaction) {
    const t = getTranslate(interaction.locale);
    const format = (value: number) => value.toLocaleString(t('locale'));

    const [dbLatency, app] = await Promise.all([getDatabaseLatency(), interaction.client.application.fetch()]);
    const wsPing = interaction.client.ws.ping;

    const developer = app.owner ? userMention(app.owner instanceof Team ? app.owner.ownerId! : app.owner.id) : t('botinfo.na');
    const totalUsers = interaction.client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0);

    const totalMem = os.totalmem();
    const usedMem = totalMem - os.freemem();
    const cores = os.cpus().length;
    const cpuName =
      os
        .cpus()[0]
        ?.model.replace(/\(R\)|\(TM\)/gi, '')
        .trim() || t('botinfo.na');

    // One compact block, as Components V2 has no columns like embed fields had, and sections stacked up a lot of space
    const content = [
      t('botinfo.title', { username: interaction.client.user.username }),
      t('botinfo.general.title'),
      t('botinfo.general.about', { developer, created: time(interaction.client.user.createdAt, TimestampStyles.RelativeTime) }),
      t('botinfo.general.reach', { servers: format(interaction.client.guilds.cache.size), users: format(totalUsers) }),
      t('botinfo.status.title'),
      t('botinfo.status.network', { ping: wsPing >= 0 ? format(wsPing) : '...', latency: format(dbLatency) }),
      t('botinfo.status.uptime', { process: formatDuration(process.uptime() * 1000, t), system: formatDuration(os.uptime() * 1000, t) }),
      t('botinfo.status.memory', {
        process: format(Math.round(process.memoryUsage().heapUsed / 1024 / 1024)),
        used: (usedMem / GB).toFixed(1),
        total: (totalMem / GB).toFixed(1),
        percent: Math.round((usedMem / totalMem) * 100),
      }),
      t('botinfo.host.title'),
      t('botinfo.host.cpu', { name: cpuName, cores, load: Math.min(Math.round(((os.loadavg()[0] ?? 0) / cores) * 100), 100) }),
      t('botinfo.host.runtime', {
        runtime: process.versions.bun ? `Bun v${process.versions.bun}` : `Node ${process.version}`,
        os: `${os.type()} ${os.arch()}`,
        node: process.version,
        discordJs: discordJsVersion,
      }),
    ].join('\n');

    // The developer is mentioned, but shouldn't be pinged whenever someone checks the bot's status
    await interaction.reply({ ...createResponse(content, 'info'), allowedMentions: { parse: [] } });
  },
});
