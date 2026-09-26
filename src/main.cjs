'use strict';
const { app, Menu, session, ipcMain, dialog, shell, desktopCapturer, nativeTheme, systemPreferences, clipboard } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { DEFAULT_URL, normalizeServer, sameOrigin, externalUrl, classifyNavigation, permissionAllowed, restoreSize } = require('./policy.cjs');
const { createTavernWindow, setUpdateController } = require('./window-chrome.cjs');
const { deviceSelectionFixSource } = require('./device-selection.cjs');
const smoke = process.argv.includes('--smoke-test');
if (smoke && !process.argv.includes('--real-devices')) app.commandLine.appendSwitch('use-fake-device-for-media-stream');
if (smoke) app.setPath('userData', path.join(app.isPackaged ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..'), '.test-profile', String(process.pid)));
app.setName('Tavern');
app.setAppUserModelId('site.benjis.tavern.desktop');
const icon = path.join(__dirname, '..', 'assets', 'icon.png');
const localFile = name => path.join(__dirname, 'local', name);
const localUrl = name => pathToFileURL(localFile(name)).href;
let config = { server: DEFAULT_URL };
let mainWindow, localWindow, picker, pendingShare, serverSession;
let quitting = false, navigation = 0, configPath;
let externalBusy = false;
let updateController;
const grants = new Set();
function saveConfig() {
  if (smoke) return;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const tmp = configPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
  fs.renameSync(tmp, configPath);
}
function safeSave() {
  try { saveConfig(); } catch { dialog.showErrorBox('Tavern', "Couldn't save your desktop settings. Check your disk space and folder permissions."); }
}
function localSender(event, name, win) {
  return !!win && !win.isDestroyed() && event.sender === win.page &&
    event.senderFrame === win.page.mainFrame && event.senderFrame.url === localUrl(name);
}
function trustedRequester(wc, origin) {
  return !!mainWindow && !mainWindow.isDestroyed() && wc === mainWindow.page &&
    sameOrigin(wc.getURL(), config.server) && sameOrigin(origin, config.server);
}
async function openExternal(url) {
  if (!externalUrl(url) || externalBusy || smoke) return;
  externalBusy = true;
  try {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question', title: 'Open Link', message: 'Open this link in your browser?',
      detail: url, buttons: ['Open Browser', 'Cancel'], defaultId: 0, cancelId: 1, noLink: true
    });
    if (response === 0) await shell.openExternal(url);
  } catch { /* window closed or external browser unavailable */ }
  finally { externalBusy = false; }
}
function guardContents(wc) {
  wc.on('will-attach-webview', event => event.preventDefault());
  const navigate = (event, url) => {
    if (event.isMainFrame === false) return;
    url = event.url || url;
    if (classifyNavigation(url, config.server) !== 'internal') {
      event.preventDefault();
      if (externalUrl(url)) void openExternal(url);
    }
  };
  wc.on('will-navigate', navigate);
  wc.on('will-redirect', navigate);
  wc.setWindowOpenHandler(({ url }) => {
    if (sameOrigin(url, config.server) || (url === 'about:blank' && sameOrigin(wc.getURL(), config.server))) {
      return { action: 'allow', overrideBrowserWindowOptions: {
        width: 1000, height: 750, icon, autoHideMenuBar: true,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false, session: serverSession }
      } };
    }
    void openExternal(url);
    return { action: 'deny' };
  });
  wc.on('did-create-window', child => { child.setMenu(null); guardContents(child.webContents); });
}
function finishShare(streams = {}) {
  if (!pendingShare) return;
  const current = pendingShare; pendingShare = null;
  const currentPicker = picker; picker = null;
  clearTimeout(current.timeout);
  try { current.callback(streams); } catch { /* originating page disappeared */ }
  if (currentPicker && !currentPicker.isDestroyed()) currentPicker.close();
}
async function showShare(request, callback) {
  if (!trustedRequester(mainWindow?.page, request.securityOrigin) || !request.frame ||
      request.frame !== mainWindow.page.mainFrame || !request.userGesture || pendingShare) { callback({}); return; }
  const frame = request.frame;
  const current = { callback, frame, audioRequested: request.audioRequested, sources: [], timeout: null };
  pendingShare = current;
  current.timeout = setTimeout(() => { if (pendingShare === current) finishShare(); }, 120000);
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 380, height: 220 } });
    if (pendingShare !== current) return;
    pendingShare.sources = sources.filter(s => !s.name.startsWith('Share Your Screen'));
    picker = createTavernWindow({ width: 820, height: 650, minWidth: 550, minHeight: 420, parent: mainWindow, modal: true,
      title: 'Share Your Screen · Tavern', icon, backgroundColor: '#101828', show: !smoke, autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
    picker.setMenu(null);
    picker.page.setWindowOpenHandler(() => ({ action: 'deny' }));
    picker.page.on('will-navigate', e => e.preventDefault());
    const openedPicker = picker;
    picker.on('closed', () => { if (picker === openedPicker) { picker = null; finishShare(); } });
    await picker.page.loadFile(localFile('share.html'));
  } catch { if (pendingShare === current) finishShare(); }
}
function configureSession() {
  serverSession = session.fromPartition('persist:tavern');
  serverSession.setPermissionCheckHandler((wc, permission, origin, details) => {
    if (permission === 'fullscreen') return true;
    if (!trustedRequester(wc, origin) || !permissionAllowed(permission, origin, config.server)) return false;
    if (['display-capture', 'speaker-selection'].includes(permission)) return true;
    const prefix = new URL(config.server).origin + ':' + permission;
    if (permission === 'media') return grants.has(prefix + ':' + details.mediaType);
    return grants.has(prefix);
  });
  serverSession.setPermissionRequestHandler(async (wc, permission, callback, details) => {
    const origin = details.requestingUrl || wc.getURL();
    if (permission === 'fullscreen') { callback(true); return; }
    if (!trustedRequester(wc, origin) || !permissionAllowed(permission, origin, config.server)) { callback(false); return; }
    if (['display-capture', 'speaker-selection'].includes(permission)) { callback(true); return; }
    const media = details.mediaTypes || [];
    // Electron 44 sends an empty 'media' request before getDisplayMedia's picker.
    // This only permits the preliminary step. showShare still requires a trusted,
    // active top-level page and an explicit source selection before any capture.
    if (permission === 'media' && !media.length) { callback(true); return; }
    if (permission === 'media' && media.some(t => !['audio', 'video'].includes(t))) { callback(false); return; }
    const prefix = new URL(config.server).origin + ':' + permission;
    const keys = permission === 'media' ? media.map(type => prefix + ':' + type) : [prefix];
    if (keys.every(key => grants.has(key))) { callback(true); return; }
    try {
      const label = permission === 'notifications' ? 'show desktop notifications' :
        'use your ' + media.map(t => t === 'audio' ? 'microphone' : 'camera').join(' and ');
      const { response } = await dialog.showMessageBox(mainWindow, { type: 'question', title: 'Tavern Permission',
        message: 'Allow Tavern to ' + label + '?', detail: new URL(config.server).origin,
        buttons: ['Allow', 'Not Now'], defaultId: 0, cancelId: 1, noLink: true });
      const allowed = response === 0 && trustedRequester(wc, origin);
      if (allowed) keys.forEach(key => grants.add(key));
      callback(allowed);
    } catch { callback(false); }
  });
  serverSession.setDisplayMediaRequestHandler(showShare);
  serverSession.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ title: 'Save From Tavern' });
    item.on('done', (_e, state) => {
      if (state === 'interrupted' && !smoke) dialog.showErrorBox('Download Interrupted', 'The file could not be downloaded. Try again from Tavern.');
    });
  });
}
async function showLocal(mode) {
  if (quitting) return;
  if (localWindow && !localWindow.isDestroyed()) {
    if (localWindow.mode !== mode) {
      localWindow.mode = mode;
      await localWindow.page.loadFile(localFile('index.html'));
    }
    if (!smoke) localWindow.focus();
    return;
  }
  localWindow = createTavernWindow({ width: 580, height: 640, minWidth: 480, minHeight: 560,
    title: mode === 'settings' ? 'Tavern Address' : 'Tavern', icon, backgroundColor: '#101828', show: !smoke,
    parent: mode === 'settings' ? mainWindow : undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  localWindow.mode = mode;
  localWindow.setMenu(null);
  localWindow.page.setWindowOpenHandler(() => ({ action: 'deny' }));
  localWindow.page.on('will-navigate', e => e.preventDefault());
  localWindow.on('closed', () => {
    localWindow = null;
    if (!smoke && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) app.quit();
  });
  await localWindow.page.loadFile(localFile('index.html'));
}
async function connect() {
  const ticket = ++navigation;
  try {
    await mainWindow.page.loadURL(config.server);
    if (ticket !== navigation || quitting || mainWindow.isDestroyed()) return;
    if (!smoke) { mainWindow.show(); mainWindow.page.focus(); }
    if (localWindow && !localWindow.isDestroyed()) {
      // The remote window must be visible before closing the last local window.
      await new Promise(resolve => { localWindow.once('closed', resolve); localWindow.close(); });
    }
  } catch {
    if (ticket !== navigation || quitting) return;
    if (!smoke) mainWindow.hide();
    await showLocal('offline');
  }
}
function registerIpc() {
  ipcMain.handle('local:info', event => {
    if (!localSender(event, 'index.html', localWindow)) throw new Error('Unavailable');
    return { server: config.server, mode: localWindow.mode };
  });
  ipcMain.handle('local:connect', (event, address) => {
    if (!localSender(event, 'index.html', localWindow)) throw new Error('Unavailable');
    try {
      const normalized = normalizeServer(address);
      config.server = normalized; grants.clear(); saveConfig();
      finishShare();
      void connect(); return { ok: true };
    } catch (error) { return { error: error.message }; }
  });
  ipcMain.handle('local:retry', event => {
    if (!localSender(event, 'index.html', localWindow)) throw new Error('Unavailable');
    void connect(); return { ok: true };
  });
  ipcMain.handle('local:sources', event => {
    if (!localSender(event, 'share.html', picker) || !pendingShare) throw new Error('Unavailable');
    return pendingShare.sources.map(s => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() }));
  });
  ipcMain.handle('local:share', (event, selection) => {
    if (!localSender(event, 'share.html', picker) || !pendingShare) throw new Error('Unavailable');
    const source = pendingShare.sources.find(s => s.id === selection?.id);
    if (!source || !sameOrigin(pendingShare.frame.url, config.server)) { finishShare(); return; }
    finishShare({ video: source, ...(selection.audio === true && pendingShare.audioRequested && process.platform === 'win32' ? { audio: 'loopback' } : {}) });
  });
  ipcMain.handle('local:cancel', event => {
    if (localSender(event, 'share.html', picker)) finishShare();
  });
}
let checkingDevices = false;
async function checkDevices() {
  if (checkingDevices || !trustedRequester(mainWindow?.page, config.server)) return;
  checkingDevices = true;
  try {
    const results = await require('./device-check.cjs').probeDevices(mainWindow.page);
    const report = require('./device-check.cjs').formatReport(results, {
      microphone: systemPreferences.getMediaAccessStatus('microphone'),
      camera: systemPreferences.getMediaAccessStatus('camera')
    });
    const { response } = await dialog.showMessageBox(mainWindow, {
      title: 'Tavern Device Check', message: 'Camera and microphone results',
      detail: report, buttons: ['Done', 'Copy Results'], defaultId: 0, cancelId: 0
    });
    if (response === 1) clipboard.writeText(report);
  } catch (error) {
    if (!quitting) dialog.showErrorBox('Device Check', error.message || 'Could not finish the device check.');
  } finally { checkingDevices = false; }
}
function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Tavern', submenu: [
      { label: 'Tavern Address…', click: () => void showLocal('settings') },
      { label: 'Open in Browser', click: () => void openExternal(config.server) },
      { type: 'separator' },
      { label: 'Reload Tavern', accelerator: 'CmdOrCtrl+R', click: () => void connect() },
      { label: 'Quit Tavern', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
    ] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => mainWindow.page.setZoomLevel(0) },
      { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: () => mainWindow.page.setZoomLevel(Math.min(5, mainWindow.page.getZoomLevel() + 0.5)) },
      { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => mainWindow.page.setZoomLevel(Math.max(-3, mainWindow.page.getZoomLevel() - 0.5)) }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { label: 'Help', submenu: [
      { label: 'Check Camera and Microphone…', click: () => void checkDevices() },
      { label: 'Check for Desktop Updates', click: () => void updateController.check() },
      { label: 'How to Update…', click: () => void dialog.showMessageBox(mainWindow, {
        title: 'Update Tavern Desktop', message: 'Click Restart & update in the title bar when an update is ready.',
        detail: 'Desktop updates download in the background. Restart only happens when you click the update button, and ends any active call. Your login and settings are kept.\n\nWebsite updates appear when you reload. Versions before 0.1.2 need one manual installer update to gain this button.'
      }) },
      { label: 'About Tavern Desktop', click: () => void dialog.showMessageBox(mainWindow, { title: 'Tavern Desktop', message: 'Tavern Desktop ' + app.getVersion(), detail: 'Your existing Tavern, in its own window.\nClose the window to quit and leave calls.\nWebsite updates appear automatically; desktop updates appear in the title bar.' }) },
      { label: 'Developer Tools', accelerator: 'CmdOrCtrl+Shift+I', click: () => mainWindow.page.toggleDevTools() }
    ] }
  ]));
}
async function createMain() {
  nativeTheme.themeSource = 'dark';
  configPath = path.join(app.getPath('userData'), 'desktop-settings.json');
  if (!smoke) {
    try {
      const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config = { server: normalizeServer(saved.server), size: restoreSize(saved.size), maximized: !!saved.maximized };
    } catch { /* first launch or invalid settings: use the default server */ }
  }
  const { UpdateController } = require('./update-controller.cjs');
  updateController = new UpdateController(app.isPackaged && !smoke ? require('electron-updater').autoUpdater : null);
  setUpdateController(updateController);
  configureSession(); registerIpc();
  mainWindow = createTavernWindow({ ...restoreSize(config.size), minWidth: 800, minHeight: 600, show: false,
    title: 'Tavern', icon, backgroundColor: '#101828', autoHideMenuBar: true,
    webPreferences: { session: serverSession, sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false, backgroundThrottling: false, spellcheck: true, autoplayPolicy: 'no-user-gesture-required' } });
  guardContents(mainWindow.page);
  mainWindow.page.on('dom-ready', () => {
    try { mainWindow.page.executeJavaScript(deviceSelectionFixSource).catch(() => { /* page closed mid-load */ }); } catch { /* window closed */ }
  });
  mainWindow.page.on('page-title-updated', e => { e.preventDefault(); mainWindow.setTitle('Tavern'); });
  mainWindow.page.on('did-start-navigation', (_e, _url, _inPlace, isMainFrame) => { if (isMainFrame) finishShare(); });
  mainWindow.page.on('render-process-gone', () => { if (!quitting) { mainWindow.hide(); void showLocal('offline'); } });
  mainWindow.on('close', () => {
    config.size = mainWindow.getNormalBounds(); config.maximized = mainWindow.isMaximized();
    safeSave();
    if (!quitting) app.quit();
  });
  buildMenu();
  if (config.maximized) mainWindow.maximize();
  if (smoke) await runSmoke();
  else { updateController.start(); await showLocal('loading'); await connect(); }
}
async function runSmoke() {
  const assert = require('node:assert/strict');
  const http = require('node:http');
  const testServer = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><title>Fixture</title><h1>Tavern test server</h1>');
  });
  await new Promise(resolve => testServer.listen(0, '127.0.0.1', resolve));
  config.server = 'http://127.0.0.1:' + testServer.address().port + '/';
  let failed = false;
  try {
    await connect();
    assert.equal(await mainWindow.page.executeJavaScript('document.querySelector("h1").textContent'), 'Tavern test server');
    assert.equal(await mainWindow.page.executeJavaScript('typeof require + ":" + typeof window.desktop'), 'undefined:undefined');
    assert.equal(mainWindow.page.getLastWebPreferences().sandbox, true);
    assert.equal(mainWindow.pageView.getBounds().y, 40);
    assert.equal(mainWindow.pageView.getBounds().height, mainWindow.getContentSize()[1] - 40);
    await require('./media-smoke.cjs')({ app, mainWindow, serverSession, desktopCapturer, dialog,
      getPicker: () => picker, server: config.server, showShare });
    await showLocal('settings');
    assert.equal(await localWindow.page.executeJavaScript('typeof window.desktop.connect'), 'function');
    assert.equal((await localWindow.page.executeJavaScript('window.desktop.info()')).server, config.server);
    const bad = await localWindow.page.executeJavaScript('window.desktop.connect("file:///C:/Windows")');
    assert.match(bad.error, /HTTPS/);
    await serverSession.cookies.set({ url: config.server, name: 'fixture', value: 'persisted', expirationDate: Date.now() / 1000 + 3600 });
    assert.equal((await serverSession.cookies.get({ url: config.server, name: 'fixture' }))[0].value, 'persisted');
    assert.equal(serverSession.isPersistent(), true);
    assert.equal(permissionAllowed('media', 'https://untrusted.invalid', config.server), false);
    await new Promise(resolve => testServer.close(resolve));
    await connect();
    assert.equal((await localWindow.page.executeJavaScript('window.desktop.info()')).mode, 'offline');
    await localWindow.page.executeJavaScript(`new Promise((resolve, reject) => {
      const deadline = Date.now() + 5000;
      const timer = setInterval(() => {
        if (document.querySelector('#title').textContent === "Couldn't reach Tavern.") {
          clearInterval(timer); resolve();
        } else if (Date.now() > deadline) { clearInterval(timer); reject(new Error('Recovery UI did not initialize')); }
      }, 25);
    })`);
    await new Promise(resolve => setTimeout(resolve, 150));
    const shot = await localWindow.webContents.capturePage();
    fs.writeFileSync(path.join(app.getPath('userData'), 'offline-preview.png'), shot.toPNG());
    console.log('Preview: ' + path.join(app.getPath('userData'), 'offline-preview.png'));
    const port = new URL(config.server).port;
    await new Promise(resolve => testServer.listen(Number(port), '127.0.0.1', resolve));
    await connect();
    assert.equal(localWindow, null);
    assert.equal(await mainWindow.page.executeJavaScript('document.querySelector("h1").textContent'), 'Tavern test server');
    await mainWindow.chromeReady;
    assert.equal(await mainWindow.webContents.executeJavaScript('document.querySelector("#brand").textContent'), 'Tavern');
    assert.equal(await mainWindow.page.executeJavaScript('typeof window.tavernChrome'), 'undefined');
    const fakeUpdater = new (require('node:events').EventEmitter)();
    let installs = 0;
    fakeUpdater.quitAndInstall = (silent, restart) => { assert.equal(silent, true); assert.equal(restart, true); installs++; };
    updateController.dispose();
    updateController = new (require('./update-controller.cjs').UpdateController)(fakeUpdater);
    setUpdateController(updateController);
    fakeUpdater.emit('update-downloaded', { version: '99.0.0' });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await mainWindow.webContents.executeJavaScript('document.querySelector("#update").textContent'), 'Restart & update');
    assert.equal(installs, 0);
    const chromeShot = await mainWindow.webContents.capturePage({ x: 0, y: 0, width: mainWindow.getContentSize()[0], height: 40 });
    fs.writeFileSync(path.join(app.getPath('userData'), 'titlebar-preview.png'), chromeShot.toPNG());
    await mainWindow.webContents.executeJavaScript('window.tavernChrome.update()');
    assert.equal(installs, 1);
    console.log('PASS: update button displays ready state and invokes installation only after a trusted title-bar action.');
    console.log('PASS: Electron loads server, isolates remote content, validates settings, persists session and presents offline recovery.');
  } catch (error) { failed = true; console.error(error?.stack || error?.message || String(error)); }
  finally { testServer.close(); quitting = true; app.exit(failed ? 1 : 0); }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    const win = localWindow || mainWindow;
    if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });
  app.on('before-quit', () => { quitting = true; updateController?.dispose(); finishShare(); });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(createMain).catch(error => { console.error(error); app.exit(1); });
}