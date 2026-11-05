import type { SKRSContext2D } from '@napi-rs/canvas';

import { butterflies, TAU } from '../draw';
import type { Scene, Theme } from './types';

/** A painted egg with a zigzag band. */
function egg(ctx: SKRSContext2D, x: number, y: number, size: number, angle: number, color: string, band: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const shape = () => {
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.75, size, 0, 0, TAU);
  };
  shape();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.save();
  shape();
  ctx.clip();
  ctx.fillStyle = band;
  ctx.beginPath();
  ctx.moveTo(-size, -size * 0.05);
  for (let i = 0; i <= 8; i++) ctx.lineTo(-size + (i * size) / 4, i % 2 ? -size * 0.25 : -size * 0.05);
  ctx.lineTo(size, size * 0.2);
  for (let i = 8; i >= 0; i--) ctx.lineTo(-size + (i * size) / 4, i % 2 ? size * 0.0 : size * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

/** A woven basket with a handle, and three eggs peeking out of it. */
function basket(ctx: SKRSContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // The handle, behind the eggs
  ctx.strokeStyle = '#a0612b';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(-58, -78);
  ctx.bezierCurveTo(-56, -170, 56, -170, 58, -78);
  ctx.stroke();

  // The eggs, their bottoms hidden in the basket. Colors that stand out from the sky and the grass
  egg(ctx, -32, -96, 30, -0.3, '#ff9f43', '#ffffff');
  egg(ctx, 32, -94, 28, 0.25, '#ffc9de', '#ffd43b');
  egg(ctx, 0, -104, 33, 0, '#d0bfff', '#69db7c');

  // The basket, a bowl wider at the top, with a rim and woven rows
  const bowl = () => {
    ctx.beginPath();
    ctx.moveTo(-70, -84);
    ctx.lineTo(70, -84);
    ctx.quadraticCurveTo(66, 0, 40, 0);
    ctx.lineTo(-40, 0);
    ctx.quadraticCurveTo(-66, 0, -70, -84);
    ctx.closePath();
  };
  bowl();
  ctx.fillStyle = '#c98a4b';
  ctx.fill();
  ctx.save();
  bowl();
  ctx.clip();
  ctx.strokeStyle = '#a0612b';
  ctx.lineWidth = 4;
  for (let row = -64; row < 0; row += 18) {
    ctx.beginPath();
    ctx.moveTo(-80, row);
    ctx.lineTo(80, row);
    ctx.stroke();
  }
  for (let column = -60; column <= 60; column += 20) {
    ctx.beginPath();
    ctx.moveTo(column, -84);
    ctx.lineTo(column * 0.7, 0);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#a0612b';
  ctx.beginPath();
  ctx.roundRect(-76, -92, 152, 16, 8);
  ctx.fill();
  ctx.restore();
}

/** A fluffy chick sitting on its head, bobbing along. */
function chick(ctx: SKRSContext2D, time: number) {
  ctx.save();
  ctx.translate(0, -198 - Math.abs(Math.sin(time * TAU * 3)) * 4);
  ctx.fillStyle = '#ffd43b';
  ctx.beginPath();
  ctx.arc(0, 0, 32, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-24, 6, 12, 18, 0.6, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-6, -30);
  ctx.quadraticCurveTo(0, -46, 6, -30);
  ctx.fill();
  ctx.fillStyle = '#2d1b3d';
  ctx.beginPath();
  ctx.arc(10, -6, 4.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ff8c1a';
  ctx.beginPath();
  ctx.moveTo(26, 0);
  ctx.lineTo(40, 4);
  ctx.lineTo(26, 9);
  ctx.fill();
  ctx.restore();
}

/**
 * Eggs for an egg hunt at the very front, in front of the grass and cut off by the bottom edge, as near as the basket, so they lie in
 * the grass instead of seeming to float on top of it further back. In the gaps between the flowers. Only on the banner: on the avatar,
 * the corners where they'd fit are cut off by its circle.
 */
function hiddenEggs(ctx: SKRSContext2D, scene: Scene) {
  if (scene.kind !== 'banner') return;
  for (const [x, y, size, angle, color, band] of [
    [620, 468, 26, -0.3, '#ff9f43', '#ffffff'],
    [780, 472, 24, 0.4, '#74c0fc', '#ffd43b'],
    [905, 466, 26, -0.2, '#ffc9de', '#69db7c'],
  ] as const) {
    egg(ctx, x, y, size, angle, color, band);
  }
}

/** Easter: a soft spring sky, butterflies, eggs hidden in the grass, a basket of painted eggs, and a chick on its head. */
export const easter: Theme = {
  sky: ['#b3e1ff', '#6fa8f0'],
  cloud: '#ffffff',
  sparkles: ['#ffffff', '#fff07a'],
  ground: { kind: 'grass', colors: ['#3f9a52', '#5bbf6a', '#7fd88a'] },
  // Warm sunlight on the mascot and the prop, so it doesn't look pale against the cool sky
  light: { color: '#ffb066', amount: 0.1 },
  hills: ['#b8dfcc', '#86cc95'],
  trees: { kind: 'round', colors: ['#7a5a45', '#69c07d'] },
  // Only a few, with the eggs in the gaps between them
  flowers: { colors: ['#ffffff', '#ffe066'], count: 4 },
  details: hiddenEggs,
  life: (ctx, scene, time) => butterflies(ctx, scene, time, ['#ffd43b', '#d0bfff', '#ffc9de']),
  ear: '#46507e',
  titleShadow: 'rgba(30,60,130,0.35)',
  prop: (ctx, x, y, scale) => basket(ctx, x, y, scale),
  hat: chick,
};
