import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { GIFEncoder, quantize } from 'gifenc';

/**
 * Turning frames into a GIF, which has only 256 colors for the whole loop.
 *
 * Picking each pixel's nearest color on its own makes things flicker: a pixel whose real color barely changes from one frame to the
 * next, like the soft edge of a swaying grass blade, can land on a different color each time, and dark scenes with few colors to pick
 * from show it most. So a pixel keeps the color it had while that still fits its real color about as well as the closest one.
 */

/**
 * How much farther from a pixel's real color, its red, green and blue together, the color it had may be than the closest color, and
 * still be kept. Enough to stop a pixel flipping between two colors that fit it about equally well.
 */
const KEEP_WITHIN = 10;

/** How much a pixel's real color may move from one frame to the next, its red, green and blue together, and still count as still. */
const STILL_WITHIN = 12;

/** The palette slot that means "as in the frame before", so a pixel that stays the same costs almost nothing. */
const UNCHANGED = 255;

/**
 * The colors for a loop, picked from frames spread through it, so they fit every frame and don't change between frames.
 * 255 of them, as the last slot is kept for pixels that stay the same.
 */
export function paletteFor(samples: Uint8ClampedArray[]) {
  const size = samples[0]!.length;
  const sample = new Uint8ClampedArray(size * samples.length);
  samples.forEach((frame, slot) => sample.set(frame, slot * size));
  return [...quantize(sample, UNCHANGED, { format: 'rgb565' }), [0, 0, 0]];
}

/**
 * Finds the closest palette color for a color, the same one for the same color every time.
 *
 * Not gifenc's applyPalette: it sorts colors into coarse buckets and gives a whole bucket the color closest to the first pixel of it it
 * comes across in a frame, so one and the same color could get a different palette color from one frame to the next, depending on
 * what else was in the picture, and things that didn't move at all flickered. Every color is looked up exactly here, and remembered
 * in a table with a place for each of the 16 million colors there are, 16 MB however many come up, as the same colors come up again
 * and again through a loop.
 */
export function closestColors(palette: number[][]) {
  // The closest slot plus one, so 0 means not looked up yet
  const picked = new Uint8Array(1 << 24);
  return (red: number, green: number, blue: number) => {
    const key = (red << 16) | (green << 8) | blue;
    const known = picked[key]!;
    if (known) return known - 1;
    let best = 0;
    let bestDistance = Infinity;
    // Only the real colors, never the slot that means unchanged
    for (let slot = 0; slot < UNCHANGED; slot++) {
      const color = palette[slot]!;
      const distance = (red - color[0]!) ** 2 + (green - color[1]!) ** 2 + (blue - color[2]!) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = slot;
      }
    }
    picked[key] = best + 1;
    return best;
  };
}

const distance = (data: Uint8ClampedArray, at: number, color: ArrayLike<number>, from = 0) =>
  Math.abs(data[at]! - color[from]!) + Math.abs(data[at + 1]! - color[from + 1]!) + Math.abs(data[at + 2]! - color[from + 2]!);

/**
 * A frame's pixels as palette colors, keeping a pixel's color from the frame before while its real color hardly moved since then,
 * and the color it had is still about as close to it as the closest one.
 *
 * A pixel that's entirely still, though, always gets its closest color. When the soft edge of a cloud has passed over a pixel, the
 * color it got on the way can be a shade off the sky behind, yet close enough to keep, and kept for good it'd leave a trail of the
 * cloud. Once the cloud has gone, the sky there doesn't move at all, so it gets its own color back. A still pixel's closest color is
 * the same every frame, so it can't flicker.
 * @param before The frame before, its palette colors and its real colors, or null for the first.
 * @param index Where to put them, so a GIF doesn't need a new array for every frame.
 */
export function indexFrame(
  data: Uint8ClampedArray,
  palette: number[][],
  closest: ReturnType<typeof closestColors>,
  before: { index: Uint8Array; data: Uint8ClampedArray } | null,
  index = new Uint8Array(data.length / 4),
): Uint8Array {
  for (let pixel = 0; pixel < index.length; pixel++) index[pixel] = closest(data[pixel * 4]!, data[pixel * 4 + 1]!, data[pixel * 4 + 2]!);
  if (!before) return index;
  for (let pixel = 0; pixel < index.length; pixel++) {
    const kept = before.index[pixel]!;
    if (kept === index[pixel]) continue;
    const at = pixel * 4;
    const moved = distance(data, at, before.data, at);
    if (moved > 0 && moved <= STILL_WITHIN && distance(data, at, palette[kept]!) <= distance(data, at, palette[index[pixel]!]!) + KEEP_WITHIN) {
      index[pixel] = kept;
    }
  }
  return index;
}

/** How many frames are drawn between the breaks that let the memory of the ones done with be freed. */
const FREE_EVERY = 8;

/**
 * Lets the memory of frames done with be freed. Reading a canvas's pixels gives them in memory outside of what the garbage collector
 * keeps an eye on, which Bun frees only when it gets back to its event loop, so a GIF made in one go kept every frame it had read,
 * gigabytes of them for the overview of every theme, more than a small server has.
 */
async function freeFrames() {
  Bun.gc(true);
  await new Promise((resolve) => setImmediate(resolve));
}

/**
 * A looping GIF of frames, drawn one at a time and written right away, so only the one before is kept, with a break now and then to
 * free the memory of the ones done with. The frames the palette is picked from are drawn twice, once for it, once in turn.
 * @param frame Draws a frame, from 0 to count - 1, and gives its pixels.
 */
export async function encodeGif(
  count: number,
  width: number,
  height: number,
  delay: number,
  frame: (index: number) => Uint8ClampedArray,
): Promise<Uint8Array> {
  const palette = paletteFor([0, 0.25, 0.5, 0.75].map((share) => frame(Math.floor(share * count))));
  const closest = closestColors(palette);
  const encoder = GIFEncoder();
  // The same few arrays for every frame, taking turns, rather than new ones each time: freed arrays this big are kept by the memory
  // allocator rather than given back, so the memory used grew with every frame, to more than a small server has for the overview
  const pixels = width * height;
  let index = new Uint8Array(pixels);
  let previous = new Uint8Array(pixels);
  const changes = new Uint8Array(pixels);
  const previousData = new Uint8ClampedArray(pixels * 4);
  for (let at = 0; at < count; at++) {
    if (at % FREE_EVERY === 0) await freeFrames();
    const data = frame(at);
    indexFrame(data, palette, closest, at === 0 ? null : { index: previous, data: previousData }, index);
    if (at === 0) {
      encoder.writeFrame(index, width, height, { palette, delay, repeat: 0 });
    } else {
      // Only what changed is drawn, over the frame before, which stays
      for (let pixel = 0; pixel < pixels; pixel++) changes[pixel] = index[pixel] === previous[pixel] ? UNCHANGED : index[pixel]!;
      encoder.writeFrame(changes, width, height, { delay, transparent: true, transparentIndex: UNCHANGED, dispose: 1 });
    }
    previousData.set(data);
    [previous, index] = [index, previous];
  }
  encoder.finish();
  return encoder.bytes();
}

/**
 * A looping GIF of a picture drawn at moments through the loop, each frame on the same canvas, cleared and with the drawing state of a
 * fresh one, rather than a new canvas for every frame, whose pixels piled up faster than they were freed.
 * @param draw Draws frame number `frame` of `count`.
 */
export function animatedGif(width: number, height: number, count: number, delay: number, draw: (ctx: SKRSContext2D, frame: number) => void) {
  const ctx = createCanvas(width, height).getContext('2d');
  return encodeGif(count, width, height, delay, (frame) => {
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    draw(ctx, frame);
    ctx.restore();
    return ctx.getImageData(0, 0, width, height).data;
  });
}
