import type { SKRSContext2D } from '@napi-rs/canvas';

import { TAU } from '../draw';
import type { Theme } from './types';

/** The sun, its rays turning slowly: one ray's width a loop, so the loop has no jump. */
function sun(ctx: SKRSContext2D, x: number, y: number, r: number, time: number) {
  const rays = 10;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((time * TAU) / rays);
  ctx.fillStyle = 'rgba(255,224,102,0.55)';
  for (let i = 0; i < rays; i++) {
    ctx.save();
    ctx.rotate((i / rays) * TAU);
    ctx.beginPath();
    ctx.moveTo(-r * 0.22, -r * 1.15);
    ctx.lineTo(0, -r * 1.7);
    ctx.lineTo(r * 0.22, -r * 1.15);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  ctx.fillStyle = '#ffe066';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff3b0';
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, TAU);
  ctx.fill();
}

/** A striped beach ball, bobbing a little. */
function beachBall(ctx: SKRSContext2D, x: number, y: number, scale: number, time: number) {
  const r = 64;
  ctx.save();
  ctx.translate(x, y - r - Math.abs(Math.sin(time * TAU * 3)) * 8);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (const [angle, color] of [
    [0, '#ff5d5d'],
    [TAU / 3, '#3fa7ff'],
    [(TAU * 2) / 3, '#ffd23f'],
  ] as const) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, angle - 0.5, angle + 0.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Sunglasses over its eyes, with a glint. */
function sunglasses(ctx: SKRSContext2D) {
  ctx.fillStyle = '#1d1b2f';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.roundRect(side * 42 - 28, -112, 56, 36, 14);
    ctx.fill();
  }
  ctx.strokeStyle = '#1d1b2f';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-14, -100);
  ctx.quadraticCurveTo(0, -108, 14, -100);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 42 - 14, -102);
    ctx.lineTo(side * 42 - 4, -106);
    ctx.stroke();
  }
}

/** A gull gliding, a soft curved v, its wings rising and falling with flap from -1 to 1. */
function gull(ctx: SKRSContext2D, x: number, y: number, size: number, flap: number) {
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = size * 0.22;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - size, y - flap * size * 0.35);
  ctx.quadraticCurveTo(x - size * 0.45, y - size * 0.5, x, y);
  ctx.quadraticCurveTo(x + size * 0.45, y - size * 0.5, x + size, y - flap * size * 0.35);
  ctx.stroke();
}

/** Summer: a bright sky with the sun and gulls gliding by, a beach ball and sunglasses. */
export const summer: Theme = {
  sky: ['#86d8ff', '#2b8be0'],
  cloud: '#ffffff',
  sparkles: ['#ffffff', '#ffe066'],
  ground: { kind: 'grass', colors: ['#2f9a4f', '#3fb85f', '#62d47c'] },
  // Warm sunlight on the mascot and the prop, so it doesn't look pale against the cool sky
  light: { color: '#ffb066', amount: 0.1 },
  hills: ['#9ad8c8', '#5fc283'],
  trees: { kind: 'round', colors: ['#7a5a45', '#3f9a52'] },
  flowers: { colors: ['#ffffff', '#ffe066'] },
  ear: '#46507e',
  titleShadow: 'rgba(15,60,130,0.35)',
  backdrop: (ctx, scene, time) => (scene.kind === 'banner' ? sun(ctx, 1290, 95, 50, time) : sun(ctx, 430, 90, 52, time)),
  life: (ctx, scene, time) => {
    if (scene.kind !== 'banner') return;
    // Two gulls crossing from right to left, a whole width a loop, wrapping around
    for (const [start, y, size, phase] of [
      [0.2, 62, 26, 0],
      [0.55, 40, 20, 1.5],
    ] as const) {
      const x = ((((start - time) % 1) + 1) % 1) * (scene.width + 80) - 40;
      gull(ctx, x, y + Math.sin(time * TAU * 2 + phase) * 6, size, Math.sin(time * TAU * 8 + phase));
    }
  },
  prop: beachBall,
  hat: sunglasses,
};
