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
} from '../../lib/core.js';

let stel = null;
let meta = null;
/*
 * plane index -> symmetry class of the original face, under each of the two
 * groups. They answer different questions and both are worth colouring by:
 * the polyhedron's group says which faces are the same KIND of face of the
 * solid you started from, and the stellation group says which of those the
 * symmetry you are building under can still carry onto one another. Under
 * the full group an icosahedron has one class; drop to a subgroup and its
 * twenty faces fall into several.
 */
let faceClass = null;
let faceClassStell = null;
/*
 * Plane -> coset, for the coset colouring; -1 is gray. The cosets are of a
 * chosen subgroup relative to the POLYHEDRON group ('cosets' message) — the
 * stellation group is the editing symmetry and deliberately has no hand in
 * the colouring, so regrouping never repaints. A mirror-free subgroup counts
 * its cosets among the polyhedron group's rotations: cosets of a chiral
 * subgroup inside an achiral group can never label the planes (every plane
 * stabiliser then holds mirrors the subgroup lacks), and dropping the
 * improper half is what the classical pictures do — the five tetrahedra are
 * cosets of T in I, drawn on a solid whose full symmetry is Ih.
 */
let cosets = null;
/*
 * And the same cosets per facet: facet -> class. Same subgroup, same
 * message; what differs is what wears the colour, a whole plane or a single
 * piece of surface.
 */
let cosetsL = null;
let cosetGroup = null;

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

/**
 * The mesh for a selection, plus per face: the stellation layer (for colour) and
 * the sub-cells on either side of it. Those two references are what turns a
 * click on the solid into "grow here" or "carve this away".
 */
function meshFor(selected) {
  const picked = selectedCells(stel, selected);
  const mesh = extractMesh([{ cells: picked }], stel.pool);
  /*
   * The neighbours across a face are reported as ATOMS — the primitive cell
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
  return {
    vertices: mesh.vertices,
    faces: mesh.faces,
    faceLayers: mesh.facetRefs.map(f => f.layer),
    /*
     * The other colouring: which class of original face this facet lies in, and
     * whether it is an outward cap or an underside. Sent alongside the layer
     * rather than instead of it, so switching the menu is a re-upload of the
     * colour attribute and never another round trip to this worker.
     */
    faceClasses: mesh.facetRefs.map(f => (faceClass ? faceClass[f.plane] : 0)),
    faceClassesStell: mesh.facetRefs.map(f => (faceClassStell ? faceClassStell[f.plane] : 0)),
    faceTop: mesh.facetTop,
    // which face plane each facet lies in — what separates a crease between two
    // planes (a face edge) from a join within one plane (a facet edge)
    facePlanes: mesh.facetRefs.map(f => f.plane),
    // "inside" is the solid cell this face belongs to, "outside" the empty
    // neighbour across it — which is what a click means, and what the two
    // gestures act on. The top/bottom orientation mirrors cellsAcrossFace;
    // reading cellBelow / cellAbove the same way round everywhere instead made
    // shift and ctrl both silent no-ops on every downward-facing face.
    // which coset the face's PLANE belongs to — the classical colourings are
    // plane-partitions (five tetrahedra = five sets of four planes), and a
    // spike is one colour because its whole surface lies in one set's planes
    faceCosets: mesh.facetRefs.map(f => (cosets ? cosets.planes[f.plane] : -1)),
    // and by coset of the facet itself — the smallest piece, and the only one
    // that can tell two hands apart when both lie in the same plane
    faceCosetsL: mesh.facetRefs.map(f => (cosetsL ? (cosetsL.of.get(f) ?? -1) : -1)),
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
       * the one it caps (below the plane, toward the centre) and the one that
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
        // the diagram is one plane, so its regions share that plane's coset
        coset: cosets ? cosets.planes[d.planeIndex] : -1,
        // by facet, each region wears its own facet's coset
        cosetL: cosetsL ? (cosetsL.of.get(f.facet) ?? -1) : -1,
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
        const { geometry, customPlanes, matrices, subMatrices, maxIntersection, maxLayer } = payload;
        const t0 = performance.now();
        // an explicit plane list replaces the polyhedron entirely
        stel = buildStellation(customPlanes ? null : toPoly(geometry), matrices, {
          planes: customPlanes || null,
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
         * split the twenty faces into several colours the moment you picked a
         * subgroup, which is not what the colouring is claiming to show.
         */
        faceClass = stel.planes.length ? planeClasses(stel, matrices).group : null;
        faceClassStell = stel.planes.length
          ? planeClasses(stel, subMatrices || matrices).group : null;
        cosetGroup = matrices;
        // the default colouring is the polyhedron group over itself — one
        // colour, and one class per orbit — until the app names a subgroup
        cosets = stel.planes.length
          ? cosetClasses(stel, cosetGroup, cosetGroup) : null;
        cosetsL = stel.planes.length
          ? facetCosetClasses(stel, cosetGroup, cosetGroup) : null;
        if (!stel.planes.length) {
          const c = stel.planes.central || 0;
          throw new Error('no usable planes' +
            (c ? ` — all ${c} pass through the centre, which this representation cannot hold` : ''));
        }
        reply({
          planes: stel.planes.length,
          /*
           * What was left out of the arrangement.
           *
           * A solid whose planes pass through the centre quietly loses them
           * here, and what you then stellate is not the solid you picked. The
           * counts go up to the UI so it can say "N of M planes" instead of
           * showing a wrong answer with a confident face.
           */
          planesTotal: stel.planes.total ?? stel.planes.length,
          planesCentral: stel.planes.central ?? 0,
          planesDegenerate: stel.planes.degenerate ?? 0,
          planesDuplicate: stel.planes.duplicate ?? 0,
          // the inequivalent faces to offer as diagram planes
          faces: diagramFaces(stel, subMatrices || matrices),
          // the buildable arrangement's radius — what the camera should frame
          frameRadius: stel.frameRadius,
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
        reply(meshFor(new Set(payload.selected)));
        break;

      case 'diagram':
        reply(diagramFor(payload.planeIndex, new Set(payload.selected)));
        break;

      case 'both':
        reply({
          mesh: meshFor(new Set(payload.selected)),
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
        // the coset colouring is untouched: the stellation group is the
        // editing symmetry, and editing must not repaint the figure
        reply({
          outline: outline(),
          faces: diagramFaces(stel, payload.subMatrices || payload.matrices || null),
        });
        break;
      }

      /*
       * Recompute the coset colouring against a subgroup of the caller's own
       * choosing — the colouring's subgroup is picked beside the colour menu
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
     * the honest index of 2 to 1 and painted the whole figure one colour.
     * The five tetrahedra are a chiral figure; they want the polyhedron
     * symmetry set to I, and saying so is better than guessing.
     */
        cosets = (stel.planes.length && cosetGroup && payload.subMatrices)
          ? cosetClasses(stel, cosetGroup, payload.subMatrices, prefer) : null;
        cosetsL = (stel.planes.length && cosetGroup && payload.subMatrices)
          ? facetCosetClasses(stel, cosetGroup, payload.subMatrices) : null;
        reply({ count: cosets ? cosets.count : 0,
                countL: cosetsL ? cosetsL.count : 0 });
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
