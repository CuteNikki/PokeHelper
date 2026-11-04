import type { SKRSContext2D } from '@napi-rs/canvas';

import { drifting, heart, TAU } from '../draw';
import type { Theme } from './types';

/** A headband with two hearts on springs, wobbling. */
function heartBoppers(ctx: SKRSContext2D, time: number) {
  ctx.strokeStyle = '#d6336c';
  ctx.lineWidth = 8;
  ctx.beginPath();
  // Along the top of its head, which is at y -175 in the middle and lower to the sides
  ctx.moveTo(-80, -150);
  ctx.quadraticCurveTo(0, -200, 80, -150);
  ctx.stroke();
  for (const side of [-1, 1]) {
    const wobble = Math.sin(time * TAU * 6 + side) * 8;
    ctx.lineWidth = 4;
    ctx.beginPath();
    // From the band, which is at about y -170 there
    ctx.moveTo(side * 34, -168);
    ctx.quadraticCurveTo(side * 44 + wobble, -200, side * 40 + wobble, -226);
    ctx.stroke();
    heart(ctx, side * 40 + wobble, -236, 22, '#ff4f86');
  }
}

/** Valentine's Day: a soft pink sky with hearts floating up, and heart boppers. */
export const valentines: Theme = {
  sky: ['#ffc6dc', '#ee6f9e'],
  cloud: '#fff5f9',
  sparkles: ['#ffffff', '#ff4f86'],
  ground: { kind: 'grass', colors: ['#3f9a5e', '#56b874', '#79d391'] },
  ear: '#46507e',
  titleShadow: 'rgba(140,20,70,0.35)',
  life: (ctx, scene, time) => {
    const banner = scene.kind === 'banner';
    drifting(
      scene.width,
      scene.height,
      time,
      banner ? 16 : 5,
      (x, y, index) => heart(ctx, x, y, (banner ? 12 : 22) + (index % 3) * 4, index % 2 ? 'rgba(255,79,134,0.75)' : 'rgba(255,255,255,0.8)'),
      -1,
      14,
    );
  },
  hat: heartBoppers,
};
