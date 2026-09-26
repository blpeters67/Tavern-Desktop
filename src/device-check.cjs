'use strict';
async function checkInPage() {
  const results = [];
  for (const [kind, label] of [['audio', 'Microphone'], ['video', 'Camera']]) {
    let timer;
    try {
      const capture = navigator.mediaDevices.getUserMedia({ [kind]: true }).then(stream => {
        try { return { label, ok: stream.getTracks().some(t => t.readyState === 'live') }; }
        finally { stream.getTracks().forEach(track => track.stop()); }
      });
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Timed out. Respond to any permission prompt, then try again.')), 20000);
      });
      results.push(await Promise.race([capture, timeout]));
    } catch (error) {
      results.push({ label, ok: false, name: error.name, message: error.message });
    } finally { clearTimeout(timer); }
  }
  return results;
}
async function probeDevices(webContents) {
  return webContents.executeJavaScript('(' + checkInPage.toString() + ')()', true);
}
function formatReport(results, windowsAccess) {
  const lines = results.map(r => r.ok ? r.label + ': opened successfully.' : r.label + ': ' + r.name + ' — ' + r.message);
  lines.push('', 'Windows microphone access: ' + windowsAccess.microphone,
    'Windows camera access: ' + windowsAccess.camera, '',
    'This check briefly opens each device and stops it immediately. It does not record or transmit media.',
    'Successful results confirm device access, not that a call reaches another player.');
  if (results.some(r => !r.ok)) lines.push('Check Windows Settings > Privacy & security > Microphone / Camera, including desktop-app access. Close other apps using the camera and check Tavern’s selected devices.');
  return lines.join('\n');
}
module.exports = { probeDevices, formatReport };
