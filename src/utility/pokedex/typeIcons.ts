import { readFile } from 'node:fs/promises';

import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';

import { colorOn } from 'utility/canvas';
import { TYPE_COLORS } from 'utility/pokedex/types';

/**
 * The icon of each type, a symbol on a circle, from the free "Pokemon Type Icons (Vector)" pack by lugia-sea on DeviantArt.
 * Kept as SVG in `assets/types`, named by type, so they're sharp at any size. The pack has its own colors, so the bot draws them
 * in its own type colors instead, like the badges.
 */
const ICONS_PATH = 'assets/types';

/** The circle behind the symbol. */
const BACKGROUND = /<circle class="cls-1"[^>]*\/>/;
/** The circle's color. */
const BACKGROUND_FILL = /\.cls-1\{fill:#[0-9a-f]+;\}/i;
/** The symbol's color, white in the pack. */
const SYMBOL_FILL = '.cls-2{fill:#fff;}';
/** The part of the icon the symbol is in, so it fills the space when drawn on its own. */
const SYMBOL_VIEW_BOX = 'viewBox="12 12 104 104"';

/** How an icon is drawn: the symbol in a color, on a circle in a color, or on its own when there's no circle. */
interface IconColors {
  symbol: string;
  background: string | null;
}

/** Each icon, loaded once, by type and colors. */
const icons = new Map<string, Promise<Image | null>>();

async function loadIcon(type: string, colors: IconColors): Promise<Image | null> {
  let svg = await readFile(`${ICONS_PATH}/${type}.svg`, 'utf8').catch(() => null);
  if (svg === null) return null;
  svg = svg.replace(SYMBOL_FILL, `.cls-2{fill:${colors.symbol};}`);
  svg = colors.background
    ? svg.replace(BACKGROUND_FILL, `.cls-1{fill:${colors.background};}`)
    : svg.replace(BACKGROUND, '').replace('viewBox="0 0 128 128"', SYMBOL_VIEW_BOX);
  return loadImage(Buffer.from(svg)).catch(() => null);
}

function cachedIcon(type: string, colors: IconColors): Promise<Image | null> {
  const key = `${type}:${colors.symbol}:${colors.background ?? ''}`;
  let icon = icons.get(key);
  if (!icon) {
    icon = loadIcon(type, colors);
    icons.set(key, icon);
  }
  return icon;
}

/** A type's color as `#rrggbb`. */
const colorOf = (type: string) => `#${(TYPE_COLORS[type] ?? 0).toString(16).padStart(6, '0')}`;

/**
 * A type's symbol on its own, without the circle, in the color of text on the type's color, for things in its color already,
 * like a badge. Null if there's none for the type, like for one added to the games later.
 */
export const typeSymbol = (type: string): Promise<Image | null> => cachedIcon(type, { symbol: colorOn(colorOf(type)), background: null });

/** A type's icon, the symbol on a circle in the type's color, as a PNG at a size, like for an emoji. Null if there's none for it. */
export async function typeIconPng(type: string, size: number): Promise<Buffer | null> {
  const color = colorOf(type);
  const icon = await cachedIcon(type, { symbol: colorOn(color), background: color });
  if (!icon) return null;
  const canvas = createCanvas(size, size);
  canvas.getContext('2d').drawImage(icon, 0, 0, size, size);
  return canvas.toBuffer('image/png');
}
