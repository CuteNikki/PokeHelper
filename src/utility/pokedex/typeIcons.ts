import { readFile } from 'node:fs/promises';

import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';

/**
 * The icon of each type, a symbol on a circle, from the free "Pokemon Type Icons (Vector)" pack by lugia-sea on DeviantArt.
 * Kept as SVG in `assets/types`, named by type, so they're sharp at any size. Recolored to the bot's type colors, with the symbol
 * white or dark like the text on a badge.
 */
const ICONS_PATH = 'assets/types';

/** The circle behind the symbol, left out where the symbol goes on something in the type's color already, like a badge. */
const BACKGROUND = /<circle class="cls-1"[^>]*\/>/;
/** The part of the icon the symbol is in, so it fills the space when drawn on its own. */
const SYMBOL_VIEW_BOX = 'viewBox="12 12 104 104"';

/** Each icon, loaded once, with or without its circle. */
const icons = new Map<string, Promise<Image | null>>();

function loadIcon(type: string, withBackground: boolean): Promise<Image | null> {
  const key = `${type}:${withBackground}`;
  let icon = icons.get(key);
  if (!icon) {
    icon = readFile(`${ICONS_PATH}/${type}.svg`, 'utf8')
      .then((svg) => loadImage(Buffer.from(withBackground ? svg : svg.replace(BACKGROUND, '').replace('viewBox="0 0 128 128"', SYMBOL_VIEW_BOX))))
      .catch(() => null);
    icons.set(key, icon);
  }
  return icon;
}

/** A type's symbol on its own, without the circle, for things in its color already, like a badge. Null if there's none for the type. */
export const typeSymbol = (type: string) => loadIcon(type, false);

/** A type's icon as a PNG at a size, like for an emoji, which Discord doesn't take as SVG. Null if there's none for it. */
export async function typeIconPng(type: string, size: number): Promise<Buffer | null> {
  const icon = await loadIcon(type, true);
  if (!icon) return null;
  const canvas = createCanvas(size, size);
  canvas.getContext('2d').drawImage(icon, 0, 0, size, size);
  return canvas.toBuffer('image/png');
}
