import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

const roots = ['src', 'packages', 'scripts', 'tests', 'docs', '.github'];
const ignored = new Set(['dist', 'node_modules', 'artifacts', '.tmp', '.wrangler']);
export async function sourceFingerprint() {
  const paths = ['package.json', 'package-lock.json', 'tsconfig.json', 'LICENSE', 'README.md', 'README.zh-CN.md', 'NOTICE.md'];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const entry of entries) {
      if (ignored.has(entry.name)) continue;
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) paths.push(path);
      else throw new Error(`Unexpected non-file in release source: ${path}`);
    }
  }
  for (const root of roots) await visit(root);
  const hash = createHash('sha256');
  for (const path of paths.sort()) {
    hash.update(path);
    hash.update('\0');
    hash.update(await readFile(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}
