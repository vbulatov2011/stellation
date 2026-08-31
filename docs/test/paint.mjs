/*
 * Painted cosets propagate by color symmetry.
 *
 *   node docs/test/paint.mjs
 *
 * Painting a facet paints its whole orbit under the full group, each copy
 * taking the PERMUTED coset — the permutation read off the computed
 * labeling itself, through witnesses, never through explicit group theory.
 * The fixture is the D3d(O) four-coloring these gestures were asked for.
 *
 * The pins are the properties a person actually leans on. Painting a facet
 * with the label it already wears must reproduce the computed labeling
 * across the orbit — the brush agrees with the coloring about what the
 * coloring says. Painting one whole face with ITS plane's coset must turn
 * every face solid in its own plane's coset — the four-color model, made
 * by hand, matching the per-plane reading exactly. And painting any other
 * label must land every coset on exactly a quarter of the planes, which is
 * what a permutation does.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildStellation, extractMesh, parseCellsAny, selectedCells, selectedSubCells,
  facetCosetClasses, cosetClasses, paintOrbit,
} from '../lib/core.js';
import { normalizePlaneRows, expandPlaneRows } from '../app/js/preset.js';

let passed = 0, failed = 0;
const ok = (cond, label) => {
  if (cond) { passed++; console.log('   ok   ' + label); }
  else { failed++; console.log('   FAIL ' + label); }
};

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
const symmetry = JSON.parse(readFileSync(join(DOCS, 'data', 'symmetry.json'), 'utf8'));

const ROWS = [{ normal: [1, 0.3, 0.6], distance: 1, symmetry: 'Oh' }];
const CELLS = '{0,1,2,3,4,5,6,7,8(0,2,3,4,5,6,7,8,9,10,11,12)'
  + '9(0,1,2,3,5,6,8,9,10,11,12)10(0,1,2,4,5,6,9,10,12,13,14)'
  + '11(0,2,4,5,7,8,9,10,12,14)12(0,2,4,7,9,12,14,15)13(0,4,7,8,9,11,13)'
  + '14(1,2,7,9,10,16)15(0,1,2,8,14)16(0,3,8,12,13)17(0,11)18(2)}';
const STEER = [1, 2, 3, 0, 2, 0, 3, 0, 2, 3, 3, 2, 3, 0, 1, 1, 2, 0, 1, 2, 0, 1, 1, 3,
               3, 0, 1, 2, 0, 2, 1, 2, 0, 1, 1, 0, 1, 2, 3, 3, 0, 2, 3, 0, 2, 3, 3, 1];

const planes = expandPlaneRows(normalizePlaneRows(ROWS), symmetry);
const G = symmetry.Oh.matrices, H = symmetry['D3d(O)'].matrices;
const stel = buildStellation(null, G, {
  planes, subMatrices: G, maxIntersection: 20, maxLayer: 1000,
});
const sel = parseCellsAny(stel, CELLS);
const mesh = extractMesh(selectedSubCells(stel, sel), stel.pool);
const prefer = selectedCells(stel, sel);
const cl = facetCosetClasses(stel, G, H, prefer, { split: true, prevPlanes: STEER });
const co = cosetClasses(stel, G, H, prefer, STEER);
const rawLabel = (f) => {
  const k = cl.of.get(f);
  if (k != null && k >= 0) return k;
  const b = cl.blends && cl.blends.get(f);
  return b ? Array.from(b) : -1;
};
const facetAt = (key) => {
  const [p, i] = key.split('.').map(Number);
  return stel.arrangement[p][i];
};

// -------------------------------------------- painting what is already worn

const F = stel.arrangement[0].find(f => typeof rawLabel(f) === 'number' && rawLabel(f) >= 0);
{
  const r = paintOrbit(stel, G, rawLabel, F, new Set([rawLabel(F)]));
  ok(r.set.length === 48, `one gesture paints the whole orbit (${r.set.length} regions)`);
  ok(r.mixed === 0, 'nothing is forced into a mix on a free orbit');
  let diffs = 0;
  for (const [k, v] of r.set) {
    if (JSON.stringify(v) !== JSON.stringify(rawLabel(facetAt(k)))) diffs++;
  }
  ok(diffs === 0, 'painting the label already worn reproduces the computed labeling exactly');
}

// ------------------------------------- one face painted solid = four colors

{
  const k0 = co.planes[0];
  ok(typeof k0 === 'number' && k0 >= 0, `plane 0 wears a crisp coset (${k0})`);
  // the clicks a person makes: the facets of plane 0 that are on the surface
  const painted = new Map();
  for (const f of new Set(mesh.facetRefs.filter(x => x.plane === 0))) {
    const r = paintOrbit(stel, G, rawLabel, f, new Set([k0]));
    for (const [k, v] of r.set) painted.set(k, v);
  }
  const perPlane = new Map();
  let wrong = 0;
  for (const [k, v] of painted) {
    const p = Number(k.split('.')[0]);
    if (!perPlane.has(p)) perPlane.set(p, new Set());
    perPlane.get(p).add(JSON.stringify(v));
    if (v !== co.planes[p]) wrong++;
  }
  ok(perPlane.size === 48 && [...perPlane.values()].every(s => s.size === 1),
    'every plane comes out solid — one label per face');
  ok(wrong === 0,
    'and it is the plane\'s own coset: the hand-made four-coloring matches the per-plane reading');
  let missing = 0;
  for (const f of mesh.facetRefs) {
    if (!painted.has(f.plane + '.' + stel.arrangement[f.plane].indexOf(f))) missing++;
  }
  ok(missing === 0,
    'every surface facet of every face received its paint from that one face');
}

// ---------------------------------------------- a rotated label permutes

{
  const other = (rawLabel(F) + 1) % co.count;
  const r = paintOrbit(stel, G, rawLabel, F, new Set([other]));
  const byLabel = new Map();
  for (const [, v] of r.set) byLabel.set(v, (byLabel.get(v) || 0) + 1);
  ok(r.set.every(([, v]) => typeof v === 'number' && v >= 0),
    'a crisp brush stays crisp on a free orbit');
  ok(byLabel.size === co.count && [...byLabel.values()].every(n => n === 48 / co.count),
    `the permuted labels cover each coset equally (${[...byLabel.values()].join(',')})`);
}

// ------------------------------------------------------------- gray and auto

{
  const g = paintOrbit(stel, G, rawLabel, F, 'gray');
  ok(g.set.length === 48 && g.set.every(([, v]) => v === -1),
    'gray is fixed by the symmetry: the whole orbit goes gray');
  const e = paintOrbit(stel, G, rawLabel, F, 'auto');
  ok(e.del.length === 48 && e.set.length === 0,
    'auto erases the whole orbit');
  const keys = new Set(g.set.map(([k]) => k));
  ok(e.del.every(k => keys.has(k)), 'and exactly the keys the paint would have used');
}

// --------------------------------------------------------------- determinism

{
  const a = paintOrbit(stel, G, rawLabel, F, new Set([co.planes[0]]));
  const b = paintOrbit(stel, G, rawLabel, F, new Set([co.planes[0]]));
  ok(JSON.stringify(a) === JSON.stringify(b), 'the expansion is deterministic');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
