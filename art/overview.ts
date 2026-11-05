import { join } from 'node:path';

import { GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';

import { TAU } from './draw';
import { animatedGif } from './gif';
import { avatar, BANNER_H, BANNER_W, banner } from './scenes';
import { STATUSES } from './statuses';
import { fillWithEmoji, measureWithEmoji } from './text';
import type { ThemeName } from './themes';
import { THEMES } from './themes';

// A light weight for the status, as in Discord
GlobalFonts.registerFromPath(join(import.meta.dir, 'fonts', 'Nunito-Medium.ttf'), 'Nunito Medium');

/**
 * Every theme at once in one GIF, each as a little profile with its banner, avatar and the custom status it says in that theme, to
 * show them to people who can't open the preview page. The whole loop, and still small enough to send on Discord.
 */

const COLUMNS = 3;
const GAP = 16;
const CELL_W = 300;
const BANNER_SHOWN_H = Math.round((CELL_W * BANNER_H) / BANNER_W);
const AVATAR_D = 72;
const CELL_H = BANNER_SHOWN_H + AVATAR_D / 2 + 34;
const FRAMES = 120;
const DELAY = 80;
/** Closed eyes at the same moments as in the real loop. */
const blinkAt = (frame: number) => (frame === 35 || frame === 36 || frame === 95 || frame === 96 ? 1 : 0);

/** Theme names as people read them, like `newYear` as New Year. */
const title = (name: string) => name.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());

/**
 * The status bubble, measured on a Discord profile and scaled to the avatar here: its text, how tall a line is, how far the text is
 * from its edges, and how round its corners are.
 */
const STATUS_FONT = 12;
const STATUS_LINE_H = 15;
const STATUS_PAD_X = 11;
const STATUS_PAD_Y = 8.5;
const STATUS_RADIUS = 11;

/** Words into lines no wider than a width, the last one taking whatever is left. An emoji stays with the word before it. */
function wrap(ctx: SKRSContext2D, text: string, width: number, maxLines: number): string[] {
  const words = text.split(' ').reduce<string[]>((joined, word) => {
    if (joined.length > 0 && /^\p{Extended_Pictographic}/u.test(word)) joined[joined.length - 1] += ` ${word}`;
    else joined.push(word);
    return joined;
  }, []);
  const lines: string[] = [];
  for (const word of words) {
    const line = lines.at(-1);
    if (line !== undefined && (lines.length === maxLines || measureWithEmoji(ctx, `${line} ${word}`, STATUS_FONT) <= width)) {
      lines[lines.length - 1] = `${line} ${word}`;
    } else {
      lines.push(word);
    }
  }
  return lines;
}

/**
 * The custom status in a thought bubble beside the avatar, as on a Discord profile: a little dot just off the avatar's ring, a bigger
 * one poking out of the bubble's top left, and the bubble, its top as high as the middle of the avatar, over the bottom of the banner.
 * A long one wraps onto a second line, the bubble growing down, as there. A theme with more than one takes turns through the loop, so
 * each is shown.
 * @param cx The middle of the avatar, and `cy`.
 * @param right How far the bubble may reach.
 */
function statusBubble(ctx: SKRSContext2D, name: ThemeName, cx: number, cy: number, right: number, time: number) {
  const left = cx + 44;
  const top = cy - 5;
  const sentences = STATUSES[name];
  ctx.font = `${STATUS_FONT}px "Nunito Medium"`;
  const lines = wrap(ctx, sentences[Math.floor(time * sentences.length)]!, right - left - STATUS_PAD_X * 2, 2);
  const width = Math.max(...lines.map((line) => measureWithEmoji(ctx, line, STATUS_FONT))) + STATUS_PAD_X * 2;
  const height = lines.length * STATUS_LINE_H + STATUS_PAD_Y * 2;
  ctx.fillStyle = '#383a40';
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, STATUS_RADIUS);
  ctx.moveTo(left + 17 + 8, top + 1);
  ctx.arc(left + 17, top + 1, 8, 0, TAU);
  ctx.moveTo(cx + 44 + 4.5, cy - 15);
  ctx.arc(cx + 44, cy - 15, 4.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#dbdee1';
  lines.forEach((line, i) => fillWithEmoji(ctx, line, left + STATUS_PAD_X, top + STATUS_PAD_Y + STATUS_LINE_H * (i + 0.5) + 0.5, STATUS_FONT));
}

function cell(ctx: SKRSContext2D, name: ThemeName, x: number, y: number, time: number, blink: number) {
  const theme = THEMES[name];
  const top = y;
  ctx.fillStyle = '#232428';
  ctx.beginPath();
  ctx.roundRect(x, top, CELL_W, CELL_H, 10);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, top, CELL_W, BANNER_SHOWN_H, [10, 10, 0, 0]);
  ctx.clip();
  ctx.translate(x, top);
  ctx.scale(CELL_W / BANNER_W, BANNER_SHOWN_H / BANNER_H);
  banner(ctx, theme, time, blink);
  ctx.restore();

  // The avatar in its ring, over the bottom of the banner, like on a profile
  const cx = x + 14 + AVATAR_D / 2;
  const cy = top + BANNER_SHOWN_H;
  ctx.fillStyle = '#232428';
  ctx.beginPath();
  ctx.arc(cx, cy, AVATAR_D / 2 + 5, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, AVATAR_D / 2, 0, TAU);
  ctx.clip();
  ctx.translate(cx - AVATAR_D / 2, cy - AVATAR_D / 2);
  avatar(ctx, theme, AVATAR_D, time, blink);
  ctx.restore();

  statusBubble(ctx, name, cx, cy, x + CELL_W - 10, time);

  // The theme's name where the bot's name is on a profile, as the bot's name is on every banner already
  ctx.fillStyle = '#f2f3f5';
  ctx.font = '18px "Nunito Black"';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title(name), x + 14, cy + AVATAR_D / 2 + 24);
}

/** The overview of the themes named, in a grid. */
export function overviewGif(names: ThemeName[]): Promise<Uint8Array> {
  const rows = Math.ceil(names.length / COLUMNS);
  const width = COLUMNS * CELL_W + (COLUMNS + 1) * GAP;
  const height = rows * CELL_H + (rows + 1) * GAP;
  return animatedGif(width, height, FRAMES, DELAY, (ctx, frame) => {
    ctx.fillStyle = '#313338';
    ctx.fillRect(0, 0, width, height);
    names.forEach((name, i) =>
      cell(ctx, name, GAP + (i % COLUMNS) * (CELL_W + GAP), GAP + Math.floor(i / COLUMNS) * (CELL_H + GAP), frame / FRAMES, blinkAt(frame)),
    );
  });
}
