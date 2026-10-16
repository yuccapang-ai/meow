const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const output = path.join(__dirname, '..', 'output', 'desktop');
fsSync.mkdirSync(output, { recursive: true });
app.setPath('appData', fsSync.mkdtempSync(path.join(output, 'smoke-')));
const errors = [];
app.on('web-contents-created', (event, contents) => {
  contents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  contents.on('preload-error', (event, preload, error) => errors.push(error.message));
});
const { ready, getPetWindow } = require('./main.cjs');

async function waitFor(check, message) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out: ' + message);
}

async function run() {
  const game = await ready;
  const evaluate = script => game.webContents.executeJavaScript(script);
  assert.ok(game.isVisible());
  assert.equal(getPetWindow(), undefined);
  await waitFor(() => evaluate(`document.querySelector('[data-status-cat="cool"] [data-desktop-pet]') && document.getElementById('room-background').naturalWidth > 0`), 'desktop controls and room');
  assert.equal(await evaluate("typeof require"), 'undefined');
  assert.equal(await evaluate("document.querySelector('[data-desktop-pet=toolbar]').disabled"), true);
  const dimensions = await evaluate('({ width: innerWidth, height: innerHeight, room: document.getElementById("app").getBoundingClientRect().width })');
  assert.ok(Math.abs(dimensions.width - dimensions.height * 9 / 16) <= 1, JSON.stringify(dimensions));
  assert.ok(Math.abs(dimensions.width - dimensions.room) <= 1);
  assert.equal(game.isResizable(), false);
  assert.equal(await evaluate("gameDesktop.setPetEnabled(true, 'donut').then(() => false, () => true)"), true, 'Locked cats rejected');
  assert.equal(await evaluate("gameDesktop.setPetEnabled(true, 'unknown').then(() => false, () => true)"), true, 'Unknown cats rejected');
  await evaluate(`document.querySelector('.room-cat[data-cat-id="cool"]').click()`);
  assert.equal(await evaluate(`document.querySelector('.room-cat[data-cat-id="cool"]').dataset.desktopSelected`), 'true');
  await evaluate("document.querySelector('[data-desktop-pet=toolbar]').click()");
  await waitFor(() => getPetWindow() && getPetWindow().isVisible(), 'selected cool cat pet');
  const pet = getPetWindow();
  const petEvaluate = script => pet.webContents.executeJavaScript(script);
  assert.equal(await petEvaluate('document.getElementById("cat").dataset.catId'), 'cool');
  assert.equal(await petEvaluate('document.getElementById("cat").dataset.rows'), '6');
  assert.equal(pet.isAlwaysOnTop(), true);
  pet.webContents.send('pet:action', 'sleep');
  await waitFor(() => petEvaluate('Number(document.getElementById("cat").dataset.frame) >= 20'), 'classic sleep frames');
  const point = await petEvaluate(`(() => {
    const pixels = document.getElementById('cat').getContext('2d').getImageData(0, 0, 360, 240).data;
    for (let row = 140; row < 210; row++) {
      for (let column = 100; column < 240; column++) {
        if (pixels[(row * 360 + column) * 4 + 3] > 240) return { x: column, y: row };
      }
    }
  })()`);
  assert.ok(point);
  pet.setIgnoreMouseEvents(false);
  pet.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point });
  pet.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point });
  await waitFor(() => petEvaluate('document.getElementById("cat").dataset.action === "wake"'), 'click wakes pet');
  await fs.writeFile(path.join(output, 'cool-pet.png'), (await pet.webContents.capturePage()).toPNG());

  await waitFor(() => evaluate("!document.querySelector('[data-desktop-pet=toolbar]').disabled"), 'selection ready');
  await evaluate(`document.querySelector('.room-cat[data-cat-id="tortie-strawberry"]').click(); document.querySelector('[data-desktop-pet=toolbar]').click()`);
  await waitFor(() => petEvaluate('document.getElementById("cat").dataset.catId === "tortie-strawberry"'), 'switch to selected strawberry cat');
  await waitFor(() => evaluate("!document.querySelector('[data-desktop-pet=toolbar]').disabled"), 'switch completed');
  assert.equal(getPetWindow(), pet);
  assert.equal(await petEvaluate('document.getElementById("cat").dataset.rows'), '4');
  await fs.writeFile(path.join(output, 'desktop-selection.png'), (await game.webContents.capturePage()).toPNG());
  await fs.writeFile(path.join(output, 'strawberry-pet.png'), (await pet.webContents.capturePage()).toPNG());
  await evaluate("Promise.all([gameDesktop.setPetEnabled(true, 'cool'), gameDesktop.setPetEnabled(true, 'tortie-strawberry')])");
  assert.equal(BrowserWindow.getAllWindows().length, 2);
  const saved = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'desktop-pet.json'), 'utf8'));
  assert.equal(saved.catId, 'tortie-strawberry');

  await evaluate("document.getElementById('btn-collection').click()");
  await waitFor(() => evaluate(`!!document.querySelector('[data-collection-cat="donut"] [data-desktop-pet]')`), 'collection entry');
  assert.equal(await evaluate(`document.querySelector('[data-collection-cat="donut"] [data-desktop-pet]').disabled`), true);
  await evaluate("document.querySelectorAll('#collection-series button')[1].click()");
  await waitFor(() => evaluate(`!!document.querySelector('[data-collection-cat="tortie-strawberry"] [data-desktop-pet]')`), 'other series controls');
  await evaluate(`document.querySelector('[data-collection-cat="tortie-strawberry"] [data-desktop-pet]').click()`);
  await waitFor(() => !pet.isVisible(), 'collection recalls pet');
  await petEvaluate('donutDesktop.returnHome()');
  await waitFor(() => evaluate("document.querySelector('.screen.is-active').id === 'screen-room'"), 'return to room');
  await evaluate("document.getElementById('btn-room-life').click()");
  await evaluate(`document.querySelector('[data-status-cat="cool"] [data-desktop-pet]').click()`);
  await waitFor(() => pet.isVisible(), 'status enables pet');
  game.close();
  await waitFor(() => !game.isVisible(), 'close hides active game');
  assert.equal(game.webContents.isAudioMuted(), true);
  await petEvaluate('donutDesktop.returnHome()');
  await waitFor(() => game.isVisible() && !pet.isVisible(), 'restore game');
  assert.equal(game.webContents.isAudioMuted(), false);

  await evaluate(`TurtleRoom.leave(); ['cats', 'tortie'].forEach(skin => TurtleCatCollection.get().recordRun(skin, Array(9).fill(100), 'smoke-' + skin, false))`);
  const cats = await evaluate('gameDesktop.getCats()');
  assert.equal(cats.length, 19);
  for (const cat of cats) {
    assert.equal(cat.available, true);
    await evaluate('gameDesktop.setPetEnabled(true, ' + JSON.stringify(cat.id) + ')');
    const state = await petEvaluate(`(() => {
      const canvas = document.getElementById('cat');
      const pixels = canvas.getContext('2d').getImageData(0, 0, 360, 240).data;
      let visible = 0;
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 24) visible++;
      return { id: canvas.dataset.catId, rows: Number(canvas.dataset.rows), visible, corner: pixels[3] };
    })()`);
    assert.equal(state.id, cat.id);
    assert.equal(state.rows, cat.rows);
    assert.ok(state.visible > 3000, cat.id);
    assert.equal(state.corner, 0);
  }
  await evaluate(`window.originalIsAway = TurtleRoom.isAway; TurtleRoom.isAway = id => id === 'donut'; void 0`);
  assert.equal(await evaluate("gameDesktop.setPetEnabled(true, 'donut').then(() => false, () => true)"), true, 'Traveling cats rejected');
  await evaluate('TurtleRoom.isAway = window.originalIsAway; gameDesktop.setPetEnabled(false)');

  const web = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'web-smoke' } });
  await web.loadFile(path.join(__dirname, '..', 'app', 'index.html'));
  assert.equal(await web.webContents.executeJavaScript("typeof gameDesktop === 'undefined' && !document.querySelector('[data-desktop-pet]')"), true);
  web.destroy();
  assert.deepEqual(errors, []);
  console.log('PASS: narrow 9:16 window, room selection, all 19 cats, atlas profiles, locked/away validation, singleton switching, persistence, collection/status controls, close/restore and web isolation.');
  game.close();
}

const timeout = setTimeout(() => { console.error('Desktop smoke test timed out'); app.exit(1); }, 60000);
timeout.unref();
run().catch(error => { console.error(error); app.exit(1); });
