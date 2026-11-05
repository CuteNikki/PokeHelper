import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
  time,
  TimestampStyles,
  userMention,
} from 'discord.js';

import { getCounting } from 'database/counting';
import { getRecentRuns, getTopCounters } from 'database/countingStats';

import { formatDuration, formatNumber } from 'utility/duration';
import type { Translate } from 'utility/i18next';
import type { ResponsePayload } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/** How many members or runs a page shows. */
export const COUNTING_PAGE_SIZE = 10;

export type CountingList = 'leaderboard' | 'runs';
const LISTS: CountingList[] = ['leaderboard', 'runs'];

/** The page buttons of /counting are `countpage:<list>:<page>`, so they work however old the message is. */
export const COUNTING_PAGE_PREFIX = 'countpage:';

export function parseCountingPageId(customId: string): { list: CountingList; page: number } | null {
  // The first and last page buttons end in what they are, as they can lead to the same page as previous and next
  const [list, page, ...rest] = customId.slice(COUNTING_PAGE_PREFIX.length).split(':');
  if (!LISTS.includes(list as CountingList) || !/^\d+$/.test(page ?? '')) return null;
  if (rest.length > 1 || (rest[0] !== undefined && rest[0] !== 'first' && rest[0] !== 'last')) return null;
  return { list: list as CountingList, page: Number(page) };
}

/** The page to show and how many there are, kept within the pages there are, as the lists change between presses. */
export function pageOf(requested: number, total: number) {
  const pages = Math.max(1, Math.ceil(total / COUNTING_PAGE_SIZE));
  return { page: Math.min(Math.max(0, requested), pages - 1), pages };
}

const accuracy = (counted: number, mistakes: number) => Math.round((counted / Math.max(1, counted + mistakes)) * 100);

/** The lines of a page, with buttons to the first, previous, next and last page when there's more than one. Nobody is pinged. */
function buildPage(list: CountingList, lines: string[], page: number, pages: number, t: Translate): ResponsePayload {
  const container = new ContainerBuilder().setAccentColor(ThemeColors.info).addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
  if (pages > 1) {
    const button = (target: number, icon: string) =>
      new ButtonBuilder()
        .setCustomId(`${COUNTING_PAGE_PREFIX}${list}:${target}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(icon)
        .setDisabled(target < 0 || target >= pages);
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(0, t('pagination.first.icon'))
          .setCustomId(`${COUNTING_PAGE_PREFIX}${list}:0:first`)
          .setDisabled(page === 0),
        button(page - 1, t('pagination.previous.icon')),
        new ButtonBuilder()
          .setCustomId(`${COUNTING_PAGE_PREFIX}${list}:current`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel(t('pagination.page.label', { current: (page + 1).toLocaleString(t('locale')), total: pages.toLocaleString(t('locale')) }))
          .setDisabled(true),
        button(page + 1, t('pagination.next.icon')),
        button(pages - 1, t('pagination.last.icon'))
          .setCustomId(`${COUNTING_PAGE_PREFIX}${list}:${pages - 1}:last`)
          .setDisabled(page === pages - 1),
      ),
    );
  }
  return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}

/** A page of the members who counted the most. */
export async function buildCountingLeaderboard(guildId: string, requested: number, t: Translate): Promise<ResponsePayload> {
  const first = await getTopCounters(guildId, COUNTING_PAGE_SIZE, requested * COUNTING_PAGE_SIZE);
  const { page, pages } = pageOf(requested, first.total);
  // Asked again when the page asked for doesn't exist anymore, like after members' data was deleted
  const { counters } = page === requested ? first : await getTopCounters(guildId, COUNTING_PAGE_SIZE, page * COUNTING_PAGE_SIZE);
  if (counters.length === 0) return buildPage('leaderboard', [t('counting.leaderboard.title'), t('counting.leaderboard.empty')], 0, 1, t);

  const lines = counters.map((counter, index) =>
    t('counting.leaderboard.entry', {
      position: page * COUNTING_PAGE_SIZE + index + 1,
      user: userMention(counter.userId),
      counted: formatNumber(counter.counted),
      accuracy: accuracy(counter.counted, counter.mistakes),
    }),
  );
  return buildPage('leaderboard', [t('counting.leaderboard.title'), ...lines], page, pages, t);
}

/** A page of the runs, newest first, with how each ended. */
export async function buildCountingRuns(guildId: string, requested: number, t: Translate): Promise<ResponsePayload> {
  const counting = await getCounting(guildId);
  const first = await getRecentRuns(guildId, COUNTING_PAGE_SIZE, requested * COUNTING_PAGE_SIZE);
  const { page, pages } = pageOf(requested, first.total);
  const { runs } = page === requested ? first : await getRecentRuns(guildId, COUNTING_PAGE_SIZE, page * COUNTING_PAGE_SIZE);
  if (runs.length === 0) return buildPage('runs', [t('counting.runs.title'), t('counting.runs.empty')], 0, 1, t);

  const lines = runs.map((run) => {
    if (!run.endedAt) {
      const started = run.startedAt
        ? t('counting.runs.started', { relative: time(run.startedAt, TimestampStyles.RelativeTime) })
        : t('counting.runs.startedUnknown');
      return t('counting.runs.ongoing', { run: run.runNumber, number: formatNumber(counting?.lastNumber ?? 0), started });
    }

    const finished = t('counting.runs.finished', {
      run: run.runNumber,
      number: formatNumber(run.finalNumber),
      user: run.endedByUserId ? userMention(run.endedByUserId) : '?',
      relative: time(run.endedAt, TimestampStyles.RelativeTime),
    });
    return run.startedAt ? finished + t('counting.runs.lasted', { duration: formatDuration(run.endedAt.getTime() - run.startedAt.getTime(), t) }) : finished;
  });
  return buildPage('runs', [t('counting.runs.title'), ...lines], page, pages, t);
}
