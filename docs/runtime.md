# Runtime integration

Artgen Effects separates image processing from file formats and hosting. Each package accepts decoded RGBA8 pixels and returns a new image. No algorithm imports Node built-ins, calls a network service, loads a model or font, or requires a native addon or container.

## Data contract

```ts
interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

interface RgbaImageOutput {
  width: number;
  height: number;
  data: Uint8Array;
}
```

Dimensions must be integers from 1 to 512. The `data` view must contain exactly `width * height * 4` bytes in red, green, blue, alpha order. An image at the maximum dimensions has 1,048,576 input pixel bytes; processing also allocates output and intermediate buffers.

Both input array types work, including views into a larger buffer. Transparency is composited onto white. The input is not modified, and output alpha is always 255.

`convert` is synchronous. Five effects return `{ image }` and preserve source dimensions. ASCII returns `{ image, asciiText }`; the bitmap dimensions are multiples of its 6 × 8 character cell and may differ from the input.

## Browser

Use Canvas to decode and scale a loaded image, then pass its `ImageData` directly to `convert`. This example uses the [pixel-art package](../packages/pixel/README.md):

```js
import { convert, MAX_IMAGE_EDGE } from 'artgen-pixel';

export function convertLoadedImage(img, targetCanvas) {
  if (!img.naturalWidth || !img.naturalHeight) {
    throw new Error('The image must be loaded first.');
  }

  const scale = Math.min(1,
    MAX_IMAGE_EDGE / img.naturalWidth,
    MAX_IMAGE_EDGE / img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');
  context.drawImage(img, 0, 0, canvas.width, canvas.height);

  const source = context.getImageData(0, 0, canvas.width, canvas.height);
  const { image } = convert(source, {
    pixelSize: 8,
    colors: 16,
    dither: true,
  });

  targetCanvas.width = image.width;
  targetCanvas.height = image.height;
  const targetContext = targetCanvas.getContext('2d');
  if (!targetContext) throw new Error('Canvas 2D is unavailable.');
  targetContext.putImageData(new ImageData(
    new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);

  return image;
}
```

Only read pixels from local uploads, same-origin images, or images served with suitable CORS headers. Cross-origin images without CORS permission make the Canvas unreadable. The conversion library itself performs no image fetching.

To encode a converted canvas as PNG, use its browser API:

```js
const png = await new Promise((resolve, reject) => {
  targetCanvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error('PNG encoding failed.'));
  }, 'image/png');
});
```

For ASCII, put `asciiText` into a `<pre>` element using `textContent`. This preserves whitespace and avoids treating text as HTML. If repeated synchronous conversions affect your interface, move them into a Web Worker and transfer appropriately bounded buffers.

## Node.js

The algorithms need no Node-specific globals. Import the package from ESM or use CommonJS:

```js
import { convert } from 'artgen-cyanotype';
// CommonJS alternative:
// const { convert } = require('artgen-cyanotype');

const source = {
  width: 2,
  height: 1,
  data: new Uint8Array([
    0, 0, 0, 255,
    255, 255, 255, 255,
  ]),
};

const { image } = convert(source, { contrast: 1, exposure: 0 });
console.log([...image.data]);
// [12, 43, 100, 255, 246, 246, 231, 255]
```

A Node `Buffer` is also a `Uint8Array`, so a correctly sized decoded RGBA buffer can be used as input. Encoded PNG, JPEG, and WebP bytes cannot be passed as if they were pixels. Use an image decoder appropriate to your own runtime, explicitly request RGBA8, limit dimensions and decoded size, and then call `convert`. The packages do not choose or install a decoder for you.

Built package code targets ES2022. Repository development and validation require Node.js 22.14 or later. Consumers must use a runtime supporting the built syntax and typed-array APIs.

## Cloudflare Workers

The package kernels use ordinary JavaScript and typed arrays, so they do not need the `nodejs_compat` flag, service bindings, a GPU, or a container. A browser Canvas decoding example is not a Worker-side decoder: image decoding must be handled separately in a Worker application.

This complete Worker generates a small RGBA gradient and returns real ASCII text. It makes no upstream requests and does not accept uploaded bodies:

```js
import { convert } from 'artgen-ascii';

export default {
  fetch() {
    const width = 128;
    const height = 64;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const tone = Math.round(255 * x / (width - 1));
        data[i] = tone;
        data[i + 1] = tone;
        data[i + 2] = tone;
        data[i + 3] = 255;
      }
    }

    const { asciiText } = convert({ width, height, data }, {
      asciiColumns: 40,
      invert: false,
    });

    return new Response(asciiText, {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
};
```

To return another effect's `image.data` directly, use a raw binary content type such as `application/octet-stream` and communicate its dimensions and RGBA8 format to the client. Raw output is **not** an encoded PNG and must not be labeled `image/png`. Use an encoder if you need a normal image file.

### Resource budgeting

The package rejects oversized pixel dimensions before algorithm processing. It cannot undo allocations that your application has already made while downloading or decoding a large image. Bound the uploaded byte stream, decoded dimensions, temporary buffers, and concurrent requests at the application boundary.

The 512-pixel limit makes processing bounded; it does not guarantee that every effect and parameter combination fits a particular Workers CPU allowance. Benchmark representative inputs in your deployment, including decoding and encoding. Local elapsed time is not the same as Cloudflare billed CPU time. Check your deployment's current [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) when choosing a budget.

The repository's `npm run test:worker` check runs the built algorithms in a local workerd runtime without Node compatibility flags. It verifies runtime behavior; it does not measure a production account's billed CPU or simulate every hosting constraint.

## Errors

Invalid images or options throw `ImageConversionError` with the stable code `invalid_request`. Use the class exported by the package you call:

```js
import { convert, ImageConversionError } from 'artgen-pixel';

try {
  convert({ width: 0, height: 1, data: new Uint8Array() });
} catch (error) {
  if (error instanceof ImageConversionError) {
    console.log(error.code); // invalid_request
  } else {
    throw error;
  }
}
```

Known options set to `undefined` use defaults. The libraries reject `null` option objects, array option objects, unknown fields, non-finite numeric values, invalid types, and values outside the documented ranges. They do not silently resize input, clamp options, or round continuous options to slider steps.

## Development checks

```bash
npm ci
npm run build
npm run typecheck
npm test
```

`npm test` includes unit, packaging, and Worker checks. Run `npm run test:unit` or `npm run test:worker` for a focused check. `npm run pack` creates the six tarballs in `artifacts/` and checks their contents.
