import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';

import { animatedGif } from './gif';
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

/** A loop of a picture, drawn at a moment from 0 to 1 and with its eyes open or closed. */
const loop = (width: number, height: number, draw: (ctx: SKRSContext2D, time: number, blink: number) => void) =>
  animatedGif(width, height, FRAMES, DELAY, (ctx, frame) => draw(ctx, frame / FRAMES, blinkAt(frame)));

/** The animated avatar of a theme. Takes a few seconds. */
export const avatarGif = (theme: Theme) => loop(AVATAR_SIZE, AVATAR_SIZE, (ctx, time, blink) => avatar(ctx, theme, AVATAR_SIZE, time, blink));

/** The animated banner of a theme. Takes a few seconds. */
export const bannerGif = (theme: Theme) =>
  loop(BANNER_FILE_W, BANNER_FILE_H, (ctx, time, blink) => {
    ctx.scale(BANNER_FILE_W / BANNER_W, BANNER_FILE_H / BANNER_H);
    banner(ctx, theme, time, blink);
  });

/** The app icon: a still of the avatar, at twice its size, as Discord wants at least 512. */
export function iconPng(theme: Theme): Buffer {
  const canvas = createCanvas(AVATAR_SIZE * 2, AVATAR_SIZE * 2);
  avatar(canvas.getContext('2d'), theme, AVATAR_SIZE * 2, 0);
  return canvas.toBuffer('image/png');
}

/** A still of the banner, at the size it's drawn at, twice the size Discord shows it, for where a picture can't move. */
export function bannerPng(theme: Theme): Buffer {
  const canvas = createCanvas(BANNER_W, BANNER_H);
  banner(canvas.getContext('2d'), theme, 0);
  return canvas.toBuffer('image/png');
}
