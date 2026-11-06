import {
  ApplicationIntegrationType,
  channelMention,
  ChatInputCommandInteraction,
  InteractionContextType,
  messageLink,
  SlashCommandBuilder,
  time,
  TimestampStyles,
  userMention,
} from 'discord.js';
import { getTranslate, type Translate } from 'utility/i18next';

import { Command } from 'classes/base/command';

import { getCounting } from 'database/counting';
import { getCountingUser, getCurrentRun, getEntriesForNumbers, getRunCount, getRunNumber } from 'database/countingStats';

import type { CountingRun, GuildCounting } from 'generated/prisma/client';
import { buildCountingLeaderboard, buildCountingRuns } from 'utility/counting/pages';
import { formatLives, getMilestones } from 'utility/counting/rules';
import { DAY, formatDuration, formatNumber, HOUR } from 'utility/duration';
import { createResponse, sendError, sendResponse } from 'utility/response';

/** How many milestones the info shows, the most recent ones. */
const SHOWN_MILESTONES = 5;

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setName('counting')
    .setDescription('See how the counting game is going')
    .addSubcommand((cmd) => cmd.setName('info').setDescription('The current run, its milestones and the records'))
    .addSubcommand((cmd) => cmd.setName('leaderboard').setDescription('The members who counted the most'))
    .addSubcommand((cmd) =>
      cmd
        .setName('user')
        .setDescription("A member's counting stats")
        .addUserOption((option) => option.setName('user').setDescription('The member to show. Defaults to yourself').setRequired(false)),
    )
    .addSubcommand((cmd) => cmd.setName('runs').setDescription('The most recent runs and how they ended')),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    // Replies to the person who used the command, so in their language, even though everyone can see them
    const t = getTranslate(interaction.locale);

    const counting = await getCounting(interaction.guildId);
    if (!counting) return sendError(interaction, t('counting.none'));

    switch (interaction.options.getSubcommand()) {
      case 'info':
        return reply(interaction, await buildInfo(counting, t));
      case 'leaderboard':
        return sendResponse(interaction, await buildCountingLeaderboard(counting.guildId, 0, t));
      case 'user':
        return reply(interaction, await buildUser(counting.guildId, interaction.options.getUser('user')?.id ?? interaction.user.id, t));
      case 'runs':
        return sendResponse(interaction, await buildCountingRuns(counting.guildId, 0, t));
    }
  },
});

/** Reply publicly, without pinging anyone that's mentioned. */
const reply = (interaction: ChatInputCommandInteraction<'cached'>, lines: string[]) =>
  sendResponse(interaction, { ...createResponse(lines.join('\n'), 'info'), allowedMentions: { parse: [] } });

const accuracy = (counted: number, mistakes: number) => Math.round((counted / Math.max(1, counted + mistakes)) * 100);

async function buildInfo(counting: GuildCounting, t: Translate): Promise<string[]> {
  const [run, runCount] = await Promise.all([getCurrentRun(counting.guildId), getRunCount(counting.guildId)]);

  const lines = [
    t('counting.info.title'),
    t('counting.info.overview', { channel: channelMention(counting.channelId), next: formatNumber(counting.lastNumber + 1, t) }),
    '',
  ];

  if (!run || counting.lastNumber === 0) {
    lines.push(t('counting.info.notStarted', { channel: channelMention(counting.channelId) }));
  } else {
    lines.push(t('counting.info.currentRun', { run: await getRunNumber(counting.guildId, run.id) }), ...(await describeCurrentRun(counting, run, t)));
  }

  if (counting.highestNumber > 0 && counting.highestNumberByUserId && counting.highestNumberAt) {
    const highest = {
      number: formatNumber(counting.highestNumber, t),
      user: userMention(counting.highestNumberByUserId),
      time: time(counting.highestNumberAt, TimestampStyles.ShortDate),
    };
    lines.push(
      '',
      t('counting.info.records'),
      // Without a link once the game moved to another channel, as the message is in the old one
      counting.highestNumberMessageId
        ? t('counting.info.highest', { ...highest, link: messageLink(counting.channelId, counting.highestNumberMessageId, counting.guildId) })
        : t('counting.info.highestNoLink', highest),
      t('counting.info.runs', { count: runCount }),
    );
  }

  return lines;
}

/** When the run started, how fast it's going, its milestones and who counted last. */
async function describeCurrentRun(counting: GuildCounting, run: CountingRun, t: Translate): Promise<string[]> {
  const lines: string[] = [];
  const progress = [t('counting.info.progress', { number: formatNumber(counting.lastNumber, t) })];

  if (run.startedAt) {
    lines.push(
      t('counting.info.started', { time: time(run.startedAt, TimestampStyles.LongDateTime), relative: time(run.startedAt, TimestampStyles.RelativeTime) }),
    );

    const elapsed = Date.now() - run.startedAt.getTime();
    if (elapsed >= DAY) progress.push(t('counting.info.pacePerDay', { pace: formatNumber(Math.round(counting.lastNumber / (elapsed / DAY)), t) }));
    else if (elapsed >= HOUR) progress.push(t('counting.info.pacePerHour', { pace: formatNumber(Math.round(counting.lastNumber / (elapsed / HOUR)), t) }));
  } else {
    lines.push(t('counting.info.startedUnknown'));
  }
  lines.push(progress.join(' · '));
  // With a single life there's nothing to show, the next mistake simply resets
  if (counting.maxLives !== null && counting.maxLives > 1) lines.push(t('counting.info.lives', { lives: formatLives(counting.livesLeft, counting.maxLives) }));

  // Only milestones counted since tracking started have an entry
  const entries = await getEntriesForNumbers(run.id, getMilestones(counting.lastNumber).slice(-SHOWN_MILESTONES));
  if (entries.length > 0) {
    const milestones = entries.map((entry) =>
      run.startedAt
        ? t('counting.info.milestoneAfter', {
            number: formatNumber(entry.number, t),
            duration: formatDuration(entry.countedAt.getTime() - run.startedAt.getTime(), t),
          })
        : t('counting.info.milestoneOn', { number: formatNumber(entry.number, t), time: time(entry.countedAt, TimestampStyles.ShortDate) }),
    );
    lines.push(t('counting.info.milestones', { milestones: milestones.join(' · ') }));
  }

  if (counting.lastNumberByUserId && counting.lastNumberAt && counting.lastNumberMessageId) {
    lines.push(
      t('counting.info.lastCounted', {
        user: userMention(counting.lastNumberByUserId),
        relative: time(counting.lastNumberAt, TimestampStyles.RelativeTime),
        link: messageLink(counting.channelId, counting.lastNumberMessageId, counting.guildId),
      }),
    );
  }

  return lines;
}

async function buildUser(guildId: string, userId: string, t: Translate): Promise<string[]> {
  const stats = await getCountingUser(guildId, userId);
  if (!stats || (stats.counted === 0 && stats.mistakes === 0)) return [t('counting.user.none', { user: userMention(userId) })];

  return [
    t('counting.user.title', { user: userMention(userId) }),
    ...(stats.counted > 0 ? [t('counting.user.rank', { rank: stats.rank })] : []),
    t('counting.user.counted', { counted: formatNumber(stats.counted, t) }),
    t('counting.user.mistakes', { mistakes: formatNumber(stats.mistakes, t) }),
    t('counting.user.accuracy', { accuracy: accuracy(stats.counted, stats.mistakes) }),
    ...(stats.lastCountedAt ? [t('counting.user.lastCounted', { relative: time(stats.lastCountedAt, TimestampStyles.RelativeTime) })] : []),
  ];
}
