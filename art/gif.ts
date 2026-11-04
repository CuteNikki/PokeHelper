import { applyPalette, GIFEncoder, quantize } from 'gifenc';

/**
 * Turning frames into a GIF, which has only 256 colors for the whole loop.
 *
 * Picking each pixel's nearest color on its own makes things flicker: a pixel whose real color barely changes from one frame to the
 * next, like the soft edge of a swaying grass blade, can land on a different color each time, and dark scenes with few colors to pick
 * from show it most. So a pixel keeps the color it had until its real color has changed by more than a little.
 */

/** How much a pixel's red, green and blue may change together before it gets a new color. */
const KEEP_BELOW = 24;

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

/** Each frame's pixels as palette colors, keeping a pixel's color while its real color hardly changes. */
export function indexFrames(frames: Uint8ClampedArray[], palette: number[][]): Uint8Array[] {
  let previous: Uint8Array | null = null;
  // The real color each kept color was picked for, so slow changes still add up to a new color in the end
  let pickedFor: Uint8ClampedArray | null = null;
  return frames.map((data) => {
    // Only the real colors, never the slot that means unchanged
    const index = applyPalette(data, palette.slice(0, UNCHANGED), 'rgb565');
    if (previous && pickedFor) {
      for (let pixel = 0; pixel < index.length; pixel++) {
        const at = pixel * 4;
        const change = Math.abs(data[at]! - pickedFor[at]!) + Math.abs(data[at + 1]! - pickedFor[at + 1]!) + Math.abs(data[at + 2]! - pickedFor[at + 2]!);
        if (change < KEEP_BELOW) index[pixel] = previous[pixel]!;
        else pickedFor.set(data.subarray(at, at + 4), at);
      }
    } else {
      pickedFor = new Uint8ClampedArray(data);
    }
    previous = index;
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
