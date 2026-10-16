const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { Script } = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'myasset/tortie-v2');
const output = path.join(root, 'app/assets/room/tortie');
const catalog = require('../myasset/tortie-v2/catalog.json');
const delays = {
  walk: [120, 120, 120, 120, 120, 120, 120, 120],
  sleep: [320, 500, 900, 900, 900, 900, 900, 900],
  special: [550, 450, 550, 400, 550, 1000]
};

async function main() {
  const manifest = JSON.parse(await fs.readFile(path.join(source, 'manifest.json'), 'utf8'));
  assert.equal(manifest.skins.length, 9);
  for (const [index, cat] of catalog.entries()) {
    const file = path.join(output, cat.id + '-actions-v2.webp');
    const meta = await sharp(file).metadata();
    assert.equal(meta.width, 1024); assert.equal(meta.height, 1024); assert.equal(meta.hasAlpha, true);
    const details = JSON.parse(await fs.readFile(path.join(output, cat.id + '-actions-v2.json'), 'utf8'));
    assert.equal(details.frames.length, 16); assert.equal(details.cell, 256); assert.equal(details.footY, 232);
    assert.deepEqual(details.actions, { walk: [0, 1, 2, 3, 4, 5, 6, 7], sleep: [8, 9, 10, 11], special: [12, 13, 14, 15] });
    const hashes = [];
    for (let frame = 0; frame < 16; frame++) {
      const pixels = await sharp(file).extract({ left: frame % 4 * 256, top: Math.floor(frame / 4) * 256, width: 256, height: 256 }).ensureAlpha().raw().toBuffer();
      let covered = 0;
      for (let row = 0; row < 256; row++) for (let column = 0; column < 256; column++) {
        const alpha = pixels[(row * 256 + column) * 4 + 3];
        if (alpha > 40) covered++;
        if (row < 4 || column < 4 || column > 251 || row > 235) assert.ok(alpha < 16, cat.id + ': clipped or unaligned frame ' + frame);
      }
      assert.ok(covered > 2500 && covered < 50000, cat.id + ': invalid coverage in frame ' + frame);
      hashes.push(crypto.createHash('sha256').update(pixels).digest('hex'));
    }
    assert.equal(new Set(hashes.slice(0, 8)).size, 8, cat.id + ': repeated walking poses');
    assert.equal(new Set(hashes.slice(12)).size, 4, cat.id + ': repeated special poses');
    const portrait = await sharp(path.join(root, 'app/skins/tortie', (index + 1) + '.webp')).metadata();
    assert.equal(portrait.width, 256); assert.equal(portrait.height, 256); assert.equal(portrait.hasAlpha, true);
    for (const [action, timing] of Object.entries(delays)) {
      const animation = await sharp(path.join(source, cat.id + '-' + action + '.webp'), { animated: true }).metadata();
      assert.equal(animation.pages, timing.length, cat.id + ': incorrect ' + action + ' frame count');
      assert.equal(animation.pageHeight, 256); assert.equal(animation.width, 256); assert.equal(animation.loop, 0);
      assert.deepEqual(animation.delay, timing, cat.id + ': incorrect ' + action + ' timing');
      await fs.access(path.join(source, cat.id + '-' + action + '-poster.png'));
    }
    await fs.access(path.join(source, manifest.skins[index].prompt));
    console.log('PASS: ' + cat.id + ', 16 complete transparent frames and three timed animations');
  }
  for (const [action, timing] of Object.entries(delays)) {
    for (const extension of ['webp', 'gif']) {
      const animation = await sharp(path.join(source, 'nine-' + action + '.' + extension), { animated: true }).metadata();
      assert.equal(animation.pages, timing.length); assert.equal(animation.width, 768); assert.equal(animation.pageHeight, 768);
      assert.deepEqual(animation.delay, timing);
    }
  }
  const html = await fs.readFile(path.join(source, 'preview.html'), 'utf8');
  for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Script(match[1]);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) await fs.access(path.resolve(source, match[1]));
  console.log('PASS: 9 skins, 144 frames, 27 animated clips, six animated contact sheets and local preview links');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
