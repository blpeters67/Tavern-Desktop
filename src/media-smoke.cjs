'use strict';
// Runs only with --smoke-test, against a loopback fixture and fake AV devices.
module.exports = async function mediaSmoke({ app, mainWindow, serverSession, desktopCapturer, dialog, getPicker, server, showShare }) {
  const assert = require('node:assert/strict');
  const { BrowserWindow, systemPreferences } = require('electron');
  const wc = mainWindow.page;
  console.log('Windows media access:', JSON.stringify({microphone:systemPreferences.getMediaAccessStatus('microphone'),camera:systemPreferences.getMediaAccessStatus('camera')}));
  const originalPrompt = dialog.showMessageBox;
  const originalSources = desktopCapturer.getSources;
  let promptCount = 0;
  dialog.showMessageBox = async () => { promptCount++; return { response: 0 }; };
  const until = async predicate => {
    const deadline = Date.now() + 10000;
    while (!(await predicate())) {
      if (Date.now() > deadline) throw new Error('Media test timed out');
      await new Promise(r => setTimeout(r, 50));
    }
  };
  if (process.argv.includes('--real-devices')) {
    try {
      const results = await require('./device-check.cjs').probeDevices(wc);
      console.log('Actual device checks:', JSON.stringify(results));
      assert.ok(results.every(r => r.ok), 'Actual device access failed; see reported errors');
    } finally { dialog.showMessageBox = originalPrompt; }
    return;
  }
  let fixture;
  try {
    const camera = await wc.executeJavaScript(`navigator.mediaDevices.getUserMedia({audio:true,video:true}).then(s=>{
      const kinds=s.getTracks().map(t=>t.kind).sort();s.getTracks().forEach(t=>t.stop());return kinds;
    })`, true);
    assert.deepEqual(camera, ['audio', 'video']);
    assert.equal(promptCount, 1, 'Camera/microphone must prompt before granting access');
    await require('./loopback-check.cjs')(wc);
    console.log('PASS: local WebRTC audio packets and decoded video frames.');
    // First use the real enumerator, but never capture any personal windows/screens.
    const sources = await desktopCapturer.getSources({ types: ['screen','window'], thumbnailSize: {width:80,height:60} });
    assert.ok(sources.length > 0, 'Desktop sources should be available');
    fixture = new BrowserWindow({ show:false, width:320, height:240,
      webPreferences: { session:serverSession, sandbox:true, backgroundThrottling:false } });
    await fixture.loadURL(server);
    // Route the picker to a synthetic page only; no private desktop content is recorded.
    desktopCapturer.getSources = async () => [{
      id: fixture.getMediaSourceId(), name: 'Synthetic capture fixture',
      thumbnail: await fixture.webContents.capturePage()
    }];
    await wc.executeJavaScript(`window.captureResult='pending';
      navigator.mediaDevices.getDisplayMedia({
        video:{frameRate:{ideal:30,max:30},width:{max:1920},height:{max:1080}},
        audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},
        selfBrowserSurface:'exclude',surfaceSwitching:'include',systemAudio:'include'
      }).then(s=>{window.captureResult=s.getVideoTracks()[0].readyState;s.getTracks().forEach(t=>t.stop())})
        .catch(e=>window.captureResult=e.name+': '+e.message);void 0;`, true);
    await until(() => getPicker() && !getPicker().page.isLoading());
    await until(() => getPicker().page.executeJavaScript('!!document.querySelector(".source")'));
    await getPicker().page.executeJavaScript('document.querySelector(".source").click()');
    await until(async () => (await wc.executeJavaScript('window.captureResult')) !== 'pending');
    assert.equal(await wc.executeJavaScript('window.captureResult'), 'live', 'Selected capture must deliver a live video track');
    // Cancellation must reject the API request and release the pending picker.
    await wc.executeJavaScript(`window.cancelResult='pending';navigator.mediaDevices.getDisplayMedia({video:true})
      .then(s=>{s.getTracks().forEach(t=>t.stop());window.cancelResult='unexpected grant'})
      .catch(e=>window.cancelResult=e.name);void 0;`, true);
    await until(() => getPicker() && !getPicker().page.isLoading());
    await getPicker().page.executeJavaScript('window.desktop.cancel()');
    await until(async () => (await wc.executeJavaScript('window.cancelResult')) !== 'pending');
    assert.ok(['NotAllowedError', 'AbortError'].includes(await wc.executeJavaScript('window.cancelResult')));
    // Received/unmuted media must play without requiring an extra click.
    const playback = await wc.executeJavaScript(`(async()=>{
      const a=new AudioContext();const osc=a.createOscillator();const out=a.createMediaStreamDestination();
      osc.connect(out);osc.start();const v=document.createElement('video');v.srcObject=out.stream;
      document.body.append(v);await v.play();const playing=!v.paused;
      v.pause();out.stream.getTracks().forEach(t=>t.stop());osc.stop();await a.close();v.remove();return playing;
    })()`);
    assert.equal(playback, true);
    console.log('PASS: AV permission prompt, source enumeration, screen picker selection/cancellation, live capture track and unmuted playback.');
  } finally {
    serverSession.setDisplayMediaRequestHandler(showShare);
    dialog.showMessageBox = originalPrompt;
    desktopCapturer.getSources = originalSources;
    if (getPicker()) getPicker().close();
    if (fixture && !fixture.isDestroyed()) fixture.destroy();
  }
};