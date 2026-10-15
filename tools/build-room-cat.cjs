/* Pack imagegen animation sheets into equal transparent cells.
 * Requires sharp (available in the bundled workspace runtime via NODE_PATH).
 * Does not paint or synthesize poses; only extracts, scales and aligns the supplied frames. */
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'myasset/room-cat');
const output = path.join(root, 'app/assets/room/cat');
const cell = 256;

async function frames(file, columns, rows) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const occupied = (x, y) => data[(y * info.width + x) * 4 + 3] > 32;
  // Generated sheets may have slightly uneven gutters. Split on transparent valleys
  // near the requested grid instead of clipping a paw at a rounded pixel boundary.
  function divisions(axis, count) {
    const length = axis === 'x' ? info.width : info.height;
    const across = axis === 'x' ? info.height : info.width;
    const edges = [0];
    for (let n = 1; n < count; n++) {
      const expected = length * n / count, radius = length / count * 0.18;
      let best = Math.round(expected), bestScore = Infinity;
      for (let at = Math.ceil(expected - radius); at <= Math.floor(expected + radius); at++) {
        let pixels = 0;
        for (let other = 0; other < across; other++) {
          if (occupied(axis === 'x' ? at : other, axis === 'x' ? other : at)) pixels++;
        }
        const score = pixels * length + Math.abs(at - expected);
        if (score < bestScore) { bestScore = score; best = at; }
      }
      edges.push(best);
    }
    edges.push(length);
    return edges;
  }
  const xs = divisions('x', columns), ys = divisions('y', rows), result = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      let left = info.width, top = info.height, right = -1, bottom = -1;
      for (let y = ys[row]; y < ys[row + 1]; y++) {
        for (let x = xs[col]; x < xs[col + 1]; x++) {
          if (!occupied(x, y)) continue;
          left = Math.min(left, x); top = Math.min(top, y);
          right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
      }
      if (right < left) throw new Error('Empty animation cell in ' + file);
      const box = { left, top, width: right - left + 1, height: bottom - top + 1 };
      result.push({ file, box });
    }
  }
  console.log(path.basename(file), { size: [info.width, info.height], columns: xs, rows: ys });
  return result;
}

async function main() {
  const walk = await frames(path.join(source, 'cool-cat-walk-source-v1.png'), 4, 2);
  const actions = await frames(path.join(source, 'cool-cat-rest-source-v1.png'), 4, 4);
  const walkHeight = walk.reduce((sum, frame) => sum + frame.box.height, 0) / walk.length;
  // A single scale per source sheet keeps the poses at a stable physical size.
  const walkScale = Math.min(184 / walkHeight, 232 / Math.max(...walk.map(f => f.box.width)));
  const actionScale = Math.min(184 / actions[0].box.height, 232 / Math.max(...actions.map(f => f.box.width)));
  const sprites = [], metadata = [];
  for (const [index, frame] of walk.concat(actions).entries()) {
    const scale = index < 8 ? walkScale : actionScale;
    const width = Math.round(frame.box.width * scale), height = Math.round(frame.box.height * scale);
    const buffer = await sharp(frame.file).extract(frame.box).resize(width, height).png().toBuffer();
    const left = Math.round((cell - width) / 2), top = 232 - height;
    if (top < 8) throw new Error('Sprite exceeds cell padding: ' + index);
    sprites.push({ input: buffer, left: (index % 4) * cell + left, top: Math.floor(index / 4) * cell + top });
    metadata.push({ index, width, height, left, top });
  }
  await fs.mkdir(output, { recursive: true });
  const atlas = sharp({ create: { width: cell * 4, height: cell * 6, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(sprites);
  const png = await atlas.png().toBuffer();
  await sharp(png).webp({ lossless: true }).toFile(path.join(output, 'cool-cat-actions-v1.webp'));
  await sharp(png).flatten({ background: '#f4e7cc' }).png().toFile(path.join(source, 'cool-cat-actions-preview-v1.png'));
  await fs.writeFile(path.join(output, 'cool-cat-actions-v1.json'), JSON.stringify({
    image: 'cool-cat-actions-v1.webp', cell, columns: 4, rows: 6, footY: 232,
    actions: { walk: [0, 1, 2, 3, 4, 5, 6, 7], sit: [8, 9, 10, 11], groom: [12, 13, 14, 15], stretch: [16, 17, 18, 19], sleep: [20, 21, 22, 23] },
    frames: metadata
  }, null, 2) + '\n');
  console.log('Packed 24 distinct pose frames, 1024 x 1536 lossless WebP.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
