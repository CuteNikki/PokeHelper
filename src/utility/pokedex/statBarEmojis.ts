import { createCanvas } from '@napi-rs/canvas';
import type { Client } from 'discord.js';

import { logger } from 'utility/logger';
import { TYPE_COLORS } from 'utility/pokedex/types';

/**
 * The bot's own emojis that stat bars are made of, in every type's color. They're drawn here and uploaded to the bot's application
 * when they're missing, so they work in every server without being added to one.
 *
 * The version is part of their names. Change it after changing how they look, so the old ones are replaced.
 */
const PREFIX = 'statbar1';

/** The pieces of a bar: a rounded start, the middle, and a rounded end. */
export type BarPiece = 'start' | 'middle' | 'end';
const PIECES: BarPiece[] = ['start', 'middle', 'end'];

const SIZE = 128;
/** The bar is thinner than the emoji, so the bars of lines below each other don't touch. */
const BAR_HEIGHT = 64;
const EMPTY_COLOR = '#1e1e2e';

/** The emojis by name, like `<:statbar1_fire_start:123>`, once they're there. */
const emojis = new Map<string, string>();

/** An emoji's name: the color is a type, or `empty`. */
const emojiName = (color: string, piece: BarPiece) => `${PREFIX}_${color}_${piece}`;

/** Draw a piece of a bar, filling the width so the pieces join up. */
function renderPiece(color: string, piece: BarPiece): Buffer {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  const top = (SIZE - BAR_HEIGHT) / 2;
  const radius = BAR_HEIGHT / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(0, top, SIZE, BAR_HEIGHT, piece === 'start' ? [radius, 0, 0, radius] : piece === 'end' ? [0, radius, radius, 0] : 0);
  ctx.fill();
  return canvas.toBuffer('image/png');
}

/** Every emoji there should be, by name, with how to draw it. */
function wantedEmojis(): Map<string, () => Buffer> {
  const wanted = new Map<string, () => Buffer>();
  const colors: [string, string][] = [
    ...Object.entries(TYPE_COLORS).map(([type, color]): [string, string] => [type, `#${color.toString(16).padStart(6, '0')}`]),
    ['empty', EMPTY_COLOR],
  ];
  for (const [name, color] of colors) {
    for (const piece of PIECES) wanted.set(emojiName(name, piece), () => renderPiece(color, piece));
  }
  return wanted;
}

/**
 * Upload the bar emojis the bot doesn't have yet, and delete those of older versions.
 * Until this is done, or if it fails, {@link statBarEmoji} has nothing and the bars are made of plain emoji instead.
 */
export async function syncStatBarEmojis(client: Client<true>): Promise<void> {
  const wanted = wantedEmojis();
  const existing = await client.application.emojis.fetch();

  for (const emoji of existing.values()) {
    if (!emoji.name?.startsWith('statbar')) continue;
    if (wanted.has(emoji.name)) {
      emojis.set(emoji.name, `<:${emoji.name}:${emoji.id}>`);
    } else {
      await emoji.delete().catch((error: unknown) => logger.warn(error, `Failed to delete the old stat bar emoji ${emoji.name}`));
    }
  }

  const missing = [...wanted].filter(([name]) => !emojis.has(name));
  if (missing.length === 0) return;
  logger.info(`Uploading ${missing.length} stat bar emojis`);
  // One after another, as uploading is rate limited
  for (const [name, render] of missing) {
    const emoji = await client.application.emojis.create({ name, attachment: render() });
    emojis.set(name, `<:${name}:${emoji.id}>`);
  }
  logger.info(`Uploaded ${missing.length} stat bar emojis`);
}

/** The emoji of a bar piece in a type's color, or `empty`, or null if the emojis aren't there. */
export const statBarEmoji = (color: string, piece: BarPiece) => emojis.get(emojiName(color, piece)) ?? null;
