import type { SKRSContext2D } from '@napi-rs/canvas';

import { TAU } from './draw';
import { animatedGif } from './gif';
import { avatar, BANNER_H, BANNER_W, banner } from './scenes';
import type { ThemeName } from './themes';
import { THEMES } from './themes';

/**
 * Every theme at once in one GIF, each as a little profile with its banner and avatar, to show them to people who can't open the
 * preview page. The whole loop, and still small enough to send on Discord.
 */

const COLUMNS = 3;
const GAP = 16;
const CELL_W = 300;
const BANNER_SHOWN_H = Math.round((CELL_W * BANNER_H) / BANNER_W);
const AVATAR_D = 72;
const LABEL_H = 28;
const CELL_H = LABEL_H + BANNER_SHOWN_H + AVATAR_D / 2 + 34;
const FRAMES = 120;
const DELAY = 80;
/** Closed eyes at the same moments as in the real loop. */
const blinkAt = (frame: number) => (frame === 35 || frame === 36 || frame === 95 || frame === 96 ? 1 : 0);

/** Theme names as people read them, like `newYear` as New Year. */
const title = (name: string) => name.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());

function cell(ctx: SKRSContext2D, name: ThemeName, x: number, y: number, time: number, blink: number) {
  const theme = THEMES[name];
  ctx.fillStyle = '#dbdee1';
  ctx.font = '20px "Nunito Black"';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title(name), x, y + 20);

  const top = y + LABEL_H;
  ctx.fillStyle = '#232428';
  ctx.beginPath();
  ctx.roundRect(x, top, CELL_W, CELL_H - LABEL_H, 10);
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

  ctx.fillStyle = '#f2f3f5';
  ctx.font = '16px "Nunito Black"';
  ctx.fillText('Poke Helper', x + 14, cy + AVATAR_D / 2 + 24);
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
