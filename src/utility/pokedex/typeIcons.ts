import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';

/**
 * The icon of each type, a symbol on a circle in its color, from the free "Pokemon Type Icons (Vector)" pack by lugia-sea on DeviantArt.
 * Kept as SVG in `assets/types`, named by type, so they're sharp at any size.
 */
const ICONS_PATH = 'assets/types';

/** Each icon, loaded once. */
const icons = new Map<string, Promise<Image | null>>();

/** A type's icon, or null if there's none for it, like for a type added to the games later. */
export function typeIcon(type: string): Promise<Image | null> {
  let icon = icons.get(type);
  if (!icon) {
    icon = loadImage(`${ICONS_PATH}/${type}.svg`).catch(() => null);
    icons.set(type, icon);
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
