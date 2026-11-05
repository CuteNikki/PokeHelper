import { type Canvas, createCanvas, type SKRSContext2D } from '@napi-rs/canvas';

import { PALE_BODY, fireflies, scratchLayer, stars, TAU } from '../draw';
import type { Theme } from './types';

/** How far the moon's glow reaches, in moon radii. */
const GLOW_REACH = 5;

const glows = new Map<number, Canvas>();

/**
 * The glow around a moon of a size, in two layers: a bright one close around it, fading fast, and a faint one reaching far, so the
 * light fades out softly rather than ending at an edge. Worked out pixel by pixel, as a canvas gradient is dithered, which turns into
 * speckles in a GIF, and made once, as the moon doesn't move.
 */
function moonGlow(r: number): Canvas {
  const made = glows.get(r);
  if (made) return made;
  const size = Math.ceil(r * GLOW_REACH * 2);
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const out = Math.max(0, Math.hypot(x - size / 2, y - size / 2) - r) / r;
      const alpha = 0.32 * Math.exp(-out / 0.35) + 0.12 * Math.exp(-out / 1.6);
      const at = (y * size + x) * 4;
      image.data.set([255, 244, 201, Math.round(alpha * 255)], at);
    }
  }
  ctx.putImageData(image, 0, 0);
  glows.set(r, canvas);
  return canvas;
}

/** A pale full moon with a soft glow and a few craters. */
function moon(ctx: SKRSContext2D, x: number, y: number, r: number) {
  const glow = moonGlow(r);
  ctx.drawImage(glow, x - glow.width / 2, y - glow.height / 2);
  ctx.fillStyle = '#fff4c9';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#efe0a8';
  for (const [dx, dy, cr] of [
    [-0.3, -0.25, 0.18],
    [0.25, 0.1, 0.24],
    [-0.15, 0.4, 0.12],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x + dx * r, y + dy * r, cr * r, 0, TAU);
    ctx.fill();
  }
}

/** A little bat, its wings flapping with time. */
function bat(ctx: SKRSContext2D, x: number, y: number, scale: number, flap: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#1a0f2e';
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 0.35 + 0.65 * Math.abs(flap));
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.quadraticCurveTo(20, -26, 46, -14);
    ctx.quadraticCurveTo(38, -4, 40, 6);
    ctx.quadraticCurveTo(30, 0, 26, 8);
    ctx.quadraticCurveTo(16, 2, 4, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.ellipse(0, 2, 9, 12, 0, 0, TAU);
  ctx.fill();
  // Ears
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 3, -8);
    ctx.lineTo(side * 8, -18);
    ctx.lineTo(side * 9, -6);
    ctx.fill();
  }
  ctx.restore();
}

/** A carved pumpkin, its face glowing and flickering a little, rocking as it's held. */
function pumpkin(ctx: SKRSContext2D, x: number, y: number, scale: number, time: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  // Rocking and squashing a little, as if it bobs along in the mascot's hold, a whole number of times a loop
  ctx.rotate(Math.sin(time * TAU * 3) * 0.07);
  const squash = Math.sin(time * TAU * 6) * 0.03;
  ctx.scale(1 + squash, 1 - squash);
  ctx.fillStyle = '#5a7a2b';
  ctx.fillRect(-6, -78, 12, 22);
  for (const [dx, rx, color] of [
    [-30, 38, '#e8701a'],
    [30, 38, '#e8701a'],
    [0, 40, '#f5871f'],
  ] as const) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(dx, -30, rx, 46, 0, 0, TAU);
    ctx.fill();
  }
  const flicker = 0.75 + 0.25 * Math.sin(time * TAU * 9);
  ctx.fillStyle = `rgba(255,216,77,${flicker})`;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 30, -50);
    ctx.lineTo(side * 14, -30);
    ctx.lineTo(side * 44, -30);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(-36, -16);
  for (let i = 0; i <= 6; i++) ctx.lineTo(-36 + i * 12, i % 2 ? -6 : -14);
  ctx.lineTo(36, -16);
  ctx.quadraticCurveTo(0, 8, -36, -16);
  ctx.fill();
  ctx.restore();
}

/**
 * A witch hat, sitting a little crooked between its ears. A darker purple than the moonlit sky behind it, so it doesn't disappear into
 * the sky, its brim a shade darker than its cone.
 */
function witchHat(ctx: SKRSContext2D, time: number) {
  ctx.save();
  ctx.translate(0, -168);
  ctx.rotate(-0.12 + Math.sin(time * TAU * 3) * 0.02);
  ctx.fillStyle = '#1f1238';
  ctx.beginPath();
  ctx.ellipse(0, 0, 100, 20, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#33205a';
  ctx.beginPath();
  ctx.moveTo(-55, -4);
  ctx.quadraticCurveTo(-30, -75, 10, -122);
  ctx.quadraticCurveTo(30, -98, 66, -104);
  ctx.quadraticCurveTo(40, -66, 55, -4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff8c1a';
  ctx.beginPath();
  ctx.moveTo(-53, -12);
  ctx.lineTo(53, -12);
  ctx.lineTo(51, -32);
  ctx.lineTo(-48, -32);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A little ghost, bobbing and swaying, its wavy hem rippling. */
function ghost(ctx: SKRSContext2D, x: number, y: number, size: number, time: number) {
  ctx.save();
  ctx.translate(x, y + Math.sin(time * TAU * 2) * 10);
  ctx.rotate(Math.sin(time * TAU * 2 + 1) * 0.08);
  ctx.scale(size, size);
  ctx.fillStyle = 'rgba(246,240,255,0.92)';
  ctx.beginPath();
  ctx.moveTo(-30, 10);
  ctx.bezierCurveTo(-34, -50, 34, -50, 30, 10);
  // The hem, three waves rippling along
  for (let i = 0; i < 3; i++) {
    const ripple = Math.sin(time * TAU * 4 + i) * 4;
    ctx.quadraticCurveTo(30 - i * 20 - 10, 26 + ripple, 30 - (i + 1) * 20, 10);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2d1b3d';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 10, -16, 4.5, 6.5, 0, 0, TAU);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(0, -2, 5, 6, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Halloween: a starry purple night, a full moon, bats, a ghost, fireflies, a carved pumpkin and a witch hat. */
export const halloween: Theme = {
  // Lightest on the right, where the moon is, and where the light comes from in every theme
  sky: ['#5b2a86', '#2a1650'],
  // Lighter than the night sky, so they don't disappear into it
  cloud: '#7a62a8',
  sparkles: ['#f3e7ff', '#ffb347'],
  ground: { kind: 'grass', colors: ['#1f3b34', '#2b5446', '#3a6e57'] },
  // Dark against the glow along the horizon, the far ones a little lighter than the near ones, as in the other themes
  hills: ['#231439', '#130b22'],
  trees: { kind: 'pine', colors: ['#1d1433', '#251a40'] },
  // A dusky mauve, so it looks lit by the night instead of glowing, without going cold or blue
  light: { color: '#8a5a9e', amount: 0.16 },
  details: (ctx, scene, time) => fireflies(ctx, scene, time, [214, 255, 140]),
  // A paler yellow, which fits its softer light
  body: PALE_BODY,
  ear: '#46507e',
  titleShadow: 'rgba(16,6,32,0.6)',
  backdrop: (ctx, scene, time) => {
    stars(ctx, scene, time);
    if (scene.kind === 'banner') moon(ctx, 1290, 95, 55);
    else moon(ctx, 420, 95, 60);
  },
  life: (ctx, scene, time) => {
    if (scene.kind !== 'banner') return;
    ghost(ctx, 1095, 62, 0.85, time);
    // Bats flutter across in a pattern that repeats every half width, moving that far in a loop, like the clouds. They're drawn
    // on their own and faded out on the right, so the moon and the mascot's hat stay clear, and they seem to come out of the moonlight
    const bats = scratchLayer('bats', scene.width, scene.height);
    const period = scene.width / 2;
    for (let copy = -1; copy <= 2; copy++) {
      const x = copy * period - time * period;
      bat(bats, x + 200, 120 + Math.sin(time * TAU * 2) * 12, 0.9, Math.cos(time * TAU * 24));
      bat(bats, x + 520, 70 + Math.cos(time * TAU * 2) * 10, 0.65, Math.cos(time * TAU * 24 + 1));
    }
    const fade = bats.createLinearGradient(scene.width - 420, 0, scene.width - 260, 0);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    bats.globalCompositeOperation = 'destination-out';
    bats.fillStyle = fade;
    bats.fillRect(scene.width - 420, 0, 420, scene.height);
    ctx.drawImage(bats.canvas, 0, 0);
  },
  prop: (ctx, x, y, scale, time) => pumpkin(ctx, x, y, scale * 1.3, time),
  hat: witchHat,
};
