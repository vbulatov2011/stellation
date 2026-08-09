/*
 * Builds stellations off the main thread.
 *
 * The plane arrangement is the expensive step — for the densest duals it clips
 * millions of polygons — so it runs here and reports progress, leaving the page
 * responsive. The worker keeps the last result so selection changes (which are
 * cheap) can be answered without rebuilding.
 */

import {
  buildStellation, extractMesh, parseCells, formatCells, selectedSubCells,
  createDiagram, selKey, subCellForFacet, cellsAcrossFacet, cellsAcrossFace,
  diagramFaces,
} from './core.js';

let stel = null;
let meta = null;

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
  const subs = selectedSubCells(stel, selected);
  const mesh = extractMesh(subs, stel.pool);
  const key = s => s && `${s.layer}.${s.cellIndex}.${s.index}`;
  return {
    vertices: mesh.vertices,
    faces: mesh.faces,
    faceLayers: mesh.facetRefs.map(f => f.layer),
    // "inside" is the solid cell this face belongs to, "outside" the empty
    // neighbour across it — which is what a click means, and what the two
    // gestures act on. cellsAcrossFace orients the pair; reading cellBelow /
    // cellAbove the same way round everywhere instead made shift and ctrl both
    // silent no-ops on every downward-facing face.
    faceInside: mesh.faces.map((_, i) => key(cellsAcrossFace(mesh, i).inside) || null),
    faceOutside: mesh.faces.map((_, i) => key(cellsAcrossFace(mesh, i).outside) || null),
    stats: {
      vertices: mesh.vertices.length,
      faces: mesh.faces.length,
      cells: subs.length,
      volume: subs.reduce((s, x) => s + x.volume, 0),
    },
  };
}

function diagramFor(planeIndex, selected) {
  const subs = selectedSubCells(stel, selected);
  const d = createDiagram(stel, planeIndex, subs, 0);
  if (!d) return null;
  return {
    planeIndex: d.planeIndex,
    extent: d.extent,
    frame: d.frame,                // projection basis, for the element overlay
    facets: d.facets.map(f => {
      const sc = subCellForFacet(f.facet);
      /*
       * Every region of the diagram sits between two three-dimensional cells:
       * the one it caps (below the plane, toward the centre) and the one that
       * rests on it (above). The two references let a click mean "toggle the
       * cell under this region" or "toggle the one on top of it" — which is how
       * the Java original works, and what the 6 August night session asked for.
       */
      const across = cellsAcrossFacet(f.facet);
      const key = s => s ? [s.layer, s.cellIndex, s.index] : null;
      return {
        poly: f.poly,
        layer: f.layer,
        selected: f.selected,
        facing: f.facing,          // 1 outward, 0 inward (lines a cavity)
        ref: sc ? key(sc) : null,
        refBelow: key(across.below),
        refAbove: key(across.above),
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
        const set = parseCells(stel, payload.cells);
        reply({ selected: [...set] });
        break;
      }

      case 'formatCells':
        reply({ cells: formatCells(stel, new Set(payload.selected)) });
        break;

      /** every sub-cell key in layers [0, n) — the "first n layers" shortcut */
      case 'layerKeys': {
        const keys = [];
        stel.cellLayers.slice(0, payload.n).forEach((layer, l) => {
          layer.forEach((o, c) => o.subCells.forEach(s => keys.push(selKey(l, c, s.index))));
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
