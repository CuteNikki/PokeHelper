import type { SKRSContext2D } from '@napi-rs/canvas';

import { drifting, partyHat, TAU } from '../draw';
import { standard } from './standard';
import type { Theme } from './types';

const CONFETTI = ['#ff6fae', '#ffd23f', '#3fa7ff', '#69db7c', '#b28dff'];

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
  for (let i = 0; i <= 6; i++) {
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

/** The bot's birthday: the everyday look with confetti falling, a cake, and a party hat. */
export const birthday: Theme = {
  ...standard,
  sparkles: ['#ffffff', '#ff8fd1'],
  life: (ctx, scene, time) => {
    const banner = scene.kind === 'banner';
    drifting(
      scene.width,
      scene.height,
      time,
      banner ? 50 : 12,
      (x, y, index) => {
        ctx.save();
        ctx.translate(x, y);
        // Flipping as it falls, a whole number of turns a loop
        ctx.rotate(index + time * TAU * (index % 2 ? 3 : -3));
        ctx.fillStyle = CONFETTI[index % CONFETTI.length]!;
        const size = banner ? 1 : 1.8;
        ctx.fillRect(-6 * size, -3 * size, 12 * size, 6 * size);
        ctx.restore();
      },
      1,
      18,
    );
  },
  prop: cake,
  hat: (ctx, time) => partyHat(ctx, time, ['#3fa7ff', '#ffd23f', '#ff6fae']),
};
