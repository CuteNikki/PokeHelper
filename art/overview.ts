import { join } from 'node:path';

import { GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';

import { TAU } from './draw';
import { animatedGif } from './gif';
import { avatar, BANNER_H, BANNER_W, banner } from './scenes';
import { STATUSES } from './statuses';
import { fillWithEmoji, measureWithEmoji } from './text';
import type { ThemeName } from './themes';
import { THEMES } from './themes';

// A lighter weight for the status, as in Discord
GlobalFonts.registerFromPath(join(import.meta.dir, 'fonts', 'Nunito-Bold.ttf'), 'Nunito Bold');

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

const STATUS_FONT = 11;
const STATUS_LINE_H = 14;
const STATUS_PAD_X = 10;
const STATUS_PAD_Y = 6;

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
 * The custom status in a bubble beside the avatar, below the banner, with a little dot towards the avatar, as on a Discord profile.
 * A long one wraps onto a second line, as there. A theme with more than one takes turns through the loop, so each is shown.
 * @param left Where the bubble starts, right of the avatar, and `right` how far it may reach.
 * @param middle Where the middle of a bubble of one line is.
 */
function statusBubble(ctx: SKRSContext2D, name: ThemeName, left: number, right: number, middle: number, time: number) {
  const sentences = STATUSES[name];
  ctx.font = `${STATUS_FONT}px "Nunito Bold"`;
  const lines = wrap(ctx, sentences[Math.floor(time * sentences.length)]!, right - left - STATUS_PAD_X * 2, 2);
  const width = Math.max(...lines.map((line) => measureWithEmoji(ctx, line, STATUS_FONT))) + STATUS_PAD_X * 2;
  const height = lines.length * STATUS_LINE_H + STATUS_PAD_Y * 2;
  // A bubble of two lines reaches up as far as down from where one line is, so it stays clear of the name below
  const top = middle - (STATUS_LINE_H + STATUS_PAD_Y * 2) / 2 - (lines.length - 1) * (STATUS_LINE_H / 2);
  ctx.fillStyle = '#383a40';
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, Math.min(height / 2, 12));
  ctx.moveTo(left - 2 + 3.5, top - 1);
  ctx.arc(left - 2, top - 1, 3.5, 0, TAU);
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

  statusBubble(ctx, name, cx + AVATAR_D / 2 + 13, x + CELL_W - 10, cy + 15, time);

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
