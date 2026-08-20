/*
 * The mesh in the formats a printer or a viewer wants.
 *
 * OFF, OBJ and STL live in core.js, where they have always been: they are
 * three lines of text each and they came over from the Java program with the
 * rest of it. What is here is everything else — 3MF, a zip of XML; glTF, JSON
 * around a binary buffer; GLB, that pair in one binary file; and VRML 2 and
 * X3D, which are scene graphs — plus what they share: the triangulation, the
 * colours, and the edge tubes.
 *
 * Pure, like diagramsvg.js: a mesh in, bytes out. No DOM, no download, no
 * dialog, so node can write the same files the app does and the tests can read
 * them back.
 *
 * A stellation's faces are convex polygons — they are the flat pieces cut out
 * of a plane by the arrangement — so a triangle fan from the first vertex is a
 * correct triangulation of each. VRML and X3D need no fan at all: they take
 * polygons, and a pentagon stays a pentagon.
 *
 * Colour is carried wherever the format has somewhere to put it, in the same
 * reading the view is using — by shell, or by which face of the original solid
 * a facet lies in. STL has nowhere to put it and OBJ would need a second file,
 * so those two are the shape alone.
 */

import { makeZip } from './uilib/zip.js';
import { layerColor, classColor, cosetColor } from './palette.js';

/**
 * What colour each face is, by the same rule the 3-D view and the diagram use.
 *
 * The mesh carries everything the decision needs — which shell each face is
 * in, which class of the original solid's faces it lies in under each of the
 * two groups, and whether it is an outward cap or an underside — so the only
 * thing that has to be passed is which of those readings is wanted.
 */
export function faceColors(mesh, colorMode = 'layer') {
  if (colorMode === 'coset' && mesh.faceCosets) {
    return mesh.faces.map((_, i) =>
      cosetColor(mesh.faceCosets[i] ?? -1, mesh.faceTop ? mesh.faceTop[i] !== false : true));
  }
  const classes = colorMode === 'class' ? mesh.faceClasses
                : colorMode === 'stellClass' ? mesh.faceClassesStell
                : null;
  return mesh.faces.map((_, i) => classes
    ? classColor(classes[i] || 0, mesh.faceTop ? mesh.faceTop[i] !== false : true)
    : layerColor(mesh.faceLayers ? mesh.faceLayers[i] : 0));
}

/**
 * A cylinder along every segment, as one mesh.
 *
 * The edges of a stellation are drawn either as screen-space lines, which have
 * no thickness to export, or as real cylinders with a world radius — and if
 * you are looking at cylinders then they are part of the figure you want, not
 * an annotation on it. So the export builds them again from the same segments
 * and the same radius the view used.
 *
 * Eight sides rather than the view's six: on screen a hexagonal tube at edge
 * width is a couple of pixels across and nobody can tell, but a printed or
 * rendered one is looked at closely.
 */
export function tubesToMesh(specs, sides = 8) {
  const vertices = [], faces = [], colors = [];
  for (const spec of specs || []) {
    const rgb = (spec.color || [0.5, 0.5, 0.5]).slice(0, 3);
    for (let s = 0; s + 1 < spec.segs.length; s += 2) {
      const a = spec.segs[s], b = spec.segs[s + 1];
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const len = Math.hypot(d[0], d[1], d[2]);
      if (len < 1e-12) continue;
      const w = [d[0] / len, d[1] / len, d[2] / len];
      // any vector not parallel to the axis gives a frame to build the ring in
      const t = Math.abs(w[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const u = norm(cross3(t, w)), v = cross3(w, u);
      const base = vertices.length;
      for (const e of [a, b]) {
        for (let i = 0; i < sides; i++) {
          const th = (i / sides) * Math.PI * 2;
          const c = Math.cos(th), sn = Math.sin(th);
          vertices.push({
            x: e[0] + (u[0] * c + v[0] * sn) * spec.radius,
            y: e[1] + (u[1] * c + v[1] * sn) * spec.radius,
            z: e[2] + (u[2] * c + v[2] * sn) * spec.radius,
          });
        }
      }
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        faces.push([base + i, base + j, base + sides + j, base + sides + i]);
        colors.push(rgb);
      }
      // caps, so the tube is a closed solid and a slicer can fill it
      faces.push(Array.from({ length: sides }, (_, i) => base + sides - 1 - i));
      colors.push(rgb);
      faces.push(Array.from({ length: sides }, (_, i) => base + sides + i));
      colors.push(rgb);
    }
  }
  return { vertices, faces, colors };
}

const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
                          a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

/**
 * The symmetry elements and the coordinate frame, as geometry.
 *
 * An axis is a cylinder through the origin, so it is two points and the tube
 * builder already knows how to do it. A mirror is the rim of its plane, a
 * torus. A coordinate axis is a shaft with a cone on the end. All three are
 * things the view draws around the figure rather than parts of it, which is
 * why they are a separate switch — but if they are on screen they are what you
 * are looking at, and a file that leaves them out is not the picture.
 */
export function annotationsToMesh(spec, sides = 8) {
  const parts = [];
  const along = (a) => ({ color: a.color, radius: a.radius,
    segs: [[-a.dir[0] * a.extent, -a.dir[1] * a.extent, -a.dir[2] * a.extent],
           [a.dir[0] * a.extent, a.dir[1] * a.extent, a.dir[2] * a.extent]] });

  const segSpecs = [];
  for (const a of spec.axes || []) segSpecs.push(along(a));
  for (const a of spec.improper || []) segSpecs.push(along(a));
  for (const a of spec.coord || []) {
    // the shaft stops inside the arrowhead, as it does on screen
    segSpecs.push({ color: a.color, radius: a.radius,
      segs: [[-a.dir[0] * a.extent, -a.dir[1] * a.extent, -a.dir[2] * a.extent],
             [a.dir[0] * a.shaftEnd, a.dir[1] * a.shaftEnd, a.dir[2] * a.shaftEnd]] });
  }
  if (segSpecs.length) parts.push(tubesToMesh(segSpecs, sides));
  for (const m of spec.mirrors || []) {
    parts.push(torusMesh(m.dir, m.ring, m.radius, m.color, Math.max(48, sides * 8), sides));
  }
  for (const a of spec.coord || []) {
    parts.push(coneMesh(a.dir, a.extent, a.coneH, a.coneR, a.color, Math.max(12, sides)));
  }

  const out = { vertices: [], faces: [], colors: [] };
  for (const p of parts) {
    const off = out.vertices.length;
    out.vertices.push(...p.vertices);
    for (const f of p.faces) out.faces.push(f.map(i => i + off));
    out.colors.push(...p.colors);
  }
  return out;
}

/** a ring of `major` radius made of a tube of `minor` radius, about `dir` */
export function torusMesh(dir, major, minor, color, majorSteps = 64, minorSteps = 8) {
  const w = norm(dir);
  const t = Math.abs(w[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm(cross3(t, w)), v = cross3(w, u);
  const vertices = [], faces = [], colors = [];
  for (let i = 0; i < majorSteps; i++) {
    const th = (i / majorSteps) * Math.PI * 2;
    const c = Math.cos(th), s = Math.sin(th);
    const radial = [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s];
    for (let j = 0; j < minorSteps; j++) {
      const ph = (j / minorSteps) * Math.PI * 2;
      const rr = major + minor * Math.cos(ph), h = minor * Math.sin(ph);
      vertices.push({ x: radial[0] * rr + w[0] * h,
                      y: radial[1] * rr + w[1] * h,
                      z: radial[2] * rr + w[2] * h });
    }
  }
  for (let i = 0; i < majorSteps; i++) {
    const i2 = (i + 1) % majorSteps;
    for (let j = 0; j < minorSteps; j++) {
      const j2 = (j + 1) % minorSteps;
      faces.push([i * minorSteps + j, i2 * minorSteps + j,
                  i2 * minorSteps + j2, i * minorSteps + j2]);
      colors.push(color);
    }
  }
  return { vertices, faces, colors };
}

/** a cone with its tip at `dir * tipAt`, opening back towards the origin */
export function coneMesh(dir, tipAt, height, radius, color, sides = 12) {
  const w = norm(dir);
  const t = Math.abs(w[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm(cross3(t, w)), v = cross3(w, u);
  const tip = [w[0] * tipAt, w[1] * tipAt, w[2] * tipAt];
  const baseAt = tipAt - height;
  const vertices = [{ x: tip[0], y: tip[1], z: tip[2] }];
  for (let i = 0; i < sides; i++) {
    const th = (i / sides) * Math.PI * 2;
    const c = Math.cos(th), s = Math.sin(th);
    vertices.push({
      x: w[0] * baseAt + (u[0] * c + v[0] * s) * radius,
      y: w[1] * baseAt + (u[1] * c + v[1] * s) * radius,
      z: w[2] * baseAt + (u[2] * c + v[2] * s) * radius,
    });
  }
  const faces = [], colors = [];
  for (let i = 0; i < sides; i++) {
    faces.push([0, 1 + i, 1 + (i + 1) % sides]);
    colors.push(color);
  }
  // the base, so the arrowhead is closed
  faces.push(Array.from({ length: sides }, (_, i) => 1 + sides - 1 - i));
  colors.push(color);
  return { vertices, faces, colors };
}

/**
 * The mesh turned to face the way the screen does.
 *
 * `m` is the view's rotation, row by row. Applying it puts x to the right, y
 * up and z toward the viewer — which is what a file is for when the point of
 * it is the angle you found rather than the figure in its own frame.
 */
export function orientMesh(mesh, m) {
  return {
    ...mesh,
    vertices: mesh.vertices.map(({ x, y, z }) => ({
      x: m[0] * x + m[1] * y + m[2] * z,
      y: m[3] * x + m[4] * y + m[5] * z,
      z: m[6] * x + m[7] * y + m[8] * z,
    })),
  };
}

/**
 * Two meshes as one, with their colours kept side by side.
 *
 * The second mesh's face indices are shifted past the first's vertices. Used
 * to put the edge tubes into the same file as the solid rather than beside it:
 * one object is what every one of these formats is best at, and what anyone
 * opening the file expects.
 */
export function mergeMeshes(a, aColors, b, bColors) {
  const off = a.vertices.length;
  return {
    mesh: {
      vertices: [...a.vertices, ...b.vertices],
      faces: [...a.faces, ...b.faces.map(f => f.map(i => i + off))],
    },
    colors: (aColors && bColors) ? [...aColors, ...bColors] : null,
  };
}

/**
 * The mesh as flat typed arrays: positions, and triangle indices.
 *
 * Shared by all three formats here, and the one place the fan triangulation
 * happens. Indices are 32-bit throughout — a deep stellation runs past 65,535
 * vertices and a silent wrap there would be a corrupt file rather than an
 * error, which is the worst kind of bug this code could have.
 */
export function triangulate(mesh, colors = null) {
  /*
   * Coloured, the vertices cannot be shared: a corner where three faces meet
   * is one point of the solid but three different colours, and a format that
   * colours vertices has no way to say that except by having three vertices
   * there. Uncoloured, sharing is kept — it is half the file size and it is
   * what the geometry actually is.
   */
  if (colors) {
    const pos = [], col = [], tris = [];
    mesh.faces.forEach((f, fi) => {
      const rgb = colors[fi] || [0.8, 0.8, 0.8];
      for (let i = 1; i < f.length - 1; i++) {
        for (const k of [f[0], f[i], f[i + 1]]) {
          const v = mesh.vertices[k];
          tris.push(pos.length / 3);
          pos.push(v.x, v.y, v.z);
          col.push(rgb[0], rgb[1], rgb[2]);
        }
      }
    });
    return {
      positions: new Float32Array(pos), indices: new Uint32Array(tris),
      colors: new Float32Array(col), triangles: tris.length / 3,
    };
  }

  const positions = new Float32Array(mesh.vertices.length * 3);
  mesh.vertices.forEach((v, i) => {
    positions[i * 3] = v.x; positions[i * 3 + 1] = v.y; positions[i * 3 + 2] = v.z;
  });
  const tris = [];
  for (const f of mesh.faces) {
    for (let i = 1; i < f.length - 1; i++) tris.push(f[0], f[i], f[i + 1]);
  }
  return { positions, indices: new Uint32Array(tris), colors: null,
           triangles: tris.length / 3 };
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

const hex2 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)))
  .toString(16).padStart(2, '0').toUpperCase();
const hexColor = (c) => '#' + hex2(c[0]) + hex2(c[1]) + hex2(c[2]) + 'FF';

/**
 * The distinct colours in use, and which one each face wants.
 *
 * Formats that carry a palette want it deduplicated — a stellation has as many
 * faces as it has facets and as few colours as it has shells, so writing one
 * material per face would be hundreds of identical entries.
 */
function palette(colors) {
  const index = new Map(), list = [];
  const of = colors.map((c) => {
    const k = hexColor(c);
    if (!index.has(k)) { index.set(k, list.length); list.push(c); }
    return index.get(k);
  });
  return { list, of };
}

/** the 3D/3dmodel.model part, on its own — the tests read this back */
export function model3MF(mesh, name = 'stellation', colors = null) {
  const L = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" ' +
      'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    `  <metadata name="Title">${esc(name)}</metadata>`,
    '  <metadata name="Application">Stellation</metadata>',
    '  <resources>',
  ];
  /*
   * Colour through base materials, which is the part of 3MF every slicer
   * reads — the newer colorgroup extension is better specified and less well
   * supported, and a file a slicer opens in grey is no use.
   */
  const pal = colors ? palette(colors) : null;
  if (pal) {
    L.push('    <basematerials id="2">');
    pal.list.forEach((c, i) =>
      L.push(`      <base name="shell ${i}" displaycolor="${hexColor(c)}"/>`));
    L.push('    </basematerials>');
  }
  L.push(`    <object id="1" type="model"${pal ? ' pid="2" pindex="0"' : ''}>`,
         '      <mesh>', '        <vertices>');
  for (const v of mesh.vertices) L.push(`          <vertex x="${v.x}" y="${v.y}" z="${v.z}"/>`);
  L.push('        </vertices>', '        <triangles>');
  /*
   * Fanned here rather than through triangulate(), because a triangle has to
   * name the material of the face it came out of — which the flat index list
   * no longer remembers.
   */
  mesh.faces.forEach((f, fi) => {
    const p = pal ? ` pid="2" p1="${pal.of[fi]}"` : '';
    for (let i = 1; i < f.length - 1; i++) {
      L.push(`          <triangle v1="${f[0]}" v2="${f[i]}" v3="${f[i + 1]}"${p}/>`);
    }
  });
  L.push('        </triangles>', '      </mesh>', '    </object>', '  </resources>',
         '  <build><item objectid="1"/></build>', '</model>', '');
  return L.join('\n');
}

/** the whole .3mf package, as a Blob */
export function to3MF(mesh, name = 'stellation', colors = null) {
  return makeZip([
    { name: '[Content_Types].xml', text: CONTENT_TYPES },
    { name: '_rels/.rels', text: RELS },
    { name: '3D/3dmodel.model', text: model3MF(mesh, name, colors) },
  ]);
}

// ------------------------------------------------------- VRML 2 and X3D

/*
 * Both are scene-graph formats that take polygons directly, so neither needs
 * the fan — a pentagon stays a pentagon, which is what the figure is made of.
 * Both also colour per FACE natively, with a palette and an index per face, so
 * a stellation's few shell colours are written once each rather than copied
 * onto every corner. They are the two formats here that fit the object best.
 */

/** VRML 2.0 — .wrl, the format the original Java program's world was built in */
export function toVRML(mesh, name = 'stellation', colors = null) {
  const pal = colors ? palette(colors) : null;
  const L = ['#VRML V2.0 utf8', `# ${name} — generated by the Stellation web app`, '',
             'Shape {', '  appearance Appearance {',
             '    material Material { diffuseColor 0.78 0.79 0.82 }', '  }',
             '  geometry IndexedFaceSet {', '    solid FALSE',
             '    coord Coordinate {', '      point ['];
  for (const v of mesh.vertices) L.push(`        ${v.x} ${v.y} ${v.z},`);
  L.push('      ]', '    }', '    coordIndex [');
  for (const f of mesh.faces) L.push(`      ${f.join(' ')} -1,`);
  L.push('    ]');
  if (pal) {
    L.push('    colorPerVertex FALSE', '    color Color {', '      color [');
    for (const c of pal.list) L.push(`        ${c[0]} ${c[1]} ${c[2]},`);
    L.push('      ]', '    }', '    colorIndex [', '      ' + pal.of.join(' '), '    ]');
  }
  L.push('  }', '}', '');
  return L.join('\n');
}

/** X3D — the XML that replaced VRML, same scene graph */
export function toX3D(mesh, name = 'stellation', colors = null) {
  const pal = colors ? palette(colors) : null;
  const coordIndex = mesh.faces.map(f => f.join(' ') + ' -1').join(' ');
  const points = mesh.vertices.map(v => `${v.x} ${v.y} ${v.z}`).join(' ');
  const L = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE X3D PUBLIC "ISO//Web3D//DTD X3D 3.3//EN" ' +
      '"https://www.web3d.org/specifications/x3d-3.3.dtd">',
    '<X3D profile="Interchange" version="3.3">',
    '  <head><meta name="title" content="' + esc(name) + '"/>' +
      '<meta name="generator" content="Stellation"/></head>',
    '  <Scene>',
    '    <Shape>',
    '      <Appearance><Material diffuseColor="0.78 0.79 0.82"/></Appearance>',
    `      <IndexedFaceSet solid="false" coordIndex="${coordIndex}"` +
      (pal ? ` colorPerVertex="false" colorIndex="${pal.of.join(' ')}"` : '') + '>',
    `        <Coordinate point="${points}"/>`,
  ];
  if (pal) {
    L.push(`        <Color color="${pal.list.map(c => `${c[0]} ${c[1]} ${c[2]}`).join(' ')}"/>`);
  }
  L.push('      </IndexedFaceSet>', '    </Shape>', '  </Scene>', '</X3D>', '');
  return L.join('\n');
}

// -------------------------------------------------------------------- glTF

/*
 * One buffer holding the indices then the positions, each aligned to four
 * bytes as the spec requires, described by two accessors over two buffer
 * views. glTF's world is Y-up and right-handed, which is the app's own
 * convention, so nothing is rotated on the way out.
 */
function gltfBuffer(mesh, colors) {
  const { positions, indices, colors: rgb } = triangulate(mesh, colors);
  const parts = [
    new Uint8Array(indices.buffer, 0, indices.byteLength),
    new Uint8Array(positions.buffer, 0, positions.byteLength),
  ];
  if (rgb) parts.push(new Uint8Array(rgb.buffer, 0, rgb.byteLength));

  // every view starts on a four-byte boundary, which the spec requires
  const offsets = [];
  let total = 0;
  for (const p of parts) { offsets.push(total); total = (total + p.length + 3) & ~3; }
  const bytes = new Uint8Array(total);
  parts.forEach((p, i) => bytes.set(p, offsets[i]));
  return { bytes, positions, indices, rgb, offsets };
}

function gltfJSON(mesh, name, bufferField, colors) {
  const { positions, indices, rgb, offsets, bytes } = gltfBuffer(mesh, colors);
  const { min, max } = bounds(positions);
  const attributes = { POSITION: 1 };
  const accessors = [
    { bufferView: 0, componentType: 5125, count: indices.length, type: 'SCALAR' },
    { bufferView: 1, componentType: 5126, count: positions.length / 3, type: 'VEC3', min, max },
  ];
  const bufferViews = [
    { buffer: 0, byteOffset: offsets[0], byteLength: indices.byteLength, target: 34963 },
    { buffer: 0, byteOffset: offsets[1], byteLength: positions.byteLength, target: 34962 },
  ];
  /*
   * Colour rides on the vertices rather than on materials. A stellation has a
   * handful of colours but hundreds of faces, and glTF can only give a
   * primitive one material — so per-face materials would mean splitting the
   * mesh into a primitive per shell. COLOR_0 says the same thing in one
   * primitive, and every viewer multiplies it into the base colour.
   */
  if (rgb) {
    attributes.COLOR_0 = 2;
    accessors.push({ bufferView: 2, componentType: 5126, count: rgb.length / 3, type: 'VEC3' });
    bufferViews.push({ buffer: 0, byteOffset: offsets[2], byteLength: rgb.byteLength, target: 34962 });
  }
  return {
    asset: { version: '2.0', generator: 'Stellation' },
    scene: 0,
    scenes: [{ nodes: [0], name }],
    nodes: [{ mesh: 0, name }],
    meshes: [{ name, primitives: [{ attributes, indices: 0, material: 0 }] }],
    materials: [{
      name: 'stellation',
      pbrMetallicRoughness: {
        // white when the vertices carry the colour, since the two multiply;
        // a neutral grey when they do not, so the figure is not a white blob
        baseColorFactor: rgb ? [1, 1, 1, 1] : [0.78, 0.79, 0.82, 1],
        metallicFactor: 0.1, roughnessFactor: 0.7,
      },
      doubleSided: true,        // a stellation's cells are not all closed solids
    }],
    accessors,
    bufferViews,
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
export function toGLTF(mesh, name = 'stellation', colors = null) {
  const doc = gltfJSON(mesh, name, (bytes) =>
    ({ uri: 'data:application/octet-stream;base64,' + b64(bytes) }), colors);
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
export function toGLB(mesh, name = 'stellation', colors = null) {
  const doc = gltfJSON(mesh, name, () => ({}), colors);
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
