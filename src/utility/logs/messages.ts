import type { AttachmentBuilder } from 'discord.js';

import type { Translate } from 'utility/i18next';
import { markChanges } from 'utility/logs/diff';
import { textFile } from 'utility/logs/files';
import { MAX_QUOTE_LINES, quoteText } from 'utility/logs/send';
import { shorten } from 'utility/text';

/**
 * The text of edited and deleted messages, which can be up to 4000 characters, more than an entry has room for twice.
 * What fits is shown in the entry, and the whole text goes in a file under it when it doesn't.
 */

/** The most of each side of an edit shown, so before and after both fit, with their marks. */
const EDIT_SHOWN = 1_000;
/** The most of a deleted message shown. */
const DELETE_SHOWN = 1_500;

interface MessageText {
  details: string[];
  files: AttachmentBuilder[];
}

/** Whether a text is shown in full: short enough, and with few enough lines that its quote isn't cut. */
const fitsIn = (text: string, length: number) => text.length <= length && text.split('\n').length <= MAX_QUOTE_LINES;

/**
 * Before and after of an edited message. Short enough, what changed is marked, crossed out and underlined. Too long, both are shortened
 * without marks, as a mark cut off halfway would mark the rest of the entry, and both are in a file in full.
 * @param before What it said before, or null if the bot never saw it.
 */
export function editedText(before: string | null, after: string, messageId: string, t: Translate): MessageText {
  const noText = t('logs.noText');
  const heading = (key: 'logs.before' | 'logs.after', text: string) => `**${t(key)}**\n${text}`;

  if (before === null) {
    return {
      details: [heading('logs.before', `-# ${t('logs.notSeen')}`), heading('logs.after', quoteText(shorten(after || noText, EDIT_SHOWN)))],
      files: fitsIn(after, EDIT_SHOWN) ? [] : [textFile(after, `message-${messageId}.txt`)],
    };
  }

  if (fitsIn(before, EDIT_SHOWN) && fitsIn(after, EDIT_SHOWN)) {
    const marked = markChanges(before || noText, after || noText);
    return { details: [heading('logs.before', quoteText(marked.before)), heading('logs.after', quoteText(marked.after))], files: [] };
  }

  return {
    details: [
      heading('logs.before', quoteText(shorten(before || noText, EDIT_SHOWN))),
      heading('logs.after', quoteText(shorten(after || noText, EDIT_SHOWN))),
      `-# ${t('logs.tooLong')}`,
    ],
    files: [textFile(`${t('logs.before')}:\n${before}\n\n${t('logs.after')}:\n${after}\n`, `message-${messageId}.txt`)],
  };
}

/** What a deleted message said, shortened if it's long, with the whole text in a file then. */
export function deletedText(content: string, messageId: string, t: Translate): MessageText {
  if (fitsIn(content, DELETE_SHOWN)) return { details: [quoteText(content || t('logs.noText'))], files: [] };
  return {
    details: [quoteText(shorten(content, DELETE_SHOWN)), `-# ${t('logs.tooLong')}`],
    files: [textFile(content, `message-${messageId}.txt`)],
  };
}
