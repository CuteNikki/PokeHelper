import type { SKRSContext2D } from '@napi-rs/canvas';

import { drifting, TAU } from '../draw';
import type { Scene, Theme } from './types';

/** Snow falling, in a pattern that falls exactly its own height in a loop, so it never stops. */
export function snowfall(ctx: SKRSContext2D, scene: Scene, time: number) {
  const banner = scene.kind === 'banner';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  drifting(scene.width, scene.height, time, banner ? 70 : 18, (x, y, index) => {
    ctx.beginPath();
    ctx.arc(x, y, (banner ? 2.5 : 6) + (index % 3) * (banner ? 1.2 : 2.5), 0, TAU);
    ctx.fill();
  });
}

/** A present, red with a gold ribbon and bow. */
function present(ctx: SKRSContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#d63c4a';
  ctx.fillRect(-48, -80, 96, 80);
  ctx.fillStyle = '#b52a38';
  ctx.fillRect(-54, -96, 108, 22);
  ctx.fillStyle = '#ffcb05';
  ctx.fillRect(-9, -96, 18, 96);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 18, -106, 20, 12, side * -0.5, 0, TAU);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, -100, 8, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** A Santa hat, flopping over to one side, its pompom swinging. */
function santaHat(ctx: SKRSContext2D, time: number) {
  ctx.save();
  ctx.translate(0, -162);
  const swing = Math.sin(time * TAU * 3) * 6;
  ctx.fillStyle = '#d63c4a';
  ctx.beginPath();
  ctx.moveTo(-78, 0);
  ctx.quadraticCurveTo(-60, -110, 30, -112);
  ctx.quadraticCurveTo(95 + swing, -105, 105 + swing, -55);
  ctx.quadraticCurveTo(70, -80, 78, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(-90, -16, 180, 34, 17);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(105 + swing, -50, 20, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Christmas: a snowy evening, falling snow, a present and a Santa hat. */
export const christmas: Theme = {
  sky: ['#16244f', '#3a5aa8'],
  cloud: '#8fa3d6',
  sparkles: ['#ffffff', '#ffe27a'],
  ground: { kind: 'snow', colors: ['#c9d8f5', '#e3ecfc', '#ffffff'] },
  ear: '#46507e',
  titleShadow: 'rgba(10,18,52,0.55)',
  life: snowfall,
  prop: (ctx, x, y, scale) => present(ctx, x, y, scale),
  hat: santaHat,
};
