import {
  type ButtonInteraction,
  ContainerBuilder,
  type Guild,
  MessageFlags,
  type ModalSubmitInteraction,
  SeparatorBuilder,
  SeparatorSpacingSize,
  subtext,
  TextDisplayBuilder,
  time,
  TimestampStyles,
} from 'discord.js';

import { CASE_SORTS, CASE_TYPES, type CaseSort, getUserCases } from 'database/moderation';

import type { ModCase } from 'generated/prisma/client';
import { textIcon } from 'utility/emojis';
import { getTranslate, type Translate } from 'utility/i18next';
import { userRef } from 'utility/logs/format';
import { CASE_ICONS, caseNumber } from 'utility/moderation/run';
import { buildPageModal, buildPageRow, clampPage, type PageButton, readPageInput } from 'utility/pagination';
import { sendError, type ResponsePayload } from 'utility/response';
import { shorten } from 'utility/text';
import { ThemeColors } from 'utility/theme';

/**
 * Someone's case history, from `/cases` or the Cases menu on their name. Every button, select and popup carries where it is in it,
 * as `cases:<action>:...`, so they work however old the message is:
 * - `list:<user>:<sort>:<page>`, with `first`, `last` or `goto` after it for those page buttons, as they can lead to the same page
 * - the page popup `goto:<user>:<sort>`
 */
export const CASES_PREFIX = 'cases:';
/** How many cases a page shows. */
export const CASES_PAGE_SIZE = 10;
/** How much of a reason the list shows. */
const LIST_REASON_LENGTH = 100;

/** Where someone is in a case history, which every button, select and popup carries. */
export interface CasesState {
  userId: string;
  sort: CaseSort;
  page: number;
}

/** What a custom ID of a case history asks for. */
export type CasesAction = { action: 'list'; state: CasesState; goto: boolean } | { action: 'goto'; userId: string; sort: CaseSort };

const stateId = (state: CasesState) => `${state.userId}:${state.sort}:${state.page}`;
export const listId = (state: CasesState, suffix?: 'first' | 'last' | 'goto') => `${CASES_PREFIX}list:${stateId(state)}${suffix ? `:${suffix}` : ''}`;

const isId = (value: string | undefined): value is string => /^\d{15,25}$/.test(value ?? '');
const isSort = (value: string | undefined): value is CaseSort => CASE_SORTS.includes(value as CaseSort);
const isPage = (value: string | undefined) => /^\d{1,6}$/.test(value ?? '');

/** Where a custom ID of a case history leads, or null if it isn't one, like one from an older version of the bot. */
export function parseCasesId(customId: string): CasesAction | null {
  if (!customId.startsWith(CASES_PREFIX)) return null;
  const [action, ...parts] = customId.slice(CASES_PREFIX.length).split(':');
  const state = (userId?: string, sort?: string, page?: string): CasesState | null =>
    isId(userId) && isSort(sort) && isPage(page) ? { userId, sort, page: Number(page) } : null;

  switch (action) {
    case 'list': {
      const [userId, sort, page, suffix] = parts;
      const parsed = state(userId, sort, page);
      if (!parsed || parts.length > 4 || (suffix !== undefined && !['first', 'last', 'goto'].includes(suffix))) return null;
      return { action, state: parsed, goto: suffix === 'goto' };
    }
    case 'goto': {
      const [userId, sort] = parts;
      return parts.length === 2 && isId(userId) && isSort(sort) ? { action, userId, sort } : null;
    }
    default:
      return null;
  }
}

/** A case's type with its icon, like `Ban`. */
const typeLabel = (modCase: ModCase, t: Translate) => `${textIcon(CASE_ICONS[modCase.type])} ${t(`moderation.types.${modCase.type}`)}`;

/** Whether a timeout or ban is still on, was ended early, or ran out, with when. Null for cases that don't last, and bans for good that are still on. */
function caseStatus(modCase: ModCase, t: Translate, now = new Date()): string | null {
  if (modCase.endedAt) return t('moderation.cases.status.ended', { time: time(modCase.endedAt, TimestampStyles.RelativeTime) });
  if (!modCase.expiresAt) return null;
  return modCase.expiresAt > now
    ? t('moderation.cases.status.until', { time: time(modCase.expiresAt, TimestampStyles.RelativeTime) })
    : t('moderation.cases.status.ranOut', { time: time(modCase.expiresAt, TimestampStyles.RelativeTime) });
}

const moderatorOf = (guild: Guild, modCase: ModCase, t: Translate) =>
  modCase.moderatorId ? userRef(guild, modCase.moderatorId) : t('moderation.cases.unknown');

/** A page of someone's cases, with how many of each type they have above them. */
export async function renderCaseList(guild: Guild, requested: CasesState, t: Translate): Promise<ResponsePayload> {
  const first = await getUserCases(guild.id, requested.userId, requested.sort, requested.page * CASES_PAGE_SIZE, CASES_PAGE_SIZE);
  const { page, pages } = clampPage(requested.page, first.total, CASES_PAGE_SIZE);
  // Asked again when the page asked for doesn't exist anymore, like after cases were deleted
  const { cases, counts, total } =
    page === requested.page ? first : await getUserCases(guild.id, requested.userId, requested.sort, page * CASES_PAGE_SIZE, CASES_PAGE_SIZE);
  const state: CasesState = { ...requested, page };

  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('moderation.cases.title', { user: userRef(guild, requested.userId) })))
    // Large, so the title, the list and the selects stand apart, like in the settings panels
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));
  if (total === 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('moderation.cases.none')));
    return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
  }

  // How many there are, and of which types, above the list like on the other lists
  const count = [
    t('moderation.cases.count', { count: total }),
    ...CASE_TYPES.filter((type) => counts[type] > 0).map((type) => t(`moderation.cases.counts.${type}`, { count: counts[type] })),
  ].join(' · ');

  const entries = cases.map((modCase) => {
    const line = t('moderation.cases.entry', {
      number: caseNumber(modCase, t),
      type: typeLabel(modCase, t),
      date: time(modCase.createdAt, TimestampStyles.ShortDate),
      moderator: moderatorOf(guild, modCase, t),
    });
    // Small, under the case, with a dot like the tips have
    const details = [shorten((modCase.reason ?? t('moderation.noReason')).replace(/\s+/g, ' '), LIST_REASON_LENGTH), caseStatus(modCase, t)];
    return `${line}\n${subtext(`• ${details.filter(Boolean).join(' · ')}`)}`;
  });

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent([subtext(count), ...entries].join('\n')));
  if (pages > 1) {
    const customId = (button: PageButton, target: number) =>
      listId({ ...state, page: target }, button === 'first' || button === 'last' || button === 'goto' ? button : undefined);
    container.addActionRowComponents(buildPageRow(page, pages, customId, t));
  }
  return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}

/** The page buttons of a case history. */
export async function handleCasesButton(interaction: ButtonInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const parsed = parseCasesId(interaction.customId);
  if (!parsed || parsed.action !== 'list') return sendError(interaction, t('system.outdated'));
  const { state } = parsed;

  // A popup has to be the first answer, so this can't wait for anything else
  if (parsed.action === 'list' && parsed.goto) {
    return interaction.showModal(buildPageModal(`${CASES_PREFIX}goto:${state.userId}:${state.sort}`, state.page + 1, t));
  }

  // Answered before anything is looked up, as Discord gives up after 3 seconds
  await interaction.deferUpdate();
  return interaction.editReply(await renderCaseList(interaction.guild, state, t));
}

/** The popup of a case history asking which page to go to. */
export async function handleCasesModal(interaction: ModalSubmitInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const parsed = parseCasesId(interaction.customId);
  if (!parsed || parsed.action !== 'goto' || !interaction.inCachedGuild() || !interaction.isFromMessage()) return sendError(interaction, t('system.outdated'));

  const page = readPageInput(interaction);
  if (page === null) return sendError(interaction, t('pagination.modal.invalid'));
  await interaction.deferUpdate();
  // A page past the end shows the last one
  return interaction.editReply(await renderCaseList(interaction.guild, { userId: parsed.userId, sort: parsed.sort, page: page - 1 }, t));
}

/** Someone's case history from its first page, newest first, for `/cases` and the Cases menu on their name. */
export const renderCasesFor = (guild: Guild, userId: string, t: Translate) => renderCaseList(guild, { userId, sort: 'newest', page: 0 }, t);
