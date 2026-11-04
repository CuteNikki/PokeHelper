import type { SKRSContext2D } from '@napi-rs/canvas';
import { TAU } from '../draw';

import type { Scene, Theme } from './types';
import { standard } from './standard';

const RAINBOW = ['#e40303', '#ff8c00', '#ffed00', '#008026', '#24408e', '#732982'];

/** A rainbow arching across the sky, soft enough that the name stays easy to read in front of it. */
function rainbow(ctx: SKRSContext2D, scene: Scene) {
  const banner = scene.kind === 'banner';
  const [x, y, outer, band] = banner ? [700, 560, 470, 24] : [256, 520, 400, 30];
  ctx.globalAlpha = banner ? 0.55 : 0.7;
  ctx.lineWidth = band;
  RAINBOW.forEach((color, i) => {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, outer - i * band, Math.PI, TAU);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

/** Pride Month: the everyday look, with a rainbow across the sky. */
export const pride: Theme = {
  ...standard,
  backdrop: rainbow,
};
