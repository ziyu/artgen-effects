/**
 * Run after npm run build: node tests/worker-smoke.mjs
 * Uses real local workerd, no account, bindings, Node compatibility, or network.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Log, LogLevel, Miniflare } from 'miniflare';
import { STYLES, STRESS_OPTIONS, makeImage } from './fixtures/images.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const packages = Object.fromEntries(await Promise.all(STYLES.map(async style => [
  style, await import(`../packages/${style}/dist/index.js`),
])));
const bundled = await build({
  absWorkingDir: root,
  entryPoints: ['tests/worker-entry.mjs'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  write: false,
  metafile: true,
});
// esbuild's browser platform rejects Node built-ins. Also ensure no src/ path
// accidentally replaces the artifacts this test is meant to exercise.
for (const input of Object.keys(bundled.metafile.inputs)) assert.ok(!input.includes('/src/'), input);
let outboundRequests = 0;
const worker = new Miniflare({
  modules: true,
  script: bundled.outputFiles[0].text,
  compatibilityDate: '2026-07-30',
  compatibilityFlags: [],
  cf: false,
  log: new Log(LogLevel.ERROR),
  outboundService: () => {
    outboundRequests++;
    return new Response('Network access is disabled by this test', { status: 502 });
  },
});

let conversions = 0;
let rejections = 0;
const timings = [];
const digest = data => createHash('sha256').update(data).digest('hex');
async function call(spec) {
  const started = performance.now();
  const response = await worker.dispatchFetch('http://artgen.test/convert', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(spec),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json();
  const elapsedMs = performance.now() - started;
  if (spec.invalid) {
    assert.equal(response.status, 400, `${spec.style}/${spec.invalid}`);
    assert.deepEqual(result, { name: 'ImageConversionError', code: 'invalid_request' });
    rejections++;
    return;
  }
  assert.equal(response.status, 200, JSON.stringify(spec));
  const input = makeImage(spec.width, spec.height, spec.kind);
  const expected = packages[spec.style].convert(input, spec.options);
  assert.deepEqual(result, {
    width: expected.image.width,
    height: expected.image.height,
    byteLength: expected.image.data.length,
    rgbaSha256: digest(expected.image.data),
    ...(expected.asciiText === undefined ? {} : { asciiText: expected.asciiText }),
    algorithmVersion: '1',
    maxImageEdge: 512,
  }, `${spec.style}: workerd output must equal Node output`);
  assert.ok(result.width >= 1 && result.width <= 512 && result.height >= 1 && result.height <= 512);
  conversions++;
  return { result, elapsedMs };
}

try {
  const health = await (await worker.dispatchFetch('http://artgen.test/health', {
    signal: AbortSignal.timeout(30_000),
  })).json();
  assert.equal(health.runtime, 'Cloudflare-Workers');
  assert.equal(health.nodeGlobals, false);
  assert.equal(health.bindings, 0);
  assert.deepEqual(health.styles, STYLES);

  for (const style of STYLES) {
    for (const [width, height, kind] of [[1, 1, 'transparent'], [1, 512, 'gradient'], [512, 1, 'noise'], [41, 29, 'alpha']]) {
      await call({ style, width, height, kind, options: STRESS_OPTIONS[style], clamped: true });
    }
    for (const variant of ['defaults', 'stress']) {
      const options = variant === 'stress' ? STRESS_OPTIONS[style] : undefined;
      const spec = { style, width: 512, height: 512, kind: 'noise', options };
      const first = await call(spec);
      if (variant === 'stress') {
        const repeated = await call(spec);
        assert.deepEqual(repeated.result, first.result, `${style}: repeated Worker call is deterministic`);
      }
      timings.push({ style, image: '512 × 512', options: variant, wallMs: Math.round(first.elapsedMs * 10) / 10 });
    }
    for (const invalid of ['oversized', 'short-data', 'wrong-data-type', 'unknown-option']) {
      await call({ style, invalid });
    }
  }
  // Recover normally after invalid requests in the same isolate.
  await call({ style: 'cyanotype', width: 1, height: 1, kind: 'gradient' });
  assert.equal(outboundRequests, 0);
  console.table(timings);
  console.log(`PASS: ${conversions} conversions, ${rejections} invalid inputs rejected, six deterministic repeat checks; real workerd, compatibilityFlags=[], zero bindings and outbound requests.`);
  console.log('wallMs measures local dispatch, conversion, hashing, transfer, and scheduling. It is not Cloudflare billed CPU time or a guarantee of any plan CPU budget.');
} finally {
  await worker.dispose();
}
