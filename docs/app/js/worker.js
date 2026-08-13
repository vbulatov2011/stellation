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
} from '../../lib/core.js';

let stel = null;
let meta = null;
let faceClass = null;   // plane index -> symmetry class of the original face

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
    faceTop: mesh.facetTop,
    // which face plane each facet lies in — what separates a crease between two
    // planes (a face edge) from a join within one plane (a facet edge)
    facePlanes: mesh.facetRefs.map(f => f.plane),
    // "inside" is the solid cell this face belongs to, "outside" the empty
    // neighbour across it — which is what a click means, and what the two
    // gestures act on. The top/bottom orientation mirrors cellsAcrossFace;
    // reading cellBelow / cellAbove the same way round everywhere instead made
    // shift and ctrl both silent no-ops on every downward-facing face.
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
        // "make planes": an explicit plane list replaces the polyhedron entirely
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
