const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const catalog = require('../myasset/tortie-v2/catalog.json');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'myasset/tortie-v2');
const output = path.join(root, 'app/assets/room/tortie');
const portraits = path.join(root, 'app/skins/tortie');
const cell = 256;
const clips = {
  walk: { frames: [0, 1, 2, 3, 4, 5, 6, 7], delay: 120 },
  sleep: { frames: [8, 9, 10, 11, 10, 11, 10, 11], delay: [320, 500, 900, 900, 900, 900, 900, 900] },
  special: { frames: [12, 13, 14, 13, 14, 15], delay: [550, 450, 550, 400, 550, 1000] }
};

function segment(data, info) {
  const labels = new Int32Array(info.width * info.height);
  const queue = new Int32Array(labels.length), components = [];
  for (let start = 0; start < labels.length; start++) {
    if (labels[start] || data[start * 4 + 3] <= 40) continue;
    const id = components.length + 1;
    let head = 0, tail = 1, left = info.width, top = info.height, right = 0, bottom = 0, sumX = 0;
    queue[0] = start; labels[start] = id;
    while (head < tail) {
      const pixel = queue[head++], column = pixel % info.width, row = Math.floor(pixel / info.width);
      left = Math.min(left, column); right = Math.max(right, column);
      top = Math.min(top, row); bottom = Math.max(bottom, row); sumX += column;
      const neighbors = [column > 0 ? pixel - 1 : -1, column < info.width - 1 ? pixel + 1 : -1, row > 0 ? pixel - info.width : -1, row < info.height - 1 ? pixel + info.width : -1];
      for (const next of neighbors) {
        if (next >= 0 && !labels[next] && data[next * 4 + 3] > 40) {
          labels[next] = id; queue[tail++] = next;
        }
      }
    }
    components.push({ id, pixels: tail, left, top, right, bottom, centerX: sumX / tail });
  }
  const largest = components.slice().sort((first, second) => second.pixels - first.pixels).slice(0, 16);
  if (largest.length !== 16 || largest[15].pixels < info.width * info.height / 400) throw new Error('Expected sixteen separate complete cats');
  largest.sort((first, second) => (first.top + first.bottom) - (second.top + second.bottom));
  const bodies = [];
  for (let row = 0; row < 4; row++) bodies.push(...largest.slice(row * 4, row * 4 + 4).sort((first, second) => first.centerX - second.centerX));
  const owners = new Int32Array(components.length + 1); owners.fill(-1);
  const bounds = bodies.map(body => ({ left: body.left, top: body.top, right: body.right, bottom: body.bottom, originX: body.centerX }));
  bodies.forEach((body, index) => { owners[body.id] = index; });
  for (const component of components) {
    if (owners[component.id] >= 0 || component.pixels < 5) continue;
    let nearest = -1, distance = Infinity;
    for (const [index, body] of bodies.entries()) {
      const horizontal = Math.max(body.left - component.right, component.left - body.right, 0);
      const vertical = Math.max(body.top - component.bottom, component.top - body.bottom, 0);
      const candidate = horizontal * horizontal + vertical * vertical;
      if (candidate < distance) { distance = candidate; nearest = index; }
    }
    if (distance > Math.pow(Math.min(info.width, info.height) * 0.08, 2)) continue;
    owners[component.id] = nearest;
    const frame = bounds[nearest];
    frame.left = Math.min(frame.left, component.left); frame.top = Math.min(frame.top, component.top);
    frame.right = Math.max(frame.right, component.right); frame.bottom = Math.max(frame.bottom, component.bottom);
  }
  return bounds.map((frame, index) => {
    const left = Math.max(0, frame.left - 2), top = Math.max(0, frame.top - 2);
    const width = Math.min(info.width - 1, frame.right + 2) - left + 1;
    const height = Math.min(info.height - 1, frame.bottom + 2) - top + 1;
    const pixels = Buffer.alloc(width * height * 4);
    for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
      const original = (top + row) * info.width + left + column;
      if (!data[original * 4 + 3]) continue;
      let belongs = owners[labels[original]] === index;
      if (!labels[original]) {
        for (let vertical = Math.max(0, top + row - 2); !belongs && vertical <= Math.min(info.height - 1, top + row + 2); vertical++) {
          for (let horizontal = Math.max(0, left + column - 2); horizontal <= Math.min(info.width - 1, left + column + 2); horizontal++) {
            if (owners[labels[vertical * info.width + horizontal]] === index) { belongs = true; break; }
          }
        }
      }
      if (belongs) data.copy(pixels, (row * width + column) * 4, original * 4, original * 4 + 4);
    }
    return { left, top, width, height, originX: frame.originX, pixels };
  });
}

async function pack(cat, number) {
  const file = path.join(source, cat.id + '-source-v2.png');
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0;
  for (let offset = 3; offset < data.length; offset += 4) if (data[offset] < 16) transparent++;
  if (transparent / (info.width * info.height) < 0.2) throw new Error(cat.id + ': remove chroma key with the imagegen helper before packing');
  const frames = segment(data, info);
  const scale = Math.min(216 / Math.max(...frames.map(frame => frame.height)), 232 / Math.max(...frames.map(frame => frame.width)));
  const parts = [], metadata = [];
  for (const [index, frame] of frames.entries()) {
    const width = Math.round(frame.width * scale), height = Math.round(frame.height * scale);
    const left = Math.max(8, Math.min(cell - width - 8, Math.round(cell / 2 + (frame.left - frame.originX) * scale)));
    const top = 232 - height;
    const pose = await sharp(frame.pixels, { raw: { width: frame.width, height: frame.height, channels: 4 } }).resize(width, height).png().toBuffer();
    parts.push({ input: pose, left: index % 4 * cell + left, top: Math.floor(index / 4) * cell + top });
    metadata.push({ index, left, top, width, height });
  }
  const atlas = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#00000000' } }).composite(parts).png().toBuffer();
  await sharp(atlas).webp({ lossless: true }).toFile(path.join(output, cat.id + '-actions-v2.webp'));
  await sharp(atlas).png().toFile(path.join(output, cat.id + '-actions-v2.png'));
  await sharp(atlas).flatten({ background: '#f4e7cc' }).png().toFile(path.join(source, cat.id + '-preview-v2.png'));
  const portraitFrame = metadata[12];
  const portrait = await sharp(atlas).extract({ left: portraitFrame.left, top: 3 * cell + portraitFrame.top, width: portraitFrame.width, height: portraitFrame.height }).resize(232, 232, { fit: 'inside' }).png().toBuffer();
  const portraitInfo = await sharp(portrait).metadata();
  await sharp({ create: { width: cell, height: cell, channels: 4, background: '#00000000' } }).composite([{ input: portrait, left: Math.round((cell - portraitInfo.width) / 2), top: Math.round((cell - portraitInfo.height) / 2) }]).webp({ lossless: true }).toFile(path.join(portraits, number + '.webp'));
  for (const [action, clip] of Object.entries(clips)) {
    const poster = action === 'sleep' ? 10 : clip.frames[0];
    await sharp(atlas).extract({ left: poster % 4 * cell, top: Math.floor(poster / 4) * cell, width: cell, height: cell }).png().toFile(path.join(source, cat.id + '-' + action + '-poster.png'));
    const poses = await Promise.all(clip.frames.map(index => sharp(atlas).extract({ left: index % 4 * cell, top: Math.floor(index / 4) * cell, width: cell, height: cell }).png().toBuffer()));
    const stacked = await sharp({ create: { width: cell, height: cell * poses.length, channels: 4, background: '#00000000' } }).composite(poses.map((pose, index) => ({ input: pose, left: 0, top: index * cell }))).raw().toBuffer();
    await sharp(stacked, { raw: { width: cell, height: cell * poses.length, channels: 4, pageHeight: cell } }).webp({ lossless: true, loop: 0, delay: Array.isArray(clip.delay) ? clip.delay : clip.frames.map(() => clip.delay) }).toFile(path.join(source, cat.id + '-' + action + '.webp'));
  }
  await fs.writeFile(path.join(output, cat.id + '-actions-v2.json'), JSON.stringify({ image: cat.id + '-actions-v2.webp', cell, columns: 4, rows: 4, footY: 232, actions: { walk: [0, 1, 2, 3, 4, 5, 6, 7], sleep: [8, 9, 10, 11], special: [12, 13, 14, 15] }, special: cat.special, frames: metadata }, null, 2) + '\n');
  console.log(cat.id + ': portrait, 16-frame atlas, 3 animated previews');
}

async function gallery() {
  const parts = [];
  for (const [index, cat] of catalog.entries()) {
    const portrait = await sharp(path.join(portraits, (index + 1) + '.webp')).resize(320, 320).png().toBuffer();
    parts.push({ input: portrait, left: index % 3 * 360 + 20, top: Math.floor(index / 3) * 360 + 20 });
  }
  await sharp({ create: { width: 1080, height: 1080, channels: 3, background: '#f4e7cc' } }).composite(parts).png().toFile(path.join(source, 'nine-skins.png'));
  for (const [action, clip] of Object.entries(clips)) {
    const boards = [];
    for (const frame of clip.frames) {
      const tiles = await Promise.all(catalog.map(async (cat, index) => ({ input: await sharp(path.join(output, cat.id + '-actions-v2.webp')).extract({ left: frame % 4 * cell, top: Math.floor(frame / 4) * cell, width: cell, height: cell }).png().toBuffer(), left: index % 3 * cell, top: Math.floor(index / 3) * cell })));
      boards.push(await sharp({ create: { width: 768, height: 768, channels: 4, background: '#f4e7cc' } }).composite(tiles).raw().toBuffer());
    }
    const animation = sharp(Buffer.concat(boards), { raw: { width: 768, height: 768 * boards.length, channels: 4, pageHeight: 768 } });
    const delay = Array.isArray(clip.delay) ? clip.delay : clip.frames.map(() => clip.delay);
    await animation.clone().webp({ lossless: true, loop: 0, delay }).toFile(path.join(source, 'nine-' + action + '.webp'));
    await animation.clone().gif({ loop: 0, delay, effort: 7 }).toFile(path.join(source, 'nine-' + action + '.gif'));
  }
  await fs.writeFile(path.join(source, 'manifest.json'), JSON.stringify({ version: 2, approvedDesign: '../tortie-v1/nine-skins-preview-v3.png', generationMode: 'built-in image_gen', cell, columns: 4, rows: 4, footY: 232, skins: catalog.map((cat, index) => ({ id: cat.id, name: cat.name, special: cat.special, portrait: '../../app/skins/tortie/' + (index + 1) + '.webp', atlas: '../../app/assets/room/tortie/' + cat.id + '-actions-v2.webp', metadata: '../../app/assets/room/tortie/' + cat.id + '-actions-v2.json', prompt: String(index + 1).padStart(2, '0') + '-' + cat.id + '.prompt.txt', animations: Object.keys(clips).map(action => ({ action, file: cat.id + '-' + action + '.webp', frames: clips[action].frames, delay: clips[action].delay })) })) }, null, 2) + '\n');
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  await fs.mkdir(portraits, { recursive: true });
  const selected = process.argv.slice(2);
  for (const [index, cat] of catalog.entries()) if (!selected.length || selected.includes(cat.id)) await pack(cat, index + 1);
  if (!selected.length || selected.includes('gallery')) await gallery();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
