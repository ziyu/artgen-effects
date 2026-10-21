import type { RgbaImage, RgbaImageOutput } from './types.js';

export type Rgb = readonly [number, number, number];

export const PAPER: Rgb = [250, 247, 235];

export function clamp(value: number, min = 0, max = 255): number {
  return Math.max(min, Math.min(max, value));
}

export function luminance(red: number, green: number, blue: number): number {
  return (54 * red + 183 * green + 19 * blue + 128) >>> 8;
}

/** Integer hashing keeps texture independent of call order and platform RNGs. */
export function noise(x: number, y: number, seed: number): number {
  let value = seed ^ Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 1, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function makeImage(width: number, height: number, background?: Rgb): RgbaImageOutput {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    if (background) {
      data[i] = background[0];
      data[i + 1] = background[1];
      data[i + 2] = background[2];
    }
    data[i + 3] = 255;
  }
  return { width, height, data };
}

/** All six styles make opaque artwork; transparent input is composited on paper white. */
export function flattenImage(image: RgbaImage): Uint8Array {
  const result = new Uint8Array(image.width * image.height * 3);
  for (let source = 0, target = 0; source < image.data.length; source += 4, target += 3) {
    const alpha = image.data[source + 3];
    const white = 255 * (255 - alpha);
    result[target] = Math.round((image.data[source] * alpha + white) / 255);
    result[target + 1] = Math.round((image.data[source + 1] * alpha + white) / 255);
    result[target + 2] = Math.round((image.data[source + 2] * alpha + white) / 255);
  }
  return result;
}

export function nearestColor(red: number, green: number, blue: number, palette: readonly Rgb[]): Rgb {
  let best = palette[0];
  let distance = Infinity;
  for (const color of palette) {
    const dr = red - color[0];
    const dg = green - color[1];
    const db = blue - color[2];
    const candidate = 3 * dr * dr + 6 * dg * dg + db * db;
    if (candidate < distance) {
      distance = candidate;
      best = color;
    }
  }
  return best;
}
