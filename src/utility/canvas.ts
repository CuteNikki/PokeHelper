import type { Image, SKRSContext2D } from '@napi-rs/canvas';

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
 * The largest font size, at most `maxSize`, at which all the texts fit the width together, for text on one line that must not overlap.
 * @param font Turns a size into a font, like `(size) => \`${size}px "Roboto"\``.
 * @param texts The texts that share the line.
 * @param maxWidth The width they have, including the gaps between them.
 * @param minSize The smallest size to go down to, even if it still doesn't fit.
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

/** Whether a `#rrggbb` color is light, so text on it should be dark to be readable, like on Electric's yellow. */
export const isLight = (hex: string) => {
  const value = parseInt(hex.slice(1), 16);
  return 0.299 * ((value >> 16) & 255) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255) > 170;
};

/** An image scaled to fit a square, centered, keeping its shape. */
export function drawContained(ctx: SKRSContext2D, image: Image, x: number, y: number, size: number) {
  const scale = Math.min(size / image.width, size / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  ctx.drawImage(image, x + (size - width) / 2, y + (size - height) / 2, width, height);
}

/**
 * A Pokémon type's badge: its name on a pill in its color, in dark text on light colors. As wide as given, with a name too long for it
 * shortened, or as wide as its name needs.
 * @returns How wide it is.
 */
export function drawTypeBadge(ctx: SKRSContext2D, type: { name: string; color: string }, x: number, y: number, height: number, width?: number): number {
  ctx.font = 'bold 15px "Roboto"';
  const label = type.name.toUpperCase();
  const badgeWidth = width ?? ctx.measureText(label).width + 32;
  ctx.fillStyle = type.color;
  ctx.beginPath();
  ctx.roundRect(x, y, badgeWidth, height, height / 2);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isLight(type.color) ? '#1e1e2e' : '#ffffff';
  ctx.fillText(truncateText(ctx, label, badgeWidth - 16), x + badgeWidth / 2, y + height / 2 + 1);
  return badgeWidth;
}
