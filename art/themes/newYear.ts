import type { SKRSContext2D } from '@napi-rs/canvas';

import { PALE_BODY, partyHat, stars, TAU } from '../draw';
import type { Scene, Theme } from './types';

/**
 * A firework: a rocket rising, then bursting with a flash into streaks of sparks with a ring of gold inside, which fly out, droop
 * and fade, then nothing until the next one.
 * @param progress Where it is, from 0 to 1.
 */
function firework(ctx: SKRSContext2D, x: number, y: number, size: number, color: string, progress: number) {
  // Rising for the first tenth, bursting until three quarters, dark for the rest, so they don't all go off at once
  if (progress < 0.1) {
    const rise = progress / 0.1;
    const ry = y + size * 1.6 * (1 - rise);
    ctx.strokeStyle = 'rgba(255,240,200,0.7)';
    ctx.lineWidth = size * 0.05;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, ry + size * 0.35);
    ctx.lineTo(x, ry);
    ctx.stroke();
    return;
  }
  const burst = (progress - 0.1) / 0.65;
  if (burst > 1) return;
  // The flash as it bursts
  if (burst < 0.2) {
    const flash = ctx.createRadialGradient(x, y, 0, x, y, size * 0.7);
    flash.addColorStop(0, `rgba(255,250,230,${(0.8 * (1 - burst / 0.2)).toFixed(3)})`);
    flash.addColorStop(1, 'rgba(255,250,230,0)');
    ctx.fillStyle = flash;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.7, 0, TAU);
    ctx.fill();
  }
  const reach = size * (1 - (1 - burst) ** 3);
  const droop = burst ** 2 * size * 0.3;
  ctx.globalAlpha = 1 - burst ** 2;
  ctx.lineCap = 'round';
  // Streaks of sparks, their tails trailing behind them towards the middle
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.075;
  const sparks = 16;
  for (let i = 0; i < sparks; i++) {
    const angle = (i / sparks) * TAU;
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    ctx.beginPath();
    ctx.moveTo(x + cos * reach * 0.6, y + sin * reach * 0.6 + droop * 0.6);
    ctx.lineTo(x + cos * reach, y + sin * reach + droop);
    ctx.stroke();
  }
  // A ring of gold inside, turned half a spark from the streaks
  ctx.fillStyle = '#ffe9a8';
  for (let i = 0; i < 8; i++) {
    const angle = ((i + 0.5) / 8) * TAU;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * reach * 0.45, y + Math.sin(angle) * reach * 0.45 + droop * 0.5, size * 0.05, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Fireworks going off one after another in the open sky, clear of the name, each going off a whole number of times a loop. */
function fireworks(ctx: SKRSContext2D, scene: Scene, time: number) {
  const bursts =
    scene.kind === 'banner'
      ? ([
          [120, 80, 75, '#ffd75e', 0],
          [520, 66, 62, '#ff6fae', 0.33],
          [1010, 160, 80, '#7ee3ff', 0.66],
          [820, 62, 58, '#b28dff', 0.5],
        ] as const)
      : ([
          [100, 110, 80, '#ffd75e', 0],
          [420, 100, 70, '#ff6fae', 0.5],
        ] as const);
  for (const [x, y, size, color, phase] of bursts) firework(ctx, x, y, size, color, (time * 3 + phase) % 1);
}

/**
 * A party popper, a striped cone. Streamers shoot out of it as it pops, with the confetti, at the start of a loop, and fade away, so
 * they aren't hanging out of it the whole time. Its mouth is at y -84 before it's tilted.
 */
function partyPopper(ctx: SKRSContext2D, x: number, y: number, scale: number, time: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.rotate(-0.35);
  // The streamers, behind the cone: flying out as fast as the confetti, then gone before a third of the loop is over
  // Springing out: out fast, past where they come to rest, and back, like the confetti bursting out with them
  const out = 1 - Math.exp(-22 * time) * Math.cos(26 * time);
  const fade = 1 - Math.min(1, Math.max(0, (time - 0.12) / 0.16));
  if (fade > 0) {
    ctx.globalAlpha = fade;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ['#ffd75e', '#ff6fae', '#7ee3ff', '#b28dff'].forEach((color, i) => {
      const wave = Math.sin(time * TAU * 3 + i) * 8;
      const spread = (i - 1.5) * 22;
      // Each point as far out of the mouth as the streamer has flown
      const at = (px: number, py: number) => [px * out, -84 + (py + 84) * out] as const;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -84);
      ctx.bezierCurveTo(...at(spread - 14 + wave, -112), ...at(spread + 18 - wave, -128), ...at(spread * 1.6 + wave, -150));
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }
  const cone = () => {
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(-22, -84);
    ctx.lineTo(22, -84);
    ctx.lineTo(6, 0);
    ctx.closePath();
  };
  cone();
  ctx.fillStyle = '#ffd75e';
  ctx.fill();
  ctx.save();
  cone();
  ctx.clip();
  ctx.fillStyle = '#ff6fae';
  for (let stripe = -76; stripe < 0; stripe += 22) ctx.fillRect(-30, stripe, 60, 10);
  ctx.restore();
  ctx.restore();
}

const CONFETTI = ['#ffd75e', '#ff6fae', '#7ee3ff', '#b28dff', '#ffffff'];

/**
 * The party popper the mascot holds up on the banner, against its side, so it looks held: where it is, raised a little above the
 * ground props stand on, and how big it is. Its mouth, which the confetti bursts out of, is where its tilt takes the top of it.
 */
const POPPER = { x: 1062, y: 440, scale: 1.5 };
const POPPER_MOUTH = {
  x: POPPER.x - 84 * POPPER.scale * Math.sin(0.35),
  y: POPPER.y - 84 * POPPER.scale * Math.cos(0.35),
};

/** The same random number for the same n every time, so the confetti flies the same way every loop. */
const random = (n: number) => {
  const value = Math.sin(n * 12.9898 + 4.1414) * 43758.5453;
  return value - Math.floor(value);
};

/**
 * Confetti bursting out of the party popper once a loop, flying up and out, then fluttering down and falling out of the picture before
 * the loop ends, so the next burst starts with none left over. On the avatar, where there's no popper, it bursts up from below.
 */
function confettiBurst(ctx: SKRSContext2D, scene: Scene, time: number) {
  const banner = scene.kind === 'banner';
  const origin = banner ? POPPER_MOUTH : { x: scene.width / 2, y: scene.height + 20 };
  // Strong enough that even the piece flying highest is below the bottom before the loop is over
  const gravity = banner ? 1000 : 1150;
  // Flying out fast and slowing down, as if through the air
  const out = 1 - Math.exp(-7 * time);
  for (let index = 0; index < (banner ? 28 : 16); index++) {
    // Up and to the left out of the popper, which points that way. Up from below on the avatar
    const angle = banner ? -Math.PI * (0.5 + random(index) * 0.42) : -Math.PI * (0.32 + random(index) * 0.36);
    const reach = banner ? 160 + random(index + 50) * 380 : 220 + random(index + 50) * 320;
    const flutter = Math.sin(time * TAU * 4 + index) * 10 * time;
    const x = origin.x + Math.cos(angle) * reach * out + flutter;
    const y = origin.y + Math.sin(angle) * reach * out + gravity * time * time;
    if (y > scene.height + 20) continue;
    ctx.save();
    ctx.translate(x, y);
    // Flipping as it flies
    ctx.rotate(index + time * TAU * (index % 2 ? 3 : -3));
    ctx.fillStyle = CONFETTI[index % CONFETTI.length]!;
    const size = banner ? 1.5 : 2.2;
    ctx.fillRect(-6 * size, -3.5 * size, 12 * size, 7 * size);
    ctx.restore();
  }
}

/** New Year: a starry night with fireworks, a party popper it holds up that confetti bursts out of, and a party hat. */
export const newYear: Theme = {
  // Lightest on the right, where the light comes from in every theme
  sky: ['#2c2f74', '#0b0f2e'],
  cloud: null,
  sparkles: ['#ffffff', '#ffd75e'],
  ground: { kind: 'grass', colors: ['#163a35', '#1f4f45', '#2a6656'] },
  // Dark against the glow along the horizon, the far ones a little lighter than the near ones, as in the other themes, and still
  // dark enough to stand out from the sky
  hills: ['#0c1029', '#03040b'],
  trees: { kind: 'pine', colors: ['#141a33', '#18213f'] },
  // A dusky rose, warm like the light of the fireworks, so it doesn't look cold or grey at night
  light: { color: '#9a7088', amount: 0.14 },
  // The pale yellow of the cold themes, as it's a cold night
  body: PALE_BODY,
  ear: '#46507e',
  titleShadow: 'rgba(5,6,25,0.6)',
  backdrop: stars,
  life: (ctx, scene, time) => {
    fireworks(ctx, scene, time);
    confettiBurst(ctx, scene, time);
  },
  // Right up against the mascot, so it looks held
  prop: (ctx, _x, _y, _scale, time) => partyPopper(ctx, POPPER.x, POPPER.y, POPPER.scale, time),
  // Pink stripes, as stripes the color of the night sky would make its bottom seem to vanish, and the hat float
  hat: (ctx, time) => partyHat(ctx, time, ['#ffd75e', '#ff6fae', '#7ee3ff']),
};
