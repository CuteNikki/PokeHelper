import { loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';

import { RecentCache } from 'utility/cache';
import { MINUTE, SECOND } from 'utility/duration';

/** Shorten text with `...` until it fits the width, in the context's current font. */
export function truncateText(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (ctx.measureText(`${truncated}...`).width > maxWidth && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}...`;
}

/** Draw an avatar in a circle, with an optional colored ring around it, or a grey circle when there's no image. */
export function drawAvatar(ctx: SKRSContext2D, avatarImage: Image | null, x: number, y: number, radius: number, borderColor?: string) {
  ctx.save();

  if (borderColor) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
    ctx.fillStyle = borderColor;
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (avatarImage) {
    ctx.drawImage(avatarImage, x - radius, y - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = '#45475a';
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  ctx.restore();
}

/** Draw a Pokéball: red and white, with the black band and the button. */
export function drawPokeball(ctx: SKRSContext2D, x: number, y: number, radius: number) {
  ctx.save();
  const band = radius * 0.16;
  const button = radius * 0.34;

  // Top half red, bottom half white
  ctx.beginPath();
  ctx.arc(x, y, radius, Math.PI, 0);
  ctx.fillStyle = '#ee1515';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI);
  ctx.fillStyle = '#f0f0f0';
  ctx.fill();

  // The black band, the outline and the button with its ring
  ctx.fillStyle = '#222224';
  ctx.fillRect(x - radius, y - band / 2, radius * 2, band);
  ctx.lineWidth = Math.max(1, radius * 0.1);
  ctx.strokeStyle = '#222224';
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, button, 0, Math.PI * 2);
  ctx.fillStyle = '#222224';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, button * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = '#f0f0f0';
  ctx.fill();

  ctx.restore();
}

/**
 * The largest font size, at most `maxSize`, at which all the texts fit `maxWidth` together on one line.
 * Never goes below `minSize`, even if it still doesn't fit.
 */
export function fitFontSize(ctx: SKRSContext2D, font: (size: number) => string, texts: string[], maxWidth: number, maxSize: number, minSize: number): number {
  for (let size = maxSize; size > minSize; size--) {
    ctx.font = font(size);
    if (texts.reduce((sum, text) => sum + ctx.measureText(text).width, 0) <= maxWidth) return size;
  }
  return minSize;
}

/** A color with some transparency, from `#rrggbb`. */
export const withAlpha = (hex: string, alpha: number) => {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
};

/** The color of text and symbols on a `#rrggbb` color: dark on light ones, like Electric's yellow, so they're readable, white otherwise. */
export const colorOn = (hex: string) => {
  const value = parseInt(hex.slice(1), 16);
  return 0.299 * ((value >> 16) & 255) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255) > 170 ? '#1e1e2e' : '#ffffff';
};

/** An image scaled to fit a square, centered, keeping its shape. */
export function drawContained(ctx: SKRSContext2D, image: Image, x: number, y: number, size: number) {
  const scale = Math.min(size / image.width, size / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  ctx.drawImage(image, x + (size - width) / 2, y + (size - height) / 2, width, height);
}

/** The room above and below a badge's symbol. */
const BADGE_ICON_INSET = 5;
/** The room between a badge's symbol and its name. */
const BADGE_ICON_GAP = 5;
/** The room at either end of a badge's content, and the least there is when the badge has a width that's set. */
const BADGE_PADDING = 14;
const BADGE_MIN_PADDING = 8;

/**
 * A Pokémon type's badge: symbol and name on a pill in its color. Returns its width. The symbol is drawn as given, so it should
 * already be in {@link colorOn} the type's color. Without a width, it's as wide as its name needs.
 */
export function drawTypeBadge(
  ctx: SKRSContext2D,
  type: { name: string; color: string; icon?: Image | null },
  x: number,
  y: number,
  height: number,
  width?: number,
): number {
  ctx.font = 'bold 15px "Roboto"';
  const label = type.name.toUpperCase();
  const iconWidth = type.icon ? height - BADGE_ICON_INSET * 2 + BADGE_ICON_GAP : 0;
  const badgeWidth = width ?? BADGE_PADDING * 2 + iconWidth + ctx.measureText(label).width;
  const text = truncateText(ctx, label, badgeWidth - BADGE_MIN_PADDING * 2 - iconWidth);
  // The symbol and the name as one, in the middle of the badge
  const start = x + (badgeWidth - iconWidth - ctx.measureText(text).width) / 2;
  ctx.fillStyle = type.color;
  ctx.beginPath();
  ctx.roundRect(x, y, badgeWidth, height, height / 2);
  ctx.fill();
  if (type.icon) ctx.drawImage(type.icon, start, y + BADGE_ICON_INSET, height - BADGE_ICON_INSET * 2, height - BADGE_ICON_INSET * 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colorOn(type.color);
  ctx.fillText(text, start + iconWidth, y + height / 2 + 1);
  return badgeWidth;
}

/** How long to wait for a picture from the web. */
const IMAGE_TIMEOUT = 10 * SECOND;

/**
 * Load a picture from the web, with a timeout, as loading it from its URL directly would wait forever on a connection that hangs.
 * Throws when it can't be loaded, so a cache doesn't keep the failure.
 */
export async function fetchImage(url: string): Promise<Image> {
  const response = await fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT) });
  if (!response.ok) throw new Error(`The picture at ${url} answered ${response.status}`);
  return loadImage(Buffer.from(await response.arrayBuffer()));
}

/** Avatars shown recently, for 15 minutes, as the same leaderboard pages and rank cards are often looked at a few times in a row. */
const avatars = new RecentCache<Image>(500, 15 * MINUTE);

/** Someone's avatar, cached for a while. Null if they have none here or it can't be loaded, so a missing one leaves a gap. */
export const loadAvatar = (url: string | null): Promise<Image | null> =>
  url ? avatars.get(url, () => fetchImage(url)).catch(() => null) : Promise.resolve(null);
