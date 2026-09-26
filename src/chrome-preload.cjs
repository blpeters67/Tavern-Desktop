'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tavernChrome', {
  info: () => ipcRenderer.invoke('chrome:action', 'info'),
  menu: () => ipcRenderer.invoke('chrome:action', 'menu'),
  update: () => ipcRenderer.invoke('chrome:action', 'update'),
  onUpdate: listener => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on('chrome:update-state', handler);
    return () => ipcRenderer.removeListener('chrome:update-state', handler);
  }
});
