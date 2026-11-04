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

/** A little pile of fallen leaves. */
function leafPile(ctx: SKRSContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const leaves = [
    [-50, -14, 1.2],
    [40, -12, -1.0],
    [-10, -30, 0.4],
    [25, -40, 2.2],
    [-35, -40, -0.6],
    [5, -58, 1.4],
  ] as const;
  leaves.forEach(([dx, dy, angle], i) => leaf(ctx, dx, dy, 30, angle, LEAF_COLORS[i % LEAF_COLORS.length]!));
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
