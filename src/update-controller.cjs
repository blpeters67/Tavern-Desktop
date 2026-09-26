'use strict';
const { EventEmitter } = require('node:events');
class UpdateController extends EventEmitter {
  constructor(updater, options = {}) {
    super(); this.updater = updater; this.busy = false;
    this.state = { status: updater ? 'idle' : 'disabled', version: '', percent: 0,
      message: updater ? 'Check for desktop updates' : 'Updates are available in the installed app.' };
    this.listeners = [];
    if (!updater) return;
    updater.autoDownload = true;
    // Install a downloaded update when the app closes; main.cjs opts in with app.isPackaged.
    // Test harnesses keep it off so no installer can ever run during tests.
    updater.autoInstallOnAppQuit = options.autoInstallOnAppQuit === true;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.disableWebInstaller = true;
    this.listen('checking-for-update', () => this.set({ status: 'checking', message: 'Checking for updates…' }));
    this.listen('update-not-available', () => this.set({ status: 'current', version: '', percent: 0, message: 'You have the latest desktop version.' }));
    this.listen('update-available', info => this.set({ status: 'downloading', version: info.version, percent: 0, message: 'Downloading desktop update…' }));
    this.listen('download-progress', info => this.set({ status: 'downloading', percent: Math.max(0, Math.min(100, Math.round(info.percent || 0))) }));
    this.listen('update-downloaded', info => this.set({ status: 'ready', version: info.version, percent: 100,
      message: 'Update v' + info.version + ' is ready. Restart to install now (ends any active call), or it installs when you close Tavern.' }));
    this.listen('error', error => this.fail(error));
    this.listen('update-cancelled', () => this.set({ status: 'error', message: 'Download cancelled. Click to try again.' }));
  }
  listen(event, handler) { this.updater.on(event, handler); this.listeners.push([event, handler]); }
  snapshot() { return { ...this.state }; }
  set(patch) { this.state = { ...this.state, ...patch }; this.emit('change', this.snapshot()); }
  fail(error) {
    const code = String(error?.code || '');
    const detail = String(error?.message || '');
    // A repository with no published releases (or none newer than this build) is not a
    // failure: the app is as current as it can be, and "Up to date" is the honest label.
    if (code === 'ERR_UPDATER_NO_PUBLISHED_VERSIONS' || /no published versions/i.test(detail)) {
      this.set({ status: 'current', version: '', percent: 0, message: 'You have the latest desktop version.' });
      return;
    }
    const verification = /CHECKSUM|SIGNATURE/.test(code);
    this.set({ status: 'error', percent: 0, message: verification
      ? 'Update verification failed. Nothing was installed. Click to retry.'
      : 'Could not check or download an update. Check your connection and click to retry.' });
  }
  async check() {
    if (!this.updater || this.busy || ['ready', 'installing'].includes(this.state.status)) return this.snapshot();
    this.busy = true;
    try {
      const result = await this.updater.checkForUpdates();
      if (result?.downloadPromise) await result.downloadPromise;
    } catch (error) { this.fail(error); }
    finally { this.busy = false; }
    return this.snapshot();
  }
  async activate() {
    if (this.state.status !== 'ready') return this.check();
    this.set({ status: 'installing', message: 'Restarting Tavern to install the update…' });
    try { this.updater.quitAndInstall(true, true); }
    catch (error) { this.fail(error); }
    return this.snapshot();
  }
  start() {
    if (!this.updater || this.startTimer) return;
    this.startTimer = setTimeout(() => void this.check(), 15000);
    this.interval = setInterval(() => void this.check(), 4 * 60 * 60 * 1000);
    this.startTimer.unref?.(); this.interval.unref?.();
  }
  dispose() {
    clearTimeout(this.startTimer); clearInterval(this.interval);
    for (const [event, handler] of this.listeners) this.updater.removeListener(event, handler);
    this.removeAllListeners();
  }
}
module.exports = { UpdateController };
