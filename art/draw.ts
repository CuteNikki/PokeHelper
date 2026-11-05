import type { SKRSContext2D } from '@napi-rs/canvas';

/**
 * The pieces the mascot's scenes are made of. Everything is drawn at a moment `time` from 0 to 1 through a loop, so the same code draws
 * stills and animation frames. Anything that moves turns a whole number of times in a loop, so the last frame leads into the first.
 */

export const TAU = Math.PI * 2;

/** The mascot's own colors, the same in every theme. */
export const MASCOT = {
  face: '#2d1b3d',
  blush: '#ff9fb8',
};

/** The mascot's warm yellow, and the deeper yellow of the shade on its side, unless a theme gives it its own. */
export const BODY: [string, string] = ['#ffdf6b', '#f0b93a'];

/** A paler, buttery yellow, for themes with a cold light, like winter or Christmas, where the full yellow would stand out too much. */
export const PALE_BODY: [string, string] = ['#fbeab0', '#e9cd85'];

/** Between the two, for themes with a light that's neither cold nor warm, like autumn or spring. */
export const MID_BODY: [string, string] = ['#fde48e', '#eec360'];

/** The puffs a cloud is made of, around its middle, and the flat base they sit on. */
const PUFFS = [
  [-4, 4, 22],
  [22, -12, 28],
  [50, -6, 25],
  [74, 6, 18],
  [34, 8, 24],
] as const;

/** A soft cloud of a few puffs on a flat base, shaded underneath and lit on top. */
export function cloud(ctx: SKRSContext2D, x: number, y: number, scale: number, color: string) {
  const shape = (dy: number) => {
    ctx.beginPath();
    for (const [px, py, r] of PUFFS) {
      ctx.moveTo(x + (px + r) * scale, y + (py + dy) * scale);
      ctx.arc(x + px * scale, y + (py + dy) * scale, r * scale, 0, TAU);
    }
    ctx.roundRect(x - 22 * scale, y + (dy + 2) * scale, 116 * scale, 22 * scale, 11 * scale);
  };
  // The shadow underneath, a little lower than the cloud
  ctx.fillStyle = 'rgba(20,20,60,0.10)';
  shape(5);
  ctx.fill();
  ctx.fillStyle = color;
  shape(0);
  ctx.fill();
  // Light on the tops of the puffs, a little to the right, where the light comes from
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  for (const [px, py, r] of PUFFS.slice(0, 4)) {
    ctx.moveTo(x + (px + 3 + r * 0.5) * scale, y + (py - r * 0.35) * scale);
    ctx.arc(x + (px + 3) * scale, y + (py - r * 0.35) * scale, r * 0.5 * scale, 0, TAU);
  }
  ctx.fill();
}

/** How high hills reach at x: two waves together, so they roll unevenly. */
export const hillTop = (x: number, baseY: number, height: number, seed: number) =>
  baseY - height * (0.55 + (Math.sin(x * 0.0045 + seed) * 0.6 + Math.sin(x * 0.012 + seed * 3) * 0.4) * 0.45);

/** A row of rolling hills, far behind the ground. */
export function hills(ctx: SKRSContext2D, width: number, baseY: number, height: number, color: string, seed: number) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, baseY + 300);
  for (let x = 0; x <= width + 8; x += 8) ctx.lineTo(x, hillTop(x, baseY, height, seed));
  ctx.lineTo(width + 8, baseY + 300);
  ctx.closePath();
  ctx.fill();
}

/**
 * A little tree standing on x and y, round or pointed, with snow on it in the snow.
 * @param colors The trunk and the crown.
 */
export function tree(ctx: SKRSContext2D, x: number, y: number, size: number, kind: 'round' | 'pine', colors: [string, string], snowy: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  ctx.fillStyle = colors[0];
  // Down into the hill a little, so it stands in it rather than on its edge
  ctx.fillRect(-4, -18, 8, 26);
  ctx.fillStyle = colors[1];
  if (kind === 'round') {
    ctx.beginPath();
    for (const [dx, dy, r] of [
      [0, -40, 22],
      [-13, -28, 15],
      [13, -27, 16],
    ] as const) {
      ctx.moveTo(dx + r, dy);
      ctx.arc(dx, dy, r, 0, TAU);
    }
    ctx.fill();
    // Light on its top right, where the light comes from
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(6, -46, 11, 0, TAU);
    ctx.fill();
  } else {
    for (const [top, half, bottom] of [
      [-74, 14, -46],
      [-58, 20, -28],
      [-40, 25, -12],
    ] as const) {
      ctx.fillStyle = colors[1];
      ctx.beginPath();
      ctx.moveTo(0, top);
      ctx.lineTo(half, bottom);
      ctx.lineTo(-half, bottom);
      ctx.closePath();
      ctx.fill();
      if (snowy) {
        ctx.fillStyle = '#f4f8ff';
        ctx.beginPath();
        ctx.moveTo(0, top);
        ctx.lineTo(half * 0.45, top + (bottom - top) * 0.45);
        ctx.quadraticCurveTo(0, top + (bottom - top) * 0.6, -half * 0.45, top + (bottom - top) * 0.45);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/** A small five-petaled flower. */
export function flower(ctx: SKRSContext2D, x: number, y: number, r: number, petal: string, center: string) {
  ctx.fillStyle = petal;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * TAU - Math.PI / 2;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    ctx.moveTo(px + r * 0.75, py);
    ctx.arc(px, py, r * 0.75, 0, TAU);
  }
  ctx.fill();
  ctx.fillStyle = center;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.6, 0, TAU);
  ctx.fill();
}

/**
 * Little flowers on stems down in the front of the banner, drawn before its front row of grass, which hides their stems, so their
 * heads peek out between the tips of the blades, swaying with them. In clumps of different heights and sizes, so they look grown rather
 * than planted, between the avatar and the props. Not on the avatar, where the corners they'd fit in are cut off by its circle.
 */
export function meadow(ctx: SKRSContext2D, time: number, colors: string[], center = '#ffd23f', count?: number) {
  // Where each flower's head is, and how big it is, a little above the tips of the front row of grass, at y 450 to 495. Spread over
  // the stretch between the avatar, which on a profile covers the banner from about x 60 to 500 down here, and the props from about
  // x 900, and a few at the far left. The first few are spread out the most, for when there are only a few
  const spots = [
    [540, 438, 12],
    [700, 440, 12],
    [860, 434, 11],
    [28, 442, 11],
    [620, 446, 10],
    [780, 436, 11],
    [585, 432, 9],
    [745, 448, 10],
  ];
  spots.slice(0, count).forEach(([x, y, r], i) => {
    const sway = Math.sin(time * TAU * 3 + x! * 0.02) * 3;
    ctx.strokeStyle = '#2f7d4a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x!, y! + 60);
    ctx.quadraticCurveTo(x! + sway * 0.4, y! + 25, x! + sway, y!);
    ctx.stroke();
    flower(ctx, x! + sway, y!, r!, colors[i % colors.length]!, center);
  });
}

/** Stars twinkling in a night sky, more of them high up, none behind the ground. */
export function stars(ctx: SKRSContext2D, scene: { kind: 'avatar' | 'banner'; width: number; height: number }, time: number) {
  const banner = scene.kind === 'banner';
  const count = banner ? 34 : 10;
  // Scattered at random, but the same random every frame, so the loop has no jump. Spaced by a formula instead, they lined up in rows
  const random = (n: number) => {
    const value = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return value - Math.floor(value);
  };
  for (let i = 0; i < count; i++) {
    const x = random(i) * scene.width;
    // Raised to a power, so they thin out towards the horizon
    const y = random(i + 100) ** 1.4 * scene.height * 0.62 + 8;
    // Each twinkles a whole number of times a loop, at its own pace
    const twinkle = 0.55 + 0.45 * Math.sin(time * TAU * (2 + (i % 3)) + i * 1.7);
    ctx.fillStyle = `rgba(255,250,230,${(0.35 + 0.55 * twinkle).toFixed(3)})`;
    ctx.beginPath();
    // Big enough to see where Discord shows the banner at half this size, a few of them bigger and brighter
    ctx.arc(x, y, (banner ? 3.4 : 5) + (i % 4 === 0 ? (banner ? 2.4 : 3) : 0), 0, TAU);
    ctx.fill();
  }
}

/** A butterfly seen from above, its wings opening and closing with flap from -1 to 1. */
export function butterfly(ctx: SKRSContext2D, x: number, y: number, size: number, flap: number, color: string, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(size, size);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side * (0.25 + 0.75 * Math.abs(flap)), 1);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(9, -6, 10, 8, -0.5, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(7, 6, 7, 6, 0.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(10, -7, 3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#3a2a3f';
  ctx.beginPath();
  ctx.ellipse(0, 0, 2.2, 9, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * Butterflies fluttering in loops above the grass, each going around its own loop a whole number of times, so they come back to where
 * they started. Only on the banner, below the name and clear of it: on the avatar there's no room beside the mascot's face and ears.
 */
export function butterflies(ctx: SKRSContext2D, scene: { kind: 'avatar' | 'banner' }, time: number, colors: string[]) {
  if (scene.kind !== 'banner') return;
  // The middle of each loop, how far it goes across and up and down, where it starts in it, and how big the butterfly is
  const paths = [
    [540, 330, 60, 16, 0, 1.8],
    [800, 322, 50, 14, 0.4, 1.7],
    [100, 300, 40, 16, 0.7, 1.6],
  ] as const;
  paths.forEach(([cx, cy, ax, ay, phase, size], i) => {
    const t = (time + phase) * TAU;
    const x = cx + Math.sin(t) * ax;
    const y = cy + Math.sin(t * 2) * ay;
    // Facing the way it flies, a little
    const angle = Math.cos(t) * 0.5;
    butterfly(ctx, x, y, size, Math.cos(time * TAU * 20 + i), colors[i % colors.length]!, angle);
  });
}

/** Fireflies blinking and wandering over the grass at night, with a soft glow. */
export function fireflies(ctx: SKRSContext2D, scene: { kind: 'avatar' | 'banner' }, time: number, color: [number, number, number]) {
  const banner = scene.kind === 'banner';
  const spots = banner
    ? [
        [480, 330],
        [600, 360],
        [700, 310],
        [790, 350],
        [880, 320],
        [60, 300],
        [970, 270],
      ]
    : [
        [60, 330],
        [450, 300],
        [420, 390],
      ];
  spots.forEach(([x, y], i) => {
    const t = time * TAU;
    const fx = x! + Math.sin(t * (1 + (i % 2)) + i) * (banner ? 24 : 14);
    const fy = y! + Math.cos(t * 2 + i * 2) * (banner ? 12 : 8);
    const glow = Math.max(0, Math.sin(t * (3 + (i % 3)) + i * 1.3));
    if (glow < 0.05) return;
    const r = banner ? 28 : 34;
    const halo = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
    halo.addColorStop(0, `rgba(${color.join(',')},${(0.55 * glow).toFixed(3)})`);
    halo.addColorStop(1, `rgba(${color.join(',')},0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(fx, fy, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,220,${glow.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(fx, fy, banner ? 5.5 : 7, 0, TAU);
    ctx.fill();
  });
}

/** A four-pointed sparkle. */
export function sparkle(ctx: SKRSContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.3;
    ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * A row of grass blades along the bottom, swaying with time.
 * @param seed Shifts the blades, so rows don't line up.
 * @param blade How wide each blade is: thin for the banner, chunky for the avatar, which is shown tiny.
 */
export function grass(ctx: SKRSContext2D, width: number, baseY: number, height: number, color: string, time: number, seed: number, blade = 22) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-blade, baseY + 200);
  for (let x = -blade + (seed % blade); x < width + blade * 2; x += blade) {
    const h = height * (0.75 + 0.25 * Math.sin(x * 0.37 + seed));
    const sway = Math.sin(time * TAU * 3 + x * 0.02 + seed) * 6;
    ctx.lineTo(x, baseY);
    ctx.quadraticCurveTo(x + blade * 0.3 + sway * 0.5, baseY - h * 0.6, x + blade / 2 + sway, baseY - h);
    ctx.quadraticCurveTo(x + blade * 0.7 + sway * 0.5, baseY - h * 0.6, x + blade, baseY);
  }
  ctx.lineTo(width + blade * 3, baseY + 200);
  ctx.closePath();
  ctx.fill();
}

/** Rolling drifts of snow along the bottom, where grass would be. Snow lies still. */
export function snow(ctx: SKRSContext2D, width: number, baseY: number, height: number, color: string, seed: number) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, baseY + 200);
  for (let x = 0; x <= width; x += 8) {
    const wave = Math.sin(x * 0.012 + seed) * 0.5 + Math.sin(x * 0.031 + seed * 2) * 0.25;
    ctx.lineTo(x, baseY - height * (0.6 + wave * 0.4));
  }
  ctx.lineTo(width, baseY + 200);
  ctx.closePath();
  ctx.fill();
}

/**
 * The mascot, centered on x and standing on y, at a scale where 1 is about 240 wide.
 * @param blink 0 for open eyes, 1 for closed.
 * @param body Its color, and the color of the shade on its side.
 * @param hat Drawn on its head, in the mascot's own coordinates, where the top of its head is at y -175.
 */
export function mascot(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  scale: number,
  time: number,
  blink: number,
  ear: string,
  body: [string, string],
  hat?: (ctx: SKRSContext2D, time: number) => void,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  // A gentle bob, and a little tilt
  ctx.translate(0, Math.sin(time * TAU * 3) * 6);
  ctx.rotate(Math.sin(time * TAU * 3) * 0.03);

  // Ears, rounded and tipped in color, wiggling a little
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 62, -150);
    ctx.rotate(side * (0.32 + Math.sin(time * TAU * 6 + side) * 0.05));
    ctx.fillStyle = body[0];
    ctx.beginPath();
    ctx.moveTo(-30, 30);
    ctx.quadraticCurveTo(-26, -60, 0, -78);
    ctx.quadraticCurveTo(26, -60, 30, 30);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = ear;
    ctx.fillRect(-40, -90, 80, 48);
    ctx.restore();
    ctx.restore();
  }

  // Body, a soft rounded blob, with shading on its left, away from the light, which comes from the right like the sun and the moon
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(-120, 80);
    ctx.lineTo(-118, 0);
    ctx.bezierCurveTo(-125, -120, -70, -175, 0, -175);
    ctx.bezierCurveTo(70, -175, 125, -120, 118, 0);
    ctx.lineTo(120, 80);
    ctx.closePath();
  };
  outline();
  ctx.fillStyle = body[0];
  ctx.fill();
  ctx.save();
  outline();
  ctx.clip();
  const shade = ctx.createLinearGradient(-30, 0, -125, 0);
  // The shade's color, see-through
  shade.addColorStop(0, `${body[1]}00`);
  shade.addColorStop(1, body[1]);
  ctx.fillStyle = shade;
  ctx.fillRect(-140, -200, 140, 300);
  ctx.restore();

  // Eyes, closed into lines when blinking
  ctx.fillStyle = MASCOT.face;
  ctx.strokeStyle = MASCOT.face;
  for (const side of [-1, 1]) {
    const ex = side * 42;
    const ey = -95;
    if (blink > 0.5) {
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(ex - 12, ey);
      ctx.quadraticCurveTo(ex, ey + 8, ex + 12, ey);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(ex, ey, 13, 16, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex + 4, ey - 5, 4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = MASCOT.face;
    }
  }

  // Cheeks
  ctx.fillStyle = MASCOT.blush;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 70, -68, 16, 10, 0, 0, TAU);
    ctx.fill();
  }

  // The w mouth
  ctx.lineWidth = 9;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-20, -74);
  ctx.quadraticCurveTo(-10, -58, 0, -70);
  ctx.quadraticCurveTo(10, -58, 20, -74);
  ctx.stroke();

  hat?.(ctx, time);
  ctx.restore();
}

/**
 * Things falling or rising through a scene, like snow, petals or hearts, in a pattern that moves exactly its own height in a loop,
 * so it never stops. They're spread evenly but not in a grid, the same in every frame, and sway a little from side to side.
 * @param draw Draws one at x and y. `index` is its number, to vary them.
 * @param direction 1 to fall, -1 to rise.
 */
export function drifting(
  width: number,
  height: number,
  time: number,
  count: number,
  draw: (x: number, y: number, index: number) => void,
  direction: 1 | -1 = 1,
  sway = 10,
) {
  for (let index = 0; index < count; index++) {
    const startX = (index * 197.3) % width;
    const startY = (index * 89.7) % height;
    const y = (((startY + direction * time * height) % height) + height) % height;
    const x = startX + Math.sin(time * TAU * 2 + index) * sway;
    // Also a height above and below, so one leaving at one edge is already coming in at the other
    for (const offset of [-height, 0, height]) draw(x, y + offset, index);
  }
}

/** A heart, its point at the bottom, centered on x and y. */
export function heart(ctx: SKRSContext2D, x: number, y: number, size: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.6);
  ctx.bezierCurveTo(x - size * 1.1, y - size * 0.1, x - size * 0.55, y - size * 0.95, x, y - size * 0.4);
  ctx.bezierCurveTo(x + size * 0.55, y - size * 0.95, x + size * 1.1, y - size * 0.1, x, y + size * 0.6);
  ctx.fill();
}

/** A striped party hat with a pompom, sitting a little crooked on the mascot's head. */
export function partyHat(ctx: SKRSContext2D, time: number, colors: [string, string, string]) {
  ctx.save();
  // Sunk a little into its head and only a little crooked, so the straight bottom of the cone sits on the round top of its head
  ctx.translate(0, -160);
  ctx.rotate(0.08 + Math.sin(time * TAU * 3) * 0.03);
  const cone = () => {
    ctx.beginPath();
    ctx.moveTo(-48, 0);
    ctx.lineTo(0, -120);
    ctx.lineTo(48, 0);
    ctx.quadraticCurveTo(0, 14, -48, 0);
    ctx.closePath();
  };
  cone();
  ctx.fillStyle = colors[0];
  ctx.fill();
  ctx.save();
  cone();
  ctx.clip();
  ctx.fillStyle = colors[1];
  for (let y = -110; y < 10; y += 34) {
    ctx.beginPath();
    ctx.moveTo(-60, y + 20);
    ctx.lineTo(60, y);
    ctx.lineTo(60, y + 14);
    ctx.lineTo(-60, y + 34);
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = colors[2];
  ctx.beginPath();
  ctx.arc(0, -122, 16, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** How high above the ground a balloon's string is tied in a bow: high enough to show above the grass in front. */
export const BOW = 78;

/** A ribbon bow, two loops and a knot, centered on x and y. Big enough to make out where Discord shows the banner at half its size. */
export function bow(ctx: SKRSContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + side * 26, y - 16);
    ctx.lineTo(x + side * 26, y + 16);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, TAU);
  ctx.fill();
}
