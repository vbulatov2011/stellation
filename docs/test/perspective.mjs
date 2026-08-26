/*
 * The stellation projection: a perspective that deforms continuously out of
 * the parallel one.
 *
 *   node docs/test/perspective.mjs
 *
 * The camera is parameterised by p = R/d, R the polyhedron's radius and d the
 * eye's distance, so p = 0 is the eye at infinity and p = 0.1 is the eye ten
 * radii out. What makes it usable on a stellation is that the plane through
 * the centre, perpendicular to the view, keeps its size for every p: turning
 * perspective up leans the near parts toward you and the far parts away
 * without resizing the figure. The checks below are that promise, the
 * degeneracy at p = 0, and the two things navigation must not do.
 */

import { stellationProjection } from '../lib/render3d.js';

let passed = 0, failed = 0;
const ok = (cond, label) => {
  if (cond) { passed++; console.log('   ok   ' + label); }
  else { failed++; console.log('   FAIL ' + label); }
};
/*
 * Tolerances are float32-sized, not double-sized: the matrix is a
 * Float32Array because that is what GL takes, so two routes to the same
 * number agree to about 1e-7 relative and no closer. The first draft of this
 * file asked for 1e-12 and reported fourteen failures whose printed values
 * were identical to six decimals — the tolerance was wrong, not the algebra.
 */
const near = (a, b, eps, label) =>
  ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b)),
     `${label} (${a.toFixed(9)} vs ${b.toFixed(9)})`);
const F32 = 1e-6;

/** apply a column-major mat4 to (x,y,z,1) and divide: [ndcX, ndcY, ndcZ] */
function project(M, x, y, z) {
  const cx = M[0] * x + M[4] * y + M[8] * z + M[12];
  const cy = M[1] * x + M[5] * y + M[9] * z + M[13];
  const cz = M[2] * x + M[6] * y + M[10] * z + M[14];
  const cw = M[3] * x + M[7] * y + M[11] * z + M[15];
  return [cx / cw, cy / cw, cz / cw, cw];
}

const HALF = 2, ASPECT = 1.5, R = 1, Z = 8;      // half-height, aspect, radius, bound
const NOPAN = { x: 0, y: 0 };

// ---------------------------------------------------------------- p = 0
console.log('\n-- p = 0 is the parallel camera, exactly');
{
  const P = stellationProjection(HALF, ASPECT, NOPAN, 0, R, Z);
  for (const z of [-3, -1, 0, 1, 3]) {
    const [X, Y, , w] = project(P, 0.7, -0.4, z);
    near(X, 0.7 / (HALF * ASPECT), F32, `x is depth-independent at z=${z}`);
    near(Y, -0.4 / HALF, F32, `y is depth-independent at z=${z}`);
    near(w, 1, F32, `w stays 1 at z=${z}`);
  }
}

// -------------------------------------------------------- the middle plane
console.log('\n-- the middle plane keeps its size for every p');
{
  const base = project(stellationProjection(HALF, ASPECT, NOPAN, 0, R, Z), 0.9, 0.3, 0);
  for (const p of [0.01, 0.05, 0.1, 0.3, 0.6, 0.9]) {
    const P = stellationProjection(HALF, ASPECT, NOPAN, p, R, Z);
    const got = project(P, 0.9, 0.3, 0);
    near(got[0], base[0], F32, `p=${p}: x at z=0 unchanged`);
    near(got[1], base[1], F32, `p=${p}: y at z=0 unchanged`);
  }
}

// ------------------------------------------------------ the magnification
console.log('\n-- magnification is 1/(1 - p·z/R), so p = 0.1 is an eye at 10R');
{
  const p = 0.1;
  const P = stellationProjection(HALF, ASPECT, NOPAN, p, R, Z);
  const flat = project(stellationProjection(HALF, ASPECT, NOPAN, 0, R, Z), 1, 0, 0)[0];
  for (const z of [-2, -1, -0.5, 0.5, 1, 2]) {
    const want = flat / (1 - p * z / R);
    near(project(P, 1, 0, z)[0], want, F32, `z=${z}: magnified by 1/(1-${p}·${z})`);
  }
  // the eye is at d = R/p = 10R: a point there is ON the eye and must not
  // survive the divide
  ok(project(P, 1, 0, 10 * R)[3] <= F32, 'a point at the eye has w = 0');
  ok(project(P, 1, 0, 12 * R)[3] < 0, 'a point beyond the eye has w < 0, so it clips');
}

// ----------------------------------------------------------- continuity
console.log('\n-- continuous in p: no jump leaving the parallel camera');
{
  const at = (p) => project(stellationProjection(HALF, ASPECT, NOPAN, p, R, Z), 1, 0, 1)[0];
  const flat = at(0);
  for (const p of [1e-6, 1e-4, 1e-2]) {
    ok(Math.abs(at(p) - flat) < 3 * p, `p=${p}: displacement is O(p), not a step`);
  }
  // and monotone in between, which is what "a slider you can drag" needs
  let prev = -Infinity, mono = true;
  for (let i = 0; i <= 20; i++) { const v = at(i * 0.04); if (v < prev) mono = false; prev = v; }
  ok(mono, 'magnification grows monotonically with p');
}

// ------------------------------------------------------------------ pan
console.log('\n-- pan moves the image, and is not itself magnified');
{
  const p = 0.3, pan = { x: 0.5, y: -0.25 };
  const A = stellationProjection(HALF, ASPECT, NOPAN, p, R, Z);
  const B = stellationProjection(HALF, ASPECT, pan, p, R, Z);
  const dx = -pan.x / (HALF * ASPECT), dy = -pan.y / HALF;
  for (const z of [-3, 0, 2]) {
    const a = project(A, 0.4, 0.6, z), b = project(B, 0.4, 0.6, z);
    near(b[0] - a[0], dx, F32, `z=${z}: pan shifts x by a constant, whatever the depth`);
    near(b[1] - a[1], dy, F32, `z=${z}: pan shifts y by a constant, whatever the depth`);
  }
}

// ---------------------------------------------------------------- zoom
console.log('\n-- zoom scales the image, and does not move the eye');
{
  const p = 0.4;
  const A = stellationProjection(HALF, ASPECT, NOPAN, p, R, Z);
  const B = stellationProjection(HALF * 2, ASPECT, NOPAN, p, R, Z);  // half the zoom
  for (const z of [-2, 0, 1.5]) {
    const a = project(A, 0.8, 0.2, z), b = project(B, 0.8, 0.2, z);
    near(b[0], a[0] / 2, F32, `z=${z}: halving the zoom halves x exactly`);
    near(b[1], a[1] / 2, F32, `z=${z}: halving the zoom halves y exactly`);
  }
  /*
   * The decisive one. If zoom moved the eye, the perspective would change with
   * it and the RATIO between a near and a far point would not survive zooming.
   */
  const rA = project(A, 1, 0, 2)[0] / project(A, 1, 0, -2)[0];
  const rB = project(B, 1, 0, 2)[0] / project(B, 1, 0, -2)[0];
  near(rB, rA, F32, 'near/far ratio is unchanged by zoom: the eye did not move');
}

// --------------------------------------------------------------- depth
console.log('\n-- depth still orders correctly, and stays in the clip volume');
{
  for (const p of [0, 0.05, 0.2, 0.5]) {
    const P = stellationProjection(HALF, ASPECT, NOPAN, p, R, Z);
    let prev = Infinity, mono = true, inRange = true;
    for (let i = 0; i <= 40; i++) {
      const z = -Z + (2 * Z * i) / 40;                    // back to front
      const [, , ndcZ, w] = project(P, 0.1, 0.1, z);
      if (w <= 0) break;                                  // past the eye: clipped
      if (ndcZ > prev + 1e-9) mono = false;               // nearer must be smaller
      if (ndcZ < -1.0001 || ndcZ > 1.0001) inRange = false;
      prev = ndcZ;
    }
    ok(mono, `p=${p}: nearer geometry gets smaller depth`);
    ok(inRange, `p=${p}: depth stays within [-1, 1]`);
  }
}

/*
 * Which side of a plane the eye is on.
 *
 * The translucent pass orders facets plane by plane: everything on the eye's
 * side of a plane is nearer than everything beyond it. For an eye at infinity
 * that is decided by the normal's view-z alone, since a plane's own offset
 * cannot matter to a direction — and that is what the sort used to do. Bring
 * the eye in and the offset matters at once, and the parallel rule gets the
 * planes that straddle the eye exactly backwards.
 *
 * The eye sits at view (0, 0, D), so in model space at D·(M[2], M[6], M[10]);
 * its signed distance from n·x = d is D·zc - d, and dividing out the positive
 * D leaves zc - d·k with k = 1/D — the parallel test again the moment k is 0.
 * What follows checks that expression against the eye point it stands for.
 *
 * This is the algebra, not the call site: the rule lives inside a method that
 * needs a GL context. Measured in the browser on the icosahedron at an eye ten
 * radii out, the two rules disagree for planes within 4.56° of edge-on, which
 * is 57% of orientations and up to two planes at once — the intermittent
 * artifact this fixes.
 */
console.log('\n-- the sort asks about the eye POINT, and agrees with it');
{
  // a deterministic spread of rotations, planes and eye distances
  const rot = (t) => {                       // an orthonormal basis, column-major
    const c = Math.cos(t), s = Math.sin(t), c2 = Math.cos(t * 1.7), s2 = Math.sin(t * 1.7);
    const e0 = [c, s, 0], e1 = [-s * c2, c * c2, s2];
    const e2 = [e0[1] * e1[2] - e0[2] * e1[1],
                e0[2] * e1[0] - e0[0] * e1[2],
                e0[0] * e1[1] - e0[1] * e1[0]];
    // column-major: M[2], M[6], M[10] is the view-z row, i.e. e2's components
    return [e0[0], e1[0], e2[0], 0, e0[1], e1[1], e2[1], 0, e0[2], e1[2], e2[2], 0, 0, 0, 0, 1];
  };
  let checked = 0, agree = 0, straddling = 0;
  for (let i = 1; i <= 60; i++) {
    const M = rot(i * 0.37);
    for (let j = 1; j <= 12; j++) {
      const a1 = j * 0.53, a2 = j * 1.19;
      const n = [Math.cos(a1) * Math.sin(a2), Math.sin(a1) * Math.sin(a2), Math.cos(a2)];
      const d = 0.2 + (j % 5) * 0.31;                      // offset, always >= 0
      for (const D of [2.5, 5, 10, 40, 1e6]) {
        const k = 1 / D;
        const zc = M[2] * n[0] + M[6] * n[1] + M[10] * n[2];
        // ground truth: the eye as an actual point in model space
        const E = [D * M[2], D * M[6], D * M[10]];
        const truth = Math.sign(E[0] * n[0] + E[1] * n[1] + E[2] * n[2] - d);
        const rule = Math.sign(zc - d * k);
        checked++;
        if (truth === rule) agree++;
        if (Math.sign(zc) !== truth) straddling++;         // where the old rule was wrong
      }
    }
  }
  ok(agree === checked, `the rule matches the eye point in all ${checked} cases`);
  ok(straddling > 0,
     `and the parallel rule genuinely differs (${straddling} of ${checked} straddle the eye)`);
}

console.log('\n-- and it degenerates to the parallel test at k = 0');
{
  for (const [zc, d] of [[0.9, 0.5], [-0.4, 0.8], [0.05, 0.79], [-0.02, 0.3]]) {
    ok(Math.sign(zc - d * 0) === Math.sign(zc), `k=0 leaves sign(zc) alone for zc=${zc}`);
  }
}

/*
 * Negative p: the centre of projection behind the figure.
 *
 * Nothing in the derivation asked p to be positive. m(z) = 1/(1 - p·z/R) with
 * p < 0 shrinks what leans toward the viewer and enlarges what leans away —
 * the reverse perspective of icon painting — and the middle plane is still
 * fixed, because m(0) = 1 has nothing to do with the sign. The clip plane
 * moves to the other end with it: w = 0 sits at z = 1/k, which is now behind
 * the figure, so it is the FAR side that runs out of room.
 */
console.log('');
console.log('-- negative p reverses the magnification, and keeps every promise');
{
  for (const p of [-0.05, -0.2, -0.5, -0.8]) {
    const P = stellationProjection(HALF, ASPECT, NOPAN, p, R, Z);
    // the middle plane is still fixed
    const flat = project(stellationProjection(HALF, ASPECT, NOPAN, 0, R, Z), 0.9, 0.3, 0);
    const mid = project(P, 0.9, 0.3, 0);
    near(mid[0], flat[0], F32, `p=${p}: the middle plane still keeps its size`);
    // and the magnification is the same formula, now below 1 in front
    const one = project(stellationProjection(HALF, ASPECT, NOPAN, 0, R, Z), 1, 0, 0)[0];
    near(project(P, 1, 0, 1)[0], one / (1 - p * 1 / R), F32, `p=${p}: z=+1 follows 1/(1-p·z/R)`);
    near(project(P, 1, 0, -1)[0], one / (1 + p * 1 / R), F32, `p=${p}: z=-1 follows it too`);
    ok(Math.abs(project(P, 1, 0, 1)[0]) < Math.abs(one),
       `p=${p}: what leans toward the viewer is drawn SMALLER`);
    ok(Math.abs(project(P, 1, 0, -1)[0]) > Math.abs(one),
       `p=${p}: what leans away is drawn LARGER`);
  }
}

console.log('');
console.log('-- and the clip plane moves to the far side, where it belongs');
{
  const p = -0.1;                                  // centre of projection at -10R
  const P = stellationProjection(HALF, ASPECT, NOPAN, p, R, Z);
  ok(project(P, 1, 0, 40 * R)[3] > 0, 'the near side is unlimited: z = +40R survives');
  ok(Math.abs(project(P, 1, 0, -10 * R)[3]) <= F32, 'w = 0 at z = -10R, the centre behind');
  ok(project(P, 1, 0, -12 * R)[3] < 0, 'and past it w < 0, so it clips');
}

console.log('');
console.log('-- depth still orders correctly with the sign reversed');
{
  for (const p of [-0.05, -0.3, -0.8]) {
    const P = stellationProjection(HALF, ASPECT, NOPAN, p, R, Z);
    let prev = Infinity, mono = true, inRange = true;
    for (let i = 0; i <= 40; i++) {
      const z = -Z + (2 * Z * i) / 40;
      const [, , ndcZ, w] = project(P, 0.1, 0.1, z);
      if (w <= 0) continue;                        // past the centre: clipped
      if (ndcZ > prev + 1e-9) mono = false;
      if (ndcZ < -1.0001 || ndcZ > 1.0001) inRange = false;
      prev = ndcZ;
    }
    ok(mono, `p=${p}: nearer geometry still gets smaller depth`);
    ok(inRange, `p=${p}: depth stays within [-1, 1]`);
  }
}

console.log('');
console.log('-- continuity through zero: the two signs meet at the parallel camera');
{
  const at = (p) => project(stellationProjection(HALF, ASPECT, NOPAN, p, R, Z), 1, 0, 1)[0];
  const flat = at(0);
  for (const e of [1e-4, 1e-3, 1e-2]) {
    const lo = at(-e), hi = at(e);
    ok(Math.abs((lo + hi) / 2 - flat) < e * e * 10,
       `p=±${e}: the two sides straddle the parallel value symmetrically`);
    ok(lo < flat && flat < hi, `p=±${e}: and lie either side of it, in order`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
