import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

await mkdir(resolve(root, 'dist/renderer'), { recursive: true });
await cp(resolve(root, 'src/renderer'), resolve(root, 'dist/renderer'), {
  recursive: true,
  filter: (src) => !src.endsWith('.ts'),
});

console.log('Copied renderer assets to dist/renderer');
