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
         selectedCells, extractMesh, toOFF } from '../lib/core.js';
import { triangulate, to3MF, model3MF, toGLTF, toGLB, toVRML, toX3D,
         faceColors, tubesToMesh, mergeMeshes, annotationsToMesh,
         torusMesh, coneMesh, orientMesh } from '../lib/exportmesh.js';
import { layerColor } from '../lib/palette.js';

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
const raw = extractMesh([{ cells }], stel.pool);
/*
 * The worker decorates the bare mesh with the per-face readings the colouring
 * needs before it reaches the app; the same decoration here, so what the tests
 * colour is the mesh the dialog actually holds.
 */
const mesh = {
  ...raw,
  faceLayers: raw.facetRefs.map(f => f.layer),
  faceClasses: raw.facetRefs.map(() => 0),
  faceTop: raw.facetTop,
};

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

// ------------------------------------------------------------- colour

const colors = faceColors(mesh, 'layer');
{
  ok(colors.length === mesh.faces.length, 'every face gets a colour');
  ok(colors.every(c => c.length >= 3 && c.every(v => v >= 0 && v <= 1)),
     'each of them three numbers in 0..1');
  // the mesh is coloured by shell, so a face in shell n wears the shell colour
  const want = layerColor(mesh.faceLayers[0]);
  ok(colors[0].every((v, i) => v === want[i]), 'and it is the shell palette the view uses');
  const distinct = new Set(colors.map(c => c.join()));
  ok(distinct.size > 1 && distinct.size <= 10,
     `${distinct.size} distinct colours, one per shell reached — not one per face`);

  // coloured, the triangulation cannot share vertices
  const t = triangulate(mesh, colors);
  ok(t.triangles === expectTris, 'colouring does not change the triangle count');
  ok(t.positions.length === expectTris * 9,
     'but every triangle gets its own three vertices, since a corner has three colours');
  ok(t.colors.length === t.positions.length, 'one colour per vertex');
  {
    // the three corners of one triangle must share a colour: it came from one face
    const same = (i) => [0, 1, 2].every(k => t.colors[i * 9 + k] === t.colors[i * 9 + 3 + k] &&
                                             t.colors[i * 9 + k] === t.colors[i * 9 + 6 + k]);
    ok([0, 1, 2, 50, 100].every(same), 'and a triangle is one colour across');
  }

  // OFF puts it after the vertex list, as 0..255
  const off = toOFF(mesh, colors).split('\n');
  const faceLine = off[1 + mesh.vertices.length + 1].trim().split(/\s+/);
  ok(faceLine.length === 1 + Number(faceLine[0]) + 3,
     'OFF appends three numbers to each face');
  ok(faceLine.slice(-3).every(v => Number.isInteger(+v) && +v >= 0 && +v <= 255),
     'as bytes, which is the reading every viewer agrees on');
  ok(toOFF(mesh).split('\n')[1 + mesh.vertices.length + 1].trim().split(/\s+/).length ===
     1 + mesh.faces[0].length, 'and leaves them off when there are none');

  // 3MF says it with base materials
  const model = model3MF(mesh, 'coloured', colors);
  const bases = (model.match(/<base /g) || []).length;
  ok(bases === distinct.size, `3MF writes ${distinct.size} base materials, one per colour`);
  ok(/<object id="1" type="model" pid="2" pindex="0">/.test(model),
     'and points the object at them');
  const pids = [...model.matchAll(/<triangle [^>]*p1="(\d+)"/g)].map(m => +m[1]);
  ok(pids.length === expectTris, 'every triangle names a material');
  ok(Math.max(...pids) < bases, 'and none names one that is not there');
  ok(!/pid=/.test(model3MF(mesh, 'plain')), 'an uncoloured 3MF has no materials at all');

  // glTF carries it on the vertices
  const doc = JSON.parse(toGLTF(mesh, 'coloured', colors));
  ok(doc.meshes[0].primitives[0].attributes.COLOR_0 === 2, 'glTF adds a COLOR_0 attribute');
  const ca = doc.accessors[2];
  ok(ca.type === 'VEC3' && ca.componentType === 5126 && ca.count === expectTris * 3,
     'one float triple per vertex');
  ok(doc.bufferViews[2].byteOffset % 4 === 0, 'its view starts on a four-byte boundary');
  ok(doc.materials[0].pbrMetallicRoughness.baseColorFactor.every(v => v === 1),
     'and the material turns white, since the two multiply');
  ok(!JSON.parse(toGLTF(mesh, 'plain')).meshes[0].primitives[0].attributes.COLOR_0,
     'an uncoloured glTF has no COLOR_0');
  ok(JSON.parse(toGLTF(mesh, 'plain')).materials[0].pbrMetallicRoughness
       .baseColorFactor[0] < 1, 'and keeps a neutral grey instead');
}

// ------------------------------------------------------ VRML 2 and X3D

{
  const wrl = toVRML(mesh, 'test figure', colors);
  ok(wrl.startsWith('#VRML V2.0 utf8'), 'VRML starts with the header that identifies it');
  ok((wrl.match(/-1,/g) || []).length === mesh.faces.length,
     `${mesh.faces.length} faces, each closed with -1 — no triangulation`);
  ok(/colorPerVertex FALSE/.test(wrl), 'colour is per face');
  {
    // the point list, counted between its own brackets rather than by shape:
    // a coordinate can come out in exponent form and still be a coordinate
    const body = wrl.slice(wrl.indexOf('point ['), wrl.indexOf(']', wrl.indexOf('point [')));
    const pts = body.split('\n').slice(1).filter(l => l.trim());
    ok(pts.length === mesh.vertices.length, 'every vertex is listed');
    ok(pts.every(l => l.trim().replace(/,$/, '').split(/\s+/).length === 3),
       'each as three numbers');
  }
  ok(/solid FALSE/.test(wrl), 'and the surface is two-sided, which a stellation needs');
  ok(!/color Color/.test(toVRML(mesh, 'plain')), 'an uncoloured VRML has no Color node');

  const x3d = toX3D(mesh, 'test figure', colors);
  ok(x3d.startsWith('<?xml'), 'X3D is XML');
  ok(/<X3D profile="Interchange" version="3.3">/.test(x3d), 'declaring a profile and version');
  const ci = /coordIndex="([^"]*)"/.exec(x3d)[1].trim().split(/\s+/);
  ok(ci.filter(v => v === '-1').length === mesh.faces.length,
     'with one -1 per face in coordIndex');
  ok(Math.max(...ci.filter(v => v !== '-1').map(Number)) < mesh.vertices.length,
     'and no index past the last vertex');
  const pts = /point="([^"]*)"/.exec(x3d)[1].trim().split(/\s+/);
  ok(pts.length === mesh.vertices.length * 3, 'every vertex in the point list');
  const cidx = /colorIndex="([^"]*)"/.exec(x3d)[1].trim().split(/\s+/).map(Number);
  const ncol = /<Color color="([^"]*)"/.exec(x3d)[1].trim().split(/\s+/).length / 3;
  ok(cidx.length === mesh.faces.length, 'one colour index per face');
  ok(Math.max(...cidx) < ncol, 'and none past the end of the palette');
  ok(!/<Color /.test(toX3D(mesh, 'plain')), 'an uncoloured X3D has no Color node');
}

// ---------------------------------------------------------- edge tubes

{
  // two segments meeting at a corner, as the renderer would hand them over
  const specs = [{ kind: 'face', color: [1, 0, 0], radius: 0.1,
                   segs: [[0, 0, 0], [1, 0, 0], [1, 0, 0], [1, 1, 0]] }];
  const t = tubesToMesh(specs, 8);
  ok(t.vertices.length === 2 * 2 * 8, 'a tube per segment, two rings of eight');
  ok(t.faces.length === 2 * (8 + 2), 'eight sides and two caps each');
  ok(t.colors.length === t.faces.length, 'every one of them coloured');
  ok(t.colors.every(c => c[0] === 1 && c[1] === 0 && c[2] === 0),
     'in the colour the view draws that kind of edge');
  ok(t.faces.every(f => f.every(i => i >= 0 && i < t.vertices.length)),
     'and no face points outside the tube');
  {
    // the ring really is a ring of the stated radius about the segment
    const r = t.vertices.slice(0, 8).map(v => Math.hypot(v.y, v.z));
    ok(r.every(d => Math.abs(d - 0.1) < 1e-9), 'the ring sits at the radius asked for');
    ok(t.vertices.slice(0, 8).every(v => Math.abs(v.x) < 1e-9),
       'in the plane through the segment end');
  }
  ok(tubesToMesh([]).faces.length === 0, 'no specs, no tubes');
  ok(tubesToMesh([{ color: [0, 0, 1], radius: 1, segs: [[0, 0, 0], [0, 0, 0]] }]).faces.length === 0,
     'and a segment of no length makes none');

  // merged into the solid, the tubes keep their own colours and land in the file
  const merged = mergeMeshes(mesh, colors, t, t.colors);
  ok(merged.mesh.vertices.length === mesh.vertices.length + t.vertices.length,
     'merging keeps every vertex of both');
  ok(merged.mesh.faces.length === mesh.faces.length + t.faces.length, 'and every face');
  ok(merged.colors.length === merged.mesh.faces.length, 'with a colour each');
  const shifted = merged.mesh.faces.slice(mesh.faces.length);
  ok(shifted.every(f => f.every(i => i >= mesh.vertices.length &&
                                     i < merged.mesh.vertices.length)),
     'and the tube faces point at the tube vertices, shifted past the solid');
  ok(merged.colors[mesh.faces.length][0] === 1,
     'the first tube face still wears the tube colour');
  {
    // and it survives into a real file
    const x3d = toX3D(merged.mesh, 'with tubes', merged.colors);
    const ci = /coordIndex="([^"]*)"/.exec(x3d)[1].trim().split(/\s+/);
    ok(ci.filter(v => v === '-1').length === merged.mesh.faces.length,
       'X3D writes the merged figure, tubes and all');
  }
}

// ------------------------------------ symmetry elements and the frame

{
  const t = torusMesh([0, 0, 1], 2, 0.1, [0, 1, 0], 32, 8);
  ok(t.vertices.length === 32 * 8, 'a torus is one ring of tube sections per step');
  ok(t.faces.length === 32 * 8 && t.faces.every(f => f.length === 4),
     'quads all the way round, and closed both ways');
  {
    // every point sits at the tube radius from the centre circle
    const off = t.vertices.map(v => {
      const r = Math.hypot(v.x, v.y);
      return Math.hypot(r - 2, v.z);
    });
    ok(off.every(d => Math.abs(d - 0.1) < 1e-9), 'each point a tube-radius off the ring');
  }
  ok(t.faces.every(f => f.every(i => i < t.vertices.length)), 'and no face past the end');

  const c = coneMesh([0, 0, 1], 3, 1, 0.5, [1, 0, 0], 12);
  ok(c.vertices.length === 13, 'a cone is a tip and a base ring');
  ok(c.faces.length === 13, 'twelve sides and a base');
  ok(Math.abs(c.vertices[0].z - 3) < 1e-9, 'its tip is where the axis ends');
  ok(c.vertices.slice(1).every(v => Math.abs(v.z - 2) < 1e-9),
     'and its base a height back down the axis');
  ok(c.vertices.slice(1).every(v => Math.abs(Math.hypot(v.x, v.y) - 0.5) < 1e-9),
     'at the radius asked for');

  const spec = {
    axes: [{ dir: [0, 0, 1], extent: 2, radius: 0.05, color: [0.2, 0.7, 0.9] }],
    improper: [{ dir: [1, 0, 0], extent: 1.9, radius: 0.045, color: [0.7, 0.4, 0.9] }],
    mirrors: [{ dir: [0, 1, 0], ring: 1.8, radius: 0.05, color: [0.4, 0.9, 0.8] }],
    coord: [{ dir: [1, 0, 0], extent: 3, radius: 0.02, color: [0.9, 0.3, 0.3],
              shaftEnd: 2.9, coneH: 0.1, coneR: 0.04 }],
  };
  const a = annotationsToMesh(spec, 8);
  ok(a.faces.length === a.colors.length, 'every annotation face is coloured');
  ok(a.faces.every(f => f.every(i => i >= 0 && i < a.vertices.length)),
     'and every one indexes a vertex that exists');
  {
    const used = new Set(a.colors.map(c2 => c2.join()));
    ok(used.size === 4, 'the four kinds keep four distinct colours');
    ok(used.has('0.2,0.7,0.9') && used.has('0.4,0.9,0.8'),
       'the axis teal and the mirror green among them');
  }
  {
    // the axis runs through the origin, the coordinate shaft ends short of its tip
    const far = Math.max(...a.vertices.map(v => Math.hypot(v.x, v.y, v.z)));
    ok(far > 2.9 && far < 3.1, 'nothing reaches past the frame it was given');
  }
  const none = annotationsToMesh({ axes: [], improper: [], mirrors: [], coord: [] });
  ok(none.faces.length === 0, 'nothing shown, nothing built');
}

// ------------------------------------------------------- orientation

{
  // a quarter turn about z: x goes to y
  const m = [0, -1, 0, 1, 0, 0, 0, 0, 1];
  const turned = orientMesh({ vertices: [{ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }],
                              faces: [[0, 1]] }, m);
  ok(Math.abs(turned.vertices[0].y - 1) < 1e-12 && Math.abs(turned.vertices[0].x) < 1e-12,
     'orienting turns the vertices by the matrix given');
  ok(Math.abs(turned.vertices[1].z - 2) < 1e-12, 'and leaves the axis of the turn alone');
  ok(turned.faces[0].join() === '0,1', 'the faces are untouched — only the points move');

  // identity leaves the figure exactly where it was
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const same = orientMesh(mesh, I);
  ok(same.vertices.every((v, i) => v.x === mesh.vertices[i].x &&
                                   v.y === mesh.vertices[i].y &&
                                   v.z === mesh.vertices[i].z),
     'and the identity moves nothing');

  // a rotation is rigid: it may not change any distance
  const q = Math.SQRT1_2;
  const r45 = [q, -q, 0, q, q, 0, 0, 0, 1];
  const t45 = orientMesh(mesh, r45);
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  let worst = 0;
  for (let i = 1; i < 60; i++) {
    worst = Math.max(worst, Math.abs(d(mesh.vertices[0], mesh.vertices[i]) -
                                     d(t45.vertices[0], t45.vertices[i])));
  }
  ok(worst < 1e-9, `orienting is rigid — no distance moves (worst ${worst.toExponential(1)})`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
