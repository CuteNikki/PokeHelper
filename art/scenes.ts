import { join } from 'node:path';

import { GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';

import { cloud, grass, mascot, snow, sparkle, TAU } from './draw';
import type { Scene, Theme } from './themes/types';

// The font of the name on the banner, kept with the art
GlobalFonts.registerFromPath(join(import.meta.dir, 'fonts', 'Nunito-Black.ttf'), 'Nunito Black');

/** The avatar's size. Discord shows it tiny, so the face fills it, and the scene is only sky and a few big tufts of grass. */
export const AVATAR_SIZE = 512;
/** Twice the size Discord shows banners at, so they're sharp. */
export const BANNER_W = 1360;
export const BANNER_H = 480;

const AVATAR: Scene = { kind: 'avatar', width: AVATAR_SIZE, height: AVATAR_SIZE };
const BANNER: Scene = { kind: 'banner', width: BANNER_W, height: BANNER_H };

/** A row of the ground: grass or snow. */
function ground(ctx: SKRSContext2D, theme: Theme, row: 0 | 1 | 2, width: number, baseY: number, height: number, time: number, seed: number, blade?: number) {
  const color = theme.ground.colors[row];
  if (theme.ground.kind === 'snow') snow(ctx, width, baseY, height * 0.6, color, seed);
  else grass(ctx, width, baseY, height, color, time, seed, blade);
}

/** The avatar, drawn at any size. Props like a pumpkin are left out, as they'd only be cut off at the edge of the circle. */
export function avatar(ctx: SKRSContext2D, theme: Theme, size: number, time: number, blink = 0) {
  ctx.save();
  ctx.scale(size / AVATAR_SIZE, size / AVATAR_SIZE);
  const sky = ctx.createLinearGradient(0, 0, 0, AVATAR_SIZE);
  sky.addColorStop(0, theme.sky[0]);
  sky.addColorStop(1, theme.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  theme.backdrop?.(ctx, AVATAR, time);
  theme.life?.(ctx, AVATAR, time);

  ground(ctx, theme, 0, AVATAR_SIZE, 500, 130, time, 3, 60);
  mascot(ctx, 250, 450, 1.55, time, blink, theme.ear, theme.hat);
  ground(ctx, theme, 2, AVATAR_SIZE, 545, 120, time, 29, 66);
  ctx.restore();
}

/** The banner: sky, drifting clouds, the name, and the mascot peeking out of the ground on the right. */
export function banner(ctx: SKRSContext2D, theme: Theme, time: number, blink = 0) {
  const sky = ctx.createLinearGradient(0, 0, BANNER_W, BANNER_H);
  sky.addColorStop(0, theme.sky[1]);
  sky.addColorStop(1, theme.sky[0]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, BANNER_W, BANNER_H);
  theme.backdrop?.(ctx, BANNER, time);

  // Sparkles twinkle behind the clouds
  for (const [x, y, r, color, phase] of [
    [130, 90, 18, 0, 0],
    [960, 70, 14, 1, 0.3],
    [300, 340, 12, 1, 0.6],
    [870, 330, 16, 0, 0.15],
  ] as const) {
    sparkle(ctx, x, y, r * (0.75 + 0.25 * Math.sin((time + phase) * TAU * 6)), theme.sparkles[color]);
  }

  // Clouds drift right to left in a pattern that repeats every third of the width, and move exactly that far in a loop,
  // so it starts over without a jump
  if (theme.cloud) {
    const period = BANNER_W / 3;
    for (let copy = -1; copy <= 3; copy++) {
      const x = copy * period - time * period;
      cloud(ctx, x + 80, 55, 0.85, theme.cloud);
      cloud(ctx, x + 300, 85, 0.65, theme.cloud);
    }
  }
  theme.life?.(ctx, BANNER, time);

  ground(ctx, theme, 0, BANNER_W, BANNER_H - 30, 110, time, 3);
  mascot(ctx, 1195, BANNER_H - 10, 1.25, time, blink, theme.ear, theme.hat);
  // High enough that the grass in front only covers its bottom, and lower on snow, which lies lower than grass
  // Far enough left to stay clear of the mascot, even the wide cake
  theme.prop?.(ctx, 955, theme.ground.kind === 'snow' ? BANNER_H - 18 : BANNER_H - 58, 0.9, time);
  ground(ctx, theme, 1, BANNER_W, BANNER_H + 10, 100, time, 11);
  ground(ctx, theme, 2, BANNER_W, BANNER_H + 60, 90, time, 7);

  // The name, with a shadow so it stands out from the clouds
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = theme.titleShadow;
  ctx.shadowOffsetY = 6;
  ctx.shadowBlur = 0;
  ctx.font = '150px "Nunito Black"';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Poke Helper', 575, 245);
  ctx.shadowColor = 'transparent';
}
