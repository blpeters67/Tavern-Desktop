'use strict';
module.exports = async app => {
  const fs = require('node:fs');
  const path = require('node:path');
  const http = require('node:http');
  const crypto = require('node:crypto');
  const assert = require('node:assert/strict');
  const { NsisUpdater } = require('electron-updater');
  const { ElectronHttpExecutor } = require('electron-updater/out/electronHttpExecutor');
  const { UpdateController } = require('./update-controller.cjs');
  const currentVersion = require('../package.json').version;
  const payload = Buffer.from('Tavern updater fixture. This is not an executable.\n'.repeat(1024));
  const digest = bytes => crypto.createHash('sha512').update(bytes).digest('base64');
  const server = http.createServer((req, res) => {
    const broken = req.url.startsWith('/broken/');
    const current = req.url.startsWith('/current/');
    const version = current ? currentVersion : broken ? '99.0.1' : '99.0.0';
    if (req.url.includes('latest.yml')) {
      const sha512 = digest(broken ? Buffer.from('wrong bytes') : payload);
      res.setHeader('Content-Type', 'application/yaml');
      res.end(JSON.stringify({version,files:[{url:'fixture.exe',sha512,size:payload.length}],
        path:'fixture.exe',sha512,releaseDate:'2026-09-26T00:00:00.000Z'}));
    } else if (req.url.includes('fixture.exe')) { res.setHeader('Content-Length',payload.length); res.end(payload); }
    else { res.statusCode=404; res.end(); }
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  try {
    for (const scenario of ['good','broken','current']) {
      const dir = path.join(app.getPath('userData'),scenario);
      fs.mkdirSync(dir,{recursive:true});
      const configFile = path.join(dir,'app-update.yml');
      fs.writeFileSync(configFile,JSON.stringify({provider:'generic',
        url:'http://127.0.0.1:' + server.address().port + '/' + scenario + '/',
        updaterCacheDirName:'update-cache'}));
      const adapter = { version:currentVersion,name:'Tavern updater test',isPackaged:true,
        userDataPath:dir,baseCachePath:dir,appUpdateConfigPath:configFile,
        whenReady:()=>Promise.resolve(),
        quit:()=>{throw new Error('Tests must never quit to install');},
        relaunch:()=>{throw new Error('Tests must never launch an installer');},
        onQuit:()=>{throw new Error('Automatic installation must be disabled');} };
      const updater = new NsisUpdater(undefined,adapter);
      updater.httpExecutor = new ElectronHttpExecutor();
      updater.disableDifferentialDownload = true;
      updater.logger = null;
      updater.quitAndInstall = () => { throw new Error('Tests must never execute an installer'); };
      const controller = new UpdateController(updater);
      await controller.check();
      if (scenario === 'good') {
        assert.equal(controller.snapshot().status,'ready');
        assert.equal(digest(fs.readFileSync(updater.installerPath)),digest(payload));
      } else if (scenario === 'broken') {
        assert.equal(controller.snapshot().status,'error');
        assert.match(controller.snapshot().message,/verification failed/);
      } else { assert.equal(controller.snapshot().status,'current'); }
      controller.dispose();
    }
    console.log('PASS: real updater metadata, download, SHA512 rejection and current-version detection; no installer executed.');
  } finally { await new Promise(resolve => server.close(resolve)); }
};
