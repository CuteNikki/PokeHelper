import type { SKRSContext2D } from '@napi-rs/canvas';

import { drifting, TAU } from '../draw';
import type { Theme } from './types';

const LEAF_COLORS = ['#e8590c', '#f59f00', '#c92a2a', '#d9480f'];

/** A leaf, pointed at both ends, with a vein down the middle. */
function leaf(ctx: SKRSContext2D, x: number, y: number, size: number, angle: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(size * 0.8, 0, 0, size);
  ctx.quadraticCurveTo(-size * 0.8, 0, 0, -size);
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,30,10,0.45)';
  ctx.lineWidth = Math.max(1.5, size * 0.08);
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.8);
  ctx.lineTo(0, size * 1.25);
  ctx.stroke();
  ctx.restore();
}

/**
 * A little pile of fallen leaves: a low mound of leaves lying mostly flat, the bottom row widest. Drawn lower than other props, as
 * it's flat and sits down in the grass rather than standing in it.
 */
function leafPile(ctx: SKRSContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.translate(x, y + 40);
  ctx.scale(scale, scale);
  // From the bottom row up, so the higher leaves lie on the lower ones. Lying flat is a quarter turn, as a leaf points up
  // The lowest rows reach down to the bottom of the banner, behind the grass in front, so the pile doesn't end in mid-air
  const rows = [
    { y: 40, xs: [-96, -64, -32, 0, 32, 64, 96] },
    { y: 24, xs: [-84, -52, -20, 12, 44, 76] },
    { y: 8, xs: [-76, -44, -12, 20, 52, 82] },
    { y: -8, xs: [-66, -33, 0, 33, 66] },
    { y: -24, xs: [-46, -14, 18, 50] },
    { y: -40, xs: [-28, 6, 34] },
    { y: -54, xs: [-8, 18] },
  ];
  let i = 0;
  for (const row of rows) {
    for (const dx of row.xs) {
      const tilt = ((i * 37) % 9) / 9 - 0.5;
      leaf(ctx, dx, row.y, 24, Math.PI / 2 + tilt * 0.9 + (i % 2 ? Math.PI : 0), LEAF_COLORS[i % LEAF_COLORS.length]!);
      i++;
    }
  }
  ctx.restore();
}

/** Autumn: a warm sky, leaves tumbling down, golden grass and a leaf on its head. */
export const autumn: Theme = {
  sky: ['#ffcf8f', '#d9734e'],
  cloud: '#fff3e3',
  sparkles: ['#fff3e3', '#ffd36b'],
  ground: { kind: 'grass', colors: ['#7a4f22', '#a26c2c', '#c98d3c'] },
  ear: '#46507e',
  titleShadow: 'rgba(110,40,15,0.45)',
  life: (ctx, scene, time) => {
    const banner = scene.kind === 'banner';
    drifting(
      scene.width,
      scene.height,
      time,
      banner ? 22 : 6,
      (x, y, index) => leaf(ctx, x, y, banner ? 11 : 20, index + time * TAU * (index % 2 ? 1 : -1), LEAF_COLORS[index % LEAF_COLORS.length]!),
      1,
      30,
    );
  },
  prop: (ctx, x, y, scale) => leafPile(ctx, x, y, scale),
  hat: (ctx, time) => leaf(ctx, 30, -176, 26, 1.1 + Math.sin(time * TAU * 3) * 0.05, '#e8590c'),
};
