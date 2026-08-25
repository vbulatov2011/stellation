/*
 * The coset labeling follows the selection, and keeps following it.
 *
 *   node docs/test/coset-steer.mjs
 *
 * The icosahedron's twenty face planes carry the compound of five tetrahedra
 * in two hands. Both are partitions into five sets of four; the group cannot
 * choose between them, because it maps one onto the other. cosetClasses picks
 * with the figure on screen: of the candidate labelings it takes the one that
 * leaves the fewest SELECTED cells wearing more than one color, so a compound
 * comes out five solid tetrahedra rather than a mess of four-colored ones.
 *
 * The steering is therefore only as current as the selection it was given.
 * That is the bug this file exists for: the app sent the selection when the
 * subgroup changed, when the mode changed and when a document opened, but not
 * when the user toggled a cell — so turning 5.2 off and 5.1 on kept the
 * labeling steered by 5.2, and the tetrahedra came out multicolored. Saving
 * and reopening fixed it, which is the tell: the document was right and the
 * screen was stale.
 *
 * The checks below are the two halves of that. First that steering works at
 * all — each hand, labeled under its own selection, is five solid tetrahedra.
 * Then that it is not sticky: the labeling for one hand, judged against the
 * other, is measurably worse, so a stale steer cannot go unnoticed.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildStellation, facePlanes, suggestDepth, cosetClasses,
         parseCellsAny, selectedCells } from '../lib/core.js';

let passed = 0, failed = 0;
const ok = (cond, label) => {
  if (cond) { passed++; console.log('   ok   ' + label); }
  else { failed++; console.log('   FAIL ' + label); }
};

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
const geometry = JSON.parse(readFileSync(join(DOCS, 'data', 'geometry.json'), 'utf8'));
const symmetry = JSON.parse(readFileSync(join(DOCS, 'data', 'symmetry.json'), 'utf8'));

const g = geometry.u27;                       // icosahedron
const vertices = [];
for (let i = 0; i < g.v.length; i += 3) vertices.push({ x: g.v[i], y: g.v[i + 1], z: g.v[i + 2] });
const poly = { vertices, faces: g.f };
const stel = buildStellation(poly, symmetry.I.matrices,
  { subMatrices: symmetry.I.matrices, maxIntersection: suggestDepth(facePlanes(poly)) });

const cellsOf = (str) => selectedCells(stel, parseCellsAny(stel, str));
const label = (prefer) => cosetClasses(stel, symmetry.I.matrices, symmetry.T.matrices, prefer);

/** how many of these cells wear more than one color, and by how much */
const mixed = (res, cells) => {
  let score = 0, bad = 0;
  for (const c of cells) {
    const seen = new Set();
    for (const f of c.top || []) {
      const k = res.planes[f.plane];   // f.plane is the index, as cosetClasses uses it
      if (k !== undefined && k >= 0) seen.add(k);
    }
    if (seen.size > 1) { bad++; score += seen.size - 1; }
  }
  return { score, bad };
};

// the two hands: shell 5, one orbit each. Same twenty planes, mirror figures.
const HANDS = ['{5(1)}', '{5(2)}'];
const cells = HANDS.map(cellsOf);

console.log('\n-- the two hands are there at all');
cells.forEach((cs, i) => ok(cs.length > 0, `${HANDS[i]} selects cells (got ${cs.length})`));
ok(cells[0].length === cells[1].length,
   `both hands are the same size (${cells[0].length} vs ${cells[1].length})`);

console.log('\n-- steered by its own selection, each hand is solid');
const own = cells.map(cs => label(cs));
own.forEach((res, i) => {
  ok(res.count === 5, `${HANDS[i]}: five colors (got ${res.count})`);
  const m = mixed(res, cells[i]);
  ok(m.bad === 0, `${HANDS[i]}: no cell wears two colors (${m.bad} do, score ${m.score})`);
});

console.log('\n-- the steer is not interchangeable: the other hand pays for it');
/*
 * The point of the test. If both hands scored the same the steering would be
 * doing nothing and the app's staleness would be harmless; the labeling that
 * suits one hand must actually be worse for the other, and by exactly the
 * amount the user sees as a four-colored tetrahedron.
 */
for (const [i, j] of [[0, 1], [1, 0]]) {
  const m = mixed(own[i], cells[j]);
  ok(m.bad > 0,
     `${HANDS[i]}'s labeling leaves ${HANDS[j]} multicolored (${m.bad} cells, score ${m.score})`);
}

console.log('\n-- and re-steering repairs it, which is what the fix must do');
for (const [i, j] of [[0, 1], [1, 0]]) {
  const stale = mixed(own[i], cells[j]);
  const fresh = mixed(label(cells[j]), cells[j]);
  ok(fresh.bad === 0 && fresh.bad < stale.bad,
     `${HANDS[j]} relabeled for itself is clean again (${stale.bad} → ${fresh.bad})`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
