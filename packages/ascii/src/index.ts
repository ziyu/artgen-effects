import { PAPER, flattenImage, luminance, makeImage, type Rgb } from '../../../src/shared/pixels.js';
import { resolveOptions, validateImage, type OptionSchema, type ResolvedOptions } from '../../../src/shared/validation.js';
import type { AsciiConversionResult, RgbaImage } from '../../../src/shared/types.js';
import { MAX_IMAGE_EDGE } from '../../../src/shared/constants.js';

export { MAX_IMAGE_EDGE, ALGORITHM_VERSION } from '../../../src/shared/constants.js';
export { ImageConversionError } from '../../../src/shared/types.js';
export type { RgbaImage, RgbaImageOutput, ConversionResult, AsciiConversionResult } from '../../../src/shared/types.js';

export interface AsciiOptions {
  /** Maximum requested columns: integer 24–85; default 80. Output remains at most 512×512. */
  asciiColumns?: number | undefined;
  /** Render dark glyphs on light paper; default false. */
  invert?: boolean | undefined;
}

export type Options = AsciiOptions;
export type Result = AsciiConversionResult;

const OPTION_SCHEMA = {
  asciiColumns: { type: 'number', default: 80, min: 24, max: 85, integer: true },
  invert: { type: 'boolean', default: false },
} satisfies OptionSchema<AsciiOptions>;

// Small original bitmap glyphs; no installed font, font fetch, or canvas dependency.
const ASCII_GLYPHS = [
  { character: ' ', rows: [0, 0, 0, 0, 0, 0, 0] },
  { character: '.', rows: [0, 0, 0, 0, 0, 0, 4] },
  { character: ':', rows: [0, 0, 4, 0, 0, 4, 0] },
  { character: '-', rows: [0, 0, 0, 14, 0, 0, 0] },
  { character: '+', rows: [0, 4, 4, 31, 4, 4, 0] },
  { character: '=', rows: [0, 0, 31, 0, 31, 0, 0] },
  { character: '%', rows: [25, 26, 2, 4, 8, 11, 19] },
  { character: '*', rows: [0, 21, 14, 31, 14, 21, 0] },
  { character: '@', rows: [14, 17, 23, 21, 23, 16, 14] },
  { character: '#', rows: [10, 31, 10, 31, 10, 31, 10] },
].map(glyph => ({
  ...glyph,
  coverage: glyph.rows.reduce((sum, row) => {
    for (let bit = 0; bit < 5; bit++) sum += (row >>> bit) & 1;
    return sum;
  }, 0),
})).sort((a, b) => a.coverage - b.coverage);

function asciiArt(rgb: Uint8Array, width: number, height: number, options: ResolvedOptions<AsciiOptions>): AsciiConversionResult {
  const columns = Math.max(1, Math.min(options.asciiColumns, Math.floor(MAX_IMAGE_EDGE / 6),
    Math.floor(width / 3), Math.floor(MAX_IMAGE_EDGE * width / (6 * height))));
  const rows = Math.max(1, Math.min(Math.floor(MAX_IMAGE_EDGE / 8), Math.round(height * columns * 6 / (width * 8))));
  const background: Rgb = options.invert ? PAPER : [19, 24, 35];
  const foreground: Rgb = options.invert ? [26, 31, 40] : [239, 244, 232];
  const result = makeImage(columns * 6, rows * 8, background);
  const textRows: string[] = [];
  const maxCoverage = ASCII_GLYPHS[ASCII_GLYPHS.length - 1].coverage;
  const lookup = Array.from({ length: 256 }, (_, value) => {
    const target = value * maxCoverage / 255;
    return ASCII_GLYPHS.reduce((best, glyph) => Math.abs(glyph.coverage - target) < Math.abs(best.coverage - target) ? glyph : best);
  });
  for (let row = 0; row < rows; row++) {
    let line = '';
    for (let column = 0; column < columns; column++) {
      let total = 0, count = 0;
      const xStart = Math.floor(column * width / columns);
      const xEnd = Math.max(xStart + 1, Math.floor((column + 1) * width / columns));
      const yStart = Math.floor(row * height / rows);
      const yEnd = Math.max(yStart + 1, Math.floor((row + 1) * height / rows));
      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const i = (y * width + x) * 3;
          total += luminance(rgb[i], rgb[i + 1], rgb[i + 2]); count++;
        }
      }
      const brightness = Math.round(total / count);
      const glyph = lookup[options.invert ? 255 - brightness : brightness];
      line += glyph.character;
      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 5; x++) {
          if (!(glyph.rows[y] & (1 << (4 - x)))) continue;
          const i = ((row * 8 + y) * result.width + column * 6 + x) * 4;
          result.data[i] = foreground[0];
          result.data[i + 1] = foreground[1];
          result.data[i + 2] = foreground[2];
        }
      }
    }
    textRows.push(line);
  }
  return { image: result, asciiText: textRows.join('\n') };
}

/**
 * Convert bounded RGBA8 pixels without mutating the source. Transparent pixels
 * are composited on white before processing; output pixels are fully opaque.
 * Throws ImageConversionError for invalid image dimensions, data or options.
 */
export function convert(image: RgbaImage, options?: AsciiOptions): AsciiConversionResult {
  const source = validateImage(image);
  const resolved = resolveOptions<AsciiOptions>(options, OPTION_SCHEMA);
  return asciiArt(flattenImage(source), source.width, source.height, resolved);
}
