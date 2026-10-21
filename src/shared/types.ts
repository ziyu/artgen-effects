/** Decoded RGBA8 pixels in row-major order, including Canvas ImageData. */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}

/** A newly allocated, opaque RGBA8 image. */
export interface RgbaImageOutput extends RgbaImage {
  readonly data: Uint8Array;
}

export interface ConversionResult {
  readonly image: RgbaImageOutput;
}

export interface AsciiConversionResult extends ConversionResult {
  readonly asciiText: string;
}

/** Invalid input is rejected before allocating image-processing buffers. */
export class ImageConversionError extends Error {
  readonly code = 'invalid_request' as const;

  constructor(message = 'Invalid image conversion input') {
    super(message);
    this.name = 'ImageConversionError';
  }
}
