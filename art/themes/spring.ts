import type { SKRSContext2D } from '@napi-rs/canvas';

import { drifting, TAU } from '../draw';
import type { Theme } from './types';

/** A small five-petaled flower. */
function flower(ctx: SKRSContext2D, x: number, y: number, r: number, petal: string, center: string) {
  ctx.fillStyle = petal;
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * TAU - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * r, y + Math.sin(angle) * r, r * 0.75, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = center;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.6, 0, TAU);
  ctx.fill();
}

/** Three tulips in the grass, swaying a little. */
function tulips(ctx: SKRSContext2D, x: number, y: number, scale: number, time: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  for (const [dx, height, color] of [
    [-34, 110, '#ff6f91'],
    [0, 140, '#ffd23f'],
    [34, 100, '#c77dff'],
  ] as const) {
    const sway = Math.sin(time * TAU * 3 + dx) * 4;
    ctx.strokeStyle = '#3f8f4f';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(dx, 0);
    ctx.quadraticCurveTo(dx + sway * 0.5, -height / 2, dx + sway, -height);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(dx + sway - 18, -height - 6);
    ctx.lineTo(dx + sway - 18, -height - 34);
    ctx.lineTo(dx + sway - 6, -height - 24);
    ctx.lineTo(dx + sway, -height - 38);
    ctx.lineTo(dx + sway + 6, -height - 24);
    ctx.lineTo(dx + sway + 18, -height - 34);
    ctx.lineTo(dx + sway + 18, -height - 6);
    ctx.quadraticCurveTo(dx + sway, -height + 8, dx + sway - 18, -height - 6);
    ctx.fill();
  }
  ctx.restore();
}

/** A crown of flowers across the top of its head. */
function flowerCrown(ctx: SKRSContext2D) {
  const colors = ['#ff8fab', '#ffffff', '#ffd23f', '#ffffff', '#ff8fab'];
  colors.forEach((color, i) => {
    const x = -76 + i * 38;
    // Following the curve of its head
    const y = -150 - (1 - (x / 90) ** 2) * 22;
    flower(ctx, x, y, 11, color, '#ffb703');
  });
}

/** Spring: a fresh sky, cherry blossom petals drifting down, tulips and a flower crown. */
export const spring: Theme = {
  sky: ['#9ecbff', '#5d8ff0'],
  cloud: '#ffffff',
  sparkles: ['#ffffff', '#ffb7d5'],
  ground: { kind: 'grass', colors: ['#3f9a52', '#5bbf6a', '#7fd88a'] },
  ear: '#46507e',
  titleShadow: 'rgba(30,50,120,0.35)',
  life: (ctx, scene, time) => {
    const banner = scene.kind === 'banner';
    drifting(
      scene.width,
      scene.height,
      time,
      banner ? 34 : 8,
      (x, y, index) => {
        ctx.save();
        ctx.translate(x, y);
        // Tumbling as they fall, a whole number of turns a loop
        ctx.rotate(index + time * TAU * (index % 2 ? 2 : -2));
        ctx.fillStyle = index % 3 ? '#ffc2d6' : '#ffe4ee';
        ctx.beginPath();
        ctx.ellipse(0, 0, banner ? 9 : 16, banner ? 5 : 9, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      },
      1,
      28,
    );
  },
  prop: tulips,
  hat: flowerCrown,
};
