const { contextBridge, ipcRenderer } = require('electron');

const getState = () => ipcRenderer.invoke('game:pet-state');
const getCats = () => ipcRenderer.invoke('game:pet-cats');
const setPetEnabled = (enabled, catId) => ipcRenderer.invoke('game:set-pet', enabled, catId);
contextBridge.exposeInMainWorld('gameDesktop', { getState, getCats, setPetEnabled });

let state = { active: false };
let cats = [];
let selectedId = null;
let pending = false;
let status;
let refreshTimer;

function setText(element, text) {
  if (element && element.textContent !== text) element.textContent = text;
}

function updateButtons() {
  const selected = cats.find(cat => cat.id === selectedId);
  setText(document.getElementById('desktop-pet-selection'), selected ? '已选中：' + selected.name : '点击房间中的小猫，再设为桌宠');
  document.querySelectorAll('[data-desktop-pet]').forEach(button => {
    const id = button.dataset.desktopPet === 'toolbar' ? selectedId : button.dataset.petCat;
    const cat = cats.find(entry => entry.id === id);
    const current = state.active && state.catId === id;
    setText(button, current ? '收回桌宠' : state.active && cat ? '换成这只猫' : '设为桌宠');
    button.disabled = pending || !cat || (!cat.available && !current);
    button.setAttribute('aria-pressed', String(current));
    button.setAttribute('aria-label', cat ? (current ? '收回' : '设为桌宠：') + cat.name : '请先点击房间里的小猫');
  });
  document.querySelectorAll('.room-cat[data-cat-id]').forEach(element => {
    element.setAttribute('data-desktop-selected', String(element.dataset.catId === selectedId));
    element.setAttribute('aria-pressed', String(element.dataset.catId === selectedId));
  });
  const recall = document.getElementById('desktop-pet-recall');
  if (recall) { recall.hidden = !state.active; recall.disabled = pending; }
}

function updateStatus() {
  if (!status) return;
  const selected = cats.find(cat => cat.id === selectedId);
  status.textContent = state.active ? state.cat.name + '正在桌面陪伴，选中另一只小猫可替换。'
    : selected && !selected.available ? selected.name + '暂不在房间，请等它回来或先召回。'
    : '可选择房间中的任意小猫；桌宠不影响游戏收集进度。';
}

function applyState(next) { state = next; updateButtons(); updateStatus(); }

async function changePet(enabled, id) {
  if (pending) return;
  pending = true;
  updateButtons();
  try { applyState(await setPetEnabled(enabled, id)); }
  catch (error) {
    status.textContent = '暂时无法设置桌宠，请确认小猫在房间内后重试。';
  } finally { pending = false; updateButtons(); }
}

function selectCat(id) {
  if (!cats.some(cat => cat.id === id)) return;
  selectedId = id;
  updateButtons();
  updateStatus();
}

function addButton(container, className, kind, catId) {
  if (!container || container.querySelector('[data-desktop-pet]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.dataset.desktopPet = kind;
  if (catId) button.dataset.petCat = catId;
  button.addEventListener('click', event => {
    event.stopPropagation();
    const id = kind === 'toolbar' ? selectedId : catId;
    if (!id) return;
    selectCat(id);
    changePet(!(state.active && state.catId === id), id);
  });
  container.appendChild(button);
}

function decorateCards() {
  cats.forEach(cat => {
    addButton(document.querySelector('[data-collection-cat="' + cat.id + '"]'), 'result-collection', 'collection', cat.id);
    addButton(document.querySelector('[data-status-cat="' + cat.id + '"]'), 'room-life__action', 'status', cat.id);
  });
  updateButtons();
}

async function refreshCats() {
  cats = await getCats();
  decorateCards();
  updateStatus();
}

ipcRenderer.on('game:pet-state', (event, next) => applyState(next));
ipcRenderer.on('game:return-room', () => {
  const collection = document.getElementById('screen-collection');
  const game = document.getElementById('screen-game');
  if (collection && collection.classList.contains('is-active')) document.getElementById('btn-collection-home').click();
  else if (game && game.classList.contains('is-active')) document.getElementById('btn-home-ingame').click();
  const panel = document.getElementById('room-life-panel');
  if (panel && !panel.hidden) document.getElementById('btn-room-life-close').click();
});

window.addEventListener('DOMContentLoaded', async () => {
  const style = document.createElement('style');
  style.textContent = '.room-cat[data-desktop-selected="true"] { outline: 3px dashed #bb6339; outline-offset: -8px; border-radius: 28px; } #desktop-pet-controls { padding: 8px 10px; border: 1px solid var(--sage-deep); border-radius: 12px; background: var(--paper); pointer-events: auto; gap: 8px; align-items: center; } #desktop-pet-selection { flex: 1; font-size: 12px; font-weight: 700; color: var(--moss); } #desktop-pet-controls button { margin: 0; flex-shrink: 0; } #desktop-pet-recall[hidden] { display: none; }';
  document.head.appendChild(style);
  const header = document.querySelector('.room__header');
  const controls = document.createElement('div');
  controls.id = 'desktop-pet-controls';
  controls.className = 'room__life-tools';
  const selection = document.createElement('span');
  selection.id = 'desktop-pet-selection';
  selection.setAttribute('aria-live', 'polite');
  controls.appendChild(selection);
  addButton(controls, 'room__arrange-button', 'toolbar');
  header.appendChild(controls);
  const recall = document.createElement('button');
  recall.id = 'desktop-pet-recall';
  recall.className = 'room__arrange-button';
  recall.type = 'button';
  recall.textContent = '收回桌宠';
  recall.hidden = true;
  recall.addEventListener('click', () => changePet(false));
  header.querySelector('.room__tools').appendChild(recall);
  status = document.createElement('p');
  status.id = 'desktop-pet-status';
  status.setAttribute('role', 'status');
  status.style.cssText = 'font-size:11px;line-height:1.5;margin-top:6px;color:var(--moss);pointer-events:none';
  header.appendChild(status);
  document.getElementById('room-world').addEventListener('click', event => {
    const cat = event.target.closest('.room-cat[data-cat-id]');
    if (cat && !cat.hidden && !cat.disabled) selectCat(cat.dataset.catId);
  });
  new MutationObserver(decorateCards).observe(document.getElementById('collection-list'), { childList: true, subtree: true });
  new MutationObserver(() => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshCats().catch(() => {}), 80);
  }).observe(document.getElementById('room-world'), { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled'] });
  try { await refreshCats(); applyState(await getState()); }
  catch { status.textContent = '桌宠连接失败，请重新打开 PC 游戏。'; }
});
