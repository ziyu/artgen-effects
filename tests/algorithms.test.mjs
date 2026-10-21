import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'node:test';
import { STYLES, STRESS_OPTIONS, makeImage, compositeOnWhite, rgbAt } from './fixtures/images.mjs';

const packages = Object.fromEntries(await Promise.all(STYLES.map(async style => [
  style, await import(`../packages/${style}/dist/index.js`),
])));
const baseline = JSON.parse(await readFile(new URL('./fixtures/algorithm-v1.json', import.meta.url), 'utf8'));
const hash = data => createHash('sha256').update(data).digest('hex');

function assertValidOutput(style, result, source) {
  assert.ok(result && typeof result === 'object');
  assert.deepEqual(Object.keys(result).sort(), style === 'ascii' ? ['asciiText', 'image'] : ['image']);
  const { width, height, data } = result.image;
  assert.ok(Number.isInteger(width) && width >= 1 && width <= 512);
  assert.ok(Number.isInteger(height) && height >= 1 && height <= 512);
  assert.ok(data instanceof Uint8Array);
  assert.equal(data.length, width * height * 4);
  assert.notEqual(data.buffer, source.data.buffer, 'output owns a new buffer');
  for (let index = 3; index < data.length; index += 4) assert.equal(data[index], 255);
  if (style === 'ascii') {
    assert.equal(typeof result.asciiText, 'string');
    const rows = result.asciiText.split('\n');
    assert.ok(rows.every(row => row.length === rows[0].length));
    assert.equal(width, rows[0].length * 6);
    assert.equal(height, rows.length * 8);
    assert.match(result.asciiText, /^[ .:\-+=%*@#\n]+$/);
  } else {
    assert.equal(width, source.width);
    assert.equal(height, source.height);
  }
}

function invalid(mod, image, options) {
  assert.throws(() => mod.convert(image, options), error => {
    assert.ok(error instanceof mod.ImageConversionError);
    assert.equal(error.name, 'ImageConversionError');
    assert.equal(error.code, 'invalid_request');
    return true;
  });
}

describe('algorithm version 1 extraction regression', () => {
  assert.equal(baseline.algorithmVersion, '1');
  for (const fixture of baseline.cases) {
    test(`${fixture.style}: ${fixture.input.id}/${fixture.options ? 'custom' : 'defaults'} matches frozen RGBA bytes`, () => {
      const { width, height, kind } = fixture.input;
      const result = packages[fixture.style].convert(makeImage(width, height, kind), fixture.options);
      assert.equal(result.image.width, fixture.output.width);
      assert.equal(result.image.height, fixture.output.height);
      assert.equal(hash(result.image.data), fixture.output.rgbaSha256);
      assert.equal(result.asciiText, fixture.output.asciiText);
    });
  }
});

for (const style of STYLES) {
  const mod = packages[style];
  describe(style, () => {
    test('exports the supported image limit and algorithm version', () => {
      assert.equal(mod.MAX_IMAGE_EDGE, 512);
      assert.equal(mod.ALGORITHM_VERSION, '1');
    });

    test('is deterministic, opaque, bounded, and leaves the input and options untouched', () => {
      const input = Object.freeze(makeImage(53, 39));
      const before = input.data.slice();
      const options = Object.freeze({ ...STRESS_OPTIONS[style] });
      const first = mod.convert(input, options);
      assertValidOutput(style, first, input);
      // Interleaving unrelated work catches hidden PRNG or mutable-option state.
      mod.convert(makeImage(11, 17, 'noise'));
      assert.deepEqual(mod.convert(input, options), first);
      assert.deepEqual(input.data, before);
      assert.deepEqual(options, STRESS_OPTIONS[style]);
    });

    test('accepts a clamped view with an offset and flattens every alpha level onto white', () => {
      const source = makeImage(41, 29, 'alpha');
      const storage = new Uint8ClampedArray(source.data.length + 32).fill(99);
      const view = storage.subarray(16, storage.length - 16);
      view.set(source.data);
      const before = storage.slice();
      const input = { ...source, data: view };
      const result = mod.convert(input);
      assert.deepEqual(result, mod.convert(compositeOnWhite(source)));
      assert.deepEqual(storage, before, 'both input and surrounding sentinel bytes are unchanged');
      assertValidOutput(style, result, input);
    });

    test('handles a transparent single pixel and both extreme aspect ratios', () => {
      assert.deepEqual(mod.convert(makeImage(1, 1, [255, 0, 0, 0])), mod.convert(makeImage(1, 1, [255, 255, 255, 255])));
      for (const [width, height] of [[1, 1], [1, 512], [512, 1]]) {
        const input = makeImage(width, height);
        assertValidOutput(style, mod.convert(input, STRESS_OPTIONS[style]), input);
      }
    });

    test('rejects malformed images with a stable public error', () => {
      const values = [
        undefined, null, [], 1, {},
        { width: 0, height: 1, data: new Uint8Array() },
        { width: -1, height: 1, data: new Uint8Array() },
        { width: 1.5, height: 1, data: new Uint8Array(6) },
        { width: '1', height: 1, data: new Uint8Array(4) },
        { width: NaN, height: 1, data: new Uint8Array(4) },
        { width: 1, height: Infinity, data: new Uint8Array(4) },
        { width: 513, height: 1, data: new Uint8Array(513 * 4) },
        { width: 1, height: 513, data: new Uint8Array(513 * 4) },
        { width: 2, height: 2, data: new Uint8Array(15) },
        { width: 1, height: 1, data: new Uint8Array(5) },
        ...[undefined, [0, 0, 0, 255], new Uint16Array(4), new Float32Array(4), new ArrayBuffer(4), new DataView(new ArrayBuffer(4))]
          .map(data => ({ width: 1, height: 1, data })),
      ];
      for (const value of values) invalid(mod, value);
    });

    test('rejects unsupported options and non-object option containers', () => {
      const input = makeImage(2, 2);
      for (const options of [null, [], false, 1, '', { unsupported: 1 }, { [Symbol('unknown')]: 1 }]) {
        invalid(mod, input, options);
      }
      invalid(mod, input, style === 'ascii' ? { pixelSize: 8 } : { asciiColumns: 24 });
    });
  });
}

// Bounds are part of the public package API, independent of implementation schemas.
const numericOptions = {
  ascii: { asciiColumns: [24, 85, true] },
  pixel: { pixelSize: [4, 32, true], colors: [8, 32, true] },
  cyanotype: { contrast: [0.5, 2, false], exposure: [-1, 1, false] },
  risograph: { inkCount: [2, 3, true], dotSize: [3, 12, true], registration: [0, 4, true], grain: [0, 0.25, false], seed: [0, 4294967295, true] },
  'pop-art': { dotSize: [3, 12, true], outline: [0, 1, false] },
  pointillism: { dotSize: [3, 12, true], jitter: [0, 0.5, false], seed: [0, 4294967295, true] },
};
describe('style option contracts', () => {
  for (const [style, options] of Object.entries(numericOptions)) {
    test(`${style}: validates numeric bounds and integer choices`, () => {
      const input = makeImage(8, 8);
      for (const [key, [min, max, integer]] of Object.entries(options)) {
        const bad = [NaN, Infinity, -Infinity, String(min), null, true, min - 1, max + 1];
        if (integer) bad.push(min + 0.5);
        for (const value of bad) invalid(packages[style], input, { [key]: value });
        assertValidOutput(style, packages[style].convert(input, { [key]: min }), input);
        assertValidOutput(style, packages[style].convert(input, { [key]: max }), input);
      }
    });
  }
  test('palette counts are 8, 16, or 32, and switches require booleans', () => {
    const input = makeImage(8, 8);
    invalid(packages.pixel, input, { colors: 24 });
    for (const value of [0, 1, 'true', null]) {
      invalid(packages.pixel, input, { dither: value });
      invalid(packages.ascii, input, { invert: value });
    }
  });
});

describe('visual properties', () => {
  for (const dither of [false, true]) {
    test(`pixel blocks stay uniform and use at most eight colors (dither=${dither})`, () => {
      const result = packages.pixel.convert(makeImage(53, 39), { pixelSize: 4, colors: 8, dither }).image;
      const colors = new Set();
      for (let y = 0; y < result.height; y++) for (let x = 0; x < result.width; x++) {
        const color = rgbAt(result, x, y);
        colors.add(color.join(','));
        assert.deepEqual(color, rgbAt(result, Math.floor(x / 4) * 4, Math.floor(y / 4) * 4));
      }
      assert.ok(colors.size > 2 && colors.size <= 8);
    });
  }

  test('ASCII text and bitmap have the same cells and inversion changes both', () => {
    const input = makeImage(192, 128);
    const result = packages.ascii.convert(input, { asciiColumns: 24 });
    const inverted = packages.ascii.convert(input, { asciiColumns: 24, invert: true });
    assertValidOutput('ascii', result, input);
    assert.equal(result.image.width, 24 * 6);
    assert.match(result.asciiText, /[.:\-+=%*@#]/);
    assert.notEqual(inverted.asciiText, result.asciiText);
    assert.notDeepEqual(inverted.image.data, result.image.data);
  });

  test('cyanotype preserves grayscale order, blue shadows, and warm paper highlights', () => {
    const input = makeImage(256, 1);
    for (let x = 0; x < 256; x++) input.data.set([x, x, x, 255], x * 4);
    const result = packages.cyanotype.convert(input).image;
    for (let x = 1; x < 256; x++) for (let channel = 0; channel < 3; channel++) {
      assert.ok(result.data[x * 4 + channel] >= result.data[(x - 1) * 4 + channel]);
    }
    assert.ok(result.data[2] > result.data[0]);
    assert.ok(rgbAt(result, 255, 0)[0] > 240);
    assert.notDeepEqual(packages.cyanotype.convert(input, { exposure: -1 }).image.data, result.data);
  });

  test('risograph separates spot inks and responds to registration and ink count', () => {
    const input = makeImage(64, 32, [255, 0, 0, 255]);
    for (let y = 0; y < 32; y++) for (let x = 32; x < 64; x++) input.data.set([0, 0, 255, 255], (y * 64 + x) * 4);
    const options = { grain: 0, registration: 0 };
    const result = packages.risograph.convert(input, options).image;
    const left = new Set(), right = new Set();
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) (x < 32 ? left : right).add(rgbAt(result, x, y).join(','));
    assert.notDeepEqual(left, right);
    assert.notDeepEqual(packages.risograph.convert(input, { ...options, inkCount: 3 }).image.data, result.data);
    assert.notDeepEqual(packages.risograph.convert(input, { ...options, registration: 3 }).image.data, result.data);
  });

  test('pop art has a limited graphic palette and controllable contours', () => {
    const result = packages['pop-art'].convert(makeImage(64, 48)).image;
    const colors = new Set();
    for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) colors.add(rgbAt(result, x, y).join(','));
    assert.ok(colors.size > 3 && colors.size <= 8);
    const silhouette = makeImage(64, 48, [255, 255, 255, 255]);
    for (let y = 12; y < 36; y++) for (let x = 16; x < 48; x++) silhouette.data.set([40, 45, 50, 255], (y * 64 + x) * 4);
    assert.notDeepEqual(packages['pop-art'].convert(silhouette, { outline: 1 }).image.data,
      packages['pop-art'].convert(silhouette, { outline: 0 }).image.data);
  });

  for (const style of ['risograph', 'pointillism']) {
    test(`${style} changes texture when its seed changes`, () => {
      const input = makeImage(64, 48);
      const first = packages[style].convert(input, { seed: 0 });
      const second = packages[style].convert(input, { seed: 4294967295 });
      assert.notDeepEqual(first.image.data, second.image.data);
      assert.equal(first.image.width, second.image.width);
      assert.equal(first.image.height, second.image.height);
    });
  }

  test('pointillism retains regional color in pigment dots on visible paper', () => {
    const input = makeImage(64, 32, [220, 30, 30, 255]);
    for (let y = 0; y < 32; y++) for (let x = 32; x < 64; x++) input.data.set([20, 40, 210, 255], (y * 64 + x) * 4);
    const result = packages.pointillism.convert(input, { jitter: 0 }).image;
    let paper = 0, redDots = 0, blueDots = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
      const [red, green, blue] = rgbAt(result, x, y);
      if (red === 250 && green === 247 && blue === 235) paper++;
      if (x < 28 && red > blue + 100) redDots++;
      if (x > 36 && blue > red + 100) blueDots++;
    }
    assert.ok(paper > 0 && redDots > 0 && blueDots > 0);
  });
});
