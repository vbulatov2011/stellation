/*
 * The placement rig: the handles drawn over a decal's copies in the diagram,
 * and the gestures they answer to. After SymmHub's pattern transform
 * handler: drag inside the box to move it, drag a corner to turn and scale
 * it about the pivot, drag the pivot to move the center of those turns —
 * and, new here, drag the tip of the tilt arrow to set the tilt's direction
 * and amount. Every copy of the active decal wears the box and its corners,
 * so any of them can be grabbed; the pivot and the tilt arrow sit on the
 * primary copy only. Other decals' copies are ghosts, and a click makes one
 * of them active.
 *
 * Coordinates: the rig lives in diagram coordinates (y up); `toScreen` maps
 * them to canvas pixels for hit radii and drawing. A copy is its map C from
 * image space [-1, 1]² into the diagram (lib/decals.js). A gesture yields a
 * new C for the grabbed copy, or a new pivot or tilt — those two live in
 * image space and are the same for every copy.
 */

import { decalTransform, decomposeTransform, affApply, affInv } from './decals.js';

const HANDLE_PX = 12;            // grab radius, css pixels
export const TILT_STUB = 0.25;   // the tilt arrow's length at tilt 0, image units
export const TILT_SPAN = 0.5;    // and its growth per unit of tilt

// each gesture its own cursor, none of them the diagram's own two
export const RIG_CURSOR = {
  move: 'move', corner: 'nwse-resize', pivot: 'crosshair', tilt: 'alias', select: 'copy',
};

const CORNERS = [[-1, 1], [1, 1], [1, -1], [-1, -1]];

/** the tilt arrow's tip, in image space */
export function tiltTip(rig) {
  const a = (rig.tiltAngle || 0) * Math.PI / 180;
  const l = TILT_STUB + (rig.tilt || 0) * TILT_SPAN;
  return [Math.cos(a) * l, Math.sin(a) * l];
}

const primaryOf = (rig) => {
  const active = rig.copies.filter(c => c.decal === rig.active);
  return { active, primary: active.find(c => c.primary) || active[0] || null };
};

/**
 * What the pointer is over. `p` carries { sx, sy } canvas pixels and
 * { wx, wy } diagram coordinates. The active decal's handles come first,
 * then the inside of one of its copies, then any other decal's copy.
 */
export function rigHit(rig, p, toScreen, dpr) {
  const R = HANDLE_PX * dpr;
  const near = (q) => {
    const [x, y] = toScreen(q[0], q[1]);
    return Math.hypot(x - p.sx, y - p.sy) <= R;
  };
  const { active, primary } = primaryOf(rig);
  if (primary) {
    if (near(affApply(primary.C, rig.pivot[0], rig.pivot[1]))) return { kind: 'pivot', copy: primary };
    const t = tiltTip(rig);
    if (near(affApply(primary.C, t[0], t[1]))) return { kind: 'tilt', copy: primary };
  }
  for (const c of active) {
    for (const q of CORNERS) if (near(affApply(c.C, q[0], q[1]))) return { kind: 'corner', copy: c };
  }
  const inside = (c) => {
    const q = affApply(affInv(c.C), p.wx, p.wy);
    return Math.abs(q[0]) <= 1 && Math.abs(q[1]) <= 1;
  };
  for (const c of active) if (inside(c)) return { kind: 'move', copy: c };
  for (const c of rig.copies) if (c.decal !== rig.active && inside(c)) return { kind: 'select', copy: c };
  return null;
}

/**
 * A gesture remembers the copy's map and the pivot's place as they were at
 * the press, and every step is measured from the press — the rig is rebuilt
 * after each step, so the copy object in the hit goes stale at once.
 */
export function rigBegin(hit, w) {
  return { hit, start: w, C0: hit.copy.C.slice() };
}

/**
 * The drag so far, as what it changes: { C } for the grabbed copy, or
 * { pivot }, or { tilt, tiltAngle }; null when nothing moved.
 */
export function rigDrag(g, w, rig) {
  const C = g.C0, aspect = rig.aspect || 1;
  switch (g.hit.kind) {
    case 'move': {
      const dx = w[0] - g.start[0], dy = w[1] - g.start[1];
      return { C: [C[0], C[1], C[2] + dx, C[3], C[4], C[5] + dy] };
    }
    case 'corner': {
      // turn and scale about the pivot: the angle the pointer swept since
      // the press and the ratio of its distances, the center relocated so
      // the pivot stays put
      const P = affApply(C, rig.pivot[0], rig.pivot[1]);
      const v1 = [g.start[0] - P[0], g.start[1] - P[1]];
      const v2 = [w[0] - P[0], w[1] - P[1]];
      const r1 = Math.hypot(v1[0], v1[1]), r2 = Math.hypot(v2[0], v2[1]);
      if (r1 < 1e-9 || r2 < 1e-9) return null;
      const da = (Math.atan2(v2[1], v2[0]) - Math.atan2(v1[1], v1[0])) * 180 / Math.PI;
      const p = decomposeTransform(C, 1, aspect);
      const next = decalTransform(
        { x: 0, y: 0, size: p.size * (r2 / r1), angle: p.angle + da, flip: p.flip }, 1, aspect);
      const Q = affApply(next, rig.pivot[0], rig.pivot[1]);
      return { C: [next[0], next[1], P[0] - Q[0], next[3], next[4], P[1] - Q[1]] };
    }
    case 'pivot':
      return { pivot: affApply(affInv(C), w[0], w[1]) };
    case 'tilt': {
      const q = affApply(affInv(C), w[0], w[1]);
      const len = Math.hypot(q[0], q[1]);
      return {
        tilt: Math.max(0, (len - TILT_STUB) / TILT_SPAN),
        tiltAngle: len > 1e-6 ? Math.atan2(q[1], q[0]) * 180 / Math.PI : (rig.tiltAngle || 0),
      };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------- drawing

/** a stroke that reads on any backdrop: a wide pass in the backdrop's
    color, a thin one in the ink's */
function strokeTwice(ctx, path, dpr, dark, wide, thin) {
  path();
  ctx.lineWidth = wide * dpr;
  ctx.strokeStyle = dark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)';
  ctx.stroke();
  path();
  ctx.lineWidth = thin * dpr;
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.85)';
  ctx.stroke();
}

function disc(ctx, x, y, r, dpr, dark, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r + 1.5 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = dark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill || (dark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.85)');
  ctx.fill();
}

/** the pivot: a ring, a dot and a crosshair */
function drawPivot(ctx, x, y, dpr, dark) {
  const ink = dark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.85)';
  const halo = dark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)';
  const R = 9 * dpr, X = 14 * dpr;
  const cross = () => {
    ctx.beginPath();
    ctx.moveTo(x - X, y); ctx.lineTo(x + X, y);
    ctx.moveTo(x, y - X); ctx.lineTo(x, y + X);
  };
  strokeTwice(ctx, cross, dpr, dark, 3, 1.2);
  ctx.beginPath();
  ctx.arc(x, y, R + 1.5 * dpr, 0, Math.PI * 2);
  ctx.strokeStyle = halo; ctx.lineWidth = 3.5 * dpr; ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.strokeStyle = ink; ctx.lineWidth = 2 * dpr; ctx.stroke();
  disc(ctx, x, y, 3 * dpr, dpr, dark);
}

/** the tilt arrow, from the image's center to the tip, in its own color */
function drawTilt(ctx, from, to, dpr, dark) {
  const color = 'rgba(255,140,0,0.95)';
  const halo = dark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)';
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L;
  const head = 8 * dpr;
  const line = () => {
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]); ctx.lineTo(to[0], to[1]);
    ctx.moveTo(to[0] - head * (ux + uy * 0.55), to[1] - head * (uy - ux * 0.55));
    ctx.lineTo(to[0], to[1]);
    ctx.lineTo(to[0] - head * (ux - uy * 0.55), to[1] - head * (uy + ux * 0.55));
  };
  line(); ctx.lineWidth = 4 * dpr; ctx.strokeStyle = halo; ctx.stroke();
  line(); ctx.lineWidth = 1.8 * dpr; ctx.strokeStyle = color; ctx.stroke();
  disc(ctx, to[0], to[1], 5 * dpr, dpr, dark, color);
}

/**
 * The rig as drawn: ghosts of the other decals' copies, the active decal's
 * copies with their corners, and on the primary copy the pivot and the
 * tilt arrow.
 */
export function drawRig(ctx, rig, toScreen, dpr, dark) {
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineJoin = 'round';
  const box = (C) => {
    ctx.beginPath();
    CORNERS.forEach((q, i) => {
      const [x, y] = toScreen(...affApply(C, q[0], q[1]));
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath();
  };
  for (const c of rig.copies) {
    if (c.decal === rig.active) continue;
    ctx.setLineDash([4 * dpr, 3 * dpr]);
    box(c.C);
    ctx.lineWidth = dpr;
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const { active, primary } = primaryOf(rig);
  for (const c of active) {
    const main = c === primary;
    strokeTwice(ctx, () => box(c.C), dpr, dark, main ? 3.5 : 2.5, main ? 1.5 : 1);
  }
  for (const c of active) {
    for (const q of CORNERS) {
      const [x, y] = toScreen(...affApply(c.C, q[0], q[1]));
      disc(ctx, x, y, (c === primary ? 6 : 4.5) * dpr, dpr, dark);
    }
  }
  if (primary) {
    const tip = tiltTip(rig);
    drawTilt(ctx, toScreen(...affApply(primary.C, 0, 0)), toScreen(...affApply(primary.C, tip[0], tip[1])), dpr, dark);
    const [px, py] = toScreen(...affApply(primary.C, rig.pivot[0], rig.pivot[1]));
    drawPivot(ctx, px, py, dpr, dark);
  }
  ctx.restore();
}
