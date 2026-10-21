import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { STYLES } from './fixtures/images.mjs';

const run = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

test('packed packages install independently, resolve ESM/CJS, and expose valid types', { timeout: 120_000 }, async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'artgen-packages-'));
  // Keep packing and the offline consumer install independent of the user's
  // home-directory cache, which may be read-only in a sandbox or CI runner.
  const npmEnvironment = { ...process.env, NPM_CONFIG_CACHE: join(temporary, 'npm-cache'), npm_config_cache: join(temporary, 'npm-cache') };
  try {
    const tarballs = [];
    const names = [];
    for (const style of STYLES) {
      const cwd = join(root, 'packages', style);
      const metadata = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'));
      assert.equal(Object.keys(metadata.dependencies ?? {}).length, 0, `${style} has no runtime dependencies`);
      assert.equal(Object.keys(metadata.optionalDependencies ?? {}).length, 0);
      assert.equal(Object.keys(metadata.peerDependencies ?? {}).length, 0);
      const { stdout } = await run(npm, ['pack', '.', '--ignore-scripts', '--json', '--pack-destination', temporary], {
        cwd, env: npmEnvironment, timeout: 30_000, maxBuffer: 1024 * 1024,
      });
      const [packed] = JSON.parse(stdout);
      const files = new Set(packed.files.map(file => file.path));
      for (const file of ['package.json', 'README.md', 'LICENSE', 'dist/index.js', 'dist/index.cjs', 'dist/index.d.ts', 'dist/index.d.cts']) {
        assert.ok(files.has(file), `${metadata.name}: missing ${file}`);
      }
      for (const file of files) {
        assert.ok(file.startsWith('dist/') || ['package.json', 'README.md', 'LICENSE'].includes(file), `${metadata.name}: unexpected published file ${file}`);
      }
      const readme = await readFile(join(cwd, 'README.md'), 'utf8');
      assert.ok(readme.includes(metadata.homepage), `${metadata.name}: README links its actual tool page`);
      names.push(metadata.name);
      tarballs.push(join(temporary, packed.filename));
    }

    await writeFile(join(temporary, 'package.json'), JSON.stringify({ name: 'artgen-package-consumer', private: true, type: 'module' }));
    await run(npm, ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', ...tarballs], {
      cwd: temporary, env: npmEnvironment, timeout: 30_000, maxBuffer: 1024 * 1024,
    });
    const runtimeScript = `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      const require = createRequire(import.meta.url);
      const input = { width: 1, height: 1, data: new Uint8ClampedArray([20, 60, 200, 128]) };
      for (const name of ${JSON.stringify(names)}) {
        const esm = await import(name);
        const cjs = require(name);
        assert.deepEqual(esm.convert(input), cjs.convert(input), name);
        assert.equal(esm.MAX_IMAGE_EDGE, 512);
        assert.equal(cjs.ALGORITHM_VERSION, '1');
      }
    `;
    await writeFile(join(temporary, 'consumer.mjs'), runtimeScript);
    await run(process.execPath, ['consumer.mjs'], { cwd: temporary, timeout: 30_000 });

    // Resolve exported declarations as both Node ESM and CommonJS consumers.
    // No @types/node or application type declarations are available in this fixture.
    const optionalKeys = ['asciiColumns', 'pixelSize', 'contrast', 'inkCount', 'outline', 'jitter'];
    const typeScript = names.map((name, index) => `
      import { convert as convert${index}, type RgbaImage as Image${index}, type Options as Options${index} } from ${JSON.stringify(name)};
      const image${index}: Image${index} = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
      const options${index}: Options${index} = { ${optionalKeys[index]}: undefined };
      const result${index} = convert${index}(image${index}, options${index});
      const bytes${index}: Uint8Array = result${index}.image.data;
      // @ts-expect-error The other styles' options must not leak into this package.
      convert${index}(image${index}, { ${index === 0 ? 'pixelSize: 8' : 'asciiColumns: 24'} });
      // @ts-expect-error A Float32Array is not an RGBA8 image.
      convert${index}({ width: 1, height: 1, data: new Float32Array(4) });
      ${index === 0 ? `const text: string = result${index}.asciiText;` : ''}
    `).join('\n');
    await writeFile(join(temporary, 'consumer.mts'), typeScript);
    await writeFile(join(temporary, 'consumer.cts'), typeScript);
    await run(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit', '--strict', '--exactOptionalPropertyTypes', '--module', 'NodeNext',
      '--moduleResolution', 'NodeNext', '--target', 'ES2022', '--lib', 'ES2022,DOM', 'consumer.mts', 'consumer.cts'], {
      cwd: temporary, timeout: 30_000, maxBuffer: 1024 * 1024,
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
