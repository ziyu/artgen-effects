import { PAPER, flattenImage, makeImage, noise, type Rgb } from '../../../src/shared/pixels.js';
import { resolveOptions, validateImage, type OptionSchema, type ResolvedOptions } from '../../../src/shared/validation.js';
import type { ConversionResult, RgbaImage, RgbaImageOutput } from '../../../src/shared/types.js';

export { MAX_IMAGE_EDGE, ALGORITHM_VERSION } from '../../../src/shared/constants.js';
export { ImageConversionError } from '../../../src/shared/types.js';
export type { RgbaImage, RgbaImageOutput, ConversionResult } from '../../../src/shared/types.js';

export interface RisographOptions {
  /** Number of spot-ink layers: 2 or 3; default 2. */
  inkCount?: 2 | 3 | undefined;
  /** Halftone spacing in pixels: integer 3–12; default 6. */
  dotSize?: number | undefined;
  /** Ink registration offset in pixels: integer 0–4; default 1. */
  registration?: number | undefined;
  /** Paper and ink texture amount: 0–0.25; default 0.06. */
  grain?: number | undefined;
  /** Deterministic texture seed: integer 0–4294967295; default 1. */
  seed?: number | undefined;
}

export type Options = RisographOptions;
export type Result = ConversionResult;

const OPTION_SCHEMA = {
  inkCount: { type: 'number', default: 2, min: 2, max: 3, integer: true, choices: [2, 3] },
  dotSize: { type: 'number', default: 6, min: 3, max: 12, integer: true },
  registration: { type: 'number', default: 1, min: 0, max: 4, integer: true },
  grain: { type: 'number', default: 0.06, min: 0, max: 0.25 },
  seed: { type: 'number', default: 1, min: 0, max: 4294967295, integer: true },
} satisfies OptionSchema<RisographOptions>;

const RISO_INKS: readonly Rgb[] = [[37, 105, 176], [233, 75, 126], [247, 192, 55]];

/** Clustered-dot thresholds have equal tone steps and expand from a round center. */
const DOT_SCREEN = (() => {
  const positions = Array.from({ length: 256 }, (_, index) => ({
    index, distance: ((index % 16) - 7.5) ** 2 + (Math.floor(index / 16) - 7.5) ** 2,
  })).sort((a, b) => a.distance - b.distance || a.index - b.index);
  const screen = new Float32Array(256);
  positions.forEach((position, rank) => { screen[position.index] = (rank + 0.5) / 256; });
  return screen;
})();

function risograph(rgb: Uint8Array, width: number, height: number, options: ResolvedOptions<RisographOptions>): RgbaImageOutput {
  const result = makeImage(width, height);
  const grain = new Uint8Array(width * height);
  const grainFactors = new Float64Array(256);
  const grainCutoffs = new Float64Array(256);
  const paperColors = new Uint8Array(256 * 3);
  for (let value = 0; value < 256; value++) {
    const paperNoise = value / 255;
    grainFactors[value] = 1 + (paperNoise - 0.5) * options.grain * 2;
    grainCutoffs[value] = paperNoise * options.grain * 0.1;
    const variation = (paperNoise - 0.5) * options.grain * 28;
    for (let channel = 0; channel < 3; channel++) paperColors[value * 3 + channel] = Math.round(PAPER[channel] + variation);
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      const value = Math.floor(noise(x, y, options.seed) * 256);
      grain[pixel] = value;
      result.data[pixel * 4] = paperColors[value * 3];
      result.data[pixel * 4 + 1] = paperColors[value * 3 + 1];
      result.data[pixel * 4 + 2] = paperColors[value * 3 + 2];
    }
  }
  const angles = [15, 75, 0];
  for (let layer = 0; layer < options.inkCount; layer++) {
    const angle = angles[layer] * Math.PI / 180;
    const cosine = Math.cos(angle) / options.dotSize;
    const sine = Math.sin(angle) / options.dotSize;
    const offsetX = layer === 1 ? options.registration : layer === 2 ? -options.registration : 0;
    const offsetY = layer === 1 ? -options.registration : layer === 2 ? options.registration : 0;
    const ink = RISO_INKS[layer];
    const overprintRed = new Uint8Array(256);
    const overprintGreen = new Uint8Array(256);
    const overprintBlue = new Uint8Array(256);
    for (let value = 0; value < 256; value++) {
      overprintRed[value] = Math.round(value * (0.12 + 0.88 * ink[0] / 255));
      overprintGreen[value] = Math.round(value * (0.12 + 0.88 * ink[1] / 255));
      overprintBlue[value] = Math.round(value * (0.12 + 0.88 * ink[2] / 255));
    }
    const xCosines = new Float64Array(width);
    const xSines = new Float64Array(width);
    for (let x = 0; x < width; x++) {
      xCosines[x] = (x + 0.5) * cosine;
      xSines[x] = (x + 0.5) * sine;
    }
    const xStart = Math.max(0, offsetX);
    const xEnd = Math.min(width, width + offsetX);
    const threeInks = options.inkCount === 3;
    for (let y = 0; y < height; y++) {
      const sy = y - offsetY;
      if (sy < 0 || sy >= height) continue;
      const rowSine = (sy + 0.5) * sine;
      const rowCosine = (sy + 0.5) * cosine;
      for (let x = xStart; x < xEnd; x++) {
        const sx = x - offsetX;
        const i = (sy * width + sx) * 3;
        const tone = threeInks ? rgb[i + layer] : 0.8 * rgb[i + layer] + 0.2 * rgb[i + 2];
        const texture = grain[y * width + x];
        const coverage = (1 - tone / 255) * grainFactors[texture] - grainCutoffs[texture];
        const u = xCosines[sx] + rowSine;
        const v = rowCosine - xSines[sx];
        const screenX = ((u - Math.floor(u)) * 16) | 0;
        const screenY = ((v - Math.floor(v)) * 16) | 0;
        if (coverage <= DOT_SCREEN[screenY * 16 + screenX]) continue;
        const target = (y * width + x) * 4;
        // Transparent spot-ink overprinting, rather than tinting one grayscale layer.
        result.data[target] = overprintRed[result.data[target]];
        result.data[target + 1] = overprintGreen[result.data[target + 1]];
        result.data[target + 2] = overprintBlue[result.data[target + 2]];
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
export function convert(image: RgbaImage, options?: RisographOptions): ConversionResult {
  const source = validateImage(image);
  const resolved = resolveOptions<RisographOptions>(options, OPTION_SCHEMA);
  return { image: risograph(flattenImage(source), source.width, source.height, resolved) };
}
