/*
 * Merged facet coloring: adjacent classes melt into solid regions.
 *
 *   node docs/test/merge.mjs
 *
 * The first fixture is the figure this feature was asked for: a custom Oh
 * arrangement of 48 planes (one row, normal 1 0.3 0.6), colored by cosets of
 * O per facet. The index is 2, so every facet wears red or green, and inside
 * one triangular face the two sit side by side in enumeration order —
 * confetti. There are 90 classes on the surface, and the surface falls apart
 * into 8 connected patches: per plane orbit, the big triangle, a detached
 * 2-facet patch, and the underside slivers.
 *
 * The checks pin the whole contract: full merge (colors = null) leaves
 * exactly one unit per patch, every patch single-labeled, and the two big
 * triangles wearing their MAJORITY coset — 0 on the first orbit, 1 on the
 * mirror orbit, which is what makes full merge degrade gracefully toward
 * the per-plane reading. A colors target between floor and classes is hit
 * exactly; at the class count the merge is the identity.
 *
 * The second fixture is the compound of five tetrahedra, and it exists
 * because of a real mistake: the merge's classes were first taken to be the
 * facet orbits under the coloring subgroup H, which for the color_o figure
 * they are (O is normal in Oh) — but T is not normal in I, a T-orbit of
 * facets spans four of the five tetrahedra, and the "identity" merge quietly
 * relabeled the whole compound. The classes are (G-orbit, label) pairs. On
 * this figure the spikes of one plane meet only at points, so there is no
 * adjacency at all and the merge must be an exact identity.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildStellation, extractMesh, parseCellsAny, selectedCells, selectedSubCells,
  facetCosetClasses, subgroupOrbits, surfaceAdjacency, mergeAdjacentFacetClasses,
} from '../lib/core.js';
import { normalizePlaneRows, expandPlaneRows } from '../app/js/preset.js';

let passed = 0, failed = 0;
const ok = (cond, label) => {
  if (cond) { passed++; console.log('   ok   ' + label); }
  else { failed++; console.log('   FAIL ' + label); }
};

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
const geometry = JSON.parse(readFileSync(join(DOCS, 'data', 'geometry.json'), 'utf8'));
const symmetry = JSON.parse(readFileSync(join(DOCS, 'data', 'symmetry.json'), 'utf8'));

const labelerFor = (cl) => (f) => {
  const k = cl.of.get(f);
  if (k != null && k >= 0) return k;
  const b = cl.blends && cl.blends.get(f);
  return b ? Array.from(b) : -1;
};

// ---------------------------------------------------------------- the figure

const ROWS = [{ normal: [1, 0.3, 0.6], distance: 1, symmetry: 'Oh' }];
const CELLS = '{0,1,2,3,4,5,6,7,8(0,2,3,4,5,6,7,8,9,10,11,12)'
  + '9(0,1,2,3,5,6,8,9,10,11,12)10(0,1,2,4,5,6,9,10,12,13,14)'
  + '11(0,2,4,5,7,8,9,10,12,14)12(0,2,4,7,9,12,14,15)13(0,4,7,8,9,11,13)'
  + '14(1,2,7,9,10,16)15(0,1,2,8,14)16(0,3,8,12,13)17(0,11)18(2)}';
const STEER = [...Array(48)].map((_, i) => (i < 24 ? 0 : 1));

const planes = expandPlaneRows(normalizePlaneRows(ROWS), symmetry);
ok(planes.length === 48, 'one Oh row expands to 48 planes');

const G = symmetry.Oh.matrices, H = symmetry.O.matrices;
const stel = buildStellation(null, G, {
  planes, subMatrices: G, maxIntersection: 20, maxLayer: 1000,
});
const sel = parseCellsAny(stel, CELLS);
const mesh = extractMesh(selectedSubCells(stel, sel), stel.pool);
const cl = facetCosetClasses(stel, G, H, selectedCells(stel, sel),
  { split: true, prevPlanes: STEER });
const gOrbits = subgroupOrbits(stel, G);
const hOrbits = subgroupOrbits(stel, H);

const labelOfL = labelerFor(cl);
const labelings = { cosetL: labelOfL, orbitF: (f) => (hOrbits.facets.get(f) ?? 0) };

const planeOf = new Map();
stel.arrangement.forEach((fs, p) => fs.forEach(f => planeOf.set(f, p)));

// ------------------------------------------------------------- the adjacency

const pairs = surfaceAdjacency(stel, mesh);
ok(pairs.length > 0, `adjacency found (${pairs.length} pairs)`);
ok(pairs.every(([i, j]) =>
  planeOf.get(mesh.facetRefs[i]) === planeOf.get(mesh.facetRefs[j])
  && mesh.facetTop[i] === mesh.facetTop[j]),
  'every pair is same plane, same side');

// patches: connected components of the pairs, for checking solidity below
const par = new Map(mesh.facetRefs.map((_, i) => [i, i]));
const find = (x) => {
  while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); }
  return x;
};
for (const [i, j] of pairs) { const a = find(i), b = find(j); if (a !== b) par.set(a, b); }

// ------------------------------------------------------------- the full merge

const m = mergeAdjacentFacetClasses(stel, mesh, gOrbits.facets, labelings, null);
ok(m.stats.cosetL.classes === 90, `90 coset classes on the surface (got ${m.stats.cosetL.classes})`);
ok(m.stats.cosetL.floor === 8, `floor is 8 — one unit per patch orbit (got ${m.stats.cosetL.floor})`);
ok(m.stats.cosetL.units === 8, `full merge reaches the floor (got ${m.stats.cosetL.units})`);

let multi = 0;
{
  const seen = new Map();
  mesh.facetRefs.forEach((f, i) => {
    const r = find(i), v = JSON.stringify(m.labels.cosetL.get(f));
    if (!seen.has(r)) seen.set(r, v);
    else if (seen.get(r) !== v) multi++;
  });
}
ok(multi === 0, 'every connected patch is a single color');

const bigLabel = (p) => {
  const count = new Map();
  mesh.facetRefs.forEach((f, i) => {
    if (planeOf.get(f) !== p || !mesh.facetTop[i]) return;
    const r = find(i);
    count.set(r, (count.get(r) || 0) + 1);
  });
  const r = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return m.labels.cosetL.get(mesh.facetRefs[r]);
};
ok(bigLabel(0) === 0, 'the big triangle of the first orbit goes solid coset 0');
ok(bigLabel(24) === 1, 'the big triangle of the mirror orbit goes solid coset 1');

{
  const vals = new Set();
  mesh.facetRefs.forEach((f, i) => {
    if (planeOf.get(f) === 0 && mesh.facetTop[i]) vals.add(m.labels.orbitF.get(f));
  });
  ok(vals.size === 2, `merged orbit labels: plane 0 top wears 2 (big + detached patch), got ${vals.size}`);
}

// ------------------------------------------------------- the colors dial

const m20 = mergeAdjacentFacetClasses(stel, mesh, gOrbits.facets, labelings, 20);
ok(m20.stats.cosetL.units === 20,
  `a colors target between floor and classes is hit exactly (got ${m20.stats.cosetL.units})`);
const mAll = mergeAdjacentFacetClasses(stel, mesh, gOrbits.facets, labelings, 9999);
ok(mAll.stats.cosetL.units === 90, 'a target above the class count clamps to the identity');
{
  let diffs = 0;
  mesh.facetRefs.forEach((f) => {
    if (JSON.stringify(mAll.labels.cosetL.get(f)) !== JSON.stringify(labelOfL(f))) diffs++;
  });
  ok(diffs === 0, 'at the identity, merged labels equal the raw labels');
}
const mLow = mergeAdjacentFacetClasses(stel, mesh, gOrbits.facets, labelings, 1);
ok(mLow.stats.cosetL.units === 8, 'a target below the floor clamps to the floor');

// determinism: the same question twice gives byte-equal answers
{
  const a = mergeAdjacentFacetClasses(stel, mesh, gOrbits.facets, labelings, 20);
  const b = mergeAdjacentFacetClasses(stel, mesh, gOrbits.facets, labelings, 20);
  let same = a.stats.cosetL.units === b.stats.cosetL.units;
  mesh.facetRefs.forEach((f) => {
    if (JSON.stringify(a.labels.cosetL.get(f)) !== JSON.stringify(b.labels.cosetL.get(f))) same = false;
  });
  ok(same, 'the merge is deterministic');
}

// -------------------------------------- five tetrahedra: the non-normal case

{
  const g = geometry.u27;                     // icosahedron
  const vertices = [];
  for (let i = 0; i < g.v.length; i += 3) {
    vertices.push({ x: g.v[i], y: g.v[i + 1], z: g.v[i + 2] });
  }
  const st = buildStellation({ vertices, faces: g.f }, symmetry.I.matrices,
    { subMatrices: symmetry.I.matrices });
  const s2 = parseCellsAny(st, '{5(1)}');
  const me = extractMesh(selectedSubCells(st, s2), st.pool);
  const gO = subgroupOrbits(st, symmetry.I.matrices);
  const hO = subgroupOrbits(st, symmetry.T.matrices);
  const c2 = facetCosetClasses(st, symmetry.I.matrices, symmetry.T.matrices,
    selectedCells(st, s2), { split: true });
  const lab2 = { cosetL: labelerFor(c2), orbitF: (f) => (hO.facets.get(f) ?? 0) };

  const pr = surfaceAdjacency(st, me);
  ok(pr.length === 0, 'its spikes touch only at points — no adjacency at all');

  const r = mergeAdjacentFacetClasses(st, me, gO.facets, lab2, null);
  ok(r.stats.cosetL.classes === 20 && r.stats.cosetL.units === 20,
    `its 20 gH-classes all survive (got ${r.stats.cosetL.units} of ${r.stats.cosetL.classes})`);
  let relabeled = 0;
  me.facetRefs.forEach((f) => {
    if (JSON.stringify(r.labels.cosetL.get(f)) !== JSON.stringify(lab2.cosetL(f))) relabeled++;
  });
  ok(relabeled === 0,
    'nothing touching means nothing relabeled — T-orbits spanning four tetrahedra must not vote');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
