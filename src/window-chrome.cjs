'use strict';
const { BrowserWindow, WebContentsView, ipcMain, Menu, app } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const chromeFile = path.join(__dirname, 'local', 'chrome.html');
const chromeUrl = pathToFileURL(chromeFile).href;
const windows = new Set();
const BAR_HEIGHT = 40;
let updateController;
function setUpdateController(controller) {
  updateController = controller;
  controller.on('change', state => {
    for (const win of windows) {
      if (!win.isDestroyed()) win.webContents.send('chrome:update-state', state);
    }
  });
}

ipcMain.handle('chrome:action', (event, action) => {
  const win = [...windows].find(w => !w.isDestroyed() && w.webContents === event.sender);
  if (!win || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== chromeUrl) return;
  if (action === 'info') return { title: win.getTitle(), version: app.getVersion(), update: updateController?.snapshot() };
  if (action === 'update') return updateController?.activate();
  if (action === 'menu') { win.page.focus(); Menu.getApplicationMenu()?.popup({ window: win, x: 12, y: BAR_HEIGHT }); }
});

function createTavernWindow(options) {
  const { webPreferences, ...windowOptions } = options;
  const win = new BrowserWindow({
    ...windowOptions, titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#070c17', symbolColor: '#e0b252', height: BAR_HEIGHT },
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false,
      preload: path.join(__dirname, 'chrome-preload.cjs') }
  });
  windows.add(win);
  const view = new WebContentsView({ webPreferences });
  win.contentView.addChildView(view);
  win.page = view.webContents;
  win.pageView = view;
  let htmlFullscreen = false;
  const layout = () => {
    if (win.isDestroyed()) return;
    const [width, height] = win.getContentSize();
    const top = win.isFullScreen() || htmlFullscreen ? 0 : BAR_HEIGHT;
    view.setBounds({ x: 0, y: top, width, height: Math.max(0, height - top) });
  };
  win.on('resize', layout);
  win.on('enter-full-screen', layout);
  win.on('leave-full-screen', layout);
  win.on('enter-html-full-screen', () => { htmlFullscreen = true; layout(); });
  win.on('leave-html-full-screen', () => { htmlFullscreen = false; layout(); });
  win.on('closed', () => {
    windows.delete(win);
    // WebContentsViews do not automatically close with their parent window.
    if (!win.page.isDestroyed()) win.page.close({ waitForBeforeUnload: false });
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.on('page-title-updated', e => e.preventDefault());
  win.chromeReady = win.loadFile(chromeFile);
  layout();
  return win;
}
module.exports = { createTavernWindow, setUpdateController };
