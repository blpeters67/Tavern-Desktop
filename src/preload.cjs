'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// This preload is attached only to packaged local pages, never to the Tavern website.
contextBridge.exposeInMainWorld('desktop', {
  info: () => ipcRenderer.invoke('local:info'),
  connect: (address) => ipcRenderer.invoke('local:connect', address),
  retry: () => ipcRenderer.invoke('local:retry'),
  sources: () => ipcRenderer.invoke('local:sources'),
  share: (id, audio) => ipcRenderer.invoke('local:share', { id, audio }),
  cancel: () => ipcRenderer.invoke('local:cancel')
});
