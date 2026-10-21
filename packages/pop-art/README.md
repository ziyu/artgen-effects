# artgen-pop-art

**[Try the Photo to Pop Art on Artgen](https://artgen.net/en/tools/photo-to-pop-art)** · [Source code](https://github.com/ziyu/artgen-effects/tree/main/packages/pop-art)

Create a graphic pop-art effect from decoded RGBA pixels with a fixed palette, strong contours, and staggered Ben-Day-style dots. No model or external image service is required.

Zero runtime dependencies. Supports browsers, Node.js, and Cloudflare Workers. No GPU, native addon, WASM runtime, or container is required.

## Install

```bash
npm install artgen-pop-art
```

## Quick start

This example creates a small raw RGBA gradient and converts it. It runs in Node.js or a browser module without an image decoder:

```js
import { convert } from 'artgen-pop-art';

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

const { image } = convert({ width, height, data }, { dotSize: 6, outline: 0.65 });
console.log(image.width, image.height); // 96 64
```

CommonJS is supported through `const { convert } = require('artgen-pop-art')`.

## API

```ts
import { convert, type PopArtOptions, type RgbaImage } from 'artgen-pop-art';

const options: PopArtOptions = { dotSize: 6, outline: 0.65 };
function applyEffect(source: RgbaImage) {
  return convert(source, options);
}
```

`convert(source, options?)` is synchronous. The source must have integer `width` and `height` from 1 to 512 and a `data` field of type `Uint8Array` or `Uint8ClampedArray`, containing exactly `width * height * 4` RGBA8 bytes.

The input is never mutated. Transparent pixels are composited onto white before processing. The result contains `image`, a new opaque RGBA image whose `data` is a `Uint8Array`. Output width and height equal the input dimensions.

| Option | Type | Default | Allowed values | Meaning |
| --- | --- | --- | --- | --- |
| `dotSize` | `integer` | `6` | 3–12 | Spacing of the staggered dot pattern in pixels. |
| `outline` | `number` | `0.65` | 0–1 | Contour strength; 0 disables edge outlines. |

Omitted options and known fields set to `undefined` use their defaults. Invalid images, `null` options, arrays, unknown fields, wrong types, non-finite numbers, and out-of-range values throw `ImageConversionError` with `code === 'invalid_request'`. Numeric values are not silently clamped or rounded to UI slider steps.

The package exports `convert`, `PopArtOptions` (also available as `Options`), `RgbaImage`, `RgbaImageOutput`, `ConversionResult`, `Result`, `ImageConversionError`, `MAX_IMAGE_EDGE` (`512`), and `ALGORITHM_VERSION` (`'1'`).

## Browser Canvas example

For a loaded image element and a destination canvas:

```js
import { convert, MAX_IMAGE_EDGE } from 'artgen-pop-art';

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
  const result = convert(source, { dotSize: 6, outline: 0.65 });
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

The effect smooths luminance with a small separable filter, emphasizes color differences, and maps the image to a fixed graphic palette. Sobel gradients identify contours, while a staggered dot grid creates the printed pattern.

The output keeps the input dimensions. Setting `outline` to `0` disables contours but leaves the halftone dots. This is a palette-and-print treatment of the source image; it does not redraw faces or generate a multi-panel composition.

For the same input pixels, options, and algorithm version, conversion produces the same output. `ALGORITHM_VERSION` describes the algorithm separately from the npm package version.

## Cloudflare Workers and file formats

The core uses only JavaScript and typed arrays. It does not need `nodejs_compat`, external services, or a container. It accepts decoded RGBA pixels; it does not decode PNG/JPEG/WebP, read files, or encode its result. A returned `Uint8Array` is raw pixels, not a PNG file.

Resize and decode source images before calling `convert`. The 512-pixel edge limit bounds memory and computation but does not guarantee that every request fits a particular Workers CPU allowance. Apply request-size and concurrency limits in your own application. See the [runtime guide](https://github.com/ziyu/artgen-effects/blob/main/docs/runtime.md) for a self-contained Worker example and format integration details.

## Related links

- [Official Photo to Pop Art](https://artgen.net/en/tools/photo-to-pop-art)
- [中文工具页](https://artgen.net/zh-CN/tools/photo-to-pop-art)
- [All six Artgen packages](https://github.com/ziyu/artgen-effects)
- [Algorithm details](https://github.com/ziyu/artgen-effects/blob/main/docs/algorithms.md)
- [Issues](https://github.com/ziyu/artgen-effects/issues)

## License

[MIT](./LICENSE). Part of [Artgen Effects](https://github.com/ziyu/artgen-effects).
