import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Image, type SKRSContext2D } from '@napi-rs/canvas';

/**
 * Text with emoji in it, like a custom status. The fonts have no emoji, and a server often has no emoji font at all, so they're
 * drawn from the Twemoji kept in `art/emoji`, the same ones Discord shows.
 */

const emojiImages = new Map<string, Image>();

/** An emoji's file: its code points in hex, without the invisible one that asks for color unless it's joined to another emoji. */
function emojiFile(emoji: string) {
  const points = [...emoji].map((char) => char.codePointAt(0)!.toString(16));
  return (points.includes('200d') ? points : points.filter((point) => point !== 'fe0f')).join('-');
}

/** The picture of an emoji, loaded once. */
function emojiImage(emoji: string): Image {
  const file = emojiFile(emoji);
  let image = emojiImages.get(file);
  if (!image) {
    image = new Image();
    image.src = readFileSync(join(import.meta.dir, 'emoji', `${file}.svg`));
    emojiImages.set(file, image);
  }
  return image;
}

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const isEmoji = (piece: string) => /\p{Extended_Pictographic}/u.test(piece);

/** Text cut into runs of plain text and single emoji. */
function pieces(text: string): string[] {
  const runs: string[] = [];
  for (const { segment } of segmenter.segment(text)) {
    if (!isEmoji(segment) && runs.length > 0 && !isEmoji(runs.at(-1)!)) runs[runs.length - 1] += segment;
    else runs.push(segment);
  }
  return runs;
}

/** How big an emoji is next to text of a size, a little bigger than its letters, as in Discord. */
const emojiSize = (fontSize: number) => fontSize * 1.25;

/** How wide text with emoji is in the context's font, whose size is given. */
export function measureWithEmoji(ctx: SKRSContext2D, text: string, fontSize: number) {
  return pieces(text).reduce((width, piece) => width + (isEmoji(piece) ? emojiSize(fontSize) : ctx.measureText(piece).width), 0);
}

/** Text with emoji, starting at x, its middle on y, in the context's font, whose size is given. */
export function fillWithEmoji(ctx: SKRSContext2D, text: string, x: number, y: number, fontSize: number) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const piece of pieces(text)) {
    if (isEmoji(piece)) {
      const size = emojiSize(fontSize);
      ctx.drawImage(emojiImage(piece), x, y - size / 2, size, size);
      x += size;
    } else {
      ctx.fillText(piece, x, y);
      x += ctx.measureText(piece).width;
    }
  }
}
