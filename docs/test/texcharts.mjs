/*
 * Texture charts replicate one image over every face by symmetry.
 *
 *   node docs/test/texcharts.mjs
 *
 * planeCharts hands every plane an affine chart into one shared uv space,
 * transported from each orbit's representative by a group element. The pins
 * are what "replicated by symmetry" means concretely: every chart is an
 * isometry of its plane (the image is never stretched), the pole lands at
 * the origin (the image is centered on the face, every face), the tile size
 * is one number per orbit (all copies the same size), and — the heart —
 * each plane's chart agrees with the representative's through SOME group
 * element, so the picture on any face is an exact symmetric copy of the
 * picture on the representative, not a 48th independent decal.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildStellation, planeCharts, planeClasses, planeMatcher, matMul,
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
const planes = expandPlaneRows(normalizePlaneRows(ROWS), symmetry);
const G = symmetry.Oh.matrices;
const stel = buildStellation(null, G, {
  planes, subMatrices: G, maxIntersection: 20, maxLayer: 1000,
});

const charts = planeCharts(stel, G);
const { group, reps } = planeClasses(stel, G);
const mapPlane = planeMatcher(stel.planes);
const uv = (ch, v) => [
  ch.m[0] * v.x + ch.m[1] * v.y + ch.m[2] * v.z - ch.ox,
  ch.m[3] * v.x + ch.m[4] * v.y + ch.m[5] * v.z - ch.oy,
];
const coreVerts = (i) => {
  let core = null, rmin = Infinity;
  for (const f of stel.arrangement[i]) {
    if ((f.rank ?? f.layer) !== 0) continue;
    let cx = 0, cy = 0, cz = 0;
    for (const id of f.v) { const p = stel.pool.get(id); cx += p.x; cy += p.y; cz += p.z; }
    const n = f.v.length, r = (cx / n) ** 2 + (cy / n) ** 2 + (cz / n) ** 2;
    if (r < rmin) { rmin = r; core = f; }
  }
  return core.v.map(id => stel.pool.get(id));
};

ok(charts.length === stel.planes.length && charts.every(c => c && c.s > 0),
  `every plane wears a chart (${charts.length})`);

// one tile size per orbit — all copies of a face at the same scale
{
  const byOrbit = new Map();
  let mixed = 0;
  charts.forEach((c, j) => {
    const g = group[j];
    if (!byOrbit.has(g)) byOrbit.set(g, c.s);
    else if (Math.abs(byOrbit.get(g) - c.s) > 1e-9) mixed++;
  });
  ok(mixed === 0, 'the tile size is one number per orbit');
}

// isometry: in-chart distances equal in-space distances on the core polygon
{
  let bad = 0;
  for (let j = 0; j < stel.planes.length; j++) {
    const vs = coreVerts(j), ch = charts[j];
    for (let a = 0; a < vs.length; a++) {
      const b = (a + 1) % vs.length;
      const d3 = Math.hypot(vs[a].x - vs[b].x, vs[a].y - vs[b].y, vs[a].z - vs[b].z);
      const [ua, va] = uv(ch, vs[a]), [ub, vb] = uv(ch, vs[b]);
      if (Math.abs(Math.hypot(ua - ub, va - vb) - d3) > 1e-6) bad++;
    }
  }
  ok(bad === 0, 'every chart is an isometry — the image is never stretched');
}

// the pole sits at the chart origin, on every plane
{
  let off = 0;
  stel.planes.forEach((p, j) => {
    const pole = p.central ? { x: 0, y: 0, z: 0 }
      : { x: p.n.x * p.d, y: p.n.y * p.d, z: p.n.z * p.d };
    const [u, v] = uv(charts[j], pole);
    if (Math.hypot(u, v) > 1e-6) off++;
  });
  ok(off === 0, 'the image is centered on the pole of every face');
}

// the heart: each face's picture is an exact symmetric copy of the rep's
{
  let bad = 0;
  for (let j = 0; j < stel.planes.length; j++) {
    const i = reps[group[j]];
    const vs = coreVerts(i);
    const match = G.some(g => {
      if (mapPlane(g, i) !== j) return false;
      return vs.every(v => {
        const [u0, v0] = uv(charts[i], v);
        const [u1, v1] = uv(charts[j], matMul(g, v));
        return Math.hypot(u1 - u0, v1 - v0) < 1e-6;
      });
    });
    if (!match) bad++;
  }
  ok(bad === 0,
    'every face wears the representative\'s image through some group element');
}

// half the copies are mirrored: Oh has reflections, and a reflected copy of
// a picture is its mirror image — the charts must not secretly re-right them
{
  const orient = (ch, vs) => {
    let a2 = 0;
    for (let k = 0; k < vs.length; k++) {
      const [ux, uy] = uv(ch, vs[k]), [vx, vy] = uv(ch, vs[(k + 1) % vs.length]);
      a2 += ux * vy - vx * uy;
    }
    return Math.sign(a2);
  };
  const signs = charts.map((ch, j) => orient(ch, coreVerts(j)));
  const plus = signs.filter(s => s > 0).length;
  ok(plus === 24 && signs.length - plus === 24,
    `reflected copies stay mirrored (${plus} right-handed, ${signs.length - plus} mirrored)`);
}

// determinism
{
  const again = planeCharts(stel, G);
  ok(JSON.stringify(again) === JSON.stringify(charts), 'the charts are deterministic');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
