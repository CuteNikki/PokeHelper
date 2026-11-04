import type { SKRSContext2D } from '@napi-rs/canvas';

import { TAU } from '../draw';
import { snowfall } from './christmas';
import type { Theme } from './types';

/** A little snowman with coal eyes, a carrot nose and a scarf. */
function snowman(ctx: SKRSContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  for (const [dy, r] of [
    [-42, 46],
    [-112, 32],
  ] as const) {
    ctx.beginPath();
    ctx.arc(0, dy, r, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#2d1b3d';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * 11, -120, 4.5, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#ff8c1a';
  ctx.beginPath();
  ctx.moveTo(0, -112);
  ctx.lineTo(24, -106);
  ctx.lineTo(0, -102);
  ctx.fill();
  ctx.fillStyle = '#3fa7a0';
  ctx.beginPath();
  ctx.roundRect(-30, -88, 60, 14, 7);
  ctx.fill();
  ctx.fillRect(10, -80, 14, 34);
  ctx.restore();
}

/** Fluffy earmuffs, a band over its head and a muff on each ear. */
function earmuffs(ctx: SKRSContext2D) {
  ctx.strokeStyle = '#3fa7a0';
  ctx.lineWidth = 12;
  ctx.beginPath();
  // Resting on top of its head, which is at y -175 in the middle
  ctx.moveTo(-78, -152);
  ctx.quadraticCurveTo(0, -198, 78, -152);
  ctx.stroke();
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#ff9fb8';
    ctx.beginPath();
    ctx.arc(side * 80, -150, 26, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffc2d1';
    ctx.beginPath();
    ctx.arc(side * 75, -155, 11, 0, TAU);
    ctx.fill();
  }
}

/** Winter: a pale snowy day, falling snow, a snowman and earmuffs. */
export const winter: Theme = {
  sky: ['#c7dcff', '#7c9fe0'],
  cloud: '#ffffff',
  sparkles: ['#ffffff', '#bfe3ff'],
  ground: { kind: 'snow', colors: ['#c9d8f5', '#e3ecfc', '#ffffff'] },
  ear: '#46507e',
  titleShadow: 'rgba(40,60,120,0.4)',
  life: snowfall,
  prop: (ctx, x, y, scale) => snowman(ctx, x, y, scale),
  hat: earmuffs,
};
