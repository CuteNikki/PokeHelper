import type { SKRSContext2D } from '@napi-rs/canvas';

import { PALE_BODY, drifting, stars, TAU } from '../draw';
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

/** A present with a ribbon and bow, red with gold unless other colors are given: the box, its lid and the ribbon. */
function present(ctx: SKRSContext2D, x: number, y: number, scale: number, colors = ['#d63c4a', '#b52a38', '#ffcb05']) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = colors[0]!;
  ctx.fillRect(-48, -80, 96, 80);
  ctx.fillStyle = colors[1]!;
  ctx.fillRect(-54, -96, 108, 22);
  ctx.fillStyle = colors[2]!;
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

/** A candy cane stuck in the snow, striped red and white. */
function candyCane(ctx: SKRSContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.rotate(0.12);
  const cane = () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -110);
    ctx.arc(-20, -110, 20, 0, Math.PI, true);
  };
  ctx.lineCap = 'round';
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#ffffff';
  cane();
  ctx.stroke();
  ctx.strokeStyle = '#d63c4a';
  ctx.setLineDash([12, 12]);
  ctx.lineCap = 'butt';
  cane();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** Christmas: a starry, snowy evening, snowy pines, falling snow, presents, a candy cane and a Santa hat. */
export const christmas: Theme = {
  sky: ['#16244f', '#3a5aa8'],
  cloud: '#8fa3d6',
  sparkles: ['#ffffff', '#ffe27a'],
  ground: { kind: 'snow', colors: ['#c9d8f5', '#e3ecfc', '#ffffff'] },
  hills: ['#5f78b8', '#93a9de'],
  trees: { kind: 'pine', colors: ['#4a3528', '#2f5d50'] },
  // Warm, like light from the windows, so it doesn't look blue in the evening
  light: { color: '#a07a8c', amount: 0.12 },
  // A paler yellow, which fits its softer light
  body: PALE_BODY,
  ear: '#46507e',
  titleShadow: 'rgba(10,18,52,0.55)',
  backdrop: stars,
  life: snowfall,
  prop: (ctx, x, y, scale) => {
    candyCane(ctx, x - 150, y + 6, scale * 0.8);
    present(ctx, x - 92, y + 4, scale * 0.62, ['#3f9a6a', '#2f7d55', '#ff5d6c']);
    present(ctx, x, y, scale);
  },
  hat: santaHat,
};
