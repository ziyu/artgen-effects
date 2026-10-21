import { PAPER, clamp, flattenImage, makeImage, noise } from '../../../src/shared/pixels.js';
import { resolveOptions, validateImage, type OptionSchema, type ResolvedOptions } from '../../../src/shared/validation.js';
import type { ConversionResult, RgbaImage, RgbaImageOutput } from '../../../src/shared/types.js';

export { MAX_IMAGE_EDGE, ALGORITHM_VERSION } from '../../../src/shared/constants.js';
export { ImageConversionError } from '../../../src/shared/types.js';
export type { RgbaImage, RgbaImageOutput, ConversionResult } from '../../../src/shared/types.js';

export interface PointillismOptions {
  /** Sample spacing in pixels: integer 3–12; default 4. */
  dotSize?: number | undefined;
  /** Dot-center displacement relative to spacing: 0–0.5; default 0.35. */
  jitter?: number | undefined;
  /** Deterministic texture seed: integer 0–4294967295; default 1. */
  seed?: number | undefined;
}

export type Options = PointillismOptions;
export type Result = ConversionResult;

const OPTION_SCHEMA = {
  dotSize: { type: 'number', default: 4, min: 3, max: 12, integer: true },
  jitter: { type: 'number', default: 0.35, min: 0, max: 0.5 },
  seed: { type: 'number', default: 1, min: 0, max: 4294967295, integer: true },
} satisfies OptionSchema<PointillismOptions>;

function pointillism(rgb: Uint8Array, width: number, height: number, options: ResolvedOptions<PointillismOptions>): RgbaImageOutput {
  const result = makeImage(width, height, PAPER);
  const spacing = options.dotSize;
  const columns = Math.ceil(width / spacing);
  const rows = Math.ceil(height / spacing);
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < columns; gx++) {
      const xStart = gx * spacing, yStart = gy * spacing;
      const xEnd = Math.min(width, xStart + spacing), yEnd = Math.min(height, yStart + spacing);
      let red = 0, green = 0, blue = 0, count = 0;
      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const i = (y * width + x) * 3;
          red += rgb[i]; green += rgb[i + 1]; blue += rgb[i + 2]; count++;
        }
      }
      red /= count; green /= count; blue /= count;
      const tone = (54 * red + 183 * green + 19 * blue) / 256;
      const centerX = (xStart + xEnd) / 2 + (noise(gx, gy, options.seed) * 2 - 1) * spacing * options.jitter;
      const centerY = (yStart + yEnd) / 2 + (noise(gx, gy, options.seed ^ 0x68bc21eb) * 2 - 1) * spacing * options.jitter;
      const radius = spacing * (0.3 + 0.25 * (1 - tone / 255));
      const r = Math.round(clamp(tone + (red - tone) * 1.2));
      const g = Math.round(clamp(tone + (green - tone) * 1.2));
      const b = Math.round(clamp(tone + (blue - tone) * 1.2));
      for (let y = Math.max(0, Math.floor(centerY - radius)); y < Math.min(height, Math.ceil(centerY + radius)); y++) {
        for (let x = Math.max(0, Math.floor(centerX - radius)); x < Math.min(width, Math.ceil(centerX + radius)); x++) {
          const dx = x + 0.5 - centerX, dy = y + 0.5 - centerY;
          if (dx * dx + dy * dy > radius * radius) continue;
          const target = (y * width + x) * 4;
          result.data[target] = r; result.data[target + 1] = g; result.data[target + 2] = b;
        }
      }
    }
  }
  return result;
}

/**
 * Convert bounded RGBA8 pixels without mutating the source. Transparent pixels
 * are composited on white before processing; output pixels are fully opaque.
 * Throws ImageConversionError for invalid image dimensions, data or options.
 */
export function convert(image: RgbaImage, options?: PointillismOptions): ConversionResult {
  const source = validateImage(image);
  const resolved = resolveOptions<PointillismOptions>(options, OPTION_SCHEMA);
  return { image: pointillism(flattenImage(source), source.width, source.height, resolved) };
}
