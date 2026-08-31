/*
 * Builds stellations off the main thread.
 *
 * The plane arrangement is the expensive step — for the densest duals it clips
 * millions of polygons — so it runs here and reports progress, leaving the page
 * responsive. The worker keeps the last result so selection changes (which are
 * cheap) can be answered without rebuilding.
 */

import {
  buildStellation, extractMesh, createDiagram, diagramFaces, planeClasses,
  atomKey, atomKeyOf, selectedCells, parseCellsAny, formatCellsAtoms,
  formatCellsUnder, regroupSubCells, cosetClasses, facetCosetClasses,
  subgroupOrbits, mergeAdjacentFacetClasses, paintOrbit,
} from '../../lib/core.js';
import { BUILD } from './build.js';

/*
 * Announce the build, unasked, as the first thing.
 *
 * app.js fetches this worker under a URL carrying the build stamp, so this
 * file itself is always the current one. What it imports is not: those URLs
 * carry no stamp, so a stale core.js can be linked into a fresh worker, and
 * that is invisible - the app's build line is the app's. build.js changes
 * every build and sits in the same cache alongside them, so if the stamp that
 * arrives here is not the one the app sent, something on this side came out of
 * an old cache and the answers cannot be trusted. Saying so beats debugging
 * geometry that is already fixed.
 */
self.postMessage({ hello: BUILD });

let stel = null;
let meta = null;
/*
 * plane index -> symmetry class of the original face, under each of the two
 * groups. They answer different questions and both are worth coloring by:
 * the polyhedron's group says which faces are the same KIND of face of the
 * solid you started from, and the stellation group says which of those the
 * symmetry you are building under can still carry onto one another. Under
 * the full group an icosahedron has one class; drop to a subgroup and its
 * twenty faces fall into several.
 */
let faceClass = null;
let faceClassStell = null;
/*
 * Plane -> coset, for the coset coloring; -1 is gray. The cosets are of a
 * chosen subgroup relative to the POLYHEDRON group ('cosets' message) — the
 * stellation group is the editing symmetry and deliberately has no hand in
 * the coloring, so regrouping never repaints. A mirror-free subgroup counts
 * its cosets among the polyhedron group's rotations: cosets of a chiral
 * subgroup inside an achiral group can never label the planes (every plane
 * stabiliser then holds mirrors the subgroup lacks), and dropping the
 * improper half is what the classical pictures do — the five tetrahedra are
 * cosets of T in I, drawn on a solid whose full symmetry is Ih.
 */
let cosets = null;
/*
 * Which subgroup, by the app's own name for it, produced `cosets`. The
 * continuity tie-break hands the previous labeling back to cosetClasses so a
 * tied choice keeps what is on screen — but a labeling is only comparable to
 * one made under the SAME subgroup, so the name is the guard. Null after a
 * build: the default G-over-G labeling is nobody's precedent.
 */
let cosetsSubName = null;
/*
 * And the same cosets per facet: facet -> class. Same subgroup, same
 * message; what differs is what wears the color, a whole plane or a single
 * piece of surface.
 */
let cosetsL = null;
/*
 * And the subgroup's plain ORBITS on planes, facets and cells — the "what
 * does H preserve" coloring. Anchor-free, never gray, defined for every
 * subgroup; same H as the cosets, refreshed by the same message.
 */
let orbits = null;
let cosetGroup = null;
/*
 * Facet orbits under the FULL polyhedron group — the merge's frame. A merged
 * class is a G-orbit split by what it wears, not an H-orbit: for a
 * non-normal subgroup the two differ (a T-orbit of facets spans four of the
 * five tetrahedra), and the H-orbit version quietly relabeled compounds.
 * Computed once per build; the coloring subgroup cannot move it.
 */
let gOrbits = null;
/*
 * The merged labeling of the LAST mesh, kept so the diagram — fetched
 * separately, sometimes long after — paints the same picture the solid
 * wears. Facet-keyed; anything not on that mesh's surface answers raw.
 */
let mergedNow = null;
/*
 * Hand-painted coset labels, region by region: 'plane.index' -> coset, a
 * blend array, or -1 for gray. An overlay over the computed labeling,
 * applied at the one place every reader reads (cosetOfFacet), so the mesh,
 * the diagram, both exports, the diagram list's signatures and the merge
 * all see the painted figure without knowing painting exists. The app owns
 * the map and re-sends it on every refresh, which also heals the clean
 * slate a rebuild leaves here.
 */
let paint = new Map();
let facetIdx = null;               // facet -> its index within its plane, lazily
/*
 * The group the diagram planes are classed by: the stellation symmetry, since
 * planes it carries onto each other draw the same picture. Kept because the
 * list has to be recomputed whenever the COLOURING changes, long after the
 * build that chose the group — see facesForMode.
 */
let groupForFaces = null;

/*
 * A face's coset value for the payloads: the crisp label where one exists,
 * the blend SET (a plain array of coset indices) where only a mix does, and
 * -1 for honest gray. The palette accepts either form, so the renderer, the
 * diagram and every exporter take blends without knowing about them.
 */
function cosetOfPlane(p) {
  if (!cosets) return -1;
  const k = cosets.planes[p];
  if (k >= 0) return k;
  const b = cosets.blends && cosets.blends[p];
  return b ? Array.from(b) : -1;
}
function cosetOfFacet(f) {
  const painted = paintedLabel(f);
  if (painted !== undefined) return painted;
  if (!cosetsL) return -1;
  const k = cosetsL.of.get(f);
  if (k != null && k >= 0) return k;
  const b = cosetsL.blends && cosetsL.blends.get(f);
  return b ? Array.from(b) : -1;
}
// the mirror-split mode's value for an UNSPLIT face: the crisp label or
// gray — split faces carry their piece labels instead (see meshFor)
function cosetOfFacetM(f) {
  const painted = paintedLabel(f);
  if (painted !== undefined) return painted;
  if (!cosetsL) return -1;
  const k = cosetsL.of.get(f);
  return k != null && k >= 0 ? k : -1;
}
/** a facet's position within its plane — the identity paint is keyed by */
function indexOfFacet(f) {
  if (!facetIdx) {
    facetIdx = new Map();
    stel.arrangement.forEach(fs => fs.forEach((x, i) => facetIdx.set(x, i)));
  }
  return facetIdx.get(f);
}
/** the hand-painted label for this facet, or undefined where nobody painted */
function paintedLabel(f) {
  if (!paint.size) return undefined;
  const v = paint.get(f.plane + '.' + indexOfFacet(f));
  return v === undefined ? undefined : Array.isArray(v) ? Array.from(v) : v;
}
/** the merged label for a facet of the last merged mesh, or null to fall back */
function mergedLabel(name, f) {
  const m = mergedNow && mergedNow.labels[name];
  const v = m ? m.get(f) : undefined;
  return v === undefined ? null : v;
}

function toPoly(g) {
  const vertices = [];
  for (let i = 0; i < g.v.length; i += 3) vertices.push({ x: g.v[i], y: g.v[i + 1], z: g.v[i + 2] });
  return { vertices, faces: g.f };
}

/**
 * Serialisable summary of the cell tree for the UI, including each sub-cell's
 * `bottom` links so the Cells panel can work out supporting sets on its own
 * rather than asking the worker on every shift-click.
 */
function outline() {
  const key = s => `${s.layer}.${s.cellIndex}.${s.index}`;
  return stel.cellLayers.map((layer, l) => ({
    layer: l,
    cells: layer.map((o, c) => ({
      index: c,
      primitives: o.cells.length,
      facets: o.nFacets,
      vertices: o.nVertices,
      volume: o.volume,
      subCells: o.subCells.map(s => ({
        index: s.index,
        primitives: s.cells.length,
        volume: s.volume,
        // which atoms of the orbit this sub-cell holds — the panel's tri-state
        // and the app's click expansion are both computed from these
        atoms: s.cells.map(c2 => c2.memberIndex),
        bottom: [...(s.bottom || [])].map(key),
        top: [...(s.top || [])].map(key),
      })),
    })),
  }));
}

/*
 * Which planes give a genuinely different DIAGRAM, coloring included.
 *
 * diagramFaces() answers this for the geometry: two planes the stellation
 * symmetry carries onto each other carry their cells with them, so they draw
 * the same picture and only one is worth offering. That was the whole answer
 * while color was a property of the shell or the face class, which every
 * symmetry of the figure preserves.
 *
 * A coloring by cosets or by subgroup orbits is not preserved by them. Its
 * subgroup is chosen independently of the editing symmetry, so two planes that
 * are the same shape with the same cells can wear different colors — the
 * compound of five tetrahedra is exactly this, five differently colored
 * copies of one picture — and the list offered one of the five, which is the
 * one the user could look at and the one the export wrote.
 *
 * So within each geometric class the planes are split again by what they
 * actually carry: the plane's own label where the coloring gives planes
 * labels, and the multiset of its facets' labels where it colors facets. A
 * signature rather than a symmetry argument, because it is the picture that
 * is being compared, and two planes with the same signature draw the same one.
 */
function facesForMode(mode) {
  const base = diagramFaces(stel, groupForFaces);
  const perPlane = { coset: () => cosets, orbitP: () => orbits };
  const perFacet = { cosetL: () => cosetsL, cosetM: () => cosetsL, orbitF: () => orbits };
  const perCell = mode === 'orbitC';
  if (!perPlane[mode] && !perFacet[mode] && !perCell) return base;

  const label = signatureFor(mode);
  if (!label) return base;

  const { group } = planeClasses(stel, groupForFaces);
  const seen = new Map();                 // "class|signature" -> entry
  const out = [];
  for (let i = 0; i < stel.planes.length; i++) {
    if (group[i] < 0) continue;
    const key = group[i] + '|' + label(i);
    const had = seen.get(key);
    if (had) { had.count++; continue; }
    // the geometry of the class representative, under this plane's index
    const proto = base[group[i]] || { sides: 0, central: false };
    const entry = { index: i, sides: proto.sides, central: !!proto.central, count: 1,
                    cls: group[i] };
    seen.set(key, entry);
    out.push(entry);
  }
  /*
   * Say which is which. Split by color, the parts are the same shape with the
   * same number of planes, so they name themselves identically — five entries
   * reading "triangle · 4 planes" look like a menu that has not changed, which
   * is how a fixed list of five diagrams can still be invisible. Numbering
   * them is the smallest thing that says there are five.
   */
  const parts = new Map();
  for (const e of out) parts.set(e.cls, (parts.get(e.cls) || 0) + 1);
  const nth = new Map();
  for (const e of out) {
    const n = parts.get(e.cls);
    if (n > 1) {
      const k = (nth.get(e.cls) || 0) + 1;
      nth.set(e.cls, k);
      e.part = k; e.parts = n;
    }
    delete e.cls;
  }
  return out.length ? out : base;
}

/** what a plane carries, as a string, under the coloring now in force */
function signatureFor(mode) {
  const facetsOf = (i) => stel.arrangement[i] || [];
  if (mode === 'coset') {
    if (!cosets) return null;
    return (i) => String(cosets.planes[i]) +
      (cosets.blends?.[i] ? '+' + Array.from(cosets.blends[i]).join('.') : '');
  }
  if (mode === 'orbitP') {
    if (!orbits) return null;
    return (i) => String(orbits.planes[i]);
  }
  if (mode === 'cosetL' || mode === 'cosetM') {
    if (!cosetsL) return null;
    // through cosetOfFacet, paint included: two planes the symmetry treats
    // as one drawing stop sharing a diagram the moment a paint parts them
    return (i) => facetsOf(i).map(f => {
      const v = cosetOfFacet(f);
      return (Array.isArray(v) || ArrayBuffer.isView(v))
        ? 'b' + Array.from(v).join('.') : String(v ?? -1);
    }).sort().join(',');
  }
  if (mode === 'orbitF') {
    if (!orbits) return null;
    return (i) => facetsOf(i).map(f => String(orbits.facets.get(f) ?? -1)).sort().join(',');
  }
  if (mode === 'orbitC') {
    if (!orbits) return null;
    // the cells the plane separates, which is what an orbitC coloring paints
    return (i) => facetsOf(i).flatMap(f => [f.cellBelow, f.cellAbove]
      .filter(Boolean).map(c => String(orbits.cells.get(c) ?? -1))).sort().join(',');
  }
  return null;
}

/**
 * The mesh for a selection, plus per face: the stellation layer (for color) and
 * the sub-cells on either side of it. Those two references are what turns a
 * click on the solid into "grow here" or "carve this away".
 */
function meshFor(selected, split = false, merge = null) {
  const picked = selectedCells(stel, selected);
  const mesh = extractMesh([{ cells: picked }], stel.pool);
  /*
   * The neighbors across a face are reported as ATOMS — the primitive cell
   * itself, not its owning sub-cell. A click means "toggle the orbit of THIS
   * cell under the current editing symmetry", and the app does the orbit
   * expansion, so the reference must survive a regrouping unchanged.
   */
  const akey = c => c && atomKeyOf(c);
  const across = (i) => {
    const f = mesh.facetRefs[i];
    return mesh.facetTop[i] ? { inside: f.cellBelow, outside: f.cellAbove }
                            : { inside: f.cellAbove, outside: f.cellBelow };
  };
  const out = {
    vertices: mesh.vertices,
    faces: mesh.faces,
    faceLayers: mesh.facetRefs.map(f => f.layer),
    /*
     * The other coloring: which class of original face this facet lies in, and
     * whether it is an outward cap or an underside. Sent alongside the layer
     * rather than instead of it, so switching the menu is a re-upload of the
     * color attribute and never another round trip to this worker.
     */
    faceClasses: mesh.facetRefs.map(f => (faceClass ? faceClass[f.plane] : 0)),
    faceClassesStell: mesh.facetRefs.map(f => (faceClassStell ? faceClassStell[f.plane] : 0)),
    faceTop: mesh.facetTop,
    // which face plane each facet lies in — what separates a crease between two
    // planes (a face edge) from a join within one plane (a facet edge)
    facePlanes: mesh.facetRefs.map(f => f.plane),
    // each facet's name in the paint overlay — how a click ON THE SOLID names
    // the region it paints, the same key the diagram's clicks arrive under
    faceKeys: mesh.facetRefs.map(f => f.plane + '.' + indexOfFacet(f)),
    // "inside" is the solid cell this face belongs to, "outside" the empty
    // neighbor across it — which is what a click means, and what the two
    // gestures act on. The top/bottom orientation mirrors cellsAcrossFace;
    // reading cellBelow / cellAbove the same way round everywhere instead made
    // shift and ctrl both silent no-ops on every downward-facing face.
    // which coset the face's PLANE belongs to — the classical colorings are
    // plane-partitions (five tetrahedra = five sets of four planes), and a
    // spike is one color because its whole surface lies in one set's planes
    faceCosets: mesh.facetRefs.map(f => cosetOfPlane(f.plane)),
    // and by coset of the facet itself — the smallest piece, and the only one
    // that can tell two hands apart when both lie in the same plane
    faceCosetsL: mesh.facetRefs.map(f => cosetOfFacet(f)),
    faceCosetsM: mesh.facetRefs.map(f => cosetOfFacetM(f)),
    // the same subgroup's plain orbits, at each of the three piece sizes;
    // the cell is the SOLID side of the face, the piece a model painter holds
    faceOrbitP: mesh.facetRefs.map(f => (orbits ? orbits.planes[f.plane] : 0)),
    faceOrbitF: mesh.facetRefs.map(f => (orbits ? (orbits.facets.get(f) ?? 0) : 0)),
    faceOrbitC: mesh.facetRefs.map((f, i) => {
      if (!orbits) return 0;
      const own = mesh.facetTop[i] ? f.cellBelow : f.cellAbove;
      return own ? (orbits.cells.get(own) ?? 0) : 0;
    }),
    faceInside: mesh.faces.map((_, i) => akey(across(i).inside) || null),
    faceOutside: mesh.faces.map((_, i) => akey(across(i).outside) || null),
    stats: {
      vertices: mesh.vertices.length,
      faces: mesh.faces.length,
      // boxes of the current grouping with anything in them — same number the
      // statusbar has always shown when the selection is whole orbits
      cells: new Set(picked.map(c => c.owner)).size,
      pieces: picked.length,
      volume: picked.reduce((s, x) => s + x.volume, 0),
    },
  };
  /*
   * The merged coloring, computed against THIS mesh: classes whose facets
   * touch inside one face melt into solid regions, and both facet-level
   * readings ship merged labels in place of raw ones. The app asks whenever
   * its "merge neighbors" box is on, whatever reading is displayed —
   * switching readings deliberately does not refetch, so the arrays must
   * already be merged when a switch lands on one of them. The split mesh
   * never merges: its pieces are below facet grain and keep their labels.
   */
  mergedNow = null;
  if (merge && merge.on && !split && gOrbits && orbits) {
    /*
     * A failure here must not fail the whole fetch, and must not be silent
     * either: the one time this threw in the wild — a browser cache pairing
     * this worker with another build's core.js — the rejection vanished into
     * the merge checkbox's handler and the toggle simply seemed dead. Raw
     * labels ship instead, with the reason for the app to say out loud.
     */
    try {
      mergedNow = mergeAdjacentFacetClasses(stel, mesh, gOrbits.facets, cosetGroup, {
        cosetL: (f) => cosetOfFacet(f),
        orbitF: (f) => (orbits.facets.get(f) ?? 0),
      }, merge.colors ?? null);
      out.faceCosetsL = mesh.facetRefs.map(f => mergedNow.labels.cosetL.get(f));
      out.faceOrbitF = mesh.facetRefs.map(f => mergedNow.labels.orbitF.get(f));
      out.merge = mergedNow.stats;
    } catch (err) {
      mergedNow = null;
      out.mergeError = String(err && err.message || err);
    }
  }
  /*
   * Mirror-split meshes replace each straddling facet's face by its cut
   * pieces, every per-face array following along and faceCosetsM carrying
   * the piece labels. Piece vertices are interned against the mesh's own,
   * so the seams share vertices and the edge pass still pairs edges up.
   * Requested only when the view is in the mirror-split mode — the mesh
   * topology differs, so the app refetches on the way in and out.
   */
  if (split && cosetsL && cosetsL.splits && cosetsL.splits.size) {
    const vkey = (p) => (Math.round(p.x * 1e6) / 1e6) + ',' +
      (Math.round(p.y * 1e6) / 1e6) + ',' + (Math.round(p.z * 1e6) / 1e6);
    const vertices = out.vertices.slice();
    const vidx = new Map();
    vertices.forEach((v, i) => { const k = vkey(v); if (!vidx.has(k)) vidx.set(k, i); });
    const intern = (p) => {
      const k = vkey(p);
      let i = vidx.get(k);
      if (i == null) { i = vertices.length; vertices.push({ x: p.x, y: p.y, z: p.z }); vidx.set(k, i); }
      return i;
    };
    const arrays = ['faceLayers', 'faceClasses', 'faceClassesStell', 'faceTop', 'facePlanes',
      'faceKeys', 'faceCosets', 'faceCosetsL', 'faceCosetsM', 'faceOrbitP', 'faceOrbitF',
      'faceOrbitC', 'faceInside', 'faceOutside'];
    const dst = {};
    for (const a of arrays) dst[a] = [];
    const faces = [];
    mesh.facetRefs.forEach((ref, i) => {
      const pieces = cosetsL.splits.get(ref);
      if (!pieces) {
        faces.push(out.faces[i]);
        for (const a of arrays) dst[a].push(out[a][i]);
        return;
      }
      for (const p of pieces) {
        const ids = p.poly.map(intern);
        // undersides are wound the other way in the mesh; follow them
        faces.push(out.faceTop[i] === false ? ids.slice().reverse() : ids);
        for (const a of arrays) dst[a].push(a === 'faceCosetsM' ? p.label : out[a][i]);
      }
    });
    out.vertices = vertices;
    out.faces = faces;
    for (const a of arrays) out[a] = dst[a];
    out.stats.faces = faces.length;
  }
  return out;
}

function diagramFor(planeIndex, selected) {
  const picked = selectedCells(stel, selected);
  const d = createDiagram(stel, planeIndex, [{ cells: picked }], 0);
  if (!d) return null;
  return {
    planeIndex: d.planeIndex,
    /*
     * Which class of original face this diagram is drawn on. A diagram is one
     * plane, so a single number does for the whole picture — every facet in it
     * lies in the same face of the solid, by construction.
     */
    faceClass: faceClass ? faceClass[d.planeIndex] : 0,
    faceClassStell: faceClassStell ? faceClassStell[d.planeIndex] : 0,
    extent: d.extent,
    frame: d.frame,                // projection basis, for the element overlay
    facets: d.facets.map(f => {
      /*
       * Every region of the diagram sits between two three-dimensional cells:
       * the one it caps (below the plane, toward the center) and the one that
       * rests on it (above). The two references let a click mean "toggle the
       * cell under this region" or "toggle the one on top of it" — which is how
       * the Java original works. Like the mesh, they refer to ATOMS, so a
       * regrouping cannot stale them; the app expands to the editing orbit.
       */
      const key = c => c ? [c.orbit.layer, c.orbit.index, c.memberIndex] : null;
      const below = f.facet.cellBelow || null, above = f.facet.cellAbove || null;
      return {
        poly: f.poly,
        layer: f.layer,
        selected: f.selected,
        // this region's position within its plane — how a paint names it
        fi: indexOfFacet(f.facet),
        // the diagram is one plane, so its regions share that plane's coset
        coset: cosetOfPlane(d.planeIndex),
        // by facet, each region wears its own facet's coset — through the
        // merged labeling when one is in force, like the mesh it mirrors
        cosetL: mergedLabel('cosetL', f.facet) ?? cosetOfFacet(f.facet),
        // subgroup orbits at the three sizes. Per cell the region wears the
        // SOLID side's cell, matching the 3-D mesh: an outward region caps
        // the cell below it, an inward one (facing 0, lining a cavity) is
        // the underside of the cell above — coloring those by the empty
        // cell below made the diagram disagree with the solid on every
        // exposed underside. Unselected regions fall to the cell they would
        // toggle, the one below.
        // the mirror-split labeling: the crisp label for whole regions, and
        // the cut pieces (projected into the diagram's own frame) where the
        // facet splits — carried on every payload so the export dialog's
        // cached scans can draw the split mode without refetching
        cosetM: cosetOfFacetM(f.facet),
        pieces: (() => {
          const ps = cosetsL && cosetsL.splits && cosetsL.splits.get(f.facet);
          if (!ps) return null;
          const R = d.frame.R, C = d.frame.center;
          const prj = (p) => {
            const x = p.x - C[0], y = p.y - C[1], z = p.z - C[2];
            return [R[0] * x + R[1] * y + R[2] * z, R[3] * x + R[4] * y + R[5] * z];
          };
          return ps.map(p => ({ poly: p.poly.map(prj), label: p.label }));
        })(),
        orbitP: orbits ? orbits.planes[d.planeIndex] : 0,
        orbitF: mergedLabel('orbitF', f.facet)
          ?? (orbits ? (orbits.facets.get(f.facet) ?? 0) : 0),
        orbitC: (() => {
          if (!orbits) return 0;
          const own = (f.facing === 0 ? f.facet.cellAbove : f.facet.cellBelow)
                    || f.facet.cellBelow || f.facet.cellAbove;
          return own ? (orbits.cells.get(own) ?? 0) : 0;
        })(),
        facing: f.facing,          // 1 outward, 0 inward (lines a cavity)
        ref: key(below || above),
        refBelow: key(below),
        refAbove: key(above),
      };
    }),
  };
}

self.onmessage = (e) => {
  const { id, type, payload } = e.data;
  const reply = (data, transfer) => self.postMessage({ id, ok: true, data }, transfer || []);
  const fail = (err) => self.postMessage({ id, ok: false, error: String(err && err.message || err) });

  try {
    switch (type) {

      case 'build': {
        const { geometry, customPlanes, matrices, subMatrices, maxIntersection,
                maxLayer, centralPlanes } = payload;
        const t0 = performance.now();
        // an explicit plane list replaces the polyhedron entirely
        stel = buildStellation(customPlanes ? null : toPoly(geometry), matrices, {
          planes: customPlanes || null,
          central: !!centralPlanes,
          subMatrices, maxIntersection, maxLayer,
          onProgress: (done, total) =>
            self.postMessage({ id, progress: { done, total } }),
        });
        meta = { ms: performance.now() - t0 };
        /*
         * Face classes come from the POLYHEDRON's group, not the stellation
         * group chosen below it. "The same kind of face" is a property of the
         * solid you started from — an icosahedron has one kind however you
         * choose to stellate it — and using the stellation group instead would
         * split the twenty faces into several colors the moment you picked a
         * subgroup, which is not what the coloring is claiming to show.
         */
        faceClass = stel.planes.length ? planeClasses(stel, matrices).group : null;
        faceClassStell = stel.planes.length
          ? planeClasses(stel, subMatrices || matrices).group : null;
        groupForFaces = subMatrices || matrices;
        cosetGroup = matrices;
        // the default coloring is the polyhedron group over itself — one
        // color, and one class per orbit — until the app names a subgroup
        cosetsSubName = null;
        cosets = stel.planes.length
          ? cosetClasses(stel, cosetGroup, cosetGroup) : null;
        cosetsL = stel.planes.length
          ? facetCosetClasses(stel, cosetGroup, cosetGroup, null, { split: true }) : null;
        orbits = stel.planes.length ? subgroupOrbits(stel, cosetGroup) : null;
        // at build the subgroup IS the polyhedron group, so the merge's frame
        // is this very sweep; 'cosets' will move orbits, never gOrbits
        gOrbits = orbits;
        mergedNow = null;
        // new facets, new identities: the app re-sends its paint on refresh
        paint = new Map();
        facetIdx = null;
        if (!stel.planes.length) {
          const c = stel.planes.central || 0;
          throw new Error('no usable planes' +
            (c ? ` — all ${c} pass through the center; turn on "planes through the center" to keep them` : ''));
        }
        // a sheet of nothing but central planes builds fine and bounds nothing
        if (!stel.cellLayers.length || !stel.cellLayers[0].length) {
          throw new Error('the planes bound no cells — planes through the center alone enclose nothing');
        }
        reply({
          planes: stel.planes.length,
          /*
           * What was left out of the arrangement.
           *
           * A solid whose planes pass through the center quietly loses them
           * here, and what you then stellate is not the solid you picked. The
           * counts go up to the UI so it can say "N of M planes" instead of
           * showing a wrong answer with a confident face.
           */
          planesTotal: stel.planes.total ?? stel.planes.length,
          planesCentral: stel.planes.central ?? 0,
          planesCentralKept: stel.planes.centralKept ?? 0,
          planesDegenerate: stel.planes.degenerate ?? 0,
          planesDuplicate: stel.planes.duplicate ?? 0,
          // the inequivalent faces to offer as diagram planes
          faces: facesForMode(null),
          // the buildable arrangement's radius — what the camera should frame
          frameRadius: stel.frameRadius,
          // the core's radius, the yardstick when nothing is selected
          coreRadius: stel.coreRadius,
          layers: stel.cellLayers.length,
          vertices: stel.pool.size,
          facets: stel.arrangement.reduce((s, a) => s + a.length, 0),
          maxRadius: stel.maxRadius,
          outline: outline(),
          ms: Math.round(meta.ms),
        });
        break;
      }

      case 'mesh':
        reply(meshFor(new Set(payload.selected), !!payload.split, payload.merge || null));
        break;

      case 'diagram':
        reply(diagramFor(payload.planeIndex, new Set(payload.selected)));
        break;

      case 'both':
        reply({
          mesh: meshFor(new Set(payload.selected), !!payload.split, payload.merge || null),
          diagram: diagramFor(payload.planeIndex, new Set(payload.selected)),
        });
        break;

      case 'parseCells': {
        const set = parseCellsAny(stel, payload.cells, payload.indexing || null);
        reply({ selected: [...set] });
        break;
      }

      case 'formatCells': {
        const { text, aligned } = formatCellsAtoms(stel, new Set(payload.selected));
        reply({ cells: text, aligned });
        break;
      }

      /** the selection under a grouping other than the current one — legacy
          notation via a transient split; null if not whole orbits under it */
      case 'formatUnder':
        reply({ cells: formatCellsUnder(stel, new Set(payload.selected), payload.subMatrices) });
        break;

      /*
       * A stellation-symmetry change without the rebuild: the arrangement and
       * the orbits stay, only the sub-cell grouping is redone — the Java
       * applet's createSubcells. The reply carries everything grouping-shaped
       * that the UI holds: the outline and the diagram-plane classes.
       */
      case 'regroup': {
        if (!stel) { fail('nothing built yet'); break; }
        regroupSubCells(stel, payload.subMatrices || null);
        // the stellation group decides this classification, so it moves too
        faceClassStell = stel.planes.length
          ? planeClasses(stel, payload.subMatrices || payload.matrices || null).group : null;
        groupForFaces = payload.subMatrices || payload.matrices || groupForFaces;
        // the coset coloring is untouched: the stellation group is the
        // editing symmetry, and editing must not repaint the figure
        reply({
          outline: outline(),
          faces: facesForMode(payload.mode || null),
        });
        break;
      }

      /*
       * Recompute the coset coloring against a subgroup of the caller's own
       * choosing — the coloring's subgroup is picked beside the color menu
       * and need not be the editing symmetry. Cheap: no rebuild, no regroup,
       * just the cell -> coset map; the next mesh/diagram fetch carries it.
       */
      case 'cosets': {
        if (!stel) { fail('nothing built yet'); break; }
        /*
         * The selection rides along to break ties the group cannot: the same
         * planes can carry a partition in two hands — the two compounds of
         * five tetrahedra share the icosahedron's twenty planes — and which
         * hand is wanted is a property of the figure on screen.
         */
        const prefer = payload.selected
          ? selectedCells(stel, new Set(payload.selected)) : null;
        /*
     * The group is the polyhedron group exactly as chosen. It used to drop
     * silently to that group's rotations whenever the subgroup had no
     * mirrors, so that T inside Ih would produce the five tetrahedra — but
     * that answers a question nobody asked, and for I inside Ih it collapsed
     * the honest index of 2 to 1 and painted the whole figure one color.
     * The five tetrahedra are a chiral figure; they want the polyhedron
     * symmetry set to I, and saying so is better than guessing.
     */
        /*
         * The precedent that decides ties, strongest first: a document's own
         * recorded labeling (it is the figure as saved), else the incumbent
         * from this session under the same subgroup. Either only ever
         * decides ties — a selection that strictly wants a labeling gets it.
         */
        const docPrev = (Array.isArray(payload.prevPlanes)
                         && payload.prevPlanes.length === stel.planes.length)
          ? payload.prevPlanes : null;
        const prev = docPrev
          || ((payload.subName && payload.subName === cosetsSubName && cosets)
              ? cosets.planes : null);
        cosets = (stel.planes.length && cosetGroup && payload.subMatrices)
          ? cosetClasses(stel, cosetGroup, payload.subMatrices, prefer, prev) : null;
        cosetsL = (stel.planes.length && cosetGroup && payload.subMatrices)
          ? facetCosetClasses(stel, cosetGroup, payload.subMatrices, prefer,
                              { split: true, prevPlanes: prev }) : null;
        cosetsSubName = payload.subName ?? null;
        orbits = (stel.planes.length && payload.subMatrices)
          ? subgroupOrbits(stel, payload.subMatrices) : null;
        mergedNow = null;                 // stale against the new labeling
        reply({ count: cosets ? cosets.count : 0,
                countL: cosetsL ? cosetsL.count : 0,
                // the labeling itself, for the app to save with the document
                planeLabels: cosets ? Array.from(cosets.planes) : null,
                orbitCounts: orbits
                  ? [orbits.planeCount, orbits.facetCount, orbits.cellCount] : null,
                /*
                 * The diagram list, refreshed: a coloring by cosets or orbits
                 * can make one geometric class of planes into several different
                 * pictures, and every one of them should be offerable.
                 */
                faces: facesForMode(payload.mode || null) });
        break;
      }

      /*
       * Re-aim the coset labeling at the selection now on screen.
       *
       * cosetClasses cannot tell the two compounds of five tetrahedra apart by
       * group alone — the group maps one onto the other — so it picks the
       * labeling that leaves the fewest SELECTED cells wearing more than one
       * color. That steer is only as current as the selection it was handed,
       * and the selection changes on every click. Sent once at build and once
       * per subgroup change, it went stale the moment the figure was edited:
       * turning 5.2 off and 5.1 on kept the labeling aimed at 5.2, and all
       * sixty cells of the other hand came out multicolored. Saving and
       * reopening cured it, which is the tell — the document was right and
       * only the screen was stale.
       *
       * Only what the active coloring reads is recomputed. subgroupOrbits
       * takes no selection at all, so orbit modes never come here; the plane
       * labeling is a few milliseconds; the facet labeling is up to half a
       * second on the dense duals and is done only for the modes that show
       * it. Switching mode goes through 'cosets' and recomputes the lot, so
       * nothing a mode can reach is left steered by an older figure.
       */
      case 'steer': {
        if (!stel) { fail('nothing built yet'); break; }
        const mode = payload.mode || null;
        if (!stel.planes.length || !cosetGroup || !payload.subMatrices
            || !(mode === 'coset' || mode === 'cosetL' || mode === 'cosetM')) {
          reply({ faces: null });
          break;
        }
        const prefer = payload.selected
          ? selectedCells(stel, new Set(payload.selected)) : null;
        // continuity: a tied re-steer keeps the labeling already on screen
        const prev = (payload.subName && payload.subName === cosetsSubName && cosets)
          ? cosets.planes : null;
        cosets = cosetClasses(stel, cosetGroup, payload.subMatrices, prefer, prev);
        if (mode !== 'coset') {
          cosetsL = facetCosetClasses(stel, cosetGroup, payload.subMatrices, prefer,
                                      { split: true, prevPlanes: prev });
        }
        cosetsSubName = payload.subName ?? null;
        mergedNow = null;                 // stale against the re-steered labels
        reply({ faces: facesForMode(mode),
                planeLabels: cosets ? Array.from(cosets.planes) : null });
        break;
      }

      /** the hand-painted labels, replacing the previous set wholesale */
      case 'paint': {
        paint = new Map(payload.entries || []);
        reply({ count: paint.size });
        break;
      }

      /*
       * One brush gesture, expanded over the whole orbit the way color
       * symmetry demands — see paintOrbit. The gesture itself is resolved
       * here, against what the clicked facet currently wears (paint
       * included), but the expansion runs on the COMPUTED labeling only:
       * the paint rides on the symmetry, it must not warp it.
       */
      case 'paintOrbit': {
        if (!stel) { fail('nothing built yet'); break; }
        const m = /^(\d+)\.(\d+)$/.exec(String(payload.key || ''));
        const f = m && stel.arrangement[+m[1]] && stel.arrangement[+m[1]][+m[2]];
        if (!f) { fail('no such region'); break; }
        const rawLabel = (x) => {
          if (!cosetsL) return -1;
          const k = cosetsL.of.get(x);
          if (k != null && k >= 0) return k;
          const b = cosetsL.blends && cosetsL.blends.get(x);
          return b ? Array.from(b) : -1;
        };
        let brush;
        if (payload.brush === 'auto' || payload.brush === 'gray') {
          brush = payload.brush;
        } else if (payload.shift) {
          const worn = paintedLabel(f) ?? rawLabel(f);
          const s = new Set(Array.isArray(worn) ? worn
            : (typeof worn === 'number' && worn >= 0 ? [worn] : []));
          if (s.has(payload.brush)) s.delete(payload.brush); else s.add(payload.brush);
          brush = s.size ? s : 'gray';
        } else {
          brush = new Set([payload.brush]);
        }
        reply(paintOrbit(stel, cosetGroup, rawLabel, f, brush));
        break;
      }

      /** every atom key in layers [0, n) — the "first n layers" shortcut */
      case 'layerKeys': {
        const keys = [];
        stel.cellLayers.slice(0, payload.n).forEach((layer, l) => {
          layer.forEach((o, c) => o.cells.forEach((_, m) => keys.push(atomKey(l, c, m))));
        });
        reply({ keys });
        break;
      }

      default:
        fail('unknown message: ' + type);
    }
  } catch (err) {
    fail(err);
  }
};
