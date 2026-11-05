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
export function paletteFor(frames: Uint8ClampedArray[]) {
  const picks = [0, 0.25, 0.5, 0.75].map((share) => frames[Math.floor(share * frames.length)]!);
  const size = picks[0]!.length;
  const sample = new Uint8ClampedArray(size * picks.length);
  picks.forEach((frame, slot) => sample.set(frame, slot * size));
  return [...quantize(sample, UNCHANGED, { format: 'rgb565' }), [0, 0, 0]];
}

/**
 * Finds the closest palette color for a color, the same one for the same color every time.
 *
 * Not gifenc's applyPalette: it sorts colors into coarse buckets and gives a whole bucket the color closest to the first pixel of it it
 * comes across in a frame, so one and the same color could get a different palette color from one frame to the next, depending on
 * what else was in the picture, and things that didn't move at all flickered. Every color is looked up exactly here, and remembered,
 * as the same colors come up again and again through a loop.
 */
function closestColors(palette: number[][]) {
  const picked = new Map<number, number>();
  return (red: number, green: number, blue: number) => {
    const key = (red << 16) | (green << 8) | blue;
    let best = picked.get(key);
    if (best !== undefined) return best;
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
    picked.set(key, best!);
    return best!;
  };
}

/**
 * Each frame's pixels as palette colors, keeping a pixel's color from the frame before while its real color hardly moved since then,
 * and the color it had is still about as close to it as the closest one.
 *
 * A pixel that's entirely still, though, always gets its closest color. When the soft edge of a cloud has passed over a pixel, the
 * color it got on the way can be a shade off the sky behind, yet close enough to keep, and kept for good it'd leave a trail of the
 * cloud. Once the cloud has gone, the sky there doesn't move at all, so it gets its own color back. A still pixel's closest color is
 * the same every frame, so it can't flicker.
 */
export function indexFrames(frames: Uint8ClampedArray[], palette: number[][]): Uint8Array[] {
  let previous: Uint8Array | null = null;
  let previousData: Uint8ClampedArray | null = null;
  const closest = closestColors(palette);
  const distance = (data: Uint8ClampedArray, at: number, color: ArrayLike<number>, from = 0) =>
    Math.abs(data[at]! - color[from]!) + Math.abs(data[at + 1]! - color[from + 1]!) + Math.abs(data[at + 2]! - color[from + 2]!);
  return frames.map((data) => {
    const index = new Uint8Array(data.length / 4);
    for (let pixel = 0; pixel < index.length; pixel++) index[pixel] = closest(data[pixel * 4]!, data[pixel * 4 + 1]!, data[pixel * 4 + 2]!);
    if (previous && previousData) {
      for (let pixel = 0; pixel < index.length; pixel++) {
        const kept = previous[pixel]!;
        if (kept === index[pixel]) continue;
        const at = pixel * 4;
        const moved = distance(data, at, previousData, at);
        if (
          moved > 0 &&
          moved <= STILL_WITHIN &&
          distance(data, at, palette[kept]!) <= distance(data, at, palette[index[pixel]!]!) + KEEP_WITHIN
        ) {
          index[pixel] = kept;
        }
      }
    }
    previous = index;
    previousData = data;
    return index;
  });
}

/** Frames as a looping GIF. */
export function encodeGif(frames: Uint8ClampedArray[], width: number, height: number, delay: number): Uint8Array {
  const palette = paletteFor(frames);
  const encoder = GIFEncoder();
  let previous: Uint8Array | null = null;
  for (const index of indexFrames(frames, palette)) {
    if (!previous) {
      encoder.writeFrame(index, width, height, { palette, delay, repeat: 0 });
    } else {
      // Only what changed is drawn, over the frame before, which stays
      const changes = index.map((color, pixel) => (color === previous![pixel] ? UNCHANGED : color));
      encoder.writeFrame(changes, width, height, { delay, transparent: true, transparentIndex: UNCHANGED, dispose: 1 });
    }
    previous = index;
  }
  encoder.finish();
  return encoder.bytes();
}
