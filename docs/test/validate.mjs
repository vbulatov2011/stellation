/*
 * Validate the JavaScript port against numbers produced by the original Java code.
 *
 *   node docs/test/validate.mjs [name ...]
 *
 * The Java reference (vbulatov.Driver) printed, for the icosahedron u27 / Ih / I:
 *   20 planes, 67 facets per plane, 1340 facets total, 8 layers,
 *   layer sizes (primitive cells): 1, 20, 30, 60, 20+60, 12+120, 30+60, 60
 *   mesh(layers 0..0) = 12 v / 20 f, (0..1) = 32 v / 60 f, (0..2) = 62 v / 120 f
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildStellation, extractMesh, facePlanes, len, VertexPool,
} from '../js/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '..', 'data');

const geometry = JSON.parse(readFileSync(join(DATA, 'geometry.json'), 'utf8'));
const symmetry = JSON.parse(readFileSync(join(DATA, 'symmetry.json'), 'utf8'));

function loadPoly(key) {
  const g = geometry[key];
  if (!g) throw new Error('no such polyhedron: ' + key);
  const vertices = [];
  for (let i = 0; i < g.v.length; i += 3) vertices.push({ x: g.v[i], y: g.v[i + 1], z: g.v[i + 2] });
  return { vertices, faces: g.f };
}

// ---- expectations captured from the Java run -------------------------------
const EXPECT = {
  u27: {
    polySym: 'Ih', stellSym: 'I',
    planes: 20, facetsPerPlane: 67, totalFacets: 1340, layers: 8,
    primitiveCellsPerLayer: [1, 20, 30, 60, 80, 132, 90, 60],
    orbitsPerLayer:         [1, 1, 1, 1, 2, 2, 2, 1],
    volumes: [2.536151, 0.866453, 2.102924, 2.599358, 5.812340, 16.209771, 25.424714, 197.585371],
    meshes: [[12, 20], [32, 60], [62, 120], [122, 180]],
  },
  u28: {
    polySym: 'Ih', stellSym: 'I',
    planes: 12, facetsPerPlane: 16,
    meshes: [[20, 12], [32, 60]],
  },
  u11: { polySym: 'Oh', stellSym: 'O', planes: 6, facetsPerPlane: 1, meshes: [[8, 6]] },
  u06: { polySym: 'Td', stellSym: 'T', planes: 4, facetsPerPlane: 1, meshes: [[4, 4]] },
  d29: { polySym: 'Ih', stellSym: 'I', planes: 30, facetsPerPlane: 193, meshes: [[32, 30], [62, 120]] },
};

let pass = 0, fail = 0;
const check = (label, got, want, tol = 0) => {
  const ok = tol ? Math.abs(got - want) <= tol : got === want;
  if (ok) { pass++; console.log(`   ok   ${label}: ${got}`); }
  else    { fail++; console.log(`   FAIL ${label}: got ${got}, expected ${want}`); }
};

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(EXPECT);

for (const name of names) {
  const exp = EXPECT[name];
  console.log(`\n=== ${name}  (${exp.polySym} / ${exp.stellSym}) ===`);
  const poly = loadPoly(name);

  const t0 = Date.now();
  const stel = buildStellation(poly, symmetry[exp.polySym].matrices, { maxLayer: 1000 });
  const ms = Date.now() - t0;

  check('planes', stel.planes.length, exp.planes);
  check('facets on plane 0', stel.arrangement[0].length, exp.facetsPerPlane);

  if (exp.totalFacets !== undefined) {
    check('total facets', stel.arrangement.reduce((s, a) => s + a.length, 0), exp.totalFacets);
  }
  if (exp.layers !== undefined) check('layers', stel.cellLayers.length, exp.layers);

  if (exp.primitiveCellsPerLayer) {
    const got = stel.cellLayers.map(l => l.reduce((s, o) => s + o.cells.length, 0));
    check('primitive cells/layer', JSON.stringify(got), JSON.stringify(exp.primitiveCellsPerLayer));
  }
  if (exp.orbitsPerLayer) {
    const got = stel.cellLayers.map(l => l.length);
    check('orbits/layer', JSON.stringify(got), JSON.stringify(exp.orbitsPerLayer));
  }
  if (exp.volumes) {
    stel.cellLayers.forEach((layer, i) => {
      const v = layer.reduce((s, o) => s + o.volume, 0);
      check(`layer ${i} volume`, v.toFixed(6), exp.volumes[i].toFixed(6));
    });
  }

  exp.meshes.forEach(([nv, nf], upto) => {
    const sel = stel.cellLayers.slice(0, upto + 1).flat();
    const mesh = extractMesh(sel, stel.pool);
    check(`mesh 0..${upto} vertices`, mesh.vertices.length, nv);
    check(`mesh 0..${upto} faces`, mesh.faces.length, nf);
  });

  console.log(`   (${ms} ms, ${stel.pool.size} unique vertices)`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
