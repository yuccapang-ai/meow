const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

async function waitFor(check, label) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out: ' + label);
}

async function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 0;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const callback = pending.get(message.id);
    if (!callback) return;
    pending.delete(message.id);
    clearTimeout(callback.timer);
    if (message.error) callback.reject(new Error(message.error.message));
    else callback.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const callback of pending.values()) {
      clearTimeout(callback.timer);
      callback.reject(new Error('Debug connection closed'));
    }
    pending.clear();
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  function request(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Debug command timed out: ' + method)); }, 10000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  return {
    request,
    close: () => socket.close(),
    evaluate: async expression => {
      const result = await request('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    }
  };
}

async function run() {
  assert.ok(process.argv[2], 'Pass the installed CatRoom.exe path');
  const executable = path.resolve(process.argv[2]);
  await fs.access(executable);
  const output = path.join(__dirname, '..', 'output', 'desktop');
  await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(output, 'installed-smoke-'));
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + port, '--user-data-dir=' + profile], { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  let launchError;
  child.on('error', error => { launchError = error; });
  let game;
  let pet;
  async function target(suffix) {
    return waitFor(async () => {
      if (launchError) throw launchError;
      if (child.exitCode !== null) throw new Error('Installed game exited: ' + logs);
      let response;
      try { response = await fetch('http://127.0.0.1:' + port + '/json/list'); }
      catch { return null; }
      const pages = await response.json();
      return pages.find(page => page.type === 'page' && page.url.endsWith(suffix));
    }, suffix);
  }
  try {
    game = await connect((await target('/app/index.html')).webSocketDebuggerUrl);
    await waitFor(() => game.evaluate("typeof gameDesktop !== 'undefined' && !!document.querySelector('[data-status-cat=cool] [data-desktop-pet]') && document.getElementById('room-background').naturalWidth > 0"), 'installed game resources');
    assert.equal(await game.evaluate('typeof require'), 'undefined');
    assert.ok(await game.evaluate('Math.abs(innerWidth - innerHeight * 9 / 16) <= 1 && Math.abs(innerWidth - document.getElementById("app").getBoundingClientRect().width) <= 1'));
    const gameShot = await game.request('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(output, 'installed-game.png'), Buffer.from(gameShot.data, 'base64'));
    await game.evaluate("document.querySelector('.room-cat[data-cat-id=cool]').click(); document.querySelector('[data-desktop-pet=toolbar]').click()");
    pet = await connect((await target('/desktop/pet.html')).webSocketDebuggerUrl);
    await waitFor(() => pet.evaluate("!!document.getElementById('cat') && document.getElementById('cat').dataset.ready === 'true'"), 'installed pet atlas');
    assert.equal(await pet.evaluate('document.getElementById("cat").dataset.catId'), 'cool');
    await waitFor(() => game.evaluate("!document.querySelector('[data-desktop-pet=toolbar]').disabled"), 'pet controls ready');
    await game.evaluate("document.querySelector('.room-cat[data-cat-id=tortie-strawberry]').click(); document.querySelector('[data-desktop-pet=toolbar]').click()");
    await waitFor(() => pet.evaluate('document.getElementById("cat").dataset.catId === "tortie-strawberry"'), 'installed pet switching');
    assert.ok(await pet.evaluate(`(() => {
      const pixels = document.getElementById('cat').getContext('2d').getImageData(0, 0, 360, 240).data;
      let count = 0;
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 24) count++;
      return count > 5000 && pixels[3] === 0;
    })()`));
    const petShot = await pet.request('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(output, 'installed-pet.png'), Buffer.from(petShot.data, 'base64'));
    assert.equal((await game.evaluate('gameDesktop.getState()')).active, true);
    await pet.evaluate('donutDesktop.returnHome()');
    await waitFor(async () => !(await game.evaluate('gameDesktop.getState()')).active, 'return from installed pet');
    console.log('PASS: installed EXE loads packaged game and pet assets, desktop controls, return-to-room, and isolated renderer.');
  } finally {
    if (game) {
      await game.evaluate('gameDesktop.setPetEnabled(false)').catch(() => {});
      await game.evaluate('window.close()').catch(() => {});
      game.close();
    }
    if (pet) pet.close();
    if (child.exitCode === null && !launchError) {
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
      if (child.exitCode === null) child.kill();
    }
    await fs.writeFile(path.join(output, 'installed-smoke.log'), logs);
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
