import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
  time,
  TimestampStyles,
  userMention,
  type ModalSubmitInteraction,
} from 'discord.js';

import { getCounting } from 'database/counting';
import { getRecentRuns, getTopCounters } from 'database/countingStats';

import { formatDuration, formatNumber } from 'utility/duration';
import { getTranslate, type Translate } from 'utility/i18next';
import { buildPageRow, clampPage, findMeButton, type PageButton, readPageInput } from 'utility/pagination';
import { sendError, type ResponsePayload } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/** How many members or runs a page shows. */
export const COUNTING_PAGE_SIZE = 10;

export type CountingList = 'leaderboard' | 'runs';
const LISTS: CountingList[] = ['leaderboard', 'runs'];

/**
 * The page buttons of /counting are `countpage:<list>:<page>`, so they work however old the message is. The first and last ones end
 * in what they are, as they can lead to the same page as previous and next, and so do the buttons asking for a page and finding you.
 */
export const COUNTING_PAGE_PREFIX = 'countpage:';
/** The popup asking for a page is this, followed by its list. */
export const COUNTING_PAGE_MODAL_PREFIX = 'countpage-goto:';

/** Go to the page, ask which page to go to, or go to the page of whoever pressed. */
export type CountingPageAction = 'page' | 'goto' | 'me';

export function parseCountingPageId(customId: string): { list: CountingList; page: number; action: CountingPageAction } | null {
  const [list, page, ...rest] = customId.slice(COUNTING_PAGE_PREFIX.length).split(':');
  if (!LISTS.includes(list as CountingList) || !/^\d+$/.test(page ?? '') || rest.length > 1) return null;
  const suffix = rest[0];
  if (suffix !== undefined && !['first', 'last', 'goto', 'me'].includes(suffix)) return null;
  const action: CountingPageAction = suffix === 'goto' || suffix === 'me' ? suffix : 'page';
  return { list: list as CountingList, page: Number(page), action };
}

/** The list a page popup is for, or null if it isn't one. */
function parseCountingPageModalId(customId: string): CountingList | null {
  const list = customId.slice(COUNTING_PAGE_MODAL_PREFIX.length);
  return LISTS.includes(list as CountingList) ? (list as CountingList) : null;
}

const accuracy = (counted: number, mistakes: number) => Math.round((counted / Math.max(1, counted + mistakes)) * 100);

/**
 * The lines of a page, with buttons to the first, previous, next and last page and to ask for one when there's more than one,
 * and on the leaderboard one to find yourself on its own row. Nobody is pinged.
 */
function buildPage(list: CountingList, lines: string[], page: number, pages: number, t: Translate): ResponsePayload {
  const container = new ContainerBuilder().setAccentColor(ThemeColors.info).addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
  if (pages > 1) {
    // Going to the first and the previous page can be the same page, so the custom IDs say which button it is
    const customId = (button: PageButton, target: number) =>
      `${COUNTING_PAGE_PREFIX}${list}:${target}${button === 'prev' || button === 'next' ? '' : `:${button}`}`;
    container.addActionRowComponents(buildPageRow(page, pages, customId, t));
    if (list === 'leaderboard') {
      container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(findMeButton(`${COUNTING_PAGE_PREFIX}${list}:${page}:me`, t)));
    }
  }
  return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}

/** Go to the page typed into the popup. A page past the end shows the last one. */
export async function handleCountingPageModal(interaction: ModalSubmitInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const list = parseCountingPageModalId(interaction.customId);
  if (!list || !interaction.inCachedGuild() || !interaction.isFromMessage()) return sendError(interaction, t('system.outdated'));
  const page = readPageInput(interaction);
  if (page === null) return sendError(interaction, t('pagination.modal.invalid'));

  await interaction.deferUpdate();
  const build = list === 'leaderboard' ? buildCountingLeaderboard : buildCountingRuns;
  return interaction.editReply(await build(interaction.guildId, page - 1, t));
}

/** A page of the members who counted the most. */
export async function buildCountingLeaderboard(guildId: string, requested: number, t: Translate): Promise<ResponsePayload> {
  const first = await getTopCounters(guildId, COUNTING_PAGE_SIZE, requested * COUNTING_PAGE_SIZE);
  const { page, pages } = clampPage(requested, first.total, COUNTING_PAGE_SIZE);
  // Asked again when the page asked for doesn't exist anymore, like after members' data was deleted
  const { counters } = page === requested ? first : await getTopCounters(guildId, COUNTING_PAGE_SIZE, page * COUNTING_PAGE_SIZE);
  if (counters.length === 0) return buildPage('leaderboard', [t('counting.leaderboard.title'), t('counting.leaderboard.empty')], 0, 1, t);

  const lines = counters.map((counter, index) =>
    t('counting.leaderboard.entry', {
      position: formatNumber(page * COUNTING_PAGE_SIZE + index + 1, t),
      user: userMention(counter.userId),
      counted: formatNumber(counter.counted, t),
      accuracy: accuracy(counter.counted, counter.mistakes),
    }),
  );
  return buildPage('leaderboard', [t('counting.leaderboard.title'), ...lines], page, pages, t);
}

/** A page of the runs, newest first, with how each ended. */
export async function buildCountingRuns(guildId: string, requested: number, t: Translate): Promise<ResponsePayload> {
  const counting = await getCounting(guildId);
  const first = await getRecentRuns(guildId, COUNTING_PAGE_SIZE, requested * COUNTING_PAGE_SIZE);
  const { page, pages } = clampPage(requested, first.total, COUNTING_PAGE_SIZE);
  const { runs } = page === requested ? first : await getRecentRuns(guildId, COUNTING_PAGE_SIZE, page * COUNTING_PAGE_SIZE);
  if (runs.length === 0) return buildPage('runs', [t('counting.runs.title'), t('counting.runs.empty')], 0, 1, t);

  const lines = runs.map((run) => {
    if (!run.endedAt) {
      const started = run.startedAt
        ? t('counting.runs.started', { relative: time(run.startedAt, TimestampStyles.RelativeTime) })
        : t('counting.runs.startedUnknown');
      return t('counting.runs.ongoing', { run: formatNumber(run.runNumber, t), number: formatNumber(counting?.lastNumber ?? 0, t), started });
    }

    const finished = t('counting.runs.finished', {
      run: formatNumber(run.runNumber, t),
      number: formatNumber(run.finalNumber, t),
      user: run.endedByUserId ? userMention(run.endedByUserId) : '?',
      relative: time(run.endedAt, TimestampStyles.RelativeTime),
    });
    return run.startedAt ? finished + t('counting.runs.lasted', { duration: formatDuration(run.endedAt.getTime() - run.startedAt.getTime(), t) }) : finished;
  });
  return buildPage('runs', [t('counting.runs.title'), ...lines], page, pages, t);
}
