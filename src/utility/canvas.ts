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
