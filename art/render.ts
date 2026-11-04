import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';
import { applyPalette, GIFEncoder, quantize } from 'gifenc';

import { TAU } from './draw';
import { avatar, AVATAR_SIZE, BANNER_H, BANNER_W, banner } from './scenes';
import { THEMES, type Theme, type ThemeName } from './themes';

/**
 * Render the bot's avatar, banner and app icon, in every theme or the ones named: `bun run art`, or `bun run art halloween`.
 * They're written to `art/out/<theme>/`, with a preview of how they look in a profile popup, and uploaded with `bun run profile`.
 */

GlobalFonts.registerFromPath(join(import.meta.dir, 'fonts', 'Nunito-Black.ttf'), 'Nunito Black');
const OUT = join(import.meta.dir, 'out');

/** One loop: 120 frames at 80ms is 9.6 seconds, long enough for clouds to drift slowly. */
const FRAMES = 120;
const DELAY = 80;
/** The banner at 1.5 times the size Discord shows it: sharp enough, and a small enough file. */
const BANNER_FILE_W = 1020;
const BANNER_FILE_H = 360;

/** Closed eyes for two frames, twice a loop. */
const blinkAt = (frame: number) => (frame === 35 || frame === 36 || frame === 95 || frame === 96 ? 1 : 0);

/** A loop as a GIF. The colors are picked once from frames across the loop, so they don't flicker between frames. */
function gif(width: number, height: number, draw: (ctx: SKRSContext2D, time: number, blink: number) => void): Uint8Array {
  const frames: Uint8ClampedArray[] = [];
  for (let frame = 0; frame < FRAMES; frame++) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    draw(ctx, frame / FRAMES, blinkAt(frame));
    frames.push(ctx.getImageData(0, 0, width, height).data);
  }

  const samples = [0, 30, 60, 90];
  const sample = new Uint8ClampedArray(width * height * 4 * samples.length);
  samples.forEach((index, slot) => sample.set(frames[index]!, slot * width * height * 4));
  const palette = quantize(sample, 256, { format: 'rgb565' });

  const encoder = GIFEncoder();
  for (const data of frames) encoder.writeFrame(applyPalette(data, palette, 'rgb565'), width, height, { palette, delay: DELAY, repeat: 0 });
  encoder.finish();
  return encoder.bytes();
}

/** The banner and avatar as they look in a profile popup, three times as big, to check the avatar covers nothing. */
function preview(theme: Theme): Buffer {
  const width = 300;
  const height = Math.round((width * BANNER_H) / BANNER_W);
  const sheet = createCanvas((width + 20) * 3, (height + 80) * 3);
  const ctx = sheet.getContext('2d');
  ctx.scale(3, 3);
  ctx.fillStyle = '#232428';
  ctx.fillRect(0, 0, width + 20, height + 80);
  const full = createCanvas(BANNER_W, BANNER_H);
  banner(full.getContext('2d'), theme, 0);
  ctx.drawImage(full, 10, 10, width, height);

  const face = createCanvas(AVATAR_SIZE, AVATAR_SIZE);
  avatar(face.getContext('2d'), theme, AVATAR_SIZE, 0);
  const cx = 10 + 16 + 46;
  const cy = 10 + height + 8;
  ctx.fillStyle = '#232428';
  ctx.beginPath();
  ctx.arc(cx, cy, 52, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 46, 0, TAU);
  ctx.clip();
  ctx.drawImage(face, cx - 46, cy - 46, 92, 92);
  ctx.restore();
  return sheet.toBuffer('image/png');
}

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const names = process.argv.slice(2);
const unknown = names.filter((name) => !(name in THEMES));
if (unknown.length > 0) {
  console.error(`Unknown theme: ${unknown.join(', ')}. There are: ${Object.keys(THEMES).join(', ')}.`);
  process.exit(1);
}

for (const name of (names.length > 0 ? names : Object.keys(THEMES)) as ThemeName[]) {
  const theme = THEMES[name];
  const folder = join(OUT, name);
  await mkdir(folder, { recursive: true });

  const avatarGif = gif(AVATAR_SIZE, AVATAR_SIZE, (ctx, time, blink) => avatar(ctx, theme, AVATAR_SIZE, time, blink));
  const bannerGif = gif(BANNER_FILE_W, BANNER_FILE_H, (ctx, time, blink) => {
    ctx.scale(BANNER_FILE_W / BANNER_W, BANNER_FILE_H / BANNER_H);
    banner(ctx, theme, time, blink);
  });
  // The app icon is a still, at twice the avatar's size, as Discord wants at least 512
  const icon = createCanvas(AVATAR_SIZE * 2, AVATAR_SIZE * 2);
  avatar(icon.getContext('2d'), theme, AVATAR_SIZE * 2, 0);

  await Bun.write(join(folder, 'avatar.gif'), avatarGif);
  await Bun.write(join(folder, 'banner.gif'), bannerGif);
  await Bun.write(join(folder, 'icon.png'), icon.toBuffer('image/png'));
  await Bun.write(join(folder, 'preview.png'), preview(theme));
  console.log(`${name}: avatar ${megabytes(avatarGif.length)}, banner ${megabytes(bannerGif.length)}, in art/out/${name}`);
}

// A page with every theme rendered so far, animated as on Discord: a profile popup, and the avatar at the size it has in chat
const rendered = Object.keys(THEMES).filter((name) => Bun.file(join(OUT, name, 'avatar.gif')).size > 0);
const card = (name: string) => `
  <section>
    <h2>${name}</h2>
    <div class="popup">
      <img class="banner" src="${name}/banner.gif" alt="">
      <img class="avatar" src="${name}/avatar.gif" alt="">
      <p>Poke Helper <span>APP</span></p>
    </div>
    <div class="chat">
      <img src="${name}/avatar.gif" alt=""><b>Poke Helper</b> <span>APP</span>
    </div>
  </section>`;
await Bun.write(
  join(OUT, 'index.html'),
  `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Poke Helper art</title>
<style>
  body { background: #313338; color: #dbdee1; font-family: system-ui, sans-serif; margin: 32px; display: flex; flex-wrap: wrap; gap: 40px; }
  h2 { text-transform: capitalize; margin: 0 0 12px; }
  .popup { width: 340px; background: #232428; border-radius: 12px; overflow: hidden; position: relative; padding-bottom: 16px; }
  .banner { width: 100%; display: block; }
  .avatar { position: absolute; left: 16px; top: calc(340px * 240 / 680 - 52px); width: 92px; height: 92px; border-radius: 50%; border: 6px solid #232428; }
  .popup p { margin: 60px 16px 0; font-size: 20px; font-weight: 700; }
  span { background: #5865f2; color: #fff; font-size: 11px; padding: 1px 5px; border-radius: 4px; vertical-align: middle; }
  .chat { margin-top: 16px; display: flex; align-items: center; gap: 10px; }
  .chat img { width: 40px; height: 40px; border-radius: 50%; }
  .chat b { color: #f2f3f5; }
</style>
</head>
<body>${rendered.map(card).join('')}
</body>
</html>
`,
);
console.log(`See them animated: art/out/index.html`);
