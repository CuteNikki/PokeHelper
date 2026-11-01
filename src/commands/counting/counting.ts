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
import { t } from 'i18next';

import { Command } from 'classes/base/command';

import { getCounting } from 'database/counting';
import { getCountingUser, getCurrentRun, getEntriesForNumbers, getRecentRuns, getRunCount, getRunNumber, getTopCounters } from 'database/countingStats';

import type { CountingRun, GuildCounting } from 'generated/prisma/client';
import { getMilestones } from 'utility/counting';
import { formatDuration, formatNumber } from 'utility/duration';
import { createResponse, sendError, sendResponse } from 'utility/response';

/** How many milestones the info shows, the most recent ones. */
const SHOWN_MILESTONES = 5;
/** How many members the leaderboard shows. */
const LEADERBOARD_SIZE = 10;
/** How many runs the runs subcommand shows. */
const SHOWN_RUNS = 10;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

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

    const counting = await getCounting(interaction.guildId);
    if (!counting) return sendError(interaction, t('counting.none'));

    switch (interaction.options.getSubcommand()) {
      case 'info':
        return reply(interaction, await buildInfo(counting));
      case 'leaderboard':
        return reply(interaction, await buildLeaderboard(counting.guildId));
      case 'user':
        return reply(interaction, await buildUser(counting.guildId, interaction.options.getUser('user')?.id ?? interaction.user.id));
      case 'runs':
        return reply(interaction, await buildRuns(counting));
    }
  },
});

/** Reply publicly, without pinging anyone that's mentioned. */
const reply = (interaction: ChatInputCommandInteraction<'cached'>, lines: string[]) =>
  sendResponse(interaction, { ...createResponse(lines.join('\n'), 'info'), allowedMentions: { parse: [] } });

const accuracy = (counted: number, mistakes: number) => Math.round((counted / Math.max(1, counted + mistakes)) * 100);

async function buildInfo(counting: GuildCounting): Promise<string[]> {
  const [run, runCount] = await Promise.all([getCurrentRun(counting.guildId), getRunCount(counting.guildId)]);

  const lines = [
    t('counting.info.title'),
    t('counting.info.overview', { channel: channelMention(counting.channelId), next: formatNumber(counting.lastNumber + 1) }),
    '',
  ];

  if (!run || counting.lastNumber === 0) {
    lines.push(t('counting.info.notStarted', { channel: channelMention(counting.channelId) }));
  } else {
    lines.push(t('counting.info.currentRun', { run: await getRunNumber(counting.guildId, run.id) }), ...(await describeCurrentRun(counting, run)));
  }

  if (counting.highestNumber > 0 && counting.highestNumberByUserId && counting.highestNumberAt && counting.highestNumberMessageId) {
    lines.push(
      '',
      t('counting.info.records'),
      t('counting.info.highest', {
        number: formatNumber(counting.highestNumber),
        user: userMention(counting.highestNumberByUserId),
        time: time(counting.highestNumberAt, TimestampStyles.ShortDate),
        link: messageLink(counting.channelId, counting.highestNumberMessageId, counting.guildId),
      }),
      t('counting.info.runs', { count: runCount }),
    );
  }

  return lines;
}

/** When the run started, how fast it's going, its milestones and who counted last. */
async function describeCurrentRun(counting: GuildCounting, run: CountingRun): Promise<string[]> {
  const lines: string[] = [];
  const progress = [t('counting.info.progress', { number: formatNumber(counting.lastNumber) })];

  if (run.startedAt) {
    lines.push(
      t('counting.info.started', { time: time(run.startedAt, TimestampStyles.LongDateTime), relative: time(run.startedAt, TimestampStyles.RelativeTime) }),
    );

    const elapsed = Date.now() - run.startedAt.getTime();
    if (elapsed >= DAY) progress.push(t('counting.info.pacePerDay', { pace: formatNumber(Math.round(counting.lastNumber / (elapsed / DAY))) }));
    else if (elapsed >= HOUR) progress.push(t('counting.info.pacePerHour', { pace: formatNumber(Math.round(counting.lastNumber / (elapsed / HOUR))) }));
  } else {
    lines.push(t('counting.info.startedUnknown'));
  }
  lines.push(progress.join(' · '));

  // Only milestones counted since tracking started have an entry
  const entries = await getEntriesForNumbers(run.id, getMilestones(counting.lastNumber).slice(-SHOWN_MILESTONES));
  if (entries.length > 0) {
    const milestones = entries.map((entry) =>
      run.startedAt
        ? t('counting.info.milestoneAfter', {
            number: formatNumber(entry.number),
            duration: formatDuration(entry.countedAt.getTime() - run.startedAt.getTime()),
          })
        : t('counting.info.milestoneOn', { number: formatNumber(entry.number), time: time(entry.countedAt, TimestampStyles.ShortDate) }),
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

async function buildLeaderboard(guildId: string): Promise<string[]> {
  const counters = await getTopCounters(guildId, LEADERBOARD_SIZE);
  if (counters.length === 0) return [t('counting.leaderboard.title'), t('counting.leaderboard.empty')];

  return [
    t('counting.leaderboard.title'),
    ...counters.map((counter, index) =>
      t('counting.leaderboard.entry', {
        position: index + 1,
        user: userMention(counter.userId),
        counted: formatNumber(counter.counted),
        accuracy: accuracy(counter.counted, counter.mistakes),
      }),
    ),
  ];
}

async function buildUser(guildId: string, userId: string): Promise<string[]> {
  const stats = await getCountingUser(guildId, userId);
  if (!stats || (stats.counted === 0 && stats.mistakes === 0)) return [t('counting.user.none', { user: userMention(userId) })];

  return [
    t('counting.user.title', { user: userMention(userId) }),
    ...(stats.counted > 0 ? [t('counting.user.rank', { rank: stats.rank })] : []),
    t('counting.user.counted', { counted: formatNumber(stats.counted) }),
    t('counting.user.mistakes', { mistakes: formatNumber(stats.mistakes) }),
    t('counting.user.accuracy', { accuracy: accuracy(stats.counted, stats.mistakes) }),
    ...(stats.lastCountedAt ? [t('counting.user.lastCounted', { relative: time(stats.lastCountedAt, TimestampStyles.RelativeTime) })] : []),
  ];
}

async function buildRuns(counting: GuildCounting): Promise<string[]> {
  const runs = await getRecentRuns(counting.guildId, SHOWN_RUNS);
  if (runs.length === 0) return [t('counting.runs.title'), t('counting.runs.empty')];

  return [
    t('counting.runs.title'),
    ...runs.map((run) => {
      if (!run.endedAt) {
        const started = run.startedAt
          ? t('counting.runs.started', { relative: time(run.startedAt, TimestampStyles.RelativeTime) })
          : t('counting.runs.startedUnknown');
        return t('counting.runs.ongoing', { run: run.runNumber, number: formatNumber(counting.lastNumber), started });
      }

      const finished = t('counting.runs.finished', {
        run: run.runNumber,
        number: formatNumber(run.finalNumber),
        user: run.endedByUserId ? userMention(run.endedByUserId) : '?',
        relative: time(run.endedAt, TimestampStyles.RelativeTime),
      });
      return run.startedAt ? finished + t('counting.runs.lasted', { duration: formatDuration(run.endedAt.getTime() - run.startedAt.getTime()) }) : finished;
    }),
  ];
}
