import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { createCanvas } from '@napi-rs/canvas';

import { avatarGif, bannerGif, iconPng } from './assets';
import { TAU } from './draw';
import { avatar, AVATAR_SIZE, BANNER_H, BANNER_W, banner } from './scenes';
import { THEMES, type ThemeName } from './themes';
import type { Theme } from './themes/types';

/**
 * Render the bot's avatar, banner and app icon, in every theme or the ones named: `bun run art`, or `bun run art halloween`.
 * They're written to `art/out/<theme>/`, with a preview of how they look in a profile popup, and uploaded with `bun run profile`.
 */

const OUT = join(import.meta.dir, 'out');

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

  const avatarFile = avatarGif(theme);
  const bannerFile = bannerGif(theme);
  await Bun.write(join(folder, 'avatar.gif'), avatarFile);
  await Bun.write(join(folder, 'banner.gif'), bannerFile);
  await Bun.write(join(folder, 'icon.png'), iconPng(theme));
  await Bun.write(join(folder, 'preview.png'), preview(theme));
  console.log(`${name}: avatar ${megabytes(avatarFile.length)}, banner ${megabytes(bannerFile.length)}, in art/out/${name}`);
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
  /* Pulled up over the bottom of the banner, like on a Discord profile */
  .avatar { display: block; position: relative; margin: -52px 0 0 16px; width: 92px; height: 92px; border-radius: 50%; border: 6px solid #232428; }
  .popup p { margin: 8px 16px 0; font-size: 20px; font-weight: 700; }
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
