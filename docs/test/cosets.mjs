/*
 * Coset colouring produces the classical pictures.
 *
 *   node docs/test/cosets.mjs
 *
 * The decisive case is the one the construction generalises: the tetrahedral
 * subgroup T inside the icosahedral rotation group I has index 5, and the
 * icosahedron's twenty first-shell cells must fall into five classes of four —
 * the five inscribed tetrahedra. That is checkable geometrically, not just by
 * counting: the four cell centres of one class must be mutually equidistant,
 * because they sit over the faces of a regular tetrahedron. If the classes
 * come out as anything else — five arbitrary quadruples would pass a counting
 * test — the geometry fails.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildStellation, facePlanes, suggestDepth, cosetClasses } from '../lib/core.js';

let passed = 0, failed = 0;
const ok = (cond, label) => {
  if (cond) { passed++; console.log('   ok   ' + label); }
  else { failed++; console.log('   FAIL ' + label); }
};

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
const geometry = JSON.parse(readFileSync(join(DOCS, 'data', 'geometry.json'), 'utf8'));
const symmetry = JSON.parse(readFileSync(join(DOCS, 'data', 'symmetry.json'), 'utf8'));
const g = geometry.u27;
const vertices = [];
for (let i = 0; i < g.v.length; i += 3) vertices.push({ x: g.v[i], y: g.v[i + 1], z: g.v[i + 2] });
const poly = { vertices, faces: g.f };
const DEPTH = suggestDepth(facePlanes(poly));

const build = (G, H) => buildStellation(poly, symmetry[G].matrices,
  { subMatrices: symmetry[H].matrices, maxIntersection: DEPTH });

const classesOf = (stel, res, layer) => {
  const by = new Map();
  for (const o of stel.cellLayers[layer]) {
    for (const c of o.cells) {
      const k = res.of.get(c);
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(c);
    }
  }
  return by;
};

// ------------------------------------------------- I / T: the five tetrahedra

{
  const stel = build('I', 'T');
  const res = cosetClasses(stel, symmetry.I.matrices, symmetry.T.matrices);
  ok(res.count === 5, `[I : T] = 5 — the colouring uses five colours (got ${res.count})`);

  // the shell of twenty cells, one over each face
  const shell = stel.cellLayers.find(l =>
    l.reduce((n, o) => n + o.cells.length, 0) === 20);
  ok(!!shell, 'there is a shell of twenty cells');
  const layerIdx = stel.cellLayers.indexOf(shell);
  const by = classesOf(stel, res, layerIdx);

  ok(!by.has(-1), 'none of the twenty is gray');
  ok(by.size === 5, `they take five classes (got ${by.size})`);
  ok([...by.values()].every(cells => cells.length === 4), 'four cells each');

  /*
   * The geometry: each class's four centres are the face centres of one
   * inscribed tetrahedron, so all six pairwise distances within a class are
   * equal — and that common distance is the same for every class.
   */
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  let regular = true, common = null;
  for (const cells of by.values()) {
    const dist = [];
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) dist.push(d(cells[i].center, cells[j].center));
    const ref = dist[0];
    if (!dist.every(v => Math.abs(v - ref) < 1e-6)) regular = false;
    if (common === null) common = ref;
    else if (Math.abs(ref - common) > 1e-6) regular = false;
  }
  ok(regular, 'each class is a regular tetrahedron of cell centres — the five-tetrahedra colouring');

  // every cell everywhere is either labelled in range or gray
  for (const layer of stel.cellLayers) {
    for (const o of layer) for (const c of o.cells) {
      const k = res.of.get(c);
      if (!(k === -1 || (k >= 0 && k < res.count))) {
        ok(false, 'a cell escaped the labelling'); regular = null; break;
      }
    }
  }
  if (regular !== null) ok(true, 'every cell in the arrangement is labelled or gray');
}

// -------------------------------------- I / C5: stabilisers the cosets cannot hold

{
  const stel = build('I', 'C5(I)');
  const res = cosetClasses(stel, symmetry.I.matrices, symmetry['C5(I)'].matrices);
  ok(res.count === 12, `[I : C5(I)] = 12 (got ${res.count})`);
  const shell = stel.cellLayers.find(l =>
    l.reduce((n, o) => n + o.cells.length, 0) === 20);
  const by = classesOf(stel, res, stel.cellLayers.indexOf(shell));
  /*
   * A first-shell cell's stabiliser is the C3 about its own axis, and no
   * conjugate of C3 fits inside C5 — so no representative exists and the
   * whole shell is honestly gray, rather than wrongly coloured.
   */
  ok(by.size === 1 && by.has(-1), 'the twenty-cell shell is gray under C5(I) — its C3 stabilisers fit no coset');
}

// ------------------------------------------- Ih / Ih: the degenerate index 1

{
  const stel = build('Ih', 'Ih');
  const res = cosetClasses(stel, symmetry.Ih.matrices, symmetry.Ih.matrices);
  ok(res.count === 1, '[Ih : Ih] = 1');
  let colours = new Set();
  for (const layer of stel.cellLayers) {
    for (const o of layer) for (const c of o.cells) colours.add(res.of.get(c));
  }
  ok([...colours].every(k => k === 0 || k === -1),
     'under the whole group everything is the one colour, or invariant-gray');
}

// -------------------------------------------------- Ih / T: reflections in the way

{
  const stel = build('Ih', 'T');
  const res = cosetClasses(stel, symmetry.Ih.matrices, symmetry.T.matrices);
  ok(res.count === 10, `[Ih : T] = 10 (got ${res.count})`);
  const shell = stel.cellLayers.find(l =>
    l.reduce((n, o) => n + o.cells.length, 0) === 20);
  const by = classesOf(stel, res, stel.cellLayers.indexOf(shell));
  /*
   * Under the FULL group each first-shell cell is stabilised by C3v — three
   * rotations and three mirrors — and T holds no mirror, so the colouring
   * cannot exist. Under I it does (above); the difference is the whole point
   * of choosing the polyhedron group deliberately.
   */
  ok(by.size === 1 && by.has(-1), 'under Ih with mirrors in the stabiliser, T leaves the shell gray');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
