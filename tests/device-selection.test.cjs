'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { promoteDeviceConstraints, applyDeviceSelectionFix, deviceSelectionFixSource } = require('../src/device-selection.cjs');

test('a saved device id is promoted from ideal to exact without touching other fields', () => {
  const original = { audio: { deviceId: { ideal: 'mic-1' }, echoCancellation: true }, video: false };
  const promoted = promoteDeviceConstraints(original);
  assert.notEqual(promoted, original);
  assert.deepEqual(promoted.audio, { deviceId: { exact: 'mic-1' }, echoCancellation: true });
  assert.equal(promoted.video, false);
  assert.deepEqual(original.audio.deviceId, { ideal: 'mic-1' });
});

test('bare string device ids and both media kinds are handled', () => {
  const promoted = promoteDeviceConstraints({ audio: { deviceId: 'mic-1' }, video: { deviceId: { ideal: 'cam-1' }, width: 640 } });
  assert.deepEqual(promoted.audio.deviceId, { exact: 'mic-1' });
  assert.deepEqual(promoted.video, { deviceId: { exact: 'cam-1' }, width: 640 });
});

test('defaults, exact constraints and non-device requests are left alone', () => {
  for (const constraints of [
    { audio: { deviceId: { ideal: 'default' } } },
    { audio: { deviceId: { ideal: 'communications' } } },
    { audio: { deviceId: { exact: 'mic-1' } } },
    { audio: true, video: true },
    { video: { facingMode: 'user' } },
    {}
  ]) assert.equal(promoteDeviceConstraints(constraints), constraints);
  assert.equal(promoteDeviceConstraints(null), null);
  assert.equal(promoteDeviceConstraints(undefined), undefined);
  assert.equal(promoteDeviceConstraints('audio'), 'audio');
});

test('the page fix promotes real devices, keeps defaults and falls back when a device is gone', async () => {
  const calls = [];
  const fakeDevices = {
    getUserMedia: async (constraints) => {
      calls.push(constraints);
      const wanted = constraints.audio && constraints.audio.deviceId;
      if (wanted && wanted.exact === 'gone') {
        const error = new Error('device unavailable');
        error.name = 'OverconstrainedError';
        throw error;
      }
      return { seen: constraints };
    }
  };
  const scope = { window: {}, navigator: { mediaDevices: fakeDevices }, promote: promoteDeviceConstraints };
  assert.equal(applyDeviceSelectionFix(scope), true);
  assert.equal(applyDeviceSelectionFix(scope), true);
  const patched = fakeDevices.getUserMedia;

  await patched({ audio: { deviceId: { ideal: 'mic-1' }, echoCancellation: true } });
  assert.deepEqual(calls.at(-1).audio.deviceId, { exact: 'mic-1' });
  assert.equal(calls.at(-1).audio.echoCancellation, true);

  await patched({ audio: { deviceId: { ideal: 'default' } } });
  assert.deepEqual(calls.at(-1).audio.deviceId, { ideal: 'default' });

  await patched({ audio: { deviceId: { ideal: 'gone' } } });
  assert.deepEqual(calls.at(-2).audio.deviceId, { exact: 'gone' });
  assert.deepEqual(calls.at(-1).audio.deviceId, { ideal: 'gone' });
});

test('the injected source is self-contained and does not throw without a page', () => {
  assert.doesNotThrow(() => new Function(deviceSelectionFixSource));
  const run = new Function('window', 'navigator', 'return ' + deviceSelectionFixSource);
  assert.equal(run(undefined, undefined), false);
  assert.equal(run({}, { mediaDevices: { getUserMedia: async () => ({}) } }), true);
  assert.match(deviceSelectionFixSource, /__tavernDeviceSelectionFix/);
});
