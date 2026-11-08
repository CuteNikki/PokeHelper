import { createCanvas, type Image } from '@napi-rs/canvas';

import { truncateText } from 'utility/canvas';

export interface TypeChartRow {
  name: string;
  color: string;
  icon: Image | null;
  /** The icons of the types its moves are super effective against. */
  strong: (Image | null)[];
  /** The icons of the types it's weak to. */
  weak: (Image | null)[];
}

export interface TypeChartData {
  labels: { type: string; strong: string; weak: string };
  rows: TypeChartRow[];
}

const PADDING = 32;
const HEADER_HEIGHT = 56;
const ROW_HEIGHT = 46;
const ICON_SIZE = 30;
const ICON_GAP = 6;
/** The most icons in a column: Fighting is super effective against five types, Grass and Rock are weak to five. */
const MAX_ICONS = 5;
const TYPE_WIDTH = 190;
const COLUMN_GAP = 28;
const ICONS_WIDTH = MAX_ICONS * ICON_SIZE + (MAX_ICONS - 1) * ICON_GAP;
const WIDTH = PADDING * 2 + TYPE_WIDTH + COLUMN_GAP * 2 + ICONS_WIDTH * 2;

const COLORS = {
  cardBg: 'rgba(42, 43, 60, 0.85)',
  textWhite: '#ffffff',
  textGray: '#a6adc8',
  divider: 'rgba(255, 255, 255, 0.08)',
};

/**
 * Draw the chart of all types as a PNG, a row each: its icon and name, the icons of the types it's strong against, and of those it's weak to.
 * The labels are passed in already translated.
 */
export function renderTypeChartCard(data: TypeChartData): Buffer {
  const height = HEADER_HEIGHT + data.rows.length * ROW_HEIGHT + PADDING / 2;
  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.cardBg;
  ctx.beginPath();
  ctx.roundRect(0, 0, WIDTH, height, 16);
  ctx.fill();

  const strongX = PADDING + TYPE_WIDTH + COLUMN_GAP;
  const weakX = strongX + ICONS_WIDTH + COLUMN_GAP;
  ctx.font = 'bold 13px "Roboto"';
  ctx.fillStyle = COLORS.textGray;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(data.labels.type.toUpperCase(), PADDING, HEADER_HEIGHT / 2 + 4);
  ctx.fillText(truncateText(ctx, data.labels.strong.toUpperCase(), ICONS_WIDTH), strongX, HEADER_HEIGHT / 2 + 4);
  ctx.fillText(truncateText(ctx, data.labels.weak.toUpperCase(), ICONS_WIDTH), weakX, HEADER_HEIGHT / 2 + 4);

  const icons = (list: (Image | null)[], x: number, y: number) =>
    list.slice(0, MAX_ICONS).forEach((icon, index) => {
      if (icon) ctx.drawImage(icon, x + index * (ICON_SIZE + ICON_GAP), y, ICON_SIZE, ICON_SIZE);
    });

  data.rows.forEach((row, index) => {
    const y = HEADER_HEIGHT + index * ROW_HEIGHT;
    ctx.fillStyle = COLORS.divider;
    ctx.fillRect(PADDING, y, WIDTH - PADDING * 2, 1);
    const iconY = y + (ROW_HEIGHT - ICON_SIZE) / 2;
    if (row.icon) ctx.drawImage(row.icon, PADDING, iconY, ICON_SIZE, ICON_SIZE);
    ctx.font = 'bold 17px "Roboto"';
    ctx.fillStyle = COLORS.textWhite;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(truncateText(ctx, row.name, TYPE_WIDTH - ICON_SIZE - 12), PADDING + ICON_SIZE + 12, y + ROW_HEIGHT / 2 + 1);
    icons(row.strong, strongX, iconY);
    icons(row.weak, weakX, iconY);
  });

  return canvas.toBuffer('image/png');
}
