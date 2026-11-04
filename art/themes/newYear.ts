import type { SKRSContext2D } from '@napi-rs/canvas';

import { partyHat, TAU } from '../draw';
import type { Scene, Theme } from './types';

/**
 * A firework bursting: sparks flying out and fading, then nothing until the next burst.
 * @param progress Where it is in its burst, from 0 to 1.
 */
function firework(ctx: SKRSContext2D, x: number, y: number, size: number, color: string, progress: number) {
  // Bursting for the first two thirds, dark for the rest, so they don't all go off at once
  const burst = progress / 0.66;
  if (burst > 1) return;
  const sparks = 14;
  const reach = size * (1 - (1 - burst) ** 3);
  ctx.fillStyle = color;
  ctx.globalAlpha = 1 - burst ** 2;
  for (let i = 0; i < sparks; i++) {
    const angle = (i / sparks) * TAU;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach + burst * size * 0.15, size * 0.06, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Fireworks going off one after another, each bursting a whole number of times a loop. */
function fireworks(ctx: SKRSContext2D, scene: Scene, time: number) {
  const bursts =
    scene.kind === 'banner'
      ? ([
          [180, 110, 70, '#ffd75e', 0],
          [760, 90, 60, '#ff6fae', 0.33],
          [1050, 150, 55, '#7ee3ff', 0.66],
          [450, 60, 45, '#b28dff', 0.5],
        ] as const)
      : ([
          [100, 110, 70, '#ffd75e', 0],
          [420, 90, 60, '#ff6fae', 0.5],
        ] as const);
  for (const [x, y, size, color, phase] of bursts) firework(ctx, x, y, size, color, (time * 3 + phase) % 1);
}

/** New Year: a night sky with fireworks, and a party hat. */
export const newYear: Theme = {
  sky: ['#0b0f2e', '#2c2f74'],
  cloud: null,
  sparkles: ['#ffffff', '#ffd75e'],
  ground: { kind: 'grass', colors: ['#163a35', '#1f4f45', '#2a6656'] },
  ear: '#46507e',
  titleShadow: 'rgba(5,6,25,0.6)',
  life: fireworks,
  hat: (ctx, time) => partyHat(ctx, time, ['#ffd75e', '#2c2f74', '#ff6fae']),
};
