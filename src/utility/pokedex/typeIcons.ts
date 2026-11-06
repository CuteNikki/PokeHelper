import { readFile } from 'node:fs/promises';

import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';

/**
 * The icon of each type, a symbol on a circle in its color, from the free "Pokemon Type Icons (Vector)" pack by lugia-sea on DeviantArt.
 * Kept as SVG in `assets/types`, named by type, so they're sharp at any size.
 */
const ICONS_PATH = 'assets/types';

/** The circle behind the symbol, which is left out where the icon goes on something in the type's color already, like a badge. */
const BACKGROUND = /<circle class="cls-1"[^>]*\/>/;
/** The symbol's white, which is changed to its color when it's drawn on its own. */
const SYMBOL_FILL = '.cls-2{fill:#fff;}';
/** The part of the icon the symbol is in, so it fills the space when drawn on its own. */
const SYMBOL_VIEW_BOX = 'viewBox="12 12 104 104"';

/** Each icon, loaded once, by type and how it's drawn. */
const icons = new Map<string, Promise<Image | null>>();

async function loadIcon(type: string, symbolColor: string | null): Promise<Image | null> {
  let svg = await readFile(`${ICONS_PATH}/${type}.svg`, 'utf8').catch(() => null);
  if (svg === null) return null;
  if (symbolColor) {
    svg = svg.replace(BACKGROUND, '').replace(SYMBOL_FILL, `.cls-2{fill:${symbolColor};}`).replace('viewBox="0 0 128 128"', SYMBOL_VIEW_BOX);
  }
  return loadImage(Buffer.from(svg)).catch(() => null);
}

/**
 * A type's icon, or null if there's none for it, like for a type added to the games later.
 * @param symbolColor Draw only the symbol, in this color, without the circle behind it.
 */
export function typeIcon(type: string, symbolColor: string | null = null): Promise<Image | null> {
  const key = `${type}:${symbolColor ?? ''}`;
  let icon = icons.get(key);
  if (!icon) {
    icon = loadIcon(type, symbolColor);
    icons.set(key, icon);
  }
  return icon;
}

/** A type's icon as a PNG at a size, like for an emoji, which Discord doesn't take as SVG. Null if there's none for it. */
export async function typeIconPng(type: string, size: number): Promise<Buffer | null> {
  const icon = await typeIcon(type);
  if (!icon) return null;
  const canvas = createCanvas(size, size);
  canvas.getContext('2d').drawImage(icon, 0, 0, size, size);
  return canvas.toBuffer('image/png');
}
