'use strict';
const { app } = require('electron');
const path = require('node:path');
app.setPath('userData', path.join(__dirname, '..', '.test-profile', 'updater-' + process.pid));
app.whenReady().then(() => require('../src/updater-smoke.cjs')(app))
  .then(() => app.exit(0), error => { console.error(error.stack || error); app.exit(1); });
