import type { SKRSContext2D } from '@napi-rs/canvas';

import { MID_BODY, drifting, TAU } from '../draw';
import type { Theme } from './types';

const LEAF_COLORS = ['#e8590c', '#f59f00', '#c92a2a', '#d9480f'];

/** The leaves in the pile, one after the other: colors far enough apart that neighbors can be told apart when it's small. */
const PILE_COLORS = ['#f59f00', '#d9480f', '#ffc53d', '#c92a2a'];

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
  ctx.strokeStyle = 'rgba(80,30,10,0.55)';
  ctx.lineWidth = Math.max(1.5, size * 0.08);
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.8);
  ctx.lineTo(0, size * 1.25);
  ctx.stroke();
  ctx.restore();
}

/** A pile of fallen leaves, a jumble of big leaves heaped on a dark mound, sitting down in the grass. */
function leafPile(ctx: SKRSContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.translate(x, y - 22);
  ctx.scale(scale, scale);
  // A dark mound of leaves in shadow under the ones on top, so it's a pile, not rows of leaves with the grass between them, and dark,
  // so the leaves on top stand out from it. Smaller than the pile, as the leaves around its edge stick out past it
  ctx.fillStyle = '#6e2f10';
  ctx.beginPath();
  ctx.moveTo(-96, 70);
  ctx.bezierCurveTo(-92, -10, -42, -44, 0, -44);
  ctx.bezierCurveTo(42, -44, 92, -10, 96, 70);
  ctx.closePath();
  ctx.fill();
  // Big leaves dropped at random all over the mound, at any angle, some near its edge so they stick out past it unevenly. The same
  // random every frame, so the pile doesn't change. Few and big, so they can still be told apart where Discord shows it small
  const random = (n: number) => {
    const value = Math.sin(n * 91.345 + 7.13) * 43758.5453;
    return value - Math.floor(value);
  };
  const leaves = Array.from({ length: 16 }, (_, n) => {
    // Anywhere in the dome, its top half an ellipse
    const across = random(n) * 2 - 1;
    const up = Math.sqrt(random(n + 40));
    return {
      x: across * 104,
      y: 50 - up * Math.sqrt(1 - across * across) * 96,
      size: 34 + random(n + 80) * 12,
      angle: random(n + 120) * TAU,
      color: PILE_COLORS[n % PILE_COLORS.length]!,
    };
  });
  // From the top of the pile down, so the lower ones, nearer the front, lie over the ones behind them
  leaves.sort((a, b) => a.y - b.y);
  for (const { x, y, size, angle, color } of leaves) leaf(ctx, x, y, size, angle, color);
  ctx.restore();
}

/** Autumn: a warm sky, trees turning, leaves tumbling down, golden grass and a leaf on its head. */
export const autumn: Theme = {
  sky: ['#ffcf8f', '#d9734e'],
  cloud: '#fff3e3',
  sparkles: ['#fff3e3', '#ffd36b'],
  ground: { kind: 'grass', colors: ['#7a4f22', '#a26c2c', '#c98d3c'] },
  hills: ['#e6b48a', '#c99355'],
  trees: { kind: 'round', colors: ['#6b4a35', '#e0702a'] },
  // Between the pale yellow of the cold themes and the full yellow of the warm ones
  body: MID_BODY,
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
  // A little to the left of where props stand, as it's wide and lies low, so it doesn't run into the mascot
  prop: (ctx, x, y, scale) => leafPile(ctx, x - 85, y, scale * 1.2),
  hat: (ctx, time) => leaf(ctx, 30, -176, 26, 1.1 + Math.sin(time * TAU * 3) * 0.05, '#e8590c'),
};
