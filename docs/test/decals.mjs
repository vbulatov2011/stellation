/*
 * Decals: images placed on a plane orbit and replicated by its stabilizer.
 *
 *   node docs/test/decals.mjs
 *
 * The pins: the stabilizer has the order the group says (a cube face: 8
 * under Oh, 4 under O, 1 under E); the copies a decal makes are invariant
 * under the whole group — for every g the copies on g's image of a plane are
 * g's images of the copies on the plane; a placement reads back from its map
 * unchanged; the diagram's frame and the chart agree through an isometry;
 * a placement survives a round trip through a reflecting frame; and a
 * change of symmetry group transports decals without changing a single copy
 * on the solid.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildStellation, planeOrbits, planeMatcher, matMul, createDiagram, selectedCells,
} from '../lib/core.js';
import {
  decalTransform, decomposeTransform, decalCopies, diagramToChart, chartChange,
  decalToLocal, localToDecal, transportDecals, affApply, affMul, affInv, makeDecal,
} from '../lib/decals.js';
import { normalizePlaneRows, expandPlaneRows } from '../app/js/preset.js';

let passed = 0, failed = 0;
const ok = (cond, label) => {
  if (cond) { passed++; console.log('   ok   ' + label); }
  else { failed++; console.log('   FAIL ' + label); }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
const symmetry = JSON.parse(readFileSync(join(DOCS, 'data', 'symmetry.json'), 'utf8'));

// a cube: the six face planes under Oh
const ROWS = [{ normal: [0, 0, 1], distance: 1, symmetry: 'Oh' }];
const planes = expandPlaneRows(normalizePlaneRows(ROWS), symmetry);
const Oh = symmetry.Oh.matrices, O = symmetry.O.matrices, E = symmetry.E.matrices;
const stel = buildStellation(null, Oh, {
  planes, subMatrices: Oh, maxIntersection: 20, maxLayer: 1000,
});
const mapPlane = planeMatcher(stel.planes);
const orbOh = planeOrbits(stel, Oh), orbO = planeOrbits(stel, O), orbE = planeOrbits(stel, E);

ok(stel.planes.length === 6, `six planes (${stel.planes.length})`);
ok(orbOh.orbits.length === 1 && orbOh.orbits[0].stab.length === 8,
  `one orbit under Oh, stabilizer of order 8 (${orbOh.orbits[0].stab.length})`);
ok(orbO.orbits.length === 1 && orbO.orbits[0].stab.length === 4,
  `one orbit under O, stabilizer of order 4 (${orbO.orbits[0].stab.length})`);
ok(orbE.orbits.length === 6 && orbE.orbits.every(o => o.stab.length === 1),
  'six orbits under E, each its own stabilizer of one');

// stabilizer maps are orthogonal: rotations and reflections of the chart
{
  let bad = 0;
  for (const S of orbOh.orbits[0].stab) {
    const det = S[0] * S[3] - S[1] * S[2];
    if (!near(Math.abs(det), 1) || !near(S[0] * S[0] + S[2] * S[2], 1) ||
        !near(S[0] * S[1] + S[2] * S[3], 0)) bad++;
  }
  const refl = orbOh.orbits[0].stab.filter(S => S[0] * S[3] - S[1] * S[2] < 0).length;
  ok(bad === 0 && refl === 4, `stabilizer maps are orthogonal, four of them reflections (${refl})`);
}

// a copy on plane j, in world coordinates: the images of three image-space points
const world = (orb, j, C) => {
  const ch = orb.charts[j], m = ch.m;
  const back = ([u, v]) => {
    const x = u + ch.ox, y = v + ch.oy, z = ch.z;
    return [m[0] * x + m[3] * y + m[6] * z, m[1] * x + m[4] * y + m[7] * z, m[2] * x + m[5] * y + m[8] * z];
  };
  return [[0, 0], [1, 0], [0, 1]].flatMap(([qx, qy]) => back(affApply(C, qx, qy)));
};
const sameSets = (A, B) => A.length === B.length && A.every(a =>
  B.some(b => a.every((x, i) => near(x, b[i], 1e-6))));
const worldCopies = (orb, decalsByRep, j) => {
  const o = orb.orbits[orb.orbitOf[j]];
  const list = decalsByRep.get(o.rep) || [];
  return decalCopies(o, list).copies.map(c => world(orb, j, c.C));
};
const gImage = (g, pts) => {
  const out = [];
  for (let i = 0; i < pts.length; i += 3) {
    const p = matMul(g, { x: pts[i], y: pts[i + 1], z: pts[i + 2] });
    out.push(p.x, p.y, p.z);
  }
  return out;
};

const decal = makeDecal({ file: 'a.png', x: 0.3, y: 0.15, size: 0.4, angle: 20, z: 1, tiltAngle: 30, tilt: 0.5 });

// the heart: the family of copies is invariant under the whole group
for (const [name, G, orb] of [['Oh', Oh, orbOh], ['O', O, orbO]]) {
  const decals = new Map([[orb.orbits[0].rep, [decal]]]);
  let bad = 0;
  for (let j = 0; j < 6; j++) {
    const here = worldCopies(orb, decals, j);
    for (const g of G) {
      const k = mapPlane(g, j);
      if (!sameSets(worldCopies(orb, decals, k), here.map(c => gImage(g, c)))) bad++;
    }
  }
  ok(bad === 0, `under ${name} every group element carries the copies of a plane onto its image's copies`);
  ok(worldCopies(orb, decals, 0).length === orb.orbits[0].stab.length,
    `under ${name} a decal makes ${orb.orbits[0].stab.length} copies per face`);
}

// a placement reads back from its own map
{
  const s = 1.7, aspect = 2;
  const d = makeDecal({ x: -0.2, y: 0.4, size: 0.6, angle: -75, flip: true });
  const r = decomposeTransform(decalTransform(d, s, aspect), s, aspect);
  ok(near(r.x, d.x) && near(r.y, d.y) && near(r.size, d.size) && near(r.angle, d.angle) && r.flip === true,
    'x, y, size, angle and flip read back from the placement map');
}

// the diagram frame and the chart agree through an isometry, on every plane
{
  let bad = 0, offOrigin = 0;
  const coreVerts = (j) => {
    const f = stel.arrangement[j].find(f => (f.rank ?? f.layer) === 0);
    return f.v.map(id => stel.pool.get(id));
  };
  for (let j = 0; j < 6; j++) {
    const dia = createDiagram(stel, j, [{ cells: selectedCells(stel, new Set()) }], 0);
    const B = diagramToChart(dia.frame, orbOh.charts[j]);
    const det = B[0] * B[4] - B[1] * B[3];
    if (!near(Math.abs(det), 1) || !near(B[0] * B[0] + B[3] * B[3], 1)) bad++;
    const [ox, oy] = affApply(B, 0, 0);
    if (Math.hypot(ox, oy) > 1e-6) offOrigin++;
    const R = dia.frame.R, c = dia.frame.center, ch = orbOh.charts[j];
    for (const v of coreVerts(j)) {
      const p = { x: v.x - c[0], y: v.y - c[1], z: v.z - c[2] };
      const q = matMul(R, p);
      const [u1, v1] = affApply(B, q.x, q.y);
      const u0 = ch.m[0] * v.x + ch.m[1] * v.y + ch.m[2] * v.z - ch.ox;
      const v0 = ch.m[3] * v.x + ch.m[4] * v.y + ch.m[5] * v.z - ch.oy;
      if (!near(u1, u0) || !near(v1, v0)) bad++;
    }
  }
  ok(bad === 0, 'diagram coordinates reach the chart through an isometry, vertex by vertex');
  ok(offOrigin === 0, 'the diagram origin is the pole on every face');
}

// a placement survives the round trip through a reflecting frame
{
  const B = [0.6, 0.8, 0.3, 0.8, -0.6, -0.2];      // a reflection plus a shift
  const s = 1.3;
  const d = makeDecal({ x: 0.25, y: -0.1, size: 0.5, angle: 40, flip: false });
  const local = decalToLocal(d, B, s);
  const back = localToDecal(local, B, s);
  ok(local.flip === true && near(local.size, d.size),
    'seen through a reflection the placement is mirrored, its size kept');
  ok(near(back.x, d.x) && near(back.y, d.y) && near(back.angle, d.angle) && back.flip === false,
    'and writes back exactly');
  const T = decalTransform(d, s), L = decalTransform(local, s);
  ok([[0, 0], [1, 0.5], [-1, -1]].every(([x, y]) => {
    const a = affApply(T, x, y), b = affApply(B, ...affApply(L, x, y));
    return near(a[0], b[0]) && near(a[1], b[1]);
  }), 'the local map is the decal map conjugated by the frame change');
}

// chartChange: the same plane under two groups
{
  let bad = 0;
  for (let j = 0; j < 6; j++) {
    const B = chartChange(orbOh.charts[j], orbO.charts[j]);
    const ch0 = orbOh.charts[j], ch1 = orbO.charts[j];
    for (const f of stel.arrangement[j]) {
      for (const id of f.v) {
        const v = stel.pool.get(id);
        const u0 = ch0.m[0] * v.x + ch0.m[1] * v.y + ch0.m[2] * v.z - ch0.ox;
        const v0 = ch0.m[3] * v.x + ch0.m[4] * v.y + ch0.m[5] * v.z - ch0.oy;
        const u1 = ch1.m[0] * v.x + ch1.m[1] * v.y + ch1.m[2] * v.z - ch1.ox;
        const v1 = ch1.m[3] * v.x + ch1.m[4] * v.y + ch1.m[5] * v.z - ch1.oy;
        const [bu, bv] = affApply(B, u0, v0);
        if (!near(bu, u1) || !near(bv, v1)) bad++;
      }
    }
  }
  ok(bad === 0, 'chartChange carries the Oh chart of a plane onto its O chart');
}

// transport: a change of group never changes a copy on the solid
{
  const fromOh = new Map([[orbOh.orbits[0].rep, [decal]]]);
  const toO = transportDecals(orbOh, orbO, fromOh);
  ok(toO.get(orbO.orbits[0].rep)?.length === 2, 'Oh → O: eight copies become two decals of four');
  let same = true;
  for (let j = 0; j < 6; j++) if (!sameSets(worldCopies(orbOh, fromOh, j), worldCopies(orbO, toO, j))) same = false;
  ok(same, 'Oh → O: every face wears exactly the copies it had');

  const backOh = transportDecals(orbO, orbOh, toO);
  ok(backOh.get(orbOh.orbits[0].rep)?.length === 1, 'O → Oh: the two decals merge back into one');
  same = true;
  for (let j = 0; j < 6; j++) if (!sameSets(worldCopies(orbOh, fromOh, j), worldCopies(orbOh, backOh, j))) same = false;
  ok(same, 'O → Oh: still the same copies');

  const toE = transportDecals(orbOh, orbE, fromOh);
  ok(toE.size === 6 && [...toE.values()].every(l => l.length === 8), 'Oh → E: eight decals on each of six planes');
  same = true;
  for (let j = 0; j < 6; j++) if (!sameSets(worldCopies(orbOh, fromOh, j), worldCopies(orbE, toE, j))) same = false;
  ok(same, 'Oh → E: the copies are untouched');
  const backFromE = transportDecals(orbE, orbOh, toE);
  ok(backFromE.get(orbOh.orbits[0].rep)?.length === 1, 'E → Oh: forty-eight decals fold back into one');

  // symmetrizing: one decal on one plane under E, then Oh
  const oneE = new Map([[0, [decal]]]);
  const sym = transportDecals(orbE, orbOh, oneE);
  const n = worldCopies(orbOh, sym, 3).length;
  ok(sym.get(orbOh.orbits[0].rep)?.length === 1 && n === 8,
    `E → Oh: a decal on one face is symmetrized onto every face (${n} copies on face 3)`);
  const c0 = worldCopies(orbE, oneE, 0)[0];
  ok(worldCopies(orbOh, sym, 0).some(c => c.every((x, i) => near(x, c0[i]))),
    'and the original copy is among them');
}

// transported decals keep what is not geometry
{
  const fromOh = new Map([[orbOh.orbits[0].rep, [decal]]]);
  const d = transportDecals(orbOh, orbO, fromOh).get(orbO.orbits[0].rep)[0];
  ok(d.file === 'a.png' && d.z === 1 && d.tiltAngle === 30 && d.tilt === 0.5 && near(d.size, 0.4),
    'file, stack, tilt and size ride along');
}

// the affine helpers
{
  const p = [2, 1, 3, -1, 0.5, 4];
  const r = affMul(p, affInv(p));
  ok(r.every((x, i) => near(x, [1, 0, 0, 0, 1, 0][i])), 'affMul(p, affInv(p)) is the identity');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
