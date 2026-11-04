import { AttachmentBuilder, type Message } from 'discord.js';

/** A message as it goes in a text file, from a real message or made up, like for the preview. */
export interface TranscriptMessage {
  createdAt: Date;
  username: string;
  userId: string;
  bot: boolean;
  content: string;
  /** Names and links of what was attached. */
  attachments: { name: string; url: string }[];
  stickers: string[];
  embeds: number;
}

export const toTranscriptMessage = (message: Message): TranscriptMessage => ({
  createdAt: message.createdAt,
  username: message.author.username,
  userId: message.author.id,
  bot: message.author.bot,
  content: message.content,
  attachments: [...message.attachments.values()].map((file) => ({ name: file.name, url: file.url })),
  stickers: [...message.stickers.values()].map((sticker) => sticker.name),
  embeds: message.embeds.length,
});

/** A time like `2026-11-04 21:04:12 UTC`, the same for whoever reads the file, wherever they are. */
const utc = (date: Date) => `${date.toISOString().replace('T', ' ').slice(0, 19)} UTC`;

/**
 * Messages as a text file to read later, oldest first: when, who and what each said, indented under them, and what was attached,
 * with links, so it can still be found while Discord keeps it.
 * @param heading What the file is, at the top, like where the messages were deleted.
 */
export function transcriptFile(messages: TranscriptMessage[], heading: string, name: string): AttachmentBuilder {
  const lines = [...messages]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .flatMap((message) => [
      `[${utc(message.createdAt)}] ${message.username} (${message.userId})${message.bot ? ' [bot]' : ''}`,
      ...(message.content ? message.content.split('\n').map((line) => `    ${line}`) : []),
      ...message.attachments.map((file) => `    Attachment: ${file.name} ${file.url}`),
      ...message.stickers.map((sticker) => `    Sticker: ${sticker}`),
      ...(message.embeds > 0 ? [`    ${message.embeds} embed${message.embeds === 1 ? '' : 's'}`] : []),
      '',
    ]);
  return textFile([heading, '', ...lines].join('\n'), name);
}

/** A text as a file, for texts too long for a log entry, like a long message that was edited. */
export const textFile = (text: string, name: string) => new AttachmentBuilder(Buffer.from(text, 'utf8'), { name });
