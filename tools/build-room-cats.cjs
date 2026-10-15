/* Extract and align imagegen's sixteen real poses; never synthesize animation frames. */
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { catalog } = require('../app/js/cat-collection.js');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'myasset/room-cats-v1');
const output = path.join(root, 'app/assets/room/cats');
const CELL = 256;

async function pack(cat) {
  const file = path.join(source, cat.id + '-source-v1.png');
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const occupied = (x, y) => data[(y * info.width + x) * 4 + 3] > 40;
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 16) transparent++;
  if (transparent / (info.width * info.height) < 0.2) throw new Error(cat.id + ': remove the flat chroma key with the imagegen helper first');
  function divisions(axis) {
    const length = axis === 'x' ? info.width : info.height;
    const across = axis === 'x' ? info.height : info.width;
    const edges = [0];
    for (let n = 1; n < 4; n++) {
      const expected = length * n / 4, radius = length / 4 * 0.16;
      let best = Math.round(expected), score = Infinity;
      for (let at = Math.ceil(expected - radius); at <= Math.floor(expected + radius); at++) {
        let pixels = 0;
        for (let a = 0; a < across; a++) if (occupied(axis === 'x' ? at : a, axis === 'x' ? a : at)) pixels++;
        const candidate = pixels * length + Math.abs(at - expected);
        if (candidate < score) { score = candidate; best = at; }
      }
      edges.push(best);
    }
    edges.push(length); return edges;
  }
  const xs = divisions('x'), ys = divisions('y'), frames = [];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    let left = info.width, top = info.height, right = -1, bottom = -1;
    for (let y = ys[row]; y < ys[row + 1]; y++) for (let x = xs[col]; x < xs[col + 1]; x++) {
      if (!occupied(x, y)) continue;
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    if (right < left) throw new Error(cat.id + ': empty frame ' + frames.length);
    frames.push({ left, top, width: right - left + 1, height: bottom - top + 1, originX: (xs[col] + xs[col + 1]) / 2 });
  }
  // One scale for the whole character; sleeping remains lower than standing.
  const scale = Math.min(216 / Math.max(...frames.map(f => f.height)), 232 / Math.max(...frames.map(f => f.width)));
  const parts = [], metadata = [];
  for (const [index, frame] of frames.entries()) {
    const width = Math.round(frame.width * scale), height = Math.round(frame.height * scale);
    const left = Math.max(8, Math.min(CELL - width - 8, Math.round(CELL / 2 + (frame.left - frame.originX) * scale)));
    const top = 232 - height;
    const pose = await sharp(file).extract({ left: frame.left, top: frame.top, width: frame.width, height: frame.height }).resize(width, height).png().toBuffer();
    parts.push({ input: pose, left: index % 4 * CELL + left, top: Math.floor(index / 4) * CELL + top });
    metadata.push({ index, left, top, width, height });
  }
  const png = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(parts).png().toBuffer();
  await sharp(png).webp({ lossless: true }).toFile(path.join(output, cat.id + '-actions-v1.webp'));
  await sharp(png).flatten({ background: '#f4e7cc' }).png().toFile(path.join(source, cat.id + '-preview-v1.png'));
  await fs.writeFile(path.join(output, cat.id + '-actions-v1.json'), JSON.stringify({ image: cat.id + '-actions-v1.webp', cell: CELL, columns: 4, rows: 4, footY: 232,
    actions: { walk: [0,1,2,3,4,5,6,7], sleep: [8,9,10,11], special: [12,13,14,15] }, special: cat.special, frames: metadata }, null, 2) + '\n');
  console.log(cat.id + ': 16 transparent frames packed');
}
async function main() {
  await fs.mkdir(output, { recursive: true });
  const selected = process.argv.slice(2);
  for (const cat of catalog) if (!selected.length || selected.includes(cat.id)) await pack(cat);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
