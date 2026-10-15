// icons/master.png -> the platform icons electron-forge packages.
//
//   fullyrested.ico   Windows: the executable icon and the Squirrel setupIcon
//   fullyrested.icns  macOS
//   fullyrested.png   Linux (deb/rpm), 512px
//   ../src/favicon.ico  the browser tab under `ng serve`
//
// Output is committed, so this is run by hand when the artwork changes rather
// than during a build - generating icons at package time only adds a way for
// a release to fail on a machine that is not this one.
//
// master.png comes from restore-alpha.mjs; see its header for why.
//
// Run with: npm run icons

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import png2icons from 'png2icons';
import { decodePng, encodePng, encodeIco, resize } from './png.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const icons = join(here, '..', 'icons');

const masterBytes = readFileSync(join(icons, 'master.png'));
const master = decodePng(masterBytes);
if (master.width !== master.height) throw new Error(`master.png must be square, got ${master.width}x${master.height}`);
if (master.width < 512) throw new Error(`master.png is only ${master.width}px; 1024 or more is wanted for .icns`);

const written = [];
const write = (name, bytes) => {
  if (!bytes) throw new Error(`failed to generate ${name}`);
  const path = name.startsWith('..') ? join(here, '..', name.slice(3)) : join(icons, name);
  writeFileSync(path, bytes);
  written.push([name, bytes.length]);
};

// BEZIER is png2icons' best downscaler; at 16px the difference from BILINEAR
// is visible on the tick's diagonal.
const SCALER = png2icons.BEZIER;

// Windows. `false` for usePNG: the small sizes go in as uncompressed BMP,
// which is what older Windows shells expect; `true` would make a PNG-only ICO
// that some contexts render as a blank square.
write('fullyrested.ico', png2icons.createICO(masterBytes, SCALER, 0, false, true));

// macOS.
write('fullyrested.icns', png2icons.createICNS(masterBytes, SCALER, 0));

// Linux wants a plain PNG; 512 is the largest size deb/rpm use.
write('fullyrested.png', encodePng(resize(master, 512)));

// The Angular favicon is still the Angular CLI's own logo. Replace it from the
// same source so a browser tab under `ng serve` matches the app. Only the
// three sizes a browser actually asks for - the full set would be 422 KB.
write('../src/favicon.ico', encodeIco([16, 32, 48].map((size) => ({ size, bytes: encodePng(resize(master, size)) }))));

for (const [name, size] of written) {
  console.log(`  ${name.padEnd(22)} ${(size / 1024).toFixed(1).padStart(8)} KB`);
}
