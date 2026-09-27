'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { UpdateController } = require('../src/update-controller.cjs');
function fake() {
  const updater = new EventEmitter();
  updater.checks = 0; updater.installs = [];
  updater.quitAndInstall = (...args) => updater.installs.push(args);
  return updater;
}
test('downloads in background; the button restarts immediately; duplicate clicks cannot install twice', async () => {
  const updater = fake(); let finish;
  updater.checkForUpdates = async () => {
    updater.checks++; updater.emit('checking-for-update');
    updater.emit('update-available', {version:'1.2.3'});
    return { downloadPromise: new Promise(resolve => { finish = resolve; }) };
  };
  const controller = new UpdateController(updater, { autoInstallOnAppQuit: true });
  const check = controller.check();
  await controller.activate();
  assert.equal(updater.checks, 1);
  assert.equal(controller.snapshot().status, 'downloading');
  updater.emit('download-progress', {percent:38.5});
  assert.equal(controller.snapshot().percent, 39);
  assert.equal(updater.autoInstallOnAppQuit, true);
  assert.equal(updater.allowDowngrade, false);
  assert.equal(updater.allowPrerelease, false);
  updater.emit('update-downloaded', {version:'1.2.3'}); finish([]);
  await check;
  assert.equal(controller.snapshot().status, 'ready');
  assert.deepEqual(updater.installs, []);
  await controller.check();
  assert.equal(updater.checks, 1, 'checking again must retain a ready update');
  await controller.activate(); await controller.activate();
  assert.deepEqual(updater.installs, [[true,true]]);
  controller.dispose();
});
test('failed verification does not install and a failed check can be retried', async () => {
  const updater = fake();
  updater.checkForUpdates = async () => { throw Object.assign(new Error('corrupt'), {code:'ERR_CHECKSUM_MISMATCH'}); };
  const controller = new UpdateController(updater);
  await controller.activate();
  assert.equal(controller.snapshot().status, 'error');
  assert.match(controller.snapshot().message, /verification failed/);
  assert.deepEqual(updater.installs, []);
  updater.checkForUpdates = async () => { updater.emit('update-not-available'); return null; };
  await controller.activate();
  assert.equal(controller.snapshot().status, 'current');
  controller.dispose();
});
test('manual checks are marked so the titlebar can speak up; automatic ones clear the mark', async () => {
  const updater = fake();
  updater.checkForUpdates = async () => { updater.emit('update-not-available'); return null; };
  const controller = new UpdateController(updater);
  await controller.check(true);
  assert.equal(controller.snapshot().status, 'current');
  assert.equal(controller.snapshot().manual, true);
  await controller.check();
  assert.equal(controller.snapshot().manual, false, 'an automatic check goes quiet again');
  updater.checkForUpdates = async () => { updater.emit('update-available', {version:'9.9.9'}); return null; };
  await controller.activate(); // not ready → the titlebar click asks for a manual check
  assert.equal(controller.snapshot().status, 'downloading');
  assert.equal(controller.snapshot().manual, true);
  controller.dispose();
});
test('development builds cannot start checks or installs', async () => {
  const controller = new UpdateController(null);
  await controller.activate(); controller.start();
  assert.equal(controller.snapshot().status, 'disabled');
  assert.equal(controller.startTimer, undefined);
  controller.dispose();
});
test('installer-launch errors return a retryable state', async () => {
  const updater = fake();
  const controller = new UpdateController(updater);
  updater.emit('update-downloaded', {version:'1.2.3'});
  updater.quitAndInstall = () => { throw new Error('Access denied'); };
  await controller.activate();
  assert.equal(controller.snapshot().status, 'error');
  controller.dispose();
});
test('a repository with no published releases reports up to date, not a retry', async () => {
  const updater = fake();
  updater.checkForUpdates = async () => { throw Object.assign(new Error('No published versions on GitHub'), { code: 'ERR_UPDATER_NO_PUBLISHED_VERSIONS' }); };
  const controller = new UpdateController(updater);
  await controller.check();
  assert.equal(controller.snapshot().status, 'current');
  assert.match(controller.snapshot().message, /latest desktop version/);
  assert.deepEqual(updater.installs, []);
  updater.checkForUpdates = async () => { throw Object.assign(new Error('getaddrinfo ENOTFOUND github.com'), { code: 'ENOTFOUND' }); };
  await controller.check();
  assert.equal(controller.snapshot().status, 'error', 'real network errors still retry');
  controller.dispose();
});
