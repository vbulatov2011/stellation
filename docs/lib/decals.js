/*
 * Decals: pictures placed on a plane orbit and replicated by symmetry.
 *
 * A decal is one image with a placement on an orbit's representative plane,
 * given in that plane's chart frame (see planeOrbits in core.js): center
 * (x, y) and size in units of the orbit's tile size s, an angle in degrees,
 * a mirror flag, a stack level z with a tilt for depth sorting, and a pivot
 * for the handles. The image occupies the box [-1, 1]² of its own "image
 * space", scaled to size·s wide and size·s/aspect tall, so a picture keeps
 * its proportions.
 *
 * Replication: every element of the orbit's stabilizer carries the placement
 * to another copy on the same plane, and the charts carry the whole family
 * to every plane of the orbit. The renderer sees only the resulting list of
 * affine maps from the chart frame into image coordinates, one per copy.
 *
 * Everything here is 2D and pure. Affine maps are six numbers
 * [a, b, tx, c, d, ty]: (x, y) ↦ (a·x + b·y + tx, c·x + d·y + ty).
 */

import { mat3mul, matMul } from './core.js';

export const AFF_ID = [1, 0, 0, 0, 1, 0];

/** p ∘ q — apply q, then p */
export function affMul(p, q) {
  return [
    p[0] * q[0] + p[1] * q[3], p[0] * q[1] + p[1] * q[4], p[0] * q[2] + p[1] * q[5] + p[2],
    p[3] * q[0] + p[4] * q[3], p[3] * q[1] + p[4] * q[4], p[3] * q[2] + p[4] * q[5] + p[5],
  ];
}

export function affInv(p) {
  const k = 1 / (p[0] * p[4] - p[1] * p[3]);
  const a = p[4] * k, b = -p[1] * k, c = -p[3] * k, d = p[0] * k;
  return [a, b, -(a * p[2] + b * p[5]), c, d, -(c * p[2] + d * p[5])];
}

export function affApply(p, x, y) {
  return [p[0] * x + p[1] * y + p[2], p[3] * x + p[4] * y + p[5]];
}

export function affClose(p, q, eps = 1e-6) {
  for (let i = 0; i < 6; i++) if (Math.abs(p[i] - q[i]) > eps) return false;
  return true;
}

/** a stabilizer element (2×2, row-major) as an affine map */
const lin = (S) => [S[0], S[1], 0, S[2], S[3], 0];

/** image space [-1,1]² → texture coordinates [0,1]², row 0 at the top */
export const BOX_TO_UV = [0.5, 0, 0.5, 0, -0.5, 0.5];

export const DEFAULT_DECAL = Object.freeze({
  file: '', x: 0, y: 0, size: 1, angle: 0, flip: false,
  z: 0, tiltAngle: 0, tilt: 0, tile: false, opacity: 1, pivot: [0, 0],
});

export function makeDecal(props = {}) {
  const d = { ...DEFAULT_DECAL, ...props };
  d.pivot = Array.isArray(d.pivot) && d.pivot.length === 2
    ? [Number(d.pivot[0]) || 0, Number(d.pivot[1]) || 0] : [0, 0];
  return d;
}

/**
 * The placement as a map from image space onto the chart frame:
 * rotate · scale(flip·w, h) then translate to the center, w = size·s/2.
 */
export function decalTransform(d, s, aspect = 1) {
  const w = d.size * s / 2, h = w / (aspect > 0 ? aspect : 1);
  const a = (d.angle || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const f = d.flip ? -1 : 1;
  return [ca * f * w, -sa * h, (d.x || 0) * s, sa * f * w, ca * h, (d.y || 0) * s];
}

/**
 * The reading back: which x, y, size, angle and flip a placement map has.
 * The y axis is never mirrored by decalTransform, so its image gives the
 * angle outright, and the sign of the determinant gives the flip.
 */
export function decomposeTransform(T, s, aspect = 1) {
  const h = Math.hypot(T[1], T[4]);
  return {
    x: T[2] / s,
    y: T[5] / s,
    size: 2 * h * (aspect > 0 ? aspect : 1) / s,
    angle: Math.atan2(-T[1], T[4]) * 180 / Math.PI,
    flip: T[0] * T[4] - T[1] * T[3] < 0,
  };
}

/**
 * Every copy the decals make on an orbit: one per (decal, stabilizer
 * element). `info(file)` supplies the image's { layer, aspect }.
 *
 *   copies:  [{ A, C, decal }]   A: chart frame → texture uv (for the shader)
 *                                C: image space → chart frame (for the diagram)
 *   decals:  [{ layer, z, tilt: [cos, sin], tiltAmount, tile, opacity }]
 */
export function decalCopies(orbit, decals, info = () => null) {
  const out = { copies: [], decals: [] };
  decals.forEach((d, di) => {
    const { layer = 0, aspect = 1 } = info(d.file) || {};
    const T = decalTransform(d, orbit.s, aspect);
    const t = (d.tiltAngle || 0) * Math.PI / 180;
    out.decals.push({
      layer, z: d.z || 0, tilt: [Math.cos(t), Math.sin(t)],
      tiltAmount: d.tilt || 0, tile: !!d.tile, opacity: d.opacity ?? 1,
    });
    for (const S of orbit.stab) {
      const C = affMul(lin(S), T);
      out.copies.push({ A: affMul(BOX_TO_UV, affInv(C)), C, decal: di });
    }
  });
  return out;
}

/**
 * Diagram coordinates → the plane's chart frame. createDiagram draws a plane
 * in its own frame (R_d, center); the chart is another frame of the same
 * plane, so the two differ by an isometry — a rotation, or a reflection when
 * the chart came through a reflecting group element.
 */
export function diagramToChart(frame, chart) {
  const R = frame.R, c = frame.center;
  const Rt = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
  const M = mat3mul(chart.m, Rt);
  const o = matMul(chart.m, { x: c[0], y: c[1], z: c[2] });
  return [M[0], M[1], o.x - chart.ox, M[3], M[4], o.y - chart.oy];
}

/**
 * Between two charts of the SAME plane (say, under two symmetry groups):
 * old frame → new frame. A point (u, v) of the old frame is the plane point
 * mᵀ·(u + ox, v + oy, z), which the new chart then reads.
 */
export function chartChange(chartOld, chartNew) {
  const m = chartOld.m;
  const Mt = [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
  const M = mat3mul(chartNew.m, Mt);
  const off = matMul(M, { x: chartOld.ox, y: chartOld.oy, z: chartOld.z });
  return [M[0], M[1], off.x - chartNew.ox, M[3], M[4], off.y - chartNew.oy];
}

/** the decal's placement read in another frame, B: that frame → chart */
export function decalToLocal(d, B, s, aspect = 1) {
  const L = affMul(affInv(B), decalTransform(d, s, aspect));
  return { ...d, ...decomposeTransform(L, s, aspect) };
}

/** a placement given in another frame, written back as the decal */
export function localToDecal(local, B, s, aspect = 1) {
  const T = affMul(B, decalTransform(local, s, aspect));
  return { ...local, ...decomposeTransform(T, s, aspect) };
}

/**
 * The decals after a change of symmetry group, losslessly: every copy each
 * decal made under the old grouping is carried onto the new orbit's
 * representative and kept once per class under the new stabilizer. A
 * smaller group turns copies into separate decals; a larger one merges them
 * back, and gathers what different old orbits had onto their common new
 * orbit — the editing-symmetry semantics cells already have.
 *
 * decalsByRep: Map(old representative → decal[]); returns the same for the
 * new grouping.
 */
const sameKind = (a, b) => a.file === b.file && (a.z || 0) === (b.z || 0) &&
  (a.tiltAngle || 0) === (b.tiltAngle || 0) && (a.tilt || 0) === (b.tilt || 0) &&
  !!a.tile === !!b.tile && (a.opacity ?? 1) === (b.opacity ?? 1);

export function transportDecals(oldO, newO, decalsByRep, info = () => null) {
  const out = new Map();
  for (const N of newO.orbits) {
    const cands = [];
    const seen = new Set();
    for (const j of N.planes) {
      const oi = oldO.orbitOf[j];
      if (seen.has(oi)) continue;
      seen.add(oi);
      const O = oldO.orbits[oi];
      const list = decalsByRep.get(O.rep);
      if (!list || !list.length) continue;
      const B = chartChange(oldO.charts[j], newO.charts[j]);
      for (const d of list) {
        const { aspect = 1 } = info(d.file) || {};
        const T = decalTransform(d, O.s, aspect);
        for (const S of O.stab) cands.push({ T: affMul(B, affMul(lin(S), T)), d, aspect });
      }
    }
    // two candidates are one decal when they show the same picture the same
    // way and their placements are stabilizer images of each other
    const kept = [];
    for (const c of cands) {
      const dup = kept.some(k => sameKind(k.d, c.d) &&
        N.stab.some(S => affClose(affMul(lin(S), k.T), c.T)));
      if (!dup) kept.push(c);
    }
    if (kept.length) {
      out.set(N.rep, kept.map(k => ({ ...k.d, ...decomposeTransform(k.T, N.s, k.aspect) })));
    }
  }
  return out;
}
