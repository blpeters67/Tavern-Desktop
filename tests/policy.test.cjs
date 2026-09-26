'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeServer, classifyNavigation, permissionAllowed, restoreSize } = require('../src/policy.cjs');
test('server addresses allow HTTPS and loopback development only', () => {
  assert.equal(normalizeServer(' https://tavern.benjis.site '), 'https://tavern.benjis.site/');
  assert.equal(normalizeServer('http://localhost:8080'), 'http://localhost:8080/');
  for (const bad of ['javascript:alert(1)', 'file:///C:/Windows', 'http://example.com', 'https://user:secret@example.com', 'https://example.com/login', 'https://example.com/?token=x', 'https://example.com/#x']) assert.throws(() => normalizeServer(bad));
});
test('navigation uses exact origin, never a hostname prefix', () => {
  const site = 'https://tavern.benjis.site/';
  assert.equal(classifyNavigation(site + 'channels/1/2', site), 'internal');
  assert.equal(classifyNavigation('https://tavern.benjis.site.evil.test/', site), 'external');
  assert.equal(classifyNavigation('https://tavern.benjis.site:444/', site), 'external');
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'ms-settings:privacy', 'https://user:password@example.com']) assert.equal(classifyNavigation(url, site), 'blocked');
});
test('hardware permissions belong to Tavern, not embedded or unrelated sites', () => {
  const site = 'https://tavern.benjis.site/';
  assert.equal(permissionAllowed('media', site, site), true);
  assert.equal(permissionAllowed('media', 'https://youtube.com', site), false);
  assert.equal(permissionAllowed('geolocation', site, site), false);
  assert.equal(permissionAllowed('media', 'https://tavern.benjis.site.evil.test', site), false);
});
test('corrupt window settings cannot create invisible or unusable windows', () => {
  assert.deepEqual(restoreSize({ width: -1, height: Infinity }), { width: 800, height: 850 });
  assert.deepEqual(restoreSize({ width: 99999, height: 90000 }), { width: 3840, height: 2160 });
});
