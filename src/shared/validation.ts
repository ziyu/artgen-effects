import { MAX_IMAGE_EDGE } from './constants.js';
import { ImageConversionError, type RgbaImage } from './types.js';

type OptionDefinition =
  | { readonly type: 'boolean'; readonly default: boolean }
  | {
    readonly type: 'number';
    readonly default: number;
    readonly min: number;
    readonly max: number;
    readonly integer?: boolean;
    readonly choices?: readonly number[];
  };

export type OptionSchema<T extends object> = {
  readonly [Key in keyof Required<T>]: OptionDefinition;
};

export type ResolvedOptions<T extends object> = {
  [Key in keyof T]-?: Exclude<T[Key], undefined>;
};

function invalid(message: string): never {
  throw new ImageConversionError(message);
}

/** Snapshot dimensions and the exact view after validating their bounded shape. */
export function validateImage(input: unknown): RgbaImage {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    invalid('Image must contain width, height and RGBA8 data');
  }
  const { width, height, data } = input as RgbaImage;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE
    || width * height > MAX_IMAGE_EDGE * MAX_IMAGE_EDGE) {
    invalid(`Image dimensions must be integers between 1 and ${MAX_IMAGE_EDGE}`);
  }
  if (!(data instanceof Uint8Array) && !(data instanceof Uint8ClampedArray)) {
    invalid('Image data must be a Uint8Array or Uint8ClampedArray');
  }
  if (data.length !== width * height * 4) {
    invalid('Image data length must equal width * height * 4');
  }
  return { width, height, data };
}

/** Resolve only this style's options; fractional values are never quantized. */
export function resolveOptions<T extends object>(input: unknown, schema: OptionSchema<T>): ResolvedOptions<T> {
  if (input !== undefined) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      invalid('Options must be an object');
    }
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== null && prototype !== Object.prototype) {
      invalid('Options must be a plain object');
    }
    for (const key of Reflect.ownKeys(input)) {
      if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(schema, key)) {
        invalid('Unsupported style option');
      }
    }
  }

  const result: Record<string, number | boolean> = {};
  for (const key of Object.keys(schema)) {
    const definition = schema[key as keyof T];
    const supplied = input !== undefined && Object.prototype.hasOwnProperty.call(input, key)
      ? (input as Record<string, unknown>)[key]
      : undefined;
    const value = supplied === undefined ? definition.default : supplied;
    if (definition.type === 'boolean') {
      if (typeof value !== 'boolean') invalid(`Option ${key} must be a boolean`);
      result[key] = value;
    } else {
      if (typeof value !== 'number' || !Number.isFinite(value)
        || value < definition.min || value > definition.max) {
        invalid(`Option ${key} is outside its supported range`);
      }
      if (definition.integer && !Number.isInteger(value)) invalid(`Option ${key} must be an integer`);
      if (definition.choices && !definition.choices.includes(value)) invalid(`Unsupported value for option ${key}`);
      result[key] = value;
    }
  }
  return result as ResolvedOptions<T>;
}
