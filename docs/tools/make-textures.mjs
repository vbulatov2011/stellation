/*
 * Generate the starter face textures and their manifest.
 *
 *   node docs/tools/make-textures.mjs
 *
 * Writes docs/img/textures/*.png and index.json. The patterns are drawn
 * LIGHT — near-white grounds, gray ink — because the renderer multiplies
 * the image under the face colors: white shows the coset color pure, gray
 * shades it, and a dark texture would crush every coloring to mud. All are
 * drawn to tile, since the charts repeat the image over the star's wings.
 *
 * Plain PNG writer over node:zlib — no image libraries, like everything
 * else in this repo. 2x2 supersampling keeps curved edges clean.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'img', 'textures');
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- PNG writer

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};
function png(size, rgbAt) {
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 3);
    raw[row] = 0;                          // filter: none
    for (let x = 0; x < size; x++) {
      // 2x2 supersample
      let r = 0, g = 0, b = 0;
      for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const [cr, cg, cb] = rgbAt((x + dx) / size, (y + dy) / size);
        r += cr; g += cg; b += cb;
      }
      const o = row + 1 + x * 3;
      raw[o] = Math.round(r / 4); raw[o + 1] = Math.round(g / 4); raw[o + 2] = Math.round(b / 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;                // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ patterns

const WHITE = [255, 255, 255];
const mixc = (a, b, t) => [0, 1, 2].map(i => a[i] + (b[i] - a[i]) * t);
// smooth edge: 0 inside, 1 outside, over ~1.5px at 256
const edge = (d, w = 0.006) => Math.min(1, Math.max(0, d / w + 0.5));
// repeat into [-0.5, 0.5)
const wrap = (t) => t - Math.floor(t + 0.5);

const PATTERNS = {
  // 4x4 checker: the classic uv litmus — misaligned copies scream
  'checker.png': (u, v) => {
    const on = (Math.floor(u * 4) + Math.floor(v * 4)) % 2 === 0;
    return on ? WHITE : [214, 214, 214];
  },
  // diagonal stripes: orientation made visible, mirrors flip them
  'stripes.png': (u, v) => {
    const t = Math.abs(wrap((u + v) * 6));           // 0 at stripe center
    return mixc([198, 198, 198], WHITE, edge(t - 0.25, 0.04));
  },
  // a dot lattice, 6x6
  'dots.png': (u, v) => {
    const d = Math.hypot(wrap(u * 6), wrap(v * 6));
    return mixc([170, 170, 170], WHITE, edge(d - 0.3, 0.03));
  },
  // concentric rings about the tile center: the pole announces itself
  'rings.png': (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5);
    const t = Math.abs(wrap(r * 8));
    return mixc([190, 190, 190], WHITE, edge(t - 0.22, 0.05));
  },
  // a thin grid, 8x8 — reads as graph paper on the solid
  'grid.png': (u, v) => {
    const d = Math.min(Math.abs(wrap(u * 8)), Math.abs(wrap(v * 8)));
    return mixc([160, 160, 160], WHITE, edge(d - 0.045, 0.03));
  },
};

for (const f of Object.keys(PATTERNS).sort()) {
  writeFileSync(join(OUT, f), png(256, PATTERNS[f]));
  console.log('wrote', f);
}

// the manifest lists whatever image files the folder holds — hand-dropped
// ones included — so adding a texture is: put the file here, rerun this
const files = readdirSync(OUT)
  .filter(f => /\.(png|jpe?g|webp|gif|svg)$/i.test(f))
  .sort();
writeFileSync(join(OUT, 'index.json'), JSON.stringify(files, null, 2) + '\n');
console.log('wrote index.json:', files.join(', '));
