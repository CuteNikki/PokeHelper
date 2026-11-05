import type { SKRSContext2D } from '@napi-rs/canvas';

import { BOW, bow, drifting, heart, TAU } from '../draw';
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

/** A heart-shaped balloon on a string tied down in the grass, bobbing and swaying in the breeze. */
function heartBalloon(ctx: SKRSContext2D, x: number, y: number, scale: number, time: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const sway = Math.sin(time * TAU * 2) * 10;
  // Big, as the main thing next to the mascot, its point where the string is tied
  const size = 100;
  // High enough to be seen well, even if it goes a little behind the name
  const top = -200 + Math.sin(time * TAU * 3) * 6;
  // The string goes down into the grass from a bow above it, as if tied to a peg
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -BOW);
  ctx.quadraticCurveTo(sway * 0.3 - 10, (top + size * 0.6 - BOW) / 2, sway, top + size * 0.6);
  ctx.stroke();
  heart(ctx, sway, top, size, '#ff4f86');
  // A shine on the balloon
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(sway - size * 0.4, top - size * 0.3, size * 0.15, size * 0.24, -0.5, 0, TAU);
  ctx.fill();
  // White, as pink like the balloon it was lost against it
  bow(ctx, 0, -BOW, '#ffffff');
  ctx.restore();
}

/** Valentine's Day: a soft pink sky with hearts floating up, trees in pink, red and pink flowers, a heart balloon and heart boppers. */
export const valentines: Theme = {
  sky: ['#ffc6dc', '#ee6f9e'],
  cloud: '#fff5f9',
  sparkles: ['#ffffff', '#ff4f86'],
  ground: { kind: 'grass', colors: ['#3f9a5e', '#56b874', '#79d391'] },
  // Warm sunlight on the mascot and the prop, so it doesn't look pale against the cool sky
  light: { color: '#ffb066', amount: 0.1 },
  hills: ['#f2c4d4', '#9fd0a0'],
  trees: { kind: 'round', colors: ['#8a5a4a', '#e0507e'] },
  flowers: { colors: ['#ff4f86', '#ffffff', '#ffb3c9'], center: '#ffe066' },
  prop: heartBalloon,
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
