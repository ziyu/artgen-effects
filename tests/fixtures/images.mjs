/** Synthetic test inputs only: no photos, fonts, network, or image codecs. */
export const STYLES = ['ascii', 'pixel', 'cyanotype', 'risograph', 'pop-art', 'pointillism'];

export const STRESS_OPTIONS = {
  ascii: { asciiColumns: 85, invert: true },
  pixel: { pixelSize: 4, colors: 32, dither: true },
  cyanotype: { contrast: 2, exposure: 1 },
  risograph: { inkCount: 3, dotSize: 3, registration: 4, grain: 0.25, seed: 4294967295 },
  'pop-art': { dotSize: 3, outline: 1 },
  pointillism: { dotSize: 3, jitter: 0.5, seed: 4294967295 },
};

export const REGRESSION_INPUTS = [
  { id: 'gradient', width: 53, height: 39, kind: 'gradient' },
  { id: 'alpha', width: 41, height: 29, kind: 'alpha' },
  { id: 'noise-wide', width: 71, height: 11, kind: 'noise' },
  { id: 'single-transparent', width: 1, height: 1, kind: 'transparent' },
];

export function makeImage(width, height, kind = 'gradient') {
  const data = new Uint8Array(width * height * 4);
  let state = 0x12345678;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      if (Array.isArray(kind)) {
        data.set(kind, index);
        continue;
      }
      for (let channel = 0; channel < 3; channel++) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        data[index + channel] = kind === 'noise' ? state & 255
          : channel === 0 ? Math.round(x * 255 / Math.max(1, width - 1))
            : channel === 1 ? Math.round(y * 255 / Math.max(1, height - 1))
              : (x * 11 + y * 7) & 255;
      }
      data[index + 3] = kind === 'transparent' ? 0
        : kind === 'alpha' ? [0, 32, 127, 192, 255][(x + 2 * y) % 5] : 255;
    }
  }
  return { width, height, data };
}

/** Independent, explicit white matte used for the public input contract test. */
export function compositeOnWhite(image) {
  const data = new Uint8Array(image.data.length);
  for (let index = 0; index < data.length; index += 4) {
    const opacity = image.data[index + 3] / 255;
    for (let channel = 0; channel < 3; channel++) {
      data[index + channel] = Math.round(image.data[index + channel] * opacity + 255 * (1 - opacity));
    }
    data[index + 3] = 255;
  }
  return { width: image.width, height: image.height, data };
}

export function rgbAt(image, x, y) {
  return [...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 3)];
}
