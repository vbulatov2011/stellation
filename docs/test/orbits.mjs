/*
 * Subgroup-orbit coloring: pieces share a color exactly when some motion of
 * H carries one onto the other.
 *
 *   node docs/test/orbits.mjs
 *
 * This is the honest form of "right cosets": on a free orbit the classes ARE
 * the right cosets Hg, and in general the double cosets H\G/S. Unlike the
 * block (left-coset) coloring it exists for every subgroup, needs no anchor,
 * and never grays — and its small classes are the H-invariant sub-figures,
 * which is what it is for. The canonical numbers here were derived in the
 * coloring report and verified independently before this feature existed.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildStellation, facePlanes, suggestDepth, subgroupOrbits } from '../lib/core.js';

let passed = 0, failed = 0;
const ok = (cond, label) => {
  if (cond) { passed++; console.log('   ok   ' + label); }
  else { failed++; console.log('   FAIL ' + label); }
};

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
const geometry = JSON.parse(readFileSync(join(DOCS, 'data', 'geometry.json'), 'utf8'));
const symmetry = JSON.parse(readFileSync(join(DOCS, 'data', 'symmetry.json'), 'utf8'));

const toPoly = (g) => {
  const vertices = [];
  for (let i = 0; i < g.v.length; i += 3) vertices.push({ x: g.v[i], y: g.v[i + 1], z: g.v[i + 2] });
  return { vertices, faces: g.f };
};
const build = (key, G) => {
  const poly = toPoly(geometry[key]);
  return buildStellation(poly, symmetry[G].matrices,
    { subMatrices: symmetry[G].matrices, maxIntersection: suggestDepth(facePlanes(poly)) });
};

const sizes = (labels, count) => {
  const n = new Array(count).fill(0);
  for (const k of labels) n[k]++;
  return n.sort((a, b) => a - b).join('+');
};

// ------------------------------------------------- the icosahedron, under T

{
  const stel = build('u27', 'Ih');
  const r = subgroupOrbits(stel, symmetry.T.matrices);

  ok(r.planeCount === 3, `T on the 20 planes: 3 orbits (got ${r.planeCount})`);
  ok(sizes(r.planes, r.planeCount) === '4+4+12',
     `of sizes 4+4+12 — the two T-invariant tetrahedra and the rest`);
  ok(r.planes.every(k => k >= 0), 'no plane is unlabeled — orbits never gray');

  ok(r.facetCount === 113, `T on the 1340 facets: 113 orbits (got ${r.facetCount})`);
  // 44, not the survey's 40: Burnside over T's twelve elements on the 473
  // cell centers gives 528/12 = 44 exactly, so the survey miscounted
  ok(r.cellCount === 44, `T on the 473 cells: 44 orbits (got ${r.cellCount})`);

  let facets = 0;
  for (const plane of stel.arrangement) for (const f of plane) {
    facets++;
    if (r.facets.get(f) == null) { ok(false, 'a facet was left unlabeled'); facets = -1; break; }
  }
  if (facets >= 0) ok(facets === 1340, `every one of the ${facets} facets is labeled`);
  let cells = 0, holes = false;
  for (const layer of stel.cellLayers) for (const o of layer) for (const c of o.cells) {
    cells++;
    if (r.cells.get(c) == null) holes = true;
  }
  ok(!holes && cells === 473, `every one of the ${cells} cells is labeled`);

  // the degenerate ends: the whole group gives the face classes, E gives
  // one color per piece
  const full = subgroupOrbits(stel, symmetry.Ih.matrices);
  ok(full.planeCount === 1, 'H = Ih: the 20 planes are one orbit — the face-class picture');
  const none = subgroupOrbits(stel, symmetry.E.matrices);
  ok(none.planeCount === 20 && none.facetCount === 1340 && none.cellCount === 473,
     'H = E: every piece its own color');

  // deterministic
  const r2 = subgroupOrbits(stel, symmetry.T.matrices);
  let same = r2.planes.every((k, i) => k === r.planes[i]) && r2.facetCount === r.facetCount;
  for (const [f, k] of r.facets) if (r2.facets.get(f) !== k) { same = false; break; }
  ok(same, 'deterministic across runs');
}

// -------------------------- the dodecahedron: antipodal pairs under D5d(I)

{
  const stel = build('u28', 'Ih');
  const r = subgroupOrbits(stel, symmetry['D5d(I)'].matrices);
  ok(r.planeCount === 2, `D5d(I) on the 12 planes: 2 orbits (got ${r.planeCount})`);
  ok(sizes(r.planes, r.planeCount) === '2+10',
     'of sizes 2+10 — the axis pair the subgroup holds, and the ring it sweeps');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
