// Validate the static Pages artifact, including case-sensitive asset paths on Linux.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';

const root = fileURLToPath(new URL('../app/', import.meta.url));
const require = createRequire(import.meta.url);
const { catalog } = require('../app/js/cat-collection.js');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
assert.equal(ids.length, new Set(ids).size, 'Duplicate HTML IDs');
assert.match(html, /id="screen-room" class="[^"]*is-active/);

let refs = 0;
function asset(from, ref) {
  if (!ref || /^(?:[a-z]+:|\/\/|#)/i.test(ref)) return;
  assert.ok(!ref.startsWith('/'), `Root-relative URL will break project Pages: ${ref}`);
  const file = path.resolve(path.dirname(from), ref.split(/[?#]/)[0]);
  const relative = path.relative(root, file);
  assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative), `Asset escapes app/: ${ref}`);
  assert.ok(fs.existsSync(file) && fs.statSync(file).isFile(), `Missing asset: ${relative}`);
  refs++;
}
for (const match of html.matchAll(/\b(?:src|data-src|href)="([^"]+)"/g)) asset(path.join(root, 'index.html'), match[1]);
for (const name of fs.readdirSync(path.join(root, 'css'))) {
  if (!name.endsWith('.css')) continue;
  const file = path.join(root, 'css', name);
  for (const match of fs.readFileSync(file, 'utf8').matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g)) asset(file, match[1]);
}
for (const name of fs.readdirSync(path.join(root, 'js'))) {
  if (name.endsWith('.js')) new Script(fs.readFileSync(path.join(root, 'js', name), 'utf8'), { filename: name });
}
for (const name of ['app.js', 'room.js', 'room-life.js', 'collection-view.js']) {
  const code = fs.readFileSync(path.join(root, 'js', name), 'utf8');
  for (const match of code.matchAll(/(?:\$|getElementById)\('([^']+)'\)/g)) assert.ok(ids.includes(match[1]), `Missing DOM node: ${match[1]}`);
}
for (const cat of catalog) {
  asset(path.join(root, 'index.html'), cat.portrait);
  asset(path.join(root, 'index.html'), cat.atlas);
  const meta = JSON.parse(fs.readFileSync(path.resolve(root, cat.atlas.replace('.webp', '.json')), 'utf8'));
  assert.equal(meta.frames.length, 16, `${cat.id}: incomplete animation atlas`);
}
console.log(`PASS: Pages entry, script syntax, DOM bindings and ${refs} local assets.`);
