import { describe, expect, test } from 'bun:test';

import { closestColors, encodeGif, indexFrame, paletteFor } from '../../art/gif';

// Two greys close together, and every other real slot far away from both. The last slot means unchanged, as in a real palette
const palette = [[100, 100, 100], [110, 100, 100], ...Array.from({ length: 253 }, () => [255, 0, 255]), [0, 0, 0]];

/** Pixels of the colors given, as a canvas gives them. */
const pixels = (...colors: number[][]) => new Uint8ClampedArray(colors.flatMap(([r, g, b]) => [r!, g!, b!, 255]));

test('paletteFor always keeps the last slot for unchanged, even for frames of only a few colors', () => {
  const colors = paletteFor([pixels([255, 0, 0], [0, 0, 255])]);
  expect(colors).toHaveLength(256);
  expect(colors.slice(0, 255).every((color) => color.length === 3)).toBe(true);
});

describe('closestColors', () => {
  test('picks the nearest real color, and the same one every time', () => {
    const closest = closestColors(palette);
    expect(closest(101, 100, 100)).toBe(0);
    expect(closest(108, 100, 100)).toBe(1);
    expect(closest(108, 100, 100)).toBe(1);
  });

  test('never picks the slot that means unchanged, even for its color', () => {
    expect(closestColors(palette)(0, 0, 0)).not.toBe(255);
  });
});

describe('indexFrame', () => {
  const index = (data: Uint8ClampedArray, before: { index: Uint8Array; data: Uint8ClampedArray } | null) => [
    ...indexFrame(data, palette, closestColors(palette), before),
  ];

  test('gives the first frame the closest colors', () => {
    expect(index(pixels([104, 100, 100], [107, 100, 100]), null)).toEqual([0, 1]);
  });

  test('keeps the color a pixel had while it barely moved and that color still fits', () => {
    // Now a little closer to the second grey, but only just, so it doesn't flicker over to it
    const before = { index: new Uint8Array([0]), data: pixels([104, 100, 100]) };
    expect(index(pixels([106, 100, 100]), before)).toEqual([0]);
  });

  test('gives a pixel that moved a lot its closest color', () => {
    const before = { index: new Uint8Array([0]), data: pixels([100, 100, 100]) };
    expect(index(pixels([125, 100, 100]), before)).toEqual([1]);
  });

  test('gives a pixel that stayed entirely still its closest color, so a passing cloud leaves no trail', () => {
    const before = { index: new Uint8Array([1]), data: pixels([100, 100, 100]) };
    expect(index(pixels([100, 100, 100]), before)).toEqual([0]);
  });
});

test('encodeGif makes a looping GIF of every frame', async () => {
  const frames = [pixels([255, 0, 0], [0, 0, 255]), pixels([0, 0, 255], [255, 0, 0]), pixels([0, 255, 0], [0, 255, 0])];
  const gif = await encodeGif(frames.length, 2, 1, 80, (frame) => frames[frame]!);
  expect(new TextDecoder().decode(gif.slice(0, 6))).toBe('GIF89a');
  // An image descriptor, which starts with a comma, for each frame, right after the block giving its delay
  const descriptors = [...gif].filter((byte, at) => byte === 0x2c && gif[at - 1] === 0x00 && gif[at - 8] === 0x21 && gif[at - 7] === 0xf9);
  expect(descriptors).toHaveLength(frames.length);
  expect(gif.at(-1)).toBe(0x3b);
});
