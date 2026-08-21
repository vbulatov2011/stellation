/*
 * Stellation core — a hand port of Vladimir Bulatov's Java stellation applet
 * (pvs.polyhedra.Stellation / SCell / SSCell / SFace) to modern JavaScript.
 *
 * WHAT A STELLATION IS
 * --------------------
 * Take a polyhedron and extend each of its face planes to infinity. The planes
 * cut each other, and cut space into bounded cells. Picking a symmetric set of
 * those cells gives a "stellated" polyhedron. The 2D version of the same idea:
 * extend the sides of a pentagon and they meet again, forming a pentagram.
 *
 * THE ALGORITHM (faithful to the original)
 * ----------------------------------------
 *  1. Each face of the source polyhedron defines a plane {n, d} with |n| = 1.
 *  2. For each plane, start with a huge polygon lying in it (the "seed face"),
 *     then clip that polygon against the half-space of every other plane.
 *     Clipping splits polygons; each resulting piece is a "facet".
 *     A facet's LAYER = the number of planes it lies entirely outside of.
 *     This is the single key idea: layer is a depth index into the arrangement.
 *  3. Bucket facets by layer.
 *  4. A 3D cell at layer L is bounded above by facets of layer L and below by
 *     facets of layer L-1. Cells are grown by walking oriented shared edges.
 *  5. Cells are grouped into orbits of the symmetry group -> "symmetric cells".
 *  6. Selecting cells and dropping every facet shared by two selected cells
 *     leaves the boundary surface: the stellated polyhedron.
 *
 * Constants below are the originals: Stellation.THRESHOLD, FACTOR, MAXVERTEX
 * and Vector3D.tolerance.
 */

// ---------------------------------------------------------------- constants

export const THRESHOLD = 1e-7;   // Stellation.THRESHOLD — breaks +/- symmetry when clipping
export const FACTOR    = 5e3;    // Stellation.FACTOR    — seed polygon radius
export const MAXVERTEX = 2e3;    // Stellation.MAXVERTEX — facets reaching past this are unbounded
export const TOL       = 1e-6;   // Vector3D.tolerance   — vertex identity tolerance

// ---------------------------------------------------------------- vector math

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const mul = (a, s) => v3(a.x * s, a.y * s, a.z * s);
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => v3(
  a.y * b.z - a.z * b.y,
  a.z * b.x - a.x * b.z,
  a.x * b.y - a.y * b.x
);
export const len = a => Math.sqrt(dot(a, a));
export function normalize(a) {
  const l = len(a);
  return l < 1e-15 ? v3(0, 0, 1) : mul(a, 1 / l);
}

/* Math.max(...arr) overflows the call stack past ~100k elements, and these
   arrangements reach millions of vertices — so reduce with a plain loop. */
export function maxOf(arr, f) {
  let m = -Infinity;
  for (const x of arr) { const v = f(x); if (v > m) m = v; }
  return m === -Infinity ? 0 : m;
}

/** apply a row-major 3x3 matrix (flat array of 9) to a vector */
export function matMul(m, a) {
  return v3(
    m[0] * a.x + m[1] * a.y + m[2] * a.z,
    m[3] * a.x + m[4] * a.y + m[5] * a.z,
    m[6] * a.x + m[7] * a.y + m[8] * a.z
  );
}

// ---------------------------------------------------------------- vertex pool
/*
 * The original relies on Java reference identity (`vertexA == vertexB`) to know
 * that two facets share a vertex, backed by a hashtable that returns an already
 * seen Vector3D when a new one lands within `tolerance`. We reproduce that by
 * interning every vertex into an integer id via a spatial hash, so identity
 * becomes integer equality. This is the same idea, but robust at bucket edges:
 * we probe all 27 neighboring grid cells rather than trusting one hash bucket.
 */
export class VertexPool {
  constructor(tol = TOL) {
    this.tol = tol;
    this.cell = tol * 4;
    this.map = new Map();   // grid key -> array of vertex ids
    this.pts = [];          // id -> {x,y,z}
  }

  _key(i, j, k) { return i + ',' + j + ',' + k; }

  /** returns the integer id of a vertex, creating it if new */
  intern(p) {
    const c = this.cell;
    const gi = Math.floor(p.x / c), gj = Math.floor(p.y / c), gk = Math.floor(p.z / c);
    const tol = this.tol;
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++)
        for (let dk = -1; dk <= 1; dk++) {
          const bucket = this.map.get(this._key(gi + di, gj + dj, gk + dk));
          if (!bucket) continue;
          for (const id of bucket) {
            const q = this.pts[id];
            if (Math.abs(q.x - p.x) < tol &&
                Math.abs(q.y - p.y) < tol &&
                Math.abs(q.z - p.z) < tol) return id;
          }
        }
    const id = this.pts.length;
    this.pts.push(v3(p.x, p.y, p.z));
    const key = this._key(gi, gj, gk);
    let b = this.map.get(key);
    if (!b) this.map.set(key, b = []);
    b.push(id);
    return id;
  }

  get(id) { return this.pts[id]; }
  get size() { return this.pts.length; }
}

// ---------------------------------------------------------------- planes

/** Plane through the point closest to the origin: {n (unit), d} with n·x = d */
export function planeFromPoint(p) {
  const d = len(p);
  return { n: d < 1e-12 ? v3(0, 0, 1) : mul(p, 1 / d), d };
}

/**
 * Face planes of a polyhedron, deduplicated.
 * Mirrors Stellation.getPlane(poly, i): the plane normal is the polygon normal,
 * oriented outward, and d is its distance from the origin.
 */
export function facePlanes(poly) {
  const out = [];
  const seen = [];
  let central = 0, degenerate = 0, duplicate = 0;

  for (const face of poly.faces) {
    // Newell's method — robust for non-planar-ish polygons
    let n = v3();
    for (let i = 0; i < face.length; i++) {
      const a = poly.vertices[face[i]];
      const b = poly.vertices[face[(i + 1) % face.length]];
      n = add(n, v3(
        (a.y - b.y) * (a.z + b.z),
        (a.z - b.z) * (a.x + b.x),
        (a.x - b.x) * (a.y + b.y)
      ));
    }
    /*
     * Newell's sum is a *signed* area, and a crossed polygon — a "bow tie", which
     * several of the star faces in this catalog are — has two lobes wound
     * opposite ways whose contributions cancel. The sum then collapses toward
     * zero and normalizing it yields a direction made of rounding error, so the
     * face's plane came out wrong or was thrown away entirely.
     *
     * The plane itself is perfectly well defined: the vertices are coplanar
     * whatever order they are joined in. So when the winding tells us nothing,
     * ignore the winding and fit the plane to the points, taking the two spokes
     * from vertex 0 whose cross product is largest — the best-conditioned triple
     * available. Only a genuinely degenerate face (all points collinear) fails
     * both tests, and that one is counted and skipped.
     */
    let len2 = dot(n, n);
    if (len2 < 1e-18) {
      let best = v3(), bestL = 0;
      const v0 = poly.vertices[face[0]];
      for (let i = 1; i < face.length; i++) {
        const a = sub(poly.vertices[face[i]], v0);
        for (let j = i + 1; j < face.length; j++) {
          const b = sub(poly.vertices[face[j]], v0);
          const x = cross(a, b);
          const L = dot(x, x);
          if (L > bestL) { bestL = L; best = x; }
        }
      }
      if (bestL < 1e-18) { degenerate++; continue; }   // collinear: no plane at all
      n = best; len2 = bestL;
    }
    n = mul(n, 1 / Math.sqrt(len2));

    let c = v3();
    for (const i of face) c = add(c, poly.vertices[i]);
    c = mul(c, 1 / face.length);
    // the centroid is on the plane whatever order the vertices are joined in,
    // so this is unaffected by the crossing above
    let d = dot(n, c);
    if (d < 0) { n = mul(n, -1); d = -d; }   // orient away from the origin
    if (Math.abs(d) < 1e-9) { central++; continue; }   // through the center: skip

    const dup = seen.some(p => Math.abs(p.d - d) < 1e-6 &&
                               Math.abs(dot(p.n, n) - 1) < 1e-9);
    if (dup) { duplicate++; continue; }
    seen.push({ n, d });
    out.push({ n, d, index: out.length });
  }

  /*
   * What was left out, and why.
   *
   * Dropping planes silently is the one thing this function must not do: a
   * hemipolyhedron loses its central planes here and the stellation you get back
   * is of a *different solid*, with no hint on screen that anything happened.
   * These counts ride along on the array so the UI can say so.
   */
  out.total = poly.faces.length;
  out.central = central;
  out.degenerate = degenerate;
  out.duplicate = duplicate;
  return out;
}

/**
 * A plane arrangement from an explicit list of planes — the plane-editor path.
 *
 * The original Java had a dialog for this: type in planes, apply a symmetry
 * group to each, stellate the result. The engine below never cared where its
 * planes came from; this is the front door for handing it a list directly.
 * Input rows are {n:[x,y,z], d} (or {n:{x,y,z}, d}); the same hygiene as
 * facePlanes applies — normalize, orient away from the origin, skip planes
 * through the center (this representation cannot hold them), dedupe — and the
 * same accounting rides along so the UI can say what was dropped.
 */
export function planesFromList(rows) {
  const out = [];
  const seen = [];
  let central = 0, degenerate = 0, duplicate = 0;
  for (const row of rows) {
    let n = Array.isArray(row.n) ? v3(row.n[0], row.n[1], row.n[2]) : v3(row.n.x, row.n.y, row.n.z);
    const L = len(n);
    if (L < 1e-12) { degenerate++; continue; }
    n = mul(n, 1 / L);
    let d = Number(row.d);
    if (!Number.isFinite(d)) { degenerate++; continue; }
    if (d < 0) { n = mul(n, -1); d = -d; }
    if (Math.abs(d) < 1e-9) { central++; continue; }
    const dup = seen.some(p => Math.abs(p.d - d) < 1e-6 &&
                               Math.abs(dot(p.n, n) - 1) < 1e-9);
    if (dup) { duplicate++; continue; }
    seen.push({ n, d });
    out.push({ n, d, index: out.length });
  }
  out.total = rows.length;
  out.central = central;
  out.degenerate = degenerate;
  out.duplicate = duplicate;
  return out;
}

/**
 * Rewind every face so the surface is consistently oriented, or say why not.
 *
 * The catalog lists each face's vertices in *some* order and promises nothing
 * about agreement between neighbors — most solids in the data disagree
 * somewhere. Orientation is recoverable, and uniquely so on a connected
 * orientable surface: walk the face adjacency and flip any neighbor that
 * traverses the shared edge the same way round. Two failures are fatal rather
 * than repairable and are reported instead of guessed at: an edge bordering
 * other than two faces (not a closed surface), and a flip contradicting one
 * already made (a Möbius-like surface with no consistent orientation — which is
 * exactly what the hemipolyhedra's data is).
 *
 * Returns { ok, faces, flips } or { ok:false, why }.
 */
export function orientFaces(poly) {
  const faces = poly.faces.map(f => f.slice());
  const edgeFaces = new Map();
  const ek = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let fi = 0; fi < faces.length; fi++) {
    const f = faces[fi];
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      if (a === b) continue;
      const k = ek(a, b);
      if (!edgeFaces.has(k)) edgeFaces.set(k, []);
      edgeFaces.get(k).push(fi);
    }
  }
  for (const [k, fs] of edgeFaces) {
    if (fs.length !== 2) return { ok: false, why: `edge ${k} borders ${fs.length} faces, not 2 — not a closed surface` };
  }
  const hasDirected = (f, a, b) => {
    for (let i = 0; i < f.length; i++) if (f[i] === a && f[(i + 1) % f.length] === b) return true;
    return false;
  };
  const done = new Array(faces.length).fill(false);
  let flips = 0;
  for (let seed = 0; seed < faces.length; seed++) {
    if (done[seed]) continue;
    done[seed] = true;
    const queue = [seed];
    while (queue.length) {
      const fi = queue.pop();
      const f = faces[fi];
      for (let i = 0; i < f.length; i++) {
        const a = f[i], b = f[(i + 1) % f.length];
        const pair = edgeFaces.get(ek(a, b));
        const gi = pair[0] === fi ? pair[1] : pair[0];
        if (gi === fi) return { ok: false, why: 'a face borders itself across an edge' };
        const g = faces[gi];
        const agrees = hasDirected(g, b, a);       // opposite traversal = consistent
        if (done[gi]) {
          if (!agrees) return { ok: false, why: 'orientation is contradictory — the surface is non-orientable' };
          continue;
        }
        if (!agrees) { g.reverse(); flips++; }
        done[gi] = true;
        queue.push(gi);
      }
    }
  }
  return { ok: true, faces, flips };
}

/**
 * How deep to carve, by default, for a given set of face planes.
 *
 * Depth is the `maxintersection` cap of the original: facets past that many
 * half-spaces are discarded. Too shallow and outer layers come out empty, which
 * looks like a bug — cells appear disconnected because the shells that would
 * join them were never built. Too deep and the densest solids take half a
 * minute. So pick per polyhedron, from two things known before any work starts:
 *
 *  - **How close a plane passes to the center.** A plane near the origin is cut
 *    by every other plane and shatters into thousands of facets. The duals of
 *    the hemi-polyhedra do this: their plane distances span 80:1, against 1.0
 *    for every well-behaved solid, and they are far and away the slowest.
 *  - **How many planes there are.** 120 planes is heavy even when they are all
 *    the same distance out.
 *
 * Everything convex — the Platonic and Archimedean solids and their duals —
 * lands on "no limit" and builds complete, with no empty layers, in under a
 * second.
 */
export function suggestDepth(planes) {
  if (!planes.length) return -1;
  let min = Infinity, max = 0;
  for (const p of planes) { if (p.d < min) min = p.d; if (p.d > max) max = p.d; }
  const spread = min > 1e-9 ? max / min : Infinity;
  const n = planes.length;

  if (spread >= 3 && n >= 48) return 8;    // near-central planes, and many of them
  if (n >= 84) return 12;
  if (spread >= 3) return 16;
  if (n >= 48) return 20;
  return -1;                               // no limit: it is already cheap
}

// ---------------------------------------------------------------- arrangement

/** A huge square lying in `plane` — Stellation.makeSeedFace(Plane, int) */
function seedFace(plane, pool) {
  const normal = plane.n;
  let x = v3(1, 0, 0);
  let y = cross(x, normal);
  if (dot(y, y) < 1e-4) { x = v3(0, 1, 0); y = cross(x, normal); }
  y = normalize(y);
  const z = cross(normal, y);
  const fpoint = mul(normal, plane.d);
  const verts = [];
  for (let i = 0; i < 4; i++) {
    const a = 2 * Math.PI * i / 4;
    verts.push(pool.intern(add(fpoint, add(mul(y, FACTOR * Math.cos(a)), mul(z, FACTOR * Math.sin(a))))));
  }
  return verts;
}

/**
 * Clip every facet in `faces` against the half-space n·x <= d of `plane`.
 * Facets entirely outside get layer+1; straddling facets are split, the outer
 * piece becoming a new facet at layer+1.
 * Faithful to Stellation.intersectFacesWithPlane.
 */
function clipAgainstPlane(faces, plane, pool, maxIntersection) {
  const fsize = faces.length;
  const fval = [];

  for (let i = 0; i < fsize; i++) {
    const f = faces[i];
    const vs = f.v;
    let nplus = 0, nminus = 0;
    for (let j = 0; j < vs.length; j++) {
      const p = pool.get(vs[j]);
      const val = dot(p, plane.n) - plane.d;
      fval[j] = val;
      if (val < THRESHOLD) nminus++; else nplus++;
    }

    if (nminus === 0) { f.layer++; continue; }  // entirely outside
    if (nplus === 0) continue;                  // entirely inside

    const polysize = vs.length;
    // locate the two crossings, exactly as the original walks the ring
    let lastout = 0;
    while (fval[lastout] < THRESHOLD) lastout = (lastout + 1) % polysize;
    let firstin = (lastout + 1) % polysize;
    while (fval[firstin] >= THRESHOLD) { lastout = firstin; firstin = (firstin + 1) % polysize; }
    let lastin = firstin;
    let firstout = (lastin + 1) % polysize;
    while (fval[firstout] < THRESHOLD) { lastin = firstout; firstout = (firstout + 1) % polysize; }

    const vins = [], vout = [];
    let inside = firstin;
    while (fval[inside] < THRESHOLD) { vins.push(vs[inside]); inside = (inside + 1) % polysize; }

    const pnt1 = pool.intern(interpolate(pool.get(vs[lastin]),  pool.get(vs[firstout]), fval[lastin],  fval[firstout]));
    const pnt2 = pool.intern(interpolate(pool.get(vs[lastout]), pool.get(vs[firstin]),  fval[lastout], fval[firstin]));
    vins.push(pnt1, pnt2);
    vout.push(pnt2, pnt1);

    let outside = firstout;
    while (fval[outside] >= THRESHOLD) { vout.push(vs[outside]); outside = (outside + 1) % polysize; }

    f.v = vins;
    const nf = { v: vout, layer: f.layer + 1, plane: f.plane };
    if (maxIntersection < 0 || nf.layer < maxIntersection) faces.push(nf);
  }
}

function interpolate(a, b, fa, fb) {
  const t = fa / (fa - fb);
  return v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
}

/** drop degenerate and unbounded facets — Stellation.cleanFaces */
function cleanFaces(faces, pool) {
  const out = [];
  for (const f of faces) {
    let longest = 0;
    for (const id of f.v) longest = Math.max(longest, len(pool.get(id)));
    if (longest >= MAXVERTEX) continue;          // runs off to infinity
    const v = [];
    for (let k = 0; k < f.v.length; k++) {
      if (f.v[(k + 1) % f.v.length] !== f.v[k]) v.push(f.v[k]);
    }
    if (v.length > 2) { f.v = v; out.push(f); }
  }
  return out;
}

/**
 * Build the full plane arrangement.
 * Returns facets[planeIndex] = [{v:[vertexIds], layer, plane}]
 */
export function makeArrangement(planes, pool, maxIntersection = -1, onProgress = null) {
  const result = [];
  for (let i = 0; i < planes.length; i++) {
    // The original sorts the other planes by angle for numerical stability.
    const order = planes.map((p, k) => ({ k, val: -dot(planes[i].n, p.n) }))
                        .sort((a, b) => a.val - b.val);
    let faces = [{ v: seedFace(planes[i], pool), layer: 0, plane: i }];
    for (const { k } of order) {
      if (k === i) continue;
      clipAgainstPlane(faces, planes[k], pool, maxIntersection);
    }
    result.push(cleanFaces(faces, pool));
    if (onProgress) onProgress(i + 1, planes.length);
  }
  return result;
}

// ---------------------------------------------------------------- facet helpers

export function facetCenter(f, pool) {
  if (f._c) return f._c;
  let c = v3();
  for (const id of f.v) c = add(c, pool.get(id));
  return (f._c = mul(c, 1 / f.v.length));
}

/** vector area = normal * area, via the shoelace/Newell sum */
export function facetArea(f, pool) {
  if (f._a) return f._a;
  let a = v3();
  const n = f.v.length;
  for (let i = 1; i < n - 1; i++) {
    const p0 = pool.get(f.v[0]), p1 = pool.get(f.v[i]), p2 = pool.get(f.v[i + 1]);
    a = add(a, cross(sub(p1, p0), sub(p2, p0)));
  }
  return (f._a = mul(a, 0.5));
}

/**
 * Do two facets share an oriented edge?
 * direction =  1 : same winding    (two facets of the cell's top surface)
 * direction = -1 : opposite winding (a bottom facet against a top facet)
 * Faithful to SFace.adjacent — note it decides on the FIRST shared vertex.
 */
export function adjacent(fa, fb, direction) {
  const a = fa.v, b = fb.v, la = a.length, lb = b.length;
  for (let i = 0; i < la; i++) {
    for (let j = 0; j < lb; j++) {
      if (a[i] !== b[j]) continue;
      return a[(i + 1) % la] === b[(((j - direction) % lb) + lb) % lb] ||
             a[(i - 1 + la) % la] === b[(((j + direction) % lb) + lb) % lb];
    }
  }
  return false;
}

// ---------------------------------------------------------------- layers & cells

/** bucket facets by layer — Stellation.makeLayers */
export function makeLayers(arrangement) {
  let maxLayer = 0;
  for (const plane of arrangement)
    for (const f of plane) maxLayer = Math.max(maxLayer, f.layer);

  const layers = [];
  for (let l = 0; l <= maxLayer; l++) layers.push([]);
  for (const plane of arrangement)
    for (const f of plane) layers[f.layer].push(f);
  return layers;
}

/**
 * Grow the 3D cells sitting between layer L-1 (below) and layer L (above).
 * Faithful to Stellation.makeCellsFromLayers2.
 */
export function makeCellsBetween(bottomFaces, topFaces, layer, pool) {
  const vertexFaces = new Map();       // vertexId -> facets touching it
  const indexByVertex = (list) => {
    const m = new Map();
    for (const f of list)
      for (const id of f.v) {
        let a = m.get(id);
        if (!a) m.set(id, a = []);
        a.push(f);
      }
    return m;
  };
  const tvtable = indexByVertex(topFaces);
  const bvtable = indexByVertex(bottomFaces);

  const ttable = new Set(topFaces);
  const btable = new Set(bottomFaces);
  const remaining = new Set(topFaces);   // facets not yet consumed by a cell

  const cells = [];

  while (remaining.size > 0) {
    const face = remaining.values().next().value;
    remaining.delete(face);
    ttable.delete(face);

    const vertTable = new Set();
    const tAdj = new Set();
    const bAdj = new Set();

    const absorbVertex = (id) => {
      if (vertTable.has(id)) return;
      vertTable.add(id);
      for (const f of (tvtable.get(id) || [])) if (ttable.has(f)) tAdj.add(f);
      for (const f of (bvtable.get(id) || [])) if (btable.has(f)) bAdj.add(f);
    };
    for (const id of face.v) absorbVertex(id);

    // --- top surface of the cell: walk same-winding neighbors
    const tfaces = [face];
    let iface;
    while ((iface = findAdjacentFace(tAdj, tfaces, 1, pool)) !== null) {
      tfaces.push(iface);
      ttable.delete(iface);
      remaining.delete(iface);
      tAdj.delete(iface);
      for (const id of iface.v) absorbVertex(id);
    }

    // --- bottom surface: opposite winding
    const bfaces = [];
    while ((iface = findAdjacentFace(bAdj, tfaces, -1, pool)) !== null) {
      bfaces.push(iface);
      btable.delete(iface);
      bAdj.delete(iface);
      for (const id of iface.v) {
        if (vertTable.has(id)) continue;
        vertTable.add(id);
        for (const f of (bvtable.get(id) || [])) if (btable.has(f)) bAdj.add(f);
      }
    }

    const cell = { top: tfaces, bottom: bfaces, layer };
    cell.volume = cellVolume(cell, pool);
    if (cell.volume > 0) {
      cell.center = cellCenter(cell, pool);
      // Back-links, as in the SCell constructor: a facet knows the cell it caps
      // (cellBelow) and the cell it floors (cellAbove). The diagram uses these
      // to turn a click on a 2D facet into "toggle that 3D cell".
      for (const f of tfaces) f.cellBelow = cell;
      for (const f of bfaces) f.cellAbove = cell;
      cells.push(cell);
    }
    // volume <= 0 means an unbounded cell; the original discards it too
  }
  return cells;
}

function findAdjacentFace(pool_, faces, direction, pool) {
  for (const face of faces) {
    const n = normalize(facetArea(face, pool));
    const d = dot(n, facetCenter(face, pool));
    for (const pface of pool_) {
      if (dot(n, facetCenter(pface, pool)) - d < 0 && adjacent(pface, face, direction)) {
        return pface;
      }
    }
  }
  return null;
}

export function cellVolume(cell, pool) {
  let volume = 0;
  for (const f of cell.top)    volume += dot(pool.get(f.v[0]), facetArea(f, pool));
  for (const f of cell.bottom) volume -= dot(pool.get(f.v[0]), facetArea(f, pool));
  return volume / 3;
}

export function cellCenter(cell, pool) {
  let c = v3();
  for (const f of cell.top)    c = add(c, facetCenter(f, pool));
  for (const f of cell.bottom) c = add(c, facetCenter(f, pool));
  return mul(c, 1 / (cell.top.length + cell.bottom.length));
}

// ---------------------------------------------------------------- symmetry orbits

/**
 * Group cells of one layer into orbits of the symmetry group: each orbit is one
 * "symmetric cell" (SSCell) — the unit the user actually selects, so that a
 * choice always yields a symmetric solid.
 * Faithful to Stellation.makeSymmetricalCells.
 */
export function makeSymmetricCells(cells, matrices, layer) {
  const pool = new VertexPool(1e-6);
  const byCenter = new Map();
  for (const c of cells) byCenter.set(pool.intern(c.center), c);

  const orbits = [];
  const used = new Set();

  for (const c of cells) {
    const id = pool.intern(c.center);
    if (used.has(id)) continue;
    const members = [c];
    used.add(id);
    for (const m of matrices) {
      const tid = pool.intern(matMul(m, c.center));
      if (used.has(tid)) continue;
      const other = byCenter.get(tid);
      if (other) { members.push(other); used.add(tid); }
    }
    let volume = 0;
    for (const mc of members) volume += mc.volume;
    orbits.push({
      layer,
      cells: members,
      volume,
      nFacets: members[0].top.length + members[0].bottom.length,
      nVertices: countVertices(members),
      radius: maxOf(members, mc => len(mc.center)),
    });
  }

  orbits.sort(compareCells);
  orbits.forEach((o, i) => { o.index = i; });
  /*
   * Atom backlinks. A primitive cell's (layer, orbit, member) triple is its
   * identity in the atomic selection model — see the "atomic selection"
   * section below. Member order is simply enumeration order, which is
   * deterministic, and nothing downstream ever reorders orbit.cells.
   */
  for (const o of orbits) o.cells.forEach((c, m) => { c.orbit = o; c.memberIndex = m; });
  return orbits;
}

/** distinct vertices across every facet of every cell in the group */
export function countVertices(cells) {
  const s = new Set();
  for (const c of cells) {
    for (const f of c.top) for (const id of f.v) s.add(id);
    for (const f of c.bottom) for (const id of f.v) s.add(id);
  }
  return s.size;
}

/**
 * The original's ordering (SSCell.strictCompare then volume), reproduced so that
 * a cell index written into a .stel file means the same cell here as it did in
 * the Java program: fewest primitive cells first, then fewest facets, then
 * fewest vertices, then smallest volume.
 */
const CELL_EPS = 1e-4;   // SSCell.EPS
export function compareCells(a, b) {
  if (a.cells.length !== b.cells.length) return a.cells.length - b.cells.length;
  if (a.nFacets !== b.nFacets) return a.nFacets - b.nFacets;
  if (a.nVertices !== b.nVertices) return a.nVertices - b.nVertices;
  const dv = a.volume - b.volume;
  return Math.abs(dv) < CELL_EPS ? 0 : (dv < 0 ? -1 : 1);
}

/**
 * Split one symmetric cell into sub-orbits of a SUBGROUP of the symmetry.
 *
 * This is what makes chirality visible. The cells are grouped under the full
 * symmetry of the polyhedron (say Ih, which contains reflections), but a
 * stellation is usually built with only the rotations (I). An Ih-orbit that is
 * mirror-symmetric stays a single I-orbit; a chiral one splits into a
 * left-handed and a right-handed half, and the user may pick just one.
 * Faithful to Stellation.makeSymmetricalSubCells.
 */
export function makeSubCells(orbit, subMatrices) {
  const pool = new VertexPool(1e-6);
  const byCenter = new Map();
  for (const c of orbit.cells) byCenter.set(pool.intern(c.center), c);

  const subs = [];
  const used = new Set();
  for (const c of orbit.cells) {
    const id = pool.intern(c.center);
    if (used.has(id)) continue;
    const members = [c];
    used.add(id);
    for (const m of subMatrices) {
      const tid = pool.intern(matMul(m, c.center));
      if (used.has(tid)) continue;
      const other = byCenter.get(tid);
      if (other) { members.push(other); used.add(tid); }
    }
    let volume = 0;
    for (const mc of members) volume += mc.volume;
    subs.push({
      cells: members, volume, parent: orbit,
      nFacets: members[0].top.length + members[0].bottom.length,
      nVertices: countVertices(members),
    });
  }

  // Same comparator as for whole cells. A chiral pair ties on every key (the two
  // halves are mirror images), so we break the tie geometrically: without this
  // the order would depend on hash iteration, as it does in the original.
  const key = s => s.cells.map(m => m.center)
    .sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z)[0];
  subs.sort((a, b) => {
    const c = compareCells(a, b);
    if (c !== 0) return c;
    const ka = key(a), kb = key(b);
    for (const ax of ['x', 'y', 'z'])
      if (Math.abs(ka[ax] - kb[ax]) > 1e-9) return ka[ax] - kb[ax];
    return 0;
  });
  subs.forEach((s, i) => { s.index = i; s.layer = orbit.layer; s.cellIndex = orbit.index; });
  return subs;
}

// ---------------------------------------------------------------- mesh extraction

/**
 * The boundary surface of a union of cells: a facet that is the top of one
 * selected cell and the bottom of another is interior and cancels out; what
 * remains is the visible surface of the stellation.
 * Same cancellation rule as Stellation.getStellationDiagram / getPolyhedron.
 */
export function extractMesh(selectedOrbits, pool) {
  const TOP = 1, BOTTOM = 0;
  const state = new Map();   // facet -> TOP | BOTTOM

  for (const orbit of selectedOrbits) {
    for (const cell of orbit.cells) {
      for (const f of cell.top) {
        const s = state.get(f);
        if (s === undefined) state.set(f, TOP);
        else if (s === BOTTOM) state.delete(f);
      }
      for (const f of cell.bottom) {
        const s = state.get(f);
        if (s === undefined) state.set(f, BOTTOM);
        else if (s === TOP) state.delete(f);
      }
    }
  }

  // remap to a compact vertex list
  const remap = new Map();
  const vertices = [];
  const faces = [];
  const facetRefs = [];
  const facetTop = [];

  for (const [f, kind] of state) {
    const ids = kind === TOP ? f.v : f.v.slice().reverse();  // bottom facets face inward
    const face = ids.map(id => {
      let ni = remap.get(id);
      if (ni === undefined) { ni = vertices.length; remap.set(id, ni); vertices.push(pool.get(id)); }
      return ni;
    });
    faces.push(face);
    facetRefs.push(f);
    // Which side of this facet the solid is on. cellBelow/cellAbove are fixed
    // geometric labels (inward / outward), but on the boundary surface the
    // selected cell is only the one below when the facet caps it. For a bottom
    // facet — the underside of a cell, the ones whose winding is reversed just
    // above — the selected cell is the one above and the gap is below. Callers
    // that turn a click into "add" or "remove" need this to tell solid from
    // empty; without it every gesture on an underside is a silent no-op.
    facetTop.push(kind === TOP);
  }
  return { vertices, faces, facetRefs, facetTop };
}

// ---------------------------------------------------------------- the pipeline

/**
 * Build the whole stellation structure for a polyhedron.
 * `matrices` is the symmetry group used to bundle cells into symmetric orbits.
 */
export function buildStellation(poly, matrices, opts = {}) {
  const { maxLayer = 1000, maxIntersection = -1, onProgress = null,
          subMatrices = null, planes: customPlanes = null } = opts;

  const pool = new VertexPool();
  // a custom plane list (the plane editor) takes the polyhedron's place entirely
  const planes = customPlanes ? planesFromList(customPlanes) : facePlanes(poly);
  const arrangement = makeArrangement(planes, pool, maxIntersection, onProgress);
  const layers = makeLayers(arrangement);

  const cellLayers = [];
  /*
   * A facet cap stops the arrangement short, and the shells past it are rubble.
   *
   * clipAgainstPlane() drops a facet once it has been clipped maxIntersection
   * times, so the outer shells are missing most of their facets and the cells
   * assembled from them are fragments scattered through the shell rather than a
   * tiling of it. The snub dodecahedron showed this plainly: 92 planes, so
   * suggestDepth caps it at 12, and from layer 12 outwards only 150 of 1650
   * cells survived.
   *
   * Where the boundary falls is not a guess. Comparing capped against uncapped
   * builds over u34/u27/u17/u28 at caps 6, 8, 10 and 12, the first cell layer
   * whose contents differ is *always* the cap itself, and every layer below it
   * is identical — a facet reaching shell L has been clipped L times. So layers
   * 0..cap-1 are exactly right and the rest were never real.
   *
   * Stop there. Fewer layers, all of them true; raising the depth control (or
   * "every") builds the arrangement further and returns them.
   */
  const supported = maxIntersection >= 0 ? maxIntersection : Infinity;
  const n = Math.min(layers.length, maxLayer, supported);
  for (let l = 0; l < n; l++) {
    const cells = makeCellsBetween(l === 0 ? [] : layers[l - 1], layers[l], l, pool);
    const orbits = makeSymmetricCells(cells, matrices, l);
    for (const o of orbits) {
      o.subCells = subMatrices ? makeSubCells(o, subMatrices)
                               : [{ cells: o.cells, volume: o.volume, parent: o,
                                    index: 0, layer: l, cellIndex: o.index }];
      // let every primitive cell name the sub-cell that owns it
      for (const s of o.subCells) for (const c of s.cells) c.owner = s;
    }
    cellLayers.push(orbits);
  }

  makeConnectivityGraph(cellLayers);

  /*
   * The radius of the *buildable* arrangement — the farthest vertex of any cell
   * that actually exists. The pool's own maximum is useless for this: the seed
   * polygons are interned at radius FACTOR = 5000, so maxOf(pool) reports the
   * scaffolding, not the building. The camera needs the building.
   */
  let frameRadius = 1e-9;
  for (const layer of cellLayers)
    for (const orbit of layer)
      for (const cell of orbit.cells)
        for (const f of cell.top)
          for (const id of f.v) {
            const r = len(pool.get(id));
            if (r > frameRadius) frameRadius = r;
          }

  return { pool, planes, arrangement, layers, cellLayers, frameRadius,
           maxRadius: maxOf(pool.pts, len) };
}

/**
 * Which face planes give a genuinely different diagram.
 *
 * A diagram is drawn on one plane of the arrangement. Two planes that the
 * symmetry group carries onto each other carry their cells along with them, so
 * they give the same picture with the same regions selected — offering both is
 * noise, and offering all 120 planes of a dual is worse than noise. Only
 * inequivalent faces should be listed: the cuboctahedron under O_h has a square
 * face and a triangular face and nothing else.
 *
 * The orbits are found geometrically rather than from a table: intern the point
 * of each plane closest to the origin, push it through every matrix of the
 * group, and see which plane it lands on. That is the same interning trick
 * makeSymmetricCells uses, so it agrees with how the cells were grouped.
 *
 * Each representative is labeled by the innermost facet on its plane, which for
 * a convex solid is the solid's own face there — so "4 sides" really does mean
 * the square face of the cuboctahedron.
 */
export function planeClasses(stel, matrices) {
  const { planes } = stel;
  const pool = new VertexPool(1e-6);
  const idOf = new Map();
  planes.forEach((p, i) => {
    const id = pool.intern(mul(p.n, p.d));
    if (!idOf.has(id)) idOf.set(id, i);
  });

  const group = new Int32Array(planes.length).fill(-1);
  const reps = [];
  for (let i = 0; i < planes.length; i++) {
    if (group[i] >= 0) continue;
    const g = reps.length;
    group[i] = g;
    reps.push(i);
    const p0 = mul(planes[i].n, planes[i].d);
    for (const m of (matrices || [])) {
      const j = idOf.get(pool.intern(matMul(m, p0)));
      if (j != null && group[j] < 0) group[j] = g;
    }
  }
  return { group, reps };
}

export function diagramFaces(stel, matrices) {
  const { arrangement } = stel;
  const { group, reps } = planeClasses(stel, matrices);

  const out = reps.map(i => {
    // the facet of this plane nearest the origin — the original polygon face
    let core = null, rmin = Infinity;
    for (const f of (arrangement[i] || [])) {
      if (f.layer !== 0) continue;
      const c = facetCenter(f, stel.pool);
      const r = dot(c, c);
      if (r < rmin) { rmin = r; core = f; }
    }
    return { index: i, sides: core ? core.v.length : 0, count: 0 };
  });
  for (const g of group) if (g >= 0) out[g].count++;
  return out;
}

/** the sub-cell a diagram facet belongs to: the cell it caps, else the one below it */
export function subCellForFacet(facet) {
  return facet.cellBelow?.owner || facet.cellAbove?.owner || null;
}

/** the two cells a facet separates: the one it caps, and the one it floors */
export function cellsAcrossFacet(facet) {
  return { below: facet.cellBelow?.owner || null, above: facet.cellAbove?.owner || null };
}

/**
 * For each face of an extractMesh() surface: the solid cell it belongs to, and
 * the empty neighbor across it. That is what a click means — remove the solid
 * one, or add the empty one.
 *
 * Not the same as cellsAcrossFacet: below/above are fixed geometric labels, and
 * only a facet that caps its cell has the solid one below. On an underside the
 * solid is above and the gap below, so the pair swaps.
 */
export function cellsAcrossFace(mesh, i) {
  const f = mesh.facetRefs[i];
  const below = f.cellBelow?.owner || null, above = f.cellAbove?.owner || null;
  return mesh.facetTop[i] ? { inside: below, outside: above }
                          : { inside: above, outside: below };
}

// ---------------------------------------------------------------- connectivity

/**
 * Link each sub-cell to the ones directly beneath and above it.
 *
 * A stellation only holds together if every cell rests on cells that are
 * themselves present — Vladimir's UI calls that a cell's "supporting" set, and
 * shift-clicking pulls the whole set in at once. Port of
 * Stellation.makeConnectivityGraph, but built at the SUB-cell level: selection
 * happens per sub-cell, and the original's graph is indexed by whole-cell index
 * even where the UI looks up sub-cells, which only agrees when nothing is chiral.
 *
 * A facet that caps cell X (X is below it) and floors cell Y (Y is above it) is
 * exactly the contact between them, so the shared facet objects give the graph
 * directly — no geometric search needed.
 */
export function makeConnectivityGraph(cellLayers) {
  for (const layer of cellLayers)
    for (const orbit of layer)
      for (const s of orbit.subCells) { s.top = new Set(); s.bottom = new Set(); }

  for (const layer of cellLayers) {
    for (const orbit of layer) {
      for (const s of orbit.subCells) {
        for (const c of s.cells) {
          for (const f of c.top) {
            const above = f.cellAbove?.owner;
            if (above && above !== s) { s.top.add(above); above.bottom.add(s); }
          }
        }
      }
    }
  }
  return cellLayers;
}

/**
 * Every sub-cell that must be present for `sub` to be supported: itself, what it
 * rests on, what that rests on, and so on down to the core.
 * Port of Selection.getSupportCells.
 */
export function supportSet(sub) {
  const out = new Set([sub]);
  const stack = [sub];
  while (stack.length) {
    const s = stack.pop();
    for (const b of (s.bottom || [])) if (!out.has(b)) { out.add(b); stack.push(b); }
  }
  return out;
}

/** Everything resting on `sub`, transitively — what would be left unsupported if it went away. */
export function dependentSet(sub) {
  const out = new Set([sub]);
  const stack = [sub];
  while (stack.length) {
    const s = stack.pop();
    for (const t of (s.top || [])) if (!out.has(t)) { out.add(t); stack.push(t); }
  }
  return out;
}

// ---------------------------------------------------------------- selection

/**
 * A selection is a Set of "layer.cell.sub" keys. These helpers convert between
 * that set and the compact string the original writes into .stel files, e.g.
 *   {0,1,2,3,4,5(1[1])}
 * A bare layer index means "all cells, all subcells"; (…) narrows to cells;
 * […] narrows to subcells. See Selection.makeStellationName_v2 / parseCells_v2.
 */
export const selKey = (l, c, s) => `${l}.${c}.${s}`;

export function formatCells(stel, selected) {
  const parts = [];
  let needComma = false;
  stel.cellLayers.forEach((layer, l) => {
    const cellStrs = [];
    let layerFull = layer.length > 0;
    layer.forEach((orbit, c) => {
      const on = orbit.subCells.filter(s => selected.has(selKey(l, c, s.index)));
      if (on.length === 0) { layerFull = false; return; }
      if (on.length === orbit.subCells.length) cellStrs.push({ s: String(c), full: true });
      else {
        layerFull = false;
        cellStrs.push({ s: `${c}[${on.map(x => x.index).join(',')}]`, full: false });
      }
    });
    if (cellStrs.length === 0) return;
    if (needComma) parts.push(',');
    if (layerFull) { parts.push(String(l)); needComma = true; }
    else {
      let inner = '', comma = false;
      for (const cs of cellStrs) {
        if (comma) inner += ',';
        inner += cs.s;
        comma = cs.full;
      }
      parts.push(`${l}(${inner})`);
      needComma = false;
    }
  });
  return '{' + parts.join('') + '}';
}

export function parseCells(stel, str) {
  const selected = new Set();
  if (!str) return selected;
  const toks = str.match(/\d+|[{}()\[\],]/g) || [];
  let i = 0;
  const peek = () => toks[i];
  const next = () => toks[i++];

  const allSubs = (l, c) => {
    const orbit = stel.cellLayers[l]?.[c];
    if (orbit) for (const s of orbit.subCells) selected.add(selKey(l, c, s.index));
  };
  const allCells = (l) => {
    (stel.cellLayers[l] || []).forEach((_, c) => allSubs(l, c));
  };

  if (peek() === '{') next();
  while (i < toks.length) {
    const t = next();
    if (t === '}' ) break;
    if (t === ',') continue;
    if (!/^\d+$/.test(t)) continue;
    const layer = Number(t);
    if (peek() !== '(') { allCells(layer); continue; }
    next();                                   // consume '('
    while (i < toks.length && peek() !== ')') {
      const ct = next();
      if (ct === ',') continue;
      if (!/^\d+$/.test(ct)) continue;
      const cell = Number(ct);
      if (peek() !== '[') { allSubs(layer, cell); continue; }
      next();                                 // consume '['
      while (i < toks.length && peek() !== ']') {
        const st = next();
        if (/^\d+$/.test(st)) selected.add(selKey(layer, cell, Number(st)));
      }
      next();                                 // consume ']'
    }
    next();                                   // consume ')'
  }
  return selected;
}

/** the sub-cells a selection refers to, ready for extractMesh */
export function selectedSubCells(stel, selected) {
  const out = [];
  stel.cellLayers.forEach((layer, l) => {
    layer.forEach((orbit, c) => {
      for (const s of orbit.subCells) if (selected.has(selKey(l, c, s.index))) out.push(s);
    });
  });
  return out;
}

// ---------------------------------------------------------------- atomic selection

/*
 * The editing-symmetry model.
 *
 * A selection is ultimately a set of PRIMITIVE cells — "atoms" — keyed
 * "layer.orbit.member". The (layer, orbit) indexing and each orbit's member
 * order depend only on the polyhedron, the depth and the polyhedron symmetry,
 * never on the stellation symmetry: makeArrangement and makeSymmetricCells run
 * before subMatrices is ever consulted, and makeSubCells reads orbit.cells
 * without reordering it. So an atom key names the same piece of space under
 * every stellation symmetry — which is what lets a selection survive a
 * symmetry switch. The group's only role is deciding how big a bite an
 * editing operation takes: a click toggles the clicked atom's whole sub-cell.
 *
 * The sub-key world above stays untouched — the figure pages drive it
 * directly — and the two worlds meet only where a sub-cell is expanded to its
 * atoms or a set of atoms is tested against the current grouping.
 */

export const atomKey = (l, c, m) => `${l}.${c}.${m}`;
export const atomKeyOf = (cell) => atomKey(cell.orbit.layer, cell.orbit.index, cell.memberIndex);

/**
 * Re-split every orbit's sub-cells under a different stellation symmetry,
 * in place, without rebuilding the arrangement — the Java applet's
 * StellationController.createSubcells. Everything derived from the grouping
 * is redone: the sub-cells themselves, the owner backlinks picks rely on,
 * and the support graph. The orbits, their member lists and the arrangement
 * are untouched, which is the whole point.
 */
export function regroupSubCells(stel, subMatrices) {
  for (const layer of stel.cellLayers) {
    for (const o of layer) {
      o.subCells = subMatrices ? makeSubCells(o, subMatrices)
                               : [{ cells: o.cells, volume: o.volume, parent: o,
                                    index: 0, layer: o.layer, cellIndex: o.index }];
      for (const s of o.subCells) for (const c of s.cells) c.owner = s;
    }
  }
  makeConnectivityGraph(stel.cellLayers);
  return stel;
}

/**
 * The primitive cells an atom-key set refers to, in fixed layer/orbit/member
 * order. That fixed order is load-bearing: extractMesh's facet-cancellation
 * maps iterate in insertion order, so the same atom set yields an identical
 * mesh whatever the current grouping — the invariant the symmetry switch is
 * tested against. Wrap the result as [{ cells }] for extractMesh/createDiagram.
 */
export function selectedCells(stel, atomSet) {
  const out = [];
  stel.cellLayers.forEach((layer, l) => {
    layer.forEach((orbit, c) => {
      orbit.cells.forEach((cell, m) => {
        if (atomSet.has(atomKey(l, c, m))) out.push(cell);
      });
    });
  });
  return out;
}

/** every atom key of the sub-cells named by a sub-key set */
export function subKeysToAtoms(stel, subKeys) {
  const atoms = new Set();
  stel.cellLayers.forEach((layer, l) => {
    layer.forEach((orbit, c) => {
      for (const s of orbit.subCells) {
        if (!subKeys.has(selKey(l, c, s.index))) continue;
        for (const cell of s.cells) atoms.add(atomKeyOf(cell));
      }
    });
  });
  return atoms;
}

/**
 * If the atom set is a union of current sub-cells — every sub all-or-nothing
 * — return the equivalent sub-key Set; otherwise null. This is the alignment
 * test: aligned selections serialize in the legacy notation, byte for byte.
 */
export function atomsAsSubKeys(stel, atomSet) {
  const subKeys = new Set();
  for (const layer of stel.cellLayers) {
    for (const orbit of layer) {
      for (const s of orbit.subCells) {
        let on = 0;
        for (const cell of s.cells) if (atomSet.has(atomKeyOf(cell))) on++;
        if (on === 0) continue;
        if (on !== s.cells.length) return null;
        subKeys.add(selKey(orbit.layer, orbit.index, s.index));
      }
    }
  }
  return subKeys;
}

/**
 * Serialize an atomic selection.
 *
 * Aligned under the current grouping, it DELEGATES to formatCells, so the
 * output is byte-identical to what this build has always written and any old
 * reader still understands it. Unaligned, it writes the same grammar against
 * member indices with a `c` prefix — c{0,1(2[0,3])} — which no grouping is
 * needed to read back, since member order is a property of the orbit alone.
 */
export function formatCellsAtoms(stel, atomSet) {
  const subKeys = atomsAsSubKeys(stel, atomSet);
  if (subKeys) return { text: formatCells(stel, subKeys), aligned: true };

  const parts = [];
  let needComma = false;
  stel.cellLayers.forEach((layer, l) => {
    const cellStrs = [];
    let layerFull = layer.length > 0;
    layer.forEach((orbit, c) => {
      const on = [];
      orbit.cells.forEach((cell, m) => { if (atomSet.has(atomKey(l, c, m))) on.push(m); });
      if (on.length === 0) { layerFull = false; return; }
      if (on.length === orbit.cells.length) cellStrs.push({ s: String(c), full: true });
      else {
        layerFull = false;
        cellStrs.push({ s: `${c}[${on.join(',')}]`, full: false });
      }
    });
    if (cellStrs.length === 0) return;
    if (needComma) parts.push(',');
    if (layerFull) { parts.push(String(l)); needComma = true; }
    else {
      let inner = '', comma = false;
      for (const cs of cellStrs) {
        if (comma) inner += ',';
        inner += cs.s;
        comma = cs.full;
      }
      parts.push(`${l}(${inner})`);
      needComma = false;
    }
  });
  return { text: 'c{' + parts.join('') + '}', aligned: false };
}

/**
 * Parse either form into atom keys. `indexing === 'cells'` (or the c-prefix)
 * reads member indices; anything else is the legacy sub-index notation,
 * parsed by the untouched parseCells against the CURRENT grouping and then
 * expanded to atoms.
 */
export function parseCellsAny(stel, str, indexing = null) {
  if (!str) return new Set();
  const memberForm = indexing === 'cells' || /^\s*c\{/.test(str);
  if (!memberForm) return subKeysToAtoms(stel, parseCells(stel, str));

  const selected = new Set();
  const toks = str.replace(/^\s*c/, '').match(/\d+|[{}()\[\],]/g) || [];
  let i = 0;
  const peek = () => toks[i];
  const next = () => toks[i++];

  const allMembers = (l, c) => {
    const orbit = stel.cellLayers[l]?.[c];
    if (orbit) orbit.cells.forEach((_, m) => selected.add(atomKey(l, c, m)));
  };
  const allCells = (l) => { (stel.cellLayers[l] || []).forEach((_, c) => allMembers(l, c)); };

  if (peek() === '{') next();
  while (i < toks.length) {
    const t = next();
    if (t === '}') break;
    if (t === ',') continue;
    if (!/^\d+$/.test(t)) continue;
    const layer = Number(t);
    if (peek() !== '(') { allCells(layer); continue; }
    next();                                   // consume '('
    while (i < toks.length && peek() !== ')') {
      const ct = next();
      if (ct === ',') continue;
      if (!/^\d+$/.test(ct)) continue;
      const cell = Number(ct);
      if (peek() !== '[') { allMembers(layer, cell); continue; }
      next();                                 // consume '['
      while (i < toks.length && peek() !== ']') {
        const st = next();
        if (!/^\d+$/.test(st)) continue;
        const m = Number(st);
        if (m < (stel.cellLayers[layer]?.[cell]?.cells.length || 0)) {
          selected.add(atomKey(layer, cell, m));
        }
      }
      next();                                 // consume ']'
    }
    next();                                   // consume ')'
  }
  return selected;
}

/**
 * Serialize an atomic selection under a grouping OTHER than the current one,
 * without disturbing it — a transient split, formatted by the untouched
 * formatCells against a shallow view. Used for the .stel export of an
 * unaligned selection, which legacy readers can only follow when it is
 * written under a group that makes it whole sub-cells — E always does, one
 * cell per sub. Returns null if the selection is not aligned even under the
 * given group (impossible under E).
 */
export function formatCellsUnder(stel, atomSet, subMatrices) {
  const view = {
    cellLayers: stel.cellLayers.map(layer => layer.map(o => {
      const copy = { ...o };
      copy.subCells = makeSubCells(copy, subMatrices);
      return copy;
    })),
  };
  const subKeys = new Set();
  for (const layer of view.cellLayers) {
    for (const orbit of layer) {
      for (const s of orbit.subCells) {
        let on = 0;
        for (const cell of s.cells) if (atomSet.has(atomKeyOf(cell))) on++;
        if (on === 0) continue;
        if (on !== s.cells.length) return null;
        subKeys.add(selKey(orbit.layer, orbit.index, s.index));
      }
    }
  }
  return formatCells(view, subKeys);
}

/** parse a .stel file: polyhedron / planes / symmetry / cells */
export function parseStel(text) {
  const out = {};
  const strip = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const grab = (kw) => {
    const m = strip.match(new RegExp(kw + '\\s*"([^"]*)"', 'i'));
    return m ? m[1] : null;
  };
  out.polyhedron = grab('polyhedron');
  out.planes = grab('planes');
  out.cells = grab('cells');
  out.exportLengthUnit = grab('exportLengthUnit');
  const sym = grab('symmetry');
  if (sym) {
    const p = sym.split(/[\s/]+/).filter(Boolean);
    out.polySymmetry = p[0];
    out.stellSymmetry = p[1] || p[0];
  }
  return out;
}

export function writeStel({ polyhedron, polySymmetry, stellSymmetry, cells, exportLengthUnit = 0.01 }) {
  return [
    `// stellation generated from polyhedron ${polyhedron}`,
    `// exported from the Stellation web app (port of Vladimir Bulatov's applet)`,
    `polyhedron "${polyhedron}"`,
    `symmetry "${polySymmetry} / ${stellSymmetry}"`,
    `cells "${cells}"`,
    `exportLengthUnit "${exportLengthUnit}"`,
    '',
  ].join('\n');
}

// ---------------------------------------------------------------- 2D diagram

/**
 * Project one plane's facets into 2D for the classic stellation diagram.
 * Faithful to Stellation.createDiagram: translate the innermost facet's center
 * to the origin, rotate the plane normal onto +Z, then optionally spin a chosen
 * vertex up to +Y.
 */
export function createDiagram(stel, planeIndex, selectedOrbits, vertexUp = 0) {
  const { pool, arrangement } = stel;
  // an out-of-range index — or an arrangement with no planes at all, which a
  // plane sheet of nothing but central planes can produce — draws nothing
  const all = arrangement[planeIndex] || [];
  if (!all.length) return null;

  /*
   * Only the shells that exist as cells. buildStellation stops at the last
   * shell the arrangement actually supports (see the note there), and the
   * diagram has to stop at the same one or it draws rubble the 3D view does not.
   *
   * Beyond that point the plane is not empty, it is sparse, which is worse:
   * f.layer counts the planes a facet lies outside of and is incremented in two
   * places — once when a facet falls entirely outside a plane, once for the
   * outer piece when a facet is split — and only the second is capped. So the
   * facets that got deep without ever being split survive alone, scattered
   * across a shell whose other facets were dropped. On the snub dodecahedron
   * capped at 12, shell 20 keeps 1 facet of 92.
   *
   * The extent is measured from the same list, so those strays cannot stretch
   * the frame either.
   */
  const depth = stel.cellLayers ? stel.cellLayers.length : Infinity;
  const facets = all.length && depth < Infinity ? all.filter(f => f.layer < depth) : all;
  if (!facets.length) return null;

  // the facet nearest the origin defines the frame
  let inner = facets[0], rmin = Infinity;
  for (const f of facets) {
    const c = facetCenter(f, pool);
    const r = dot(c, c);
    if (r < rmin) { rmin = r; inner = f; }
  }

  const center = facetCenter(inner, pool);
  const normal = normalize(facetArea(inner, pool));

  // rotation taking `normal` to +Z
  const R1 = rotationBetween(normal, v3(0, 0, 1));

  let R = R1;
  if (vertexUp < inner.v.length) {
    const p = matMul(R1, sub(pool.get(inner.v[vertexUp]), center));
    const R2 = rotationBetween(normalize(v3(p.x, p.y, 0)), v3(0, 1, 0));
    R = mat3mul(R2, R1);
  }

  const project = (id) => {
    const p = matMul(R, sub(pool.get(id), center));
    return [p.x, p.y];
  };

  // the projection frame, so the caller can put OTHER world geometry — the
  // symmetry axes' crossing points, the mirror planes' trace lines — onto the
  // same drawing. R is row-major 3x3; a world point maps as R·(p − center).
  const frame = { R: [...R], center: [center.x, center.y, center.z] };

  // which facets are on the visible surface of the current selection
  const selected = new Set();
  const kind = new Map();
  for (const orbit of selectedOrbits) {
    for (const cell of orbit.cells) {
      for (const f of cell.top) {
        if (kind.get(f) === 0) kind.delete(f); else kind.set(f, 1);
      }
      for (const f of cell.bottom) {
        if (kind.get(f) === 1) kind.delete(f); else kind.set(f, 0);
      }
    }
  }
  for (const f of kind.keys()) if (f.plane === planeIndex) selected.add(f);

  return {
    planeIndex,
    frame,
    facets: facets.map(f => ({
      facet: f,
      layer: f.layer,
      selected: selected.has(f),
      // 1 = this face of the solid looks outward, 0 = it looks inward (it lines
      // a cavity). The diagram shows the surface, not the volume, so the two
      // need to be told apart: see the note in DiagramView.draw.
      facing: selected.has(f) ? (kind.get(f) === 0 ? 0 : 1) : null,
      poly: f.v.map(project),
    })),
    extent: diagramExtent(facets, project),
  };
}

/**
 * How wide to draw the stellation diagram.
 *
 * Fitting to the outermost facet is right for the classic solids, where the
 * biggest facet is only a few times the typical one. But two nearly parallel
 * planes meet enormously far away, so a deep arrangement grows a handful of
 * facets hundreds of times the size of the rest — on the great snub
 * icosidodecahedron the largest is 400x the median — and fitting to those
 * squeezes every cell you might actually want to click into a single dot.
 *
 * So: fit to the outermost facet normally, and only fall back to a percentile
 * when the tail is genuinely extreme. That leaves every well-behaved diagram
 * exactly as it was, and rescues the pathological ones.
 */
export function diagramExtent(facets, project) {
  const radii = facets.map(f => {
    let r = 0;
    for (const id of f.v) {
      const [x, y] = project(id);
      r = Math.max(r, Math.hypot(x, y));
    }
    return r;
  }).sort((a, b) => a - b);

  if (!radii.length) return 1;
  const max = radii[radii.length - 1];
  const at = p => radii[Math.min(radii.length - 1, Math.floor(p * radii.length))];
  const p90 = at(0.90);
  if (p90 > 0 && max > p90 * 6) return at(0.95) * 1.2;   // runaway tail: crop it
  return max;
}

/** rotation matrix taking unit vector `from` onto unit vector `to` */
export function rotationBetween(from, to) {
  const v = cross(from, to);
  const c = dot(from, to);
  if (c > 1 - 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (c < -1 + 1e-12) {
    // 180 degrees: rotate about any axis orthogonal to `from`
    let axis = cross(from, v3(1, 0, 0));
    if (dot(axis, axis) < 1e-8) axis = cross(from, v3(0, 1, 0));
    axis = normalize(axis);
    const { x, y, z } = axis;
    return [2 * x * x - 1, 2 * x * y, 2 * x * z,
            2 * y * x, 2 * y * y - 1, 2 * y * z,
            2 * z * x, 2 * z * y, 2 * z * z - 1];
  }
  const k = 1 / (1 + c);
  const { x, y, z } = v;
  return [
    1 + k * (-y * y - z * z), -z + k * x * y,          y + k * x * z,
    z + k * x * y,            1 + k * (-x * x - z * z), -x + k * y * z,
    -y + k * x * z,           x + k * y * z,            1 + k * (-x * x - y * y),
  ];
}

export function mat3mul(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}

// ---------------------------------------------------------------- coset coloring

/*
 * Label the arrangement's PLANES by the cosets of a subgroup H in a group G —
 * as the app wires it, G is the POLYHEDRON group and H a subgroup of it chosen
 * beside the color menu. The facet version above is the same labeling on
 * smaller pieces; the two differ in what wears one color, not in handedness.
 * Returns { planes: Int32Array(plane -> coset, -1 for gray), count }.
 *
 * Planes, not cells, because the classical pictures this exists for are
 * plane-partitions. The compound of five tetrahedra IS a partition of the
 * icosahedron's twenty face planes into five sets of four; the classical
 * five-coloring of the icosahedron paints each face by which tetrahedron its
 * plane belongs to; and a spike of the compound is one color precisely
 * because every facet of its surface lies in that one tetrahedron's planes.
 * Coloring the facets by their planes therefore colors every one of those
 * pictures correctly at every depth.
 *
 * It is also what makes the labeling COHERENT. A first version colored
 * cells, orbit by orbit, and each orbit independently chose a representative;
 * the choices did not agree between orbits — each fixes its own conjugate of
 * H — and the five colors came out shuffled from one shell to the next. The
 * planes form a single orbit for every solid with one kind of face, so one
 * representative anchors the entire figure; a solid with several kinds of
 * face at worst rotates colors between kinds, never within one.
 *
 * The construction, on each plane orbit under G: a representative q₀ is
 * SOUGHT whose stabiliser sits inside H — the labeling "plane g·q₀ wears the
 * coset of g" is well defined exactly then. For T inside I that
 * representative is a plane of one of the two T-invariant tetrahedra, and
 * choosing it is what makes the five tetrahedra appear; which enantiomorph is
 * found first decides the compound's handedness, deterministically. An orbit
 * with no such representative has no coset coloring and is gray rather than
 * wrong — under the full Ih every face stabiliser holds mirrors that T lacks,
 * which is why the five-coloring needs the chiral groups. And a plane the
 * whole subgroup fixes is gray by instruction: it sits on the symmetry rather
 * than being carried by it.
 */

/**
 * The same labeling on smaller pieces: the arrangement's FACETS.
 *
 * A facet is a single flat piece of surface, so "these facets share a color"
 * says exactly that the subgroup carries one onto the other — which is the
 * claim the coloring is making, at the scale you are actually looking at.
 * Planes are coarser: a whole plane takes one color, so a figure with facets
 * of both hands in one plane cannot be told apart, and the icosahedron under
 * cosets of I comes out entirely gray when the two hands of its chiral cells
 * are precisely what there is to see.
 *
 * This replaced a version that partitioned CELLS by their H-orbits. That one
 * was wrong in a way worth remembering: H-orbits exist unconditionally, so it
 * could never gray however badly the subgroup fitted, and orbits smaller than
 * |H| are not cosets at all — the icosahedron's first shell came out 4+4+12
 * and was painted as though those were three cosets.
 *
 * Returns { of: Map(facet -> class, -1 for gray), count }.
 */
export function facetCosetClasses(stel, matrices, subMatrices, preferCells = null) {
  const sameMat = (a, b) => {
    for (let i = 0; i < 9; i++) if (Math.abs(a[i] - b[i]) > 1e-6) return false;
    return true;
  };
  const inSub = (m) => subMatrices.some(x => sameMat(m, x));
  const tmul = (r, g) => {
    const o = new Array(9);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        o[i * 3 + j] = r[i] * g[j] + r[3 + i] * g[3 + j] + r[6 + i] * g[6 + j];
    return o;
  };
  const reps = [];
  const cosetOf = matrices.map((g) => {
    for (let i = 0; i < reps.length; i++) if (inSub(tmul(reps[i], g))) return i;
    reps.push(g);
    return reps.length - 1;
  });

  /*
   * Facets are matched by their centroids, as cells are matched by their
   * centers: a facet is a convex polygon in a plane, so its centroid names it
   * uniquely among the facets of the arrangement.
   */
  const pool = new VertexPool(1e-6);
  const byCenter = new Map();
  const all = [];
  for (const plane of stel.arrangement) {
    for (const f of plane) {
      let x = 0, y = 0, z = 0;
      for (const id of f.v) { const q = stel.pool.get(id); x += q.x; y += q.y; z += q.z; }
      const n = f.v.length || 1;
      f._cc = v3(x / n, y / n, z / n);
      byCenter.set(pool.intern(f._cc), f);
      all.push(f);
    }
  }
  const map = (g, f) => byCenter.get(pool.intern(matMul(g, f._cc)));

  /*
   * Anchored to the plane labeling wherever that exists.
   *
   * A coset labeling is canonical only WITHIN one orbit: swap an orbit's
   * representative for one outside H and every label in it shifts together,
   * and nothing in the group relates one orbit's choice to another's. So
   * labeling each facet orbit independently — which is what this did at
   * first, and what the cell coloring before it did — makes "color 0" mean
   * a different thing in different orbits, and the five tetrahedra come out
   * shuffled. Every facet lies in a plane, and the planes are one orbit with
   * one representative, so where the plane labeling exists it is the shared
   * frame that makes the facets agree. Where it does not — the icosahedron
   * under cosets of I, where every plane grays on its mirrors — each facet
   * orbit is labeled on its own, which still separates the two hands, but
   * only within an orbit.
   */
  const byPlane = cosetClasses(stel, matrices, subMatrices, preferCells);
  const planeAnchored = byPlane.planes.some(k => k >= 0);

  const of = new Map();
  const blends = new Map();
  if (planeAnchored) {
    for (const f of all) {
      of.set(f, byPlane.planes[f.plane]);
      const b = byPlane.blends && byPlane.blends[f.plane];
      if (b) blends.set(f, b);
    }
    return { of, count: byPlane.count, blends };
  }

  /*
   * No plane frame exists, so the facet orbits must be labeled directly —
   * and labeled COHERENTLY. Each orbit offers several genuinely different
   * candidate labelings (one per H-class of valid representatives), and an
   * independent choice per orbit makes "color 0" mean a different sub-figure
   * in different orbits: on the compound of five tetrahedra under Ih/T that
   * shuffle left not one of the sixty spikes wearing a single color. What
   * relates the orbits is the figure itself: facets that cap the SAME cell
   * belong to the same component, so a candidate is scored by how well it
   * agrees, across each cell's cap, with the facets already labeled — the
   * cells stitch the orbits together exactly where the picture needs them
   * to agree. The caller's selected cells break the remaining tie, which is
   * the hand of a chiral compound, the same steering cosetClasses takes;
   * with nothing to prefer, the first candidate wins, deterministically.
   */
  const capMates = (f) => {
    const c = f.cellBelow;
    return c && c.top ? c.top : null;
  };
  for (const seed of all) {
    if (of.has(seed)) continue;
    const orbit = [];
    for (const g of matrices) {
      const f = map(g, seed);
      if (f && !of.has(f) && !orbit.includes(f)) orbit.push(f);
    }
    // every representative whose stabiliser sits inside H, or the orbit is gray
    const candidates = [];
    for (const f of orbit) {
      let ok = true;
      for (const g of matrices) if (map(g, f) === f && !inSub(g)) { ok = false; break; }
      if (ok) candidates.push(f);
    }
    if (!candidates.length) {
      // no crisp labeling — blend from the best-overlapping anchor, exactly
      // as the plane path does; total mixes stay honestly gray
      let anchor = null, overlap = 0, stabSize = 0;
      for (const f of orbit) {
        let s = 0, o = 0;
        for (const g of matrices) {
          if (map(g, f) !== f) continue;
          s++;
          if (inSub(g)) o++;
        }
        if (o > overlap) { anchor = f; overlap = o; stabSize = s; }
      }
      const mixSize = overlap ? stabSize / overlap : reps.length;
      if (!anchor || mixSize >= reps.length) {
        for (const f of orbit) of.set(f, -1);
        continue;
      }
      const sets = new Map();
      for (let gi = 0; gi < matrices.length; gi++) {
        const f = map(matrices[gi], anchor);
        if (!f) continue;
        if (!sets.has(f)) sets.set(f, new Set());
        sets.get(f).add(cosetOf[gi]);
      }
      for (const f of orbit) {
        of.set(f, -1);
        const s = sets.get(f);
        if (s && s.size > 1 && s.size < reps.length)
          blends.set(f, Int32Array.from([...s].sort((a, b) => a - b)));
      }
      continue;
    }
    const tryRep = (rep) => {
      const lab = new Map();
      for (let gi = 0; gi < matrices.length; gi++) {
        const f = map(matrices[gi], rep);
        if (f && !lab.has(f)) lab.set(f, cosetOf[gi]);
      }
      return lab;
    };
    const distinct = [];
    for (const rep of candidates) {
      const lab = tryRep(rep);
      const sig = orbit.map(f => lab.get(f)).join(',');
      if (!distinct.some(d => d.sig === sig)) distinct.push({ sig, lab });
    }
    let best = distinct[0];
    if (distinct.length > 1) {
      let bestKey = null;
      for (const cand of distinct) {
        // structural term: disagreements with already-labeled facets that
        // cap the same cells — zero for the first orbit, decisive after it
        let clash = 0;
        for (const f of orbit) {
          const mates = capMates(f);
          if (!mates) continue;
          const k = cand.lab.get(f);
          for (const m of mates) {
            const km = of.get(m);
            if (km !== undefined && km >= 0 && km !== k) clash++;
          }
        }
        // the figure's term: the selected cells' caps should stay monochrome
        let mixed = 0;
        if (preferCells && preferCells.length) {
          for (const c of preferCells) {
            const seen = new Set();
            for (const f of c.top || []) {
              const k = cand.lab.has(f) ? cand.lab.get(f) : of.get(f);
              if (k !== undefined && k >= 0) seen.add(k);
            }
            if (seen.size > 1) mixed += seen.size - 1;
          }
        }
        const key = [clash, mixed];
        if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
          bestKey = key; best = cand;
        }
      }
    }
    for (const [f, k] of best.lab) if (!of.has(f)) of.set(f, k);
    for (const f of orbit) {
      let fixed = true;
      for (const h of subMatrices) if (map(h, f) !== f) { fixed = false; break; }
      if (fixed) of.set(f, -1);
    }
  }
  return { of, count: reps.length, blends };
}

/*
 * The OTHER half of "cosets": color pieces by their ORBITS under H alone.
 *
 * Two pieces share a color exactly when some motion of H carries one onto
 * the other — on a free orbit these classes are the right cosets Hg, and in
 * general the double cosets H\G/S. Where the block coloring above answers
 * "which copy of the sub-figure is this?", this answers "what does H itself
 * preserve?": the H-invariant sub-figures appear as the small classes (T on
 * the icosahedron's twenty planes gives 4 + 4 + 12 — the two T-invariant
 * tetrahedra and the rest), applying any h ∈ H fixes every class pointwise,
 * and the coloring exists for EVERY subgroup with no gray and no anchor —
 * orbits are intrinsic, so nothing needs choosing and nothing can shuffle.
 * Class sizes vary, which is exactly why these are not cosets; a first
 * version of the coset coloring partitioned cells this way and painted
 * 4 + 4 + 12 as if it were three cosets of an order-12 group.
 *
 * Labels planes, facets and cells in one pass, by first appearance in a
 * fixed order, so the result is deterministic. Returns
 *   { planes: Int32Array, planeCount,
 *     facets: Map(facet -> orbit), facetCount,
 *     cells:  Map(cell  -> orbit), cellCount }.
 */
export function subgroupOrbits(stel, subMatrices) {
  const { planes } = stel;

  // planes, matched by n·d as everywhere else
  const pool = new VertexPool(1e-6);
  const idOf = new Map();
  planes.forEach((q, i) => {
    const id = pool.intern(mul(q.n, q.d));
    if (!idOf.has(id)) idOf.set(id, i);
  });
  const planeOf = new Int32Array(planes.length).fill(-1);
  let planeCount = 0;
  for (let i = 0; i < planes.length; i++) {
    if (planeOf[i] >= 0) continue;
    const k = planeCount++;
    for (const h of subMatrices) {
      const j = idOf.get(pool.intern(matMul(h, mul(planes[i].n, planes[i].d))));
      if (j != null && planeOf[j] < 0) planeOf[j] = k;
    }
  }

  // facets, matched by centroid
  const fpool = new VertexPool(1e-6);
  const byCenter = new Map();
  const allFacets = [];
  for (const plane of stel.arrangement) {
    for (const f of plane) {
      let x = 0, y = 0, z = 0;
      for (const id of f.v) { const q = stel.pool.get(id); x += q.x; y += q.y; z += q.z; }
      const n = f.v.length || 1;
      const c = v3(x / n, y / n, z / n);
      byCenter.set(fpool.intern(c), f);
      allFacets.push({ f, c });
    }
  }
  const facets = new Map();
  let facetCount = 0;
  for (const { f, c } of allFacets) {
    if (facets.has(f)) continue;
    const k = facetCount++;
    for (const h of subMatrices) {
      const m = byCenter.get(fpool.intern(matMul(h, c)));
      if (m && !facets.has(m)) facets.set(m, k);
    }
  }

  // cells, matched by center — the piece a physical model paints
  const cpool = new VertexPool(1e-6);
  const cellAt = new Map();
  const allCells = [];
  for (const layer of stel.cellLayers) {
    for (const orbit of layer) {
      for (const c of orbit.cells) {
        const ctr = cellCenter(c, stel.pool);
        cellAt.set(cpool.intern(ctr), c);
        allCells.push({ c, ctr });
      }
    }
  }
  const cells = new Map();
  let cellCount = 0;
  for (const { c, ctr } of allCells) {
    if (cells.has(c)) continue;
    const k = cellCount++;
    for (const h of subMatrices) {
      const m = cellAt.get(cpool.intern(matMul(h, ctr)));
      if (m && !cells.has(m)) cells.set(m, k);
    }
  }

  return { planes: planeOf, planeCount, facets, facetCount, cells, cellCount };
}

export function cosetClasses(stel, matrices, subMatrices, preferCells = null) {
  const sameMat = (a, b) => {
    for (let i = 0; i < 9; i++) if (Math.abs(a[i] - b[i]) > 1e-6) return false;
    return true;
  };
  const inSub = (m) => subMatrices.some(x => sameMat(m, x));
  // rᵀ·g — the matrices are orthogonal, so the transpose is the inverse
  const tmul = (r, g) => {
    const o = new Array(9);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        o[i * 3 + j] = r[i] * g[j] + r[3 + i] * g[3 + j] + r[6 + i] * g[6 + j];
    return o;
  };

  // the cosets gH, by first appearance: g and g' agree when g'⁻¹g lands in H
  const reps = [];
  const cosetOf = matrices.map((g) => {
    for (let i = 0; i < reps.length; i++) {
      if (inSub(tmul(reps[i], g))) return i;
    }
    reps.push(g);
    return reps.length - 1;
  });

  // planes matched the way planeClasses matches them: by n·d, interned
  const { planes } = stel;
  const pool = new VertexPool(1e-6);
  const idOf = new Map();
  planes.forEach((q, i) => {
    const id = pool.intern(mul(q.n, q.d));
    if (!idOf.has(id)) idOf.set(id, i);
  });
  const mapPlane = (g, i) => {
    const j = idOf.get(pool.intern(matMul(g, mul(planes[i].n, planes[i].d))));
    return j == null ? -1 : j;
  };

  const label = new Int32Array(planes.length).fill(-2);   // -2: not yet reached
  const blends = new Array(planes.length).fill(null);
  for (let i = 0; i < planes.length; i++) {
    if (label[i] !== -2) continue;
    const orbit = [];
    for (const g of matrices) {
      const j = mapPlane(g, i);
      if (j >= 0 && label[j] === -2) { label[j] = -3; orbit.push(j); }
    }
    // every representative whose stabiliser sits inside H
    const candidates = [];
    for (const q of orbit) {
      let ok = true;
      for (const g of matrices) {
        if (mapPlane(g, q) === q && !inSub(g)) { ok = false; break; }
      }
      if (ok) candidates.push(q);
    }
    if (!candidates.length) {
      /*
       * No crisp labeling exists — but a canonical BLEND may. Anchor at a
       * plane q whose stabiliser overlaps H the most; the set of cosets
       * { gH : g·q = p } then has the same size [S : S∩H] for every plane
       * of the orbit, and each plane wears the MIX of exactly the cosets
       * whose translate of the reference sub-figure contains it. Crisp is
       * the [S:S∩H] = 1 case of this; the anchor policy is not optional —
       * a careless anchor blends [S : 1] colors and the picture is mush.
       * When even the best anchor mixes everything (SH = G, e.g. any
       * index-2 subgroup), gray remains the honest answer.
       */
      let anchor = -1, overlap = 0, stabSize = 0;
      for (const q of orbit) {
        let s = 0, o = 0;
        for (const g of matrices) {
          if (mapPlane(g, q) !== q) continue;
          s++;
          if (inSub(g)) o++;
        }
        if (o > overlap) { anchor = q; overlap = o; stabSize = s; }
      }
      const mixSize = overlap ? stabSize / overlap : reps.length;
      if (anchor < 0 || mixSize >= reps.length) {
        for (const q of orbit) label[q] = -1;
        continue;
      }
      const sets = new Map();
      for (let gi = 0; gi < matrices.length; gi++) {
        const j = mapPlane(matrices[gi], anchor);
        if (j < 0) continue;
        if (!sets.has(j)) sets.set(j, new Set());
        sets.get(j).add(cosetOf[gi]);
      }
      for (const q of orbit) {
        label[q] = -1;
        const s = sets.get(q);
        if (s && s.size > 1 && s.size < reps.length)
          blends[q] = Int32Array.from([...s].sort((a, b) => a - b));
      }
      continue;
    }
    /*
     * Different representatives can induce genuinely different partitions of
     * the same planes. The five-tetrahedra case is the sharp example: the
     * icosahedron's twenty planes carry the partition TWICE, once as the
     * right-handed compound and once as the left — the two compounds share
     * the planes — and a T-stabilised representative exists in each. Which
     * hand is wanted is not a group-theoretic fact at all: it is the figure's,
     * so when the caller passes its selected cells, each distinct candidate
     * labeling is scored by how coherently it colors them — a cell bounded
     * by planes of one tetrahedron counts clean under the right hand and
     * mixed under the wrong one — and the cleanest wins. No cells, or a tie
     * (every achiral figure), falls to the first candidate, deterministically.
     */
    const tryRep = (rep) => {
      const out = new Map();
      for (let gi = 0; gi < matrices.length; gi++) {
        const j = mapPlane(matrices[gi], rep);
        if (j >= 0 && !out.has(j)) out.set(j, cosetOf[gi]);
      }
      return out;
    };
    const distinct = [];
    for (const rep of candidates) {
      const lab = tryRep(rep);
      const sig = orbit.map(q => lab.get(q)).join(',');
      if (!distinct.some(d => d.sig === sig)) distinct.push({ sig, lab });
    }
    let best = distinct[0];
    if (distinct.length > 1 && preferCells && preferCells.length) {
      let bestScore = Infinity;
      for (const cand of distinct) {
        let score = 0;
        for (const c of preferCells) {
          const seen = new Set();
          for (const f of c.top || []) {
            const k = cand.lab.get(f.plane);
            if (k !== undefined) seen.add(k);
          }
          if (seen.size > 1) score += seen.size - 1;
        }
        if (score < bestScore) { bestScore = score; best = cand; }
      }
    }
    for (const [j, k] of best.lab) {
      if (label[j] === -3) label[j] = k;
    }
    // invariant under the whole subgroup: on the symmetry, not carried by it
    for (const q of orbit) {
      let fixed = true;
      for (const h of subMatrices) if (mapPlane(h, q) !== q) { fixed = false; break; }
      if (fixed) label[q] = -1;
    }
  }
  return { planes: label, count: reps.length, blends };
}

// ---------------------------------------------------------------- export formats

/**
 * OFF, optionally with a color on each face.
 *
 * The format allows three or four numbers after a face's vertex list, read as
 * its color; readers that do not want them ignore the tail. Written as 0–255
 * integers, which is the reading every viewer agrees on — floats are also
 * legal and are guessed at differently from one program to the next.
 */
export function toOFF(mesh, colors = null) {
  const L = ['OFF', `${mesh.vertices.length} ${mesh.faces.length} 0`];
  for (const v of mesh.vertices) L.push(`${v.x} ${v.y} ${v.z}`);
  const b = (c) => Math.max(0, Math.min(255, Math.round(c * 255)));
  mesh.faces.forEach((f, i) => {
    const c = colors && colors[i];
    L.push(`${f.length} ${f.join(' ')}` +
           (c ? ` ${b(c[0])} ${b(c[1])} ${b(c[2])}` : ''));
  });
  return L.join('\n') + '\n';
}

export function toOBJ(mesh) {
  const L = ['# generated by the Stellation web app'];
  for (const v of mesh.vertices) L.push(`v ${v.x} ${v.y} ${v.z}`);
  for (const f of mesh.faces) L.push('f ' + f.map(i => i + 1).join(' '));
  return L.join('\n') + '\n';
}

export function toSTL(mesh, name = 'stellation') {
  const L = [`solid ${name}`];
  for (const f of mesh.faces) {
    for (let i = 1; i < f.length - 1; i++) {
      const a = mesh.vertices[f[0]], b = mesh.vertices[f[i]], c = mesh.vertices[f[i + 1]];
      const n = normalize(cross(sub(b, a), sub(c, a)));
      L.push(`  facet normal ${n.x} ${n.y} ${n.z}`);
      L.push('    outer loop');
      L.push(`      vertex ${a.x} ${a.y} ${a.z}`);
      L.push(`      vertex ${b.x} ${b.y} ${b.z}`);
      L.push(`      vertex ${c.x} ${c.y} ${c.z}`);
      L.push('    endloop');
      L.push('  endfacet');
    }
  }
  L.push(`endsolid ${name}`);
  return L.join('\n') + '\n';
}
