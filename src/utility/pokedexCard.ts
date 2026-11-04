import { createCanvas, type Image, type SKRSContext2D } from '@napi-rs/canvas';

import { truncateText } from 'utility/canvas';

export interface PokedexCardType {
  name: string;
  color: string;
}

export interface PokedexCardEvolution {
  name: string;
  image: Image | null;
  /** The Pokémon the card is about, which is highlighted. */
  current: boolean;
}

export interface PokedexCardData {
  name: string;
  /** Like `#0025`. */
  number: string;
  artwork: Image | null;
  types: PokedexCardType[];
  stats: { label: string; value: number }[];
  totalLabel: string;
  /** The evolution chain by stage, branches side by side. Empty when it doesn't evolve. */
  evolution: PokedexCardEvolution[][];
  evolutionLabel: string;
}

const WIDTH = 880;
const PADDING = 32;
const TOP_HEIGHT = 340;
const EVOLUTION_HEIGHT = 190;
const ARTWORK_SIZE = 260;
/** Bars are full at this value. A few Pokémon go higher, up to 255, but scaling to that makes nearly every bar look short. */
const STAT_BAR_MAX = 200;

const COLORS = {
  cardBg: 'rgba(42, 43, 60, 0.85)',
  trackBg: '#1e1e2e',
  textWhite: '#ffffff',
  textGray: '#a6adc8',
  textDark: '#1e1e2e',
  divider: 'rgba(255, 255, 255, 0.08)',
};

/** A color with some transparency, from `#rrggbb`. */
const withAlpha = (hex: string, alpha: number) => {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
};

/** Whether a `#rrggbb` color is light, so text on it should be dark to be readable, like on Electric's yellow. */
const isLight = (hex: string) => {
  const value = parseInt(hex.slice(1), 16);
  return 0.299 * ((value >> 16) & 255) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255) > 170;
};

/** An image scaled to fit a square, centered, keeping its shape. */
function drawContained(ctx: SKRSContext2D, image: Image, x: number, y: number, size: number) {
  const scale = Math.min(size / image.width, size / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  ctx.drawImage(image, x + (size - width) / 2, y + (size - height) / 2, width, height);
}

/** The type badges in a row, returning where the row ends. */
function drawTypes(ctx: SKRSContext2D, types: PokedexCardType[], x: number, y: number) {
  const height = 30;
  ctx.font = 'bold 15px "Roboto"';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  let left = x;
  for (const type of types) {
    const label = type.name.toUpperCase();
    const width = ctx.measureText(label).width + 32;
    ctx.fillStyle = type.color;
    ctx.beginPath();
    ctx.roundRect(left, y, width, height, height / 2);
    ctx.fill();
    ctx.fillStyle = isLight(type.color) ? COLORS.textDark : COLORS.textWhite;
    ctx.fillText(label, left + width / 2, y + height / 2 + 1);
    left += width + 10;
  }
}

/** The base stats as bars in the type's color, with the total below. */
function drawStats(ctx: SKRSContext2D, data: PokedexCardData, color: string, x: number, y: number, width: number) {
  const rowHeight = 28;
  const labelWidth = 92;
  const valueWidth = 44;
  const barX = x + labelWidth + valueWidth + 14;
  const barWidth = x + width - barX;
  const barHeight = 12;

  ctx.textBaseline = 'middle';
  data.stats.forEach((stat, index) => {
    const rowY = y + index * rowHeight + rowHeight / 2;
    ctx.textAlign = 'left';
    ctx.font = '15px "Roboto"';
    ctx.fillStyle = COLORS.textGray;
    ctx.fillText(truncateText(ctx, stat.label, labelWidth - 6), x, rowY);
    ctx.textAlign = 'right';
    ctx.font = 'bold 16px "Roboto"';
    ctx.fillStyle = COLORS.textWhite;
    ctx.fillText(String(stat.value), x + labelWidth + valueWidth, rowY);

    ctx.fillStyle = COLORS.trackBg;
    ctx.beginPath();
    ctx.roundRect(barX, rowY - barHeight / 2, barWidth, barHeight, barHeight / 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(barX, rowY - barHeight / 2, Math.max(barHeight, barWidth * Math.min(stat.value / STAT_BAR_MAX, 1)), barHeight, barHeight / 2);
    ctx.fill();
  });

  const totalY = y + data.stats.length * rowHeight + rowHeight / 2;
  ctx.textAlign = 'left';
  ctx.font = 'bold 15px "Roboto"';
  ctx.fillStyle = COLORS.textGray;
  ctx.fillText(data.totalLabel.toUpperCase(), x, totalY);
  ctx.textAlign = 'right';
  ctx.font = 'bold 16px "Roboto"';
  ctx.fillStyle = COLORS.textWhite;
  ctx.fillText(String(data.stats.reduce((sum, stat) => sum + stat.value, 0)), x + labelWidth + valueWidth, totalY);
}

/** The evolution chain in a row, with arrows between the stages, sized so even Eevee's eight fit. */
function drawEvolution(ctx: SKRSContext2D, data: PokedexCardData, color: string, y: number) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 13px "Roboto"';
  ctx.fillStyle = COLORS.textGray;
  ctx.fillText(data.evolutionLabel.toUpperCase(), PADDING, y + 24);

  const count = data.evolution.reduce((sum, stage) => sum + stage.length, 0);
  const arrows = data.evolution.length - 1;
  const arrowWidth = 36;
  const gap = 8;
  const available = WIDTH - PADDING * 2 - arrows * arrowWidth - (count - arrows - 1) * gap;
  const size = Math.min(110, Math.floor(available / count));
  const totalWidth = count * size + arrows * arrowWidth + (count - arrows - 1) * gap;

  const imageY = y + 40;
  let x = (WIDTH - totalWidth) / 2;
  data.evolution.forEach((stage, stageIndex) => {
    if (stageIndex > 0) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 22px "Roboto"';
      ctx.fillStyle = COLORS.textGray;
      ctx.fillText('→', x + arrowWidth / 2, imageY + size / 2);
      x += arrowWidth;
    }
    stage.forEach((pokemon, index) => {
      if (index > 0) x += gap;
      if (pokemon.current) {
        ctx.fillStyle = withAlpha(color, 0.22);
        ctx.beginPath();
        ctx.arc(x + size / 2, imageY + size / 2, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      if (pokemon.image) drawContained(ctx, pokemon.image, x + size * 0.08, imageY + size * 0.08, size * 0.84);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `${pokemon.current ? 'bold ' : ''}${size < 90 ? 13 : 15}px "Roboto"`;
      ctx.fillStyle = pokemon.current ? COLORS.textWhite : COLORS.textGray;
      ctx.fillText(truncateText(ctx, pokemon.name, size + gap), x + size / 2, imageY + size + 22);
      x += size;
    });
  });
}

/**
 * Draw a Pokédex card: the artwork, name, number and types, the base stats, and the evolution chain with pictures.
 * The labels are passed in already translated.
 * @returns The card as a PNG.
 */
export function renderPokedexCard(data: PokedexCardData): Buffer {
  const hasEvolution = data.evolution.length > 1;
  const height = TOP_HEIGHT + (hasEvolution ? EVOLUTION_HEIGHT : 0);
  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext('2d');
  const color = data.types[0]?.color ?? '#a8a77a';

  // Card
  ctx.fillStyle = COLORS.cardBg;
  ctx.beginPath();
  ctx.roundRect(0, 0, WIDTH, height, 16);
  ctx.fill();

  // Artwork on a soft circle in its type's color
  const artworkX = PADDING;
  const artworkY = (TOP_HEIGHT - ARTWORK_SIZE) / 2;
  ctx.fillStyle = withAlpha(color, 0.16);
  ctx.beginPath();
  ctx.arc(artworkX + ARTWORK_SIZE / 2, artworkY + ARTWORK_SIZE / 2, ARTWORK_SIZE / 2, 0, Math.PI * 2);
  ctx.fill();
  if (data.artwork) drawContained(ctx, data.artwork, artworkX + 10, artworkY + 10, ARTWORK_SIZE - 20);

  // Name and number
  const contentX = artworkX + ARTWORK_SIZE + 40;
  const contentWidth = WIDTH - PADDING - contentX;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'right';
  ctx.font = 'bold 22px "Roboto"';
  ctx.fillStyle = COLORS.textGray;
  ctx.fillText(data.number, WIDTH - PADDING, 64);
  const numberWidth = ctx.measureText(data.number).width;

  ctx.textAlign = 'left';
  ctx.font = 'bold 34px "Roboto"';
  ctx.fillStyle = COLORS.textWhite;
  ctx.fillText(truncateText(ctx, data.name, contentWidth - numberWidth - 20), contentX, 64);

  drawTypes(ctx, data.types, contentX, 82);
  drawStats(ctx, data, color, contentX, 122, contentWidth);

  if (hasEvolution) {
    ctx.fillStyle = COLORS.divider;
    ctx.fillRect(PADDING, TOP_HEIGHT, WIDTH - PADDING * 2, 1);
    drawEvolution(ctx, data, color, TOP_HEIGHT);
  }

  return canvas.toBuffer('image/png');
}
