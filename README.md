# Artgen Effects

[中文说明](./README.zh-CN.md) · [Artgen](https://artgen.net)

Six small, deterministic image effects for JavaScript and TypeScript. Each effect is an independent npm package with zero runtime dependencies, accepting RGBA pixels and returning a new image. The algorithms use bounded CPU processing and work without a model, API key, GPU, native addon, or container.

## Packages and online tools

Try the corresponding Artgen tool to see the effect before integrating it:

| Effect | npm package | Official Artgen tool |
| --- | --- | --- |
| ASCII art | [artgen-ascii](https://www.npmjs.com/package/artgen-ascii) | [ASCII Art Generator](https://artgen.net/en/tools/ascii-art-generator) |
| Pixel art | [artgen-pixel](https://www.npmjs.com/package/artgen-pixel) | [Image to Pixel Art](https://artgen.net/en/tools/image-to-pixel-art) |
| Cyanotype | [artgen-cyanotype](https://www.npmjs.com/package/artgen-cyanotype) | [Cyanotype Filter](https://artgen.net/en/tools/cyanotype-filter) |
| Risograph | [artgen-risograph](https://www.npmjs.com/package/artgen-risograph) | [Risograph Effect](https://artgen.net/en/tools/risograph-effect) |
| Pop art | [artgen-pop-art](https://www.npmjs.com/package/artgen-pop-art) | [Photo to Pop Art](https://artgen.net/en/tools/photo-to-pop-art) |
| Pointillism | [artgen-pointillism](https://www.npmjs.com/package/artgen-pointillism) | [Pointillism Effect](https://artgen.net/en/tools/pointillism-effect) |

## Quick start

Install the effect you need:

```bash
npm install artgen-pixel
```

```js
import { convert } from 'artgen-pixel';

// A decoded RGBA8 image, at most 512 pixels on either side.
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

const { image } = convert({ width, height, data }, {
  pixelSize: 8,
  colors: 16,
  dither: true,
});

console.log(image.width, image.height, image.data.length); // 96 64 24576
```

All packages expose `convert(image, options?)`. ASCII also returns real, editable text:

```js
import { convert } from 'artgen-ascii';

// Reuse the width, height, and RGBA data from the example above.
const { image, asciiText } = convert({ width, height, data }, { asciiColumns: 80 });
console.log(asciiText);
```

## Input and output

```ts
interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}
```

The input must contain exactly `width * height * 4` bytes, with integer dimensions from 1 to 512. Both ordinary byte arrays and Canvas `ImageData.data` are accepted. Transparent pixels are composited onto white before conversion. The source array is never modified.

The result has an `image` containing `width`, `height`, and a new `Uint8Array` of opaque RGBA pixels. ASCII additionally returns `asciiText`; its image dimensions follow the character grid. The other effects preserve the input dimensions.

These packages operate on decoded pixels. PNG/JPEG/WebP decoding, resizing, file access, and encoding are the caller's responsibility. This keeps the same core usable in browsers, Node.js, and Cloudflare Workers. See the [runtime guide](./docs/runtime.md) for Canvas and Worker examples.

Options are specific to each effect. Unknown fields, invalid types, non-finite numbers, and values outside the documented ranges throw `ImageConversionError` with `code === 'invalid_request'`. Omitted options and known fields set to `undefined` use defaults. Values are not silently clamped or rounded to UI slider steps.

## How the effects work

| Effect | Method |
| --- | --- |
| ASCII | Cell luminance mapped to the coverage of original bitmap glyphs; matching text and a 6 × 8 pixel character grid. |
| Pixel | Block averaging, a bounded median-cut palette, and optional Floyd–Steinberg dithering on the block grid. |
| Cyanotype | Exposure and contrast adjustments followed by a blue-to-paper lookup table. |
| Risograph | Two or three spot-ink separations, clustered-dot screens, overprinting, registration offset, and seeded grain. |
| Pop art | A fixed graphic palette, Sobel contours, and staggered Ben-Day-style dots. |
| Pointillism | Grid sampling, color-preserving dots, and seeded position jitter on a paper background. |

See [algorithm details](./docs/algorithms.md) and each package README for parameters and visual limitations.

For the same pixels, options, and algorithm version, an effect produces the same output. Stochastic textures use an explicit seed; there are no model calls or network requests. `ALGORITHM_VERSION` is currently `'1'`; it describes the effect implementation separately from the npm package version.

## Runtime support

The core uses JavaScript and typed arrays. Each package includes ESM, CommonJS, and TypeScript declarations. It has no runtime package dependencies and does not require Node compatibility flags in Cloudflare Workers.

The 512-pixel edge limit bounds allocations and processing. It is not a promise that every effect fits every Worker CPU allowance. Budget your own request size, concurrency, decoding, and execution time. See [runtime integration](./docs/runtime.md).

## Development

```bash
npm ci
npm run build
npm run typecheck
npm test
```

`npm test` runs unit, packaging, and Worker checks. After a current build, `npm run pack` creates the six checked tarballs in `artifacts/`. It rejects stale or modified build outputs. See the [release guide](./docs/releasing.md) for publication.

The repository keeps common helpers in shared source and includes only the required helpers in each package's build. A consumer can install one effect without installing the others.

## License

[MIT](./LICENSE). The six algorithms were extracted from Artgen's image conversion engine. These packages contain the pixel-processing algorithms and their documentation; the hosted Artgen application is developed separately.
