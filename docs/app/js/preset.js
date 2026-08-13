/*
 * Saving and loading, in the SymmHub preset shape.
 *
 * SymmHub apps all write the same envelope — a document name, an `appInfo`
 * block naming the app and the file-format release, and a `params` object of
 * nested groups — so a stellation saved here sits alongside the attractor and
 * pattern presets without looking foreign:
 *
 *   {
 *     "name": "par-26-08-05-20-13-45-123",
 *     "appInfo": { "appName": "Stellation…_v1", "fileFormatRelease": 1 },
 *     "params": { "polyhedron": {…}, "symmetry": {…}, … }
 *   }
 *
 * The old `.stel` files still load: `parseStel` in core.js reads them, and
 * `readDocument` below takes either and hands back the same shape.
 */

import { parseStel } from '../../lib/modules.js';

export const APP_NAME = 'Stellation.PolyhedronCatalog.PlaneArrangement.CellSelection_v1';
/*
 * Release 1: the selection string's [brackets] hold sub-cell indices under
 * the document's stellation symmetry — every document ever written.
 * Release 2: cells.indexing === "cells" marks a selection that is NOT whole
 * orbits of its stellation symmetry; the brackets then hold primitive-cell
 * (member) indices. Written ONLY for such documents, so anything an old
 * build could read correctly still says release 1, and what it would
 * misread it refuses instead ("this file is format release 2…").
 */
export const FILE_FORMAT_RELEASE = 2;
const PARAM_PREFIX = 'par';

/** `-YY-MM-DD-HH-MM-SS-mmm`, the SymmHub date2s() format */
export function date2s(date = new Date(), sep = '-') {
  const p = (n, w) => String(n).padStart(w, '0');
  return sep + p(date.getFullYear() - 2000, 2) +
         sep + p(date.getMonth() + 1, 2) +
         sep + p(date.getDate(), 2) +
         sep + p(date.getHours(), 2) +
         sep + p(date.getMinutes(), 2) +
         sep + p(date.getSeconds(), 2) +
         sep + p(date.getMilliseconds(), 3);
}

export function newDocumentName(date = new Date()) {
  return PARAM_PREFIX + date2s(date);
}

/**
 * Everything needed to rebuild what is on screen. Only inputs go in `params` —
 * vertex counts and volumes are derived, so they would only ever go stale.
 */
export function writePreset({
  name, polyhedron, file, polySymmetry, stellSymmetry,
  planeDepth, cells, cellsIndexing = null, diagramFace,
  showEdges = true, showAllFacets = true, spin = false, colorMode = 'layer',
  faceOpacity = 1, edges = null,
  view = null, planesText = null,
  exportLengthUnit = 0.01,
}) {
  return JSON.stringify({
    name: name || newDocumentName(),
    // release 2 exists only for member-indexed selections — see the constant
    appInfo: { appName: APP_NAME,
               fileFormatRelease: cellsIndexing === 'cells' ? 2 : 1 },
    params: {
      polyhedron: { name: polyhedron, file },
      symmetry: { polyhedron: polySymmetry, stellation: stellSymmetry },
      arrangement: { planeDepth },
      cells: cellsIndexing === 'cells'
        ? { selection: cells, indexing: 'cells' }
        : { selection: cells },
      /*
       * `camera` is the orientation quaternion followed by the zoom distance.
       * Saved so that reopening a document, or sending someone a link, shows the
       * solid from the angle it was chosen at rather than from the default one.
       */
      /*
       * `edges` carries the two kinds separately. `showEdges` is still written
       * beside it, as the master "any edges at all", so a document saved now
       * still opens sensibly in a build that predates the split.
       */
      display: { diagramFace, showEdges, showAllFacets, spin, colorMode, faceOpacity, edges },
      camera: view ? { view } : undefined,
      // the make-planes sheet, verbatim: the source of a custom arrangement is
      // the text the user wrote, so that is what round-trips
      planes: planesText ? { text: planesText } : undefined,
      export: { lengthUnit: exportLengthUnit },
    },
  }, null, 4) + '\n';
}

/**
 * Read a saved document. Accepts our JSON, and the original program's `.stel`,
 * and is forgiving about which of the two you hand it — the caller should not
 * have to sniff the file itself.
 */
export function readDocument(text) {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{') && looksLikeJSON(trimmed)) {
    return readPreset(JSON.parse(text));
  }
  const spec = parseStel(text);
  return {
    source: 'stel',
    name: null,
    polyhedron: spec.polyhedron,
    file: null,
    polySymmetry: spec.polySymmetry,
    stellSymmetry: spec.stellSymmetry,
    cells: spec.cells,
    planeDepth: null,
    diagramFace: 0,
    exportLengthUnit: spec.exportLengthUnit ? Number(spec.exportLengthUnit) : 0.01,
  };
}

/*
 * A `.stel` file also starts with `{` once its comments are stripped — the cell
 * string itself is braced. So test for a real JSON object, not just the brace.
 */
function looksLikeJSON(s) {
  try {
    const o = JSON.parse(s);
    return o && typeof o === 'object' && !Array.isArray(o);
  } catch {
    return false;
  }
}

export function readPreset(doc) {
  const p = doc.params || {};
  const release = doc.appInfo?.fileFormatRelease ?? 0;
  if (release > FILE_FORMAT_RELEASE) {
    throw new Error(`this file is format release ${release}; this build reads up to ${FILE_FORMAT_RELEASE}`);
  }
  return {
    source: 'json',
    name: doc.name || null,
    polyhedron: p.polyhedron?.name ?? null,
    file: p.polyhedron?.file ?? null,
    polySymmetry: p.symmetry?.polyhedron ?? null,
    stellSymmetry: p.symmetry?.stellation ?? null,
    cells: p.cells?.selection ?? null,
    // "cells" = member-indexed brackets (an unaligned selection); anything
    // else is the classic sub-index notation under the stellation symmetry
    cellsIndexing: p.cells?.indexing === 'cells' ? 'cells' : null,
    planeDepth: p.arrangement?.planeDepth ?? null,
    diagramFace: p.display?.diagramFace ?? 0,
    showEdges: p.display?.showEdges ?? true,
    showAllFacets: p.display?.showAllFacets ?? true,
    spin: p.display?.spin ?? false,
    // documents written before face-class colouring existed have no setting;
    // they were all drawn by shell, so that is what they should reopen as
    colorMode: p.display?.colorMode === 'class' ? 'class' : 'layer',
    // written since translucency existed; anything older was drawn solid
    faceOpacity: clamp01(p.display?.faceOpacity, 1),
    /*
     * Documents written before the face/facet split have no `edges`, only the
     * one `showEdges` flag — and that flag drew every edge alike. So fall back
     * to both kinds following it, which reproduces what those documents looked
     * like rather than silently turning half their edges off.
     */
    edges: p.display?.edges ?? null,
    view: Array.isArray(p.camera?.view) ? p.camera.view : null,
    planesText: typeof p.planes?.text === 'string' ? p.planes.text : null,
    exportLengthUnit: p.export?.lengthUnit ?? 0.01,
  };
}

/** a 0..1 setting from a file, which may hold anything at all */
function clamp01(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}
