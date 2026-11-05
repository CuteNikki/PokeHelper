import { ButtonBuilder, ButtonStyle, LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, type ModalSubmitInteraction } from 'discord.js';

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
