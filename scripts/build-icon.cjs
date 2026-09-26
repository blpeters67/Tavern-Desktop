'use strict';
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
(async () => {
  const base = path.join(__dirname, '..', 'assets');
  await sharp(path.join(base, 'tavern.svg')).resize(256, 256).png().toFile(path.join(base, 'icon.png'));
  const png = fs.readFileSync(path.join(base, 'icon.png'));
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
  fs.writeFileSync(path.join(base, 'icon.ico'), Buffer.concat([header, png]));
  console.log('Built Tavern PNG and Windows icon.');
})().catch(error => { console.error(error); process.exitCode = 1; });
