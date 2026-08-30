/*
 * Merged facet coloring: adjacent classes melt into solid regions,
 * EQUIVARIANTLY — every stop of the dial is a symmetric picture.
 *
 *   node docs/test/merge.mjs
 *
 * Three fixtures, each guarding a mistake actually made.
 *
 * The first is the figure the feature was asked for: a custom Oh arrangement
 * of 48 planes (one row, normal 1 0.3 0.6), colored by cosets of O per
 * facet — index 2, red and green confetti inside big triangular faces. Full
 * merge must leave each face solid in its MAJORITY coset (0 on one plane
 * orbit, 1 on the mirror orbit), the dial must hit its targets exactly, and
 * the identity setting must reproduce the raw reading byte for byte.
 *
 * The second is the compound of five tetrahedra under I/T. Its spikes touch
 * only at points, so there is no adjacency at all and the merge must change
 * nothing — which the first version failed: its units were facet orbits
 * under the coloring subgroup H, and T is not normal in I, so a T-orbit
 * spans four of the five tetrahedra and the "identity" quietly relabeled
 * the whole compound.
 *
 * The third is the same 48-plane figure under D3d(O) — index 4, and again
 * not normal. This is the fixture that forced the equivariant rewrite: with
 * global classes the surface chained into one component that majority-voted
 * everything a single color, and the one-at-a-time greedy merged the copies
 * of a face at different moments, so every intermediate setting was
 * lopsided. Now the merge runs on the quotient by the full group and a
 * majority TIE is worn as the blend of the tied labels (the only rule
 * symmetry cannot tell apart on different copies) — so every plane must
 * carry the same count-pattern at every K, and the floor must be an honest
 * four-coloring, not all red.
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

// the 48-plane figure both custom fixtures share
const ROWS = [{ normal: [1, 0.3, 0.6], distance: 1, symmetry: 'Oh' }];
const CELLS = '{0,1,2,3,4,5,6,7,8(0,2,3,4,5,6,7,8,9,10,11,12)'
  + '9(0,1,2,3,5,6,8,9,10,11,12)10(0,1,2,4,5,6,9,10,12,13,14)'
  + '11(0,2,4,5,7,8,9,10,12,14)12(0,2,4,7,9,12,14,15)13(0,4,7,8,9,11,13)'
  + '14(1,2,7,9,10,16)15(0,1,2,8,14)16(0,3,8,12,13)17(0,11)18(2)}';

function custom(subName, steer) {
  const planes = expandPlaneRows(normalizePlaneRows(ROWS), symmetry);
  const G = symmetry.Oh.matrices, H = symmetry[subName].matrices;
  const stel = buildStellation(null, G, {
    planes, subMatrices: G, maxIntersection: 20, maxLayer: 1000,
  });
  const sel = parseCellsAny(stel, CELLS);
  const mesh = extractMesh(selectedSubCells(stel, sel), stel.pool);
  const cl = facetCosetClasses(stel, G, H, selectedCells(stel, sel),
    { split: true, prevPlanes: steer });
  const gOrbits = subgroupOrbits(stel, G);
  const hOrbits = subgroupOrbits(stel, H);
  const planeOf = new Map();
  stel.arrangement.forEach((fs, p) => fs.forEach(f => planeOf.set(f, p)));
  return { stel, mesh, G, gOrbits, planeOf,
           lab: { cosetL: labelerFor(cl), orbitF: (f) => (hOrbits.facets.get(f) ?? 0) } };
}

/** how many distinct per-plane count-patterns the merged labels show — 1 = symmetric */
function planePatterns(ctx, map) {
  const per = new Map();
  ctx.mesh.facetRefs.forEach((f) => {
    const p = ctx.planeOf.get(f);
    let c = per.get(p);
    if (!c) per.set(p, c = new Map());
    const k = JSON.stringify(map.get(f));
    c.set(k, (c.get(k) || 0) + 1);
  });
  const vs = new Set();
  for (const c of per.values()) vs.add(JSON.stringify([...c.values()].sort((a, b) => a - b)));
  return vs.size;
}

// ------------------------------------------------- O: the red-green triangles

console.log('-- cosets of O: the figure the feature was asked for');
const co = custom('O', [...Array(48)].map((_, i) => (i < 24 ? 0 : 1)));

const pairs = surfaceAdjacency(co.stel, co.mesh);
ok(pairs.length > 0, `adjacency found (${pairs.length} pairs)`);
ok(pairs.every(([i, j]) =>
  co.planeOf.get(co.mesh.facetRefs[i]) === co.planeOf.get(co.mesh.facetRefs[j])
  && co.mesh.facetTop[i] === co.mesh.facetTop[j]),
  'every pair is same plane, same side');

const m = mergeAdjacentFacetClasses(co.stel, co.mesh, co.gOrbits.facets, co.G, co.lab, null);
ok(m.stats.cosetL.classes === 45,
  `45 kinds of piece up to symmetry (got ${m.stats.cosetL.classes})`);
ok(m.stats.cosetL.floor === 4,
  `floor 4 — big triangle, detached patch, two sliver kinds (got ${m.stats.cosetL.floor})`);
ok(m.stats.cosetL.units === 4, `full merge reaches the floor (got ${m.stats.cosetL.units})`);

const topWear = (p) => {
  const c = new Map();
  co.mesh.facetRefs.forEach((f, i) => {
    if (co.planeOf.get(f) !== p || !co.mesh.facetTop[i]) return;
    const k = JSON.stringify(m.labels.cosetL.get(f));
    c.set(k, (c.get(k) || 0) + 1);
  });
  return [...c.entries()].sort((a, b) => b[1] - a[1]);
};
ok(JSON.stringify(topWear(0)[0]) === '["0",40]',
  'the big triangle of the first orbit goes solid coset 0');
ok(JSON.stringify(topWear(24)[0]) === '["1",40]',
  'the big triangle of the mirror orbit goes solid coset 1');
ok(JSON.stringify(topWear(0)[1]) === '["[0,1]",2]',
  'the half-and-half detached patch honestly wears the blend');

const m20 = mergeAdjacentFacetClasses(co.stel, co.mesh, co.gOrbits.facets, co.G, co.lab, 20);
ok(m20.stats.cosetL.units === 20,
  `a colors target between floor and classes is hit exactly (got ${m20.stats.cosetL.units})`);
const mAll = mergeAdjacentFacetClasses(co.stel, co.mesh, co.gOrbits.facets, co.G, co.lab, 9999);
ok(mAll.stats.cosetL.units === 45, 'a target above the class count clamps to the identity');
{
  let diffs = 0;
  co.mesh.facetRefs.forEach((f) => {
    if (JSON.stringify(mAll.labels.cosetL.get(f)) !== JSON.stringify(co.lab.cosetL(f))) diffs++;
  });
  ok(diffs === 0, 'at the identity, merged labels equal the raw labels');
}
ok(mergeAdjacentFacetClasses(co.stel, co.mesh, co.gOrbits.facets, co.G, co.lab, 1)
  .stats.cosetL.units === 4, 'a target below the floor clamps to the floor');
{
  const a = mergeAdjacentFacetClasses(co.stel, co.mesh, co.gOrbits.facets, co.G, co.lab, 20);
  let same = a.stats.cosetL.units === m20.stats.cosetL.units;
  co.mesh.facetRefs.forEach((f) => {
    if (JSON.stringify(a.labels.cosetL.get(f)) !== JSON.stringify(m20.labels.cosetL.get(f))) same = false;
  });
  ok(same, 'the merge is deterministic');
}

// ------------------------------------- five tetrahedra: nothing touches, I/T

console.log('-- five tetrahedra: the non-normal identity');
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

  const r = mergeAdjacentFacetClasses(st, me, gO.facets, symmetry.I.matrices, lab2, null);
  ok(r.stats.cosetL.classes === 4 && r.stats.cosetL.units === 4,
    `4 kinds of piece up to symmetry, all surviving (got ${r.stats.cosetL.units} of ${r.stats.cosetL.classes})`);
  let relabeled = 0;
  me.facetRefs.forEach((f) => {
    if (JSON.stringify(r.labels.cosetL.get(f)) !== JSON.stringify(lab2.cosetL(f))) relabeled++;
  });
  ok(relabeled === 0,
    'nothing touching means nothing relabeled — T-orbits spanning four tetrahedra must not vote');
}

// --------------------------- D3d(O): the fixture that forced the equivariance

console.log('-- cosets of D3d(O): four colors, symmetric at every stop');
{
  // the labeling the failing document was saved wearing
  const steer = [1, 2, 3, 0, 2, 0, 3, 0, 2, 3, 3, 2, 3, 0, 1, 1, 2, 0, 1, 2, 0, 1, 1, 3,
                 3, 0, 1, 2, 0, 2, 1, 2, 0, 1, 1, 0, 1, 2, 3, 3, 0, 2, 3, 0, 2, 3, 3, 1];
  const dd = custom('D3d(O)', steer);
  const f0 = mergeAdjacentFacetClasses(dd.stel, dd.mesh, dd.gOrbits.facets, dd.G, dd.lab, null);
  ok(f0.stats.cosetL.floor === 4 && f0.stats.cosetL.units === 4,
    `floor 4 (got ${f0.stats.cosetL.units} of floor ${f0.stats.cosetL.floor})`);
  const worn = new Map();
  dd.mesh.facetRefs.forEach(f => {
    const k = JSON.stringify(f0.labels.cosetL.get(f));
    worn.set(k, (worn.get(k) || 0) + 1);
  });
  ok(worn.size === 4 && [...worn.values()].every(n => n === 540),
    `full merge is an honest four-coloring in exact quarters, not all one color (${
      [...worn.entries()].map(([k, n]) => k + ':' + n).join(' ')})`);
  // every plane fully solid at the floor
  ok(planePatterns(dd, f0.labels.cosetL) === 1, 'every plane wears the same pattern at the floor');
  for (const K of [8, 20, 33]) {
    const mk = mergeAdjacentFacetClasses(dd.stel, dd.mesh, dd.gOrbits.facets, dd.G, dd.lab, K);
    ok(mk.stats.cosetL.units === K && planePatterns(dd, mk.labels.cosetL) === 1,
      `K=${K}: hit exactly and symmetric on every plane`);
  }
  const idd = mergeAdjacentFacetClasses(dd.stel, dd.mesh, dd.gOrbits.facets, dd.G, dd.lab, 9999);
  let diffs = 0;
  dd.mesh.facetRefs.forEach((f) => {
    if (JSON.stringify(idd.labels.cosetL.get(f)) !== JSON.stringify(dd.lab.cosetL(f))) diffs++;
  });
  ok(diffs === 0, 'identity exact under the non-normal subgroup too');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
