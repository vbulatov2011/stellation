/*
 * The zip writer writes zips.
 *
 *   node docs/test/zip.mjs
 *
 * It is a hand-rolled binary format — a few headers, a CRC and an offset
 * table — written because the site has no dependencies and a browser without
 * the File System Access API can only be handed one file. Every field in it is
 * a chance to be one byte out, and being one byte out produces a file that
 * looks fine until somebody tries to open it a week later. So the archive is
 * read back here with node's own inflate, and the offsets it claims are
 * checked against where the entries actually are.
 */

import { inflateRawSync } from 'node:zlib';
import { makeZip } from '../lib/uilib/zip.js';

let passed = 0, failed = 0;
const ok = (cond, label) => {
  if (cond) { passed++; console.log('   ok   ' + label); }
  else { failed++; console.log('   FAIL ' + label); }
};

const files = [
  { name: 'plain.svg', text: '<svg/>' },
  // long and repetitive, so deflate has something to do
  { name: 'diagram-01.svg', text: '<svg>' + '<path d="M0,0L1,1Z"/>'.repeat(400) + '</svg>' },
  { name: 'bytes.bin', bytes: new Uint8Array([0, 1, 2, 250, 251, 252, 255]) },
  { name: 'unicode-ταυ.svg', text: '<svg><title>τ φ</title></svg>' },
];

const blob = await makeZip(files);
const buf = Buffer.from(await blob.arrayBuffer());

ok(blob.type === 'application/zip', 'it is offered as application/zip');
ok(buf.readUInt32LE(0) === 0x04034b50, 'starts with a local file header');

// the end-of-central-directory record, found from the back
const eocd = buf.length - 22;
ok(buf.readUInt32LE(eocd) === 0x06054b50, 'ends with an end-of-central-directory record');
ok(buf.readUInt16LE(eocd + 8) === files.length,
   `records ${files.length} entries on this disk`);
ok(buf.readUInt16LE(eocd + 10) === files.length, 'and the same total');

const dirSize = buf.readUInt32LE(eocd + 12);
const dirAt = buf.readUInt32LE(eocd + 16);
ok(dirAt + dirSize === eocd, 'the central directory ends exactly where the record begins');

// walk the directory, follow each offset, and inflate what is there
{
  let p = dirAt, entries = [], good = true;
  for (let i = 0; i < files.length; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) { good = false; break; }
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const packed = buf.readUInt32LE(p + 20);
    const raw = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    entries.push({ name, method, crc, packed, raw, offset });
    p += 46 + nameLen;
  }
  ok(good && entries.length === files.length, 'every central directory header is where it should be');
  ok(entries.map(e => e.name).join() === files.map(f => f.name).join(),
     'the names come back, in order and in UTF-8');

  let bodies = true;
  for (const e of entries) {
    if (buf.readUInt32LE(e.offset) !== 0x04034b50) { bodies = false; break; }
    const nameLen = buf.readUInt16LE(e.offset + 26);
    const extraLen = buf.readUInt16LE(e.offset + 28);
    const start = e.offset + 30 + nameLen + extraLen;
    const body = buf.subarray(start, start + e.packed);
    const out = e.method === 8 ? inflateRawSync(body) : body;
    const want = files.find(f => f.name === e.name);
    const wantBytes = want.bytes ? Buffer.from(want.bytes) : Buffer.from(want.text, 'utf8');
    if (out.length !== e.raw || !out.equals(wantBytes)) { bodies = false; break; }
  }
  ok(bodies, 'each entry is at the offset claimed for it, and unpacks to what went in');

  const deflated = entries.filter(e => e.method === 8);
  ok(deflated.length > 0 || typeof CompressionStream !== 'function',
     `${deflated.length} of ${entries.length} entries were compressed` +
     (deflated.length ? '' : ' — no CompressionStream here, stored is still valid'));
  const big = entries.find(e => e.name === 'diagram-01.svg');
  ok(big.packed < big.raw, `the repetitive one shrank, ${big.raw} to ${big.packed} bytes`);
}

// the same input twice gives the same bytes — no timestamps, nothing ambient
{
  const again = Buffer.from(await (await makeZip(files)).arrayBuffer());
  ok(again.equals(buf), 'exporting the same thing twice produces the same archive');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
