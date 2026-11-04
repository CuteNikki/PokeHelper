import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';

import { encodeGif } from './gif';
import { avatar, AVATAR_SIZE, BANNER_H, BANNER_W, banner } from './scenes';
import type { Theme } from './themes/types';

/** One loop: 120 frames at 80ms is 9.6 seconds, long enough for clouds to drift slowly. */
const FRAMES = 120;
const DELAY = 80;
/** The banner at 1.5 times the size Discord shows it: sharp enough, and a small enough file. */
const BANNER_FILE_W = 1020;
const BANNER_FILE_H = 360;

/** Closed eyes for two frames, twice a loop. */
const blinkAt = (frame: number) => (frame === 35 || frame === 36 || frame === 95 || frame === 96 ? 1 : 0);

/** Every frame of a loop, as their pixels. */
function frames(width: number, height: number, draw: (ctx: SKRSContext2D, time: number, blink: number) => void): Uint8ClampedArray[] {
  return Array.from({ length: FRAMES }, (_, frame) => {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    draw(ctx, frame / FRAMES, blinkAt(frame));
    return ctx.getImageData(0, 0, width, height).data;
  });
}

/** The animated avatar of a theme. */
export const avatarGif = (theme: Theme) =>
  encodeGif(
    frames(AVATAR_SIZE, AVATAR_SIZE, (ctx, time, blink) => avatar(ctx, theme, AVATAR_SIZE, time, blink)),
    AVATAR_SIZE,
    AVATAR_SIZE,
    DELAY,
  );

/** The animated banner of a theme. */
export const bannerGif = (theme: Theme) =>
  encodeGif(
    frames(BANNER_FILE_W, BANNER_FILE_H, (ctx, time, blink) => {
      ctx.scale(BANNER_FILE_W / BANNER_W, BANNER_FILE_H / BANNER_H);
      banner(ctx, theme, time, blink);
    }),
    BANNER_FILE_W,
    BANNER_FILE_H,
    DELAY,
  );

/** The app icon: a still of the avatar, at twice its size, as Discord wants at least 512. */
export function iconPng(theme: Theme): Buffer {
  const canvas = createCanvas(AVATAR_SIZE * 2, AVATAR_SIZE * 2);
  avatar(canvas.getContext('2d'), theme, AVATAR_SIZE * 2, 0);
  return canvas.toBuffer('image/png');
}
