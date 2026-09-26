'use strict';
const DEFAULT_URL = 'https://tavern.benjis.site/';
function normalizeServer(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Enter your Tavern website address.');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter a full address, such as https://tavern.benjis.site/'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('Use HTTPS (or HTTP on localhost for development).');
  if (url.username || url.password) throw new Error('The address must not include a username or password.');
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('Use the main website address, without a page path.');
  return url.origin + '/';
}
function sameOrigin(value, server) {
  try { return new URL(value).origin === new URL(server).origin; } catch { return false; }
}
function externalUrl(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
}
function classifyNavigation(value, server) {
  if (sameOrigin(value, server)) return 'internal';
  return externalUrl(value) ? 'external' : 'blocked';
}
function permissionAllowed(permission, origin, server) {
  return sameOrigin(origin, server) && ['media', 'notifications', 'fullscreen', 'display-capture', 'speaker-selection'].includes(permission);
}
function restoreSize(value) {
  const width = Number.isFinite(value?.width) ? Math.round(value.width) : 1280;
  const height = Number.isFinite(value?.height) ? Math.round(value.height) : 850;
  return { width: Math.max(800, Math.min(3840, width)), height: Math.max(600, Math.min(2160, height)) };
}
module.exports = { DEFAULT_URL, normalizeServer, sameOrigin, externalUrl, classifyNavigation, permissionAllowed, restoreSize };
