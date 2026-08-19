/*
 * The three container formats write files their readers will accept.
 *
 *   node docs/test/exportmesh.mjs
 *
 * OFF, OBJ and STL are line-per-vertex text and go wrong loudly. These three
 * do not: 3MF is a zip whose three parts must all be present and named exactly
 * right, and glTF and GLB are offset tables into a binary buffer, where being
 * four bytes out produces a file that opens to an empty scene rather than an
 * error. So each is read back here — the zip inflated and its XML counted, the
 * glTF's base64 decoded and its accessors followed, the GLB's chunks walked —
 * and checked against the mesh that went in.
 *
 * The mesh is a real one: an icosahedron's arrangement, taken deep enough to
 * have non-triangular faces, so the fan triangulation is actually exercised.
 */

import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildStellation, facePlanes, suggestDepth, parseCellsAny,
         selectedCells, extractMesh } from '../lib/core.js';
import { triangulate, to3MF, model3MF, toGLTF, toGLB } from '../lib/exportmesh.js';

let passed = 0, failed = 0;
const ok = (cond, label) => {
  if (cond) { passed++; console.log('   ok   ' + label); }
  else { failed++; console.log('   FAIL ' + label); }
};

// ------------------------------------------------------------- the mesh

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
const geometry = JSON.parse(readFileSync(join(DOCS, 'data', 'geometry.json'), 'utf8'));
const symmetry = JSON.parse(readFileSync(join(DOCS, 'data', 'symmetry.json'), 'utf8'));
const g = geometry.u27;
const vertices = [];
for (let i = 0; i < g.v.length; i += 3) vertices.push({ x: g.v[i], y: g.v[i + 1], z: g.v[i + 2] });
const poly = { vertices, faces: g.f };
const stel = buildStellation(poly, symmetry.Ih.matrices,
  { subMatrices: symmetry.Ih.matrices, maxIntersection: suggestDepth(facePlanes(poly)) });
const doc = JSON.parse(readFileSync(join(DOCS, 'icosahedra', '13-e1f1g1.json'), 'utf8'));
const cells = selectedCells(stel, parseCellsAny(stel, doc.params.cells.selection));
const mesh = extractMesh([{ cells }], stel.pool);

console.log(`\n   the mesh: ${mesh.vertices.length} vertices, ${mesh.faces.length} faces`);

// ------------------------------------------------------- triangulation

const { positions, indices, triangles } = triangulate(mesh);
const expectTris = mesh.faces.reduce((n, f) => n + f.length - 2, 0);
ok(triangles === expectTris, `fans every face: ${expectTris} triangles from ${mesh.faces.length} faces`);
ok(positions.length === mesh.vertices.length * 3, 'every vertex reaches the position array');
ok(indices.every(i => i < mesh.vertices.length), 'no index points past the end of it');
ok(indices.BYTES_PER_ELEMENT === 4, 'indices are 32-bit, so a deep stellation cannot wrap');
{
  // the first face, followed through the fan, must be the vertices it names
  const f = mesh.faces[0];
  const want = [];
  for (let i = 1; i < f.length - 1; i++) want.push(f[0], f[i], f[i + 1]);
  ok(want.every((v, i) => indices[i] === v), 'the first face fans from its own first vertex');
}

// ---------------------------------------------------------------- 3MF

{
  const buf = Buffer.from(await (await to3MF(mesh, 'test figure')).arrayBuffer());
  ok(buf.readUInt32LE(0) === 0x04034b50, '3MF is a zip');

  // walk the central directory and inflate each part
  const eocd = buf.length - 22;
  const count = buf.readUInt16LE(eocd + 10);
  const parts = new Map();
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const packed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const lnLen = buf.readUInt16LE(offset + 26), leLen = buf.readUInt16LE(offset + 28);
    const at = offset + 30 + lnLen + leLen;
    const raw = buf.subarray(at, at + packed);
    parts.set(name, (method === 8 ? inflateRawSync(raw) : raw).toString('utf8'));
    p += 46 + nameLen + extraLen + commentLen;
  }

  ok(parts.has('[Content_Types].xml'), 'it carries [Content_Types].xml');
  ok(parts.has('_rels/.rels'), 'and _rels/.rels');
  ok(parts.has('3D/3dmodel.model'), 'and 3D/3dmodel.model');
  const rels = parts.get('_rels/.rels') || '';
  const model = parts.get('3D/3dmodel.model') || '';
  ok(rels.includes('/3D/3dmodel.model'), 'the relationship points at the model part');
  ok((parts.get('[Content_Types].xml') || '').includes('3dmanufacturing-3dmodel'),
     'the content types declare the model type');

  const nv = (model.match(/<vertex /g) || []).length;
  const nt = (model.match(/<triangle /g) || []).length;
  ok(nv === mesh.vertices.length, `the model lists all ${mesh.vertices.length} vertices`);
  ok(nt === expectTris, `and all ${expectTris} triangles`);
  ok(model.includes('<build><item objectid="1"/></build>'), 'and builds the object it defines');
  ok(model.includes('unit="millimeter"'), 'in millimetres, which is what a slicer assumes');
  ok(!/v[123]="(\d+)"/.test(model) ||
     [...model.matchAll(/v[123]="(\d+)"/g)].every(m => +m[1] < mesh.vertices.length),
     'no triangle points past the last vertex');
  ok(model.includes('&lt;') === false && model3MF(mesh, 'a & b').includes('a &amp; b'),
     'the title is escaped');
}

// --------------------------------------------------------------- glTF

{
  const doc = JSON.parse(toGLTF(mesh, 'test figure'));
  ok(doc.asset.version === '2.0', 'glTF says version 2.0');
  ok(doc.meshes[0].primitives[0].indices === 0 &&
     doc.meshes[0].primitives[0].attributes.POSITION === 1,
     'the primitive names its accessors');

  const acc = doc.accessors;
  ok(acc[0].componentType === 5125 && acc[0].count === indices.length,
     'the index accessor is UNSIGNED_INT and counts every index');
  ok(acc[1].componentType === 5126 && acc[1].count === mesh.vertices.length,
     'the position accessor is FLOAT and counts every vertex');
  ok(Array.isArray(acc[1].min) && Array.isArray(acc[1].max),
     'POSITION carries min and max, which the spec requires');

  // the box must actually contain the mesh
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const v of mesh.vertices) {
    [v.x, v.y, v.z].forEach((c, k) => { if (c < lo[k]) lo[k] = c; if (c > hi[k]) hi[k] = c; });
  }
  const near = (a, b) => Math.abs(a - b) < 1e-5;
  ok(acc[1].min.every((v, k) => near(v, lo[k])) && acc[1].max.every((v, k) => near(v, hi[k])),
     'and they are the real bounding box');

  const uri = doc.buffers[0].uri || '';
  ok(uri.startsWith('data:application/octet-stream;base64,'),
     'the buffer is inline, so the .gltf is one self-contained file');
  const bytes = Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64');
  ok(bytes.length === doc.buffers[0].byteLength,
     'the decoded buffer is the length the document claims');

  const [iv, pv] = doc.bufferViews;
  ok(iv.byteLength === indices.byteLength && pv.byteLength === positions.byteLength,
     'the views cover the indices and the positions');
  ok(pv.byteOffset % 4 === 0, 'the positions start on a four-byte boundary');
  ok(pv.byteOffset + pv.byteLength <= bytes.length, 'and end inside the buffer');

  // read the data back out and compare with the mesh
  const gotIdx = new Uint32Array(bytes.buffer, bytes.byteOffset + iv.byteOffset, indices.length);
  ok(gotIdx.every((v, i) => v === indices[i]), 'the indices survive the round trip');
  const gotPos = new Float32Array(bytes.buffer, bytes.byteOffset + pv.byteOffset, positions.length);
  ok(gotPos.every((v, i) => Math.abs(v - positions[i]) < 1e-6),
     'and so do the positions');
}

// ---------------------------------------------------------------- GLB

{
  const bin = toGLB(mesh, 'test figure');
  const buf = Buffer.from(bin.buffer, bin.byteOffset, bin.length);
  ok(buf.readUInt32LE(0) === 0x46546C67, 'GLB starts with the glTF magic');
  ok(buf.readUInt32LE(4) === 2, 'version 2');
  ok(buf.readUInt32LE(8) === buf.length, 'and states its own total length');
  ok(buf.length % 4 === 0, 'the whole file is four-byte aligned');

  const jsonLen = buf.readUInt32LE(12);
  ok(buf.readUInt32LE(16) === 0x4E4F534A, 'the first chunk is JSON');
  ok(jsonLen % 4 === 0, 'padded to four bytes');
  const doc = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  ok(!!doc.meshes && !doc.buffers[0].uri,
     'whose buffer has no uri, because the bytes are in the file');

  const binAt = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binAt);
  ok(buf.readUInt32LE(binAt + 4) === 0x004E4942, 'the second chunk is BIN');
  ok(binLen % 4 === 0, 'padded to four bytes');
  ok(binAt + 8 + binLen === buf.length, 'and it runs to the end of the file');
  ok(binLen >= doc.buffers[0].byteLength,
     'the chunk holds at least the buffer the document declares');

  const body = buf.subarray(binAt + 8, binAt + 8 + binLen);
  const pv = doc.bufferViews[1];
  const gotPos = new Float32Array(
    body.buffer.slice(body.byteOffset + pv.byteOffset,
                      body.byteOffset + pv.byteOffset + pv.byteLength));
  ok(gotPos.every((v, i) => Math.abs(v - positions[i]) < 1e-6),
     'and the positions read back out of it');
}

// --------------------------------------------------- degenerate input

{
  const empty = { vertices: [], faces: [] };
  const t = triangulate(empty);
  ok(t.triangles === 0, 'an empty mesh triangulates to nothing');
  const doc = JSON.parse(toGLTF(empty, 'nothing'));
  ok(doc.accessors[1].min.every(v => v === 0),
     'and its bounding box is zeros rather than infinities');
  const glb = toGLB(empty, 'nothing');
  ok(glb.length % 4 === 0 && Buffer.from(glb.buffer, glb.byteOffset, glb.length)
       .readUInt32LE(0) === 0x46546C67,
     'and the GLB it makes is still a GLB');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
