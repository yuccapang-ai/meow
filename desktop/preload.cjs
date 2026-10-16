const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('donutDesktop', {
  hit: value => ipcRenderer.send('pet:hit', value),
  startDrag: () => ipcRenderer.send('pet:drag-start'),
  endDrag: () => ipcRenderer.send('pet:drag-end'),
  menu: () => ipcRenderer.send('pet:menu'),
  returnHome: () => ipcRenderer.invoke('pet:return-home'),
  catReady: (token, loaded) => ipcRenderer.send('pet:cat-ready', token, loaded),
  onCat: callback => ipcRenderer.on('pet:cat', (event, payload) => callback(payload)),
  onPointer: callback => ipcRenderer.on('pet:pointer', (event, point) => callback(point)),
  onAction: callback => ipcRenderer.on('pet:action', (event, action) => callback(action)),
  onDragEnded: callback => ipcRenderer.on('pet:drag-ended', () => callback())
});
