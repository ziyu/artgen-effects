import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { packages } from './packages.mjs';
import { sourceFingerprint } from './fingerprint.mjs';

const registry = 'https://registry.npmjs.org';
const release = JSON.parse(await readFile('artifacts/release-manifest.json', 'utf8'));
assert.equal(release.sourceFingerprint, await sourceFingerprint(), 'Release sources changed. Run npm run release:check again.');
assert.deepEqual(release.packages.map(pkg => pkg.name), packages.map(pkg => pkg.name));
const expectedVersion = process.env.RELEASE_VERSION;
if (expectedVersion) {
  for (const pkg of release.packages) assert.equal(pkg.version, expectedVersion, 'Tag and package versions differ.');
}

// Interactive npm login / 2FA or a configured CI trusted publisher provides auth.
// Do not read, print, or store registry credentials here.
function registryIntegrity(name, version) {
  const result = spawnSync('npm', ['view', `${name}@${version}`, 'dist.integrity', '--json', `--registry=${registry}`], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status === 0) return JSON.parse(result.stdout);
  let error;
  try { error = JSON.parse(result.stdout).error; } catch { /* npm may also report on stderr */ }
  if (error?.code === 'E404') return null;
  throw new Error(`Cannot verify ${name}@${version}: ${result.stderr}`);
}

for (const pkg of release.packages) {
  const path = `artifacts/${pkg.filename}`;
  const integrity = 'sha512-' + createHash('sha512').update(await readFile(path)).digest('base64');
  assert.equal(integrity, pkg.integrity, `Tarball changed: ${pkg.name}`);
  const existing = registryIntegrity(pkg.name, pkg.version);
  if (existing) {
    assert.equal(existing, integrity, `${pkg.name}@${pkg.version} already exists with different contents. Do not overwrite it.`);
    console.log(`Verified existing ${pkg.name}@${pkg.version}; skipping.`);
    continue;
  }
  execFileSync('npm', ['publish', path, '--access=public', '--ignore-scripts', `--registry=${registry}`], { stdio: 'inherit' });
  assert.equal(registryIntegrity(pkg.name, pkg.version), integrity, `Published integrity did not match for ${pkg.name}`);
  console.log(`Published and verified ${pkg.name}@${pkg.version}`);
}
