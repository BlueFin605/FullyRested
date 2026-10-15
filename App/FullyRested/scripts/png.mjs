// Minimal PNG read/write for the icon pipeline.
//
// Why hand-rolled: the icon scripts run rarely and their only other dependency
// is png2icons. Pulling in a full image library (sharp, canvas) for two
// functions would add a native build step to an app that already has one
// native dependency too many.
//
// Handles what we need and nothing else: 8-bit RGBA (colour type 6),
// non-interlaced. Anything else throws rather than guessing.

import { inflateSync, deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Decode a PNG buffer to { width, height, data } where data is RGBA bytes. */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');

  let offset = 8;
  let width, height, bitDepth, colourType, interlace;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8];
      colourType = body[9];
      interlace = body[12];
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  if (bitDepth !== 8 || colourType !== 6) {
    throw new Error(`expected 8-bit RGBA (depth 8, type 6), got depth ${bitDepth}, type ${colourType}`);
  }
  if (interlace !== 0) throw new Error('interlaced PNGs are not supported');

  return { width, height, data: unfilter(inflateSync(Buffer.concat(idat)), width, height) };
}

/** Reverse the per-scanline filters PNG applies before compression. */
function unfilter(raw, width, height) {
  const bpp = 4;
  const rowBytes = width * bpp;
  const stride = rowBytes + 1; // each row is prefixed with its filter type
  const out = Buffer.alloc(rowBytes * height);
  let previous = Buffer.alloc(rowBytes);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * stride];
    const line = raw.subarray(y * stride + 1, y * stride + 1 + rowBytes);
    const current = Buffer.alloc(rowBytes);

    for (let i = 0; i < rowBytes; i++) {
      const left = i >= bpp ? current[i - bpp] : 0;
      const up = previous[i];
      const upLeft = i >= bpp ? previous[i - bpp] : 0;
      let value = line[i];

      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      } else if (filter !== 0) {
        throw new Error(`unknown PNG filter type ${filter} on row ${y}`);
      }
      current[i] = value & 0xff;
    }
    current.copy(out, y * rowBytes);
    previous = current;
  }
  return out;
}

/** Encode RGBA bytes as a PNG buffer. Writes every row with filter 0. */
export function encodePng({ width, height, data }) {
  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (rowBytes + 1)] = 0;
    data.copy(raw, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, body) {
  const out = Buffer.alloc(body.length + 12);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'ascii');
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/**
 * Pack PNG buffers into an .ico.
 *
 * png2icons writes every size from 16 to 256, which is right for an
 * executable icon and absurd for a favicon - it produced a 422 KB one. This
 * writes exactly the sizes given.
 *
 * Entries are stored as PNG rather than BMP. Every browser and every Windows
 * version since Vista reads that; nothing here targets anything older.
 */
export function encodeIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(pngs.length, 4);

  const directory = Buffer.alloc(16 * pngs.length);
  let offset = header.length + directory.length;

  pngs.forEach(({ size, bytes }, index) => {
    const e = index * 16;
    directory[e] = size >= 256 ? 0 : size; // 0 means 256
    directory[e + 1] = size >= 256 ? 0 : size;
    directory[e + 2] = 0; // palette size
    directory[e + 3] = 0; // reserved
    directory.writeUInt16LE(1, e + 4);  // colour planes
    directory.writeUInt16LE(32, e + 6); // bits per pixel
    directory.writeUInt32LE(bytes.length, e + 8);
    directory.writeUInt32LE(offset, e + 12);
    offset += bytes.length;
  });

  return Buffer.concat([header, directory, ...pngs.map((p) => p.bytes)]);
}

/**
 * Box-filter downscale with premultiplied alpha.
 *
 * Premultiplying matters: averaging straight RGBA makes transparent pixels
 * drag their (meaningless) colour into the result, which shows up as a halo
 * around the icon at small sizes.
 */
export function resize({ width, height, data }, size) {
  const out = Buffer.alloc(size * size * 4);
  const scaleX = width / size;
  const scaleY = height / size;

  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * scaleY);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scaleY));

    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * scaleX);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scaleX));

      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * width + sx) * 4;
          const alpha = data[i + 3] / 255;
          r += data[i] * alpha;
          g += data[i + 1] * alpha;
          b += data[i + 2] * alpha;
          a += data[i + 3];
          n++;
        }
      }

      const o = (y * size + x) * 4;
      const meanAlpha = a / n;
      if (meanAlpha > 0) {
        // Un-premultiply back to straight alpha for storage. r/g/b hold the
        // sum of colour*alpha with alpha in 0..1, and `a` the sum of alpha in
        // 0..255, so dividing by a/255 both averages and un-premultiplies.
        const f = 255 / a;
        out[o] = Math.min(255, Math.round(r * f));
        out[o + 1] = Math.min(255, Math.round(g * f));
        out[o + 2] = Math.min(255, Math.round(b * f));
      }
      out[o + 3] = Math.round(meanAlpha);
    }
  }
  return { width: size, height: size, data: out };
}
