/*
 * Every face of the boundary surface must know which side of it is solid.
 *
 *   node docs/test/facing.mjs
 *
 * A click in the 3D view turns into "add" or "remove" through mesh.faceInside /
 * mesh.faceOutside (see worker.js meshFor). For that to mean anything:
 *
 *   inside  is the SELECTED cell the face belongs to  — ctrl-click removes it
 *   outside is empty, or nothing at all               — shift-click adds it
 *
 * cellBelow / cellAbove are fixed geometric labels (inward / outward), so they
 * only line up with solid / empty when the facet caps its cell. On a bottom
 * facet — an underside, the ones extractMesh reverses the winding on — the
 * selected cell is the one above and the gap is below. Reading the pair the
 * same way round everywhere made both gestures silent no-ops on every
 * downward-facing face, which is the regression this guards.
 *
 * The cases below are chosen so that some have undersides and some do not: a
 * solid built outward from the core has none at all, which is why the bug hid.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildStellation, extractMesh, cellsAcrossFace } from '../js/core.js';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const geometry = JSON.parse(readFileSync(join(DATA, 'geometry.json'), 'utf8'));
const symmetry = JSON.parse(readFileSync(join(DATA, 'symmetry.json'), 'utf8'));

function loadPoly(key) {
  const g = geometry[key];
  if (!g) throw new Error('no such polyhedron: ' + key);
  const vertices = [];
  for (let i = 0; i < g.v.length; i += 3) vertices.push({ x: g.v[i], y: g.v[i + 1], z: g.v[i + 2] });
  return { vertices, faces: g.f };
}

// same key the worker sends to the UI
const key = s => s && `${s.layer}.${s.cellIndex}.${s.index}`;

function audit(name, sym, pick) {
  const stel = buildStellation(loadPoly(name), symmetry[sym].matrices, { maxLayer: 6 });
  const sel = pick(stel);
  if (!sel || !sel.length) return null;

  const selected = new Set();
  for (const o of sel) for (const c of o.cells) selected.add(key(c.owner));

  const mesh = extractMesh(sel, stel.pool);
  const r = { faces: mesh.faces.length, tops: 0, bottoms: 0, bad: 0 };

  mesh.faces.forEach((_, i) => {
    mesh.facetTop[i] ? r.tops++ : r.bottoms++;

    // the same call worker.js meshFor() makes, so a regression there fails here
    const { inside, outside } = cellsAcrossFace(mesh, i);
    const ins = key(inside), out = key(outside);

    if (!ins || !selected.has(ins)) r.bad++;        // nothing solid to remove
    else if (out && selected.has(out)) r.bad++;     // "outside" is solid too
  });
  return r;
}

const CASES = [
  ['u27', 'Ih', 'layers 0-1',      s => s.cellLayers.slice(0, 2).flat()],
  ['u27', 'Ih', 'layer 1 only',    s => s.cellLayers[1]],
  ['u27', 'Ih', 'layers 2-3 only', s => s.cellLayers.slice(2, 4).flat()],
  ['u27', 'Ih', 'first orbit L3',  s => (s.cellLayers[3] || []).slice(0, 1)],
  ['d29', 'Ih', 'layer 1 only',    s => s.cellLayers[1]],
  ['u28', 'Ih', 'layers 1-2',      s => s.cellLayers.slice(1, 3).flat()],
];

let pass = 0, fail = 0, bottomsSeen = 0;
const check = (label, ok, detail) => {
  if (ok) { pass++; console.log(`   ok   ${label}${detail ? ': ' + detail : ''}`); }
  else    { fail++; console.log(`   FAIL ${label}${detail ? ': ' + detail : ''}`); }
};

for (const [name, sym, label, pick] of CASES) {
  const r = audit(name, sym, pick);
  if (!r) { console.log(`\n=== ${name} ${label} ===\n   (empty selection, skipped)`); continue; }
  bottomsSeen += r.bottoms;
  console.log(`\n=== ${name} ${label} ===`);
  console.log(`   ${r.faces} faces (${r.tops} top, ${r.bottoms} underside)`);
  check('every face has solid inside / empty outside', r.bad === 0,
        r.bad === 0 ? 'all faces' : `${r.bad} of ${r.faces} faces wrong`);
}

// Without this the suite would pass trivially if undersides ever stopped being
// produced — and undersides are the only thing it is really testing.
console.log('');
check('the cases actually exercise undersides', bottomsSeen > 0, `${bottomsSeen} underside faces`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
