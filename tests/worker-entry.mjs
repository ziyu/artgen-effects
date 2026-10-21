// Test harness: import the final artifacts consumers install, never src/ files.
import * as ascii from '../packages/ascii/dist/index.js';
import * as pixel from '../packages/pixel/dist/index.js';
import * as cyanotype from '../packages/cyanotype/dist/index.js';
import * as risograph from '../packages/risograph/dist/index.js';
import * as popArt from '../packages/pop-art/dist/index.js';
import * as pointillism from '../packages/pointillism/dist/index.js';
import { makeImage } from './fixtures/images.mjs';

const packages = { ascii, pixel, cyanotype, risograph, 'pop-art': popArt, pointillism };
const digest = async data => [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('');

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/health') {
      return Response.json({
        runtime: navigator.userAgent,
        nodeGlobals: typeof process !== 'undefined' || typeof Buffer !== 'undefined',
        bindings: Object.keys(env).length,
        styles: Object.keys(packages),
      });
    }
    const spec = await request.json();
    const mod = packages[spec.style];
    if (!mod) return Response.json({ error: 'Unknown test style' }, { status: 400 });
    const image = makeImage(spec.width ?? 1, spec.height ?? 1, spec.kind ?? 'gradient');
    if (spec.clamped) image.data = new Uint8ClampedArray(image.data);
    let options = spec.options;
    if (spec.invalid === 'oversized') image.width = 513;
    if (spec.invalid === 'short-data') image.data = image.data.subarray(1);
    if (spec.invalid === 'wrong-data-type') image.data = [...image.data];
    if (spec.invalid === 'unknown-option') options = { unknown: true };
    try {
      const before = spec.invalid ? null : await digest(image.data);
      const result = mod.convert(image, options);
      if (before !== null && await digest(image.data) !== before) throw new Error('Input pixels were mutated');
      if (result.image.data.buffer === image.data.buffer) throw new Error('Output aliases input pixels');
      for (let index = 3; index < result.image.data.length; index += 4) {
        if (result.image.data[index] !== 255) throw new Error('Output is not opaque');
      }
      return Response.json({
        width: result.image.width,
        height: result.image.height,
        byteLength: result.image.data.length,
        rgbaSha256: await digest(result.image.data),
        ...(result.asciiText === undefined ? {} : { asciiText: result.asciiText }),
        algorithmVersion: mod.ALGORITHM_VERSION,
        maxImageEdge: mod.MAX_IMAGE_EDGE,
      });
    } catch (error) {
      if (error instanceof mod.ImageConversionError) {
        return Response.json({ name: error.name, code: error.code }, { status: 400 });
      }
      throw error;
    }
  },
};
