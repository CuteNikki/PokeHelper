import type { SKRSContext2D } from '@napi-rs/canvas';

import { TAU } from '../draw';
import type { Theme } from './types';

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

/** Three eggs in the grass. */
function eggs(ctx: SKRSContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  egg(ctx, -42, -40, 34, -0.3, '#a5d8ff', '#ffffff');
  egg(ctx, 40, -38, 32, 0.25, '#ffc9de', '#ffd43b');
  egg(ctx, 0, -48, 38, 0, '#d0bfff', '#69db7c');
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

/** Easter: a soft spring sky, painted eggs in the grass, and a chick on its head. */
export const easter: Theme = {
  sky: ['#b3e1ff', '#6fa8f0'],
  cloud: '#ffffff',
  sparkles: ['#ffffff', '#fff07a'],
  ground: { kind: 'grass', colors: ['#3f9a52', '#5bbf6a', '#7fd88a'] },
  ear: '#46507e',
  titleShadow: 'rgba(30,60,130,0.35)',
  prop: (ctx, x, y, scale) => eggs(ctx, x, y, scale),
  hat: chick,
};
