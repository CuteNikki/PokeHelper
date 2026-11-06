import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ModalSubmitInteraction,
} from 'discord.js';

import { formatNumber } from 'utility/duration';
import type { Translate } from 'utility/i18next';

export function parseSortOrder(sortOrder: unknown): 'asc' | 'desc' {
  if (typeof sortOrder === 'string' && ['asc', 'desc'].includes(sortOrder)) {
    return sortOrder as 'asc' | 'desc';
  }
  return 'desc';
}

const PAGE_INPUT_ID = 'page_input';
/** Enough for any page number, which is checked against the pages there are once submitted. */
const MAX_PAGE_LENGTH = 6;

/**
 * The popup asking which page to go to, for any list with pages.
 * @param customId Says which list and view it's for, so it's handled however long it was open.
 * @param current The page shown now, counted from 1, to start from.
 */
export function buildPageModal(customId: string, current: number, t: Translate) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(t('pagination.modal.title'))
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(t('pagination.modal.label'))
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(PAGE_INPUT_ID)
            .setStyle(TextInputStyle.Short)
            .setValue(current.toString())
            .setMaxLength(MAX_PAGE_LENGTH)
            .setMinLength(1)
            .setRequired(true),
        ),
    );
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
  new ButtonBuilder().setCustomId(customId).setStyle(ButtonStyle.Secondary).setEmoji('📍').setLabel(t('pagination.findMe'));

/**
 * The page to show, counted from 0, and how many pages there are. Kept within the pages there are, as a list can change between presses,
 * and always at least one page, also for an empty list.
 */
export function clampPage(requested: number, total: number, pageSize: number): { page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return { page: Math.min(Math.max(0, Math.floor(requested) || 0), pages - 1), pages };
}

/** What a page button does, which its custom ID has to tell apart, as going to the first and the previous page can be the same page. */
export type PageButton = 'first' | 'prev' | 'goto' | 'next' | 'last';

/**
 * The page buttons under a list: first, previous, the page, next and last. Buttons that would go nowhere are disabled.
 * @param page The page shown, counted from 0.
 * @param customId The custom ID of a button, by what it does and the page it goes to, counted from 0.
 * @param options.goto Whether pressing the page asks which page to go to. Without it, the page only shows where you are.
 * @param options.short Only previous, the page and next, for short lists.
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

  const previous = button('prev', page - 1, t('pagination.previous.icon'));
  const next = button('next', page + 1, t('pagination.next.icon'));
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    short
      ? [previous, current, next]
      : [button('first', 0, t('pagination.first.icon')), previous, current, next, button('last', pages - 1, t('pagination.last.icon'))],
  );
}
