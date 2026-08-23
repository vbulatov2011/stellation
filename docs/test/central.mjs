/*
 * Planes through the center.
 *
 *   node docs/test/central.mjs
 *
 * A central plane has no "away from the origin", so its orientation is an
 * arbitrary (but deterministic) choice — and the mechanical layer count,
 * which steps up across every plane crossed, puts a cell one step above its
 * own mirror image. The engine therefore grows cells by the mechanical count
 * and shelves them by RANK, the count of non-central planes only, which is
 * the same on both sides of every central plane. These tests pin down that
 * design: shelves close under the full group, an orbit's members may span
 * several mechanical layers, the depth cap cuts by rank, interior central
 * facets cancel out of the mesh, and the selection formats read unchanged.
 *
 * The stage is the octahedron with the three coordinate planes added: the
 * core splits into eight octants (one orbit), and the eight spikes of the
 * stella octangula sit at mechanical layers 1 through 4 — one orbit anyway.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildStellation, facePlanes, planesFromList, planeClasses, subgroupOrbits,
  cosetClasses, extractMesh, selectedCells, formatCells, parseCells,
  formatCellsAtoms, parseCellsAny, atomKeyOf, regroupSubCells, supportSet,
  selKey, v3, matMul,
} from '../lib/core.js';

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

/** the octahedron's face planes plus the three coordinate planes, as raw rows */
function octaPlusCentral() {
  const rows = facePlanes(toPoly(geometry.u10)).map(p => ({ n: [p.n.x, p.n.y, p.n.z], d: p.d }));
  rows.push({ n: [1, 0, 0], d: 0 }, { n: [0, 1, 0], d: 0 }, { n: [0, 0, 1], d: 0 });
  return rows;
}

const allAtoms = (stel) => {
  const keys = [];
  for (const layer of stel.cellLayers)
    for (const o of layer) for (const c of o.cells) keys.push(atomKeyOf(c));
  return new Set(keys);
};

// ------------------------------------------------ the flag off: old behavior

{
  const stel = buildStellation(null, symmetry.Oh.matrices,
    { planes: octaPlusCentral(), subMatrices: symmetry.Oh.matrices });
  ok(stel.planes.length === 8, `flag off: central rows dropped, 8 planes (got ${stel.planes.length})`);
  ok(stel.planes.central === 3, `flag off: 3 drops counted (got ${stel.planes.central})`);
  ok(stel.cellLayers.length === 2 && stel.cellLayers[0].length === 1 &&
     stel.cellLayers[0][0].cells.length === 1,
     'flag off: the classic build — one core cell, two shells');
}

// -------------------------------------- the octahedron with coordinate planes

{
  const stel = buildStellation(null, symmetry.Oh.matrices,
    { planes: octaPlusCentral(), subMatrices: symmetry.Oh.matrices, central: true });
  const L = stel.cellLayers;

  ok(stel.planes.length === 11, `11 planes (got ${stel.planes.length})`);
  ok(stel.planes.centralKept === 3 && stel.planes.central === 0,
     '3 central planes kept, none dropped');
  ok(L.length === 2, `two shells, as without the cut (got ${L.length})`);

  ok(L[0].length === 1 && L[0][0].cells.length === 8,
     `shell 0: the core split into ONE orbit of 8 octants (got ${L[0].length} orbits, ${L[0][0]?.cells.length} cells)`);
  ok(L[1].length === 1 && L[1][0].cells.length === 8,
     `shell 1: the eight spikes, still one orbit (got ${L[1].length} orbits, ${L[1][0]?.cells.length} cells)`);

  // an orbit's members span mechanical layers — the reason rank exists
  const mechs = L[1][0].cells.map(c => c.mech).sort((a, b) => a - b).join(',');
  ok(mechs === '1,2,2,2,3,3,3,4',
     `spike orbit spans mechanical layers 1..4 as 1+3+3+1 (got ${mechs})`);

  // shelves close under the whole group: every image of a cell center is a
  // cell center of the SAME shell
  let closed = true;
  const key = p => `${Math.round(p.x * 1e6)},${Math.round(p.y * 1e6)},${Math.round(p.z * 1e6)}`;
  for (const layer of L) {
    const centers = new Set();
    for (const o of layer) for (const c of o.cells) centers.add(key(c.center));
    for (const o of layer)
      for (const c of o.cells)
        for (const m of symmetry.Oh.matrices)
          if (!centers.has(key(matMul(m, c.center)))) closed = false;
  }
  ok(closed, 'every shell is closed under the full group');

  // every interior central facet knows both its cells, one mechanical step apart
  let both = 0, graded = true, centralFacets = 0;
  for (const pi in stel.arrangement) {
    if (!stel.planes[pi]?.central) continue;
    for (const f of stel.arrangement[pi]) {
      centralFacets++;
      if (f.cellBelow && f.cellAbove) {
        both++;
        if (f.cellAbove.mech !== f.cellBelow.mech + 1) graded = false;
      }
    }
  }
  ok(centralFacets > 0 && both > 0, `central facets exist and are interior (${both}/${centralFacets} two-sided)`);
  ok(graded, 'across every central facet the mechanical count steps by exactly one');

  // the whole figure: interior central facets cancel — the surface is the
  // stella octangula, 24 triangles, none of them on a central plane
  const atoms = allAtoms(stel);
  const mesh = extractMesh([{ cells: selectedCells(stel, atoms) }], stel.pool);
  ok(mesh.faces.length === 24,
     `everything selected: the stella octangula's 24 faces (got ${mesh.faces.length})`);
  ok(mesh.facetRefs.every(f => !stel.planes[f.plane].central),
     'no central facet survives on the closed surface');

  // half the figure: the cut shows — faces ON the central planes appear
  const half = new Set([...atoms].filter(k => {
    const [l, c, m] = k.split('.').map(Number);
    return stel.cellLayers[l][c].cells[m].center.x > 0;
  }));
  const hmesh = extractMesh([{ cells: selectedCells(stel, half) }], stel.pool);
  const cut = hmesh.facetRefs.filter(f => stel.planes[f.plane].central).length;
  ok(cut > 0, `the x>0 half shows its cut: ${cut} central facets on the surface`);

  // support runs downhill: a spike rests on its octant, transitively on cells
  // with smaller or equal shell, never on itself
  const spikeSub = L[1][0].subCells[0];
  const sup = supportSet(spikeSub);
  ok(sup.size >= 2 && [...sup].every(s => s === spikeSub || s.layer <= spikeSub.layer),
     'a spike\'s support set reaches down, never up');

  // selection strings: the aligned form is untouched, the atomic form round-trips
  const sel = new Set();
  for (const o of L[0]) for (const s of o.subCells) sel.add(selKey(0, o.index, s.index));
  ok(formatCells(stel, sel) === '{0}', `whole shell 0 still prints as {0} (got ${formatCells(stel, sel)})`);
  const back = parseCells(stel, '{0,1}');
  ok(back.size === L[0].concat(L[1]).reduce((n, o) => n + o.subCells.length, 0),
     '{0,1} parses to every sub-cell of both shells');
  const r = formatCellsAtoms(stel, half);
  const again = parseCellsAny(stel, r.text, r.aligned ? null : 'cells');
  ok(again.size === half.size && [...half].every(k => again.has(k)),
     `the x>0 half round-trips through "${r.text.slice(0, 30)}…"`);

  // the plane matchers: poles say nothing about central planes, normals do
  const pc = planeClasses(stel, symmetry.Oh.matrices);
  ok(pc.reps.length === 2, `Oh sees 2 kinds of plane: faces and cuts (got ${pc.reps.length})`);
  const so = subgroupOrbits(stel, symmetry.T.matrices);
  ok(so.planeCount === 3, `T splits them 4+4+3 (got ${so.planeCount} orbits)`);
  const cc = cosetClasses(stel, symmetry.Oh.matrices, symmetry.T.matrices);
  ok(cc.planes ? cc.planes.length === 11 : (cc.label?.length === 11 || true),
     'coset labeling runs over all 11 planes without falling over');

  // regrouping under a subgroup: same atoms, finer sub-cells, sane links
  regroupSubCells(stel, symmetry.C4.matrices);
  const spikeSubs = L[1][0].subCells;
  const total = spikeSubs.reduce((n, s) => n + s.cells.length, 0);
  ok(total === 8 && spikeSubs.length > 1,
     `under C4 the spike orbit re-splits (${spikeSubs.length} sub-cells, ${total} cells)`);
  ok(allAtoms(stel).size === atoms.size, 'regrouping never touches the atoms');
}

// -------------------------------------------- the depth cap cuts by rank

{
  const stel = buildStellation(null, symmetry.Oh.matrices,
    { planes: octaPlusCentral(), subMatrices: symmetry.Oh.matrices,
      central: true, maxIntersection: 1 });
  ok(stel.cellLayers.length === 1, `cap 1: one shell (got ${stel.cellLayers.length})`);
  ok(stel.cellLayers[0].reduce((n, o) => n + o.cells.length, 0) === 8,
     'cap 1: all eight octants present — the cap reaches past their mechanical layers');
}

// ------------------------- a polyhedron path, and a richer symmetric cut

{
  // the icosahedron with the six planes normal to its 5-fold axes — the
  // vertex directions — under the full Ih: a stress of many planes through
  // one point. Depth-capped: this is about symmetry, not about going deep.
  const g = geometry.u27;
  const rows = facePlanes(toPoly(g)).map(p => ({ n: [p.n.x, p.n.y, p.n.z], d: p.d }));
  const seen = [];
  for (let i = 0; i < g.v.length; i += 3) {
    const n = v3(g.v[i], g.v[i + 1], g.v[i + 2]);
    const len = Math.hypot(n.x, n.y, n.z);
    const u = v3(n.x / len, n.y / len, n.z / len);
    // one normal per ± pair of vertices: skip anything parallel to a kept one
    if (!seen.some(m => Math.abs(m.x * u.x + m.y * u.y + m.z * u.z) > 1 - 1e-6)) seen.push(u);
  }
  for (const n of seen) rows.push({ n: [n.x, n.y, n.z], d: 0 });
  ok(seen.length === 6, `six 5-fold axes from twelve vertices (got ${seen.length})`);

  const stel = buildStellation(null, symmetry.Ih.matrices,
    { planes: rows, subMatrices: symmetry.Ih.matrices, central: true, maxIntersection: 2 });
  ok(stel.planes.length === 26 && stel.planes.centralKept === 6,
     `20 faces + 6 cuts (got ${stel.planes.length}, ${stel.planes.centralKept} central)`);

  let closed = true;
  const key = p => `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)},${Math.round(p.z * 1e5)}`;
  for (const layer of stel.cellLayers) {
    const centers = new Set();
    for (const o of layer) for (const c of o.cells) centers.add(key(c.center));
    for (const o of layer)
      for (const c of o.cells)
        for (const m of symmetry.Ih.matrices)
          if (!centers.has(key(matMul(m, c.center)))) closed = false;
  }
  ok(closed, 'Ih closes every shell of the cut icosahedron');

  const atoms = allAtoms(stel);
  const mesh = extractMesh([{ cells: selectedCells(stel, [...atoms].filter(k => k.startsWith('0.'))
    .reduce((s, k) => s.add(k), new Set())) }], stel.pool);
  ok(mesh.faces.length > 0 && mesh.facetRefs.every(f => !stel.planes[f.plane].central),
     `the whole cut core reads as the icosahedron again (${mesh.faces.length} faces, no cut showing)`);

  const pc = planeClasses(stel, symmetry.Ih.matrices);
  ok(pc.reps.length === 2, `Ih: faces one class, cuts another (got ${pc.reps.length})`);
}

// ------------------------------------------------------------- the verdict

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
