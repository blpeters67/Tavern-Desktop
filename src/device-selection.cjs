'use strict';

// Tavern (the website) stores the microphone and camera the user picked and asks for
// them with a "deviceId: { ideal }" constraint, so that an unplugged device falls back
// to the system default instead of failing. Chromium 130+ ignores "ideal" deviceId
// constraints when it chooses a device (the preferred device wins instead; see
// electron/electron#44502), so the stored choice is silently ignored and calls open
// with whatever Windows considers the default -- often a virtual driver that produces
// silence or black frames. This fix promotes a real stored device to "exact" and keeps
// the original graceful fallback by retrying the untouched constraints when the exact
// device is unavailable (unplugged, or removed while the app was open).

function promoteDeviceConstraints(constraints) {
  if (!constraints || typeof constraints !== 'object') return constraints;
  let promoted = null;
  for (const kind of ['audio', 'video']) {
    const media = constraints[kind];
    if (!media || typeof media !== 'object') continue;
    const device = media.deviceId;
    const wanted = typeof device === 'string' ? device
      : device && typeof device === 'object' && typeof device.ideal === 'string' ? device.ideal : null;
    if (!wanted || wanted === 'default' || wanted === 'communications') continue;
    promoted = promoted || Object.assign({}, constraints);
    promoted[kind] = Object.assign({}, media, { deviceId: { exact: wanted } });
  }
  return promoted || constraints;
}

// Runs inside the page (via executeJavaScript). Kept dependency-free and guarded so a
// reload or a second call cannot stack wrappers.
function applyDeviceSelectionFix(scope) {
  const win = scope && scope.window;
  const mediaDevices = scope && scope.navigator && scope.navigator.mediaDevices;
  if (!win || !mediaDevices || typeof mediaDevices.getUserMedia !== 'function') return false;
  if (win.__tavernDeviceSelectionFix) return true;
  win.__tavernDeviceSelectionFix = true;
  const promote = scope.promote;
  const original = mediaDevices.getUserMedia.bind(mediaDevices);
  mediaDevices.getUserMedia = async (constraints) => {
    const promoted = promote(constraints);
    if (promoted !== constraints) {
      try { return await original(promoted); }
      catch (error) {
        if (error && error.name === 'OverconstrainedError') return original(constraints);
        throw error;
      }
    }
    return original(constraints);
  };
  return true;
}

const deviceSelectionFixSource =
  `(${applyDeviceSelectionFix.toString()})({ window: window, navigator: navigator, promote: ${promoteDeviceConstraints.toString()} })`;

module.exports = { promoteDeviceConstraints, applyDeviceSelectionFix, deviceSelectionFixSource };
