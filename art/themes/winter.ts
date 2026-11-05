import type { SKRSContext2D } from '@napi-rs/canvas';

import { PALE_BODY, sparkle, TAU } from '../draw';
import { snowfall } from './christmas';
import type { Scene, Theme } from './types';

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
  // Stick arms, reaching out from its middle
  ctx.strokeStyle = '#6b4a35';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 38, -60);
    ctx.lineTo(side * 60, -80);
    ctx.moveTo(side * 53, -75);
    ctx.lineTo(side * 55, -88);
    ctx.stroke();
  }
  // Coal buttons
  ctx.fillStyle = '#2d1b3d';
  for (const dy of [-58, -38]) {
    ctx.beginPath();
    ctx.arc(0, dy, 4.5, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#3fa7a0';
  ctx.beginPath();
  ctx.roundRect(-30, -88, 60, 14, 7);
  ctx.fill();
  ctx.fillRect(10, -80, 14, 34);
  // A little top hat, a bit crooked
  ctx.save();
  ctx.translate(0, -140);
  ctx.rotate(-0.12);
  ctx.fillStyle = '#2d1b3d';
  ctx.fillRect(-26, -4, 52, 8);
  ctx.fillRect(-17, -36, 34, 34);
  ctx.fillStyle = '#d63c4a';
  ctx.fillRect(-17, -12, 34, 7);
  ctx.restore();
  // Shade on its right, as the light comes from the left
  ctx.fillStyle = 'rgba(120,150,210,0.18)';
  for (const [dy, r] of [
    [-42, 46],
    [-112, 32],
  ] as const) {
    ctx.beginPath();
    ctx.arc(0, dy, r, -1.2, 1.6);
    ctx.arc(-r * 0.25, dy, r * 0.85, 1.6, -1.2, true);
    ctx.fill();
  }
  ctx.restore();
}

/** Snow glinting here and there on the drifts on the banner. */
function glints(ctx: SKRSContext2D, scene: Scene, time: number) {
  if (scene.kind !== 'banner') return;
  for (const [x, y, phase] of [
    [480, 410, 0],
    [640, 420, 0.4],
    [820, 405, 0.7],
    [150, 412, 0.2],
  ] as const) {
    const size = 13 * Math.max(0, Math.sin((time + phase) * TAU * 3));
    // A pale blue edge, so they show on the white snow
    sparkle(ctx, x, y, size * 1.35, '#9fb6e8');
    sparkle(ctx, x, y, size, '#ffffff');
  }
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

/** Winter: a pale snowy day, snowy pines, falling snow, glinting drifts, a snowman and earmuffs. */
export const winter: Theme = {
  sky: ['#c7dcff', '#7c9fe0'],
  cloud: '#ffffff',
  sparkles: ['#ffffff', '#bfe3ff'],
  ground: { kind: 'snow', colors: ['#c9d8f5', '#e3ecfc', '#ffffff'] },
  hills: ['#dbe6fb', '#c4d4f2'],
  trees: { kind: 'pine', colors: ['#6b4a35', '#3f7a6a'] },
  details: glints,
  // A paler yellow, which fits its softer light
  body: PALE_BODY,
  ear: '#46507e',
  titleShadow: 'rgba(40,60,120,0.4)',
  life: snowfall,
  // Further left than other props, clear of the mascot, as it stands on its own, and big, its hat almost up to the name
  prop: (ctx, x, y, scale) => snowman(ctx, x - 80, y, scale * 1.25),
  hat: earmuffs,
};
