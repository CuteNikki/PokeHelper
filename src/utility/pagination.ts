import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type ModalSubmitInteraction } from 'discord.js';

import { formatNumber } from 'utility/duration';
import { buttonIcon } from 'utility/emojis';
import type { Translate } from 'utility/i18next';
import { buildTextModal } from 'utility/modal';

export function parseSortOrder(sortOrder: unknown): 'asc' | 'desc' {
  if (typeof sortOrder === 'string' && ['asc', 'desc'].includes(sortOrder)) {
    return sortOrder as 'asc' | 'desc';
  }
  return 'desc';
}

const PAGE_INPUT_ID = 'page_input';
/** Enough for any page number, which is checked against the pages there are once submitted. */
const MAX_PAGE_LENGTH = 6;

/** The popup asking which page to go to. `current` counts from 1. */
export function buildPageModal(customId: string, current: number, t: Translate) {
  return buildTextModal({
    customId,
    title: t('pagination.modal.title'),
    label: t('pagination.modal.label'),
    inputId: PAGE_INPUT_ID,
    value: current.toString(),
    maxLength: MAX_PAGE_LENGTH,
    minLength: 1,
  });
}

/** The page typed into a page popup, counted from 1, or null if it isn't one. A page past the end is the list's to handle. */
export function readPageInput(interaction: ModalSubmitInteraction): number | null {
  const page = Number(interaction.fields.getTextInputValue(PAGE_INPUT_ID).trim());
  return Number.isInteger(page) && page >= 1 ? page : null;
}

/** The page someone is on, counted from 1, from their place in a list. */
export const pageOfPosition = (position: number, pageSize: number) => Math.max(1, Math.ceil(position / pageSize));

/** The button that goes to the page of whoever presses it, on its own row under a list's page buttons. */
export const findMeButton = (customId: string, t: Translate) =>
  new ButtonBuilder().setCustomId(customId).setStyle(ButtonStyle.Secondary).setEmoji(buttonIcon('user')).setLabel(t('pagination.findMe'));

/** The page to show, counted from 0 and kept in range as a list can change between presses, and how many pages there are (at least one). */
export function clampPage(requested: number, total: number, pageSize: number): { page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return { page: Math.min(Math.max(0, Math.floor(requested) || 0), pages - 1), pages };
}

/** What a page button does, which its custom ID has to tell apart, as going to the first and the previous page can be the same page. */
export type PageButton = 'first' | 'prev' | 'goto' | 'next' | 'last';

/**
 * The page buttons under a list, pages counted from 0. Buttons that would go nowhere are disabled.
 * `goto` makes the page button ask which page to go to, `short` leaves out first and last.
 */
export function buildPageRow(
  page: number,
  pages: number,
  customId: (button: PageButton, target: number) => string,
  t: Translate,
  { goto = true, short = false }: { goto?: boolean; short?: boolean } = {},
): ActionRowBuilder<ButtonBuilder> {
  const button = (kind: PageButton, target: number, icon: string) =>
    new ButtonBuilder()
      .setCustomId(customId(kind, target))
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(icon)
      .setDisabled(target < 0 || target >= pages || target === page);
  const current = new ButtonBuilder()
    .setCustomId(customId('goto', page))
    .setStyle(ButtonStyle.Secondary)
    .setLabel(t('pagination.page.label', { current: formatNumber(page + 1, t), total: formatNumber(pages, t) }))
    .setDisabled(!goto);

  const previous = button('prev', page - 1, buttonIcon('chevron-left'));
  const next = button('next', page + 1, buttonIcon('chevron-right'));
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    short
      ? [previous, current, next]
      : [button('first', 0, buttonIcon('chevrons-left')), previous, current, next, button('last', pages - 1, buttonIcon('chevrons-right'))],
  );
}
