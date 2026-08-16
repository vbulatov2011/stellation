/*
 * A zip file, by hand.
 *
 * Saving several files at once has two ways to go. A browser with the File
 * System Access API can be given a folder and write them one by one, which is
 * what the app does when it can. Everywhere else the only way out is a
 * download, and a download per file means a row of permission prompts and a
 * scatter of names in the downloads folder. One archive is one prompt and one
 * thing to keep.
 *
 * Written here rather than pulled in because the whole site is a no-build
 * static tree with no dependencies, and a zip of stored or deflated entries is
 * a couple of headers and a CRC. This writes the classic 32-bit format: no
 * zip64, no encryption, no directory entries. That is enough for a handful of
 * SVGs and would be the wrong tool for four gigabytes.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/*
 * Raw deflate, if the browser has it. CompressionStream is not universal, and
 * an SVG of a stellation diagram is mostly repeated path syntax, so it shrinks
 * to a fraction — but a stored entry is a perfectly good zip, so the absence
 * of it costs size and nothing else.
 */
async function deflateRaw(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  try {
    const cs = new CompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;     // a browser that has the constructor but not this format
  }
}

const enc = new TextEncoder();

/**
 * @param {Array<{name: string, text?: string, bytes?: Uint8Array}>} files
 * @returns {Promise<Blob>} the archive, ready to download
 */
export async function makeZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const raw = f.bytes ?? enc.encode(f.text ?? '');
    const crc = crc32(raw);
    const packed = await deflateRaw(raw);
    const useDeflate = packed && packed.length < raw.length;
    const body = useDeflate ? packed : raw;
    const method = useDeflate ? 8 : 0;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);   // local file header
    local.setUint16(4, 20, true);           // version needed
    local.setUint16(6, 0x800, true);        // UTF-8 names
    local.setUint16(8, method, true);
    local.setUint16(10, 0, true);           // no dos time — see below
    local.setUint16(12, 0x21, true);        // 1980-01-01, the zero of dos dates
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);           // no extra field

    chunks.push(new Uint8Array(local.buffer), nameBytes, body);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);     // central directory header
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x800, true);
    dir.setUint16(10, method, true);
    dir.setUint16(12, 0, true);
    dir.setUint16(14, 0x21, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, body.length, true);
    dir.setUint32(24, raw.length, true);
    dir.setUint16(28, nameBytes.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), nameBytes);

    offset += 30 + nameBytes.length + body.length;
  }

  const dirBytes = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);       // end of central directory
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, dirBytes, true);
  end.setUint32(16, offset, true);

  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)],
                  { type: 'application/zip' });
}

/*
 * Every entry is stamped 1980-01-01, the earliest a dos date can express.
 *
 * A timestamp would make two archives of the same diagrams differ, and these
 * archives are of reproducible things: export the same stellation twice and
 * you should get the same bytes, which is worth more here than knowing what
 * time you pressed the button.
 */
