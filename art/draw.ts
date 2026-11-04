import type { SKRSContext2D } from '@napi-rs/canvas';

/**
 * The pieces the mascot's scenes are made of. Everything is drawn at a moment `time` from 0 to 1 through a loop, so the same code draws
 * stills and animation frames. Anything that moves turns a whole number of times in a loop, so the last frame leads into the first.
 */

export const TAU = Math.PI * 2;

/** The mascot's own colors, the same in every theme. */
export const MASCOT = {
  body: '#f4f2ec',
  bodyShade: '#dcd9d0',
  face: '#2d1b3d',
  blush: '#ff9fb8',
};

/** A soft cloud of a few circles. */
export function cloud(ctx: SKRSContext2D, x: number, y: number, scale: number, color: string) {
  ctx.fillStyle = color;
  for (const [dx, dy, r] of [
    [0, 0, 26],
    [28, -12, 30],
    [58, 0, 24],
    [30, 8, 26],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x + dx * scale, y + dy * scale, r * scale, 0, TAU);
    ctx.fill();
  }
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
    ctx.fillStyle = MASCOT.body;
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

  // Body, a soft rounded blob, with shading on one side
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(-120, 80);
    ctx.lineTo(-118, 0);
    ctx.bezierCurveTo(-125, -120, -70, -175, 0, -175);
    ctx.bezierCurveTo(70, -175, 125, -120, 118, 0);
    ctx.lineTo(120, 80);
    ctx.closePath();
  };
  body();
  ctx.fillStyle = MASCOT.body;
  ctx.fill();
  ctx.save();
  body();
  ctx.clip();
  const shade = ctx.createLinearGradient(30, 0, 125, 0);
  shade.addColorStop(0, 'rgba(220,217,208,0)');
  shade.addColorStop(1, MASCOT.bodyShade);
  ctx.fillStyle = shade;
  ctx.fillRect(0, -200, 140, 300);
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
