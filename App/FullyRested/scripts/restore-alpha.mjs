// icons/source.png -> icons/master.png
//
// The supplied artwork is a rounded-square icon painted on an OPAQUE white
// background: every pixel has alpha 255, and the "corners" are white rather
// than transparent. Windows hides most of that, but macOS and Linux draw the
// icon unmasked, so it would show as a white square behind the artwork.
//
// This reconstructs the alpha channel.
//
// Fitting the drawn shape analytically was tried first and abandoned: it is a
// superellipse-cornered square, but the artwork is not geometrically exact
// (the curve meets the top edge at x=382 and the left edge at y=364), so any
// single fitted curve leaves a white rim down one side.
//
// Instead the separation comes from the image itself. The two populations do
// not overlap:
//
//     brightest pixel inside the artwork   173.6 luminance
//     background                           249 - 255 luminance
//
// So a flood fill inward from the four corners, crossing only pixels at
// luminance >= 200, lands exactly on the background and the anti-aliased rim
// around it, and cannot leak inside. Background pixels then take their alpha
// from how far they are from white, which recovers the artist's own
// anti-aliasing rather than approximating it.
//
// Run with: npm run icons:master

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { decodePng, encodePng } from './png.mjs';

const icons = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');

// Comfortably above the brightest interior pixel (173.6) and below the
// dimmest background pixel (249). Checked below rather than trusted.
const BACKGROUND_THRESHOLD = 200;
// Luminance of the artwork where it meets the background - the dark navy
// border. Used to turn a blended rim pixel back into a coverage fraction.
const EDGE_LUMINANCE = 29;

const { width, height, data } = decodePng(readFileSync(join(icons, 'source.png')));
const luminance = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

// --- Sanity-check the assumption the whole method rests on ------------------
// If the artwork is ever replaced with something containing a light area, the
// flood fill could leak into it. Fail loudly instead of shipping a holed icon.
{
  const inset = Math.round(width * 0.2);
  let brightest = 0;
  for (let y = inset; y < height - inset; y++) {
    for (let x = inset; x < width - inset; x++) brightest = Math.max(brightest, luminance((y * width + x) * 4));
  }
  if (brightest >= BACKGROUND_THRESHOLD) {
    throw new Error(
      `the artwork contains a pixel at luminance ${brightest.toFixed(1)}, at or above the ` +
      `background threshold of ${BACKGROUND_THRESHOLD}. The flood fill would leak into it. ` +
      `Supply artwork with real transparency instead of using this script.`,
    );
  }
}

// --- Flood fill the background from the four corners ------------------------
const isBackground = new Uint8Array(width * height);
const stack = [0, (width - 1), (height - 1) * width, height * width - 1];

for (const start of stack) {
  if (luminance(start * 4) < BACKGROUND_THRESHOLD) {
    throw new Error('a corner pixel is not background - is this the right artwork?');
  }
}

while (stack.length) {
  const p = stack.pop();
  if (isBackground[p]) continue;
  if (luminance(p * 4) < BACKGROUND_THRESHOLD) continue;
  isBackground[p] = 1;

  const x = p % width;
  const y = (p - x) / width;
  if (x > 0) stack.push(p - 1);
  if (x < width - 1) stack.push(p + 1);
  if (y > 0) stack.push(p - width);
  if (y < height - 1) stack.push(p + width);
}

// --- Rebuild the image with an alpha channel --------------------------------
const out = Buffer.alloc(width * height * 4);
let transparent = 0;
let feathered = 0;

for (let p = 0; p < width * height; p++) {
  const i = p * 4;

  if (!isBackground[p]) {
    out[i] = data[i];
    out[i + 1] = data[i + 1];
    out[i + 2] = data[i + 2];
    out[i + 3] = 255;
    continue;
  }

  // How much of this pixel the artwork covered, read back out of how far the
  // blend went from white towards the artwork's edge colour.
  const coverage = Math.max(0, Math.min(1, (255 - luminance(i)) / (255 - EDGE_LUMINANCE)));

  // The background is not uniformly white - it runs 249 to 255, which would
  // otherwise leave the corners at alpha 7 instead of 0. Anything fainter than
  // this is background noise, not edge.
  if (coverage < 0.05) {
    out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0;
    transparent++;
    continue;
  }

  out[i + 3] = Math.round(coverage * 255);
  // The pixel was drawn blended against white. Undo that, or the edge keeps a
  // white fringe once it sits on a dark background:
  //   observed = colour * a + 255 * (1 - a)
  for (let c = 0; c < 3; c++) {
    const unblended = (data[i + c] - 255 * (1 - coverage)) / coverage;
    out[i + c] = Math.max(0, Math.min(255, Math.round(unblended)));
  }
  feathered++;
}

writeFileSync(join(icons, 'master.png'), encodePng({ width, height, data: out }));

const total = width * height;
console.log(`master.png written: ${width}x${height}`);
console.log(`  transparent: ${transparent} px (${((100 * transparent) / total).toFixed(1)}%)`);
console.log(`  feathered edge: ${feathered} px`);
