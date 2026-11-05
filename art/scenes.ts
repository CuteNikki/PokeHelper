import { join } from 'node:path';

import { type Canvas, createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';

import { BODY, cloud, grass, hills, hillTop, mascot, meadow, scratchLayer, snow, sparkle, TAU, tree } from './draw';
import type { Scene, Theme } from './themes/types';

// The font of the name on the banner, kept with the art
GlobalFonts.registerFromPath(join(import.meta.dir, 'fonts', 'Nunito-Black.ttf'), 'Nunito Black');

/** The avatar's size. Discord shows it tiny, so the face fills it, and the scene is only sky and a few big tufts of grass. */
export const AVATAR_SIZE = 512;
/** Twice the size Discord shows banners at, so they're sharp. */
export const BANNER_W = 1360;
export const BANNER_H = 480;

const AVATAR: Scene = { kind: 'avatar', width: AVATAR_SIZE, height: AVATAR_SIZE };
const BANNER: Scene = { kind: 'banner', width: BANNER_W, height: BANNER_H };

/** Where the hills lie in each scene: how low they go, how high they reach, from far to near. */
const HILLS = {
  avatar: [
    [400, 90, 2],
    [425, 60, 5],
  ],
  banner: [
    [350, 70, 1],
    [385, 55, 4],
  ],
} as const;

/**
 * Where the trees stand on the far hills of the banner, and how big they are: only at the far left, above the avatar. Under the name
 * they crowded the middle, and on the right the props and the mascot stand.
 */
const TREES = [
  [40, 1.7],
  [112, 1.35],
];

const hex = (color: string) => [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16));

const skies = new Map<string, Canvas>();

/**
 * The sky, with a soft glow along the horizon, worked out pixel by pixel. A canvas gradient is dithered, which sprinkles its pixels
 * with tiny random differences, and squeezed into a GIF's few colors those turn into speckles. Worked out here, each pixel is exactly
 * its color, and the sky goes over into clean bands instead. The same every frame, so it's made once.
 */
function sky(theme: Theme, scene: Scene): Canvas {
  const key = `${theme.sky.join()}${scene.kind}`;
  const made = skies.get(key);
  if (made) return made;
  const { width, height } = scene;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  const [top, bottom] = [hex(theme.sky[0]), hex(theme.sky[1])];
  const banner = scene.kind === 'banner';
  for (let y = 0; y < height; y++) {
    // The glow, rising from halfway down
    const glow = Math.max(0, (y / height - 0.45) / 0.55) ** 2 * 0.14;
    for (let x = 0; x < width; x++) {
      // The banner runs from its top left to its bottom right, the avatar from its top down
      const along = banner ? (x * width + y * height) / (width * width + height * height) : y / height;
      // On the banner the second color is on the left
      const mix = banner ? 1 - along : along;
      const at = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const color = top[channel]! + (bottom[channel]! - top[channel]!) * mix;
        image.data[at + channel] = Math.round(color + (255 - color) * glow);
      }
      image.data[at + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  skies.set(key, canvas);
  return canvas;
}

/** A row of the ground: grass or snow. */
function ground(ctx: SKRSContext2D, theme: Theme, row: 0 | 1 | 2, width: number, baseY: number, height: number, time: number, seed: number, blade?: number) {
  const color = theme.ground.colors[row];
  if (theme.ground.kind === 'snow') snow(ctx, width, baseY, height * 0.6, color, seed);
  else grass(ctx, width, baseY, height, color, time, seed, blade);
}

/** The far hills and the near ones, with trees on the far ones on the banner. */
function landscape(ctx: SKRSContext2D, theme: Theme, scene: Scene) {
  const [far, near] = HILLS[scene.kind];
  hills(ctx, scene.width, far[0], far[1], theme.hills[0], far[2]);
  if (theme.trees && scene.kind === 'banner') {
    for (const [x, size] of TREES) {
      tree(ctx, x!, hillTop(x!, far[0], far[1], far[2]) + 4, size!, theme.trees.kind, theme.trees.colors, theme.ground.kind === 'snow');
    }
  }
  hills(ctx, scene.width, near[0], near[1], theme.hills[1], near[2]);
}

/**
 * Draws something lit by the scene's light: on a layer of its own, tinted, then onto the scene. Straight onto the scene when it's
 * daylight.
 */
function lit(ctx: SKRSContext2D, theme: Theme, width: number, height: number, draw: (ctx: SKRSContext2D) => void) {
  if (!theme.light) return draw(ctx);
  const layered = scratchLayer('lit', width, height);
  const layer = layered.canvas;
  layered.setTransform(ctx.getTransform());
  draw(layered);
  layered.resetTransform();
  // Only over what was drawn
  layered.globalCompositeOperation = 'source-atop';
  layered.globalAlpha = theme.light.amount;
  layered.fillStyle = theme.light.color;
  layered.fillRect(0, 0, width, height);
  ctx.save();
  ctx.resetTransform();
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

/** The size of the canvas a context draws on, for a layer to match it. */
const sizeOf = (ctx: SKRSContext2D) => [ctx.canvas.width, ctx.canvas.height] as const;

/** The avatar, drawn at any size. Props like a pumpkin are left out, as they'd only be cut off at the edge of the circle. */
export function avatar(ctx: SKRSContext2D, theme: Theme, size: number, time: number, blink = 0) {
  ctx.save();
  ctx.scale(size / AVATAR_SIZE, size / AVATAR_SIZE);
  ctx.drawImage(sky(theme, AVATAR), 0, 0);
  theme.backdrop?.(ctx, AVATAR, time);
  landscape(ctx, theme, AVATAR);
  theme.life?.(ctx, AVATAR, time);

  ground(ctx, theme, 0, AVATAR_SIZE, 500, 130, time, 3, 60);
  theme.details?.(ctx, AVATAR, time);
  lit(ctx, theme, ...sizeOf(ctx), (lc) => mascot(lc, 250, 450, 1.55, time, blink, theme.ear, theme.body ?? BODY, theme.hat));
  // In front of it, up its body, so it peeks out of the grass as on the banner. Snow lies lower than grass reaches up, so it's put
  // higher
  ground(ctx, theme, 2, AVATAR_SIZE, theme.ground.kind === 'snow' ? 485 : 510, 120, time, 29, 66);
  ctx.restore();
}

/** The banner: sky, drifting clouds, hills, the name, and the mascot peeking out of the ground on the right. */
export function banner(ctx: SKRSContext2D, theme: Theme, time: number, blink = 0) {
  ctx.drawImage(sky(theme, BANNER), 0, 0);
  theme.backdrop?.(ctx, BANNER, time);

  // Sparkles twinkle behind the clouds
  for (const [x, y, r, color, phase] of [
    [130, 90, 18, 0, 0],
    [960, 70, 14, 1, 0.3],
    [300, 340, 12, 1, 0.6],
    [870, 330, 16, 0, 0.15],
  ] as const) {
    sparkle(ctx, x, y, r * (0.75 + 0.25 * Math.sin((time + phase) * TAU * 6)), theme.sparkles[color]);
  }

  // Clouds drift right to left in patterns that repeat across the width, each moving exactly one repeat in a loop, so they start
  // over without a jump. The far ones are smaller and fainter, and repeat more often, so they move more slowly, as far things seem to
  if (theme.cloud) {
    const farPeriod = BANNER_W / 4;
    ctx.globalAlpha = 0.55;
    for (let copy = -1; copy <= 4; copy++) {
      const x = copy * farPeriod - time * farPeriod;
      cloud(ctx, x + 60, 24, 0.42, theme.cloud);
      cloud(ctx, x + 235, 46, 0.3, theme.cloud);
    }
    ctx.globalAlpha = 1;
    const period = BANNER_W / 3;
    for (let copy = -1; copy <= 3; copy++) {
      const x = copy * period - time * period;
      cloud(ctx, x + 80, 58, 0.8, theme.cloud);
      cloud(ctx, x + 310, 92, 0.6, theme.cloud);
    }
  }
  landscape(ctx, theme, BANNER);
  theme.life?.(ctx, BANNER, time);

  ground(ctx, theme, 0, BANNER_W, BANNER_H - 30, 110, time, 3);
  lit(ctx, theme, ...sizeOf(ctx), (lc) => {
    mascot(lc, 1195, BANNER_H - 10, 1.25, time, blink, theme.ear, theme.body ?? BODY, theme.hat);
    // In front of the mascot, as if it holds it, and low enough that the grass always covers its bottom. Lower on snow, which lies lower
    theme.prop?.(lc, 1010, theme.ground.kind === 'snow' ? BANNER_H - 18 : BANNER_H - 32, 0.9, time);
  });
  ground(ctx, theme, 1, BANNER_W, BANNER_H + 10, 100, time, 11);
  // Down in the front, where the front row of grass hides their stems, as near as the mascot and its prop. Further back, on top of
  // the grass, they seemed to float
  if (theme.flowers) meadow(ctx, time, theme.flowers.colors, theme.flowers.center, theme.flowers.count);
  ground(ctx, theme, 2, BANNER_W, BANNER_H + 60, 90, time, 7);
  // In front of everything, so the blades of grass don't cut across them
  theme.details?.(ctx, BANNER, time);

  // The name, with a shadow so it stands out from the clouds
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = theme.titleShadow;
  ctx.shadowOffsetY = 6;
  ctx.shadowBlur = 0;
  ctx.font = '150px "Nunito Black"';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Poke Helper', 575, 245);
  ctx.shadowColor = 'transparent';
}
