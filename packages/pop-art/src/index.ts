import { clamp, flattenImage, luminance, makeImage, nearestColor, type Rgb } from '../../../src/shared/pixels.js';
import { resolveOptions, validateImage, type OptionSchema, type ResolvedOptions } from '../../../src/shared/validation.js';
import type { ConversionResult, RgbaImage, RgbaImageOutput } from '../../../src/shared/types.js';

export { MAX_IMAGE_EDGE, ALGORITHM_VERSION } from '../../../src/shared/constants.js';
export { ImageConversionError } from '../../../src/shared/types.js';
export type { RgbaImage, RgbaImageOutput, ConversionResult } from '../../../src/shared/types.js';

export interface PopArtOptions {
  /** Halftone spacing in pixels: integer 3–12; default 6. */
  dotSize?: number | undefined;
  /** Contour strength: 0–1; default 0.65. */
  outline?: number | undefined;
}

export type Options = PopArtOptions;
export type Result = ConversionResult;

const OPTION_SCHEMA = {
  dotSize: { type: 'number', default: 6, min: 3, max: 12, integer: true },
  outline: { type: 'number', default: 0.65, min: 0, max: 1 },
} satisfies OptionSchema<PopArtOptions>;

const POP_PALETTE: readonly Rgb[] = [
  [255, 248, 226], [255, 217, 42], [233, 57, 52], [42, 88, 181],
  [235, 88, 151], [43, 161, 148], [248, 139, 43], [28, 32, 49],
];
const POP_BLACK = POP_PALETTE[7];

function smoothLuminance(rgb: Uint8Array, width: number, height: number): Uint8Array {
  const values = new Uint8Array(width * height);
  for (let i = 0; i < values.length; i++) values[i] = luminance(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
  const horizontal = new Uint16Array(values.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      horizontal[i] = values[y * width + Math.max(0, x - 1)] + values[i] + values[y * width + Math.min(width - 1, x + 1)];
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      values[i] = Math.round((horizontal[Math.max(0, y - 1) * width + x] + horizontal[i]
        + horizontal[Math.min(height - 1, y + 1) * width + x]) / 9);
    }
  }
  return values;
}

function popArt(rgb: Uint8Array, width: number, height: number, options: ResolvedOptions<PopArtOptions>): RgbaImageOutput {
  const result = makeImage(width, height);
  const light = smoothLuminance(rgb, width, height);
  const threshold = 30 + (1 - options.outline) * 240;
  const size = options.dotSize;
  for (let y = 0; y < height; y++) {
    const top = Math.max(0, y - 1) * width;
    const bottom = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      const source = pixel * 3;
      const tone = light[pixel];
      let color = tone < 45 ? POP_BLACK : tone > 232 ? POP_PALETTE[0]
        : nearestColor(clamp(tone + (rgb[source] - tone) * 1.55),
          clamp(tone + (rgb[source + 1] - tone) * 1.55), clamp(tone + (rgb[source + 2] - tone) * 1.55), POP_PALETTE);
      const left = Math.max(0, x - 1);
      const right = Math.min(width - 1, x + 1);
      const gx = -light[top + left] + light[top + right] - 2 * light[y * width + left]
        + 2 * light[y * width + right] - light[bottom + left] + light[bottom + right];
      const gy = -light[top + left] - 2 * light[top + x] - light[top + right]
        + light[bottom + left] + 2 * light[bottom + x] + light[bottom + right];
      const dx = ((x + 0.5 + (Math.floor(y / size) % 2) * size / 2) % size) - size / 2;
      const dy = ((y + 0.5) % size) - size / 2;
      const radius = size * (0.08 + 0.26 * (1 - tone / 255));
      if ((options.outline > 0 && Math.abs(gx) + Math.abs(gy) > threshold)
        || (tone > 65 && tone < 222 && dx * dx + dy * dy < radius * radius)) color = POP_BLACK;
      const target = pixel * 4;
      result.data[target] = color[0]; result.data[target + 1] = color[1]; result.data[target + 2] = color[2];
    }
  }
  return result;
}

/**
 * Convert bounded RGBA8 pixels without mutating the source. Transparent pixels
 * are composited on white before processing; output pixels are fully opaque.
 * Throws ImageConversionError for invalid image dimensions, data or options.
 */
export function convert(image: RgbaImage, options?: PopArtOptions): ConversionResult {
  const source = validateImage(image);
  const resolved = resolveOptions<PopArtOptions>(options, OPTION_SCHEMA);
  return { image: popArt(flattenImage(source), source.width, source.height, resolved) };
}
