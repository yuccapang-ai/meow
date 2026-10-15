import { cp, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(path.join(root, 'dist/server'), { recursive: true });
await cp(path.join(root, 'app'), path.join(root, 'dist/client'), { recursive: true });
await writeFile(path.join(root, 'dist/server/index.js'),
  'export default { fetch(request, env) { return env.ASSETS.fetch(request); } };\n');
await writeFile(path.join(root, 'dist/server/wrangler.json'), JSON.stringify({
  name: 'ttddp-cat-match',
  main: 'index.js',
  compatibility_date: '2026-10-01',
  assets: { directory: '../client', binding: 'ASSETS' },
}, null, 2) + '\n');
console.log('Sites build ready: dist/server/index.js and dist/client/');
