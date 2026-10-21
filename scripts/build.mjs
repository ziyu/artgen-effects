import { build } from 'tsup';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { packages } from './packages.mjs';
import { sourceFingerprint } from './fingerprint.mjs';

const builtFiles = {};

for (const pkg of packages) {
  await build({
    entry: { index: `${pkg.directory}/src/index.ts` },
    outDir: `${pkg.directory}/dist`,
    format: ['esm', 'cjs'],
    outExtension({ format }) { return { js: format === 'cjs' ? '.cjs' : '.js' }; },
    target: 'es2022',
    platform: 'neutral',
    bundle: true,
    splitting: false,
    sourcemap: false,
    clean: true,
    dts: true,
    minify: false,
    treeshake: true,
    tsconfig: 'tsconfig.json',
  });
  await mkdir(pkg.directory, { recursive: true });
  await copyFile('LICENSE', `${pkg.directory}/LICENSE`);
  for (const filename of ['index.js', 'index.cjs', 'index.d.ts', 'index.d.cts']) {
    const path = `${pkg.directory}/dist/${filename}`;
    builtFiles[path] = createHash('sha256').update(await readFile(path)).digest('hex');
  }
}
await mkdir('.tmp', { recursive: true });
await writeFile('.tmp/build-manifest.json', JSON.stringify({
  sourceFingerprint: await sourceFingerprint(), files: builtFiles,
}, null, 2) + '\n');
