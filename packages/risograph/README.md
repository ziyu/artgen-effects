# artgen-risograph

**[Try the Risograph Effect on Artgen](https://artgen.net/en/tools/risograph-effect)** · [Source code](https://github.com/ziyu/artgen-effects/tree/main/packages/risograph)

Turn decoded image pixels into a layered spot-ink print effect with halftone dots, registration offset, and repeatable paper grain. The texture is controlled by an explicit seed.

Zero runtime dependencies. Supports browsers, Node.js, and Cloudflare Workers. No GPU, native addon, WASM runtime, or container is required.

## Install

```bash
npm install artgen-risograph
```

## Quick start

This example creates a small raw RGBA gradient and converts it. It runs in Node.js or a browser module without an image decoder:

```js
import { convert } from 'artgen-risograph';

const width = 96;
const height = 64;
const data = new Uint8Array(width * height * 4);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    data[i] = Math.round(255 * x / (width - 1));
    data[i + 1] = Math.round(255 * y / (height - 1));
    data[i + 2] = 140;
    data[i + 3] = 255;
  }
}

const { image } = convert({ width, height, data }, { inkCount: 2, dotSize: 6, registration: 1, grain: 0.06, seed: 1 });
console.log(image.width, image.height); // 96 64
```

CommonJS is supported through `const { convert } = require('artgen-risograph')`.

## API

```ts
import { convert, type RisographOptions, type RgbaImage } from 'artgen-risograph';

const options: RisographOptions = { inkCount: 2, dotSize: 6, registration: 1, grain: 0.06, seed: 1 };
function applyEffect(source: RgbaImage) {
  return convert(source, options);
}
```

`convert(source, options?)` is synchronous. The source must have integer `width` and `height` from 1 to 512 and a `data` field of type `Uint8Array` or `Uint8ClampedArray`, containing exactly `width * height * 4` RGBA8 bytes.

The input is never mutated. Transparent pixels are composited onto white before processing. The result contains `image`, a new opaque RGBA image whose `data` is a `Uint8Array`. Output width and height equal the input dimensions.

| Option | Type | Default | Allowed values | Meaning |
| --- | --- | --- | --- | --- |
| `inkCount` | `number` | `2` | 2 or 3 | Number of spot-ink separations. |
| `dotSize` | `integer` | `6` | 3–12 | Scale of the halftone screen in pixels. |
| `registration` | `integer` | `1` | 0–4 | Offset of the secondary ink layers in pixels. |
| `grain` | `number` | `0.06` | 0–0.25 | Strength of seeded paper and ink variation. |
| `seed` | `integer` | `1` | 0–4294967295 | Unsigned 32-bit texture seed. |

Omitted options and known fields set to `undefined` use their defaults. Invalid images, `null` options, arrays, unknown fields, wrong types, non-finite numbers, and out-of-range values throw `ImageConversionError` with `code === 'invalid_request'`. Numeric values are not silently clamped or rounded to UI slider steps.

The package exports `convert`, `RisographOptions` (also available as `Options`), `RgbaImage`, `RgbaImageOutput`, `ConversionResult`, `Result`, `ImageConversionError`, `MAX_IMAGE_EDGE` (`512`), and `ALGORITHM_VERSION` (`'1'`).

## Browser Canvas example

For a loaded image element and a destination canvas:

```js
import { convert, MAX_IMAGE_EDGE } from 'artgen-risograph';

export function renderEffect(img, outputCanvas) {
  if (!img.naturalWidth || !img.naturalHeight) {
    throw new Error('Load the source image before converting it.');
  }

  const scale = Math.min(1, MAX_IMAGE_EDGE / img.naturalWidth,
    MAX_IMAGE_EDGE / img.naturalHeight);
  const inputCanvas = document.createElement('canvas');
  inputCanvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  inputCanvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const inputContext = inputCanvas.getContext('2d');
  if (!inputContext) throw new Error('Canvas 2D is unavailable.');
  inputContext.drawImage(img, 0, 0, inputCanvas.width, inputCanvas.height);

  const source = inputContext.getImageData(0, 0,
    inputCanvas.width, inputCanvas.height);
  const result = convert(source, { inkCount: 2, dotSize: 6, registration: 1, grain: 0.06, seed: 1 });
  const { image } = result;
  outputCanvas.width = image.width;
  outputCanvas.height = image.height;
  const outputContext = outputCanvas.getContext('2d');
  if (!outputContext) throw new Error('Canvas 2D is unavailable.');
  outputContext.putImageData(new ImageData(
    new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return result;
}
```

Use a local upload, a same-origin image, or an image served with suitable CORS headers; the browser must allow reading the Canvas pixels. The conversion itself performs no network requests. Use the destination canvas to display or encode the result.

## Algorithm and behavior

The image is separated into two or three fixed spot-ink layers. A clustered-dot screen converts each layer into halftones, and multiplicative overprinting combines the ink colors on a paper background. Registration offsets the secondary layers; a deterministic hash supplies grain.

The output keeps the input dimensions. Reusing the same seed reproduces the same texture. This is a stylized raster effect; it does not create printer-ready ink separation files or predict physical ink behavior.

For the same input pixels, options, and algorithm version, conversion produces the same output. `ALGORITHM_VERSION` describes the algorithm separately from the npm package version.

## Cloudflare Workers and file formats

The core uses only JavaScript and typed arrays. It does not need `nodejs_compat`, external services, or a container. It accepts decoded RGBA pixels; it does not decode PNG/JPEG/WebP, read files, or encode its result. A returned `Uint8Array` is raw pixels, not a PNG file.

Resize and decode source images before calling `convert`. The 512-pixel edge limit bounds memory and computation but does not guarantee that every request fits a particular Workers CPU allowance. Apply request-size and concurrency limits in your own application. See the [runtime guide](https://github.com/ziyu/artgen-effects/blob/main/docs/runtime.md) for a self-contained Worker example and format integration details.

## Related links

- [Official Risograph Effect](https://artgen.net/en/tools/risograph-effect)
- [中文工具页](https://artgen.net/zh-CN/tools/risograph-effect)
- [All six Artgen packages](https://github.com/ziyu/artgen-effects)
- [Algorithm details](https://github.com/ziyu/artgen-effects/blob/main/docs/algorithms.md)
- [Issues](https://github.com/ziyu/artgen-effects/issues)

## License

[MIT](./LICENSE). Part of [Artgen Effects](https://github.com/ziyu/artgen-effects).
