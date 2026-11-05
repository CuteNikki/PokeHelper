import type { SKRSContext2D } from '@napi-rs/canvas';

import { BOW, bow, partyHat, TAU } from '../draw';
import { standard } from './standard';
import type { Theme } from './types';

/** A cake with frosting dripping down and a candle whose flame flickers. */
function cake(ctx: SKRSContext2D, x: number, y: number, scale: number, time: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#f7c59f';
  ctx.beginPath();
  ctx.roundRect(-58, -70, 116, 70, 10);
  ctx.fill();
  ctx.fillStyle = '#ff8fab';
  ctx.beginPath();
  ctx.moveTo(-60, -60);
  // Six drips across the width of the cake, the last ending at its right edge
  for (let i = 0; i < 6; i++) {
    const dx = -60 + i * 20;
    ctx.quadraticCurveTo(dx + 5, -40 - (i % 2) * 10, dx + 10, -58);
    ctx.lineTo(dx + 20, -60);
  }
  ctx.lineTo(60, -76);
  ctx.quadraticCurveTo(60, -84, 50, -84);
  ctx.lineTo(-50, -84);
  ctx.quadraticCurveTo(-60, -84, -60, -76);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-5, -122, 10, 40);
  const flicker = Math.sin(time * TAU * 9) * 2;
  ctx.fillStyle = '#ffb703';
  ctx.beginPath();
  ctx.ellipse(0, -132, 7 + flicker * 0.3, 13 + flicker, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff3b0';
  ctx.beginPath();
  ctx.ellipse(0, -129, 3, 6, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** A bunch of three balloons on strings tied down in the grass, bobbing each at its own pace. */
function balloons(ctx: SKRSContext2D, x: number, y: number, scale: number, time: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  // The strings come together in a bow above the grass, and go on down into it as one, as if tied to a peg
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -BOW);
  ctx.stroke();
  for (const [dx, height, color, phase] of [
    [-72, 150, '#3fa7ff', 0],
    [66, 158, '#ff6fae', 1.2],
    [-4, 182, '#ffd23f', 2.4],
  ] as const) {
    const bx = dx + Math.sin(time * TAU * 2 + phase) * 6;
    const by = -height + Math.sin(time * TAU * 3 + phase) * 5;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -BOW);
    ctx.quadraticCurveTo(bx * 0.4, (by + 46 - BOW) / 2, bx, by + 46);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(bx, by, 34, 42, 0, 0, TAU);
    ctx.fill();
    // The knot
    ctx.beginPath();
    ctx.moveTo(bx, by + 40);
    ctx.lineTo(bx - 7, by + 49);
    ctx.lineTo(bx + 7, by + 49);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(bx - 12, by - 15, 8, 13, -0.4, 0, TAU);
    ctx.fill();
  }
  bow(ctx, 0, -BOW, '#ff6fae');
  ctx.restore();
}

/** The bot's birthday: the everyday look, with a cake, balloons and a party hat. */
export const birthday: Theme = {
  ...standard,
  sparkles: ['#ffffff', '#ff8fd1'],
  // None of the flowers of the everyday look: with the cake and the balloons, it was too busy
  flowers: undefined,
  prop: (ctx, x, y, scale, time) => {
    balloons(ctx, x - 150, y, scale * 1.3, time);
    cake(ctx, x, y, scale, time);
  },
  // Pink, as a blue hat was lost against the blue sky
  hat: (ctx, time) => partyHat(ctx, time, ['#ff6fae', '#ffffff', '#ffd23f']),
};
