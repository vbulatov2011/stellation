/*
 * The mesh in the formats a printer or a viewer wants.
 *
 * OFF, OBJ and STL live in core.js, where they have always been: they are
 * three lines of text each and they came over from the Java program with the
 * rest of it. What is here is the three that are containers rather than
 * listings — 3MF is a zip of XML, glTF is JSON around a binary buffer, and GLB
 * is that pair in one binary file — plus the triangulation all three need.
 *
 * Pure, like diagramsvg.js: a mesh in, bytes out. No DOM, no download, no
 * dialog, so node can write the same files the app does and the tests can read
 * them back.
 *
 * A stellation's faces are convex polygons — they are the flat pieces cut out
 * of a plane by the arrangement — so a triangle fan from the first vertex is
 * a correct triangulation of each, and that is what every one of these formats
 * is given. Colour is deliberately not carried: the app colours by shell or by
 * class, which is a property of the arrangement rather than of the solid, and
 * a file that is going to a printer should say what the shape is and nothing
 * else. glTF gets one default material.
 */

import { makeZip } from './uilib/zip.js';

/**
 * The mesh as flat typed arrays: positions, and triangle indices.
 *
 * Shared by all three formats here, and the one place the fan triangulation
 * happens. Indices are 32-bit throughout — a deep stellation runs past 65,535
 * vertices and a silent wrap there would be a corrupt file rather than an
 * error, which is the worst kind of bug this code could have.
 */
export function triangulate(mesh) {
  const positions = new Float32Array(mesh.vertices.length * 3);
  mesh.vertices.forEach((v, i) => {
    positions[i * 3] = v.x; positions[i * 3 + 1] = v.y; positions[i * 3 + 2] = v.z;
  });
  const tris = [];
  for (const f of mesh.faces) {
    for (let i = 1; i < f.length - 1; i++) tris.push(f[0], f[i], f[i + 1]);
  }
  return { positions, indices: new Uint32Array(tris), triangles: tris.length / 3 };
}

/** the bounding box, which glTF requires on the POSITION accessor */
function bounds(positions) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  // an empty mesh has no box; say so with zeros rather than infinities
  return positions.length ? { min, max } : { min: [0, 0, 0], max: [0, 0, 0] };
}

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// --------------------------------------------------------------------- 3MF

/*
 * 3MF is a zip — the same OPC layout as .docx — holding an XML model and the
 * two bookkeeping files that point at it. The three parts must all be there or
 * the file will not open: the content types say what the model part is, the
 * relationship says which part is the model, and the model carries the mesh.
 *
 * Units are millimetres, which is what a slicer assumes and what makes the
 * numbers here the same numbers the STL carries.
 */
const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>' +
  '</Types>\n';

const RELS =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Target="/3D/3dmodel.model" Id="rel0" ' +
  'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>' +
  '</Relationships>\n';

/** the 3D/3dmodel.model part, on its own — the tests read this back */
export function model3MF(mesh, name = 'stellation') {
  const { indices } = triangulate(mesh);
  const L = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" ' +
      'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    `  <metadata name="Title">${esc(name)}</metadata>`,
    '  <metadata name="Application">Stellation</metadata>',
    '  <resources>',
    '    <object id="1" type="model">',
    '      <mesh>',
    '        <vertices>',
  ];
  for (const v of mesh.vertices) L.push(`          <vertex x="${v.x}" y="${v.y}" z="${v.z}"/>`);
  L.push('        </vertices>', '        <triangles>');
  for (let i = 0; i < indices.length; i += 3) {
    L.push(`          <triangle v1="${indices[i]}" v2="${indices[i + 1]}" v3="${indices[i + 2]}"/>`);
  }
  L.push('        </triangles>', '      </mesh>', '    </object>', '  </resources>',
         '  <build><item objectid="1"/></build>', '</model>', '');
  return L.join('\n');
}

/** the whole .3mf package, as a Blob */
export function to3MF(mesh, name = 'stellation') {
  return makeZip([
    { name: '[Content_Types].xml', text: CONTENT_TYPES },
    { name: '_rels/.rels', text: RELS },
    { name: '3D/3dmodel.model', text: model3MF(mesh, name) },
  ]);
}

// -------------------------------------------------------------------- glTF

/*
 * One buffer holding the indices then the positions, each aligned to four
 * bytes as the spec requires, described by two accessors over two buffer
 * views. glTF's world is Y-up and right-handed, which is the app's own
 * convention, so nothing is rotated on the way out.
 */
function gltfBuffer(mesh) {
  const { positions, indices } = triangulate(mesh);
  const idxBytes = indices.byteLength;
  const pad = (idxBytes + 3 & ~3) - idxBytes;      // positions must start on 4
  const bytes = new Uint8Array(idxBytes + pad + positions.byteLength);
  bytes.set(new Uint8Array(indices.buffer, 0, idxBytes), 0);
  bytes.set(new Uint8Array(positions.buffer, 0, positions.byteLength), idxBytes + pad);
  return { bytes, positions, indices, idxBytes, posOffset: idxBytes + pad };
}

function gltfJSON(mesh, name, bufferField) {
  const { positions, indices, idxBytes, posOffset, bytes } = gltfBuffer(mesh);
  const { min, max } = bounds(positions);
  return {
    asset: { version: '2.0', generator: 'Stellation' },
    scene: 0,
    scenes: [{ nodes: [0], name }],
    nodes: [{ mesh: 0, name }],
    meshes: [{ name, primitives: [{ attributes: { POSITION: 1 }, indices: 0, material: 0 }] }],
    materials: [{
      name: 'stellation',
      pbrMetallicRoughness: {
        baseColorFactor: [0.78, 0.79, 0.82, 1], metallicFactor: 0.1, roughnessFactor: 0.7,
      },
      doubleSided: true,        // a stellation's cells are not all closed solids
    }],
    accessors: [
      { bufferView: 0, componentType: 5125, count: indices.length, type: 'SCALAR' },
      { bufferView: 1, componentType: 5126, count: positions.length / 3, type: 'VEC3', min, max },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: idxBytes, target: 34963 },
      { buffer: 0, byteOffset: posOffset, byteLength: positions.byteLength, target: 34962 },
    ],
    buffers: [{ byteLength: bytes.length, ...bufferField(bytes) }],
    _bytes: bytes,
  };
}

const b64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
};

/** .gltf — one self-contained JSON file, its buffer inline as a data URI */
export function toGLTF(mesh, name = 'stellation') {
  const doc = gltfJSON(mesh, name, (bytes) =>
    ({ uri: 'data:application/octet-stream;base64,' + b64(bytes) }));
  delete doc._bytes;
  return JSON.stringify(doc, null, 1);
}

/**
 * .glb — the same document as a binary container.
 *
 * A 12-byte header, then chunks: JSON padded with spaces, binary padded with
 * zeros, both to a multiple of four. Readers are entitled to reject a file
 * whose chunks are not aligned, so the padding is not decoration.
 */
export function toGLB(mesh, name = 'stellation') {
  const doc = gltfJSON(mesh, name, () => ({}));
  const bin = doc._bytes;
  delete doc._bytes;
  const json = new TextEncoder().encode(JSON.stringify(doc));
  const jsonPad = (json.length + 3 & ~3) - json.length;
  const binPad = (bin.length + 3 & ~3) - bin.length;
  const total = 12 + 8 + json.length + jsonPad + 8 + bin.length + binPad;

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let p = 0;
  view.setUint32(p, 0x46546C67, true); p += 4;      // 'glTF'
  view.setUint32(p, 2, true); p += 4;               // version
  view.setUint32(p, total, true); p += 4;
  view.setUint32(p, json.length + jsonPad, true); p += 4;
  view.setUint32(p, 0x4E4F534A, true); p += 4;      // 'JSON'
  out.set(json, p); p += json.length;
  for (let i = 0; i < jsonPad; i++) out[p++] = 0x20;   // spaces, per the spec
  view.setUint32(p, bin.length + binPad, true); p += 4;
  view.setUint32(p, 0x004E4942, true); p += 4;      // 'BIN\0'
  out.set(bin, p); p += bin.length;
  for (let i = 0; i < binPad; i++) out[p++] = 0;
  return out;
}
