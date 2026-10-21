# artgen-ascii

**[Try the ASCII Art Generator on Artgen](https://artgen.net/en/tools/ascii-art-generator)** · [Source code](https://github.com/ziyu/artgen-effects/tree/main/packages/ascii)

Convert decoded image pixels into real ASCII text and a matching bitmap character image. The generator uses cell luminance and an original built-in glyph set, so it does not need an installed font, Canvas, or an AI model.

Zero runtime dependencies. Supports browsers, Node.js, and Cloudflare Workers. No GPU, native addon, WASM runtime, or container is required.

## Install

```bash
npm install artgen-ascii
```

## Quick start

This example creates a small raw RGBA gradient and converts it. It runs in Node.js or a browser module without an image decoder:

```js
import { convert } from 'artgen-ascii';

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

const { image, asciiText } = convert({ width, height, data }, { asciiColumns: 80, invert: false });
console.log(asciiText);
console.log(image.width, image.height);
```

CommonJS is supported through `const { convert } = require('artgen-ascii')`.

## API

```ts
import { convert, type AsciiOptions, type RgbaImage } from 'artgen-ascii';

const options: AsciiOptions = { asciiColumns: 80, invert: false };
function applyEffect(source: RgbaImage) {
  return convert(source, options);
}
```

`convert(source, options?)` is synchronous. The source must have integer `width` and `height` from 1 to 512 and a `data` field of type `Uint8Array` or `Uint8ClampedArray`, containing exactly `width * height * 4` RGBA8 bytes.

The input is never mutated. Transparent pixels are composited onto white before processing. The result contains `image`, a new opaque RGBA image whose `data` is a `Uint8Array`. The result also contains `asciiText`, the matching editable character grid.

| Option | Type | Default | Allowed values | Meaning |
| --- | --- | --- | --- | --- |
| `asciiColumns` | `integer` | `80` | 24–85 | Requested maximum character columns; the actual grid may be smaller. |
| `invert` | `boolean` | `false` | true / false | Render dark characters on a light paper background and reverse the tone mapping. |

Omitted options and known fields set to `undefined` use their defaults. Invalid images, `null` options, arrays, unknown fields, wrong types, non-finite numbers, and out-of-range values throw `ImageConversionError` with `code === 'invalid_request'`. Numeric values are not silently clamped or rounded to UI slider steps.

The package exports `convert`, `AsciiOptions` (also available as `Options`), `RgbaImage`, `RgbaImageOutput`, `ConversionResult`, `Result`, `ImageConversionError`, `MAX_IMAGE_EDGE` (`512`), and `ALGORITHM_VERSION` (`'1'`).

ASCII also exports `AsciiConversionResult`; its `asciiText` field is required.

## Browser Canvas example

For a loaded image element and a destination canvas:

```js
import { convert, MAX_IMAGE_EDGE } from 'artgen-ascii';

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
  const result = convert(source, { asciiColumns: 80, invert: false });
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

Use a local upload, a same-origin image, or an image served with suitable CORS headers; the browser must allow reading the Canvas pixels. The conversion itself performs no network requests. Display `result.asciiText` in a `<pre>` element with `textContent` to preserve its whitespace.

## Algorithm and behavior

The input is sampled into cells. Each cell's luminance is mapped to a glyph according to its bitmap coverage. The same selected glyph is written to `asciiText` and rendered into the output image, using a 6 × 8 pixel character cell.

The built-in characters are space, `.`, `:`, `-`, `+`, `=`, `%`, `*`, `@`, and `#`. Text rows are separated by `\n`; there is no final newline. Use a monospace font and preserve whitespace when displaying the text.

`asciiColumns` is an upper bound. Small images and tall aspect ratios can reduce the actual column count below the requested value, including below 24. The output image remains within 512 pixels on either side and can have different dimensions from the input. This is an image-to-text algorithm; it does not generate scenes from a prompt.

For the same input pixels, options, and algorithm version, conversion produces the same output. `ALGORITHM_VERSION` describes the algorithm separately from the npm package version.

## Cloudflare Workers and file formats

The core uses only JavaScript and typed arrays. It does not need `nodejs_compat`, external services, or a container. It accepts decoded RGBA pixels; it does not decode PNG/JPEG/WebP, read files, or encode its result. A returned `Uint8Array` is raw pixels, not a PNG file.

Resize and decode source images before calling `convert`. The 512-pixel edge limit bounds memory and computation but does not guarantee that every request fits a particular Workers CPU allowance. Apply request-size and concurrency limits in your own application. See the [runtime guide](https://github.com/ziyu/artgen-effects/blob/main/docs/runtime.md) for a self-contained Worker example and format integration details.

## Related links

- [Official ASCII Art Generator](https://artgen.net/en/tools/ascii-art-generator)
- [中文工具页](https://artgen.net/zh-CN/tools/ascii-art-generator)
- [All six Artgen packages](https://github.com/ziyu/artgen-effects)
- [Algorithm details](https://github.com/ziyu/artgen-effects/blob/main/docs/algorithms.md)
- [Issues](https://github.com/ziyu/artgen-effects/issues)

## License

[MIT](./LICENSE). Part of [Artgen Effects](https://github.com/ziyu/artgen-effects).
