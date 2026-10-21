import { clamp, flattenImage, luminance, makeImage, type Rgb } from '../../../src/shared/pixels.js';
import { resolveOptions, validateImage, type OptionSchema, type ResolvedOptions } from '../../../src/shared/validation.js';
import type { ConversionResult, RgbaImage, RgbaImageOutput } from '../../../src/shared/types.js';

export { MAX_IMAGE_EDGE, ALGORITHM_VERSION } from '../../../src/shared/constants.js';
export { ImageConversionError } from '../../../src/shared/types.js';
export type { RgbaImage, RgbaImageOutput, ConversionResult } from '../../../src/shared/types.js';

export interface CyanotypeOptions {
  /** Tonal contrast: 0.5–2; default 1.15. */
  contrast?: number | undefined;
  /** Exposure adjustment in stops: -1–1; default 0. */
  exposure?: number | undefined;
}

export type Options = CyanotypeOptions;
export type Result = ConversionResult;

const OPTION_SCHEMA = {
  contrast: { type: 'number', default: 1.15, min: 0.5, max: 2 },
  exposure: { type: 'number', default: 0, min: -1, max: 1 },
} satisfies OptionSchema<CyanotypeOptions>;

function cyanotype(rgb: Uint8Array, width: number, height: number, options: ResolvedOptions<CyanotypeOptions>): RgbaImageOutput {
  const result = makeImage(width, height);
  const blue: Rgb = [12, 43, 100];
  const paper: Rgb = [246, 246, 231];
  const lookup = new Uint8Array(256 * 3);
  const exposure = 2 ** options.exposure;
  for (let value = 0; value < 256; value++) {
    const tone = clamp((value / 255 * exposure - 0.5) * options.contrast + 0.5, 0, 1);
    for (let channel = 0; channel < 3; channel++) lookup[value * 3 + channel] = Math.round(blue[channel] + (paper[channel] - blue[channel]) * tone);
  }
  for (let source = 0, target = 0; source < rgb.length; source += 3, target += 4) {
    const tone = luminance(rgb[source], rgb[source + 1], rgb[source + 2]) * 3;
    result.data[target] = lookup[tone];
    result.data[target + 1] = lookup[tone + 1];
    result.data[target + 2] = lookup[tone + 2];
  }
  return result;
}

/**
 * Convert bounded RGBA8 pixels without mutating the source. Transparent pixels
 * are composited on white before processing; output pixels are fully opaque.
 * Throws ImageConversionError for invalid image dimensions, data or options.
 */
export function convert(image: RgbaImage, options?: CyanotypeOptions): ConversionResult {
  const source = validateImage(image);
  const resolved = resolveOptions<CyanotypeOptions>(options, OPTION_SCHEMA);
  return { image: cyanotype(flattenImage(source), source.width, source.height, resolved) };
}
