const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, session } = require('electron');

app.setName('DonutCat');
app.setPath('userData', app.commandLine.getSwitchValue('user-data-dir') || path.join(app.getPath('appData'), 'TTDDP-DonutCat'));
if (process.platform === 'win32') app.setAppUserModelId('com.ttddp.catroom');

const pagePath = path.join(__dirname, 'pet.html');
const pageUrl = pathToFileURL(pagePath).href;
const gamePath = path.join(__dirname, '..', 'app', 'index.html');
const gameUrl = pathToFileURL(gamePath).href;
const collection = require('../app/js/cat-collection.js');
const cats = [collection.starter, ...collection.catalog].filter(Boolean).map(cat => {
  const meta = require(path.join(__dirname, '..', 'app', cat.atlas.replace('.webp', '.json')));
  return { id: cat.id, name: cat.name, atlas: '../app/' + cat.atlas.replace(/^\.\//, ''),
    portrait: cat.portrait, cell: meta.cell, columns: meta.columns, rows: meta.rows,
    profile: cat.starter ? 'classic' : 'collection', special: cat.starter ? '舔爪洗脸' : cat.special };
});
const preferencePath = path.join(app.getPath('userData'), 'desktop-pet.json');
let currentCat = cats[0];
try {
  const saved = JSON.parse(fs.readFileSync(preferencePath, 'utf8'));
  currentCat = cats.find(cat => cat.id === saved.catId) || currentCat;
} catch {}
let gameWindow;
let petWindow;
let petCreation;
let tray;
let pointerTimer;
let drag = null;
let ignoring = false;
let menuOpen = false;
let quitting = false;
let petQueue = Promise.resolve();
let pendingCat;
let catToken = 0;

function petState() {
  return { catId: currentCat.id, cat: currentCat, active: !!(petWindow && !petWindow.isDestroyed() && petWindow.isVisible()) };
}

async function availableCats() {
  return gameWindow.webContents.executeJavaScript("window.TurtleCatCollection.get().roomList().filter(entry => entry.home && !window.TurtleRoom.isAway(entry.cat.id)).map(entry => entry.cat.id)");
}

function setPetEnabled(enabled, catId = currentCat.id) {
  const operation = petQueue.then(async () => {
    if (!enabled) { hidePet(); return petState(); }
    const cat = cats.find(entry => entry.id === catId);
    if (!cat || !(await availableCats()).includes(catId)) throw new Error('请先让这只猫入住并回到房间');
    return enablePet(cat);
  });
  petQueue = operation.catch(() => {});
  return operation;
}

function loadPetCat(cat) {
  return new Promise((resolve, reject) => {
    const token = ++catToken;
    const timer = setTimeout(() => { pendingCat = null; reject(new Error('猫咪动画加载超时，请重试')); }, 10000);
    pendingCat = { token, timer, resolve, reject };
    petWindow.webContents.send('pet:cat', { token, cat });
  });
}

function publishState() {
  if (gameWindow && !gameWindow.isDestroyed()) gameWindow.webContents.send('game:pet-state', petState());
}

function showGame(returnToRoom = false) {
  if (!gameWindow || gameWindow.isDestroyed()) return;
  if (gameWindow.isMinimized()) gameWindow.restore();
  gameWindow.webContents.setAudioMuted(false);
  gameWindow.show();
  gameWindow.focus();
  if (returnToRoom) gameWindow.webContents.send('game:return-room');
}

function hidePet() {
  if (!petWindow || petWindow.isDestroyed()) return;
  finishDrag();
  petWindow.hide();
  publishState();
}

async function returnHome() {
  await setPetEnabled(false);
  showGame(true);
  return petState();
}

async function enablePet(cat) {
  if (!petWindow || petWindow.isDestroyed()) {
    if (!petCreation) petCreation = createPetWindow().finally(() => { petCreation = null; });
    await petCreation;
  } else if (petCreation) await petCreation;
  if (quitting || !petWindow || petWindow.isDestroyed()) return petState();
  finishDrag();
  await loadPetCat(cat);
  currentCat = cat;
  petWindow.setTitle(cat.name + ' · 桌宠');
  tray.setToolTip(cat.name + '在桌面陪你：双击打开游戏，右键管理桌宠');
  fs.mkdirSync(path.dirname(preferencePath), { recursive: true });
  fs.writeFileSync(preferencePath, JSON.stringify({ version: 1, catId: cat.id }), 'utf8');
  petWindow.showInactive();
  petWindow.webContents.send('pet:drag-ended');
  publishState();
  return petState();
}

function positionAtHome() {
  const area = screen.getPrimaryDisplay().workArea;
  petWindow.setPosition(area.x + area.width - 380, area.y + area.height - 260);
}

function setIgnoring(value) {
  if (ignoring === value) return;
  ignoring = value;
  petWindow.setIgnoreMouseEvents(value, { forward: true });
}

function finishDrag() {
  if (!drag) return;
  drag = null;
  const bounds = petWindow.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  petWindow.setPosition(
    Math.round(Math.max(area.x, Math.min(area.x + area.width - bounds.width, bounds.x))),
    Math.round(Math.max(area.y, Math.min(area.y + area.height - bounds.height, bounds.y)))
  );
  petWindow.webContents.send('pet:drag-ended');
}

function perform(action) {
  finishDrag();
  petWindow.webContents.send('pet:action', action);
}

function showMenu() {
  finishDrag();
  menuOpen = true;
  const active = petState().active;
  if (active) setIgnoring(false);
  const items = [
    { label: currentCat.name + ' · 桌面陪伴', enabled: false },
    { label: '打开游戏', click: () => showGame() },
    { label: active ? '返回猫屋（收回桌宠）' : '去房间选择桌宠', click: () => {
      if (active) returnHome().catch(console.error);
      else showGame(true);
    } },
    { type: 'separator' }
  ];
  if (active) items.push(
    { label: currentCat.special, click: () => perform('special') },
    { label: '睡一会儿', click: () => perform('sleep') },
    { label: '起来散步', click: () => perform('walk') },
    { label: '回到右下角', click: () => { positionAtHome(); petWindow.showInactive(); } },
    { type: 'separator' }
  );
  items.push({ label: '退出游戏与桌宠', click: () => app.quit() });
  Menu.buildFromTemplate(items).popup({ window: active ? petWindow : gameWindow, callback: () => {
    menuOpen = false;
    if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('pet:drag-ended');
  } });
}

function trusted(event, window = petWindow, url = pageUrl) {
  return window && !window.isDestroyed() && event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === url;
}

function secureWindow(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
}

async function createPetWindow() {
  ignoring = false;
  petWindow = new BrowserWindow({
    title: currentCat.name + ' · 桌宠', width: 360, height: 240,
    frame: false, transparent: true, backgroundColor: '#00000000',
    resizable: false, maximizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  positionAtHome();
  secureWindow(petWindow);
  petWindow.on('blur', finishDrag);
  petWindow.on('close', event => { if (!quitting) { event.preventDefault(); returnHome().catch(console.error); } });
  petWindow.on('closed', () => { clearInterval(pointerTimer); drag = null; petWindow = null; publishState(); });
  try {
    await petWindow.loadFile(pagePath);
  } catch (error) {
    petWindow.destroy();
    throw error;
  }
  pointerTimer = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed() || !petWindow.isVisible()) return;
    const cursor = screen.getCursorScreenPoint();
    if (drag) {
      petWindow.setPosition(Math.round(drag.bounds.x + cursor.x - drag.cursor.x),
        Math.round(drag.bounds.y + cursor.y - drag.cursor.y));
      if (Date.now() - drag.started > 30000) finishDrag();
    }
    const bounds = petWindow.getBounds();
    petWindow.webContents.send('pet:pointer', { x: cursor.x - bounds.x, y: cursor.y - bounds.y });
  }, 33);
  return petWindow;
}

function registerHandlers() {
  ipcMain.on('pet:cat-ready', (event, token, loaded) => {
    if (!trusted(event) || !pendingCat || token !== pendingCat.token || typeof loaded !== 'boolean') return;
    const pending = pendingCat;
    pendingCat = null;
    clearTimeout(pending.timer);
    if (loaded) pending.resolve();
    else pending.reject(new Error('猫咪动画加载失败，请重试'));
  });
  ipcMain.on('pet:hit', (event, hit) => {
    if (trusted(event) && typeof hit === 'boolean' && !drag && !menuOpen) setIgnoring(!hit);
  });
  ipcMain.on('pet:drag-start', event => {
    if (!trusted(event)) return;
    drag = { cursor: screen.getCursorScreenPoint(), bounds: petWindow.getBounds(), started: Date.now() };
    setIgnoring(false);
  });
  ipcMain.on('pet:drag-end', event => { if (trusted(event)) finishDrag(); });
  ipcMain.on('pet:menu', event => { if (trusted(event)) showMenu(); });
  ipcMain.handle('pet:return-home', event => {
    if (!trusted(event)) throw new Error('Untrusted desktop request');
    return returnHome();
  });
  ipcMain.handle('game:pet-state', event => {
    if (!trusted(event, gameWindow, gameUrl)) throw new Error('Untrusted game request');
    return petState();
  });
  ipcMain.handle('game:pet-cats', async event => {
    if (!trusted(event, gameWindow, gameUrl)) throw new Error('Untrusted game request');
    const available = await availableCats();
    return cats.map(cat => ({ ...cat, available: available.includes(cat.id) }));
  });
  ipcMain.handle('game:set-pet', async (event, enabled, catId) => {
    if (!trusted(event, gameWindow, gameUrl) || typeof enabled !== 'boolean' || (enabled && !cats.some(cat => cat.id === catId))) {
      throw new Error('Invalid desktop pet request');
    }
    return setPetEnabled(enabled, catId);
  });
}

async function createGameWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  const height = Math.floor(Math.min(760, area.height - 48, (area.width - 24) * 16 / 9) / 16) * 16;
  gameWindow = new BrowserWindow({
    title: '猫猫对对碰 · 猫咪房间', width: height * 9 / 16, height,
    useContentSize: true, resizable: false, maximizable: false, fullscreenable: false, show: false, backgroundColor: '#f4e7cc',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'game-preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  gameWindow.setMenu(null);
  secureWindow(gameWindow);
  gameWindow.on('close', event => {
    if (quitting) return;
    if (petState().active) {
      event.preventDefault();
      gameWindow.webContents.setAudioMuted(true);
      gameWindow.hide();
    } else app.quit();
  });
  gameWindow.on('closed', () => { gameWindow = null; });
  await gameWindow.loadFile(gamePath);
  showGame();
  return gameWindow;
}

async function start() {
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  registerHandlers();
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'myasset', 'logo_cat.png'));
  tray = new Tray(icon.resize({ width: 32, height: 32 }));
  tray.setToolTip('猫猫对对碰：双击打开游戏，右键管理桌宠');
  tray.on('click', showMenu);
  tray.on('right-click', showMenu);
  tray.on('double-click', () => showGame());
  return createGameWindow();
}

const hasLock = app.requestSingleInstanceLock();
const ready = hasLock ? app.whenReady().then(start) : Promise.resolve(null);
if (!hasLock) app.quit();
app.on('second-instance', () => showGame());
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { quitting = true; clearInterval(pointerTimer); if (tray) tray.destroy(); });
ready.catch(error => { console.error(error); app.exit(1); });
module.exports = { ready, getPetWindow: () => petWindow };
