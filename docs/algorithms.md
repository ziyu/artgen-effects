# Algorithm reference

Artgen Effects contains six bounded image-processing algorithms. All accept RGBA8 pixels, composite transparency onto white, and return newly allocated opaque pixels. They preserve the source composition and do not use trained models.

The implementation version is exported as `ALGORITHM_VERSION === '1'`. Keep both the npm package version and algorithm version with stored conversion settings if you need to reproduce old output after upgrading.

## ASCII art

[Online ASCII Art Generator](https://artgen.net/en/tools/ascii-art-generator) · [Package API](../packages/ascii/README.md)

The algorithm averages integer luminance within each source cell and selects the closest coverage from an original bitmap glyph set. It renders that glyph into a 6 × 8 pixel cell and appends the same character to the text output. No operating-system font metrics enter the result.

`asciiColumns` requests at most 24–85 columns, defaulting to 80. The actual grid can be smaller because it also respects the source dimensions, aspect ratio, and 512-pixel output edge limit. Each row consumes eight pixels vertically; each column consumes six horizontally. Source images with extreme aspect ratios remain bounded. The text has newline-separated rows with no final newline.

`invert`, default `false`, switches to dark characters on light paper and reverses the brightness mapping. This is an image-to-ASCII conversion: its output includes editable characters, and it needs an input image.

## Pixel art

[Online Image to Pixel Art](https://artgen.net/en/tools/image-to-pixel-art) · [Package API](../packages/pixel/README.md)

The source is divided into square blocks, including partial blocks at the right and bottom edges. The average RGB value of each block becomes one sample. A weighted median-cut quantizer builds a palette with at most 8, 16, or 32 colors from a histogram capped at 4,096 bins.

Color matching uses a weighted RGB distance. Optional Floyd–Steinberg error diffusion propagates error across the block grid, so each output block still has a single color. The output dimensions match the input. A source with few distinct colors may use fewer colors than the selected maximum.

Defaults are `pixelSize: 8`, `colors: 16`, and `dither: false`. Block size accepts integers from 4 to 32. This produces a pixelated rendering of the source; it does not design a new sprite or infer missing details.

## Cyanotype

[Online Cyanotype Filter](https://artgen.net/en/tools/cyanotype-filter) · [Package API](../packages/cyanotype/README.md)

Integer luminance indexes a 256-entry RGB lookup table. Exposure multiplies the normalized tone by `2 ** exposure`; contrast scales the result around its midpoint. The clamped tone interpolates between deep blue `[12, 43, 100]` and warm paper `[246, 246, 231]`.

`contrast` accepts 0.5–2, default 1.15; `exposure` accepts −1–1, default 0. Continuous values are accepted throughout these ranges. The output preserves dimensions and applies a digital color treatment rather than a physical model of cyanotype chemistry.

## Risograph

[Online Risograph Effect](https://artgen.net/en/tools/risograph-effect) · [Package API](../packages/risograph/README.md)

Two or three fixed spot-ink layers are separated from the source. A ranked 16 × 16 clustered-dot screen produces halftones at a different angle for each layer. Multiplicative overprinting combines the ink layers on a warm paper background. Secondary layers can be offset to suggest imperfect registration.

A deterministic integer hash varies paper color and ink coverage. The hash uses the explicit `seed`; the implementation does not call `Math.random()`.

| Parameter | Default | Range |
| --- | --- | --- |
| `inkCount` | 2 | 2 or 3 |
| `dotSize` | 6 | Integer 3–12 |
| `registration` | 1 | Integer 0–4 |
| `grain` | 0.06 | 0–0.25 |
| `seed` | 1 | Integer 0–4294967295 |

The result preserves dimensions. It is a stylized print effect, not a printer-ready separation workflow or a calibrated simulation of real ink and paper.

## Pop art

[Online Photo to Pop Art](https://artgen.net/en/tools/photo-to-pop-art) · [Package API](../packages/pop-art/README.md)

A small separable filter smooths luminance. The algorithm increases color differences and chooses colors from a fixed graphic palette. Sobel gradients identify high-contrast contours, while staggered Ben-Day-style dots provide the printed pattern.

`dotSize` accepts integers from 3 to 12, default 6. `outline` accepts 0–1, default 0.65; at zero, edge contours are disabled while halftone dots remain. Output dimensions match the source. The algorithm treats the existing image and does not construct a multi-panel layout.

## Pointillism

[Online Pointillism Effect](https://artgen.net/en/tools/pointillism-effect) · [Package API](../packages/pointillism/README.md)

Each bounded grid cell supplies an average color. The algorithm draws a filled circle on paper, varying its radius with luminance and modestly emphasizing color differences. An explicit seed moves the circle center within a limited fraction of its grid spacing.

`dotSize` accepts integers from 3 to 12 and defaults to **4**. `jitter` accepts 0–0.5, default 0.35. `seed` accepts unsigned 32-bit integers and defaults to 1. With `jitter: 0`, the dots remain aligned and changing the seed has no visible effect.

The result preserves dimensions. The method does not run iterative Voronoi/Lloyd relaxation or simulate pigment mixing; it samples the source into dots.

## Shared guarantees and boundaries

- Input dimensions are positive integers no greater than 512 on either side. Byte length must exactly match RGBA8 dimensions.
- Both `Uint8Array` and `Uint8ClampedArray` inputs are accepted, including views with a nonzero byte offset.
- Conversion does not modify the input. Output buffers are new, and output alpha is always 255.
- Invalid values and unknown options are rejected before processing. Floating-point option values are checked against ranges and are not quantized to slider steps.
- Each effect is synchronous and deterministic for a fixed input, options, and algorithm version. Seeded textures use a fixed integer hash.
- Encoding, decoding, resizing, transport limits, and service concurrency belong to the calling application. See the [runtime guide](./runtime.md).
