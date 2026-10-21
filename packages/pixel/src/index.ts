import { clamp, flattenImage, makeImage, nearestColor, type Rgb } from '../../../src/shared/pixels.js';
import { resolveOptions, validateImage, type OptionSchema, type ResolvedOptions } from '../../../src/shared/validation.js';
import type { ConversionResult, RgbaImage, RgbaImageOutput } from '../../../src/shared/types.js';

export { MAX_IMAGE_EDGE, ALGORITHM_VERSION } from '../../../src/shared/constants.js';
export { ImageConversionError } from '../../../src/shared/types.js';
export type { RgbaImage, RgbaImageOutput, ConversionResult } from '../../../src/shared/types.js';

export interface PixelOptions {
  /** Block size in pixels: integer 4–32; default 8. */
  pixelSize?: number | undefined;
  /** Maximum palette size: 8, 16 or 32; default 16. */
  colors?: 8 | 16 | 32 | undefined;
  /** Apply Floyd–Steinberg dithering on the block grid; default false. */
  dither?: boolean | undefined;
}

export type Options = PixelOptions;
export type Result = ConversionResult;

const OPTION_SCHEMA = {
  pixelSize: { type: 'number', default: 8, min: 4, max: 32, integer: true },
  colors: { type: 'number', default: 16, min: 8, max: 32, choices: [8, 16, 32] },
  dither: { type: 'boolean', default: false },
} satisfies OptionSchema<PixelOptions>;

interface HistogramColor { color: Rgb; count: number }
interface ColorBox { colors: HistogramColor[]; range: number; channel: number; count: number }

function colorBox(colors: HistogramColor[]): ColorBox {
  const low = [255, 255, 255];
  const high = [0, 0, 0];
  let count = 0;
  for (const entry of colors) {
    count += entry.count;
    for (let channel = 0; channel < 3; channel++) {
      low[channel] = Math.min(low[channel], entry.color[channel]);
      high[channel] = Math.max(high[channel], entry.color[channel]);
    }
  }
  const ranges = high.map((value, channel) => value - low[channel]);
  const channel = ranges[1] >= ranges[0] && ranges[1] >= ranges[2] ? 1 : ranges[0] >= ranges[2] ? 0 : 2;
  return { colors, count, channel, range: ranges[channel] };
}

/** Bounded median-cut: at most 4096 histogram bins and 32 palette boxes, no k-means. */
function medianCut(samples: Uint8Array, colorCount: number): Rgb[] {
  const counts = new Uint32Array(4096);
  const sums = new Uint32Array(4096 * 3);
  for (let i = 0; i < samples.length; i += 3) {
    const key = ((samples[i] >>> 4) << 8) | ((samples[i + 1] >>> 4) << 4) | (samples[i + 2] >>> 4);
    counts[key]++;
    sums[key * 3] += samples[i];
    sums[key * 3 + 1] += samples[i + 1];
    sums[key * 3 + 2] += samples[i + 2];
  }
  const entries: HistogramColor[] = [];
  for (let key = 0; key < counts.length; key++) {
    const count = counts[key];
    if (count) entries.push({ count, color: [
      sums[key * 3] / count, sums[key * 3 + 1] / count, sums[key * 3 + 2] / count,
    ] });
  }
  const boxes = [colorBox(entries)];
  while (boxes.length < colorCount) {
    let chosen = -1;
    let score = -1;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      const candidate = box.range * Math.sqrt(box.count);
      if (box.colors.length > 1 && candidate > score) {
        chosen = i;
        score = candidate;
      }
    }
    if (chosen < 0) break;
    const box = boxes[chosen];
    const channel = box.channel;
    box.colors.sort((a, b) => a.color[channel] - b.color[channel]
      || a.color[0] - b.color[0] || a.color[1] - b.color[1] || a.color[2] - b.color[2]);
    let weight = 0;
    let split = 0;
    do { weight += box.colors[split++].count; }
    while (weight < box.count / 2 && split < box.colors.length - 1);
    boxes.splice(chosen, 1, colorBox(box.colors.slice(0, split)), colorBox(box.colors.slice(split)));
  }
  return boxes.map(box => {
    const sums = [0, 0, 0];
    for (const entry of box.colors) {
      for (let channel = 0; channel < 3; channel++) sums[channel] += entry.color[channel] * entry.count;
    }
    return [Math.round(sums[0] / box.count), Math.round(sums[1] / box.count), Math.round(sums[2] / box.count)];
  });
}

function pixelArt(rgb: Uint8Array, width: number, height: number, options: ResolvedOptions<PixelOptions>): RgbaImageOutput {
  const size = options.pixelSize;
  const columns = Math.ceil(width / size);
  const rows = Math.ceil(height / size);
  const samples = new Uint8Array(columns * rows * 3);
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < columns; gx++) {
      const xEnd = Math.min(width, (gx + 1) * size);
      const yEnd = Math.min(height, (gy + 1) * size);
      let red = 0, green = 0, blue = 0, count = 0;
      for (let y = gy * size; y < yEnd; y++) {
        for (let x = gx * size; x < xEnd; x++) {
          const i = (y * width + x) * 3;
          red += rgb[i]; green += rgb[i + 1]; blue += rgb[i + 2]; count++;
        }
      }
      const i = (gy * columns + gx) * 3;
      samples[i] = Math.round(red / count);
      samples[i + 1] = Math.round(green / count);
      samples[i + 2] = Math.round(blue / count);
    }
  }
  const palette = medianCut(samples, options.colors);
  const result = makeImage(width, height);
  let currentError = new Float32Array((columns + 2) * 3);
  let nextError = new Float32Array(currentError.length);
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < columns; gx++) {
      const i = (gy * columns + gx) * 3;
      const e = (gx + 1) * 3;
      const red = clamp(samples[i] + currentError[e]);
      const green = clamp(samples[i + 1] + currentError[e + 1]);
      const blue = clamp(samples[i + 2] + currentError[e + 2]);
      const color = nearestColor(red, green, blue, palette);
      if (options.dither) {
        const differences = [red - color[0], green - color[1], blue - color[2]];
        for (let channel = 0; channel < 3; channel++) {
          const error = differences[channel] / 16;
          currentError[e + 3 + channel] += error * 7;
          nextError[e - 3 + channel] += error * 3;
          nextError[e + channel] += error * 5;
          nextError[e + 3 + channel] += error;
        }
      }
      const yEnd = Math.min(height, (gy + 1) * size);
      const xEnd = Math.min(width, (gx + 1) * size);
      for (let y = gy * size; y < yEnd; y++) {
        for (let x = gx * size; x < xEnd; x++) {
          const target = (y * width + x) * 4;
          result.data[target] = color[0];
          result.data[target + 1] = color[1];
          result.data[target + 2] = color[2];
        }
      }
    }
    [currentError, nextError] = [nextError, currentError];
    nextError.fill(0);
  }
  return result;
}

/**
 * Convert bounded RGBA8 pixels without mutating the source. Transparent pixels
 * are composited on white before processing; output pixels are fully opaque.
 * Throws ImageConversionError for invalid image dimensions, data or options.
 */
export function convert(image: RgbaImage, options?: PixelOptions): ConversionResult {
  const source = validateImage(image);
  const resolved = resolveOptions<PixelOptions>(options, OPTION_SCHEMA);
  return { image: pixelArt(flattenImage(source), source.width, source.height, resolved) };
}
