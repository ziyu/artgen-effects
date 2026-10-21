import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { packages } from './packages.mjs';
import { sourceFingerprint } from './fingerprint.mjs';

const build = JSON.parse(await readFile('.tmp/build-manifest.json', 'utf8').catch(error => {
  if (error.code === 'ENOENT') throw new Error('Build the packages with npm run build before packing.');
  throw error;
}));
assert.equal(build.sourceFingerprint, await sourceFingerprint(), 'Source changed since the build. Run npm run build before packing.');
for (const pkg of packages) {
  for (const filename of ['index.js', 'index.cjs', 'index.d.ts', 'index.d.cts']) {
    const path = `${pkg.directory}/dist/${filename}`;
    assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), build.files[path], `Build output changed: ${path}`);
  }
}
await mkdir('artifacts', { recursive: true });
const required = ['LICENSE', 'README.md', 'package.json', 'dist/index.js', 'dist/index.cjs', 'dist/index.d.ts', 'dist/index.d.cts'].sort();
const releases = [];
for (const pkg of packages) {
  const manifest = JSON.parse(await readFile(`${pkg.directory}/package.json`, 'utf8'));
  assert.equal(manifest.name, pkg.name);
  assert.equal(manifest.private, undefined);
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.homepage, pkg.toolUrl);
  assert.equal(manifest.repository.url, 'git+https://github.com/ziyu/artgen-effects.git');
  assert.equal(manifest.repository.directory, pkg.directory);
  assert.deepEqual(Object.keys(manifest.dependencies ?? {}), []);
  const readme = await readFile(`${pkg.directory}/README.md`, 'utf8');
  assert.ok(readme.includes(pkg.toolUrl), `Missing official tool URL for ${pkg.name}`);
  const result = JSON.parse(execFileSync('npm', [
    'pack', `./${pkg.directory}`, '--json', '--ignore-scripts', '--pack-destination=artifacts',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }))[0];
  assert.deepEqual(result.files.map(file => file.path).sort(), required, `Unexpected files in ${pkg.name}`);
  const bytes = await readFile(`artifacts/${result.filename}`);
  const integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
  assert.equal(result.integrity, integrity);
  releases.push({
    name: result.name, version: result.version, filename: result.filename,
    integrity, shasum: result.shasum, size: result.size,
    unpackedSize: result.unpackedSize, homepage: manifest.homepage,
    files: result.files.map(({ path, size }) => ({ path, size })),
  });
  console.log(`${result.name}@${result.version}: ${result.size} bytes; seven approved files; ${manifest.homepage}`);
}
await writeFile('artifacts/release-manifest.json', JSON.stringify({
  repository: 'https://github.com/ziyu/artgen-effects',
  sourceFingerprint: await sourceFingerprint(),
  packages: releases,
}, null, 2) + '\n');
